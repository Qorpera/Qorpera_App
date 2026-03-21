/**
 * Activity-Absence Detection Engine
 *
 * Detects three absence patterns from ActivitySignal data:
 * 1. email_silence — significant drop in email volume over 5 business days
 * 2. meeting_dropout — significant drop in meeting frequency over 2 weeks
 * 3. engagement_decline — combined activity drop > 60% over 1 week
 *
 * Also computes and stores four structured signal metrics on every sweep:
 * email_response_time, meeting_frequency, slack_mentions, doc_edit_velocity
 */

import { prisma } from "@/lib/db";

// ── Types ───────────────────────────────────────────────

type AbsenceSignal = {
  signalType: "email_silence" | "meeting_dropout" | "engagement_decline";
  baseline: number;
  current: number;
  dropPercent: number;
};

type UserRef = {
  id: string;
  name: string;
  entityId: string | null;
  operatorId: string;
};

// ── Constants ───────────────────────────────────────────

const MIN_HISTORY_DAYS = 14;

// Email silence: baseline 30 days, lookback 5 business days (~7 calendar days)
const EMAIL_BASELINE_DAYS = 30;
const EMAIL_LOOKBACK_DAYS = 7; // covers ~5 business days
const EMAIL_MIN_DAILY_BASELINE = 10;
const EMAIL_TRIGGER_DAILY_MAX = 2;

// Meeting dropout: baseline 4 weeks, lookback 2 weeks
const MEETING_BASELINE_DAYS = 28;
const MEETING_LOOKBACK_DAYS = 14;
const MEETING_MIN_WEEKLY_BASELINE = 5;
const MEETING_TRIGGER_WEEKLY_MAX = 2;

// Engagement decline: baseline 4 weeks, lookback 1 week
const ENGAGEMENT_BASELINE_DAYS = 28;
const ENGAGEMENT_LOOKBACK_DAYS = 7;
const ENGAGEMENT_DROP_THRESHOLD = 0.6; // 60%

// ── Helpers ─────────────────────────────────────────────

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function countSignals(
  operatorId: string,
  actorEntityId: string,
  signalTypes: string[],
  from: Date,
  to: Date,
): Promise<number> {
  return prisma.activitySignal.count({
    where: {
      operatorId,
      actorEntityId,
      signalType: { in: signalTypes },
      occurredAt: { gte: from, lte: to },
    },
  });
}

async function getEarliestSignalDate(
  operatorId: string,
  actorEntityId: string,
): Promise<Date | null> {
  const earliest = await prisma.activitySignal.findFirst({
    where: { operatorId, actorEntityId },
    orderBy: { occurredAt: "asc" },
    select: { occurredAt: true },
  });
  return earliest?.occurredAt ?? null;
}

function buildAbsenceDescription(
  userName: string,
  patterns: AbsenceSignal[],
): string {
  const lines = patterns.map((p) => {
    switch (p.signalType) {
      case "email_silence":
        return `Email volume dropped ${p.dropPercent.toFixed(0)}% (baseline: ${p.baseline.toFixed(1)}/day, recent: ${p.current.toFixed(1)}/day)`;
      case "meeting_dropout":
        return `Meeting attendance dropped ${p.dropPercent.toFixed(0)}% (baseline: ${p.baseline.toFixed(1)}/week, recent: ${p.current.toFixed(1)}/week)`;
      case "engagement_decline":
        return `Overall engagement dropped ${p.dropPercent.toFixed(0)}% across all activity types`;
    }
  });
  return `Activity change detected for ${userName}:\n${lines.join("\n")}`;
}

// ── Absence Pattern Detection ───────────────────────────

async function detectEmailSilence(
  operatorId: string,
  entityId: string,
): Promise<AbsenceSignal | null> {
  const now = new Date();
  const emailTypes = ["email_sent", "email_received"];

  const baselineCount = await countSignals(
    operatorId,
    entityId,
    emailTypes,
    daysAgo(EMAIL_BASELINE_DAYS),
    daysAgo(EMAIL_LOOKBACK_DAYS),
  );
  const baselineDays = EMAIL_BASELINE_DAYS - EMAIL_LOOKBACK_DAYS;
  const baselineDaily = baselineCount / baselineDays;

  if (baselineDaily < EMAIL_MIN_DAILY_BASELINE) return null;

  const recentCount = await countSignals(
    operatorId,
    entityId,
    emailTypes,
    daysAgo(EMAIL_LOOKBACK_DAYS),
    now,
  );
  const recentDaily = recentCount / EMAIL_LOOKBACK_DAYS;

  if (recentDaily >= EMAIL_TRIGGER_DAILY_MAX) return null;

  const dropPercent = ((baselineDaily - recentDaily) / baselineDaily) * 100;
  return {
    signalType: "email_silence",
    baseline: baselineDaily,
    current: recentDaily,
    dropPercent,
  };
}

