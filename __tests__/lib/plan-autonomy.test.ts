import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    executionStep: { findMany: vi.fn() },
    planAutonomy: { upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    situation: { findUnique: vi.fn() },
    entity: { findUnique: vi.fn(), findFirst: vi.fn() },
    idea: { findUnique: vi.fn() },
    recurringTask: { findUnique: vi.fn() },
    delegation: { findUnique: vi.fn() },
    notificationPreference: { findUnique: vi.fn() },
    notification: { create: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/notification-dispatch", () => ({
  sendNotification: vi.fn(),
  sendNotificationToAdmins: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import {
  computePlanPatternHash,
  recordPlanCompletion,
  recordPlanRejection,
  shouldAutoApprovePlan,
} from "@/lib/plan-autonomy";

beforeEach(() => {
  vi.clearAllMocks();
  (sendNotificationToAdmins as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

const basePlan = { id: "plan1", operatorId: "op1", sourceType: "idea", sourceId: "init1" };
const baseSteps = [
  { title: "Step A", executionMode: "action" },
  { title: "Step B", executionMode: "generate" },
];

describe("computePlanPatternHash", () => {
  it("same steps produce same hash", () => {
    const hash1 = computePlanPatternHash(baseSteps);
    const hash2 = computePlanPatternHash([...baseSteps]);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA256 hex
  });

  it("different step order produces different hash", () => {
    const hash1 = computePlanPatternHash(baseSteps);
    const hash2 = computePlanPatternHash([baseSteps[1], baseSteps[0]]);
    expect(hash1).not.toBe(hash2);
  });

  it("different modes produce different hash", () => {
    const hash1 = computePlanPatternHash(baseSteps);
    const hash2 = computePlanPatternHash([
      { title: "Step A", executionMode: "generate" },
      { title: "Step B", executionMode: "generate" },
    ]);
    expect(hash1).not.toBe(hash2);
  });
});

describe("recordPlanCompletion", () => {
  it("creates PlanAutonomy record on first completion", async () => {
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(baseSteps);
    (prisma.idea.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ aiEntityId: "ai1" });
    (prisma.planAutonomy.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "pa1", consecutiveApprovals: 1, autoApproved: false,
    });

    await recordPlanCompletion(basePlan);

    expect(prisma.planAutonomy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          aiEntityId: "ai1",
          consecutiveApprovals: 1,
          autoApproved: false,
        }),
        update: { consecutiveApprovals: { increment: 1 } },
      }),
    );
  });

  it("increments consecutiveApprovals on subsequent completions", async () => {
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(baseSteps);
    (prisma.idea.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ aiEntityId: "ai1" });
    (prisma.planAutonomy.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "pa1", consecutiveApprovals: 5, autoApproved: false,
    });

    await recordPlanCompletion(basePlan);

    expect(prisma.planAutonomy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { consecutiveApprovals: { increment: 1 } },
      }),
    );
    // Should not graduate at 5
    expect(prisma.planAutonomy.update).not.toHaveBeenCalled();
  });

  it("graduates to autoApproved at 20 consecutive approvals", async () => {
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(baseSteps);
    (prisma.idea.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ aiEntityId: "ai1" });
    (prisma.planAutonomy.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "pa1", consecutiveApprovals: 20, autoApproved: false,
    });
    (prisma.planAutonomy.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await recordPlanCompletion(basePlan);

    expect(prisma.planAutonomy.update).toHaveBeenCalledWith({
      where: { id: "pa1" },
      data: { autoApproved: true },
    });
  });

  it("sends notification on graduation", async () => {
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(baseSteps);
    (prisma.idea.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ aiEntityId: "ai1" });
    (prisma.planAutonomy.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "pa1", consecutiveApprovals: 20, autoApproved: false,
    });
    (prisma.planAutonomy.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await recordPlanCompletion(basePlan);

    expect(sendNotificationToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "plan_auto_executed",
        title: "Plan pattern graduated to auto-execution",
      }),
    );
  });
});

describe("recordPlanRejection", () => {
  it("resets consecutiveApprovals to 0", async () => {
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(baseSteps);
    (prisma.idea.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ aiEntityId: "ai1" });
    (prisma.planAutonomy.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    await recordPlanRejection(basePlan);

    expect(prisma.planAutonomy.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ aiEntityId: "ai1" }),
      data: { consecutiveApprovals: 0, autoApproved: false },
    });
  });

  it("sets autoApproved back to false", async () => {
    (prisma.executionStep.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(baseSteps);
    (prisma.idea.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ aiEntityId: "ai1" });
    (prisma.planAutonomy.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    await recordPlanRejection(basePlan);

    const call = (prisma.planAutonomy.updateMany as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0].data.autoApproved).toBe(false);
  });
});

describe("shouldAutoApprovePlan", () => {
  const stepDefs = [
    { title: "Step A", description: "D", executionMode: "action" as const },
    { title: "Step B", description: "D", executionMode: "generate" as const },
  ];

  it("returns true for graduated pattern", async () => {
    (prisma.planAutonomy.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      autoApproved: true,
    });

    const result = await shouldAutoApprovePlan("ai1", stepDefs);
    expect(result).toBe(true);
  });

  it("returns false for non-graduated pattern", async () => {
    (prisma.planAutonomy.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      autoApproved: false,
    });

    const result = await shouldAutoApprovePlan("ai1", stepDefs);
    expect(result).toBe(false);
  });

  it("returns false for unknown pattern", async () => {
    (prisma.planAutonomy.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await shouldAutoApprovePlan("ai1", stepDefs);
    expect(result).toBe(false);
  });
});
