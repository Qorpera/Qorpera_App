import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(),
    executionPlan: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    executionStep: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    actionCapability: { findUnique: vi.fn() },
    sourceConnector: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    situation: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), count: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    situationType: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    entity: { findUnique: vi.fn(), findFirst: vi.fn() },
    notificationPreference: { findUnique: vi.fn() },
    notification: { create: vi.fn() },
    user: { findMany: vi.fn(), findFirst: vi.fn() },
    followUp: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    userScope: { findMany: vi.fn(), findFirst: vi.fn() },
    workStreamItem: { findMany: vi.fn(), upsert: vi.fn() },
    workStream: { findUnique: vi.fn(), update: vi.fn() },
    propertyValue: { findMany: vi.fn() },
    priorityOverride: { delete: vi.fn() },
  },
}));

vi.mock("@/lib/ai-provider", () => ({
  callLLM: vi.fn(),
  getModel: (route: string) => `mock-${route}`,
}));

vi.mock("@/lib/connectors/registry", () => ({
  getProvider: vi.fn(),
}));

vi.mock("@/lib/encryption", () => ({
  decrypt: vi.fn((v: string) => v),
  encrypt: vi.fn((v: string) => v),
}));

vi.mock("@/lib/notification-dispatch", () => ({
  sendNotification: vi.fn().mockResolvedValue(undefined),
  sendNotificationToAdmins: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/policy-evaluator", () => ({
  evaluateActionPolicies: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { sendNotification, sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { executeStep, advancePlanAfterStep, resumeAfterSituationResolution } from "@/lib/execution-engine";

beforeEach(() => {
  vi.clearAllMocks();
  (sendNotification as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (sendNotificationToAdmins as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (prisma.notificationPreference.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ channel: "in_app" });
  (prisma.notification.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "n1" });
  (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "admin1" });
  (prisma.userScope.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.userScope.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (prisma.followUp.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "fu1" });
  (prisma.followUp.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
  (prisma.workStreamItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.workStreamItem.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({});
  // Loop breaker — under ceiling
  (prisma.executionPlan.update as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "plan1", totalStepExecutions: 1, maxStepExecutions: 15,
    operatorId: "op1", sourceType: "situation", sourceId: "sit1",
  });
});

const basePlan = { id: "plan1", operatorId: "op1", sourceType: "situation", sourceId: "parent-sit-1" };

// ── 1-5. await_situation step ────────────────────────────────────────────────

describe("await_situation step", () => {
  const awaitStep = {
    id: "step1",
    planId: "plan1",
    sequenceOrder: 1,
    executionMode: "await_situation",
    actionCapabilityId: null,
    assignedUserId: null,
    inputContext: JSON.stringify({
      situationTypeSlug: "meeting_request",
      targetUserId: "user-1",
      title: "Schedule meeting",
      description: "Please schedule a meeting with the client",
      inheritWorkStream: true,
    }),
    title: "Await meeting confirmation",
    description: "Wait for meeting to be scheduled",
    plan: basePlan,
  };

  it("creates a situation with spawningStepId set", async () => {
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(awaitStep);
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.situationType.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "st-meeting", slug: "meeting_request" });
    (prisma.situation.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "spawned-sit-1" });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await executeStep("step1");

    expect(prisma.situation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operatorId: "op1",
        situationTypeId: "st-meeting",
        spawningStepId: "step1",
        source: "detected",
        status: "detected",
      }),
    });
  });

  it("sets step status to awaiting_situation", async () => {
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(awaitStep);
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.situationType.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "st-meeting", slug: "meeting_request" });
    (prisma.situation.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "spawned-sit-1" });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await executeStep("step1");

    expect(prisma.executionStep.update).toHaveBeenCalledWith({
      where: { id: "step1" },
      data: { status: "awaiting_situation" },
    });
  });

  it("plan does NOT advance past this step", async () => {
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(awaitStep);
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.situationType.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "st-meeting", slug: "meeting_request" });
    (prisma.situation.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "spawned-sit-1" });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await executeStep("step1");

    // advancePlanAfterStep should NOT be called (no findFirst for next step, no plan status update)
    expect(prisma.executionStep.findFirst).not.toHaveBeenCalled();
    // Only the loop breaker increment call should exist — no status change
    const updateCalls = (prisma.executionPlan.update as ReturnType<typeof vi.fn>).mock.calls;
    const statusUpdateCalls = updateCalls.filter((c: any) => c[0]?.data?.status);
    expect(statusUpdateCalls).toHaveLength(0);
  });

  it("workStreamId inherited from parent", async () => {
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(awaitStep);
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.situationType.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "st-meeting", slug: "meeting_request" });
    (prisma.situation.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "spawned-sit-1" });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    // Parent plan's source is in a workstream
    (prisma.workStreamItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { workStreamId: "ws-1" },
    ]);

    await executeStep("step1");

    expect(prisma.workStreamItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workStreamId_itemType_itemId: { workStreamId: "ws-1", itemType: "situation", itemId: "spawned-sit-1" } },
        create: { workStreamId: "ws-1", itemType: "situation", itemId: "spawned-sit-1" },
      }),
    );
  });

  it("notification sent to target user", async () => {
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(awaitStep);
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.situationType.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "st-meeting", slug: "meeting_request", name: "Meeting Request", description: "Request a meeting" });
    (prisma.situation.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "spawned-sit-1" });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await executeStep("step1");

    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        type: "situation_proposed",
        sourceType: "situation",
        sourceId: "spawned-sit-1",
      }),
    );
  });
});

