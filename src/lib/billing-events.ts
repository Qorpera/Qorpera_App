import { calculateSituationFee, calculateCopilotFee } from "@/lib/billing-calc";
import { deductBalance, getOrchestrationFeeMultiplier } from "@/lib/billing/balance";
import { checkBudgetGate } from "@/lib/billing-gate";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { prisma } from "@/lib/db";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute current-period spend for an operator from CreditTransaction.
 * Uses actual deductions (negative amountCents) as source of truth —
 * this excludes budget-blocked situations and includes fee markup on copilot.
 */
export async function getCurrentPeriodSpendCents(operatorId: string, budgetPeriodStart: Date | null): Promise<number> {
  const periodStart = budgetPeriodStart ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const agg = await prisma.creditTransaction.aggregate({
    where: {
      operatorId,
      createdAt: { gte: periodStart },
      type: { in: ["situation_deduction", "copilot_deduction"] },
    },
    _sum: { amountCents: true },
  });

  // amountCents is negative for deductions, so negate to get positive spend
  return Math.abs(agg._sum.amountCents ?? 0);
}

// ── Budget Alerts ────────────────────────────────────────────────────────────

export async function checkBudgetAlerts(operatorId: string): Promise<void> {
  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: {
      monthlyBudgetCents: true,
      budgetAlertThresholds: true,
      budgetAlertsSentThisPeriod: true,
      budgetPeriodStart: true,
    },
  });

  if (!operator?.monthlyBudgetCents) return;

  const currentSpendCents = await getCurrentPeriodSpendCents(operatorId, operator.budgetPeriodStart);
  const percentUsed = (currentSpendCents / operator.monthlyBudgetCents) * 100;

  const thresholds = Array.isArray(operator.budgetAlertThresholds)
    ? (operator.budgetAlertThresholds as number[])
    : [];
  const alreadySent = Array.isArray(operator.budgetAlertsSentThisPeriod)
    ? (operator.budgetAlertsSentThisPeriod as number[])
    : [];

  const newlySent: number[] = [];

  for (const threshold of thresholds) {
    if (percentUsed >= threshold && !alreadySent.includes(threshold)) {
      await sendNotificationToAdmins({
        operatorId,
        type: "system_alert",
        title: "Budget alert",
        body: `Usage has reached ${threshold}% of your monthly budget ($${(currentSpendCents / 100).toFixed(2)} / $${(operator.monthlyBudgetCents / 100).toFixed(2)})`,
      });
      newlySent.push(threshold);
    }
  }

  if (newlySent.length > 0) {
    await prisma.operator.update({
      where: { id: operatorId },
      data: { budgetAlertsSentThisPeriod: [...alreadySent, ...newlySent] },
    });
  }
}

// ── Situation Billing ────────────────────────────────────────────────────────

/**
 * Deduct credits for a resolved situation.
 * Called when situation reaches terminal state (resolved/closed with work done).
 */
export async function emitSituationBillingEvent(situationId: string): Promise<void> {
  const situation = await prisma.situation.findUnique({
    where: { id: situationId },
    include: {
      situationType: true,
      executionPlan: {
        include: { steps: { select: { apiCostCents: true } } },
      },
    },
  });

  if (!situation) return;

  const operator = await prisma.operator.findUnique({
    where: { id: situation.operatorId },
  });
  if (!operator) return;

  // Don't bill free users — track cost but don't deduct
  if (operator.billingStatus !== "active") return;

  const orchestrationFeeMultiplier = getOrchestrationFeeMultiplier(operator);

  const billedCents = calculateSituationFee({
    situationApiCostCents: situation.apiCostCents ?? 0,
    stepApiCostsCents: situation.executionPlan?.steps.map((s) => s.apiCostCents ?? 0) ?? [],
    autonomyLevel: situation.situationType.autonomyLevel,
    orchestrationFeeMultiplier,
  });

  if (billedCents <= 0) return;

  // Budget gate — check before deducting
  const currentPeriodSpendCents = await getCurrentPeriodSpendCents(situation.operatorId, operator.budgetPeriodStart);
  const gate = checkBudgetGate({
    billingStatus: operator.billingStatus,
    monthlyBudgetCents: operator.monthlyBudgetCents,
    budgetHardStop: operator.budgetHardStop,
    currentPeriodSpendCents,
  });

  if (!gate.allowed) {
    console.warn(`[billing] Budget gate blocked situation ${situationId}: ${gate.reason}`);
    return;
  }

  // Deduct first — if this fails, we don't record billedCents (keeps state consistent)
  try {
    await deductBalance(
      situation.operatorId,
      billedCents,
      `Situation: ${situation.situationType.name} (${situation.situationType.autonomyLevel})`,
      { situationId },
    );
  } catch (err) {
    console.error(`[billing] Failed to deduct balance for situation ${situationId}:`, err);
    return;
  }

  // Record on situation only after successful deduction
  await prisma.situation.update({
    where: { id: situationId },
    data: { billedCents, billedAt: new Date() },
  });

  // Check budget alerts after billing
  checkBudgetAlerts(situation.operatorId).catch((err) =>
    console.error(`[billing] Budget alert check failed:`, err),
  );
}

// ── Copilot Billing ──────────────────────────────────────────────────────────

/**
 * Deduct credits for a copilot message.
 * Called after copilot LLM response is delivered.
 */
export async function emitCopilotBillingEvent(params: {
  apiCostCents: number;
  operatorId: string;
  copilotMessageId?: string;
}): Promise<void> {
  if (params.apiCostCents <= 0) return;

  const operator = await prisma.operator.findUnique({
    where: { id: params.operatorId },
  });
  if (!operator || operator.billingStatus !== "active") return;

  const orchestrationFeeMultiplier = getOrchestrationFeeMultiplier(operator);

  const billedCents = calculateCopilotFee({
    apiCostCents: params.apiCostCents,
    orchestrationFeeMultiplier,
  });

  if (billedCents <= 0) return;

  // Budget gate — check before deducting
  const currentPeriodSpendCents = await getCurrentPeriodSpendCents(params.operatorId, operator.budgetPeriodStart);
  const gate = checkBudgetGate({
    billingStatus: operator.billingStatus,
    monthlyBudgetCents: operator.monthlyBudgetCents,
    budgetHardStop: operator.budgetHardStop,
    currentPeriodSpendCents,
  });

  if (!gate.allowed) {
    console.warn(`[billing] Budget gate blocked copilot message: ${gate.reason}`);
    return;
  }

  // Deduct from prepaid balance
  try {
    await deductBalance(
      params.operatorId,
      billedCents,
      "Copilot message",
      { copilotMessageId: params.copilotMessageId },
    );
  } catch (err) {
    console.error(`[billing] Failed to deduct balance for copilot message:`, err);
  }

  // Check budget alerts after billing
  checkBudgetAlerts(params.operatorId).catch((err) =>
    console.error(`[billing] Budget alert check failed:`, err),
  );
}
