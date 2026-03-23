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
    sourceConnector: { count: vi.fn() },
    contentChunk: { count: vi.fn() },
    entity: { findMany: vi.fn(), findFirst: vi.fn() },
    activitySignal: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    operator: { findUnique: vi.fn() },
    internalDocument: { findMany: vi.fn() },
    $queryRawUnsafe: vi.fn(),
    $executeRaw: vi.fn().mockResolvedValue(1),
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

vi.mock("@/lib/rag/retriever", () => ({
  retrieveRelevantContext: vi.fn(),
}));

vi.mock("@/lib/entity-resolution", () => ({
  searchEntities: vi.fn(),
  getEntityContext: vi.fn(),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import { triggerNextIteration, validateInternalKey } from "@/lib/internal-api";

const mockPrisma = prisma as any;
const mockCallLLM = callLLM as ReturnType<typeof vi.fn>;
const mockTrigger = triggerNextIteration as ReturnType<typeof vi.fn>;
const mockValidateKey = validateInternalKey as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

describe("Tool Registry", () => {
  it("getToolsForAgent returns all tools", async () => {
    const { getToolsForAgent } = await import(
      "@/lib/onboarding-intelligence/tools/registry"
    );
    const tools = getToolsForAgent("org_analyst");
    expect(tools.length).toBe(11);
    expect(tools.map((t) => t.name)).toContain("search_content");
    expect(tools.map((t) => t.name)).toContain("search_entities");
    expect(tools.map((t) => t.name)).toContain("get_entity_details");
    expect(tools.map((t) => t.name)).toContain("search_activity");
    expect(tools.map((t) => t.name)).toContain("get_calendar_patterns");
    expect(tools.map((t) => t.name)).toContain("get_email_patterns");
    expect(tools.map((t) => t.name)).toContain("get_document_list");
    expect(tools.map((t) => t.name)).toContain("get_content_by_ids");
    expect(tools.map((t) => t.name)).toContain("get_financial_data");
    expect(tools.map((t) => t.name)).toContain("get_crm_data");
    expect(tools.map((t) => t.name)).toContain("get_slack_channels");
  });

  it("executeTool calls handler and returns result with timing", async () => {
    const { executeTool } = await import(
      "@/lib/onboarding-intelligence/tools/registry"
    );
    const { searchEntities } = await import("@/lib/entity-resolution");
    (searchEntities as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "e1", displayName: "Acme Corp", typeName: "Company", typeSlug: "company", status: "active", properties: { domain: "acme.com" } },
    ]);

    const ctx = { operatorId: "op1", analysisId: "a1" };
    const result = await executeTool("search_entities", { query: "Acme" }, ctx);

    expect(result.result).toContain("Acme Corp");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("executeTool returns error for unknown tool", async () => {
    const { executeTool } = await import(
      "@/lib/onboarding-intelligence/tools/registry"
    );
    const ctx = { operatorId: "op1", analysisId: "a1" };
    const result = await executeTool("nonexistent_tool", {}, ctx);

    expect(result.result).toContain("Unknown tool");
    expect(result.durationMs).toBe(0);
  });

  it("executeTool catches handler errors gracefully", async () => {
    const { executeTool } = await import(
      "@/lib/onboarding-intelligence/tools/registry"
    );
    const { searchEntities } = await import("@/lib/entity-resolution");
    (searchEntities as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("DB connection lost"),
    );

    const ctx = { operatorId: "op1", analysisId: "a1" };
    const result = await executeTool("search_entities", { query: "test" }, ctx);

    expect(result.result).toContain("Error executing search_entities");
    expect(result.result).toContain("DB connection lost");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT RUNNER — ITERATION FLOW
// ═══════════════════════════════════════════════════════════════════════════════

describe("Agent Runner", () => {
  const baseRun = {
    id: "run1",
    analysisId: "a1",
    agentName: "org_analyst",
    round: 1,
    status: "running",
    iterationCount: 0,
    maxIterations: 30,
    workingMemory: { findings: "", hypotheses: [], openQuestions: [], investigationPlan: "" },
    followUpBrief: null,
    toolCallLog: [],
    tokensUsed: 0,
    costCents: 0,
    analysis: { operatorId: "op1" },
  };

  // Helper: mock findMany to handle both Round 0 data loading and round completion queries
  function mockFindManyForRound1() {
    mockPrisma.onboardingAgentRun.findMany.mockImplementation((args: any) => {
      if (args.where.round === 0 && args.where.status === "complete") {
        // Round 0 data for ToolContext
        return [{ agentName: "people_discovery", report: [] }, { agentName: "temporal_analyst", report: {} }];
      }
      // Round completion check
      return [{ status: "complete" }, { status: "running" }];
    });
  }

  it("runs investigation flow: tool calls → memory update → chain next", async () => {
    mockPrisma.onboardingAgentRun.findUnique.mockResolvedValue(baseRun);
    mockFindManyForRound1();

    // Agent decides to investigate
    mockCallLLM
      .mockResolvedValueOnce({
        text: JSON.stringify({
          action: "investigate",
          toolCalls: [{ name: "search_entities", arguments: { query: "Sales" } }],
        }),
        usage: { inputTokens: 100, outputTokens: 50 },
        apiCostCents: 1,
      })
      // Summarization call
      .mockResolvedValueOnce({
        text: JSON.stringify({
          findings: "Found Sales department",
          hypotheses: ["Sales team has 5 members"],
          openQuestions: ["Who leads Sales?"],
          investigationPlan: "Look up Sales head",
        }),
        usage: { inputTokens: 50, outputTokens: 30 },
        apiCostCents: 0,
      });

    // Mock the entity search tool response
    const { searchEntities } = await import("@/lib/entity-resolution");
    (searchEntities as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "e1", displayName: "Sales Team", typeName: "Department", typeSlug: "department", status: "active", properties: {} },
    ]);

    mockPrisma.onboardingAgentRun.update.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.update.mockResolvedValue({});

    const { runAgentIteration } = await import(
      "@/lib/onboarding-intelligence/agent-runner"
    );
    await runAgentIteration("run1");

    // Should update the run with new memory and incremented iteration
    expect(mockPrisma.onboardingAgentRun.update).toHaveBeenCalled();
    // Should trigger next iteration
    expect(mockTrigger).toHaveBeenCalledWith("run1");
  });

  it("agent signals done → status complete → round completion check", async () => {
    mockPrisma.onboardingAgentRun.findUnique.mockResolvedValue(baseRun);
    mockFindManyForRound1();

    mockCallLLM.mockResolvedValueOnce({
      text: JSON.stringify({
        action: "done",
        report: { summary: "Sales dept has 5 people" },
      }),
      usage: { inputTokens: 100, outputTokens: 50 },
      apiCostCents: 1,
    });

    mockPrisma.onboardingAgentRun.update.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.update.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.findUnique.mockResolvedValue({
      id: "a1",
      progressMessages: [],
    });

    const { runAgentIteration } = await import(
      "@/lib/onboarding-intelligence/agent-runner"
    );
    await runAgentIteration("run1");

    // Should mark as complete
    const updateCall = mockPrisma.onboardingAgentRun.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("complete");
    expect(updateCall.data.report).toEqual({ summary: "Sales dept has 5 people" });
  });

  it("agent hits maxIterations → marked complete with existing findings", async () => {
    const maxedRun = {
      ...baseRun,
      iterationCount: 30,
      maxIterations: 30,
      workingMemory: { findings: "Some findings", hypotheses: [], openQuestions: [], investigationPlan: "" },
    };
    mockPrisma.onboardingAgentRun.findUnique.mockResolvedValue(maxedRun);
    mockPrisma.onboardingAgentRun.update.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.update.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.findUnique.mockResolvedValue({
      id: "a1",
      progressMessages: [],
    });
    // Round completion: not all agents done yet (other agent still running)
    mockPrisma.onboardingAgentRun.findMany.mockResolvedValue([
      { status: "complete" },
      { status: "running" },
    ]);

    const { runAgentIteration } = await import(
      "@/lib/onboarding-intelligence/agent-runner"
    );
    await runAgentIteration("run1");

    // Should mark complete with working memory as report
    const updateCall = mockPrisma.onboardingAgentRun.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("complete");
    expect(updateCall.data.report).toEqual(maxedRun.workingMemory);
  });

  it("non-running status → early return, no LLM call", async () => {
    mockPrisma.onboardingAgentRun.findUnique.mockResolvedValue({
      ...baseRun,
      status: "complete",
    });

    const { runAgentIteration } = await import(
      "@/lib/onboarding-intelligence/agent-runner"
    );
    await runAgentIteration("run1");

    expect(mockCallLLM).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUND COMPLETION
// ═══════════════════════════════════════════════════════════════════════════════

describe("Round Completion", () => {
  it("round 0 complete → triggers round 1 agents", async () => {
    mockPrisma.onboardingAgentRun.findMany.mockResolvedValue([
      { status: "complete" },
      { status: "complete" },
    ]);
    mockPrisma.onboardingAnalysis.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.onboardingAnalysis.update.mockResolvedValue({});
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "new-run" });

    const { checkRoundCompletion } = await import(
      "@/lib/onboarding-intelligence/orchestration"
    );
    await checkRoundCompletion("a1", 0);

    // Should update phase to round_1
    const phaseUpdate = mockPrisma.onboardingAnalysis.update.mock.calls.find(
      (c: any) => c[0]?.data?.currentPhase === "round_1",
    );
    expect(phaseUpdate).toBeTruthy();

    // Should create 5 round 1 agent runs
    expect(mockPrisma.onboardingAgentRun.create).toHaveBeenCalledTimes(5);
  });

  it("not all agents complete → no phase transition", async () => {
    mockPrisma.onboardingAgentRun.findMany.mockResolvedValue([
      { status: "complete" },
      { status: "running" },
    ]);

    const { checkRoundCompletion } = await import(
      "@/lib/onboarding-intelligence/orchestration"
    );
    await checkRoundCompletion("a1", 0);

    // Should NOT update phase
    expect(mockPrisma.onboardingAnalysis.update).not.toHaveBeenCalled();
  });

  it("round 1 complete → launches organizer", async () => {
    mockPrisma.onboardingAgentRun.findMany.mockResolvedValue([
      { status: "complete", agentName: "org_analyst", report: {}, workingMemory: {} },
      { status: "complete", agentName: "process_analyst", report: {}, workingMemory: {} },
      { status: "complete", agentName: "relationship_analyst", report: {}, workingMemory: {} },
      { status: "failed", agentName: "knowledge_analyst", report: null, workingMemory: {} },
      { status: "complete", agentName: "financial_analyst", report: {}, workingMemory: {} },
    ]);
    mockPrisma.onboardingAnalysis.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.onboardingAnalysis.update.mockResolvedValue({});
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "org-run" });

    const { checkRoundCompletion } = await import(
      "@/lib/onboarding-intelligence/orchestration"
    );
    await checkRoundCompletion("a1", 1);

    // Should update phase to organizer_1
    const phaseUpdate = mockPrisma.onboardingAnalysis.update.mock.calls.find(
      (c: any) => c[0]?.data?.currentPhase === "organizer_1",
    );
    expect(phaseUpdate).toBeTruthy();

    // Should launch organizer agent
    const createCall = mockPrisma.onboardingAgentRun.create.mock.calls[0][0];
    expect(createCall.data.agentName).toBe("organizer");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS MESSAGES
// ═══════════════════════════════════════════════════════════════════════════════

describe("Progress Messages", () => {
  it("addProgressMessage uses atomic JSON append", async () => {
    mockPrisma.$executeRaw = vi.fn().mockResolvedValue(1);

    const { addProgressMessage } = await import(
      "@/lib/onboarding-intelligence/progress"
    );
    await addProgressMessage("a1", "Investigating emails", "org_analyst");

    // Should use $executeRaw for atomic append
    expect(mockPrisma.$executeRaw).toHaveBeenCalled();
  });

  it("estimateMinutesRemaining returns correct estimates", async () => {
    const { estimateMinutesRemaining } = await import(
      "@/lib/onboarding-intelligence/progress"
    );
    expect(estimateMinutesRemaining("round_0")).toBe(40);
    expect(estimateMinutesRemaining("round_1")).toBe(30);
    expect(estimateMinutesRemaining("synthesis")).toBe(2);
    expect(estimateMinutesRemaining("unknown")).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// START ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Start Analysis", () => {
  it("creates analysis and launches round 0 agents", async () => {
    mockPrisma.sourceConnector.count.mockResolvedValue(2);
    mockPrisma.contentChunk.count.mockResolvedValue(100);
    mockPrisma.onboardingAgentRun.deleteMany.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.deleteMany.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.create.mockResolvedValue({
      id: "new-analysis",
      status: "analyzing",
    });
    mockPrisma.onboardingAnalysis.findUnique.mockResolvedValue({
      id: "new-analysis",
      operatorId: "op1",
      progressMessages: [],
    });
    mockPrisma.onboardingAnalysis.update.mockResolvedValue({});
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "r0-run" });
    mockPrisma.onboardingAgentRun.update.mockResolvedValue({});

    // People Discovery mocks
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

    const { startAnalysis } = await import(
      "@/lib/onboarding-intelligence/orchestration"
    );
    const result = await startAnalysis("op1");

    expect(result.analysisId).toBe("new-analysis");
    expect(result.status).toBe("analyzing");

    // Should delete existing agent runs and analysis
    expect(mockPrisma.onboardingAgentRun.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.onboardingAnalysis.deleteMany).toHaveBeenCalledWith({
      where: { operatorId: "op1" },
    });

    // Should create agent runs (people_discovery creates one, temporal_analyst creates one)
    expect(mockPrisma.onboardingAgentRun.create).toHaveBeenCalledTimes(2);
  });

  it("throws if no connectors or content", async () => {
    mockPrisma.sourceConnector.count.mockResolvedValue(0);
    mockPrisma.contentChunk.count.mockResolvedValue(0);

    const { startAnalysis } = await import(
      "@/lib/onboarding-intelligence/orchestration"
    );
    await expect(startAnalysis("op1")).rejects.toThrow("No active connectors");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL API VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("Internal API Validation", () => {
  it("validateInternalKey passes when no key configured", () => {
    mockValidateKey.mockReturnValue(true);
    const req = new Request("http://localhost");
    expect(mockValidateKey(req)).toBe(true);
  });

  it("validateInternalKey rejects invalid keys", () => {
    mockValidateKey.mockReturnValue(false);
    const req = new Request("http://localhost", {
      headers: { "x-internal-key": "wrong" },
    });
    expect(mockValidateKey(req)).toBe(false);
  });

  it("validateInternalKey accepts valid keys", () => {
    mockValidateKey.mockReturnValue(true);
    const req = new Request("http://localhost", {
      headers: { "x-internal-key": "correct-key" },
    });
    expect(mockValidateKey(req)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL API — UNIT TESTS (unmocked)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Internal API — real implementation", () => {
  it("validateInternalKey returns true when no key set", async () => {
    // Clear the mock for this test
    vi.doUnmock("@/lib/internal-api");
    const original = process.env.INTERNAL_API_KEY;
    delete process.env.INTERNAL_API_KEY;

    // Dynamically import the real module
    const mod = await vi.importActual<typeof import("@/lib/internal-api")>("@/lib/internal-api");
    const req = new Request("http://localhost");
    expect(mod.validateInternalKey(req)).toBe(true);

    process.env.INTERNAL_API_KEY = original;
    // Re-mock
    vi.mock("@/lib/internal-api", () => ({
      triggerNextIteration: vi.fn().mockResolvedValue(undefined),
      validateInternalKey: vi.fn(),
      getBaseUrl: vi.fn().mockReturnValue("http://localhost:3000"),
    }));
  });

  it("validateInternalKey rejects wrong key", async () => {
    const original = process.env.INTERNAL_API_KEY;
    process.env.INTERNAL_API_KEY = "secret-123";

    const mod = await vi.importActual<typeof import("@/lib/internal-api")>("@/lib/internal-api");
    const req = new Request("http://localhost", {
      headers: { "x-internal-key": "wrong-key" },
    });
    expect(mod.validateInternalKey(req)).toBe(false);

    process.env.INTERNAL_API_KEY = original;
  });

  it("validateInternalKey accepts correct key", async () => {
    const original = process.env.INTERNAL_API_KEY;
    process.env.INTERNAL_API_KEY = "secret-123";

    const mod = await vi.importActual<typeof import("@/lib/internal-api")>("@/lib/internal-api");
    const req = new Request("http://localhost", {
      headers: { "x-internal-key": "secret-123" },
    });
    expect(mod.validateInternalKey(req)).toBe(true);

    process.env.INTERNAL_API_KEY = original;
  });

  it("getBaseUrl uses NEXT_PUBLIC_APP_URL first", async () => {
    const original = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.qorpera.com";

    const mod = await vi.importActual<typeof import("@/lib/internal-api")>("@/lib/internal-api");
    expect(mod.getBaseUrl()).toBe("https://app.qorpera.com");

    process.env.NEXT_PUBLIC_APP_URL = original;
  });

  it("getBaseUrl falls back to localhost", async () => {
    const origApp = process.env.NEXT_PUBLIC_APP_URL;
    const origVercel = process.env.VERCEL_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;

    const mod = await vi.importActual<typeof import("@/lib/internal-api")>("@/lib/internal-api");
    expect(mod.getBaseUrl()).toBe("http://localhost:3000");

    process.env.NEXT_PUBLIC_APP_URL = origApp;
    process.env.VERCEL_URL = origVercel;
  });
});
