import { retrieveRelevantChunks } from "@/lib/rag/retriever";
import { embedChunks } from "@/lib/rag/embedder";
import type { AgentTool } from "../types";

const searchContent: AgentTool = {
  name: "search_content",
  description:
    "Semantic search over all synced content (emails, documents, Slack messages, Drive files). Returns relevant excerpts with source attribution and timestamps.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      sourceType: {
        type: "string",
        enum: ["email", "slack_message", "drive_doc", "uploaded_doc", "calendar_note"],
        description: "Filter by content source type",
      },
      limit: { type: "number", description: "Max results (default 10)" },
    },
    required: ["query"],
  },
  async handler(args, ctx) {
    const query = args.query as string;
    const sourceType = args.sourceType as string | undefined;
    const limit = (args.limit as number) || 10;

    const [queryEmbedding] = await embedChunks([query]);
    if (!queryEmbedding) {
      return `No embedding provider configured — cannot search content.`;
    }

    const results = await retrieveRelevantChunks(ctx.operatorId, queryEmbedding, {
      limit,
      sourceTypes: sourceType ? [sourceType] : undefined,
      minScore: 0.3,
    });

    if (results.length === 0) {
      return `No content found matching "${query}".`;
    }

    const lines: string[] = [`Found ${results.length} relevant content chunks for "${query}":\n`];

    for (const r of results) {
      const meta = r.metadata as Record<string, unknown> | null;
      const source = meta?.fileName || meta?.subject || meta?.channel || r.sourceType;
      const sender = meta?.sender || meta?.author || "unknown";
      const date = meta?.timestamp || meta?.date || "";
      const score = (r.score * 100).toFixed(0);

      lines.push(`[${r.sourceType}] ${source} (${score}% match)`);
      lines.push(`  From: ${sender}${date ? ` | Date: ${date}` : ""}`);
      lines.push(`  ${r.content.slice(0, 300)}${r.content.length > 300 ? "..." : ""}`);
      lines.push(`  Chunk ID: ${r.id}`);
      lines.push("");
    }

    return lines.join("\n");
  },
};

export default searchContent;
