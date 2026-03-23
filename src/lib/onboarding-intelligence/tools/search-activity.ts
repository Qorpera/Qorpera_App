import { prisma } from "@/lib/db";
import type { AgentTool } from "../types";

const searchActivity: AgentTool = {
  name: "search_activity",
  description:
    "Query activity signals (email sends, Slack messages, meetings, doc edits). Useful for communication frequency analysis, meeting patterns, and behavioral insights.",
  parameters: {
    type: "object",
    properties: {
      userEmail: { type: "string", description: "Filter by actor email" },
      signalType: {
        type: "string",
        description: "Filter by signal type (email_sent, email_received, slack_message, doc_edit, meeting_held, doc_created, doc_shared)",
      },
      dateFrom: { type: "string", description: "Start date (ISO format)" },
      dateTo: { type: "string", description: "End date (ISO format)" },
      limit: { type: "number", description: "Max results (default 50)" },
    },
    required: [],
  },
  async handler(args, ctx) {
    const limit = Math.min((args.limit as number) || 50, 200);

    // Build where clause
    const where: Record<string, unknown> = { operatorId: ctx.operatorId };

    if (args.signalType) {
      where.signalType = args.signalType as string;
    }

    if (args.dateFrom || args.dateTo) {
      const occurredAt: Record<string, Date> = {};
      if (args.dateFrom) occurredAt.gte = new Date(args.dateFrom as string);
      if (args.dateTo) occurredAt.lte = new Date(args.dateTo as string);
      where.occurredAt = occurredAt;
    }

    // If filtering by email, find entity first
    if (args.userEmail) {
      const entity = await prisma.entity.findFirst({
        where: {
          operatorId: ctx.operatorId,
          status: "active",
          mergedIntoId: null,
          propertyValues: { some: { value: args.userEmail as string } },
        },
        select: { id: true },
      });
      if (entity) {
        where.actorEntityId = entity.id;
      }
    }

    const signals = await prisma.activitySignal.findMany({
      where: where as any,
      orderBy: { occurredAt: "desc" },
      take: limit,
    });

    if (signals.length === 0) {
      return "No activity signals found matching the criteria.";
    }

    const lines: string[] = [`Found ${signals.length} activity signals:\n`];

    for (const sig of signals) {
      const meta = sig.metadata ? JSON.parse(sig.metadata) : {};
      const date = sig.occurredAt.toISOString().slice(0, 16).replace("T", " ");
      const details: string[] = [];
      if (meta.channel) details.push(`channel: ${meta.channel}`);
      if (meta.subject) details.push(`subject: ${meta.subject}`);
      if (meta.file_name) details.push(`file: ${meta.file_name}`);
      if (meta.attendees) details.push(`attendees: ${meta.attendees.length}`);

      lines.push(`[${date}] ${sig.signalType}${details.length ? ` (${details.join(", ")})` : ""}`);
      if (sig.actorEntityId) lines.push(`  Actor: ${sig.actorEntityId}`);
    }

    return lines.join("\n");
  },
};

export default searchActivity;
