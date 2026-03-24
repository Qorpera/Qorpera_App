vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/stripe", () => ({
  stripe: null,
  isStripeEnabled: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/notification-dispatch", () => ({
  sendNotificationToAdmins: vi.fn().mockResolvedValue(undefined),
}));

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { emitSituationBillingEvent, emitCopilotBillingEvent } from "@/lib/billing-events";

const mockPrisma = prisma as unknown as {
  situation: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  operator: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  creditTransaction: { create: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.situation = {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  };
  mockPrisma.operator = {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({ balanceCents: 100, autoReloadEnabled: false, stripePaymentMethodId: null, autoReloadAmountCents: 2500, autoReloadThresholdCents: 500, stripeCustomerId: null }),
  };
  mockPrisma.creditTransaction = {
    create: vi.fn().mockResolvedValue({}),
    aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: 0 } }),
  };
});

// ── Situation Billing Event ─────────────────────────────────────────────────

describe("emitSituationBillingEvent", () => {
  it("active operator → calculates fee, records billedCents, deducts balance", async () => {
    const thirtyOneDaysAgo = new Date();
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

    mockPrisma.situation.findUnique.mockResolvedValue({
      id: "sit1",
      operatorId: "op1",
      apiCostCents: 100,
      situationType: { autonomyLevel: "supervised", name: "Test Type" },
      executionPlan: {
        steps: [{ apiCostCents: 20 }, { apiCostCents: 30 }],
      },
    });
    mockPrisma.operator.findUnique.mockResolvedValue({
      id: "op1",
      billingStatus: "active",
      billingStartedAt: thirtyOneDaysAgo, // >30 days → multiplier 1.0
      stripeCustomerId: "cus_test",
      balanceCents: 1000,
      autoReloadEnabled: false,
      stripePaymentMethodId: null,
      autoReloadAmountCents: 2500,
      autoReloadThresholdCents: 500,
      monthlyBudgetCents: null,
      budgetHardStop: false,
      budgetPeriodStart: null,
    });

    await emitSituationBillingEvent("sit1");

    // Total API cost = 100 + 20 + 30 = 150
    // supervised (1.5) * multiplier (1.0) = 1.5 fee
    // 150 * (1 + 1.5) = 375 cents billed
    expect(mockPrisma.situation.update).toHaveBeenCalledWith({
      where: { id: "sit1" },
      data: { billedCents: 375, billedAt: expect.any(Date) },
    });

    // Balance deduction
    expect(mockPrisma.operator.update).toHaveBeenCalledWith({
      where: { id: "op1" },
      data: { balanceCents: { decrement: 375 } },
    });

    // CreditTransaction created
    expect(mockPrisma.creditTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operatorId: "op1",
        type: "situation_deduction",
        amountCents: -375,
        situationId: "sit1",
      }),
    });
  });

  it("free operator → does nothing", async () => {
    mockPrisma.situation.findUnique.mockResolvedValue({
      id: "sit2",
      operatorId: "op2",
      apiCostCents: 100,
      situationType: { autonomyLevel: "supervised", name: "Test" },
      executionPlan: null,
    });
    mockPrisma.operator.findUnique.mockResolvedValue({
      id: "op2",
      billingStatus: "free",
      billingStartedAt: null,
      stripeCustomerId: null,
    });

    await emitSituationBillingEvent("sit2");

    expect(mockPrisma.situation.update).not.toHaveBeenCalled();
    expect(mockPrisma.creditTransaction.create).not.toHaveBeenCalled();
  });

  it("zero API cost → does not deduct", async () => {
    const thirtyOneDaysAgo = new Date();
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

    mockPrisma.situation.findUnique.mockResolvedValue({
      id: "sit3",
      operatorId: "op1",
      apiCostCents: 0,
      situationType: { autonomyLevel: "supervised", name: "Test" },
      executionPlan: { steps: [] },
    });
    mockPrisma.operator.findUnique.mockResolvedValue({
      id: "op1",
      billingStatus: "active",
      billingStartedAt: thirtyOneDaysAgo,
      stripeCustomerId: "cus_test",
    });

    await emitSituationBillingEvent("sit3");

    expect(mockPrisma.situation.update).not.toHaveBeenCalled();
    expect(mockPrisma.creditTransaction.create).not.toHaveBeenCalled();
  });
});

// ── Copilot Billing Event ───────────────────────────────────────────────────

describe("emitCopilotBillingEvent", () => {
  it("active operator → deducts balance", async () => {
    const thirtyOneDaysAgo = new Date();
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

    mockPrisma.operator.findUnique.mockResolvedValue({
      id: "op1",
      billingStatus: "active",
      billingStartedAt: thirtyOneDaysAgo,
      stripeCustomerId: "cus_test",
      balanceCents: 1000,
      autoReloadEnabled: false,
      stripePaymentMethodId: null,
      autoReloadAmountCents: 2500,
      autoReloadThresholdCents: 500,
      monthlyBudgetCents: null,
      budgetHardStop: false,
      budgetPeriodStart: null,
    });

    await emitCopilotBillingEvent({ apiCostCents: 100, operatorId: "op1" });

    // 100 * (1 + 1.5 * 1.0) = 250
    expect(mockPrisma.operator.update).toHaveBeenCalledWith({
      where: { id: "op1" },
      data: { balanceCents: { decrement: 250 } },
    });
  });

  it("free operator → does not deduct", async () => {
    mockPrisma.operator.findUnique.mockResolvedValue({
      id: "op2",
      billingStatus: "free",
      billingStartedAt: null,
      stripeCustomerId: null,
    });

    await emitCopilotBillingEvent({ apiCostCents: 100, operatorId: "op2" });

    expect(mockPrisma.creditTransaction.create).not.toHaveBeenCalled();
  });

  it("zero cost → does not deduct", async () => {
    await emitCopilotBillingEvent({ apiCostCents: 0, operatorId: "op1" });
    expect(mockPrisma.operator.findUnique).not.toHaveBeenCalled();
  });
});

// ── Ramp-up (computed multiplier) ───────────────────────────────────────────

describe("getOrchestrationFeeMultiplier", () => {
  it("operator with billingStartedAt 31 days ago → returns 1.0", async () => {
    const { getOrchestrationFeeMultiplier } = await import("@/lib/billing/balance");
    const thirtyOneDaysAgo = new Date();
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);
    expect(getOrchestrationFeeMultiplier({ billingStartedAt: thirtyOneDaysAgo })).toBe(1.0);
  });

  it("operator with billingStartedAt 15 days ago → returns 0.5", async () => {
    const { getOrchestrationFeeMultiplier } = await import("@/lib/billing/balance");
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    expect(getOrchestrationFeeMultiplier({ billingStartedAt: fifteenDaysAgo })).toBe(0.5);
  });

  it("no billingStartedAt → returns 0.5", async () => {
    const { getOrchestrationFeeMultiplier } = await import("@/lib/billing/balance");
    expect(getOrchestrationFeeMultiplier({ billingStartedAt: null })).toBe(0.5);
  });
});
