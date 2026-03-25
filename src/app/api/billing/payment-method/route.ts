import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { stripe, isStripeEnabled } from "@/lib/stripe";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const operator = await prisma.operator.findUnique({
    where: { id: su.operatorId },
    select: { stripeCustomerId: true, stripePaymentMethodId: true, billingStatus: true },
  });

  if (!operator?.stripePaymentMethodId || !operator.stripeCustomerId || !isStripeEnabled()) {
    return NextResponse.json({ paymentMethod: null });
  }

  try {
    const pm = await stripe!.paymentMethods.retrieve(operator.stripePaymentMethodId);
    const card = pm.card;
    return NextResponse.json({
      paymentMethod: card
        ? { brand: card.brand, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year }
        : null,
    });
  } catch {
    return NextResponse.json({ paymentMethod: null });
  }
}
