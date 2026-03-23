import { prisma } from "@/lib/db";
import type { AgentTool } from "../types";

const getDocumentList: AgentTool = {
  name: "get_document_list",
  description:
    "List all synced documents with metadata: filename, type, last modified, author/uploader, department, and a short content preview.",
  parameters: {
    type: "object",
    properties: {
      sortBy: {
        type: "string",
        enum: ["recent", "name", "type"],
        description: "Sort order (default: recent)",
      },
      limit: { type: "number", description: "Max results (default 50)" },
    },
    required: [],
  },
  async handler(args, ctx) {
    const limit = Math.min((args.limit as number) || 50, 200);
    const sortBy = (args.sortBy as string) || "recent";

    const orderBy: Record<string, string> =
      sortBy === "name"
        ? { fileName: "asc" }
        : sortBy === "type"
          ? { documentType: "asc" }
          : { updatedAt: "desc" };

    const docs = await prisma.internalDocument.findMany({
      where: { operatorId: ctx.operatorId },
      orderBy: orderBy as any,
      take: limit,
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        documentType: true,
        status: true,
        departmentId: true,
        rawText: true,
        businessContext: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (docs.length === 0) {
      return "No documents found.";
    }

    const lines: string[] = [`Found ${docs.length} documents:\n`];

    for (const doc of docs) {
      lines.push(`${doc.fileName} [${doc.documentType || doc.mimeType}]`);
      lines.push(`  Status: ${doc.status} | Modified: ${doc.updatedAt.toISOString().slice(0, 10)}`);
      if (doc.departmentId) lines.push(`  Department: ${doc.departmentId}`);
      if (doc.businessContext) {
        lines.push(`  Context: ${doc.businessContext.slice(0, 150)}${doc.businessContext.length > 150 ? "..." : ""}`);
      } else if (doc.rawText) {
        lines.push(`  Preview: ${doc.rawText.slice(0, 150)}${doc.rawText.length > 150 ? "..." : ""}`);
      }
      lines.push(`  ID: ${doc.id}`);
      lines.push("");
    }

    return lines.join("\n");
  },
};

export default getDocumentList;
