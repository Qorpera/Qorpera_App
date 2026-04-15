import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

  const weekOf = request.nextUrl.searchParams.get("weekOf");
  if (!weekOf) {
    return NextResponse.json({ error: "weekOf parameter required" }, { status: 400 });
  }

  const weekStart = new Date(weekOf + "T00:00:00Z");
  if (isNaN(weekStart.getTime())) {
    return NextResponse.json({ error: "Invalid weekOf date" }, { status: 400 });
  }
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);

  // Query calendar raw content
  const calendarItems = await prisma.rawContent.findMany({
    where: {
      operatorId,
      sourceType: { in: ["calendar_event", "calendar_note"] },
      occurredAt: { gte: new Date(weekStart.getTime() - 90 * 86_400_000) },
    },
    select: {
      id: true,
      rawBody: true,
      rawMetadata: true,
      occurredAt: true,
    },
  });

  // Build event map keyed by eventId for deduplication
  const eventMap = new Map<string, CalendarEvent>();

  // Calendar events are personal (user's own calendar) — no domain scoping needed
  for (const item of calendarItems) {
    const meta = (item.rawMetadata ?? {}) as Record<string, unknown>;
    const eventId = (meta.eventId as string) || (meta.sourceId as string) || item.id;

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
      id: item.id,
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
