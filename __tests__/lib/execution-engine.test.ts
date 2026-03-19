import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(),
    executionPlan: { create: vi.fn(), update: vi.fn() },
    executionStep: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    actionCapability: { findUnique: vi.fn() },
    sourceConnector: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    situation: { findUnique: vi.fn() },
    entity: { findUnique: vi.fn() },
    notificationPreference: { findUnique: vi.fn() },
    notification: { create: vi.fn() },
    user: { findMany: vi.fn(), findFirst: vi.fn() },
    followUp: { create: vi.fn(), updateMany: vi.fn() },
    userScope: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/ai-provider", () => ({
  callLLM: vi.fn(),
}));

vi.mock("@/lib/connectors/registry", () => ({
  getProvider: vi.fn(),
}));

vi.mock("@/lib/encryption", () => ({
  decrypt: vi.fn((v: string) => v),
  encrypt: vi.fn((v: string) => v),
}));

vi.mock("@/lib/notification-dispatch", () => ({
  sendNotification: vi.fn(),
  sendNotificationToAdmins: vi.fn(),
}));

vi.mock("@/lib/policy-evaluator", () => ({
  evaluateActionPolicies: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import { getProvider } from "@/lib/connectors/registry";
import { sendNotification, sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { evaluateActionPolicies } from "@/lib/policy-evaluator";
import {
  createExecutionPlan,
  executeStep,
  advanceStep,
  completeHumanStep,
} from "@/lib/execution-engine";

const mockTx = {
  executionPlan: { create: vi.fn() },
  executionStep: { create: vi.fn() },
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: notification dispatch mocks resolve
  (sendNotification as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (sendNotificationToAdmins as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  // Default: notification preference lookup for dispatch
  (prisma.notificationPreference.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ channel: "in_app" });
  (prisma.notification.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "n1" });
  (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  // Default: getDepartmentAdminId fallback
  (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "admin1" });
  (prisma.userScope.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.userScope.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  // Default: followUp mocks
  (prisma.followUp.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "fu1" });
  (prisma.followUp.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
});

// ── createExecutionPlan ──────────────────────────────────────────────────────

describe("createExecutionPlan", () => {
  it("creates plan + 3 steps with correct sequenceOrders, first step awaiting_approval", async () => {
    mockTx.executionPlan.create.mockResolvedValue({ id: "plan1" });
    mockTx.executionStep.create.mockResolvedValue({ id: "step" });
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<string>) => fn(mockTx),
    );

    const steps = [
      { title: "Step 1", description: "First", executionMode: "action" as const },
      { title: "Step 2", description: "Second", executionMode: "generate" as const },
      { title: "Step 3", description: "Third", executionMode: "human_task" as const },
    ];

    const planId = await createExecutionPlan("op1", "situation", "sit1", steps);

    expect(planId).toBe("plan1");
    expect(mockTx.executionStep.create).toHaveBeenCalledTimes(3);

    // First step awaiting_approval
    expect(mockTx.executionStep.create.mock.calls[0][0].data.status).toBe("awaiting_approval");
    expect(mockTx.executionStep.create.mock.calls[0][0].data.sequenceOrder).toBe(1);

    // Subsequent steps pending
    expect(mockTx.executionStep.create.mock.calls[1][0].data.status).toBe("pending");
    expect(mockTx.executionStep.create.mock.calls[1][0].data.sequenceOrder).toBe(2);
    expect(mockTx.executionStep.create.mock.calls[2][0].data.status).toBe("pending");
    expect(mockTx.executionStep.create.mock.calls[2][0].data.sequenceOrder).toBe(3);
  });
});

// ── executeStep — action mode ────────────────────────────────────────────────

describe("executeStep — action mode", () => {
  const basePlan = { id: "plan1", operatorId: "op1", sourceType: "initiative", sourceId: "init1" };
  const baseStep = {
    id: "step1",
    planId: "plan1",
    sequenceOrder: 1,
    executionMode: "action",
    actionCapabilityId: "cap1",
    assignedUserId: null,
    inputContext: JSON.stringify({ to: "user@example.com" }),
    title: "Send email",
    description: "Send an email",
    plan: basePlan,
  };

  it("success — resolves capability, connector, provider, stores output, advances", async () => {
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseStep);
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.actionCapability.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "cap1", name: "send_email", description: "Send email", enabled: true,
      connectorId: "conn1", inputSchema: null,
    });
    (prisma.sourceConnector.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "conn1", provider: "google", config: '{"access_token":"t"}',
    });
    const mockExecuteAction = vi.fn().mockResolvedValue({
      success: true,
      result: { threadId: "t1", recipients: ["a@b.com"], subject: "Hi" },
    });
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      executeAction: mockExecuteAction,
    });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    // No next step — plan completes
    (prisma.executionStep.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.executionPlan.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.sourceConnector.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await executeStep("step1");

    expect(mockExecuteAction).toHaveBeenCalled();
    // Step completed
    const updateCall = (prisma.executionStep.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updateCall[0].data.status).toBe("completed");
    expect(JSON.parse(updateCall[0].data.outputResult).type).toBe("email");
  });

  it("connector routing with assignedUserId — finds user's connector", async () => {
    const stepWithUser = { ...baseStep, assignedUserId: "user1" };
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(stepWithUser);
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.actionCapability.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "cap1", name: "send_email", description: "Send email", enabled: true,
      connectorId: "conn1", inputSchema: null,
    });
    // Capability's connector reveals provider
    (prisma.sourceConnector.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: "conn1", provider: "google" })  // capability lookup
      .mockResolvedValueOnce({ id: "conn-user1", provider: "google", config: '{}' });  // final connector load
    // User's connector found
    (prisma.sourceConnector.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "conn-user1", provider: "google",
    });
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      executeAction: vi.fn().mockResolvedValue({ success: true, result: {} }),
    });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.executionStep.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.executionPlan.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.sourceConnector.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await executeStep("step1");

    // Should have looked for user's connector via findFirst
    expect(prisma.sourceConnector.findFirst).toHaveBeenCalledWith({
      where: { operatorId: "op1", provider: "google", userId: "user1", status: "active" },
    });
  });

  it("connector routing without assignedUserId — uses capability connectorId", async () => {
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseStep);
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.actionCapability.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "cap1", name: "send_email", description: "Send email", enabled: true,
      connectorId: "conn1", inputSchema: null,
    });
    (prisma.sourceConnector.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "conn1", provider: "google", config: '{}',
    });
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      executeAction: vi.fn().mockResolvedValue({ success: true, result: {} }),
    });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.executionStep.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.executionPlan.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.sourceConnector.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await executeStep("step1");

    // Should NOT have tried findFirst for a user connector
    expect(prisma.sourceConnector.findFirst).not.toHaveBeenCalled();
  });

  it("governance blocks — step fails with policy error", async () => {
    const sitStep = {
      ...baseStep,
      plan: { ...basePlan, sourceType: "situation", sourceId: "sit1" },
    };
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(sitStep);
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.actionCapability.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "cap1", name: "send_email", description: "Send email", enabled: true,
      connectorId: "conn1", inputSchema: null,
    });
    (prisma.situation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      triggerEntityId: "ent1",
    });
    (prisma.entity.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      entityType: { slug: "contact" },
    });
    (evaluateActionPolicies as ReturnType<typeof vi.fn>).mockResolvedValue({
      permitted: [],
      blocked: [{ name: "send_email", reason: "No external emails policy" }],
      hasRequireApproval: false,
    });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await executeStep("step1");

    // Step should be failed
    const failCall = (prisma.executionStep.update as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: [{ data: { status: string } }]) => c[0].data.status === "failed",
    );
    expect(failCall).toBeDefined();
    expect(failCall![0].data.errorMessage).toContain("No external emails policy");
  });

  it("provider missing executeAction — step fails gracefully", async () => {
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseStep);
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.actionCapability.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "cap1", name: "send_email", description: "Send email", enabled: true,
      connectorId: "conn1", inputSchema: null,
    });
    (prisma.sourceConnector.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "conn1", provider: "google", config: '{}',
    });
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      // No executeAction method
    });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await executeStep("step1");

    const failCall = (prisma.executionStep.update as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: [{ data: { status: string } }]) => c[0].data.status === "failed",
    );
    expect(failCall).toBeDefined();
    expect(failCall![0].data.errorMessage).toContain("does not support action execution");
  });

  it("executeAction returns failure — step fails, errorMessage stored", async () => {
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(baseStep);
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.actionCapability.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "cap1", name: "send_email", description: "Send email", enabled: true,
      connectorId: "conn1", inputSchema: null,
    });
    (prisma.sourceConnector.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "conn1", provider: "google", config: '{}',
    });
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      executeAction: vi.fn().mockResolvedValue({ success: false, error: "Rate limited" }),
    });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await executeStep("step1");

    const failCall = (prisma.executionStep.update as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: [{ data: { status: string } }]) => c[0].data.status === "failed",
    );
    expect(failCall).toBeDefined();
    expect(failCall![0].data.errorMessage).toContain("Rate limited");
  });
});

