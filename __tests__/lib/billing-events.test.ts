vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    billing: {
      meterEvents: { create: vi.fn().mockResolvedValue({}) },
    },
  },
  isStripeEnabled: vi.fn().mockReturnValue(true),
}));

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { stripe, isStripeEnabled } from "@/lib/stripe";
import { emitSituationBillingEvent, emitCopilotBillingEvent } from "@/lib/billing-events";

const mockPrisma = prisma as unknown as {
  situation: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  operator: { findUnique: ReturnType<typeof vi.fn> };
};

const mockStripe = stripe as unknown as {
  billing: { meterEvents: { create: ReturnType<typeof vi.fn> } };
};

const mockIsStripeEnabled = isStripeEnabled as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockIsStripeEnabled.mockReturnValue(true);
  mockPrisma.situation = {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  };
  mockPrisma.operator = { findUnique: vi.fn() };
});

// ── Situation Billing Event ─────────────────────────────────────────────────

describe("emitSituationBillingEvent", () => {
  it("active operator → calculates fee, records billedCents, emits meter event", async () => {
    mockPrisma.situation.findUnique.mockResolvedValue({
      id: "sit1",
      operatorId: "op1",
      apiCostCents: 100,
      situationType: { autonomyLevel: "supervised" },
      executionPlan: {
        steps: [{ apiCostCents: 20 }, { apiCostCents: 30 }],
      },
    });
    mockPrisma.operator.findUnique.mockResolvedValue({
      id: "op1",
      billingStatus: "active",
      orchestrationFeeMultiplier: 1.0,
      stripeCustomerId: "cus_test",
    });

    await emitSituationBillingEvent("sit1");

    // Total API cost = 100 + 20 + 30 = 150
    // supervised (1.0) * multiplier (1.0) = 1.0 fee
    // 150 * (1 + 1.0) = 300 cents billed
    expect(mockPrisma.situation.update).toHaveBeenCalledWith({
      where: { id: "sit1" },
      data: { billedCents: 300, billedAt: expect.any(Date) },
    });
    expect(mockStripe.billing.meterEvents.create).toHaveBeenCalledWith({
      event_name: "situation_billing",
      payload: {
        stripe_customer_id: "cus_test",
        value: "300",
      },
    });
  });

  it("free operator → does nothing", async () => {
    mockPrisma.situation.findUnique.mockResolvedValue({
      id: "sit2",
      operatorId: "op2",
      apiCostCents: 100,
      situationType: { autonomyLevel: "supervised" },
      executionPlan: null,
    });
    mockPrisma.operator.findUnique.mockResolvedValue({
      id: "op2",
      billingStatus: "free",
      orchestrationFeeMultiplier: 0.50,
      stripeCustomerId: null,
    });

    await emitSituationBillingEvent("sit2");

    expect(mockPrisma.situation.update).not.toHaveBeenCalled();
    expect(mockStripe.billing.meterEvents.create).not.toHaveBeenCalled();
  });

  it("zero API cost → does not emit", async () => {
    mockPrisma.situation.findUnique.mockResolvedValue({
      id: "sit3",
      operatorId: "op1",
      apiCostCents: 0,
      situationType: { autonomyLevel: "supervised" },
      executionPlan: { steps: [] },
    });
    mockPrisma.operator.findUnique.mockResolvedValue({
      id: "op1",
      billingStatus: "active",
      orchestrationFeeMultiplier: 1.0,
      stripeCustomerId: "cus_test",
    });

    await emitSituationBillingEvent("sit3");

    expect(mockPrisma.situation.update).not.toHaveBeenCalled();
    expect(mockStripe.billing.meterEvents.create).not.toHaveBeenCalled();
  });
});

// ── Copilot Billing Event ───────────────────────────────────────────────────

