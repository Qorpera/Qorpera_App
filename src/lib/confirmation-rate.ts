/**
 * Confirmation rate monitoring for SituationTypes.
 *
 * Checks if a situation type's confirmation rate has degraded below 40%
 * after accumulating 30+ detections, and alerts admins if so.
 */

import { prisma } from "@/lib/db";
import { sendNotification } from "@/lib/notification-dispatch";

export async function checkConfirmationRate(
  situationTypeId: string,
): Promise<void> {
  const st = await prisma.situationType.findUnique({
    where: { id: situationTypeId },
  });
  if (!st || st.detectedCount < 30) return;

  const totalDecided = st.confirmedCount + st.dismissedCount;
  if (totalDecided === 0) return;

  const confirmationRate = st.confirmedCount / totalDecided;
  if (confirmationRate >= 0.4) return;

  // Dedup: check if we sent an alert for this situation type within 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const alertTitle = `Detection quality alert: "${st.name}"`;
  const recentAlert = await prisma.notification.findFirst({
    where: {
      operatorId: st.operatorId,
      title: alertTitle,
      createdAt: { gte: sevenDaysAgo },
    },
  });
  if (recentAlert) return;

  const admins = await prisma.user.findMany({
    where: {
      operatorId: st.operatorId,
      role: "admin",
      accountSuspended: false,
    },
    select: { id: true },
  });

  const dismissRate = Math.round((1 - confirmationRate) * 100);
  for (const admin of admins) {
    await sendNotification({
      operatorId: st.operatorId,
      userId: admin.id,
      type: "system_alert",
      title: alertTitle,
      body: `The "${st.name}" detection is being dismissed ${dismissRate}% of the time (${st.dismissedCount} dismissed out of ${totalDecided} decided). Consider reviewing the trigger conditions.`,
      sourceType: "situation_type",
      sourceId: st.id,
    });
  }
}
