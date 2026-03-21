import type { BillingStatus } from "@prisma/client";

export type BillingGateResult =
  | { allowed: true }
  | { allowed: false; reason: string; code: string };

/**
 * Check if an operator can perform a billable action.
 * Used by API routes that require active billing.
 */
export function checkBillingGate(operator: {
  billingStatus: BillingStatus;
}): BillingGateResult {
  if (operator.billingStatus === "active") {
    return { allowed: true };
  }

  const reasonMap: Record<string, string> = {
    free: "Activate billing to unlock this feature.",
    past_due: "Your payment method needs updating. Please update your billing details.",
    cancelled: "Your subscription has been cancelled. Reactivate to continue.",
  };

  return {
    allowed: false,
    reason: reasonMap[operator.billingStatus] ?? "Billing is not active.",
    code: "BILLING_REQUIRED",
  };
}

/**
 * Check if a free operator can still use the copilot.
 */
export function checkCopilotBudget(operator: {
  billingStatus: BillingStatus;
  freeCopilotUsedCents: number;
  freeCopilotBudgetCents: number;
}): BillingGateResult {
  if (operator.billingStatus === "active") {
    return { allowed: true };
  }

  if (operator.freeCopilotUsedCents >= operator.freeCopilotBudgetCents) {
    return {
      allowed: false,
      reason: "Free copilot budget exhausted. Activate billing for unlimited access.",
      code: "COPILOT_BUDGET_EXHAUSTED",
    };
  }

  return { allowed: true };
}

/**
 * Check if detection should run for a free operator.
 */
export function checkDetectionCap(operator: {
  billingStatus: BillingStatus;
  freeDetectionStartedAt: Date | null;
  freeDetectionSituationCount: number;
}): BillingGateResult {
  if (operator.billingStatus === "active") {
    return { allowed: true };
  }

  if (operator.freeDetectionSituationCount >= 50) {
    return {
      allowed: false,
      reason: "Free detection limit reached (50 situations). Activate billing to resume.",
      code: "DETECTION_CAP_SITUATIONS",
    };
  }

  if (operator.freeDetectionStartedAt) {
    const daysSinceStart = Math.floor(
      (Date.now() - operator.freeDetectionStartedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSinceStart >= 30) {
      return {
        allowed: false,
        reason: "Free detection period expired (30 days). Activate billing to resume.",
        code: "DETECTION_CAP_TIME",
      };
    }
  }

  return { allowed: true };
}
