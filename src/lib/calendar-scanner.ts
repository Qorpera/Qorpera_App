// ── Calendar Scanner ────────────────────────────────────────────────────
// Proactive cron job that scans upcoming calendar events, detects ones
// that need preparation but have none, and feeds them into the enriched
// content detection pipeline as synthetic signals.

import { prisma } from "@/lib/db";
import { evaluateContentForSituations, type CommunicationItem } from "./content-situation-detector";

// ── Config ──────────────────────────────────────────────────────────────

const LOW_PREP_PATTERNS = [
  /\bstandup\b/i, /\bdaily\b/i, /\b1[:\-]1\b/i, /\bone.on.one\b/i,
  /\bsync\b/i, /\bcoffee\b/i, /\bfrokost\b/i, /\bmorgenbriefing\b/i,
  /\bmorgenmøde\b/i, /\bcheck.?in\b/i, /\bcatch.?up\b/i,
];

const HIGH_PREP_PATTERNS = [
  /\bbestyrelse\b/i, /\bboard\b/i, /\breview\b/i, /\baudit\b/i,
  /\bstrategi\b/i, /\bbudget\b/i, /\brapport\b/i, /\bkvartals\b/i,
  /\bfornyelse\b/i, /\brenewal\b/i, /\bkickoff\b/i, /\bplanning\b/i,
  /\binspektion\b/i, /\binspection\b/i, /\bqbr\b/i, /\bgennemgang\b/i,
  /\bpræsentation\b/i, /\bdemo\b/i, /\bworkshop\b/i,
];

const SUBJECT_STRIP_RE = /^(RE|FW|Fwd|SV|VS):\s*/gi;

// ── Types ───────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  daysUntil: number;
  attendees: string[];
  description: string;
  source: "content_chunk" | "activity_signal";
}

// ── Helpers ─────────────────────────────────────────────────────────────

function parseMeta(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function isLowPrepMeeting(title: string): boolean {
  return LOW_PREP_PATTERNS.some(p => p.test(title));
}

function isHighPrepMeeting(title: string): boolean {
  return HIGH_PREP_PATTERNS.some(p => p.test(title));
}

function extractKeywords(title: string): string[] {
  return title
    .replace(SUBJECT_STRIP_RE, "")
    .split(/[\s,;:—–\-/\\]+/)
    .map(w => w.replace(/[^a-zA-ZæøåÆØÅ0-9]/g, "").toLowerCase())
    .filter(w => w.length >= 3);
}

// ── Find Qualifying Events ──────────────────────────────────────────────

async function findQualifyingEvents(operatorId: string): Promise<CalendarEvent[]> {
  const now = new Date();
  const from = new Date(now.getTime() + 3 * 86_400_000);
  const to = new Date(now.getTime() + 14 * 86_400_000);

  // Source A: ContentChunk calendar notes (load recent, filter in JS for future dates)
  const calChunks = await prisma.contentChunk.findMany({
    where: {
      operatorId,
      sourceType: "calendar_note",
      createdAt: { gte: new Date(now.getTime() - 90 * 86_400_000) },
    },
    select: { id: true, content: true, metadata: true, createdAt: true },
  });

  const events: CalendarEvent[] = [];
  const seen = new Set<string>(); // dedup key: "title|date"

  for (const chunk of calChunks) {
    const meta = parseMeta(chunk.metadata);
    const dateStr = (meta.date as string) ?? (meta.start as string) ?? null;
    if (!dateStr) continue;

    const eventDate = new Date(dateStr);
    if (isNaN(eventDate.getTime())) continue;
    if (eventDate < from || eventDate > to) continue;

    const title = (meta.title as string) ?? (meta.subject as string) ?? "";
    if (!title) continue;

    const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / 86_400_000);
    const attendees = Array.isArray(meta.attendees) ? (meta.attendees as string[]) : [];
    const key = `${title.toLowerCase()}|${eventDate.toISOString().slice(0, 10)}`;

    if (seen.has(key)) continue;
    seen.add(key);

    events.push({
      id: chunk.id,
      title,
      date: eventDate.toISOString(),
      daysUntil,
      attendees,
      description: chunk.content.slice(0, 500),
      source: "content_chunk",
    });
  }

  // Source B: ActivitySignal meeting_organized
  const signals = await prisma.activitySignal.findMany({
    where: {
      operatorId,
      signalType: "meeting_organized",
      occurredAt: { gte: from, lte: to },
    },
    take: 50,
  });

  for (const s of signals) {
    const meta = parseMeta(s.metadata);
    const title = (meta.subject as string) ?? (meta.title as string) ?? "";
    if (!title) continue;

    const daysUntil = Math.ceil((s.occurredAt.getTime() - now.getTime()) / 86_400_000);
    const attendees = Array.isArray(meta.attendees) ? (meta.attendees as string[]) : [];
    const key = `${title.toLowerCase()}|${s.occurredAt.toISOString().slice(0, 10)}`;

    if (seen.has(key)) continue;
    seen.add(key);

    events.push({
      id: s.id,
      title,
      date: s.occurredAt.toISOString(),
      daysUntil,
      attendees,
      description: (meta.description as string) ?? "",
      source: "activity_signal",
    });
  }

  // Determine operator's internal domain from users
  const firstUser = await prisma.user.findFirst({
    where: { operatorId, role: { not: "superadmin" } },
    select: { email: true },
  });
  const internalDomain = firstUser?.email.split("@")[1] ?? null;

  // Filter for qualifying events
  return events.filter(e => {
    if (e.attendees.length >= 3) return true;
    if (isHighPrepMeeting(e.title)) return true;
    if (internalDomain && e.attendees.some(a => !a.toLowerCase().endsWith(`@${internalDomain}`))) return true;
    return false;
  });
}

