import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (BEFORE imports) ───────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    onboardingAnalysis: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    onboardingAgentRun: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    sourceConnector: {
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    contentChunk: { count: vi.fn() },
    entity: { findMany: vi.fn() },
    activitySignal: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    operator: { findUnique: vi.fn() },
    $queryRawUnsafe: vi.fn(),
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/ai-provider", () => ({
  callLLM: vi.fn(),
}));

vi.mock("@/lib/internal-api", () => ({
  triggerNextIteration: vi.fn().mockResolvedValue(undefined),
  validateInternalKey: vi.fn(),
  getBaseUrl: vi.fn().mockReturnValue("http://localhost:3000"),
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/config-encryption", () => ({
  encryptConfig: vi.fn().mockReturnValue("encrypted-config"),
}));

vi.mock("@/lib/connectors/capability-registration", () => ({
  registerConnectorCapabilities: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/connectors/registry", () => ({
  getProvider: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/connector-filters", () => ({
  ACTIVE_CONNECTOR: { deletedAt: null },
}));

vi.mock("@/lib/rag/retriever", () => ({
  retrieveRelevantChunks: vi.fn(),
  retrieveRelevantContext: vi.fn(),
}));

vi.mock("@/lib/rag/embedder", () => ({
  embedChunks: vi.fn(),
}));

