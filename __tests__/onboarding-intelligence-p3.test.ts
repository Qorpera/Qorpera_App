import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    onboardingAnalysis: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    onboardingAgentRun: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock("@/lib/internal-api", () => ({
  triggerNextIteration: vi.fn().mockResolvedValue(undefined),
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
// PROMPT REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

describe("Prompt Registry", () => {
  it("returns correct prompts for registered agents", async () => {
    const { getAgentPrompt } = await import(
      "@/lib/onboarding-intelligence/agents/prompt-registry"
    );

    const temporal = getAgentPrompt("temporal_analyst");
    expect(temporal).toBeDefined();
    expect(temporal).toContain("Temporal Analyst");

    const org = getAgentPrompt("org_analyst");
    expect(org).toBeDefined();
    expect(org).toContain("Organizational Analyst");

    const process = getAgentPrompt("process_analyst");
    expect(process).toBeDefined();
    expect(process).toContain("Process Analyst");

    const relationship = getAgentPrompt("relationship_analyst");
    expect(relationship).toBeDefined();
    expect(relationship).toContain("Relationship Analyst");
  });

  it("returns undefined for unregistered agents", async () => {
    const { getAgentPrompt } = await import(
      "@/lib/onboarding-intelligence/agents/prompt-registry"
    );

    expect(getAgentPrompt("unknown_agent")).toBeUndefined();
    expect(getAgentPrompt("nonexistent_agent_xyz")).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ORG ANALYST
// ═══════════════════════════════════════════════════════════════════════════════

describe("Org Analyst", () => {
  it("prompt contains key investigation phases", async () => {
    const { ORG_ANALYST_PROMPT } = await import(
      "@/lib/onboarding-intelligence/agents/org-analyst"
    );
    expect(ORG_ANALYST_PROMPT).toContain("Structural Discovery");
    expect(ORG_ANALYST_PROMPT).toContain("Hierarchy Mapping");
    expect(ORG_ANALYST_PROMPT).toContain("Reality vs. Documentation");
    expect(ORG_ANALYST_PROMPT).toContain("Role Classification");
    expect(ORG_ANALYST_PROMPT).toContain("departments");
    expect(ORG_ANALYST_PROMPT).toContain("teamComposition");
    expect(ORG_ANALYST_PROMPT).toContain("reportingRelationships");
    // Danish keywords
    expect(ORG_ANALYST_PROMPT).toContain("organisationsdiagram");
  });

  it("launchOrgAnalyst creates correct agent run and triggers iteration", async () => {
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "org-run" });

    const { launchOrgAnalyst } = await import(
      "@/lib/onboarding-intelligence/agents/org-analyst"
    );
    await launchOrgAnalyst("a1");

    const createCall = mockPrisma.onboardingAgentRun.create.mock.calls[0][0];
    expect(createCall.data.agentName).toBe("org_analyst");
    expect(createCall.data.round).toBe(1);
    expect(createCall.data.maxIterations).toBe(30);
    expect(createCall.data.status).toBe("running");

    expect(mockTrigger).toHaveBeenCalledWith("org-run");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROCESS ANALYST
// ═══════════════════════════════════════════════════════════════════════════════

describe("Process Analyst", () => {
  it("prompt contains key investigation phases", async () => {
    const { PROCESS_ANALYST_PROMPT } = await import(
      "@/lib/onboarding-intelligence/agents/process-analyst"
    );
    expect(PROCESS_ANALYST_PROMPT).toContain("Documented Processes");
    expect(PROCESS_ANALYST_PROMPT).toContain("Behavioral Process Mining");
    expect(PROCESS_ANALYST_PROMPT).toContain("Handoff Quality");
    expect(PROCESS_ANALYST_PROMPT).toContain("Situation Type Recommendations");
    expect(PROCESS_ANALYST_PROMPT).toContain("processes");
    expect(PROCESS_ANALYST_PROMPT).toContain("bottleneckPeople");
    // Danish keywords
    expect(PROCESS_ANALYST_PROMPT).toContain("procesbeskrivelse");
  });

  it("launchProcessAnalyst creates correct agent run and triggers iteration", async () => {
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "proc-run" });

    const { launchProcessAnalyst } = await import(
      "@/lib/onboarding-intelligence/agents/process-analyst"
    );
    await launchProcessAnalyst("a1");

    const createCall = mockPrisma.onboardingAgentRun.create.mock.calls[0][0];
    expect(createCall.data.agentName).toBe("process_analyst");
    expect(createCall.data.round).toBe(1);
    expect(createCall.data.maxIterations).toBe(30);

    expect(mockTrigger).toHaveBeenCalledWith("proc-run");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RELATIONSHIP ANALYST
// ═══════════════════════════════════════════════════════════════════════════════

describe("Relationship Analyst", () => {
  it("prompt contains key investigation phases", async () => {
    const { RELATIONSHIP_ANALYST_PROMPT } = await import(
      "@/lib/onboarding-intelligence/agents/relationship-analyst"
    );
    expect(RELATIONSHIP_ANALYST_PROMPT).toContain("Relationship Inventory");
    expect(RELATIONSHIP_ANALYST_PROMPT).toContain("Health Assessment");
    expect(RELATIONSHIP_ANALYST_PROMPT).toContain("Risk Identification");
    expect(RELATIONSHIP_ANALYST_PROMPT).toContain("Relationship Intelligence");
    expect(RELATIONSHIP_ANALYST_PROMPT).toContain("relationships");
    expect(RELATIONSHIP_ANALYST_PROMPT).toContain("riskFlags");
    expect(RELATIONSHIP_ANALYST_PROMPT).toContain("untrackedRelationships");
  });

  it("launchRelationshipAnalyst creates correct agent run and triggers iteration", async () => {
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "rel-run" });

    const { launchRelationshipAnalyst } = await import(
      "@/lib/onboarding-intelligence/agents/relationship-analyst"
    );
    await launchRelationshipAnalyst("a1");

    const createCall = mockPrisma.onboardingAgentRun.create.mock.calls[0][0];
    expect(createCall.data.agentName).toBe("relationship_analyst");
    expect(createCall.data.round).toBe(1);
    expect(createCall.data.maxIterations).toBe(30);

    expect(mockTrigger).toHaveBeenCalledWith("rel-run");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUND 0 PREAMBLE FORMATTING
// ═══════════════════════════════════════════════════════════════════════════════

describe("Round 0 Preamble", () => {
  it("formats people registry and temporal context correctly", async () => {
    // Test via the Round 0→1 handoff: when round 0 completes, preamble is built
    mockPrisma.onboardingAgentRun.findMany.mockImplementation((args: any) => {
      if (args.where.round === 0 && !args.where.status) {
        return [
          { status: "complete", agentName: "people_discovery" },
          { status: "complete", agentName: "temporal_analyst" },
        ];
      }
      if (args.where.round === 0 && args.where.status === "complete") {
        return [
          {
            agentName: "people_discovery",
            report: [
              {
                email: "alice@co.dk",
                displayName: "Alice Hansen",
                isInternal: true,
                sources: [{ system: "hubspot", role: "Sales Manager" }],
                activityMetrics: {},
              },
              {
                email: "bob@co.dk",
                displayName: "Bob Jensen",
                isInternal: true,
                sources: [{ system: "slack" }],
                activityMetrics: {},
              },
              {
                email: "client@ext.com",
                displayName: "External Client",
                isInternal: false,
                sources: [{ system: "hubspot" }],
                activityMetrics: {},
              },
            ],
          },
          {
            agentName: "temporal_analyst",
            report: {
              temporalMap: [
                { date: "2026-01", event: "Company reorg", evidence: "org-chart.pdf", significance: "major" },
                { date: "2026-02", event: "New hire", evidence: "email", significance: "minor" },
              ],
              recencyWarnings: ["Org chart from January may not reflect recent changes"],
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

    // Verify preamble was passed to Round 1 agents
    const createCalls = mockPrisma.onboardingAgentRun.create.mock.calls;
    expect(createCalls.length).toBe(5);

    const firstBrief = createCalls[0][0].data.followUpBrief;
    expect(firstBrief.round0Preamble).toBeDefined();

    const preamble = firstBrief.round0Preamble as string;
    // Should include internal people only
    expect(preamble).toContain("Alice Hansen");
    expect(preamble).toContain("Bob Jensen");
    expect(preamble).not.toContain("External Client"); // External excluded from preamble

    // Should include temporal context
    expect(preamble).toContain("Company reorg");
    expect(preamble).toContain("Org chart from January");

    // Should only include major events
    expect(preamble).not.toContain("New hire"); // minor event

    // Should include role info
    expect(preamble).toContain("Sales Manager");

    // Should include freshness guidance
    expect(preamble).toContain("freshness scores");
  });
});
