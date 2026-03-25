import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, isStripeEnabled } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

export async function POST(req: NextRequest) {
  if (!isStripeEnabled()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe!.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const operatorId = session.metadata?.operatorId;
      const amountCents = parseInt(session.metadata?.amountCents || "0", 10);
      if (!operatorId || amountCents <= 0) break;

      // Read current state, then do a single atomic update
      const current = await prisma.operator.findUnique({
        where: { id: operatorId },
        select: { billingStartedAt: true, billingStatus: true },
      });
      if (!current) break;

      const updated = await prisma.operator.update({
        where: { id: operatorId },
        data: {
          balanceCents: { increment: amountCents },
          ...(!current.billingStartedAt ? { billingStartedAt: new Date() } : {}),
          ...(current.billingStatus === "free" || current.billingStatus === "depleted"
            ? { billingStatus: "active" as const }
            : {}),
        },
      });

      // Create transaction record
      await prisma.creditTransaction.create({
        data: {
          operatorId,
          type: "purchase",
          amountCents,
          balanceAfter: updated.balanceCents,
          description: `Added $${(amountCents / 100).toFixed(2)} credits`,
          stripePaymentIntentId: session.payment_intent as string | null,
        },
      });

      await sendNotificationToAdmins({
        operatorId,
        type: "system_alert",
        title: "Credits added",
        body: `$${(amountCents / 100).toFixed(2)} in credits have been added to your account.`,
        sourceType: "operator",
        sourceId: operatorId,
      }).catch(console.error);
      break;
    }

    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const operatorId = paymentIntent.metadata?.operatorId;
      if (!operatorId) break;

      // Disable auto-reload on failure
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
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const operator = await prisma.operator.findFirst({
        where: { stripeCustomerId: customerId },
      });
      if (!operator) break;

      await prisma.operator.update({
        where: { id: operator.id },
        data: { billingStatus: "past_due" },
      });

      await sendNotificationToAdmins({
        operatorId: operator.id,
        type: "system_alert",
        title: "Payment failed",
        body: "Your latest payment could not be processed. Please update your payment method.",
        sourceType: "operator",
        sourceId: operator.id,
      }).catch(console.error);
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const operator = await prisma.operator.findFirst({
        where: { stripeCustomerId: customerId },
      });
      if (!operator) break;

      if (operator.billingStatus === "past_due") {
        await prisma.operator.update({
          where: { id: operator.id },
          data: { billingStatus: "active" },
        });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
