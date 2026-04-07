import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: targetOperatorId } = await params;

  if (!su.isSuperadmin && (su.user.role !== "admin" || su.operatorId !== targetOperatorId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const operator = await prisma.operator.findUnique({ where: { id: targetOperatorId } });
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!operator.deletionRequestedAt) {
    return NextResponse.json({ error: "No deletion pending" }, { status: 409 });
  }

  await prisma.operator.update({
    where: { id: targetOperatorId },
    data: {
      deletionRequestedAt: null,
      deletionScheduledFor: null,
    },
  });

  return NextResponse.json({ success: true });
}
