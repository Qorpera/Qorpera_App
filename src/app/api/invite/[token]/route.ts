import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invite not found or expired" }, { status: 404 });
  }
  if (invite.claimedAt) {
    return NextResponse.json({ error: "This invite has already been used" }, { status: 410 });
  }

  const operator = await prisma.operator.findUnique({ where: { id: invite.operatorId } });
  const entity = await prisma.entity.findUnique({
    where: { id: invite.entityId },
    select: { displayName: true, parentDepartmentId: true },
  });

  let departmentName: string | null = null;
  if (entity?.parentDepartmentId) {
    const dept = await prisma.entity.findUnique({
      where: { id: entity.parentDepartmentId },
      select: { displayName: true },
    });
    departmentName = dept?.displayName ?? null;
  }

  return NextResponse.json({
    companyName: operator?.companyName || operator?.displayName || "Unknown",
    personName: entity?.displayName ?? "Unknown",
    role: invite.role,
    departmentName,
    email: invite.email,
  });
}
