/**
 * @deprecated v0.3.10 — ContentChunk-based pipeline replaced by RawContent storage.
 * This file is no longer called from any active code path.
 * Scheduled for removal in v0.4.x.
 *
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
import { chunkDocument, estimateTokens } from "@/lib/rag/chunker";
import { embedChunks } from "@/lib/rag/embedder";

type ContentInput = {
  operatorId: string;
  userId?: string | null;
  sourceType: string;
  sourceId: string;
  content: string;
  connectorId?: string;
  entityId?: string;
  domainIds?: string[];
  projectId?: string;
  metadata?: Record<string, unknown>;
};

export async function ingestContent(
  input: ContentInput,
): Promise<{ chunksCreated: number }> {
  const { operatorId, userId, sourceType, sourceId, content, connectorId, entityId, domainIds, projectId, metadata } = input;

  if (!userId && sourceType !== "uploaded_doc") {
    console.warn(`[content-pipeline] ContentChunk created without userId — sourceType: ${sourceType}, sourceId: ${sourceId}`);
  }

  // 1. Chunk the content
  const chunks = chunkDocument(content);
  if (chunks.length === 0) return { chunksCreated: 0 };

  // 2. Build contextual headers for document-type content
  const isDocument = ["drive_doc", "uploaded_doc", "file_upload"].includes(sourceType);
  const fileName = (metadata?.fileName as string) || undefined;

  let enrichedChunks = chunks.map((chunk, i) => {
    if (!isDocument || chunks.length === 1) return chunk;

    const parts: string[] = [];
    if (fileName) parts.push(`Document: ${fileName}`);
    if (chunk.sectionTitle) parts.push(`Section: ${chunk.sectionTitle}`);
    if (chunks.length > 1) parts.push(`Part ${i + 1} of ${chunks.length}`);

    const header = parts.length > 0 ? `[${parts.join(" | ")}]\n` : "";
    return {
      ...chunk,
      content: header + chunk.content,
      tokenCount: chunk.tokenCount + estimateTokens(header),
    };
  });

  // 3. Generate document summary chunk for multi-chunk documents
  if (isDocument && enrichedChunks.length > 1) {
    const sectionTitles = chunks
      .map((c) => c.sectionTitle)
      .filter((t): t is string => !!t)
      .filter((t, i, arr) => arr.indexOf(t) === i);

    const summaryParts: string[] = [];
    if (fileName) summaryParts.push(`Document: ${fileName}`);
    if (sectionTitles.length > 0) {
      summaryParts.push(`Sections: ${sectionTitles.join(", ")}`);
    }
    const firstContent = content.slice(0, 1200).trim();
    summaryParts.push(`Overview:\n${firstContent}`);

    const summaryContent = summaryParts.join("\n");
    enrichedChunks = [
      { content: summaryContent, chunkIndex: 0, tokenCount: estimateTokens(summaryContent), sectionTitle: undefined },
      ...enrichedChunks.map((c, i) => ({ ...c, chunkIndex: i + 1 })),
    ];
  }

  // 4. Embed all chunks (gracefully handles missing API key — returns nulls)
  let embeddings: (number[] | null)[];
  try {
    embeddings = await embedChunks(enrichedChunks.map((c) => c.content));
  } catch (err) {
    console.error("[content-pipeline] Embedding failed, storing chunks without embeddings:", err);
    embeddings = enrichedChunks.map(() => null);
  }

  // 5. Deduplicate — delete existing chunks for this source
  await prisma.contentChunk.deleteMany({
    where: { operatorId, sourceType, sourceId },
  });

  // 6. Write ContentChunk rows + vector embeddings
  const deptJson = domainIds?.length ? JSON.stringify(domainIds) : null;

  for (let i = 0; i < enrichedChunks.length; i++) {
    const chunk = enrichedChunks[i];
    const chunkMeta = {
      ...metadata,
      ...(chunk.sectionTitle ? { sectionTitle: chunk.sectionTitle } : {}),
      ...(chunks.length > 1 ? { chunkTotal: chunks.length } : {}),
      ...(i === 0 && isDocument && enrichedChunks.length > 1 ? { isDocumentSummary: true } : {}),
    };
    const metaJson = JSON.stringify(chunkMeta);

    const created = await prisma.contentChunk.create({
      data: {
        operatorId,
        connectorId: connectorId ?? null,
        userId: userId ?? null,
        sourceType,
        sourceId,
        entityId: entityId ?? null,
        domainIds: deptJson,
        projectId: projectId ?? null,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
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

  return { chunksCreated: enrichedChunks.length };
}
