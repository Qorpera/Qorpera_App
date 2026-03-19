import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    goal: { findMany: vi.fn() },
    initiative: { findMany: vi.fn(), count: vi.fn() },
    workStream: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    workStreamItem: { findMany: vi.fn() },
    delegation: { findMany: vi.fn(), count: vi.fn() },
    recurringTask: { findMany: vi.fn() },
    operationalInsight: { findMany: vi.fn() },
    executionPlan: { findMany: vi.fn() },
    entity: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    situation: { findMany: vi.fn() },
    notification: { count: vi.fn() },
    situationType: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() },
    policyRule: { findMany: vi.fn() },
    followUp: { findMany: vi.fn(), count: vi.fn() },
    priorityOverride: { delete: vi.fn() },
    internalDocument: { count: vi.fn() },
  },
}));

vi.mock("@/lib/ai-provider", () => ({
  callLLM: vi.fn(),
  streamLLM: vi.fn(),
}));

vi.mock("@/lib/entity-resolution", () => ({
  getEntityContext: vi.fn(),
  searchEntities: vi.fn(),
}));

vi.mock("@/lib/graph-traversal", () => ({
  searchAround: vi.fn(),
  formatTraversalForAgent: vi.fn(),
}));

vi.mock("@/lib/entity-model-store", () => ({
  listEntityTypes: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/business-context", () => ({
  getBusinessContext: vi.fn().mockResolvedValue(null),
  formatBusinessContext: vi.fn().mockReturnValue(""),
}));

vi.mock("@/lib/orientation-prompts", () => ({
  buildOrientationSystemPrompt: vi.fn(),
  buildDepartmentDataContext: vi.fn().mockResolvedValue(""),
}));

vi.mock("@/lib/situation-prefilter", () => ({
  generatePreFilter: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/connectors/registry", () => ({
  getProvider: vi.fn(),
}));

vi.mock("@/lib/encryption", () => ({
  decrypt: vi.fn(),
  encrypt: vi.fn(),
}));

vi.mock("@/lib/hardcoded-type-defs", () => ({
  HARDCODED_TYPE_DEFS: {},
}));

vi.mock("@/lib/user-scope", () => ({
  canAccessEntity: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/workstreams", () => ({
  getWorkStreamContext: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { executeTool } from "@/lib/ai-copilot";
import { getWorkStreamContext } from "@/lib/workstreams";

const mockPrisma = prisma as unknown as {
  goal: { findMany: ReturnType<typeof vi.fn> };
  initiative: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  workStream: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  workStreamItem: { findMany: ReturnType<typeof vi.fn> };
  delegation: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  recurringTask: { findMany: ReturnType<typeof vi.fn> };
  operationalInsight: { findMany: ReturnType<typeof vi.fn> };
  executionPlan: { findMany: ReturnType<typeof vi.fn> };
  entity: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  situation: { findMany: ReturnType<typeof vi.fn> };
  notification: { count: ReturnType<typeof vi.fn> };
  situationType: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
  policyRule: { findMany: ReturnType<typeof vi.fn> };
  followUp: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  internalDocument: { count: ReturnType<typeof vi.fn> };
};

const mockGetWorkStreamContext = getWorkStreamContext as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Test Helpers ─────────────────────────────────────────────────────────────

const OP = "op1";

// ── get_goals ────────────────────────────────────────────────────────────────

describe("get_goals", () => {
  it("returns correct shape with valid params", async () => {
    mockPrisma.goal.findMany.mockResolvedValue([
      {
        id: "g1",
        title: "Increase revenue",
        description: "Grow revenue by 20%",
        priority: 1,
        status: "active",
        deadline: new Date("2026-06-01"),
        departmentId: null,
        _count: { initiatives: 3 },
      },
    ]);

    const result = await executeTool(OP, "get_goals", {}, undefined, "all");
    const parsed = JSON.parse(result);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: "g1",
      title: "Increase revenue",
      priority: 1,
      status: "active",
      departmentId: null,
      initiativeCount: 3,
    });
    expect(parsed[0].deadline).toBeDefined();
  });

  it("scopes by visible departments for members", async () => {
    mockPrisma.goal.findMany.mockResolvedValue([]);

    await executeTool(OP, "get_goals", {}, undefined, ["dept1", "dept2"]);

    const call = mockPrisma.goal.findMany.mock.calls[0][0];
    expect(call.where.OR).toEqual([
      { departmentId: { in: ["dept1", "dept2"] } },
      { departmentId: null },
    ]);
  });
});

// ── get_initiatives ──────────────────────────────────────────────────────────

describe("get_initiatives", () => {
  it("returns correct shape", async () => {
    mockPrisma.initiative.findMany.mockResolvedValue([
      {
        id: "i1",
        rationale: "Automate invoice follow-up to reduce overdue payments",
        status: "executing",
        goal: { title: "Reduce overdue invoices" },
        executionPlan: {
          status: "executing",
          currentStepOrder: 2,
          _count: { steps: 4 },
          steps: [{ id: "s1" }, { id: "s2" }],
        },
      },
    ]);
    mockPrisma.workStreamItem.findMany.mockResolvedValue([
      { itemId: "i1", workStream: { title: "Finance automation" } },
    ]);

    const result = await executeTool(OP, "get_initiatives", { status: "executing" }, undefined, "all");
    const parsed = JSON.parse(result);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: "i1",
      status: "executing",
      goalTitle: "Reduce overdue invoices",
      planStatus: "executing",
      stepsCompleted: 2,
      stepsTotal: 4,
      workStreamTitle: "Finance automation",
    });
  });

  it("scopes by department for members", async () => {
    mockPrisma.initiative.findMany.mockResolvedValue([]);
    mockPrisma.workStreamItem.findMany.mockResolvedValue([]);

    await executeTool(OP, "get_initiatives", {}, undefined, ["dept1"]);

    const call = mockPrisma.initiative.findMany.mock.calls[0][0];
    expect(call.where.goal.OR).toEqual([
      { departmentId: { in: ["dept1"] } },
      { departmentId: null },
    ]);
  });
});