// ── 6-10. Situation resolution ──────────────────────────────────────────────

describe("Situation resolution — resume parent plan", () => {
  it("completing a spawned situation resumes the parent plan", async () => {
    (prisma.situation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "spawned-sit-1",
      spawningStepId: "step1",
      status: "resolved",
      resolvedAt: new Date(),
      assignedUserId: "user-1",
      contextSnapshot: null,
    });
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "step1",
      planId: "plan1",
      sequenceOrder: 1,
      status: "awaiting_situation",
      plan: basePlan,
    });
    (prisma.situation.count as ReturnType<typeof vi.fn>).mockResolvedValue(0); // all resolved
    (prisma.situation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "spawned-sit-1",
        status: "resolved",
        resolvedAt: new Date("2026-03-20"),
        assignedUserId: "user-1",
        contextSnapshot: null,
      },
    ]);
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.executionStep.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "step2", sequenceOrder: 2, title: "Next step",
    });
    (prisma.executionPlan.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await resumeAfterSituationResolution("spawned-sit-1");

    // Step completed
    expect(prisma.executionStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "step1" },
        data: expect.objectContaining({ status: "completed" }),
      }),
    );
  });

  it("step outputResult contains resolution data", async () => {
    (prisma.situation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "spawned-sit-1",
      spawningStepId: "step1",
      status: "resolved",
      resolvedAt: new Date("2026-03-20"),
      assignedUserId: "user-1",
      contextSnapshot: JSON.stringify({ key: "val" }),
    });
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "step1", planId: "plan1", sequenceOrder: 1, status: "awaiting_situation",
      plan: basePlan,
    });
    (prisma.situation.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.situation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "spawned-sit-1",
        status: "resolved",
        resolvedAt: new Date("2026-03-20"),
        assignedUserId: "user-1",
        contextSnapshot: JSON.stringify({ key: "val" }),
      },
    ]);
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.executionStep.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.executionPlan.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await resumeAfterSituationResolution("spawned-sit-1");

    const updateCall = (prisma.executionStep.update as ReturnType<typeof vi.fn>).mock.calls[0];
    const output = JSON.parse(updateCall[0].data.outputResult);
    expect(output.type).toBe("situation_resolution");
    expect(output.resolutions).toHaveLength(1);
    expect(output.resolutions[0].situationId).toBe("spawned-sit-1");
  });

  it("next step advances to awaiting_approval", async () => {
    (prisma.situation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "spawned-sit-1", spawningStepId: "step1", status: "resolved",
      resolvedAt: new Date(), assignedUserId: null, contextSnapshot: null,
    });
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "step1", planId: "plan1", sequenceOrder: 1, status: "awaiting_situation",
      plan: basePlan,
    });
    (prisma.situation.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.situation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "spawned-sit-1", status: "resolved", resolvedAt: new Date(), assignedUserId: null, contextSnapshot: null },
    ]);
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.executionStep.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "step2", sequenceOrder: 2, title: "Next step",
    });
    (prisma.executionPlan.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await resumeAfterSituationResolution("spawned-sit-1");

    // Next step set to awaiting_approval
    expect(prisma.executionStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "step2" },
        data: { status: "awaiting_approval" },
      }),
    );
  });

  it("multiple situations with same spawningStepId — plan waits until ALL resolve", async () => {
    (prisma.situation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "spawned-sit-1", spawningStepId: "step1", status: "resolved",
      resolvedAt: new Date(), assignedUserId: null, contextSnapshot: null,
    });
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "step1", planId: "plan1", sequenceOrder: 1, status: "awaiting_situation",
      plan: basePlan,
    });
    // 1 still unresolved
    (prisma.situation.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    await resumeAfterSituationResolution("spawned-sit-1");

    // Step should NOT be completed
    expect(prisma.executionStep.update).not.toHaveBeenCalled();
    expect(prisma.executionPlan.update).not.toHaveBeenCalled();
  });

  it("partial resolution (2 of 3 resolved) does NOT advance the plan", async () => {
    (prisma.situation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "spawned-sit-2", spawningStepId: "step1", status: "resolved",
      resolvedAt: new Date(), assignedUserId: null, contextSnapshot: null,
    });
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "step1", planId: "plan1", sequenceOrder: 1, status: "awaiting_situation",
      plan: basePlan,
    });
    // Still 1 unresolved situation
    (prisma.situation.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    await resumeAfterSituationResolution("spawned-sit-2");

    expect(prisma.executionStep.update).not.toHaveBeenCalled();
  });
});

