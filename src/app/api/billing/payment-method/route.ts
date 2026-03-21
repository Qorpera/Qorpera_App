import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { stripe, isStripeEnabled } from "@/lib/stripe";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const operator = await prisma.operator.findUnique({
    where: { id: su.operatorId },
    select: { stripeCustomerId: true, billingStatus: true },
  });
  if (!operator?.stripeCustomerId || !isStripeEnabled()) {
    return NextResponse.json({ paymentMethod: null });
  }

  const customer = await stripe!.customers.retrieve(operator.stripeCustomerId, {
    expand: ["invoice_settings.default_payment_method"],
  });

  if (customer.deleted) {
    return NextResponse.json({ paymentMethod: null });
  }

  const pm = customer.invoice_settings?.default_payment_method;
  if (!pm || typeof pm === "string") {
    return NextResponse.json({ paymentMethod: null });
  }

  const card = pm.card;
  return NextResponse.json({
    paymentMethod: card
      ? { brand: card.brand, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year }
      : null,
  });
}
