import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { paymentMethodId } = body;

  if (!paymentMethodId || typeof paymentMethodId !== "string") {
    return NextResponse.json({ error: "paymentMethodId required" }, { status: 400 });
  }

  await prisma.operator.update({
    where: { id: su.operatorId },
    data: { stripePaymentMethodId: paymentMethodId },
  });

  return NextResponse.json({ saved: true });
}
