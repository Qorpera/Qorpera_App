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
 *
 * Entity filtering: pass `entityId` for a single entity, or `entityIds` for
 * multiple (e.g. trigger entity + related entities). Both use SQL ANY().
 */
export async function retrieveRelevantChunks(
  operatorId: string,
  queryEmbedding: number[],
  options?: {
    limit?: number;
    sourceTypes?: string[];
    entityId?: string;
    entityIds?: string[];
    departmentIds?: string[];
    minScore?: number;
    includeParentContext?: boolean;
    userId?: string;
    skipUserFilter?: boolean;
  },
): Promise<ContentChunkResult[]> {
  const limit = options?.limit ?? 5;
  const minScore = options?.minScore ?? 0.3;
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  // Resolve entity IDs: entityIds takes precedence, entityId is shorthand for [entityId]
  const resolvedEntityIds = options?.entityIds?.length
    ? options.entityIds
    : options?.entityId
      ? [options.entityId]
      : null;

  // Build dynamic WHERE clauses and parameter array
  // Fixed params: $1 = vector, $2 = operatorId
  const params: unknown[] = [vectorLiteral, operatorId];
  let nextIdx = 3;

  // Source type filter
  let sourceTypeFilter = "";
  if (options?.sourceTypes?.length) {
    const placeholders = options.sourceTypes.map((_, i) => `$${nextIdx + i}`).join(",");
    sourceTypeFilter = `AND "sourceType" = ANY(ARRAY[${placeholders}]::text[])`;
    params.push(...options.sourceTypes);
    nextIdx += options.sourceTypes.length;
  }

  // Entity filter (single or multiple via ANY)
  let entityFilter = "";
  if (resolvedEntityIds) {
    const placeholders = resolvedEntityIds.map((_, i) => `$${nextIdx + i}`).join(",");
    entityFilter = `AND "entityId" = ANY(ARRAY[${placeholders}]::text[])`;
    params.push(...resolvedEntityIds);
    nextIdx += resolvedEntityIds.length;
  }

  // Per-user content privacy filter: returns user's own chunks + null-userId chunks (defensive)
  let userFilter = "";
  if (!options?.skipUserFilter && options?.userId) {
    userFilter = `AND ("userId" = $${nextIdx} OR "userId" IS NULL)`;
    params.push(options.userId);
    nextIdx += 1;
  }

  const limitParamIdx = nextIdx;
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
      ${userFilter}
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

  // Parent-context enrichment: fetch document summary chunks for matched sources
  if (options?.includeParentContext && results.length > 0) {
    const sourceIds = [...new Set(results.map((r) => r.sourceId))];
    const existingSummarySourceIds = new Set(
      results.filter((r) => r.chunkIndex === 0).map((r) => r.sourceId),
    );
    const missingSourceIds = sourceIds.filter((id) => !existingSummarySourceIds.has(id));

    if (missingSourceIds.length > 0) {
      let summaryChunks = await prisma.$queryRawUnsafe<Array<{
        id: string;
        content: string;
        sourceType: string;
        sourceId: string;
        entityId: string | null;
        departmentIds: string | null;
        metadata: string | null;
        chunkIndex: number;
      }>>(
        `SELECT id, content, "sourceType", "sourceId", "entityId", "departmentIds",
                metadata, "chunkIndex"
         FROM "ContentChunk"
         WHERE "operatorId" = $1
           AND "sourceId" = ANY($2::text[])
           AND "chunkIndex" = 0`,
        operatorId,
        missingSourceIds,
      );

      // Apply department scoping to summary chunks (same logic as main results)
      if (options?.departmentIds?.length) {
        const allowedDepts = new Set(options.departmentIds);
        summaryChunks = summaryChunks.filter((s) => {
          if (!s.departmentIds) return true;
          try {
            const depts: string[] = JSON.parse(s.departmentIds);
            return depts.length === 0 || depts.some((d) => allowedDepts.has(d));
          } catch {
            return true;
          }
        });
      }

      const summaryMap = new Map(summaryChunks.map((s) => [s.sourceId, s]));
      const enrichedResults: ContentChunkResult[] = [];
      const addedSummaries = new Set<string>();

      for (const result of results) {
        if (summaryMap.has(result.sourceId) && !addedSummaries.has(result.sourceId)) {
          const summary = summaryMap.get(result.sourceId)!;
          enrichedResults.push({
            id: summary.id,
            content: summary.content,
            sourceType: summary.sourceType,
            sourceId: summary.sourceId,
            entityId: summary.entityId,
            departmentIds: summary.departmentIds ? JSON.parse(summary.departmentIds) : [],
            metadata: summary.metadata ? JSON.parse(summary.metadata) : null,
            chunkIndex: summary.chunkIndex,
            score: 1.0,
          });
          addedSummaries.add(result.sourceId);
        }
        enrichedResults.push(result);
      }

      results = enrichedResults;
    }
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
  userFilter?: { userId: string; skipUserFilter?: boolean },
): Promise<RAGResult[]> {
  const [queryEmbedding] = await embedChunks([query]);
  if (!queryEmbedding) return [];

  const results = await retrieveRelevantChunks(operatorId, queryEmbedding, {
    limit: topK,
    departmentIds: departmentIds.length > 0 ? departmentIds : undefined,
    minScore: 0.3,
    userId: userFilter?.userId,
    skipUserFilter: userFilter?.skipUserFilter,
  });

  // Map to legacy RAGResult format
  return results.map((r) => ({
    ...r,
    documentName: r.metadata?.fileName as string ?? "Unknown",
    departmentName: "—",
  }));
}