async function detectMeetingDropout(
  operatorId: string,
  entityId: string,
): Promise<AbsenceSignal | null> {
  const now = new Date();
  const meetingTypes = ["meeting_held"];

  const baselineCount = await countSignals(
    operatorId,
    entityId,
    meetingTypes,
    daysAgo(MEETING_BASELINE_DAYS),
    daysAgo(MEETING_LOOKBACK_DAYS),
  );
  const baselineWeeks = (MEETING_BASELINE_DAYS - MEETING_LOOKBACK_DAYS) / 7;
  const baselineWeekly = baselineCount / baselineWeeks;

  if (baselineWeekly < MEETING_MIN_WEEKLY_BASELINE) return null;

  const recentCount = await countSignals(
    operatorId,
    entityId,
    meetingTypes,
    daysAgo(MEETING_LOOKBACK_DAYS),
    now,
  );
  const recentWeekly = recentCount / (MEETING_LOOKBACK_DAYS / 7);

  if (recentWeekly >= MEETING_TRIGGER_WEEKLY_MAX) return null;

  const dropPercent =
    ((baselineWeekly - recentWeekly) / baselineWeekly) * 100;
  return {
    signalType: "meeting_dropout",
    baseline: baselineWeekly,
    current: recentWeekly,
    dropPercent,
  };
}

async function detectEngagementDecline(
  operatorId: string,
  entityId: string,
): Promise<AbsenceSignal | null> {
  const now = new Date();

  // Count all signal types (not filtered by signalType)
  const baselineAll = await prisma.activitySignal.count({
    where: {
      operatorId,
      actorEntityId: entityId,
      occurredAt: {
        gte: daysAgo(ENGAGEMENT_BASELINE_DAYS),
        lte: daysAgo(ENGAGEMENT_LOOKBACK_DAYS),
      },
    },
  });

  const baselineDays = ENGAGEMENT_BASELINE_DAYS - ENGAGEMENT_LOOKBACK_DAYS;
  const baselineDaily = baselineAll / baselineDays;

  if (baselineDaily < 1) return null; // Not enough baseline activity to measure

  const recentAll = await prisma.activitySignal.count({
    where: {
      operatorId,
      actorEntityId: entityId,
      occurredAt: { gte: daysAgo(ENGAGEMENT_LOOKBACK_DAYS), lte: now },
    },
  });
  const recentDaily = recentAll / ENGAGEMENT_LOOKBACK_DAYS;

  const dropPercent = ((baselineDaily - recentDaily) / baselineDaily) * 100;
  if (dropPercent <= ENGAGEMENT_DROP_THRESHOLD * 100) return null;

  return {
    signalType: "engagement_decline",
    baseline: baselineDaily,
    current: recentDaily,
    dropPercent,
  };
}

// ── Structured Signal Computation ───────────────────────

export async function computeAndStoreStructuredSignals(
  operatorId: string,
  userId: string,
  entityId: string,
): Promise<number> {
  const now = new Date();
  let stored = 0;

  // 1. email_response_time — average hours to first reply (approximate from sent/received pairs)
  const emailReceived = await prisma.activitySignal.count({
    where: {
      operatorId,
      actorEntityId: entityId,
      signalType: "email_received",
      occurredAt: { gte: daysAgo(7) },
    },
  });
  const emailSent = await prisma.activitySignal.count({
    where: {
      operatorId,
      actorEntityId: entityId,
      signalType: "email_sent",
      occurredAt: { gte: daysAgo(7) },
    },
  });
  // Rough response time estimate: if user receives 10 emails and sends 8, ratio indicates responsiveness
  const responseRatio = emailReceived > 0 ? emailSent / emailReceived : 0;
  // Map ratio to hours: 1.0 ratio ≈ 2h, 0.5 ≈ 8h, 0.0 ≈ 24h
  const estimatedResponseHours =
    responseRatio >= 1 ? 2 : responseRatio > 0 ? 24 - responseRatio * 22 : 24;

  await prisma.activitySignal.create({
    data: {
      operatorId,
      signalType: "computed",
      actorEntityId: entityId,
      metadata: JSON.stringify({
        signalType: "email_response_time",
        userId,
        value: Math.round(estimatedResponseHours * 10) / 10,
        unit: "hours",
        window: "7d",
        computedAt: now.toISOString(),
      }),
      occurredAt: now,
    },
  });
  stored++;

  // 2. meeting_frequency — meetings per week
  const meetingsThisWeek = await prisma.activitySignal.count({
    where: {
      operatorId,
      actorEntityId: entityId,
      signalType: "meeting_held",
      occurredAt: { gte: daysAgo(7) },
    },
  });
  await prisma.activitySignal.create({
    data: {
      operatorId,
      signalType: "computed",
      actorEntityId: entityId,
      metadata: JSON.stringify({
        signalType: "meeting_frequency",
        userId,
        value: meetingsThisWeek,
        unit: "count_per_week",
        window: "7d",
        computedAt: now.toISOString(),
      }),
      occurredAt: now,
    },
  });
  stored++;

  // 3. slack_mentions — Slack messages per day
  const slackThisWeek = await prisma.activitySignal.count({
    where: {
      operatorId,
      actorEntityId: entityId,
      signalType: "slack_message",
      occurredAt: { gte: daysAgo(7) },
    },
  });
  await prisma.activitySignal.create({
    data: {
      operatorId,
      signalType: "computed",
      actorEntityId: entityId,
      metadata: JSON.stringify({
        signalType: "slack_mentions",
        userId,
        value: Math.round((slackThisWeek / 7) * 10) / 10,
        unit: "count_per_day",
        window: "7d",
        computedAt: now.toISOString(),
      }),
      occurredAt: now,
    },
  });
  stored++;

  // 4. doc_edit_velocity — documents created/edited per week
  const docsThisWeek = await prisma.activitySignal.count({
    where: {
      operatorId,
      actorEntityId: entityId,
      signalType: { in: ["doc_edit", "doc_created"] },
      occurredAt: { gte: daysAgo(7) },
    },
  });
  await prisma.activitySignal.create({
    data: {
      operatorId,
      signalType: "computed",
      actorEntityId: entityId,
      metadata: JSON.stringify({
        signalType: "doc_edit_velocity",
        userId,
        value: docsThisWeek,
        unit: "count_per_week",
        window: "7d",
        computedAt: now.toISOString(),
      }),
      occurredAt: now,
    },
  });
  stored++;

  return stored;
}