// ── get_workstream ───────────────────────────────────────────────────────────

describe("get_workstream", () => {
  it("returns detail for direct lookup", async () => {
    mockGetWorkStreamContext.mockResolvedValue({
      id: "ws1",
      title: "Q1 Finance Project",
      description: "Automate invoice processing",
      status: "active",
      goal: { title: "Reduce manual work" },
      items: [{ type: "initiative", id: "i1", status: "executing", summary: "Automate follow-ups" }],
      parent: null,
    });
    mockPrisma.workStream.findUnique.mockResolvedValue({ goalId: null });
    mockPrisma.workStream.count.mockResolvedValue(2);

    const result = await executeTool(OP, "get_workstream", { workStreamId: "ws1" }, undefined, "all");
    const parsed = JSON.parse(result);

    expect(parsed).toMatchObject({
      id: "ws1",
      title: "Q1 Finance Project",
      status: "active",
      goalTitle: "Reduce manual work",
      childCount: 2,
    });
    expect(parsed.items).toHaveLength(1);
  });

  it("returns search results", async () => {
    mockPrisma.workStream.findMany.mockResolvedValue([
      { id: "ws1", title: "Finance Project", description: "desc", status: "active", goalId: null, _count: { items: 3, children: 1 } },
    ]);

    const result = await executeTool(OP, "get_workstream", { search: "Finance" }, undefined, "all");
    const parsed = JSON.parse(result);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe("Finance Project");
  });
});

// ── get_delegations ──────────────────────────────────────────────────────────

describe("get_delegations", () => {
  it("returns correct shape", async () => {
    mockPrisma.delegation.findMany.mockResolvedValue([
      {
        id: "d1",
        fromAiEntityId: "ai1",
        toAiEntityId: "ai2",
        toUserId: null,
        instruction: "Follow up on the Meridian invoice",
        status: "pending",
        createdAt: new Date("2026-03-18"),
        situationId: "sit1",
        initiativeId: null,
      },
    ]);
    mockPrisma.entity.findMany.mockResolvedValue([
      { id: "ai1", displayName: "Finance AI" },
      { id: "ai2", displayName: "Sales AI" },
    ]);
    mockPrisma.situation.findMany.mockResolvedValue([
      { id: "sit1", situationType: { name: "Overdue Invoice" } },
    ]);
    mockPrisma.initiative.findMany.mockResolvedValue([]);

    const result = await executeTool(OP, "get_delegations", { status: "pending" }, undefined, "all");
    const parsed = JSON.parse(result);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: "d1",
      status: "pending",
      sourceAiName: "Finance AI",
      targetName: "Sales AI",
      type: "ai-to-ai",
      linkedItemTitle: "Overdue Invoice",
    });
  });
});

// ── get_recurring_tasks ──────────────────────────────────────────────────────

