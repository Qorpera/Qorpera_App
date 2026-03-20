import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    recurringTask: { findMany: vi.fn(), update: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    actionCapability: { findMany: vi.fn() },
    entity: { findFirst: vi.fn() },
    operationalInsight: { findMany: vi.fn() },
    policyRule: { findMany: vi.fn() },
    executionPlan: { findFirst: vi.fn() },
    executionStep: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
    notificationPreference: { findUnique: vi.fn() },
    notification: { create: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/ai-provider", () => ({
  callLLM: vi.fn(),
  getModel: (route: string) => `mock-${route}`,
}));

vi.mock("@/lib/notification-dispatch", () => ({
  sendNotification: vi.fn(),
  sendNotificationToAdmins: vi.fn(),
}));

vi.mock("@/lib/execution-engine", () => ({
  createExecutionPlan: vi.fn(),
  advanceStep: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { createExecutionPlan, advanceStep } from "@/lib/execution-engine";
import { processRecurringTasks, createRecurringTask, pauseRecurringTask, resumeRecurringTask } from "@/lib/recurring-tasks";

beforeEach(() => {
  vi.clearAllMocks();
  (sendNotificationToAdmins as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (createExecutionPlan as ReturnType<typeof vi.fn>).mockResolvedValue("plan1");
  (advanceStep as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

const makeTask = (overrides = {}) => ({
  id: "rt1",
  operatorId: "op1",
  aiEntityId: "ai1",
  title: "Weekly digest",
  description: "Generate weekly digest",
  cronExpression: "0 9 * * 1",
  executionPlanTemplate: JSON.stringify({
    description: "Generate weekly digest",
    contextHints: {},
  }),
  autoApproveSteps: false,
  status: "active",
  nextTriggerAt: new Date(Date.now() - 1000),
  lastTriggeredAt: null,
  createdAt: new Date(),
  ...overrides,
});

describe("processRecurringTasks", () => {
  it("triggers due task and computes next trigger", async () => {
    (prisma.recurringTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([makeTask()]);
    (prisma.recurringTask.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.actionCapability.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.operationalInsight.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.policyRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (callLLM as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: JSON.stringify([{ title: "Step 1", description: "Do thing", executionMode: "generate" }]),
    });

    const result = await processRecurringTasks();

    expect(result.triggered).toBe(1);
    expect(prisma.recurringTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastTriggeredAt: expect.any(Date), nextTriggerAt: expect.any(Date) }),
      }),
    );
  });

  it("skips tasks not yet due", async () => {
    (prisma.recurringTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await processRecurringTasks();

    expect(result.processed).toBe(0);
    expect(result.triggered).toBe(0);
  });

  it("pauses task with invalid cron expression on next trigger compute", async () => {
    // Task has valid cron for initial query but the update computes next —
    // we simulate cron-parser throwing by giving a bad expression
    const task = makeTask({ cronExpression: "invalid cron" });
    (prisma.recurringTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([task]);
    (prisma.recurringTask.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.actionCapability.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.operationalInsight.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.policyRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (callLLM as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: JSON.stringify([{ title: "Step", description: "D", executionMode: "generate" }]),
    });

    const result = await processRecurringTasks();

    expect(result.triggered).toBe(1);
    // Task paused
    expect(prisma.recurringTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "paused", nextTriggerAt: null }),
      }),
    );
  });
});

describe("executeRecurringTask", () => {
  it("calls LLM with task description and context", async () => {
    const task = makeTask();
    (prisma.recurringTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([task]);
    (prisma.recurringTask.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.actionCapability.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "cap1", name: "send_email", description: "Send email", connector: { provider: "google" } },
    ]);
    (prisma.operationalInsight.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.policyRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (callLLM as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: JSON.stringify([{ title: "Draft", description: "Draft digest", executionMode: "generate" }]),
    });

    await processRecurringTasks();

    expect(callLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringContaining("Generate weekly digest"),
        aiFunction: "reasoning",
      }),
    );
  });

  it("creates execution plan from reasoning output", async () => {
    const task = makeTask();
    (prisma.recurringTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([task]);
    (prisma.recurringTask.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.actionCapability.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.operationalInsight.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.policyRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (callLLM as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: JSON.stringify([
        { title: "S1", description: "D1", executionMode: "generate" },
        { title: "S2", description: "D2", executionMode: "human_task" },
      ]),
    });

    await processRecurringTasks();

    expect(createExecutionPlan).toHaveBeenCalledWith(
      "op1", "recurring", "rt1",
      expect.arrayContaining([
        expect.objectContaining({ title: "S1", executionMode: "generate" }),
        expect.objectContaining({ title: "S2", executionMode: "human_task" }),
      ]),
    );
  });

  it("auto-approves steps when autoApproveSteps is true", async () => {
    const task = makeTask({ autoApproveSteps: true });
    (prisma.recurringTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([task]);
    (prisma.recurringTask.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.actionCapability.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.operationalInsight.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.policyRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (callLLM as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: JSON.stringify([{ title: "S", description: "D", executionMode: "generate" }]),
    });
    (prisma.executionPlan.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      steps: [{ id: "step1" }],
    });

    await processRecurringTasks();

    expect(advanceStep).toHaveBeenCalledWith("step1", "approve", "system");
  });

  it("leaves plan for approval when autoApproveSteps is false", async () => {
    const task = makeTask({ autoApproveSteps: false });
    (prisma.recurringTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([task]);
    (prisma.recurringTask.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.actionCapability.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.operationalInsight.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.policyRule.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (callLLM as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: JSON.stringify([{ title: "S", description: "D", executionMode: "generate" }]),
    });

    await processRecurringTasks();

    expect(advanceStep).not.toHaveBeenCalled();
    expect(sendNotificationToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("plan ready for review") }),
    );
  });
});

describe("CRUD helpers", () => {
  it("createRecurringTask: validates cron expression", async () => {
    (prisma.recurringTask.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "rt1", nextTriggerAt: new Date(),
    });

    const result = await createRecurringTask({
      operatorId: "op1",
      aiEntityId: "ai1",
      title: "Test",
      description: "Test task",
      cronExpression: "0 9 * * 1",
    });

    expect(prisma.recurringTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cronExpression: "0 9 * * 1",
          nextTriggerAt: expect.any(Date),
        }),
      }),
    );
    expect(result).toBeDefined();
  });

  it("createRecurringTask: rejects invalid cron expression", async () => {
    await expect(createRecurringTask({
      operatorId: "op1",
      aiEntityId: "ai1",
      title: "Test",
      description: "Test",
      cronExpression: "not valid",
    })).rejects.toThrow();
  });

  it("pauseRecurringTask: sets status to paused and clears nextTriggerAt", async () => {
    (prisma.recurringTask.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "rt1", status: "paused", nextTriggerAt: null,
    });

    await pauseRecurringTask("rt1");

    expect(prisma.recurringTask.update).toHaveBeenCalledWith({
      where: { id: "rt1" },
      data: { status: "paused", nextTriggerAt: null },
    });
  });

  it("resumeRecurringTask: recomputes nextTriggerAt from now", async () => {
    (prisma.recurringTask.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "rt1", cronExpression: "0 9 * * 1",
    });
    (prisma.recurringTask.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "rt1", status: "active",
    });

    await resumeRecurringTask("rt1");

    expect(prisma.recurringTask.update).toHaveBeenCalledWith({
      where: { id: "rt1" },
      data: expect.objectContaining({ status: "active", nextTriggerAt: expect.any(Date) }),
    });
  });
});
