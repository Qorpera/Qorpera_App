// ── Detection Enrichment ────────────────────────────────────────────────
// Context enrichment layer that runs before the content classifier.
// Assembles surrounding context (calendar, threads, activity, documents,
// projects) so the classifier sees more than a single message in isolation.

import { prisma } from "@/lib/db";
import { resolveEntity } from "@/lib/entity-resolution";
import type { CommunicationItem } from "./content-situation-detector";

// ── Types ───────────────────────────────────────────────────────────────

export interface EnrichedSignalContext {
  signal: CommunicationItem;

  relatedCalendarEvents: Array<{
    title: string;
    date: string;
    attendees: string[];
    description?: string;
    daysUntil: number;
  }>;

  threadHistory: Array<{
    from: string;
    date: string;
    subject?: string;
    contentSnippet: string;
  }>;

  recentActorActivity: Array<{
    type: string;
    date: string;
    summary: string;
  }>;

  relatedDocuments: Array<{
    fileName: string;
    author: string;
    lastModified: string;
    contentSnippet?: string;
  }>;

  activeProjects: Array<{
    name: string;
    status: string;
    memberCount: number;
    deliverableCount: number;
    dueDate?: string;
  }>;
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

export function extractAllParticipantEmails(item: CommunicationItem): string[] {
  const emails = new Set<string>();
  const meta = item.metadata ?? {};

  // Direct participant list
  if (item.participantEmails) {
    for (const e of item.participantEmails) {
      if (e) emails.add(e.toLowerCase().trim());
    }
  }

  // Metadata fields that may contain email addresses
  for (const key of ["from", "sender", "authorEmail", "to", "cc", "bcc"] as const) {
    const val = meta[key];
    if (typeof val === "string" && val.includes("@")) {
      emails.add(val.toLowerCase().trim());
    } else if (Array.isArray(val)) {
      for (const v of val) {
        if (typeof v === "string" && v.includes("@")) {
          emails.add(v.toLowerCase().trim());
        }
      }
    }
  }

  return [...emails];
}

export async function resolveParticipantEntities(
  operatorId: string,
  emails: string[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const email of emails) {
    const entityId = await resolveEntity(operatorId, {
      identityValues: { email },
    });
    if (entityId) ids.push(entityId);
  }
  return [...new Set(ids)];
}

// ── Data Loaders ────────────────────────────────────────────────────────

async function loadRelatedCalendarEvents(
  operatorId: string,
  participantEntityIds: string[],
  minDays: number,
  maxDays: number,
): Promise<EnrichedSignalContext["relatedCalendarEvents"]> {
  const now = new Date();
  const from = new Date(now.getTime() + minDays * 86_400_000);
  const to = new Date(now.getTime() + maxDays * 86_400_000);

  // Approach 1: ActivitySignals for future meetings
  const signals = await prisma.activitySignal.findMany({
    where: {
      operatorId,
      signalType: { in: ["meeting_organized", "meeting_attended"] },
      occurredAt: { gte: from, lte: to },
      ...(participantEntityIds.length > 0
        ? { actorEntityId: { in: participantEntityIds } }
        : {}),
    },
    orderBy: { occurredAt: "asc" },
    take: 10,
  });

  const events: EnrichedSignalContext["relatedCalendarEvents"] = [];

  for (const s of signals) {
    const meta = parseMeta(s.metadata);
    const date = s.occurredAt.toISOString();
    const daysUntil = Math.ceil((s.occurredAt.getTime() - now.getTime()) / 86_400_000);

    events.push({
      title: (meta.subject as string) ?? (meta.title as string) ?? s.signalType,
      date,
      attendees: Array.isArray(meta.attendees)
        ? (meta.attendees as string[])
        : [],
      description: (meta.description as string) ?? undefined,
      daysUntil,
    });
  }

  // Approach 2: Calendar raw content with future dates
  if (events.length < 10) {
    const calItems = await prisma.rawContent.findMany({
      where: {
        operatorId,
        sourceType: { in: ["calendar_note", "calendar_event"] },
        occurredAt: { gte: new Date(now.getTime() - 90 * 86_400_000) },
        rawBody: { not: null },
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
      select: { id: true, rawBody: true, rawMetadata: true, occurredAt: true },
    });

    for (const item of calItems) {
      const meta = (item.rawMetadata ?? {}) as Record<string, unknown>;
      const date = (meta.date as string) ?? (meta.start as string) ?? item.occurredAt.toISOString();
      const eventDate = new Date(date);
      const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / 86_400_000);

      if (daysUntil >= minDays && daysUntil <= maxDays) {
        events.push({
          title: (meta.subject as string) ?? (meta.title as string) ?? "Calendar event",
          date,
          attendees: Array.isArray(meta.attendees)
            ? (meta.attendees as string[])
            : [],
          description: (item.rawBody ?? "").slice(0, 300) || undefined,
          daysUntil,
        });
      }
    }
  }

  return events.slice(0, 10);
}

async function loadThreadHistory(
  operatorId: string,
  item: CommunicationItem,
  limit: number,
): Promise<EnrichedSignalContext["threadHistory"]> {
  const meta = item.metadata ?? {};
  const threadId = (meta.threadId as string) ?? (meta.thread_id as string) ?? null;
  const subject = (meta.subject as string) ?? null;

  if (!threadId && !subject) return [];

  let rawItems: Array<{ rawBody: string | null; rawMetadata: unknown; occurredAt: Date }>;

  if (threadId) {
    // Find raw content whose metadata JSON contains the same threadId
    rawItems = await prisma.rawContent.findMany({
      where: {
        operatorId,
        sourceType: { in: ["email", "slack_message", "teams_message"] },
        sourceId: { not: item.sourceId },
        rawBody: { not: null },
        OR: [
          { rawMetadata: { path: ["threadId"], equals: threadId } },
          { rawMetadata: { string_contains: threadId } },
        ],
      },
      orderBy: { occurredAt: "desc" },
      take: limit,
      select: { rawBody: true, rawMetadata: true, occurredAt: true },
    });
  } else {
    // Fall back to subject matching: strip RE:/FW: prefixes
    const cleanSubject = subject!
      .replace(/^(RE|FW|Fwd|SV|VS):\s*/gi, "")
      .trim();

    if (cleanSubject.length < 3) return [];

    rawItems = await prisma.rawContent.findMany({
      where: {
        operatorId,
        sourceType: { in: ["email", "slack_message", "teams_message"] },
        sourceId: { not: item.sourceId },
        rawBody: { not: null },
        rawMetadata: { string_contains: cleanSubject },
      },
      orderBy: { occurredAt: "desc" },
      take: limit,
      select: { rawBody: true, rawMetadata: true, occurredAt: true },
    });
  }

  return rawItems.map((r) => {
    const m = (r.rawMetadata ?? {}) as Record<string, unknown>;
    return {
      from: (m.from as string) ?? (m.sender as string) ?? (m.authorEmail as string) ?? "unknown",
      date: r.occurredAt.toISOString(),
      subject: (m.subject as string) ?? undefined,
      contentSnippet: (r.rawBody ?? "").slice(0, 500),
    };
  });
}

async function loadRecentActorActivity(
  operatorId: string,
  actorEntityId: string,
  days: number,
): Promise<EnrichedSignalContext["recentActorActivity"]> {
  const since = new Date(Date.now() - days * 86_400_000);

  const signals = await prisma.activitySignal.findMany({
    where: {
      operatorId,
      actorEntityId,
      occurredAt: { gte: since },
    },
    orderBy: { occurredAt: "desc" },
    take: 15,
  });

  return signals.map((s) => {
    const meta = parseMeta(s.metadata);
    const parts: string[] = [s.signalType.replace(/_/g, " ")];
    if (meta.subject) parts.push(`"${meta.subject}"`);
    if (meta.channel) parts.push(`in ${meta.channel}`);
    if (meta.file_name) parts.push(`file: ${meta.file_name}`);

    return {
      type: s.signalType,
      date: s.occurredAt.toISOString(),
      summary: parts.join(" — "),
    };
  });
}

async function loadRelatedDocuments(
  operatorId: string,
  participantEntityIds: string[],
  subjectKeywords: string[],
): Promise<EnrichedSignalContext["relatedDocuments"]> {
  const docSourceTypes = ["drive_doc", "onedrive_doc", "document", "file"];

  // Strategy 1: Documents matching subject keywords
  let keywordDocs: Array<{ id: string; rawBody: string | null; rawMetadata: unknown; occurredAt: Date }> = [];
  if (subjectKeywords.length > 0) {
    for (const kw of subjectKeywords.slice(0, 3)) {
      if (keywordDocs.length >= 8) break;
      const found = await prisma.rawContent.findMany({
        where: {
          operatorId,
          sourceType: { in: docSourceTypes },
          id: { notIn: keywordDocs.map((c) => c.id) },
          rawBody: { not: null },
          OR: [
            { rawBody: { contains: kw, mode: "insensitive" } },
            { rawMetadata: { string_contains: kw } },
          ],
        },
        orderBy: { occurredAt: "desc" },
        take: 8 - keywordDocs.length,
        select: { id: true, rawBody: true, rawMetadata: true, occurredAt: true },
      });
      keywordDocs.push(...found);
    }
  }

  const allDocs = keywordDocs.slice(0, 8);

  return allDocs.map((r) => {
    const m = (r.rawMetadata ?? {}) as Record<string, unknown>;
    return {
      fileName: (m.fileName as string) ?? (m.file_name as string) ?? (m.title as string) ?? "Untitled",
      author: (m.author as string) ?? (m.authorEmail as string) ?? "unknown",
      lastModified: (m.lastModified as string) ?? r.occurredAt.toISOString(),
      contentSnippet: (r.rawBody ?? "").slice(0, 300) || undefined,
    };
  });
}

async function loadActiveProjects(
  operatorId: string,
  participantEntityIds: string[],
): Promise<EnrichedSignalContext["activeProjects"]> {
  if (participantEntityIds.length === 0) return [];

  // Map participant entity IDs to user IDs (entity → user link)
  const users = await prisma.user.findMany({
    where: {
      operatorId,
      entityId: { in: participantEntityIds },
    },
    select: { id: true },
  });

  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return [];

  // Find active projects with any of these users as members
  const projects = await prisma.project.findMany({
    where: {
      operatorId,
      status: { in: ["draft", "active"] },
      members: { some: { userId: { in: userIds } } },
    },
    select: {
      id: true,
      name: true,
      status: true,
      dueDate: true,
      _count: {
        select: {
          members: true,
          deliverables: true,
        },
      },
    },
    take: 5,
  });

  return projects.map((p) => ({
    name: p.name,
    status: p.status,
    memberCount: p._count.members,
    deliverableCount: p._count.deliverables,
    dueDate: p.dueDate?.toISOString() ?? undefined,
  }));
}

// ── Subject keyword extraction ──────────────────────────────────────────

const STOP_WORDS = new Set([
  "re", "fw", "fwd", "sv", "vs", "the", "a", "an", "and", "or", "is",
  "in", "on", "at", "to", "for", "of", "with", "from", "by", "it",
  "this", "that", "be", "are", "was", "were", "been", "have", "has",
  "had", "do", "does", "did", "will", "would", "can", "could", "should",
  "may", "might", "shall", "not", "no", "but", "if", "so", "up",
  "out", "about", "just", "get", "got", "all", "our", "we", "you",
  "your", "my", "me", "hi", "hey", "hello", "thanks", "thank",
  "da", "og", "er", "en", "et", "den", "det", "til", "fra", "med",
  "på", "af", "som", "vi", "har", "kan", "skal", "vil",
]);

function extractSubjectKeywords(item: CommunicationItem): string[] {
  const meta = item.metadata ?? {};
  const subject = (meta.subject as string) ?? "";
  if (!subject) return [];

  return subject
    .replace(/^(RE|FW|Fwd|SV|VS):\s*/gi, "")
    .split(/[\s,;:—–\-/\\]+/)
    .map((w) => w.replace(/[^a-zA-ZæøåÆØÅ0-9]/g, "").toLowerCase())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

// ── Main Function ───────────────────────────────────────────────────────

export async function enrichSignalContext(
  operatorId: string,
  item: CommunicationItem,
  actorEntityId: string,
): Promise<EnrichedSignalContext> {
  const emails = extractAllParticipantEmails(item);
  const participantEntityIds = await resolveParticipantEntities(operatorId, emails);

  // Ensure the actor is included
  if (!participantEntityIds.includes(actorEntityId)) {
    participantEntityIds.push(actorEntityId);
  }

  const subjectKeywords = extractSubjectKeywords(item);

  const [
    relatedCalendarEvents,
    threadHistory,
    recentActorActivity,
    relatedDocuments,
    activeProjects,
  ] = await Promise.all([
    loadRelatedCalendarEvents(operatorId, participantEntityIds, 3, 14).catch(
      (err) => {
        console.warn("[detection-enrichment] Calendar loader failed:", err);
        return [] as EnrichedSignalContext["relatedCalendarEvents"];
      },
    ),
    loadThreadHistory(operatorId, item, 10).catch((err) => {
      console.warn("[detection-enrichment] Thread history loader failed:", err);
      return [] as EnrichedSignalContext["threadHistory"];
    }),
    loadRecentActorActivity(operatorId, actorEntityId, 7).catch((err) => {
      console.warn("[detection-enrichment] Actor activity loader failed:", err);
      return [] as EnrichedSignalContext["recentActorActivity"];
    }),
    loadRelatedDocuments(operatorId, participantEntityIds, subjectKeywords).catch(
      (err) => {
        console.warn("[detection-enrichment] Document loader failed:", err);
        return [] as EnrichedSignalContext["relatedDocuments"];
      },
    ),
    loadActiveProjects(operatorId, participantEntityIds).catch((err) => {
      console.warn("[detection-enrichment] Projects loader failed:", err);
      return [] as EnrichedSignalContext["activeProjects"];
    }),
  ]);

  return {
    signal: item,
    relatedCalendarEvents,
    threadHistory,
    recentActorActivity,
    relatedDocuments,
    activeProjects,
  };
}
