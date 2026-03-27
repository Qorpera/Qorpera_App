import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const su = await getSessionUser();
    if (!su) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const operator = await prisma.operator.findUnique({
      where: { id: su.operatorId },
      select: {
        balanceCents: true,
        billingStatus: true,
        autoReloadEnabled: true,
        autoReloadThresholdCents: true,
        autoReloadAmountCents: true,
        stripePaymentMethodId: true,
      },
    });

    if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      balanceCents: operator.balanceCents,
      billingStatus: operator.billingStatus,
      autoReloadEnabled: operator.autoReloadEnabled,
      autoReloadThresholdCents: operator.autoReloadThresholdCents,
      autoReloadAmountCents: operator.autoReloadAmountCents,
      hasPaymentMethod: !!operator.stripePaymentMethodId,
    });
  } catch (err) {
    console.error("[billing/balance] Error:", err);
    return NextResponse.json({ error: "Internal error", details: String(err) }, { status: 500 });
  }
}
