/**
 * RAG retriever: finds relevant document chunks via cosine similarity.
 *
 * Brute-force in-memory similarity search.
 * Sufficient for pilot scale: ~200 chunks × 1536 dims = ~1.2MB, <10ms search.
 * Scoped to department IDs for context assembly.
 */

import { prisma } from "@/lib/db";
import { embedChunks } from "./embedder";
import { getCachedChunks, setCachedChunks, type CachedChunk } from "./chunk-cache";

export interface RAGResult {
  content: string;
  score: number;
  documentName: string;
  departmentName: string;
  entityId: string;
  chunkIndex: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Retrieve relevant document chunks for a query, scoped to specific departments.
 *
 * @param query - Natural language query to search for
 * @param operatorId - The operator's ID
 * @param departmentIds - Department IDs to scope the search to (empty = all departments)
 * @param topK - Number of results to return (default 8)
 */
export async function retrieveRelevantContext(
  query: string,
  operatorId: string,
  departmentIds: string[],
  topK: number = 8,
): Promise<RAGResult[]> {
  // Embed the query
  const [queryEmbedding] = await embedChunks([query]);
  if (!queryEmbedding) return [];

  let allChunks: CachedChunk[] = [];

  if (departmentIds.length > 0) {
    // Per-department cached loading
    for (const deptId of departmentIds) {
      const cached = getCachedChunks(deptId);
      if (cached) {
        allChunks.push(...cached);
        continue;
      }

      // Quick count check — skip departments with no embedded chunks
      const countResult = await prisma.documentChunk.count({
        where: {
          operatorId,
          embedding: { not: null },
          entity: { category: "internal", parentDepartmentId: deptId },
        },
      });
      if (countResult === 0) {
        setCachedChunks(deptId, []);
        continue;
      }

      // Cache miss — load from DB
      const dbChunks = await prisma.documentChunk.findMany({
        where: {
          operatorId,
          embedding: { not: null },
          entity: { category: "internal", parentDepartmentId: deptId },
        },
        include: {
          entity: {
            select: {
              id: true,
              displayName: true,
              parentDepartment: { select: { displayName: true } },
            },
          },
        },
      });

      const parsed = dbChunks.map((chunk) => ({
        entityId: chunk.entity.id,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        embedding: JSON.parse(chunk.embedding!) as number[],
        documentName: chunk.entity.displayName,
        departmentName: chunk.entity.parentDepartment?.displayName ?? "Unknown",
      }));

      setCachedChunks(deptId, parsed);
      allChunks.push(...parsed);
    }
  } else {
    // No department filter — load all chunks (no caching for global queries)
    const chunks = await prisma.documentChunk.findMany({
      where: {
        operatorId,
        embedding: { not: null },
      },
      include: {
        entity: {
          select: {
            id: true,
            displayName: true,
            parentDepartment: { select: { displayName: true } },
          },
        },
      },
    });

    allChunks = chunks.map((chunk) => ({
      entityId: chunk.entity.id,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      embedding: JSON.parse(chunk.embedding!) as number[],
      documentName: chunk.entity.displayName,
      departmentName: chunk.entity.parentDepartment?.displayName ?? "Unknown",
    }));
  }

  if (allChunks.length === 0) return [];

  // Score all chunks
  const scored = allChunks
    .map((chunk) => {
      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      return {
        content: chunk.content,
        score,
        documentName: chunk.documentName,
        departmentName: chunk.departmentName,
        entityId: chunk.entityId,
        chunkIndex: chunk.chunkIndex,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}
