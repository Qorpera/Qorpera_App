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
    return NextResponse.json({ devMode: true, clientSecret: "dev_mode" });
  }

  const operator = await prisma.operator.findUnique({
    where: { id: su.operatorId },
    select: { stripeCustomerId: true },
  });

  if (!operator?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account. Add credits first." }, { status: 400 });
  }

  const setupIntent = await stripe!.setupIntents.create({
    customer: operator.stripeCustomerId,
    payment_method_types: ["card"],
  });

  return NextResponse.json({ clientSecret: setupIntent.client_secret });
}
