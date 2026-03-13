/**
 * Universal content ingestion pipeline.
 *
 * Any source with text content (uploaded docs, emails, Slack messages, Drive docs,
 * calendar notes) calls ingestContent() to get it chunked, embedded, and stored
 * as ContentChunk rows with native pgvector embeddings.
 *
 * Deduplication: existing chunks for the same (operatorId, sourceType, sourceId)
 * are deleted before re-indexing.
 */

import { prisma } from "@/lib/db";
import { chunkDocument } from "@/lib/rag/chunker";
import { embedChunks } from "@/lib/rag/embedder";

type ContentInput = {
  operatorId: string;
  sourceType: string;
  sourceId: string;
  content: string;
  connectorId?: string;
  entityId?: string;
  departmentIds?: string[];
  metadata?: Record<string, unknown>;
};

export async function ingestContent(
  input: ContentInput,
): Promise<{ chunksCreated: number }> {
  const { operatorId, sourceType, sourceId, content, connectorId, entityId, departmentIds, metadata } = input;

  // 1. Chunk the content
  const chunks = chunkDocument(content);
  if (chunks.length === 0) return { chunksCreated: 0 };

  // 2. Embed all chunks (gracefully handles missing API key — returns nulls)
  let embeddings: (number[] | null)[];
  try {
    embeddings = await embedChunks(chunks.map((c) => c.content));
  } catch (err) {
    console.error("[content-pipeline] Embedding failed, storing chunks without embeddings:", err);
    embeddings = chunks.map(() => null);
  }

  // 3. Deduplicate — delete existing chunks for this source
  await prisma.contentChunk.deleteMany({
    where: { operatorId, sourceType, sourceId },
  });

  // 4. Write ContentChunk rows + vector embeddings
  const deptJson = departmentIds?.length ? JSON.stringify(departmentIds) : null;
  const metaJson = metadata ? JSON.stringify(metadata) : null;

  for (let i = 0; i < chunks.length; i++) {
    const created = await prisma.contentChunk.create({
      data: {
        operatorId,
        connectorId: connectorId ?? null,
        sourceType,
        sourceId,
        entityId: entityId ?? null,
        departmentIds: deptJson,
        chunkIndex: chunks[i].chunkIndex,
        content: chunks[i].content,
        tokenCount: chunks[i].tokenCount,
        metadata: metaJson,
      },
      select: { id: true },
    });

    if (embeddings[i]) {
      try {
        const vectorLiteral = `[${embeddings[i]!.join(",")}]`;
        await prisma.$executeRawUnsafe(
          `UPDATE "ContentChunk" SET embedding = $1::vector WHERE id = $2`,
          vectorLiteral,
          created.id,
        );
      } catch (err) {
        console.warn(`[content-pipeline] Failed to write embedding for chunk ${created.id}:`, err);
      }
    }
  }

  return { chunksCreated: chunks.length };
}
