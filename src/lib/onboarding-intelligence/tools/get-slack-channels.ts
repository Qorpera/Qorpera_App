import { prisma } from "@/lib/db";
import type { AgentTool } from "../types";

const getSlackChannels: AgentTool = {
  name: "get_slack_channels",
  description:
    "Slack channel listing with membership and activity: channel names, message counts, unique participants, and last active date.",
  parameters: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Max channels to return (default 50)" },
    },
    required: [],
  },
  async handler(args, ctx) {
    const limit = Math.min((args.limit as number) || 50, 100);

    // Query content chunks grouped by Slack channel via metadata
    const chunks = await prisma.$queryRawUnsafe<
      Array<{
        channel: string;
        messageCount: bigint;
        uniqueUsers: bigint;
        lastActive: Date;
      }>
    >(
      `SELECT
         metadata::jsonb->>'channel' as channel,
         COUNT(*) as "messageCount",
         COUNT(DISTINCT metadata::jsonb->>'sender') as "uniqueUsers",
         MAX("createdAt") as "lastActive"
       FROM "ContentChunk"
       WHERE "operatorId" = $1
         AND "sourceType" = 'slack_message'
         AND metadata::jsonb->>'channel' IS NOT NULL
       GROUP BY metadata::jsonb->>'channel'
       ORDER BY COUNT(*) DESC
       LIMIT $2`,
      ctx.operatorId,
      limit,
    );

    if (chunks.length === 0) {
      return "No Slack channel data found.";
    }

    const lines: string[] = [`Found ${chunks.length} Slack channels:\n`];

    for (const ch of chunks) {
      const lastDate = ch.lastActive ? new Date(ch.lastActive).toISOString().slice(0, 10) : "unknown";
      lines.push(
        `#${ch.channel}: ${Number(ch.messageCount)} messages, ${Number(ch.uniqueUsers)} participants, last active ${lastDate}`,
      );
    }

    return lines.join("\n");
  },
};

export default getSlackChannels;
