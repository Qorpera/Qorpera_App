/**
 * RAG retriever: finds relevant document chunks via cosine similarity.
 *
 * Brute-force in-memory similarity search.
 * Sufficient for pilot scale: ~200 chunks × 1536 dims = ~1.2MB, <10ms search.
 * Scoped to department IDs for context assembly.
 */

import { prisma } from "@/lib/db";
import { embedChunks } from "./embedder";

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

  // Load chunks scoped to departments
  const whereClause: Record<string, unknown> = {
    operatorId,
    embedding: { not: null },
  };

  if (departmentIds.length > 0) {
    whereClause.entity = {
      category: "internal",
      parentDepartmentId: { in: departmentIds },
    };
  }

  const chunks = await prisma.documentChunk.findMany({
    where: whereClause,
    include: {
      entity: {
        select: {
          id: true,
          displayName: true,
          parentDepartmentId: true,
          parentDepartment: {
            select: { displayName: true },
          },
        },
      },
    },
  });

  if (chunks.length === 0) return [];

  // Score all chunks
  const scored = chunks
    .map((chunk) => {
      const embedding = JSON.parse(chunk.embedding!) as number[];
      const score = cosineSimilarity(queryEmbedding, embedding);
      return {
        content: chunk.content,
        score,
        documentName: chunk.entity.displayName,
        departmentName: chunk.entity.parentDepartment?.displayName ?? "Unknown",
        entityId: chunk.entity.id,
        chunkIndex: chunk.chunkIndex,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}