// ── executeStep — generate mode ──────────────────────────────────────────────

describe("executeStep — generate mode", () => {
  it("calls callLLM with correct messages, stores content output", async () => {
    const step = {
      id: "step2",
      planId: "plan1",
      sequenceOrder: 2,
      executionMode: "generate",
      actionCapabilityId: null,
      assignedUserId: null,
      inputContext: JSON.stringify({ topic: "quarterly review" }),
      title: "Draft report",
      description: "Write a quarterly review report",
      plan: { id: "plan1", operatorId: "op1", sourceType: "initiative", sourceId: "init1" },
    };
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(step);
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { title: "Gather data", outputResult: JSON.stringify({ type: "data", payload: { revenue: 100 }, description: "gather" }) },
    ]);
    (callLLM as ReturnType<typeof vi.fn>).mockResolvedValue({ content: "# Q1 Report\nRevenue: $100" });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.executionStep.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.executionPlan.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await executeStep("step2");

    expect(callLLM).toHaveBeenCalledOnce();
    const [messages, options] = (callLLM as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(messages[0].role).toBe("system");
    expect(messages[1].content).toContain("quarterly review report");
    expect(messages[1].content).toContain("Prior step results");
    expect(options.temperature).toBe(0.3);

    const updateCall = (prisma.executionStep.update as ReturnType<typeof vi.fn>).mock.calls[0];
    const output = JSON.parse(updateCall[0].data.outputResult);
    expect(output.type).toBe("content");
    expect(output.text).toContain("Q1 Report");
  });
});

