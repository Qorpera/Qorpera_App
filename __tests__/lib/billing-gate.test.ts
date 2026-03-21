import { describe, it, expect } from "vitest";
import { checkBillingGate, checkCopilotBudget, checkDetectionCap } from "@/lib/billing-gate";

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
      expect(result.reason).toContain("Activate billing");
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
