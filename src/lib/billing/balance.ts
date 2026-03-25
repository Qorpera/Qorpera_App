import { prisma } from "@/lib/db";
import { stripe, isStripeEnabled } from "@/lib/stripe";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

/**
 * Compute orchestration fee multiplier on the fly.
 * First 30 days after billing activation: 0.5 (50% discount).
 * After 30 days: 1.0 (full rate).
 */
export function getOrchestrationFeeMultiplier(operator: { billingStartedAt: Date | null }): number {
  if (!operator.billingStartedAt) return 0.5;
  const daysSinceBillingStart = Math.floor(
    (Date.now() - operator.billingStartedAt.getTime()) / (1000 * 60 * 60 * 24),
  );
  return daysSinceBillingStart >= 30 ? 1.0 : 0.5;
}

/**
 * Deduct credits from an operator's prepaid balance.
 * Creates a CreditTransaction, triggers auto-reload or depleted status as needed.
 */
export async function deductBalance(
  operatorId: string,
  amountCents: number,
  description: string,
  reference?: { situationId?: string; copilotMessageId?: string },
): Promise<void> {
  if (amountCents <= 0) return;

  // Atomically decrement balance
  const updated = await prisma.operator.update({
    where: { id: operatorId },
    data: { balanceCents: { decrement: amountCents } },
  });

  // Create transaction record
  await prisma.creditTransaction.create({
    data: {
      operatorId,
      type: reference?.situationId ? "situation_deduction" : reference?.copilotMessageId ? "copilot_deduction" : "adjustment",
      amountCents: -amountCents,
      balanceAfter: updated.balanceCents,
      description,
      situationId: reference?.situationId ?? null,
      copilotMessageId: reference?.copilotMessageId ?? null,
    },
  });

  // Auto-reload or depleted handling
  if (updated.balanceCents <= 0) {
    if (updated.autoReloadEnabled && updated.stripePaymentMethodId) {
      await triggerAutoReload(operatorId, updated);
    } else {
      await prisma.operator.update({
        where: { id: operatorId },
        data: { billingStatus: "depleted" },
      });
      await sendNotificationToAdmins({
        operatorId,
        type: "system_alert",
        title: "Balance empty",
        body: "Your Qorpera balance is empty. Add credits to continue AI operations.",
        sourceType: "operator",
        sourceId: operatorId,
      }).catch(console.error);
    }
  } else if (
    updated.balanceCents <= updated.autoReloadThresholdCents &&
    updated.autoReloadEnabled &&
    updated.stripePaymentMethodId
  ) {
    await triggerAutoReload(operatorId, updated);
  }
}

async function triggerAutoReload(
  operatorId: string,
  operator: { autoReloadAmountCents: number; stripePaymentMethodId: string | null; stripeCustomerId: string | null },
): Promise<void> {
  const reloadAmount = operator.autoReloadAmountCents;

  if (!isStripeEnabled() || !operator.stripePaymentMethodId) {
    // Dev mode: directly increment balance
    const reloaded = await prisma.operator.update({
      where: { id: operatorId },
      data: {
        balanceCents: { increment: reloadAmount },
        billingStatus: "active",
      },
    });
    await prisma.creditTransaction.create({
      data: {
        operatorId,
        type: "auto_reload",
        amountCents: reloadAmount,
        balanceAfter: reloaded.balanceCents,
        description: `Auto-reload: +$${(reloadAmount / 100).toFixed(2)}`,
      },
    });
    return;
  }

  try {
    // Idempotency key prevents double-charging on concurrent deductions
    const idempotencyKey = `auto-reload-${operatorId}-${Math.floor(Date.now() / 60000)}`;

    const paymentIntent = await stripe!.paymentIntents.create({
      amount: reloadAmount,
      currency: "usd",
      customer: operator.stripeCustomerId!,
      payment_method: operator.stripePaymentMethodId!,
      off_session: true,
      confirm: true,
      metadata: { operatorId, type: "auto_reload" },
    }, { idempotencyKey });

    if (paymentIntent.status === "succeeded") {
      const reloaded = await prisma.operator.update({
        where: { id: operatorId },
        data: {
          balanceCents: { increment: reloadAmount },
          billingStatus: "active",
        },
      });
      await prisma.creditTransaction.create({
        data: {
          operatorId,
          type: "auto_reload",
          amountCents: reloadAmount,
          balanceAfter: reloaded.balanceCents,
          description: `Auto-reload: +$${(reloadAmount / 100).toFixed(2)}`,
          stripePaymentIntentId: paymentIntent.id,
        },
      });
    } else {
      // requires_action, processing, etc. — treat as failure
      console.error(`[auto-reload] PaymentIntent not succeeded, status: ${paymentIntent.status}`);
      await prisma.operator.update({
        where: { id: operatorId },
        data: { autoReloadEnabled: false },
      });
      await sendNotificationToAdmins({
        operatorId,
        type: "system_alert",
        title: "Auto-reload failed",
        body: "Auto-reload could not be completed. Your card may require additional verification. Please update your payment method and re-enable auto-reload.",
        sourceType: "operator",
        sourceId: operatorId,
      }).catch(console.error);
    }
  } catch (err) {
    console.error("[auto-reload] Payment failed:", err);
    await prisma.operator.update({
      where: { id: operatorId },
      data: { autoReloadEnabled: false },
    });
    await sendNotificationToAdmins({
      operatorId,
      type: "system_alert",
      title: "Auto-reload failed",
      body: "Auto-reload failed. Your payment method was declined. Please update your payment method and re-enable auto-reload.",
      sourceType: "operator",
      sourceId: operatorId,
    }).catch(console.error);
  }
}
