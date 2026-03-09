import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; scopeId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: userId, scopeId } = await params;

  // Validate scope exists and belongs to a user in this operator
  const scope = await prisma.userScope.findUnique({
    where: { id: scopeId },
    include: { user: { select: { operatorId: true } } },
  });
  if (!scope || scope.userId !== userId || scope.user.operatorId !== su.operatorId) {
    return NextResponse.json({ error: "Scope not found" }, { status: 404 });
  }

  // Prevent removing last scope
  const scopeCount = await prisma.userScope.count({ where: { userId } });
  if (scopeCount <= 1) {
    return NextResponse.json({ error: "Cannot remove last department access" }, { status: 400 });
  }

  await prisma.userScope.delete({ where: { id: scopeId } });

  return NextResponse.json({ success: true });
}