// ── executeStep — human_task mode ────────────────────────────────────────────

describe("executeStep — human_task mode", () => {
  it("sets step to executing, sends notification, does NOT advance plan", async () => {
    const step = {
      id: "step3",
      planId: "plan1",
      sequenceOrder: 1,
      executionMode: "human_task",
      actionCapabilityId: null,
      assignedUserId: "user1",
      inputContext: null,
      title: "Review document",
      description: "Please review the attached document",
      plan: { id: "plan1", operatorId: "op1", sourceType: "initiative", sourceId: "init1" },
    };
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(step);
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await executeStep("step3");

    // Step set to executing
    expect(prisma.executionStep.update).toHaveBeenCalledWith({
      where: { id: "step3" },
      data: { status: "executing" },
    });

    // Notification sent
    expect(sendNotification).toHaveBeenCalledWith({
      operatorId: "op1",
      userId: "user1",
      type: "delegation_received",
      title: "Task assigned: Review document",
      body: "Please review the attached document",
      sourceType: "execution",
      sourceId: "plan1",
    });

    // Plan should NOT be advanced — no findFirst for next step
    expect(prisma.executionStep.findFirst).not.toHaveBeenCalled();
    expect(prisma.executionPlan.update).not.toHaveBeenCalled();

    // FollowUp auto-created with 3 business day timeout
    expect(prisma.followUp.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operatorId: "op1",
        executionStepId: "step3",
        status: "watching",
        reminderSent: false,
        triggerCondition: expect.stringContaining('"type":"timeout"'),
        fallbackAction: expect.stringContaining('"type":"escalate"'),
      }),
    });
  });
});

// ── executeStep — last step completes plan ───────────────────────────────────

describe("executeStep — last step completes plan", () => {
  it("sets plan status to completed with completedAt, sends notification", async () => {
    const step = {
      id: "step2",
      planId: "plan1",
      sequenceOrder: 2,
      executionMode: "generate",
      actionCapabilityId: null,
      assignedUserId: null,
      inputContext: null,
      title: "Final step",
      description: "Generate summary",
      plan: { id: "plan1", operatorId: "op1", sourceType: "initiative", sourceId: "init1" },
    };
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(step);
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (callLLM as ReturnType<typeof vi.fn>).mockResolvedValue({ content: "Summary" });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.executionStep.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null); // no next step
    (prisma.executionPlan.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await executeStep("step2");

    // Plan completed
    const planUpdate = (prisma.executionPlan.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(planUpdate[0].data.status).toBe("completed");
    expect(planUpdate[0].data.completedAt).toBeInstanceOf(Date);

    // Completion notification
    expect(sendNotificationToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ type: "system_alert", title: "Plan completed" }),
    );
  });
});

