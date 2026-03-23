import { prisma } from "@/lib/db";
import type { AgentTool } from "../types";

const getCalendarPatterns: AgentTool = {
  name: "get_calendar_patterns",
  description:
    "Aggregated calendar intelligence: meeting frequency per person, recurring meeting detection, 1:1 patterns suggesting reporting relationships, and team meeting patterns.",
  parameters: {
    type: "object",
    properties: {
      dateFrom: { type: "string", description: "Start date (ISO format)" },
      dateTo: { type: "string", description: "End date (ISO format)" },
      personEmail: { type: "string", description: "Filter to a specific person's meetings" },
    },
    required: [],
  },
  async handler(args, ctx) {
    const where: Record<string, unknown> = {
      operatorId: ctx.operatorId,
      signalType: { contains: "meeting" },
    };

    if (args.dateFrom || args.dateTo) {
      const occurredAt: Record<string, Date> = {};
      if (args.dateFrom) occurredAt.gte = new Date(args.dateFrom as string);
      if (args.dateTo) occurredAt.lte = new Date(args.dateTo as string);
      where.occurredAt = occurredAt;
    }

    const signals = await prisma.activitySignal.findMany({
      where: where as any,
      orderBy: { occurredAt: "desc" },
      take: 500,
    });

    if (signals.length === 0) {
      return "No meeting/calendar signals found.";
    }

    // Aggregate meeting frequency per actor
    const actorCounts = new Map<string, number>();
    const attendeeSets: string[][] = [];
    const oneOnOnes = new Map<string, number>();
    const teamMeetings: Array<{ attendees: string[]; count: number }> = [];

    for (const sig of signals) {
      if (sig.actorEntityId) {
        actorCounts.set(sig.actorEntityId, (actorCounts.get(sig.actorEntityId) || 0) + 1);
      }

      const meta = sig.metadata ? JSON.parse(sig.metadata) : {};
      const attendees: string[] = meta.attendees || [];
      if (attendees.length > 0) {
        attendeeSets.push(attendees);

        if (attendees.length === 2) {
          const key = attendees.sort().join("|");
          oneOnOnes.set(key, (oneOnOnes.get(key) || 0) + 1);
        }
      }
    }

    // Detect recurring patterns (same attendee set appears multiple times)
    const attendeeSetCounts = new Map<string, { attendees: string[]; count: number }>();
    for (const attendees of attendeeSets) {
      const key = attendees.sort().join("|");
      const existing = attendeeSetCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        attendeeSetCounts.set(key, { attendees, count: 1 });
      }
    }

    for (const entry of attendeeSetCounts.values()) {
      if (entry.count >= 2 && entry.attendees.length >= 3) {
        teamMeetings.push(entry);
      }
    }

    const lines: string[] = [`Calendar Analysis (${signals.length} meetings found):\n`];

    // Meeting frequency
    lines.push("Meeting frequency by person:");
    const sortedActors = [...actorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    for (const [actorId, count] of sortedActors) {
      lines.push(`  ${actorId}: ${count} meetings`);
    }

    // 1:1 patterns
    if (oneOnOnes.size > 0) {
      lines.push("\n1:1 meeting patterns (potential reporting relationships):");
      const sorted = [...oneOnOnes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      for (const [pair, count] of sorted) {
        const [a, b] = pair.split("|");
        lines.push(`  ${a} ↔ ${b}: ${count} 1:1 meetings`);
      }
    }

    // Team meetings
    if (teamMeetings.length > 0) {
      lines.push("\nRecurring team meetings (3+ people, 2+ occurrences):");
      teamMeetings.sort((a, b) => b.count - a.count);
      for (const tm of teamMeetings.slice(0, 10)) {
        lines.push(`  ${tm.attendees.join(", ")}: ${tm.count} meetings`);
      }
    }

    return lines.join("\n");
  },
};

export default getCalendarPatterns;
