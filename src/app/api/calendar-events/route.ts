import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  attendees: string[];
  location?: string;
  isAllDay: boolean;
}

export async function GET(request: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const visibleDepts = await getVisibleDepartmentIds(operatorId, su.effectiveUserId);

  const weekOf = request.nextUrl.searchParams.get("weekOf");
  if (!weekOf) {
    return NextResponse.json({ error: "weekOf parameter required" }, { status: 400 });
  }

  const weekStart = new Date(weekOf + "T00:00:00Z");
  if (isNaN(weekStart.getTime())) {
    return NextResponse.json({ error: "Invalid weekOf date" }, { status: 400 });
  }
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);

  // Query both sources in parallel
  const [activitySignals, contentChunks] = await Promise.all([
    prisma.activitySignal.findMany({
      where: {
        operatorId,
        signalType: "meeting_held",
        occurredAt: { gte: weekStart, lt: weekEnd },
      },
      orderBy: { occurredAt: "asc" },
      select: {
        id: true,
        actorEntityId: true,
        metadata: true,
        occurredAt: true,
        departmentIds: true,
      },
    }),
    prisma.contentChunk.findMany({
      where: {
        operatorId,
        sourceType: { in: ["calendar_note", "calendar_event"] },
        createdAt: { gte: new Date(weekStart.getTime() - 90 * 86_400_000) },
      },
      select: {
        id: true,
        content: true,
        metadata: true,
        createdAt: true,
        departmentIds: true,
      },
    }),
  ]);

  // Scope filter: members only see events in their visible departments
  const isScoped = visibleDepts !== "all";
  const visibleSet = isScoped ? new Set(visibleDepts) : null;

  function passesScope(departmentIds: string | null): boolean {
    if (!isScoped || !visibleSet) return true;
    if (!departmentIds) return true; // unrouted events visible to all
    try {
      const ids: string[] = JSON.parse(departmentIds);
      return ids.some((id) => visibleSet.has(id));
    } catch {
      return true;
    }
  }

  // Build event map keyed by eventId for deduplication
  const eventMap = new Map<string, CalendarEvent>();

  // 1. ActivitySignals (preferred source)
  for (const sig of activitySignals) {
    if (!passesScope(sig.departmentIds)) continue;
    const meta = parseJson(sig.metadata);
    const eventId = (meta.eventId as string) || sig.id;
    const duration = (meta.durationMinutes as number) || null;
    const startTime = sig.occurredAt.toISOString();
    const endTime = duration
      ? new Date(sig.occurredAt.getTime() + duration * 60_000).toISOString()
      : null;

    eventMap.set(eventId, {
      id: sig.id,
      title: (meta.summary as string) || "Meeting",
      startTime,
      endTime,
      durationMinutes: duration,
      attendees: parseAttendees(meta),
      location: (meta.location as string) || undefined,
      isAllDay: false,
    });
  }

  // 2. ContentChunks (fill gaps)
  for (const chunk of contentChunks) {
    if (!passesScope(chunk.departmentIds)) continue;
    const meta = parseJson(chunk.metadata);
    const eventId = (meta.eventId as string) || (meta.sourceId as string) || chunk.id;

    // Skip if already have from ActivitySignal
    if (eventMap.has(eventId)) continue;

    // Parse start time from metadata
    const rawStart = (meta.startTime as string) || (meta.date as string) || (meta.start as string);
    if (!rawStart) continue;
    const startDate = new Date(rawStart);
    if (isNaN(startDate.getTime())) continue;

    // Filter to target week
    if (startDate < weekStart || startDate >= weekEnd) continue;

    const duration = (meta.durationMinutes as number) || null;
    const endTimeRaw = (meta.endTime as string) || (meta.end as string);
    let endTime: string | null = null;
    if (endTimeRaw) {
      endTime = new Date(endTimeRaw).toISOString();
    } else if (duration) {
      endTime = new Date(startDate.getTime() + duration * 60_000).toISOString();
    }

    const title = (meta.summary as string) || (meta.subject as string) || (meta.title as string) || "Event";
    const isAllDay = !!(meta.isAllDay || meta.allDay);

    eventMap.set(eventId, {
      id: chunk.id,
      title,
      startTime: startDate.toISOString(),
      endTime,
      durationMinutes: duration || (endTime ? Math.round((new Date(endTime).getTime() - startDate.getTime()) / 60_000) : null),
      attendees: parseAttendees(meta),
      location: (meta.location as string) || undefined,
      isAllDay,
    });
  }

  return NextResponse.json({
    events: [...eventMap.values()],
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    source: "ingested" as const,
  });
}

function parseJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return typeof raw === "object" ? (raw as Record<string, unknown>) : JSON.parse(raw);
  } catch {
    return {};
  }
}

function parseAttendees(meta: Record<string, unknown>): string[] {
  const raw = meta.attendees ?? meta.attendeeEmails ?? meta.participants;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed.map(String); } catch { /* ignore */ }
    return raw.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean);
  }
  return [];
}
