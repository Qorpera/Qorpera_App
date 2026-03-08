import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.claimedAt) {
    return NextResponse.json({ error: "This invite has already been used" }, { status: 400 });
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "This invite has expired" }, { status: 400 });
  }

  const operator = await prisma.operator.findUnique({ where: { id: invite.operatorId } });
  const inviter = await prisma.user.findUnique({
    where: { id: invite.invitedBy },
    select: { displayName: true },
  });

  let departmentName = null;
  if (invite.departmentId) {
    const dept = await prisma.entity.findUnique({
      where: { id: invite.departmentId },
      select: { displayName: true },
    });
    departmentName = dept?.displayName;
  }

  return NextResponse.json({
    companyName: operator?.companyName || operator?.displayName || "Unknown",
    role: invite.role,
    departmentName,
    inviterName: inviter?.displayName || "Unknown",
    email: invite.email,
  });
}
