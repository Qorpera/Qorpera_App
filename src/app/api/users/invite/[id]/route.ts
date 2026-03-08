import { NextRequest, NextResponse } from "next/server";
import { getOperatorId, getUserRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const operatorId = await getOperatorId();
  const role = await getUserRole();

  if (role !== "admin") {
    return NextResponse.json({ error: "Only admins can revoke invites" }, { status: 403 });
  }

  const { id } = await params;

  const invite = await prisma.invite.findFirst({ where: { id, operatorId } });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.claimedAt) {
    return NextResponse.json({ error: "Cannot revoke a claimed invite" }, { status: 400 });
  }

  await prisma.invite.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
