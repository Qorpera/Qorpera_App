import { stripe, isStripeEnabled } from "@/lib/stripe";
import { calculateSituationFee, calculateCopilotFee } from "@/lib/billing-calc";
import { prisma } from "@/lib/db";

/**
 * Emit a billing event for a resolved situation.
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

  // Don't bill free users — track cost but don't emit to Stripe
  if (operator.billingStatus !== "active") return;

  const billedCents = calculateSituationFee({
    situationApiCostCents: situation.apiCostCents ?? 0,
    stepApiCostsCents: situation.executionPlan?.steps.map((s) => s.apiCostCents ?? 0) ?? [],
    autonomyLevel: situation.situationType.autonomyLevel,
    orchestrationFeeMultiplier: operator.orchestrationFeeMultiplier,
  });

  if (billedCents <= 0) return;

  // Record on situation
  await prisma.situation.update({
    where: { id: situationId },
    data: { billedCents, billedAt: new Date() },
  });

  // Emit to Stripe
  if (isStripeEnabled() && operator.stripeCustomerId) {
    await stripe!.billing.meterEvents.create({
      event_name: process.env.STRIPE_SITUATION_METER_EVENT || "situation_billing",
      payload: {
        stripe_customer_id: operator.stripeCustomerId,
        value: String(billedCents),
      },
    });
  }
}

/**
 * Emit a billing event for a copilot message.
 * Called after copilot LLM response is delivered.
 */
export async function emitCopilotBillingEvent(params: {
  apiCostCents: number;
  operatorId: string;
}): Promise<void> {
  if (params.apiCostCents <= 0) return;

  const operator = await prisma.operator.findUnique({
    where: { id: params.operatorId },
  });
  if (!operator || operator.billingStatus !== "active") return;

  const billedCents = calculateCopilotFee({
    apiCostCents: params.apiCostCents,
    orchestrationFeeMultiplier: operator.orchestrationFeeMultiplier,
  });

  if (billedCents <= 0) return;

  if (isStripeEnabled() && operator.stripeCustomerId) {
    await stripe!.billing.meterEvents.create({
      event_name: process.env.STRIPE_COPILOT_METER_EVENT || "copilot_billing",
      payload: {
        stripe_customer_id: operator.stripeCustomerId,
        value: String(billedCents),
      },
    });
  }
}
