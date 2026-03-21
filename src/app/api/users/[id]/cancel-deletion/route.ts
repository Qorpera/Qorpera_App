import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  // Admin only — the user is suspended and can't access this
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id: targetUserId } = await params;

  const targetUser = await prisma.user.findFirst({
    where: { id: targetUserId, operatorId },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!targetUser.deletionRequestedAt) {
    return NextResponse.json({ error: "No pending deletion" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: targetUserId },
    data: {
      deletionRequestedAt: null,
      deletionScheduledFor: null,
      accountSuspended: false,
    },
  });

  // Notify the user their deletion was cancelled
  sendEmail({
    to: targetUser.email,
    subject: "Your Qorpera account deletion has been cancelled",
    html: `<p>Your deletion request has been cancelled by <strong>${su.user.name}</strong>. Your account is active again.</p>`,
  }).catch((err) => console.error("[cancel-deletion] Email failed:", err));

  return NextResponse.json({ success: true });
}