describe("get_recurring_tasks", () => {
  it("returns correct shape", async () => {
    mockPrisma.recurringTask.findMany.mockResolvedValue([
      {
        id: "rt1",
        aiEntityId: "ai1",
        title: "Weekly invoice review",
        cronExpression: "0 9 * * 1",
        nextTriggerAt: new Date("2026-03-24T09:00:00Z"),
        autoApproveSteps: false,
        status: "active",
      },
    ]);
    mockPrisma.entity.findMany.mockResolvedValue([
      { id: "ai1", parentDepartmentId: "dept1", ownerDepartmentId: null },
    ]);
    // dept name resolution (second entity.findMany call)
    mockPrisma.entity.findMany
      .mockResolvedValueOnce([{ id: "ai1", parentDepartmentId: "dept1", ownerDepartmentId: null }])
      .mockResolvedValueOnce([{ id: "dept1", displayName: "Finance" }]);
    mockPrisma.executionPlan.findMany.mockResolvedValue([
      { sourceId: "rt1", status: "completed", createdAt: new Date("2026-03-17") },
    ]);

    const result = await executeTool(OP, "get_recurring_tasks", {}, undefined, "all");
    const parsed = JSON.parse(result);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: "rt1",
      title: "Weekly invoice review",
      cronExpression: "0 9 * * 1",
      isActive: true,
      autoApproveSteps: false,
      lastExecutionStatus: "completed",
    });
  });
});

// ── get_insights ─────────────────────────────────────────────────────────────

describe("get_insights", () => {
  it("returns correct shape", async () => {
    mockPrisma.operationalInsight.findMany.mockResolvedValue([
      {
        id: "ins1",
        insightType: "approach_effectiveness",
        description: "Email follow-ups are 30% more effective than Slack for invoice collection",
        confidence: 0.85,
        evidence: JSON.stringify({ sampleSize: 42 }),
        shareScope: "operator",
        promptModification: "Prefer email for invoice follow-ups",
        createdAt: new Date("2026-03-15"),
      },
    ]);

    const result = await executeTool(OP, "get_insights", { insightType: "approach_effectiveness" }, undefined, "all");
    const parsed = JSON.parse(result);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: "ins1",
      insightType: "approach_effectiveness",
      confidence: 0.85,
      sampleSize: 42,
      shareScope: "operator",
    });
  });

  it("filters by shareScope for scoped users", async () => {
    // Personal insights from a different AI entity should not appear
    mockPrisma.entity.findMany
      .mockResolvedValueOnce([{ id: "myAi" }])   // user's ai-agent
      .mockResolvedValueOnce([{ id: "deptAi" }]); // dept AI entities
    mockPrisma.operationalInsight.findMany.mockResolvedValue([]);

    await executeTool(OP, "get_insights", {}, undefined, ["dept1"]);

    const call = mockPrisma.operationalInsight.findMany.mock.calls[0][0];
    expect(call.where.OR).toBeDefined();
    // Should include operator-wide, department-scoped for visible AIs, and personal for own AI
    const scopes = call.where.OR.map((o: Record<string, unknown>) => o.shareScope);
    expect(scopes).toContain("operator");
    expect(scopes).toContain("department");
    expect(scopes).toContain("personal");
  });
});

// ── get_priorities ───────────────────────────────────────────────────────────

