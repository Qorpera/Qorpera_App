import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";

const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000; // 48 hours

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id: targetUserId } = await params;

  // Auth: user can request own deletion, or admin can request on behalf
  const isSelf = su.user.id === targetUserId;
  const isAdmin = su.user.role === "admin" || su.user.role === "superadmin";
  if (!isSelf && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify target user exists and belongs to same operator
  const targetUser = await prisma.user.findFirst({
    where: { id: targetUserId, operatorId },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Prevent deleting superadmin
  if (targetUser.role === "superadmin") {
    return NextResponse.json({ error: "Cannot delete superadmin" }, { status: 400 });
  }

  // Already pending?
  if (targetUser.deletionRequestedAt) {
    return NextResponse.json({ error: "Deletion already requested" }, { status: 409 });
  }

  const now = new Date();
  const scheduledFor = new Date(now.getTime() + GRACE_PERIOD_MS);

  // Set deletion fields, suspend account, and delete all sessions
  await prisma.$transaction([
    prisma.user.update({
      where: { id: targetUserId },
      data: {
        deletionRequestedAt: now,
        deletionScheduledFor: scheduledFor,
        accountSuspended: true,
      },
    }),
    prisma.session.deleteMany({ where: { userId: targetUserId } }),
  ]);

  // Send confirmation email to the user
  sendEmail({
    to: targetUser.email,
    subject: "Your Qorpera account deletion has been requested",
    html: `<p>Your account deletion has been requested. It will be processed on <strong>${scheduledFor.toUTCString()}</strong>.</p><p>Contact your admin to cancel.</p>`,
  }).catch((err) => console.error("[request-deletion] Email to user failed:", err));

  // Notify all operator admins
  const admins = await prisma.user.findMany({
    where: { operatorId, role: "admin", id: { not: targetUserId } },
    select: { email: true },
  });
  for (const admin of admins) {
    sendEmail({
      to: admin.email,
      subject: `Account deletion requested: ${targetUser.name}`,
      html: `<p><strong>${targetUser.name}</strong> has requested account deletion, scheduled for <strong>${scheduledFor.toUTCString()}</strong>.</p><p>You can cancel this in Settings → Team.</p>`,
    }).catch((err) => console.error("[request-deletion] Email to admin failed:", err));
  }

  return NextResponse.json({
    success: true,
    deletionScheduledFor: scheduledFor.toISOString(),
  });
}
