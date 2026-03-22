import { prisma } from "@/lib/db";
import { getDefaultChannel } from "@/lib/notification-defaults";
import { sendEmail } from "@/lib/email";
import { renderNotificationEmail } from "@/emails/template-registry";
import { getLocalizedNotification } from "@/lib/notification-strings";

type SendNotificationParams = {
  operatorId: string;
  userId: string;
  type: string;
  title?: string;
  body?: string;
  context?: Record<string, string>;
  sourceType?: string;
  sourceId?: string;
  sourceAiEntityId?: string;
  linkUrl?: string;
  emailContext?: Record<string, any>;
};

export async function sendNotification(params: SendNotificationParams): Promise<void> {
  try {
    // Load user once — needed for role-based default and email dispatch
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { role: true, email: true, locale: true },
    });

    // Look up user preference for this notification type
    const pref = await prisma.notificationPreference.findUnique({
      where: {
        userId_notificationType: {
          userId: params.userId,
          notificationType: params.type,
        },
      },
    });

    // If no explicit preference, fall back to type-based default
    const effectiveChannel = pref?.channel
      || getDefaultChannel(params.type as any);

    if (effectiveChannel === "none") return;

    // Resolve title/body — use provided strings or generate from locale + context
    const locale = user?.locale ?? "en";
    let { title, body } = params;
    if (!title || !body) {
      const localized = getLocalizedNotification(locale, params.type, params.context ?? {});
      title = title || localized.title;
      body = body || localized.body;
    }

    // Create in-app notification for in_app, email, and both channels
    await prisma.notification.create({
      data: {
        operatorId: params.operatorId,
        userId: params.userId,
        title,
        body,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        sourceAiEntityId: params.sourceAiEntityId,
      },
    });

    // Send email for "email" and "both" channels
    if (effectiveChannel === "email" || effectiveChannel === "both") {
      try {
        if (user?.email) {
          // Build template props from emailContext or fall back to generic
          const templateProps = params.emailContext
            ? { ...params.emailContext, viewUrl: params.linkUrl }
            : { content: body, viewUrl: params.linkUrl };

          // Load operator name for subject line context
          const operator = await prisma.operator.findUnique({
            where: { id: params.operatorId },
            select: { displayName: true },
          });

          const emailResult = await renderNotificationEmail(
            params.type,
            templateProps,
            operator?.displayName ?? "Qorpera",
            user.locale ?? "en"
          );

          if (emailResult) {
            const result = await sendEmail({
              to: user.email,
              subject: emailResult.subject,
              html: emailResult.html,
            });

            if (!result.success) {
              console.error(
                `[notification-dispatch] Email send failed for ${params.type}:`,
                result.error
              );
            }
          }
        }
      } catch (emailErr) {
        // Email failures must not crash the notification flow
        console.error("[notification-dispatch] Email dispatch error:", emailErr);
      }
    }
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
