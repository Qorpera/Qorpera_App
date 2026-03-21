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
      if (!operatorId) break;

      // Create metered subscription with both price items
      const subscription = await stripe!.subscriptions.create({
        customer: session.customer as string,
        items: [
          { price: process.env.STRIPE_SITUATION_PRICE_ID! },
          { price: process.env.STRIPE_COPILOT_PRICE_ID! },
        ],
      });

      await prisma.operator.update({
        where: { id: operatorId },
        data: {
          billingStatus: "active",
          billingStartedAt: new Date(),
          stripeSubscriptionId: subscription.id,
        },
      });

      await sendNotificationToAdmins({
        operatorId,
        type: "system_alert",
        title: "Billing activated",
        body: "Your Qorpera account is now active. AI will begin handling situations with full capabilities.",
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
        body: "Your latest payment could not be processed. Please update your payment method to avoid service interruption.",
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

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const operator = await prisma.operator.findFirst({
        where: { stripeCustomerId: customerId },
      });
      if (!operator) break;

      await prisma.operator.update({
        where: { id: operator.id },
        data: {
          billingStatus: "cancelled",
          stripeSubscriptionId: null,
        },
      });

      await sendNotificationToAdmins({
        operatorId: operator.id,
        type: "system_alert",
        title: "Subscription cancelled",
        body: "Your Qorpera subscription has been cancelled. AI capabilities are now limited to the free tier.",
        sourceType: "operator",
        sourceId: operator.id,
      }).catch(console.error);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
