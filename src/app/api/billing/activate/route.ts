import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { stripe, isStripeEnabled } from "@/lib/stripe";

export async function POST() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const operator = await prisma.operator.findUnique({
    where: { id: su.operatorId },
  });
  if (!operator) return NextResponse.json({ error: "Operator not found" }, { status: 404 });

  if (operator.billingStatus !== "free") {
    return NextResponse.json({ error: "Already activated" }, { status: 400 });
  }

  // Dev mode: activate directly without Stripe
  if (!isStripeEnabled()) {
    await prisma.operator.update({
      where: { id: operator.id },
      data: { billingStatus: "active", billingStartedAt: new Date() },
    });
    return NextResponse.json({ activated: true });
  }

  // Ensure Stripe customer exists (lazy creation if registration didn't create one)
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

  const checkoutSession = await stripe!.checkout.sessions.create({
    customer: customerId,
    mode: "setup",
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?activated=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
    metadata: { operatorId: operator.id },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