// ── Main Detection Entry Point ──────────────────────────

export async function detectAbsenceForUser(
  operatorId: string,
  user: UserRef,
): Promise<"insufficient_data" | "situation_created" | "no_trigger"> {
  if (!user.entityId) return "no_trigger";

  // Check minimum history
  const earliest = await getEarliestSignalDate(operatorId, user.entityId);
  if (!earliest) return "insufficient_data";

  const historyDays =
    (Date.now() - earliest.getTime()) / (24 * 60 * 60 * 1000);
  if (historyDays < MIN_HISTORY_DAYS) return "insufficient_data";

  // Run absence pattern detectors sequentially (predictable DB call ordering)
  const emailSilence = await detectEmailSilence(operatorId, user.entityId);
  const meetingDropout = await detectMeetingDropout(operatorId, user.entityId);
  const engagementDecline = await detectEngagementDecline(operatorId, user.entityId);

  const triggeredPatterns: AbsenceSignal[] = [
    emailSilence,
    meetingDropout,
    engagementDecline,
  ].filter((p): p is AbsenceSignal => p !== null);

  if (triggeredPatterns.length === 0) return "no_trigger";

  // Dedup: check for existing pending/in_progress "Engagement Risk" situation for this user's entity
  const existingSituation = await prisma.situation.findFirst({
    where: {
      operatorId,
      triggerEntityId: user.entityId,
      status: { in: ["detected", "reasoning", "proposed", "approved", "executing"] },
      situationType: { name: "Engagement Risk" },
    },
  });
  if (existingSituation) return "no_trigger";

  // Find or create the "Engagement Risk" SituationType
  const engagementRiskType = await getOrCreateEngagementRiskType(operatorId);

  // Resolve department for the user's entity
  const entity = await prisma.entity.findUnique({
    where: { id: user.entityId },
    select: { parentDepartmentId: true },
  });

  // Create situation
  await prisma.situation.create({
    data: {
      operatorId,
      situationTypeId: engagementRiskType.id,
      triggerEntityId: user.entityId,
      source: "activity_absence",
      status: "detected",
      confidence: 0.7,
      severity: 0.5,
      contextSnapshot: JSON.stringify({
        patterns: triggeredPatterns,
        userId: user.id,
        userName: user.name,
      }),
    },
  });

  // Increment detectedCount
  await prisma.situationType.update({
    where: { id: engagementRiskType.id },
    data: { detectedCount: { increment: 1 } },
  });

  return "situation_created";
}

async function getOrCreateEngagementRiskType(
  operatorId: string,
): Promise<{ id: string }> {
  const existing = await prisma.situationType.findFirst({
    where: { operatorId, name: "Engagement Risk" },
    select: { id: true },
  });
  if (existing) return existing;

  return prisma.situationType.create({
    data: {
      operatorId,
      slug: "engagement-risk",
      name: "Engagement Risk",
      description:
        "Detected significant drop in employee activity patterns that may indicate disengagement, burnout, or other issues requiring attention.",
      detectionLogic: JSON.stringify({
        patterns: ["email_silence", "meeting_dropout", "engagement_decline"],
      }),
      detectedCount: 0,
      confirmedCount: 0,
      dismissedCount: 0,
      promptVersion: 1,
    },
    select: { id: true },
  });
}