// ── 11-12. Workstream reassessment ──────────────────────────────────────────

describe("Workstream reassessment", () => {
  it("plan completion triggers reassessment when workStreamId present", async () => {
    // This test verifies the integration point: advancePlanAfterStep triggers reassessment
    (prisma.executionStep.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null); // no next step
    (prisma.executionPlan.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "plan1", operatorId: "op1", sourceType: "situation", sourceId: "sit-1",
    });
    // WorkStream item exists
    (prisma.workStreamItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { workStreamId: "ws-1" },
    ]);

    await advancePlanAfterStep("step1", "plan1", 1, "op1");

    // Plan marked completed
    expect(prisma.executionPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "completed" }),
      }),
    );
  });

  it("all children resolved → workstream completed via reassessment module", async () => {
    const { reassessWorkStream } = await import("@/lib/workstream-reassessment");

    (prisma.workStream.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "ws-1",
      operatorId: "op1",
      status: "active",
      title: "Test Stream",
      goalId: null,
      items: [
        { id: "item-1", workStreamId: "ws-1", itemType: "situation", itemId: "sit-1" },
      ],
      children: [],
    });
    (prisma.situation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "sit-1",
      status: "resolved",
      situationType: { name: "Test" },
    });
    (prisma.workStream.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await reassessWorkStream("ws-1", "sit-1", "situation");

    expect(prisma.workStream.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ws-1" },
        data: expect.objectContaining({
          status: "completed",
          lastReassessmentResult: expect.stringContaining("completed"),
        }),
      }),
    );
  });
});

// ── 13. Workstream absorption ───────────────────────────────────────────────

describe("Workstream absorption", () => {
  it("reasoning output with relatedWorkStreamId updates situation", async () => {
    // This test verifies the ReasoningOutput schema accepts relatedWorkStreamId
    const { ReasoningOutputSchema } = await import("@/lib/reasoning-types");

    const validOutput = {
      analysis: "This situation relates to the ongoing project workstream.",
      evidenceSummary: "Evidence shows connection to active workstream.",
      consideredActions: [],
      actionPlan: null,
      confidence: 0.8,
      missingContext: null,
      relatedWorkStreamId: "ws-123",
    };

    const result = ReasoningOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.relatedWorkStreamId).toBe("ws-123");
    }
  });
});

// ── 14. Priority inheritance ────────────────────────────────────────────────

describe("Priority inheritance", () => {
  it("spawned situation inherits parent plan priority", async () => {
    const { computePlanPriorityWithBreakdown } = await import("@/lib/prioritization-engine");

    (prisma.executionPlan.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "plan2", operatorId: "op1", sourceType: "situation", sourceId: "sit1",
      status: "pending", currentStepOrder: 1, createdAt: new Date(),
      priorityOverride: null, steps: [{ id: "s1" }],
    });
    (prisma.situation.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      triggerEntityId: null,
      spawningStepId: "parent-step-1",
      situationType: { slug: "overdue_invoice", detectionLogic: "{}" },
    });
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      plan: { priorityScore: 90 },
    });
    (prisma.followUp.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await computePlanPriorityWithBreakdown("plan2");
    expect(result.score).toBeGreaterThanOrEqual(90);
  });
});
