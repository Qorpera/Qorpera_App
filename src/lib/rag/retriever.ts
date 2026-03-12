/**
 * RAG retriever: finds relevant content chunks via pgvector native similarity search.
 *
 * Uses HNSW index on ContentChunk.embedding for fast cosine similarity.
 * Department scoping and minimum score filtering applied in application layer.
 */

import { prisma } from "@/lib/db";
import { embedChunks } from "./embedder";

export interface ContentChunkResult {
  id: string;
  content: string;
  sourceType: string;
  sourceId: string;
  entityId: string | null;
  departmentIds: string[];
  metadata: Record<string, unknown> | null;
  chunkIndex: number;
  score: number;
}

// Legacy type alias for callers that still reference RAGResult
export type RAGResult = ContentChunkResult & {
  documentName: string;
  departmentName: string;
};

/**
 * Retrieve relevant content chunks for a query embedding using pgvector.
 */
export async function retrieveRelevantChunks(
  operatorId: string,
  queryEmbedding: number[],
  options?: {
    limit?: number;
    sourceTypes?: string[];
    entityId?: string;
    departmentIds?: string[];
    minScore?: number;
  },
): Promise<ContentChunkResult[]> {
  const limit = options?.limit ?? 5;
  const minScore = options?.minScore ?? 0.3;
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  // Build the source type filter clause
  const sourceTypeFilter = options?.sourceTypes?.length
    ? `AND "sourceType" = ANY(ARRAY[${options.sourceTypes.map((_, i) => `$${i + 3}`).join(",")}]::text[])`
    : "";

  const entityFilter = options?.entityId
    ? `AND "entityId" = $${(options?.sourceTypes?.length ?? 0) + 3}`
    : "";

  // Construct parameter array
  const params: unknown[] = [vectorLiteral, operatorId];
  if (options?.sourceTypes?.length) {
    params.push(...options.sourceTypes);
  }
  if (options?.entityId) {
    params.push(options.entityId);
  }
  const limitParamIdx = params.length + 1;
  params.push(limit);

  const query = `
    SELECT id, content, "sourceType", "sourceId", "entityId", "departmentIds",
           metadata, "chunkIndex", "tokenCount",
           1 - (embedding <=> $1::vector) as score
    FROM "ContentChunk"
    WHERE "operatorId" = $2
      AND embedding IS NOT NULL
      ${sourceTypeFilter}
      ${entityFilter}
    ORDER BY embedding <=> $1::vector
    LIMIT $${limitParamIdx}
  `;

  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    content: string;
    sourceType: string;
    sourceId: string;
    entityId: string | null;
    departmentIds: string | null;
    metadata: string | null;
    chunkIndex: number;
    tokenCount: number | null;
    score: number;
  }>>(query, ...params);

  // Parse and filter in application layer
  let results: ContentChunkResult[] = rows.map((row) => ({
    id: row.id,
    content: row.content,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    entityId: row.entityId,
    departmentIds: row.departmentIds ? JSON.parse(row.departmentIds) : [],
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    chunkIndex: row.chunkIndex,
    score: Number(row.score),
  }));

  // Apply minimum score filter
  results = results.filter((r) => r.score >= minScore);

  // Apply department scoping (overlap check)
  if (options?.departmentIds?.length) {
    const allowedDepts = new Set(options.departmentIds);
    results = results.filter((r) =>
      r.departmentIds.length === 0 || r.departmentIds.some((d) => allowedDepts.has(d)),
    );
  }

  return results;
}

/**
 * Legacy wrapper: takes a query string, embeds it, then retrieves.
 * Maintains backward compatibility with existing callers.
 */
export async function retrieveRelevantContext(
  query: string,
  operatorId: string,
  departmentIds: string[],
  topK: number = 8,
): Promise<RAGResult[]> {
  const [queryEmbedding] = await embedChunks([query]);
  if (!queryEmbedding) return [];

  const results = await retrieveRelevantChunks(operatorId, queryEmbedding, {
    limit: topK,
    departmentIds: departmentIds.length > 0 ? departmentIds : undefined,
    minScore: 0.3,
  });

  // Map to legacy RAGResult format
  return results.map((r) => ({
    ...r,
    documentName: r.metadata?.fileName as string ?? "Unknown",
    departmentName: "—",
  }));
}