// ── Already Handled Check ───────────────────────────────────────────────

async function isAlreadyHandled(operatorId: string, event: CalendarEvent): Promise<boolean> {
  // Check 1: Initiative with matching title
  const initiative = await prisma.initiative.findFirst({
    where: {
      operatorId,
      status: { notIn: ["rejected", "failed"] },
      rationale: { contains: event.title.slice(0, 50) },
    },
    select: { id: true },
  });
  if (initiative) return true;

  // Check 2: EvaluationLog from a prior proactive scan for this event
  const evalLog = await prisma.evaluationLog.findFirst({
    where: {
      operatorId,
      sourceId: { startsWith: `proactive:${event.id}:` },
      classification: { not: "irrelevant" },
    },
    select: { id: true },
  });
  if (evalLog) return true;

  // Check 3: Situation with triggerEvidence mentioning this event title (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  const situation = await prisma.situation.findFirst({
    where: {
      operatorId,
      createdAt: { gte: sevenDaysAgo },
      triggerEvidence: { contains: event.title.slice(0, 50) },
    },
    select: { id: true },
  });
  if (situation) return true;

  return false;
}

// ── Preparation Check ───────────────────────────────────────────────────

async function hasPreparation(operatorId: string, event: CalendarEvent): Promise<boolean> {
  let signals = 0;
  const keywords = extractKeywords(event.title);
  if (keywords.length === 0) return false;

  // Check 1: Emails with subject matching event title (last 14 days)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000);
  for (const kw of keywords.slice(0, 2)) {
    const emailChunk = await prisma.contentChunk.findFirst({
      where: {
        operatorId,
        sourceType: { in: ["email", "slack_message", "teams_message"] },
        createdAt: { gte: fourteenDaysAgo },
        metadata: { contains: kw },
      },
      select: { id: true },
    });
    if (emailChunk) {
      signals++;
      break; // One email match is enough for this signal type
    }
  }

  // Check 2: Documents modified recently with matching filename
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  for (const kw of keywords.slice(0, 2)) {
    const doc = await prisma.contentChunk.findFirst({
      where: {
        operatorId,
        sourceType: { in: ["drive_doc", "onedrive_doc", "document"] },
        createdAt: { gte: sevenDaysAgo },
        OR: [
          { metadata: { contains: kw } },
          { content: { contains: kw } },
        ],
      },
      select: { id: true },
    });
    if (doc) {
      signals++;
      break;
    }
  }

  // Check 3: Active project with overlapping members and nearby due date
  if (event.attendees.length > 0) {
    const eventDate = new Date(event.date);
    const projectWindow = 7 * 86_400_000;
    const project = await prisma.project.findFirst({
      where: {
        operatorId,
        status: { in: ["draft", "active"] },
        dueDate: {
          gte: new Date(eventDate.getTime() - projectWindow),
          lte: new Date(eventDate.getTime() + projectWindow),
        },
        members: {
          some: {
            user: { email: { in: event.attendees.map(a => a.toLowerCase()) } },
          },
        },
      },
      select: { id: true },
    });
    if (project) signals++;
  }

  return signals >= 2;
}

// ── Build Synthetic Signal ──────────────────────────────────────────────

function buildSyntheticSignal(event: CalendarEvent): CommunicationItem {
  return {
    sourceType: "calendar_proactive",
    sourceId: `proactive:${event.id}:${Date.now()}`,
    content: [
      `Upcoming event requiring preparation: "${event.title}"`,
      `Date: ${event.date} (${event.daysUntil} days from now)`,
      `Attendees: ${event.attendees.join(", ")}`,
      event.description ? `Description: ${event.description}` : null,
      ``,
      `No preparation activity has been detected for this event.`,
      `Consider whether deliverables, reports, or materials need to be prepared.`,
    ].filter(Boolean).join("\n"),
    metadata: {
      title: event.title,
      date: event.date,
      attendees: event.attendees,
      description: event.description,
      proactive: true,
      daysUntilEvent: event.daysUntil,
      from: "system:calendar-scanner",
    },
    participantEmails: event.attendees,
  };
}

// ── Main Entry Point ────────────────────────────────────────────────────

export async function runCalendarScanner(operatorId: string): Promise<{
  eventsScanned: number;
  syntheticSignalsSent: number;
  skippedAlreadyHandled: number;
  skippedHasPreparation: number;
  skippedLowPrep: number;
}> {
  const stats = {
    eventsScanned: 0,
    syntheticSignalsSent: 0,
    skippedAlreadyHandled: 0,
    skippedHasPreparation: 0,
    skippedLowPrep: 0,
  };

  const events = await findQualifyingEvents(operatorId);

  for (const event of events) {
    stats.eventsScanned++;

    if (isLowPrepMeeting(event.title)) {
      stats.skippedLowPrep++;
      continue;
    }

    if (await isAlreadyHandled(operatorId, event)) {
      stats.skippedAlreadyHandled++;
      continue;
    }

    if (await hasPreparation(operatorId, event)) {
      stats.skippedHasPreparation++;
      continue;
    }

    const signal = buildSyntheticSignal(event);
    try {
      await evaluateContentForSituations(operatorId, [signal]);
      stats.syntheticSignalsSent++;
    } catch (err) {
      console.error(`[calendar-scanner] Failed to evaluate synthetic signal for "${event.title}":`, err);
    }
  }

  console.log(`[calendar-scanner] Operator ${operatorId}: scanned ${stats.eventsScanned}, sent ${stats.syntheticSignalsSent} synthetic signals`);
  return stats;
}
