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

  if (!isStripeEnabled()) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const operator = await prisma.operator.findUnique({
    where: { id: su.operatorId },
    select: { stripeCustomerId: true, billingStatus: true },
  });

  if (!operator?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account" }, { status: 400 });
  }

  const checkoutSession = await stripe!.checkout.sessions.create({
    customer: operator.stripeCustomerId,
    mode: "setup",
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?payment_updated=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
