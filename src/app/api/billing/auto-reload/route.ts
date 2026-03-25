import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { enabled, thresholdCents, amountCents } = body;

  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) required" }, { status: 400 });
  }

  if (thresholdCents !== undefined && (typeof thresholdCents !== "number" || thresholdCents < 100)) {
    return NextResponse.json({ error: "thresholdCents must be >= 100" }, { status: 400 });
  }

  if (amountCents !== undefined && (typeof amountCents !== "number" || amountCents < 500)) {
    return NextResponse.json({ error: "amountCents must be >= 500" }, { status: 400 });
  }

  if (enabled) {
    const operator = await prisma.operator.findUnique({
      where: { id: su.operatorId },
      select: { stripePaymentMethodId: true },
    });
    if (!operator?.stripePaymentMethodId) {
      return NextResponse.json({ error: "Payment method required to enable auto-reload" }, { status: 400 });
    }
  }

  const data: Record<string, unknown> = { autoReloadEnabled: enabled };
  if (thresholdCents !== undefined) data.autoReloadThresholdCents = thresholdCents;
  if (amountCents !== undefined) data.autoReloadAmountCents = amountCents;

  await prisma.operator.update({
    where: { id: su.operatorId },
    data,
  });

  return NextResponse.json({ updated: true });
}
