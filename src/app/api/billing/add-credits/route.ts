import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { stripe, isStripeEnabled } from "@/lib/stripe";

const PRESET_AMOUNTS = [1000, 2500, 5000, 10000];
const MIN_CUSTOM_AMOUNT = 500;

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json();
  const amountCents = body.amountCents;

  if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents < MIN_CUSTOM_AMOUNT) {
    return NextResponse.json({ error: `Minimum amount is $${(MIN_CUSTOM_AMOUNT / 100).toFixed(2)}` }, { status: 400 });
  }

  const operator = await prisma.operator.findUnique({
    where: { id: su.operatorId },
  });
  if (!operator) return NextResponse.json({ error: "Operator not found" }, { status: 404 });

  // Dev mode: skip Stripe, directly add credits
  if (!isStripeEnabled()) {
    const updated = await prisma.operator.update({
      where: { id: operator.id },
      data: {
        balanceCents: { increment: amountCents },
        billingStartedAt: operator.billingStartedAt ?? new Date(),
        billingStatus: "active",
      },
    });

    await prisma.creditTransaction.create({
      data: {
        operatorId: operator.id,
        type: "purchase",
        amountCents,
        balanceAfter: updated.balanceCents,
        description: `Added $${(amountCents / 100).toFixed(2)} credits`,
      },
    });

    return NextResponse.json({ devMode: true });
  }

  // Ensure Stripe customer exists
  let customerId = operator.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe!.customers.create({
      email: su.user.email,
      name: operator.companyName || operator.displayName,
      metadata: { operatorId: operator.id },
    });
    customerId = customer.id;
    await prisma.operator.update({
      where: { id: operator.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const checkoutSession = await stripe!.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: { name: "Qorpera Credits" },
        },
        quantity: 1,
      },
    ],
    success_url: `${baseUrl}/settings?tab=billing&credits_added=true`,
    cancel_url: `${baseUrl}/settings?tab=billing`,
    metadata: { operatorId: operator.id, amountCents: String(amountCents) },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