vi.mock("@/lib/entity-resolution", () => ({
  searchEntities: vi.fn(),
  getEntityContext: vi.fn(),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db";
import { triggerNextIteration } from "@/lib/internal-api";

const mockPrisma = prisma as any;
const mockTrigger = triggerNextIteration as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$executeRaw.mockResolvedValue(1);
});

// ═══════════════════════════════════════════════════════════════════════════════
// PEOPLE DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════════

describe("People Discovery", () => {
  it("buildPeopleRegistry produces correct counts from entity + content + signal data", async () => {
    // Mock internal domains
    mockPrisma.user.findMany.mockResolvedValue([
      { email: "alice@company.dk" },
      { email: "bob@company.dk" },
    ]);
    mockPrisma.operator.findUnique.mockResolvedValue({ email: "admin@company.dk" });

    // Mock entity people (contacts with email identity)
    mockPrisma.entity.findMany.mockResolvedValue([
      {
        id: "e1",
        displayName: "Alice Hansen",
        sourceSystem: "hubspot",
        externalId: "hs-1",
        entityType: { slug: "contact" },
        propertyValues: [
          { value: "alice@company.dk", property: { slug: "email", identityRole: "email" } },
          { value: "Sales Manager", property: { slug: "title", identityRole: null } },
        ],
      },
      {
        id: "e2",
        displayName: "External Client",
        sourceSystem: "hubspot",
        externalId: "hs-2",
        entityType: { slug: "contact" },
        propertyValues: [
          { value: "client@external.com", property: { slug: "email", identityRole: "email" } },
        ],
      },
    ]);

    // Mock email content chunks
    mockPrisma.$queryRawUnsafe.mockImplementation((sql: string) => {
      if (sql.includes("sourceType") && sql.includes("email")) {
        return [
          { metadata: JSON.stringify({ sender: "bob@company.dk", to: ["alice@company.dk"] }) },
          { metadata: JSON.stringify({ sender: "client@external.com", to: ["bob@company.dk"] }) },
        ];
      }
      if (sql.includes("slack_message")) {
        return [{ sender: "alice@company.dk", cnt: BigInt(15) }];
      }
      return [];
    });

    // Mock activity signals
    mockPrisma.activitySignal.findMany.mockResolvedValue([
      {
        signalType: "meeting_held",
        metadata: JSON.stringify({ attendees: ["alice@company.dk", "bob@company.dk", "partner@other.com"] }),
      },
    ]);

    const { buildPeopleRegistry } = await import(
      "@/lib/onboarding-intelligence/agents/people-discovery"
    );

    const registry = await buildPeopleRegistry("op1");

    // Should find: alice@company.dk, bob@company.dk (internal), client@external.com, partner@other.com (external)
    expect(registry.length).toBeGreaterThanOrEqual(3);

    // Internal classification
    const alice = registry.find((p) => p.email === "alice@company.dk");
    expect(alice).toBeTruthy();
    expect(alice!.isInternal).toBe(true);
    expect(alice!.displayName).toBe("Alice Hansen");
    expect(alice!.entityId).toBe("e1");

    const client = registry.find((p) => p.email === "client@external.com");
    expect(client).toBeTruthy();
    expect(client!.isInternal).toBe(false);

    // Internal people should come first
    const firstExternal = registry.findIndex((p) => !p.isInternal);
    const lastInternal = registry.findLastIndex((p) => p.isInternal);
    if (firstExternal >= 0 && lastInternal >= 0) {
      expect(lastInternal).toBeLessThan(firstExternal);
    }
  });

  it("deduplicates: same person from 3 sources → 1 entry with multiple sources", async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ email: "alice@company.dk" }]);
    mockPrisma.operator.findUnique.mockResolvedValue({ email: "admin@company.dk" });

    // Alice appears in entity, email metadata, and Slack
    mockPrisma.entity.findMany.mockResolvedValue([
      {
        id: "e1",
        displayName: "Alice",
        sourceSystem: "hubspot",
        externalId: null,
        entityType: { slug: "contact" },
        propertyValues: [
          { value: "alice@company.dk", property: { slug: "email", identityRole: "email" } },
        ],
      },
    ]);

    mockPrisma.$queryRawUnsafe.mockImplementation((sql: string) => {
      if (sql.includes("email")) {
        return [{ metadata: JSON.stringify({ sender: "alice@company.dk" }) }];
      }
      if (sql.includes("slack_message")) {
        return [{ sender: "alice@company.dk", cnt: BigInt(5) }];
      }
      return [];
    });

    mockPrisma.activitySignal.findMany.mockResolvedValue([]);

    const { buildPeopleRegistry } = await import(
      "@/lib/onboarding-intelligence/agents/people-discovery"
    );

    const registry = await buildPeopleRegistry("op1");

    const aliceEntries = registry.filter((p) => p.email === "alice@company.dk");
    expect(aliceEntries).toHaveLength(1);

    // Should have multiple sources
    expect(aliceEntries[0].sources.length).toBeGreaterThanOrEqual(2);
  });

  it("runPeopleDiscovery creates agent run and calls checkRoundCompletion", async () => {
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "pd-run" });
    mockPrisma.onboardingAnalysis.findUnique.mockResolvedValue({ operatorId: "op1" });

    // Mock all data sources empty
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.operator.findUnique.mockResolvedValue({ email: null });
    mockPrisma.entity.findMany.mockResolvedValue([]);
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.activitySignal.findMany.mockResolvedValue([]);

    // Round completion: other agent still running
    mockPrisma.onboardingAgentRun.findMany.mockResolvedValue([
      { status: "complete" },
      { status: "running" },
    ]);
    mockPrisma.onboardingAgentRun.update.mockResolvedValue({});

    const { runPeopleDiscovery } = await import(
      "@/lib/onboarding-intelligence/agents/people-discovery"
    );
    await runPeopleDiscovery("a1");

    // Should create agent run
    expect(mockPrisma.onboardingAgentRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agentName: "people_discovery",
          round: 0,
          status: "running",
        }),
      }),
    );

    // Should mark complete
    const updateCall = mockPrisma.onboardingAgentRun.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("complete");
    expect(Array.isArray(updateCall.data.report)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPORAL ANALYST
// ═══════════════════════════════════════════════════════════════════════════════

describe("Temporal Analyst", () => {
  it("launchTemporalAnalyst creates agent run with correct config", async () => {
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "ta-run" });

    const { launchTemporalAnalyst } = await import(
      "@/lib/onboarding-intelligence/agents/temporal-analyst"
    );
    await launchTemporalAnalyst("a1");

    const createCall = mockPrisma.onboardingAgentRun.create.mock.calls[0][0];
    expect(createCall.data.agentName).toBe("temporal_analyst");
    expect(createCall.data.round).toBe(0);
    expect(createCall.data.maxIterations).toBe(20);
    expect(createCall.data.status).toBe("running");
  });

  it("triggers first iteration via triggerNextIteration", async () => {
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "ta-run" });

    const { launchTemporalAnalyst } = await import(
      "@/lib/onboarding-intelligence/agents/temporal-analyst"
    );
    await launchTemporalAnalyst("a1");

    expect(mockTrigger).toHaveBeenCalledWith("ta-run");
  });

  it("TEMPORAL_ANALYST_PROMPT contains key investigation instructions", async () => {
    const { TEMPORAL_ANALYST_PROMPT } = await import(
      "@/lib/onboarding-intelligence/agents/temporal-analyst"
    );
    expect(TEMPORAL_ANALYST_PROMPT).toContain("Temporal Analyst");
    expect(TEMPORAL_ANALYST_PROMPT).toContain("freshness");
    expect(TEMPORAL_ANALYST_PROMPT).toContain("supersed");
    expect(TEMPORAL_ANALYST_PROMPT).toContain("temporalMap");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE WORKSPACE OAUTH
// ═══════════════════════════════════════════════════════════════════════════════

describe("Google Workspace OAuth", () => {
  it("auth-url includes all required scopes", async () => {
    const { getSessionUser } = await import("@/lib/auth");
    (getSessionUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u1", role: "admin" },
      operatorId: "op1",
    });

    // Mock cookies
    vi.mock("next/headers", () => ({
      cookies: vi.fn().mockResolvedValue({
        set: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
      }),
    }));

    const originalClientId = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = "test-client-id";

    const { POST } = await import(
      "@/app/api/connectors/google-workspace/auth-url/route"
    );
    const response = await POST();
    const body = await response.json();

    expect(body.url).toBeDefined();
    expect(body.url).toContain("gmail.readonly");
    expect(body.url).toContain("drive");
    expect(body.url).toContain("calendar");
    expect(body.url).toContain("spreadsheets");
    expect(body.url).toContain("prompt=consent");
    expect(body.url).toContain("access_type=offline");

    process.env.GOOGLE_CLIENT_ID = originalClientId;
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUND 0 → ROUND 1 HANDOFF
// ═══════════════════════════════════════════════════════════════════════════════

describe("Round 0 → Round 1 Handoff", () => {
  it("when both Round 0 agents complete, Round 1 agents are launched with context", async () => {
    // All Round 0 agents complete
    mockPrisma.onboardingAgentRun.findMany.mockImplementation((args: any) => {
      if (args.where.round === 0 && !args.where.status) {
        return [
          { status: "complete", agentName: "people_discovery" },
          { status: "complete", agentName: "temporal_analyst" },
        ];
      }
      // Round 0 complete runs (for launchRound1Agents)
      if (args.where.round === 0 && args.where.status === "complete") {
        return [
          {
            agentName: "people_discovery",
            report: [
              { email: "alice@co.dk", displayName: "Alice", isInternal: true, sources: [], activityMetrics: {} },
            ],
          },
          {
            agentName: "temporal_analyst",
            report: {
              temporalMap: [{ date: "2026-01", event: "Reorg", evidence: "doc", significance: "major" }],
              recencyWarnings: ["Old org chart"],
              documentFreshness: [],
              supersessionChains: [],
              activeKnowledge: [],
              historicalContext: [],
            },
          },
        ];
      }
      return [];
    });

    mockPrisma.onboardingAnalysis.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.onboardingAnalysis.update.mockResolvedValue({});
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "r1-run" });

    const { checkRoundCompletion } = await import(
      "@/lib/onboarding-intelligence/orchestration"
    );
    await checkRoundCompletion("a1", 0);

    // Should create 5 Round 1 agents
    expect(mockPrisma.onboardingAgentRun.create).toHaveBeenCalledTimes(5);

    // Each should have followUpBrief with round0Preamble
    const firstCreate = mockPrisma.onboardingAgentRun.create.mock.calls[0][0];
    expect(firstCreate.data.followUpBrief).toBeDefined();
    expect(firstCreate.data.followUpBrief.round0Preamble).toContain("Alice");
    expect(firstCreate.data.followUpBrief.round0Preamble).toContain("Reorg");
  });

  it("if one Round 0 agent fails, Round 1 still launches with partial data", async () => {
    mockPrisma.onboardingAgentRun.findMany.mockImplementation((args: any) => {
      if (args.where.round === 0 && !args.where.status) {
        return [
          { status: "complete", agentName: "people_discovery" },
          { status: "failed", agentName: "temporal_analyst" },
        ];
      }
      if (args.where.round === 0 && args.where.status === "complete") {
        return [
          { agentName: "people_discovery", report: [] },
        ];
      }
      return [];
    });

    mockPrisma.onboardingAnalysis.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.onboardingAnalysis.update.mockResolvedValue({});
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "r1-run" });

    const { checkRoundCompletion } = await import(
      "@/lib/onboarding-intelligence/orchestration"
    );
    await checkRoundCompletion("a1", 0);

    // Should still launch 5 Round 1 agents
    expect(mockPrisma.onboardingAgentRun.create).toHaveBeenCalledTimes(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// START ANALYSIS ORCHESTRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("Start Analysis (P2 — with Round 0 agents)", () => {
  it("creates analysis and launches both Round 0 agents", async () => {
    mockPrisma.sourceConnector.count.mockResolvedValue(1);
    mockPrisma.contentChunk.count.mockResolvedValue(50);
    mockPrisma.onboardingAgentRun.deleteMany.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.deleteMany.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.create.mockResolvedValue({
      id: "new-analysis",
      status: "analyzing",
    });

    // People Discovery mocks
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "agent-run" });
    mockPrisma.onboardingAnalysis.findUnique.mockResolvedValue({ operatorId: "op1" });
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.operator.findUnique.mockResolvedValue({ email: null });
    mockPrisma.entity.findMany.mockResolvedValue([]);
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.activitySignal.findMany.mockResolvedValue([]);
    mockPrisma.onboardingAgentRun.update.mockResolvedValue({});

    // Round completion: not all done
    mockPrisma.onboardingAgentRun.findMany.mockResolvedValue([
      { status: "complete" },
      { status: "running" },
    ]);

    const { startAnalysis } = await import(
      "@/lib/onboarding-intelligence/orchestration"
    );
    const result = await startAnalysis("op1");

    expect(result.analysisId).toBe("new-analysis");
    expect(result.status).toBe("analyzing");

    // Should have created agent runs (people_discovery + temporal_analyst)
    expect(mockPrisma.onboardingAgentRun.create).toHaveBeenCalledTimes(2);

    const agentNames = mockPrisma.onboardingAgentRun.create.mock.calls.map(
      (c: any) => c[0].data.agentName,
    );
    expect(agentNames).toContain("people_discovery");
    expect(agentNames).toContain("temporal_analyst");
  });

  it("deletes existing agent runs before analysis on restart", async () => {
    mockPrisma.sourceConnector.count.mockResolvedValue(1);
    mockPrisma.contentChunk.count.mockResolvedValue(50);
    mockPrisma.onboardingAgentRun.deleteMany.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.deleteMany.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.create.mockResolvedValue({ id: "a2" });
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "run" });
    mockPrisma.onboardingAnalysis.findUnique.mockResolvedValue({ operatorId: "op1" });
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.operator.findUnique.mockResolvedValue({ email: null });
    mockPrisma.entity.findMany.mockResolvedValue([]);
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.activitySignal.findMany.mockResolvedValue([]);
    mockPrisma.onboardingAgentRun.update.mockResolvedValue({});
    mockPrisma.onboardingAgentRun.findMany.mockResolvedValue([
      { status: "complete" },
      { status: "running" },
    ]);

    const { startAnalysis } = await import(
      "@/lib/onboarding-intelligence/orchestration"
    );
    await startAnalysis("op1");

    // Should delete agent runs first, then analysis
    expect(mockPrisma.onboardingAgentRun.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.onboardingAnalysis.deleteMany).toHaveBeenCalled();
  });
});
