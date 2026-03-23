import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    onboardingAnalysis: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    onboardingAgentRun: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock("@/lib/ai-provider", () => ({
  callLLM: vi.fn(),
}));

vi.mock("@/lib/onboarding-intelligence/synthesis", () => ({
  launchSynthesis: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notification-dispatch", () => ({
  sendNotificationToAdmins: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/internal-api", () => ({
  triggerNextIteration: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import { triggerNextIteration } from "@/lib/internal-api";

const mockPrisma = prisma as any;
const mockCallLLM = callLLM as ReturnType<typeof vi.fn>;
const mockTrigger = triggerNextIteration as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$executeRaw.mockResolvedValue(1);
});

// ═══════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE ANALYST
// ═══════════════════════════════════════════════════════════════════════════════

describe("Knowledge Analyst", () => {
  it("prompt is registered in prompt registry", async () => {
    const { getAgentPrompt } = await import(
      "@/lib/onboarding-intelligence/agents/prompt-registry"
    );
    const prompt = getAgentPrompt("knowledge_analyst");
    expect(prompt).toBeDefined();
    expect(prompt).toContain("Knowledge & Communication Analyst");
    expect(prompt).toContain("Knowledge Inventory");
    expect(prompt).toContain("Knowledge Bottleneck Detection");
    expect(prompt).toContain("vejledning"); // Danish keyword
  });

  it("launchKnowledgeAnalyst creates correct agent run", async () => {
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "ka-run" });

    const { launchKnowledgeAnalyst } = await import(
      "@/lib/onboarding-intelligence/agents/knowledge-analyst"
    );
    await launchKnowledgeAnalyst("a1");

    const createCall = mockPrisma.onboardingAgentRun.create.mock.calls[0][0];
    expect(createCall.data.agentName).toBe("knowledge_analyst");
    expect(createCall.data.round).toBe(1);
    expect(createCall.data.maxIterations).toBe(30);
    expect(mockTrigger).toHaveBeenCalledWith("ka-run");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FINANCIAL ANALYST
// ═══════════════════════════════════════════════════════════════════════════════

describe("Financial Analyst", () => {
  it("prompt is registered in prompt registry", async () => {
    const { getAgentPrompt } = await import(
      "@/lib/onboarding-intelligence/agents/prompt-registry"
    );
    const prompt = getAgentPrompt("financial_analyst");
    expect(prompt).toBeDefined();
    expect(prompt).toContain("Financial & Performance Analyst");
    expect(prompt).toContain("Revenue & Financial Overview");
    expect(prompt).toContain("Correlation Discovery");
    expect(prompt).toContain("regnskab"); // Danish keyword
  });

  it("launchFinancialAnalyst creates correct agent run", async () => {
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "fa-run" });

    const { launchFinancialAnalyst } = await import(
      "@/lib/onboarding-intelligence/agents/financial-analyst"
    );
    await launchFinancialAnalyst("a1");

    const createCall = mockPrisma.onboardingAgentRun.create.mock.calls[0][0];
    expect(createCall.data.agentName).toBe("financial_analyst");
    expect(createCall.data.round).toBe(1);
    expect(mockTrigger).toHaveBeenCalledWith("fa-run");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ORGANIZER
// ═══════════════════════════════════════════════════════════════════════════════

describe("Organizer", () => {
  const mockOrganizerOutputNoFollowUps = {
    overlaps: [{ topic: "Sales team", agents: ["org_analyst", "relationship_analyst"], finding: "Both found 5-person sales team", confidenceBoost: "Confirmed from 2 sources" }],
    contradictions: [],
    followUpBriefs: [],
    unresolvedContradictions: [],
    synthesisNotes: "All findings consistent. Ready for synthesis.",
  };

  const mockOrganizerOutputWithFollowUps = {
    overlaps: [],
    contradictions: [{ topic: "Finance lead", agent1: "org_analyst", agent1Finding: "Thomas is finance lead", agent2: "process_analyst", agent2Finding: "Maria handles invoicing", resolvable: true, resolutionSuggestion: "Check who appears in finance meetings" }],
    followUpBriefs: [
      { targetAgent: "org_analyst", brief: "Investigate who leads the finance function", reason: "Conflicting info about finance leadership", priority: "high" as const },
      { targetAgent: "process_analyst", brief: "Check invoice approval chain", reason: "Need to clarify finance workflow", priority: "medium" as const },
    ],
    unresolvedContradictions: [],
    synthesisNotes: "Finance leadership unclear. Follow-ups needed.",
  };

  it("when follow-up briefs are empty → proceeds to synthesis", async () => {
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "org-run" });
    mockPrisma.onboardingAgentRun.findMany.mockResolvedValue([
      { agentName: "org_analyst", report: {} },
      { agentName: "process_analyst", report: {} },
    ]);
    mockPrisma.onboardingAnalysis.findUnique.mockResolvedValue({ operatorId: "op1" });
    mockPrisma.onboardingAgentRun.update.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.update.mockResolvedValue({});

    mockCallLLM.mockResolvedValueOnce({
      text: JSON.stringify(mockOrganizerOutputNoFollowUps),
      usage: { inputTokens: 1000, outputTokens: 500 },
      apiCostCents: 5,
    });

    const { runOrganizer } = await import(
      "@/lib/onboarding-intelligence/agents/organizer"
    );
    await runOrganizer("a1", 1);

    // Should mark organizer complete
    const updateCall = mockPrisma.onboardingAgentRun.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("complete");

    // Should proceed to synthesis (update phase to "synthesis")
    const phaseUpdates = mockPrisma.onboardingAnalysis.update.mock.calls;
    const synthesisUpdate = phaseUpdates.find(
      (c: any) => c[0]?.data?.currentPhase === "synthesis",
    );
    expect(synthesisUpdate).toBeTruthy();
  });

  it("when follow-up briefs exist → launches Round 2 with correct agents and briefs", async () => {
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "org-run" });
    mockPrisma.onboardingAgentRun.findMany.mockResolvedValue([
      { agentName: "org_analyst", report: {} },
      { agentName: "process_analyst", report: {} },
    ]);
    mockPrisma.onboardingAnalysis.findUnique.mockResolvedValue({ operatorId: "op1" });
    mockPrisma.onboardingAgentRun.update.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.update.mockResolvedValue({});

    mockCallLLM.mockResolvedValueOnce({
      text: JSON.stringify(mockOrganizerOutputWithFollowUps),
      usage: { inputTokens: 1000, outputTokens: 500 },
      apiCostCents: 5,
    });

    const { runOrganizer } = await import(
      "@/lib/onboarding-intelligence/agents/organizer"
    );
    await runOrganizer("a1", 1);

    // Should update phase to round_2
    const phaseUpdates = mockPrisma.onboardingAnalysis.update.mock.calls;
    const round2Update = phaseUpdates.find(
      (c: any) => c[0]?.data?.currentPhase === "round_2",
    );
    expect(round2Update).toBeTruthy();

    // Should create agent runs for org_analyst and process_analyst (the 2 targeted agents)
    const agentCreates = mockPrisma.onboardingAgentRun.create.mock.calls;
    // First create is the organizer itself, then 2 Round 2 agents
    expect(agentCreates.length).toBe(3);

    const r2Agents = agentCreates.slice(1).map((c: any) => c[0].data.agentName);
    expect(r2Agents).toContain("org_analyst");
    expect(r2Agents).toContain("process_analyst");

    // Round 2 agents should have maxIterations: 15
    const r2Create = agentCreates[1][0];
    expect(r2Create.data.round).toBe(2);
    expect(r2Create.data.maxIterations).toBe(15);
    expect(r2Create.data.followUpBrief).toBeDefined();
    expect(r2Create.data.followUpBrief.fromOrganizer).toBe(true);
  });

  it("on failure → proceeds to synthesis (graceful degradation)", async () => {
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "org-run" });
    mockPrisma.onboardingAgentRun.findMany.mockResolvedValue([]);
    mockPrisma.onboardingAnalysis.findUnique.mockResolvedValue({ operatorId: "op1" });
    mockPrisma.onboardingAgentRun.update.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.update.mockResolvedValue({});

    mockCallLLM.mockRejectedValueOnce(new Error("LLM quota exceeded"));

    const { runOrganizer } = await import(
      "@/lib/onboarding-intelligence/agents/organizer"
    );
    await runOrganizer("a1", 1);

    // Should mark organizer as failed
    const updateCall = mockPrisma.onboardingAgentRun.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe("failed");

    // Should still proceed to synthesis
    const phaseUpdates = mockPrisma.onboardingAnalysis.update.mock.calls;
    const synthesisUpdate = phaseUpdates.find(
      (c: any) => c[0]?.data?.currentPhase === "synthesis",
    );
    expect(synthesisUpdate).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUND COMPLETION WIRING
// ═══════════════════════════════════════════════════════════════════════════════

describe("Round Completion Wiring (P4)", () => {
  it("round 1 complete → organizer called (not generic launchAgent)", async () => {
    mockPrisma.onboardingAgentRun.findMany.mockImplementation((args: any) => {
      // checkRoundCompletion query: round 1, exclude organizer
      if (args.where.round === 1 && args.where.agentName?.not === "organizer") {
        return [
          { status: "complete" },
          { status: "complete" },
          { status: "complete" },
          { status: "complete" },
          { status: "complete" },
        ];
      }
      // runOrganizer query: completed round 1 agents
      if (args.where.round === 1 && args.where.status === "complete" && args.where.agentName?.not === "organizer") {
        return [
          { agentName: "org_analyst", report: {} },
          { agentName: "process_analyst", report: {} },
        ];
      }
      return [];
    });

    mockPrisma.onboardingAnalysis.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.onboardingAnalysis.update.mockResolvedValue({});
    mockPrisma.onboardingAnalysis.findUnique.mockResolvedValue({ operatorId: "op1" });
    mockPrisma.onboardingAgentRun.create.mockResolvedValue({ id: "org-run" });
    mockPrisma.onboardingAgentRun.update.mockResolvedValue({});

    // Organizer returns no follow-ups → synthesis
    mockCallLLM.mockResolvedValueOnce({
      text: JSON.stringify({
        overlaps: [],
        contradictions: [],
        followUpBriefs: [],
        unresolvedContradictions: [],
        synthesisNotes: "Ready.",
      }),
      usage: { inputTokens: 100, outputTokens: 50 },
      apiCostCents: 1,
    });

    const { checkRoundCompletion } = await import(
      "@/lib/onboarding-intelligence/orchestration"
    );
    await checkRoundCompletion("a1", 1);

    // Should have called updateMany for atomic transition
    expect(mockPrisma.onboardingAnalysis.updateMany).toHaveBeenCalled();

    // Should create organizer run
    const orgCreate = mockPrisma.onboardingAgentRun.create.mock.calls.find(
      (c: any) => c[0].data.agentName === "organizer",
    );
    expect(orgCreate).toBeTruthy();
  });

  it("round 3 complete → launches synthesis", async () => {
    mockPrisma.onboardingAgentRun.findMany.mockResolvedValue([
      { status: "complete" },
    ]);

    mockPrisma.onboardingAnalysis.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.onboardingAnalysis.update.mockResolvedValue({});

    const { checkRoundCompletion } = await import(
      "@/lib/onboarding-intelligence/orchestration"
    );
    await checkRoundCompletion("a1", 3);

    // Should go directly to synthesis phase
    const phaseUpdate = mockPrisma.onboardingAnalysis.update.mock.calls.find(
      (c: any) => c[0]?.data?.currentPhase === "synthesis",
    );
    expect(phaseUpdate).toBeTruthy();

    // Should launch synthesis (mocked)
    const { launchSynthesis } = await import("@/lib/onboarding-intelligence/synthesis");
    expect(launchSynthesis).toHaveBeenCalledWith("a1");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FULL ROUND 1 LAUNCH
// ═══════════════════════════════════════════════════════════════════════════════

describe("Full Round 1 Launch", () => {
  it("all 5 agents launched with progress messages", async () => {
    mockPrisma.onboardingAgentRun.findMany.mockImplementation((args: any) => {
      if (args.where.round === 0 && !args.where.status && !args.where.agentName) {
        return [
          { status: "complete", agentName: "people_discovery" },
          { status: "complete", agentName: "temporal_analyst" },
        ];
      }
      if (args.where.round === 0 && args.where.agentName?.not === "organizer") {
        return [
          { status: "complete", agentName: "people_discovery" },
          { status: "complete", agentName: "temporal_analyst" },
        ];
      }
      if (args.where.round === 0 && args.where.status === "complete") {
        return [
          { agentName: "people_discovery", report: [] },
          { agentName: "temporal_analyst", report: { temporalMap: [], recencyWarnings: [] } },
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

    // Should create 5 Round 1 agent runs
    expect(mockPrisma.onboardingAgentRun.create).toHaveBeenCalledTimes(5);

    const agentNames = mockPrisma.onboardingAgentRun.create.mock.calls.map(
      (c: any) => c[0].data.agentName,
    );
    expect(agentNames).toContain("org_analyst");
    expect(agentNames).toContain("process_analyst");
    expect(agentNames).toContain("relationship_analyst");
    expect(agentNames).toContain("knowledge_analyst");
    expect(agentNames).toContain("financial_analyst");

    // All should trigger iterations
    expect(mockTrigger).toHaveBeenCalledTimes(5);
  });
});
