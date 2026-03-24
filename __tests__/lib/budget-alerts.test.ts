vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/notification-dispatch", () => ({
  sendNotificationToAdmins: vi.fn().mockResolvedValue(undefined),
}));

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { checkBudgetAlerts } from "@/lib/billing-events";

const mockPrisma = prisma as unknown as {
  operator: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  situation: { aggregate: ReturnType<typeof vi.fn> };
  copilotMessage: { aggregate: ReturnType<typeof vi.fn> };
};

const mockSendNotification = sendNotificationToAdmins as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.operator = {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  };
  mockPrisma.situation = {
    aggregate: vi.fn().mockResolvedValue({ _sum: { billedCents: 0 } }),
  };
  mockPrisma.copilotMessage = {
    aggregate: vi.fn().mockResolvedValue({ _sum: { apiCostCents: 0 } }),
  };
});

describe("checkBudgetAlerts", () => {
  it("fires alert when threshold reached", async () => {
    mockPrisma.operator.findUnique.mockResolvedValue({
      monthlyBudgetCents: 10000,
      budgetAlertThresholds: [80, 100],
      budgetAlertsSentThisPeriod: [],
      budgetPeriodStart: new Date(),
    });
    // 80% of 10000 = 8000
    mockPrisma.situation.aggregate.mockResolvedValue({ _sum: { billedCents: 7500 } });
    mockPrisma.copilotMessage.aggregate.mockResolvedValue({ _sum: { apiCostCents: 600 } });

    await checkBudgetAlerts("op1");

    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: "op1",
        type: "system_alert",
        body: expect.stringContaining("80%"),
      }),
    );
    expect(mockPrisma.operator.update).toHaveBeenCalledWith({
      where: { id: "op1" },
      data: { budgetAlertsSentThisPeriod: [80] },
    });
  });

  it("does not re-fire already-sent thresholds", async () => {
    mockPrisma.operator.findUnique.mockResolvedValue({
      monthlyBudgetCents: 10000,
      budgetAlertThresholds: [80, 100],
      budgetAlertsSentThisPeriod: [80],
      budgetPeriodStart: new Date(),
    });
    // 85% — 80 already sent, 100 not reached
    mockPrisma.situation.aggregate.mockResolvedValue({ _sum: { billedCents: 8500 } });
    mockPrisma.copilotMessage.aggregate.mockResolvedValue({ _sum: { apiCostCents: 0 } });

    await checkBudgetAlerts("op1");

    expect(mockSendNotification).not.toHaveBeenCalled();
    expect(mockPrisma.operator.update).not.toHaveBeenCalled();
  });

  it("fires multiple thresholds at once", async () => {
    mockPrisma.operator.findUnique.mockResolvedValue({
      monthlyBudgetCents: 10000,
      budgetAlertThresholds: [50, 80, 100],
      budgetAlertsSentThisPeriod: [],
      budgetPeriodStart: new Date(),
    });
    // 100% reached
    mockPrisma.situation.aggregate.mockResolvedValue({ _sum: { billedCents: 10000 } });
    mockPrisma.copilotMessage.aggregate.mockResolvedValue({ _sum: { apiCostCents: 0 } });

    await checkBudgetAlerts("op1");

    expect(mockSendNotification).toHaveBeenCalledTimes(3);
    expect(mockPrisma.operator.update).toHaveBeenCalledWith({
      where: { id: "op1" },
      data: { budgetAlertsSentThisPeriod: [50, 80, 100] },
    });
  });

  it("returns early when no budget set", async () => {
    mockPrisma.operator.findUnique.mockResolvedValue({
      monthlyBudgetCents: null,
      budgetAlertThresholds: null,
      budgetAlertsSentThisPeriod: null,
      budgetPeriodStart: null,
    });

    await checkBudgetAlerts("op1");

    expect(mockSendNotification).not.toHaveBeenCalled();
    expect(mockPrisma.situation.aggregate).not.toHaveBeenCalled();
  });

  it("handles empty thresholds array", async () => {
    mockPrisma.operator.findUnique.mockResolvedValue({
      monthlyBudgetCents: 10000,
      budgetAlertThresholds: [],
      budgetAlertsSentThisPeriod: [],
      budgetPeriodStart: new Date(),
    });
    mockPrisma.situation.aggregate.mockResolvedValue({ _sum: { billedCents: 9000 } });
    mockPrisma.copilotMessage.aggregate.mockResolvedValue({ _sum: { apiCostCents: 0 } });

    await checkBudgetAlerts("op1");

    expect(mockSendNotification).not.toHaveBeenCalled();
    expect(mockPrisma.operator.update).not.toHaveBeenCalled();
  });
});
