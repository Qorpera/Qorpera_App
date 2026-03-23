import { prisma } from "@/lib/db";
import type { AgentTool } from "../types";

const getContentByIds: AgentTool = {
  name: "get_content_by_ids",
  description:
    "Retrieve full text content for specific content chunks by ID. Use when you found something interesting in search results and want the complete text.",
  parameters: {
    type: "object",
    properties: {
      chunkIds: {
        type: "array",
        items: { type: "string" },
        description: "Array of content chunk IDs to retrieve",
      },
    },
    required: ["chunkIds"],
  },
  async handler(args, ctx) {
    const chunkIds = args.chunkIds as string[];
    if (chunkIds.length === 0) {
      return "No chunk IDs provided.";
    }

    // Cap at 20 chunks to avoid excessive output
    const ids = chunkIds.slice(0, 20);

    const chunks = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        content: string;
        sourceType: string;
        sourceId: string;
        metadata: string | null;
        chunkIndex: number;
      }>
    >(
      `SELECT id, content, "sourceType", "sourceId", metadata, "chunkIndex"
       FROM "ContentChunk"
       WHERE "operatorId" = $1 AND id = ANY($2::text[])`,
      ctx.operatorId,
      ids,
    );

    if (chunks.length === 0) {
      return "None of the requested chunks were found.";
    }

    const lines: string[] = [`Retrieved ${chunks.length} content chunks:\n`];

    for (const chunk of chunks) {
      const meta = chunk.metadata ? JSON.parse(chunk.metadata) : {};
      const source = meta.fileName || meta.subject || meta.channel || chunk.sourceType;

      lines.push(`── ${chunk.id} (${chunk.sourceType}: ${source}, chunk ${chunk.chunkIndex}) ──`);
      lines.push(chunk.content);
      lines.push("");
    }

    return lines.join("\n");
  },
};

export default getContentByIds;
