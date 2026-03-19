import { prisma } from "@/lib/db";

// Notification types: delegation_received, delegation_completed, delegation_failed,
// system_alert, step_ready, follow_up_reminder, follow_up_triggered

type SendNotificationParams = {
  operatorId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  sourceType?: string;
  sourceId?: string;
  linkUrl?: string;
};

export async function sendNotification(params: SendNotificationParams): Promise<void> {
  try {
    const pref = await prisma.notificationPreference.findUnique({
      where: {
        userId_notificationType: {
          userId: params.userId,
          notificationType: params.type,
        },
      },
    });

    const channel = pref?.channel ?? "in_app";

    if (channel === "none") return;

    // "in_app", "both", or "email" — all create in-app notification for now
    // TODO: Day 12 — queue transactional email via Resend for "email" and "both" channels.
    // For now, fall through to in_app so notifications are never silently dropped.
    await prisma.notification.create({
      data: {
        operatorId: params.operatorId,
        userId: params.userId,
        title: params.title,
        body: params.body,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
      },
    });
  } catch (err) {
    console.error("sendNotification failed:", err);
  }
}

type SendToAdminsParams = Omit<SendNotificationParams, "userId"> & {
  excludeUserId?: string;
};

export async function sendNotificationToAdmins(params: SendToAdminsParams): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: {
        operatorId: params.operatorId,
        role: { in: ["admin", "superadmin"] },
      },
      select: { id: true },
    });

    for (const admin of admins) {
      if (admin.id === params.excludeUserId) continue;
      await sendNotification({ ...params, userId: admin.id });
    }
  } catch (err) {
    console.error("sendNotificationToAdmins failed:", err);
  }
}