// ── advanceStep ──────────────────────────────────────────────────────────────

describe("advanceStep", () => {
  const stepBase = {
    id: "step1",
    planId: "plan1",
    sequenceOrder: 1,
    executionMode: "generate",
    title: "Test step",
    description: "Desc",
    status: "awaiting_approval",
    plan: { id: "plan1", operatorId: "op1", sourceType: "initiative", sourceId: "init1" },
  };

  it("approve — step approved, executeStep triggered", async () => {
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(stepBase) // advanceStep load
      .mockResolvedValueOnce({ ...stepBase, status: "approved" }); // executeStep load
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (callLLM as ReturnType<typeof vi.fn>).mockResolvedValue({ content: "Done" });
    (prisma.executionStep.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.executionPlan.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await advanceStep("step1", "approve", "admin1");

    // Step should have been approved
    expect(prisma.executionStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "step1" },
        data: expect.objectContaining({ status: "approved", approvedById: "admin1" }),
      }),
    );
    // callLLM should have been called (executeStep was triggered)
    expect(callLLM).toHaveBeenCalled();
  });

  it("reject — step failed, plan failed, rejection notification", async () => {
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(stepBase);
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.executionPlan.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await advanceStep("step1", "reject", "admin1");

    expect(prisma.executionStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed", errorMessage: "Rejected by user" }),
      }),
    );
    expect(prisma.executionPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "failed" } }),
    );
    expect(sendNotificationToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ type: "system_alert", title: "Plan rejected" }),
    );
  });

  it("skip — step skipped, next step advanced to awaiting_approval", async () => {
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(stepBase);
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.executionStep.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "step2", sequenceOrder: 2, title: "Next step",
    });
    (prisma.executionPlan.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await advanceStep("step1", "skip", "admin1");

    // Step skipped
    expect(prisma.executionStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "step1" },
        data: { status: "skipped" },
      }),
    );
    // Next step set to awaiting_approval
    expect(prisma.executionStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "step2" },
        data: { status: "awaiting_approval" },
      }),
    );
    // Plan advanced
    expect(prisma.executionPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { currentStepOrder: 2 },
      }),
    );
  });
});

// ── completeHumanStep ────────────────────────────────────────────────────────

describe("completeHumanStep", () => {
  it("completes step with human_completion output and advances plan", async () => {
    const step = {
      id: "step1",
      planId: "plan1",
      sequenceOrder: 1,
      executionMode: "human_task",
      status: "executing",
      assignedUserId: "user1",
      title: "Review doc",
      plan: { id: "plan1", operatorId: "op1", sourceType: "initiative", sourceId: "init1" },
    };
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(step);
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.executionStep.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "step2", sequenceOrder: 2, title: "Next",
    });
    (prisma.executionPlan.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await completeHumanStep("step1", "user1", "Looks good", ["file.pdf"]);

    const updateCall = (prisma.executionStep.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updateCall[0].data.status).toBe("completed");
    const output = JSON.parse(updateCall[0].data.outputResult);
    expect(output.type).toBe("human_completion");
    expect(output.notes).toBe("Looks good");
    expect(output.attachments).toEqual(["file.pdf"]);

    // Plan advances
    expect(prisma.executionStep.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "step2" }, data: { status: "awaiting_approval" } }),
    );

    // FollowUp cancelled
    expect(prisma.followUp.updateMany).toHaveBeenCalledWith({
      where: { executionStepId: "step1", status: "watching" },
      data: { status: "cancelled" },
    });
  });

  it("throws when wrong user tries to complete", async () => {
    const step = {
      id: "step1",
      planId: "plan1",
      sequenceOrder: 1,
      executionMode: "human_task",
      status: "executing",
      assignedUserId: "user1",
      title: "Review doc",
      plan: { id: "plan1", operatorId: "op1", sourceType: "initiative", sourceId: "init1" },
    };
    (prisma.executionStep.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(step);

    await expect(completeHumanStep("step1", "user2", "Done")).rejects.toThrow(
      "Only the assigned user can complete this task",
    );
  });
});
