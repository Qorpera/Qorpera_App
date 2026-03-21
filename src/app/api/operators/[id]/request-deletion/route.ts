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
  const { id: targetOperatorId } = await params;

  // Must be admin of the target operator (or superadmin)
  if (!su.isSuperadmin && (su.user.role !== "admin" || su.operatorId !== targetOperatorId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const operator = await prisma.operator.findUnique({ where: { id: targetOperatorId } });
  if (!operator) {
    return NextResponse.json({ error: "Operator not found" }, { status: 404 });
  }
  if (operator.deletionRequestedAt) {
    return NextResponse.json({ error: "Deletion already requested" }, { status: 409 });
  }

  const now = new Date();
  const scheduledFor = new Date(now.getTime() + GRACE_PERIOD_MS);

  await prisma.operator.update({
    where: { id: targetOperatorId },
    data: {
      deletionRequestedAt: now,
      deletionScheduledFor: scheduledFor,
    },
  });

  // Notify all admins
  const admins = await prisma.user.findMany({
    where: { operatorId: targetOperatorId, role: "admin" },
    select: { email: true, name: true },
  });
  for (const admin of admins) {
    sendEmail({
      to: admin.email,
      subject: `Organization deletion scheduled: ${operator.displayName}`,
      html: `<p>The organization <strong>${operator.displayName}</strong> has been scheduled for deletion on <strong>${scheduledFor.toUTCString()}</strong>.</p><p>All data will be permanently deleted. Contact support to cancel.</p>`,
    }).catch(() => {});
  }

  return NextResponse.json({
    success: true,
    deletionScheduledFor: scheduledFor.toISOString(),
  });
}
