import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    followUp: { findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    activitySignal: { findFirst: vi.fn() },
    entity: { findUnique: vi.fn() },
    propertyValue: { findFirst: vi.fn() },
    executionStep: { update: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    executionPlan: { update: vi.fn(), findFirst: vi.fn() },
    user: { findFirst: vi.fn(), findMany: vi.fn() },
    userScope: { findMany: vi.fn(), findFirst: vi.fn() },
    notificationPreference: { findUnique: vi.fn() },
    notification: { create: vi.fn() },
  },
}));

vi.mock("@/lib/notification-dispatch", () => ({
  sendNotification: vi.fn(),
  sendNotificationToAdmins: vi.fn(),
}));

vi.mock("@/lib/execution-engine", () => ({
  advancePlanAfterStep: vi.fn(),
  createExecutionPlan: vi.fn(),
}));

vi.mock("@/lib/business-days", async () => {
  const actual = await vi.importActual("@/lib/business-days");
  return actual;
});

import { prisma } from "@/lib/db";
import { sendNotification, sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { advancePlanAfterStep, createExecutionPlan } from "@/lib/execution-engine";
import { processFollowUps } from "@/lib/follow-up-scheduler";

const basePlan = { id: "plan1", operatorId: "op1", sourceType: "situation", sourceId: "sit1" };
const baseStep = {
  id: "step1", planId: "plan1", sequenceOrder: 1, title: "Review",
  description: "Review doc", status: "executing", assignedUserId: "user1",
  plan: basePlan,
};

function makeFollowUp(overrides: Record<string, unknown> = {}) {
  return {
    id: "fu1",
    operatorId: "op1",
    executionStepId: "step1",
    situationId: "sit1",
    triggerCondition: JSON.stringify({ type: "timeout", businessDays: 3 }),
    fallbackAction: JSON.stringify({ type: "escalate", targetUserId: "admin1" }),
    status: "watching",
    triggerAt: new Date(Date.now() - 1000), // past
    reminderSent: false,
    triggeredAt: null,
    executionStep: baseStep,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (sendNotification as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (sendNotificationToAdmins as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (advancePlanAfterStep as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (createExecutionPlan as ReturnType<typeof vi.fn>).mockResolvedValue("plan2");
});

describe("processFollowUps — timeout", () => {
  it("triggers timeout follow-up when triggerAt has passed", async () => {
    const fu = makeFollowUp();
    (prisma.followUp.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([fu]);
    (prisma.followUp.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await processFollowUps();

    expect(result.triggered).toBe(1);
    expect(prisma.followUp.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "fu1", status: "watching" },
        data: expect.objectContaining({ status: "triggered" }),
      }),
    );
  });

  it("sends reminder notification 1 business day before timeout", async () => {
    // triggerAt is 1 business day from now (tomorrow if weekday)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    // Adjust for weekend
    while (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) {
      tomorrow.setDate(tomorrow.getDate() + 1);
    }

    const fu = makeFollowUp({
      triggerAt: tomorrow,
      reminderSent: false,
    });
    (prisma.followUp.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([fu]);
    (prisma.followUp.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    const result = await processFollowUps();

    expect(result.reminders).toBe(1);
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "follow_up_reminder",
        userId: "user1",
      }),
    );
  });

  it("does not send reminder twice (reminderSent flag)", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    while (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) {
      tomorrow.setDate(tomorrow.getDate() + 1);
    }

    const fu = makeFollowUp({
      triggerAt: tomorrow,
      reminderSent: true,
    });
    (prisma.followUp.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([fu]);

    const result = await processFollowUps();

    expect(result.reminders).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("processFollowUps — response_received", () => {
  it("cancels response_received follow-up when signal found", async () => {
    const fu = makeFollowUp({
      triggerCondition: JSON.stringify({
        type: "response_received",
        watchedEntityId: "ent1",
        afterTimestamp: "2026-01-01T00:00:00Z",
      }),
      triggerAt: null,
    });
    (prisma.followUp.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([fu]);
    (prisma.activitySignal.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "sig1" });
    (prisma.followUp.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    const result = await processFollowUps();

    expect(result.triggered).toBe(1);
    expect(prisma.followUp.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "cancelled" }),
      }),
    );
  });

  it("continues watching response_received when no signal", async () => {
    const fu = makeFollowUp({
      triggerCondition: JSON.stringify({
        type: "response_received",
        watchedEntityId: "ent1",
        afterTimestamp: "2026-01-01T00:00:00Z",
      }),
      triggerAt: null,
    });
    (prisma.followUp.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([fu]);
    (prisma.activitySignal.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await processFollowUps();

    expect(result.triggered).toBe(0);
    expect(prisma.followUp.updateMany).not.toHaveBeenCalled();
  });
});

describe("processFollowUps — property_change", () => {
  it("triggers property_change follow-up when condition met", async () => {
    const fu = makeFollowUp({
      triggerCondition: JSON.stringify({
        type: "property_change",
        entityId: "ent1",
        propertyName: "status",
        expectedValue: "paid",
      }),
      triggerAt: null,
    });
    (prisma.followUp.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([fu]);
    (prisma.entity.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ entityTypeId: "et1" });
    (prisma.propertyValue.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ value: "paid" });
    (prisma.followUp.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await processFollowUps();

    expect(result.triggered).toBe(1);
  });

  it("continues watching property_change when condition not met", async () => {
    const fu = makeFollowUp({
      triggerCondition: JSON.stringify({
        type: "property_change",
        entityId: "ent1",
        propertyName: "status",
        expectedValue: "paid",
      }),
      triggerAt: null,
    });
    (prisma.followUp.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([fu]);
    (prisma.entity.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ entityTypeId: "et1" });
    (prisma.propertyValue.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ value: "pending" });

    const result = await processFollowUps();

    expect(result.triggered).toBe(0);
  });
});

describe("executeFallbackAction", () => {
  it("escalate reassigns step and notifies", async () => {
    const fu = makeFollowUp({
      fallbackAction: JSON.stringify({ type: "escalate", targetUserId: "admin1" }),
    });
    (prisma.followUp.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([fu]);
    (prisma.followUp.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await processFollowUps();

    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "follow_up_triggered", userId: "admin1" }),
    );
    expect(prisma.executionStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "step1" },
        data: { assignedUserId: "admin1" },
      }),
    );
  });

  it("notify sends notification without reassignment", async () => {
    const fu = makeFollowUp({
      fallbackAction: JSON.stringify({ type: "notify", targetUserId: "admin1" }),
    });
    (prisma.followUp.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([fu]);
    (prisma.followUp.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    await processFollowUps();

    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "follow_up_triggered" }),
    );
    // No step reassignment
    expect(prisma.executionStep.update).not.toHaveBeenCalled();
  });

  it("skip_step advances plan past the step", async () => {
    const fu = makeFollowUp({
      fallbackAction: JSON.stringify({ type: "skip_step" }),
    });
    (prisma.followUp.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([fu]);
    (prisma.followUp.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    (prisma.executionStep.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await processFollowUps();

    expect(prisma.executionStep.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "skipped" } }),
    );
    expect(advancePlanAfterStep).toHaveBeenCalledWith("step1", "plan1", 1, "op1");
  });

  it("create_plan creates new execution plan", async () => {
    const fu = makeFollowUp({
      fallbackAction: JSON.stringify({
        type: "create_plan",
        steps: [{ title: "New", description: "New step", executionMode: "generate" }],
      }),
    });
    (prisma.followUp.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([fu]);
    (prisma.followUp.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    await processFollowUps();

    expect(createExecutionPlan).toHaveBeenCalledWith(
      "op1", "situation", "sit1",
      expect.arrayContaining([expect.objectContaining({ title: "New" })]),
    );
  });

  it("failure sends system_alert to admins", async () => {
    const fu = makeFollowUp({
      fallbackAction: "{ invalid json",
    });
    (prisma.followUp.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([fu]);
    (prisma.followUp.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    const result = await processFollowUps();

    // The fallback parse error is caught, sends admin notification
    expect(sendNotificationToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ type: "system_alert", title: "Follow-up fallback failed" }),
    );
    // The outer loop counted it as triggered (status was set), not as an error
    expect(result.triggered).toBe(1);
  });
});
