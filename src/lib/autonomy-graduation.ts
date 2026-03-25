import { prisma } from "@/lib/db";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

const DEFAULT_THRESHOLDS = {
  graduation_to_autonomous_consecutive: 100,
  graduation_to_autonomous_rate: 0.99,
};

async function getThresholds(operatorId?: string) {
  const keys = Object.keys(DEFAULT_THRESHOLDS);
  let map: Map<string, string>;
  if (operatorId) {
    const { getOperatorSettings } = await import("@/lib/operator-settings");
    map = await getOperatorSettings(operatorId, keys);
  } else {
    const settings = await prisma.appSetting.findMany({
      where: { key: { in: keys }, operatorId: null },
    });
    map = new Map(settings.map((s) => [s.key, s.value]));
  }

  return {
    toAutonomousConsecutive: parseFloat(
      map.get("graduation_to_autonomous_consecutive") ??
        String(DEFAULT_THRESHOLDS.graduation_to_autonomous_consecutive),
    ),
    toAutonomousRate: parseFloat(
      map.get("graduation_to_autonomous_rate") ??
        String(DEFAULT_THRESHOLDS.graduation_to_autonomous_rate),
    ),
  };
}

export { getThresholds, DEFAULT_THRESHOLDS };

/**
 * Check if a situation type qualifies for autonomous graduation.
 * Sends a notification suggesting promotion — does NOT auto-promote.
 */
export async function checkGraduation(situationTypeId: string): Promise<void> {
  const st = await prisma.situationType.findUnique({
    where: { id: situationTypeId },
  });
  if (!st) return;

  // Already autonomous — nothing to do
  if (st.autonomyLevel === "autonomous") return;

  const thresholds = await getThresholds(st.operatorId);

  if (
    st.consecutiveApprovals >= thresholds.toAutonomousConsecutive &&
    st.approvalRate >= thresholds.toAutonomousRate
  ) {
    const ratePercent = (st.approvalRate * 100).toFixed(0);

    await sendNotificationToAdmins({
      operatorId: st.operatorId,
      type: "graduation_proposal",
      title: `Ready for autonomous: ${st.name}`,
      body: `${st.consecutiveApprovals} consecutive non-edited approvals with ${ratePercent}% accept rate. Consider promoting ${st.name} to autonomous mode.`,
      sourceType: "graduation",
      sourceId: situationTypeId,
    }).catch(() => {});
  }
}

/**
 * Demote a situation type back to propose on rejection.
 * Only demotes if currently autonomous.
 */
export async function checkDemotion(situationTypeId: string): Promise<void> {
  const st = await prisma.situationType.findUnique({
    where: { id: situationTypeId },
  });
  if (!st) return;

  // Only demote autonomous back to supervised (propose)
  if (st.autonomyLevel !== "autonomous") return;

  await prisma.situationType.update({
    where: { id: situationTypeId },
    data: { autonomyLevel: "supervised" },
  });

  await sendNotificationToAdmins({
    operatorId: st.operatorId,
    type: "graduation_proposal",
    title: `Demoted to propose: ${st.name}`,
    body: "A rejection was received — reverting to human review.",
    sourceType: "graduation",
    sourceId: situationTypeId,
  }).catch(() => {});
}

// ── Personal Autonomy Graduation ────────────────────────────────────────────

export async function checkPersonalGraduation(personalAutonomyId: string): Promise<void> {
  const pa = await prisma.personalAutonomy.findUnique({
    where: { id: personalAutonomyId },
    include: {
      situationType: { select: { name: true } },
      aiEntity: { select: { displayName: true } },
    },
  });
  if (!pa) return;

  if (pa.autonomyLevel === "autonomous") return;

  const thresholds = await getThresholds(pa.operatorId);

  if (
    pa.consecutiveApprovals >= thresholds.toAutonomousConsecutive &&
    pa.approvalRate >= thresholds.toAutonomousRate
  ) {
    const ratePercent = (pa.approvalRate * 100).toFixed(0);

    await sendNotificationToAdmins({
      operatorId: pa.operatorId,
      type: "graduation_proposal",
      title: `${pa.aiEntity.displayName} ready for autonomous: ${pa.situationType.name}`,
      body: `${pa.consecutiveApprovals} consecutive non-edited approvals with ${ratePercent}% accept rate. Consider promoting to autonomous mode.`,
      sourceType: "graduation",
      sourceId: personalAutonomyId,
    }).catch(() => {});
  }
}

export async function checkPersonalDemotion(personalAutonomyId: string): Promise<void> {
  const pa = await prisma.personalAutonomy.findUnique({
    where: { id: personalAutonomyId },
    include: {
      situationType: { select: { name: true } },
      aiEntity: { select: { displayName: true } },
    },
  });
  if (!pa || pa.autonomyLevel !== "autonomous") return;

  await prisma.personalAutonomy.update({
    where: { id: pa.id },
    data: { autonomyLevel: "supervised" },
  });

  await sendNotificationToAdmins({
    operatorId: pa.operatorId,
    type: "graduation_proposal",
    title: `Demoted ${pa.aiEntity.displayName} to propose: ${pa.situationType.name}`,
    body: "A rejection was received — reverting to human review.",
    sourceType: "graduation",
    sourceId: personalAutonomyId,
  }).catch(() => {});
}
