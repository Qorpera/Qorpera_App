import { prisma } from "@/lib/db";

const DEFAULT_THRESHOLDS = {
  graduation_supervised_to_notify_consecutive: 10,
  graduation_supervised_to_notify_rate: 0.9,
  graduation_notify_to_autonomous_consecutive: 20,
  graduation_notify_to_autonomous_rate: 0.95,
};

async function getThresholds() {
  const keys = Object.keys(DEFAULT_THRESHOLDS);
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: keys } },
  });
  const map = new Map(settings.map((s) => [s.key, s.value]));

  return {
    supervisedToNotifyConsecutive: parseFloat(
      map.get("graduation_supervised_to_notify_consecutive") ??
        String(DEFAULT_THRESHOLDS.graduation_supervised_to_notify_consecutive),
    ),
    supervisedToNotifyRate: parseFloat(
      map.get("graduation_supervised_to_notify_rate") ??
        String(DEFAULT_THRESHOLDS.graduation_supervised_to_notify_rate),
    ),
    notifyToAutonomousConsecutive: parseFloat(
      map.get("graduation_notify_to_autonomous_consecutive") ??
        String(DEFAULT_THRESHOLDS.graduation_notify_to_autonomous_consecutive),
    ),
    notifyToAutonomousRate: parseFloat(
      map.get("graduation_notify_to_autonomous_rate") ??
        String(DEFAULT_THRESHOLDS.graduation_notify_to_autonomous_rate),
    ),
  };
}

export { getThresholds, DEFAULT_THRESHOLDS };

export async function checkGraduation(situationTypeId: string): Promise<void> {
  const st = await prisma.situationType.findUnique({
    where: { id: situationTypeId },
  });
  if (!st) return;

  const thresholds = await getThresholds();

  let nextLevel: string | null = null;

  if (
    st.autonomyLevel === "supervised" &&
    st.consecutiveApprovals >= thresholds.supervisedToNotifyConsecutive &&
    st.approvalRate >= thresholds.supervisedToNotifyRate
  ) {
    nextLevel = "notify";
  } else if (
    st.autonomyLevel === "notify" &&
    st.consecutiveApprovals >= thresholds.notifyToAutonomousConsecutive &&
    st.approvalRate >= thresholds.notifyToAutonomousRate
  ) {
    nextLevel = "autonomous";
  }

  if (!nextLevel) return;

  const ratePercent = (st.approvalRate * 100).toFixed(0);

  await prisma.notification.create({
    data: {
      operatorId: st.operatorId,
      title: `Promote to ${nextLevel}: ${st.name}`,
      body: `${st.consecutiveApprovals} consecutive approvals with ${ratePercent}% accuracy. Promote ${st.name} to ${nextLevel} mode?`,
      sourceType: "graduation",
      sourceId: situationTypeId,
    },
  }).catch(() => {});
}

export async function checkDemotion(situationTypeId: string): Promise<void> {
  const st = await prisma.situationType.findUnique({
    where: { id: situationTypeId },
  });
  if (!st) return;

  if (st.autonomyLevel === "supervised") return;

  await prisma.situationType.update({
    where: { id: situationTypeId },
    data: { autonomyLevel: "supervised" },
  });

  await prisma.notification.create({
    data: {
      operatorId: st.operatorId,
      title: `Demoted to supervised: ${st.name}`,
      body: `A rejection was received — reverting to human review.`,
      sourceType: "graduation",
      sourceId: situationTypeId,
    },
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

  const thresholds = await getThresholds();
  let nextLevel: string | null = null;

  if (
    pa.autonomyLevel === "supervised" &&
    pa.consecutiveApprovals >= thresholds.supervisedToNotifyConsecutive &&
    pa.approvalRate >= thresholds.supervisedToNotifyRate
  ) {
    nextLevel = "notify";
  } else if (
    pa.autonomyLevel === "notify" &&
    pa.consecutiveApprovals >= thresholds.notifyToAutonomousConsecutive &&
    pa.approvalRate >= thresholds.notifyToAutonomousRate
  ) {
    nextLevel = "autonomous";
  }

  if (!nextLevel) return;

  const ratePercent = (pa.approvalRate * 100).toFixed(0);

  await prisma.notification.create({
    data: {
      operatorId: pa.operatorId,
      title: `Promote ${pa.aiEntity.displayName} to ${nextLevel}: ${pa.situationType.name}`,
      body: `${pa.consecutiveApprovals} consecutive approvals with ${ratePercent}% accuracy. Promote to ${nextLevel} mode?`,
      sourceType: "graduation",
      sourceId: personalAutonomyId,
    },
  }).catch(() => {});
}

export async function checkPersonalDemotion(personalAutonomyId: string): Promise<void> {
  const pa = await prisma.personalAutonomy.findUnique({
    where: { id: personalAutonomyId },
    include: {
      situationType: { select: { name: true } },
      aiEntity: { select: { displayName: true } },
    },
  });
  if (!pa || pa.autonomyLevel === "supervised") return;

  await prisma.personalAutonomy.update({
    where: { id: pa.id },
    data: { autonomyLevel: "supervised" },
  });

  await prisma.notification.create({
    data: {
      operatorId: pa.operatorId,
      title: `Demoted ${pa.aiEntity.displayName} to supervised: ${pa.situationType.name}`,
      body: `A rejection was received — reverting to human review.`,
      sourceType: "graduation",
      sourceId: personalAutonomyId,
    },
  }).catch(() => {});
}