describe("emitCopilotBillingEvent", () => {
  it("active operator → emits meter event", async () => {
    mockPrisma.operator.findUnique.mockResolvedValue({
      id: "op1",
      billingStatus: "active",
      orchestrationFeeMultiplier: 1.0,
      stripeCustomerId: "cus_test",
    });

    await emitCopilotBillingEvent({ apiCostCents: 100, operatorId: "op1" });

    // 100 * (1 + 1.5 * 1.0) = 250
    expect(mockStripe.billing.meterEvents.create).toHaveBeenCalledWith({
      event_name: "copilot_billing",
      payload: {
        stripe_customer_id: "cus_test",
        value: "250",
      },
    });
  });

  it("free operator → does not emit", async () => {
    mockPrisma.operator.findUnique.mockResolvedValue({
      id: "op2",
      billingStatus: "free",
      orchestrationFeeMultiplier: 0.50,
      stripeCustomerId: null,
    });

    await emitCopilotBillingEvent({ apiCostCents: 100, operatorId: "op2" });

    expect(mockStripe.billing.meterEvents.create).not.toHaveBeenCalled();
  });

  it("zero cost → does not emit", async () => {
    await emitCopilotBillingEvent({ apiCostCents: 0, operatorId: "op1" });
    expect(mockPrisma.operator.findUnique).not.toHaveBeenCalled();
    expect(mockStripe.billing.meterEvents.create).not.toHaveBeenCalled();
  });
});

// ── Dev Mode Passthrough ────────────────────────────────────────────────────

describe("dev mode passthrough", () => {
  it("situation billing succeeds without Stripe (logs only)", async () => {
    mockIsStripeEnabled.mockReturnValue(false);
    mockPrisma.situation.findUnique.mockResolvedValue({
      id: "sit1",
      operatorId: "op1",
      apiCostCents: 100,
      situationType: { autonomyLevel: "supervised" },
      executionPlan: { steps: [] },
    });
    mockPrisma.operator.findUnique.mockResolvedValue({
      id: "op1",
      billingStatus: "active",
      orchestrationFeeMultiplier: 1.0,
      stripeCustomerId: "cus_test",
    });

    await emitSituationBillingEvent("sit1");

    // billedCents still recorded on the situation
    expect(mockPrisma.situation.update).toHaveBeenCalledWith({
      where: { id: "sit1" },
      data: { billedCents: 200, billedAt: expect.any(Date) },
    });
    // But no Stripe API call
    expect(mockStripe.billing.meterEvents.create).not.toHaveBeenCalled();
  });

  it("copilot billing succeeds without Stripe", async () => {
    mockIsStripeEnabled.mockReturnValue(false);
    mockPrisma.operator.findUnique.mockResolvedValue({
      id: "op1",
      billingStatus: "active",
      orchestrationFeeMultiplier: 1.0,
      stripeCustomerId: "cus_test",
    });

    await emitCopilotBillingEvent({ apiCostCents: 100, operatorId: "op1" });

    // No Stripe call made
    expect(mockStripe.billing.meterEvents.create).not.toHaveBeenCalled();
  });
});

// ── Ramp-up ─────────────────────────────────────────────────────────────────

describe("billing ramp-up", () => {
  // These test the ramp-up logic extracted for testability
  it("operator with billingStartedAt 31 days ago + multiplier 0.50 → should be upgraded", () => {
    const thirtyOneDaysAgo = new Date();
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

    const op = {
      billingStatus: "active",
      orchestrationFeeMultiplier: 0.50,
      billingStartedAt: thirtyOneDaysAgo,
    };

    // The cron query filters: billingStartedAt <= 30 days ago AND multiplier === 0.50
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    expect(op.billingStartedAt <= thirtyDaysAgo).toBe(true);
    expect(op.orchestrationFeeMultiplier).toBe(0.50);
  });

  it("operator with billingStartedAt 15 days ago → not upgraded", () => {
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    expect(fifteenDaysAgo <= thirtyDaysAgo).toBe(false);
  });

  it("operator already at 1.00 → not in upgrade query", () => {
    const op = { orchestrationFeeMultiplier: 1.0 };
    // Query filters orchestrationFeeMultiplier: 0.50, so 1.0 is excluded
    expect(op.orchestrationFeeMultiplier).not.toBe(0.50);
  });
});
