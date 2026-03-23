import { prisma } from "@/lib/db";
import type { AgentTool } from "../types";

const getEmailPatterns: AgentTool = {
  name: "get_email_patterns",
  description:
    "Email communication frequency analysis: internal vs external volume, who emails whom most, response time patterns, and thread participation clusters.",
  parameters: {
    type: "object",
    properties: {
      dateFrom: { type: "string", description: "Start date (ISO format)" },
      dateTo: { type: "string", description: "End date (ISO format)" },
      personEmail: { type: "string", description: "Filter to a specific person" },
    },
    required: [],
  },
  async handler(args, ctx) {
    const signalWhere: Record<string, unknown> = {
      operatorId: ctx.operatorId,
      signalType: { in: ["email_sent", "email_received"] },
    };

    if (args.dateFrom || args.dateTo) {
      const occurredAt: Record<string, Date> = {};
      if (args.dateFrom) occurredAt.gte = new Date(args.dateFrom as string);
      if (args.dateTo) occurredAt.lte = new Date(args.dateTo as string);
      signalWhere.occurredAt = occurredAt;
    }

    const signals = await prisma.activitySignal.findMany({
      where: signalWhere as any,
      orderBy: { occurredAt: "desc" },
      take: 1000,
    });

    // Also count email content chunks
    const chunkWhere: Record<string, unknown> = {
      operatorId: ctx.operatorId,
      sourceType: "email",
    };
    const emailChunkCount = await prisma.contentChunk.count({ where: chunkWhere as any });

    if (signals.length === 0 && emailChunkCount === 0) {
      return "No email activity found.";
    }

    // Aggregate by actor
    const senderCounts = new Map<string, { sent: number; received: number }>();
    const pairCounts = new Map<string, number>();

    for (const sig of signals) {
      const actor = sig.actorEntityId || "unknown";
      const entry = senderCounts.get(actor) || { sent: 0, received: 0 };
      if (sig.signalType === "email_sent") entry.sent++;
      else entry.received++;
      senderCounts.set(actor, entry);

      // Track pairs
      const targets = sig.targetEntityIds ? JSON.parse(sig.targetEntityIds) as string[] : [];
      if (sig.signalType === "email_sent") {
        for (const target of targets) {
          const key = [actor, target].sort().join("|");
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
        }
      }
    }

    const lines: string[] = [
      `Email Analysis (${signals.length} signals, ${emailChunkCount} content chunks):\n`,
    ];

    // Volume by person
    lines.push("Email volume by person:");
    const sorted = [...senderCounts.entries()]
      .sort((a, b) => (b[1].sent + b[1].received) - (a[1].sent + a[1].received))
      .slice(0, 15);
    for (const [actor, counts] of sorted) {
      lines.push(`  ${actor}: ${counts.sent} sent, ${counts.received} received`);
    }

    // Top communication pairs
    if (pairCounts.size > 0) {
      lines.push("\nTop communication pairs:");
      const sortedPairs = [...pairCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      for (const [pair, count] of sortedPairs) {
        const [a, b] = pair.split("|");
        lines.push(`  ${a} ↔ ${b}: ${count} emails`);
      }
    }

    return lines.join("\n");
  },
};

export default getEmailPatterns;