describe("get_priorities", () => {
  it("returns correct shape", async () => {
    mockPrisma.executionPlan.findMany.mockResolvedValue([
      {
        id: "plan1",
        sourceType: "situation",
        sourceId: "sit1",
        status: "pending",
        priorityScore: 75,
        currentStepOrder: 1,
        priorityOverride: null,
        steps: [{ title: "Send reminder", sequenceOrder: 1 }],
      },
    ]);
    mockPrisma.situation.findMany.mockResolvedValue([
      { id: "sit1", situationType: { name: "Overdue Invoice" } },
    ]);
    mockPrisma.initiative.findMany.mockResolvedValue([]);
    mockPrisma.recurringTask.findMany.mockResolvedValue([]);

    const result = await executeTool(OP, "get_priorities", { n: 5 }, undefined, "all");
    const parsed = JSON.parse(result);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      planId: "plan1",
      sourceType: "situation",
      sourceTitle: "Overdue Invoice",
      priorityScore: 75,
      currentStep: "Send reminder",
      isPinned: false,
      isSnoozed: false,
    });
  });

  it("respects pin/snooze overrides", async () => {
    const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
    mockPrisma.executionPlan.findMany.mockResolvedValue([
      {
        id: "plan1",
        sourceType: "situation",
        sourceId: "sit1",
        status: "pending",
        priorityScore: 100,
        currentStepOrder: 1,
        priorityOverride: { overrideType: "pin", snoozeUntil: null },
        steps: [{ title: "Step 1", sequenceOrder: 1 }],
      },
      {
        id: "plan2",
        sourceType: "situation",
        sourceId: "sit2",
        status: "pending",
        priorityScore: 50,
        currentStepOrder: 1,
        priorityOverride: { overrideType: "snooze", snoozeUntil: futureDate },
        steps: [{ title: "Step 2", sequenceOrder: 1 }],
      },
    ]);
    mockPrisma.situation.findMany.mockResolvedValue([
      { id: "sit1", situationType: { name: "Sit A" } },
      { id: "sit2", situationType: { name: "Sit B" } },
    ]);
    mockPrisma.initiative.findMany.mockResolvedValue([]);
    mockPrisma.recurringTask.findMany.mockResolvedValue([]);

    const result = await executeTool(OP, "get_priorities", { n: 5 }, undefined, "all");
    const parsed = JSON.parse(result);

    expect(parsed[0].isPinned).toBe(true);
    expect(parsed[0].urgencyReason).toBe("Pinned by user");
    expect(parsed[1].isSnoozed).toBe(true);
    expect(parsed[1].urgencyReason).toBe("Snoozed");
  });
});

// ── get_operational_briefing (upgraded) ──────────────────────────────────────

describe("get_operational_briefing (upgraded)", () => {
  it("returns all new sections", async () => {
    // Departments
    mockPrisma.entity.findMany.mockResolvedValue([
      { id: "dept1", displayName: "Finance", description: "Finance dept" },
    ]);

    // Situations per dept
    mockPrisma.situation.findMany
      .mockResolvedValueOnce([
        { status: "proposed", severity: 0.8, situationType: { name: "Overdue Invoice" } },
      ])
      .mockResolvedValueOnce([]); // unscoped

    // Priority plans
    mockPrisma.executionPlan.findMany.mockResolvedValue([
      {
        id: "plan1",
        sourceType: "situation",
        sourceId: "sit1",
        priorityScore: 75,
        currentStepOrder: 1,
        priorityOverride: null,
        steps: [{ title: "Send reminder", sequenceOrder: 1 }],
      },
    ]);

    // Initiative counts
    mockPrisma.initiative.count
      .mockResolvedValueOnce(2)  // executing
      .mockResolvedValueOnce(1); // proposed

    // Delegation counts
    mockPrisma.delegation.count
      .mockResolvedValueOnce(3)  // pending
      .mockResolvedValueOnce(1); // human accepted

    // FollowUp counts
    mockPrisma.followUp.count.mockResolvedValue(5);
    mockPrisma.followUp.findMany.mockResolvedValue([
      { id: "fu1", triggerAt: new Date(Date.now() + 12 * 60 * 60 * 1000) },
    ]);

    // Recent insights
    mockPrisma.operationalInsight.findMany.mockResolvedValue([
      {
        description: "Email is more effective than Slack for collections",
        confidence: 0.9,
        insightType: "approach_effectiveness",
      },
    ]);

    // Recurring tasks due today
    mockPrisma.recurringTask.findMany.mockResolvedValue([
      { title: "Weekly report", nextTriggerAt: new Date(Date.now() + 6 * 60 * 60 * 1000) },
    ]);

    // Resolve priority plan titles
    mockPrisma.situation.findMany.mockResolvedValue([
      { id: "sit1", situationType: { name: "Overdue Invoice" } },
    ]);
    mockPrisma.initiative.findMany.mockResolvedValue([]);

    const result = await executeTool(OP, "get_operational_briefing", { period: "week" }, undefined, "all");

    // Check all sections are present
    expect(result).toContain("Operational briefing");
    expect(result).toContain("Finance");
    expect(result).toContain("Priority items");
    expect(result).toContain("Initiatives:");
    expect(result).toContain("2 executing");
    expect(result).toContain("1 awaiting approval");
    expect(result).toContain("Delegations:");
    expect(result).toContain("3 pending approval");
    expect(result).toContain("Follow-ups:");
    expect(result).toContain("1 triggering within 24h");
    expect(result).toContain("Recently learned:");
    expect(result).toContain("Email is more effective");
    expect(result).toContain("Recurring tasks due today:");
    expect(result).toContain("Weekly report");
  });
});
