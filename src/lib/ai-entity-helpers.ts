import { prisma } from "@/lib/db";

const NOTIFICATION_TYPES = [
  "situation_proposed",
  "situation_resolved",
  "idea_proposed",
  "step_ready",
  "delegation_received",
  "follow_up_triggered",
  "plan_auto_executed",
  "peer_signal",
  "insight_discovered",
  "system_alert",
] as const;

/**
 * Seed default notification preferences for a user.
 * Idempotent — safe to re-run via skipDuplicates.
 */
export async function seedNotificationPreferences(
  userId: string,
  role: string,
): Promise<void> {
  const channel = role === "admin" || role === "superadmin" ? "both" : "in_app";

  await prisma.notificationPreference.createMany({
    data: NOTIFICATION_TYPES.map((notificationType) => ({
      userId,
      notificationType,
      channel,
    })),
    skipDuplicates: true,
  });
}
