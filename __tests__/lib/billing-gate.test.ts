import { describe, it, expect } from "vitest";
import { checkBillingGate, checkCopilotBudget, checkDetectionCap, checkBudgetGate } from "@/lib/billing-gate";

// ── checkBillingGate ────────────────────────────────────────────────────────

describe("checkBillingGate", () => {
  it("active → allowed", () => {
    const result = checkBillingGate({ billingStatus: "active" });
    expect(result.allowed).toBe(true);
  });

  it("free → not allowed, correct reason", () => {
    const result = checkBillingGate({ billingStatus: "free" });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("BILLING_REQUIRED");
      expect(result.reason).toContain("Add credits");
    }
  });

  it("depleted → not allowed, correct reason", () => {
    const result = checkBillingGate({ billingStatus: "depleted" });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("BILLING_REQUIRED");
      expect(result.reason).toContain("balance is empty");
    }
  });

  it("past_due → not allowed, correct reason", () => {
    const result = checkBillingGate({ billingStatus: "past_due" });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("BILLING_REQUIRED");
      expect(result.reason).toContain("payment");
    }
  });

  it("cancelled → not allowed", () => {
    const result = checkBillingGate({ billingStatus: "cancelled" });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("BILLING_REQUIRED");
    }
  });
});

// ── checkCopilotBudget ──────────────────────────────────────────────────────

describe("checkCopilotBudget", () => {
  it("free user with budget remaining → allowed", () => {
    const result = checkCopilotBudget({
      billingStatus: "free",
      freeCopilotUsedCents: 200,
      freeCopilotBudgetCents: 500,
    });
    expect(result.allowed).toBe(true);
  });

  it("free user at budget limit → not allowed, correct code", () => {
    const result = checkCopilotBudget({
      billingStatus: "free",
      freeCopilotUsedCents: 500,
      freeCopilotBudgetCents: 500,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("COPILOT_BUDGET_EXHAUSTED");
      expect(result.reason).toContain("Add credits");
    }
  });

  it("free user over budget → not allowed", () => {
    const result = checkCopilotBudget({
      billingStatus: "free",
      freeCopilotUsedCents: 600,
      freeCopilotBudgetCents: 500,
    });
    expect(result.allowed).toBe(false);
  });

  it("active user → always allowed regardless of freeCopilotUsedCents", () => {
    const result = checkCopilotBudget({
      billingStatus: "active",
      freeCopilotUsedCents: 9999,
      freeCopilotBudgetCents: 500,
    });
    expect(result.allowed).toBe(true);
  });
});

// ── checkDetectionCap ───────────────────────────────────────────────────────

describe("checkDetectionCap", () => {
  it("free user with 0 situations, no start date → allowed", () => {
    const result = checkDetectionCap({
      billingStatus: "free",
      freeDetectionStartedAt: null,
      freeDetectionSituationCount: 0,
    });
    expect(result.allowed).toBe(true);
  });

  it("free user with 49 situations → allowed", () => {
    const result = checkDetectionCap({
      billingStatus: "free",
      freeDetectionStartedAt: new Date(),
      freeDetectionSituationCount: 49,
    });
    expect(result.allowed).toBe(true);
  });

  it("free user with 50 situations → not allowed, DETECTION_CAP_SITUATIONS", () => {
    const result = checkDetectionCap({
      billingStatus: "free",
      freeDetectionStartedAt: new Date(),
      freeDetectionSituationCount: 50,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("DETECTION_CAP_SITUATIONS");
    }
  });

  it("free user with freeDetectionStartedAt 29 days ago → allowed", () => {
    const twentyNineDaysAgo = new Date();
    twentyNineDaysAgo.setDate(twentyNineDaysAgo.getDate() - 29);

    const result = checkDetectionCap({
      billingStatus: "free",
      freeDetectionStartedAt: twentyNineDaysAgo,
      freeDetectionSituationCount: 10,
    });
    expect(result.allowed).toBe(true);
  });

  it("free user with freeDetectionStartedAt 30 days ago → not allowed, DETECTION_CAP_TIME", () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = checkDetectionCap({
      billingStatus: "free",
      freeDetectionStartedAt: thirtyDaysAgo,
      freeDetectionSituationCount: 10,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("DETECTION_CAP_TIME");
    }
  });

  it("active user → always allowed regardless of counts", () => {
    const result = checkDetectionCap({
      billingStatus: "active",
      freeDetectionStartedAt: new Date(0), // ancient
      freeDetectionSituationCount: 999,
    });
    expect(result.allowed).toBe(true);
  });
});

// ── checkBudgetGate ─────────────────────────────────────────────────────────

describe("checkBudgetGate", () => {
  it("allows when no budget set (null)", () => {
    const result = checkBudgetGate({
      billingStatus: "active",
      monthlyBudgetCents: null,
      budgetHardStop: true,
      currentPeriodSpendCents: 99999,
    });
    expect(result.allowed).toBe(true);
  });

  it("allows in soft mode (hardStop=false) even when over budget", () => {
    const result = checkBudgetGate({
      billingStatus: "active",
      monthlyBudgetCents: 10000,
      budgetHardStop: false,
      currentPeriodSpendCents: 20000,
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks in hard mode when at budget limit", () => {
    const result = checkBudgetGate({
      billingStatus: "active",
      monthlyBudgetCents: 10000,
      budgetHardStop: true,
      currentPeriodSpendCents: 10000,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("BUDGET_EXCEEDED");
      expect(result.reason).toContain("budget reached");
    }
  });

  it("blocks in hard mode when over budget", () => {
    const result = checkBudgetGate({
      billingStatus: "active",
      monthlyBudgetCents: 10000,
      budgetHardStop: true,
      currentPeriodSpendCents: 15000,
    });
    expect(result.allowed).toBe(false);
  });

  it("allows in hard mode when below budget", () => {
    const result = checkBudgetGate({
      billingStatus: "active",
      monthlyBudgetCents: 10000,
      budgetHardStop: true,
      currentPeriodSpendCents: 5000,
    });
    expect(result.allowed).toBe(true);
  });

  it("allows for free billing status regardless of budget", () => {
    const result = checkBudgetGate({
      billingStatus: "free",
      monthlyBudgetCents: 10000,
      budgetHardStop: true,
      currentPeriodSpendCents: 99999,
    });
    expect(result.allowed).toBe(true);
  });
});
