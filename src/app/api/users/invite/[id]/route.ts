import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Only admins can revoke invites" }, { status: 403 });
  }

  const { id } = await params;

  const invite = await prisma.invite.findFirst({ where: { id, operatorId: su.operatorId } });
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.claimedAt) {
    return NextResponse.json({ error: "Cannot revoke a claimed invite" }, { status: 400 });
  }

  await prisma.invite.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
