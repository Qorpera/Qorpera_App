import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { stripe, isStripeEnabled } from "@/lib/stripe";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const operator = await prisma.operator.findUnique({
    where: { id: su.operatorId },
    select: { stripeCustomerId: true },
  });

  if (!operator?.stripeCustomerId || !isStripeEnabled()) {
    return NextResponse.json({ invoices: [] });
  }

  const invoices = await stripe!.invoices.list({
    customer: operator.stripeCustomerId,
    limit: 24,
  });

  return NextResponse.json({
    invoices: invoices.data.map((inv) => ({
      id: inv.id,
      date: inv.created,
      amount: inv.amount_due,
      currency: inv.currency,
      status: inv.status,
      pdfUrl: inv.invoice_pdf,
      hostedUrl: inv.hosted_invoice_url,
    })),
  });
}
