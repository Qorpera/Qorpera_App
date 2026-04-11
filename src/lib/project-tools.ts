/**
 * Project-scoped tools for the deliverable generation agent.
 *
 * These tools give the agent access to project documents, the compiled
 * knowledge index, and the organizational wiki / entity graph.
 */

import { prisma } from "@/lib/db";
import type { AITool } from "@/lib/ai-provider";
import { searchRawContent } from "@/lib/storage/raw-content-store";

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

  // Get project document IDs for scoping
  const projectDocs = await prisma.fileUpload.findMany({
    where: { projectId, operatorId },
    select: { id: true },
  });
  if (projectDocs.length === 0) return `No project documents found matching "${query}".`;

  const results = await searchRawContent(operatorId, query, { limit: maxResults });
  const projectDocIds = new Set(projectDocs.map((d) => d.id));
  const filtered = results.filter((r) => projectDocIds.has(r.sourceId));

  if (filtered.length === 0) return `No project documents found matching "${query}".`;

  const lines: string[] = [`Found ${filtered.length} matching documents:`];
  for (const r of filtered) {
    const meta = r.rawMetadata;
    const sourceName = (meta.name as string) ?? (meta.fileName as string) ?? r.sourceId;
    lines.push(`\n[${r.sourceType}] ${sourceName}`);
    lines.push(`ID: ${r.id}`);
    lines.push((r.rawBody ?? "").slice(0, 800));
  }

  return lines.join("\n");
}

async function executeReadDocumentChunk(
  operatorId: string,
  projectId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const contentId = String(args.chunkId ?? args.sourceId ?? "");

  // Verify the content belongs to this project via FileUpload
  const projectFile = await prisma.fileUpload.findFirst({
    where: { id: contentId, operatorId, projectId },
    select: { id: true },
  });
  if (!projectFile) return `Content "${contentId}" not found in this project.`;

  const raw = await prisma.rawContent.findFirst({
    where: { OR: [{ id: contentId }, { sourceId: contentId }], operatorId, rawBody: { not: null } },
    select: { rawBody: true, sourceType: true, sourceId: true, rawMetadata: true },
  });

  if (!raw) return `Content "${contentId}" not found in this project.`;

  const meta = (raw.rawMetadata ?? {}) as Record<string, unknown>;
  const sourceName = (meta.name as string) ?? (meta.fileName as string) ?? raw.sourceId;

  return [
    `Source: ${sourceName} [${raw.sourceType}]`,
    `---`,
    raw.rawBody!,
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

  const lines: string[] = [`${docs.length} documents in this project:`];
  for (const doc of docs) {
    lines.push(`- ${doc.fileName} (${doc.mimeType}) — ID: ${doc.id} — Uploaded: ${doc.createdAt.toISOString().split("T")[0]}`);
  }

  return lines.join("\n");
}

async function executeReadDocumentFull(
  operatorId: string,
  projectId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const documentId = String(args.documentId ?? "");

  // Verify the document belongs to this project via FileUpload
  const docFile = await prisma.fileUpload.findFirst({
    where: { id: documentId, operatorId, projectId },
    select: { id: true },
  });
  if (!docFile) return `No content found for document "${documentId}" in this project.`;

  const raw = await prisma.rawContent.findFirst({
    where: { sourceId: documentId, operatorId, rawBody: { not: null } },
    select: { rawBody: true, rawMetadata: true },
  });

  if (!raw) return `No content found for document "${documentId}" in this project.`;

  const meta = (raw.rawMetadata ?? {}) as Record<string, unknown>;
  const sourceName = (meta.name as string) ?? (meta.fileName as string) ?? documentId;

  return [
    `Document: ${sourceName}`,
    `---`,
    raw.rawBody!,
  ].join("\n\n");
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
