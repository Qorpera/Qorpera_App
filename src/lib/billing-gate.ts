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
    free: "Add credits to unlock this feature.",
    depleted: "Your balance is empty. Add credits to continue.",
    past_due: "Your payment method needs updating. Please update your billing details.",
    cancelled: "Your billing has been cancelled. Add credits to continue.",
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
      reason: "Free copilot budget exhausted. Add credits for unlimited access.",
      code: "COPILOT_BUDGET_EXHAUSTED",
    };
  }

  return { allowed: true };
}

/**
 * Check if an operator's monthly budget allows further AI operations.
 * Only blocks when budgetHardStop is enabled and spend >= budget.
 */
export function checkBudgetGate(operator: {
  billingStatus: BillingStatus;
  monthlyBudgetCents: number | null;
  budgetHardStop: boolean;
  currentPeriodSpendCents: number;
}): BillingGateResult {
  if (operator.billingStatus !== "active") return { allowed: true };
  if (!operator.monthlyBudgetCents) return { allowed: true };
  if (!operator.budgetHardStop) return { allowed: true };

  if (operator.currentPeriodSpendCents >= operator.monthlyBudgetCents) {
    return {
      allowed: false,
      reason: "Monthly usage budget reached. AI operations paused. Increase your budget in Settings → Limits.",
      code: "BUDGET_EXCEEDED",
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
      reason: "Free detection limit reached (50 situations). Add credits to resume.",
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
        reason: "Free detection period expired (30 days). Add credits to resume.",
        code: "DETECTION_CAP_TIME",
      };
    }
  }

  return { allowed: true };
}
