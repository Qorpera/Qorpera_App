/**
 * Project-scoped tools for the deliverable generation agent.
 *
 * These tools give the agent access to project documents, the compiled
 * knowledge index, and the organizational wiki / entity graph.
 */

import { prisma } from "@/lib/db";
import type { AITool } from "@/lib/ai-provider";
import { embedChunks } from "@/lib/rag/embedder";
import { retrieveRelevantChunks } from "@/lib/rag/retriever";

// ── Tool Definitions ────────────���───────────────────────────────────────────

export const PROJECT_TOOLS: AITool[] = [
  {
    name: "search_project_documents",
    description:
      "Search through all documents uploaded to this project. Returns matching chunks with relevance scores.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        maxResults: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "read_document_chunk",
    description:
      "Read a specific document chunk by ID. Returns the full text content.",
    parameters: {
      type: "object",
      properties: {
        chunkId: { type: "string", description: "ContentChunk ID" },
      },
      required: ["chunkId"],
    },
  },
  {
    name: "list_project_documents",
    description:
      "List all documents uploaded to this project with file names, types, and sizes.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "read_document_full",
    description:
      "Read all chunks of a specific document in order. Use for complete document review.",
    parameters: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "InternalDocument ID (sourceId)" },
      },
      required: ["documentId"],
    },
  },
  {
    name: "get_knowledge_index",
    description:
      "Get the compiled knowledge index for this project — document inventory, entities, cross-references, contradictions, and gaps.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];

// Names for quick lookup
const PROJECT_TOOL_NAMES = new Set(PROJECT_TOOLS.map((t) => t.name));
export function isProjectTool(toolName: string): boolean {
  return PROJECT_TOOL_NAMES.has(toolName);
}

// ── Dispatch ─────────��──────────────────────────────────────────────────────

const MAX_RESULT_CHARS = 12_000;

function capResult(text: string): string {
  if (text.length <= MAX_RESULT_CHARS) return text;
  return text.slice(0, MAX_RESULT_CHARS) + "\n\n[Result truncated. Narrow your query for more specific results.]";
}

export async function executeProjectTool(
  operatorId: string,
  projectId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    switch (toolName) {
      case "search_project_documents":
        return capResult(await executeSearchProjectDocuments(operatorId, projectId, args));
      case "read_document_chunk":
        return capResult(await executeReadDocumentChunk(operatorId, projectId, args));
      case "list_project_documents":
        return capResult(await executeListProjectDocuments(operatorId, projectId));
      case "read_document_full":
        return capResult(await executeReadDocumentFull(operatorId, projectId, args));
      case "get_knowledge_index":
        return capResult(await executeGetKnowledgeIndex(projectId));
      default:
        return `Unknown project tool: "${toolName}". Available: ${PROJECT_TOOLS.map((t) => t.name).join(", ")}`;
    }
  } catch (err) {
    console.error(`[project-tools] ${toolName} failed:`, err);
    return `Tool "${toolName}" encountered an error: ${err instanceof Error ? err.message : "unknown error"}. You may retry with different arguments.`;
  }
}

// ── Implementations ─────���────────────────────��──────────────────────────────

async function executeSearchProjectDocuments(
  operatorId: string,
  projectId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const query = String(args.query ?? "");
  const maxResults = typeof args.maxResults === "number" ? Math.min(args.maxResults, 20) : 10;

  const [embedding] = await embedChunks([query]);
  if (!embedding) return "Could not process search query.";

  const chunks = await retrieveRelevantChunks(operatorId, embedding, {
    limit: maxResults,
    projectId,
    skipUserFilter: true,
  });

  if (chunks.length === 0) return `No project documents found matching "${query}".`;

  const lines: string[] = [`Found ${chunks.length} matching chunks:`];
  for (const chunk of chunks) {
    const sourceName = chunk.metadata && typeof chunk.metadata === "object" && "name" in chunk.metadata
      ? String(chunk.metadata.name)
      : chunk.sourceId;
    lines.push(`\n[${chunk.sourceType}] ${sourceName} (chunk ${chunk.chunkIndex}) — Score: ${chunk.score.toFixed(2)}`);
    lines.push(`Chunk ID: ${chunk.id}`);
    lines.push(chunk.content.slice(0, 800));
  }

  return lines.join("\n");
}

async function executeReadDocumentChunk(
  operatorId: string,
  projectId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const chunkId = String(args.chunkId ?? "");

  const chunk = await prisma.contentChunk.findFirst({
    where: { id: chunkId, operatorId, projectId },
    select: { id: true, content: true, sourceType: true, sourceId: true, chunkIndex: true, metadata: true },
  });

  if (!chunk) return `Chunk "${chunkId}" not found in this project.`;

  const sourceName = chunk.metadata && typeof chunk.metadata === "object" && "name" in (chunk.metadata as Record<string, unknown>)
    ? String((chunk.metadata as Record<string, unknown>).name)
    : chunk.sourceId;

  return [
    `Source: ${sourceName} [${chunk.sourceType}]`,
    `Chunk: ${chunk.chunkIndex}`,
    `---`,
    chunk.content,
  ].join("\n");
}

async function executeListProjectDocuments(
  operatorId: string,
  projectId: string,
): Promise<string> {
  const docs = await prisma.internalDocument.findMany({
    where: { projectId, operatorId },
    select: { id: true, fileName: true, mimeType: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (docs.length === 0) return "No documents uploaded to this project.";

  // Get chunk counts per document
  const chunkCounts = await prisma.contentChunk.groupBy({
    by: ["sourceId"],
    where: { projectId, operatorId },
    _count: { id: true },
  });
  const countMap = new Map(chunkCounts.map((c) => [c.sourceId, c._count.id]));

  const lines: string[] = [`${docs.length} documents in this project:`];
  for (const doc of docs) {
    const chunks = countMap.get(doc.id) ?? 0;
    lines.push(`- ${doc.fileName} (${doc.mimeType}) — ${chunks} chunks — ID: ${doc.id} — Uploaded: ${doc.createdAt.toISOString().split("T")[0]}`);
  }

  return lines.join("\n");
}

async function executeReadDocumentFull(
  operatorId: string,
  projectId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const documentId = String(args.documentId ?? "");

  const chunks = await prisma.contentChunk.findMany({
    where: { sourceId: documentId, operatorId, projectId },
    select: { content: true, chunkIndex: true, metadata: true },
    orderBy: { chunkIndex: "asc" },
  });

  if (chunks.length === 0) return `No content found for document "${documentId}" in this project.`;

  const sourceName = chunks[0].metadata && typeof chunks[0].metadata === "object" && "name" in (chunks[0].metadata as Record<string, unknown>)
    ? String((chunks[0].metadata as Record<string, unknown>).name)
    : documentId;

  const lines: string[] = [
    `Document: ${sourceName} (${chunks.length} chunks)`,
    `---`,
    ...chunks.map((c) => c.content),
  ];

  return lines.join("\n\n");
}

async function executeGetKnowledgeIndex(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { knowledgeIndex: true, compilationStatus: true },
  });

  if (!project) return "Project not found.";
  if (!project.knowledgeIndex) {
    return project.compilationStatus === "compiling"
      ? "Knowledge index is currently being compiled. Use list_project_documents and search_project_documents to investigate documents directly."
      : "No knowledge index available. Use list_project_documents and search_project_documents to investigate documents directly.";
  }

  return JSON.stringify(project.knowledgeIndex, null, 2);
}
