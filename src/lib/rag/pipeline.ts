/**
 * Document processing pipeline: text extraction → chunking → embedding → storage.
 *
 * Called fire-and-forget after document upload.
 * Idempotent: deletes existing chunks before re-processing.
 * Updates embeddingStatus on InternalDocument throughout.
 */

import { prisma } from "@/lib/db";
import { chunkDocument } from "./chunker";
import { embedChunks } from "./embedder";
import { readFile } from "fs/promises";

// Text extraction (reused from existing extract route logic)
export async function extractText(filePath: string, mimeType: string): Promise<string | null> {
  const buffer = await readFile(filePath);

  switch (mimeType) {
    case "text/plain":
      return buffer.toString("utf-8");

    case "text/csv": {
      const Papa = (await import("papaparse")).default;
      const text = buffer.toString("utf-8");
      const parsed = Papa.parse(text, { header: true });
      if (!parsed.data || parsed.data.length === 0) return text;
      const headers = parsed.meta.fields ?? [];
      const rows = (parsed.data as Record<string, string>[]).map((row, i) => {
        const fields = headers.map((h) => `${h}: ${row[h] ?? ""}`).join(", ");
        return `Record ${i + 1}: ${fields}`;
      });
      return `CSV with ${rows.length} records.\nHeaders: ${headers.join(", ")}\n\n${rows.join("\n")}`;
    }

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    case "application/pdf": {
      try {
        const { PDFParse } = await import("pdf-parse");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parser = new PDFParse({ data: buffer, verbosity: 0 }) as any;
        await parser.load();
        const result = await parser.getText();
        const text = typeof result === "string" ? result : result?.text;
        if (!text || text.trim().length < 10) return null;
        return text;
      } catch (err) {
        console.error("[rag/pipeline] PDF parse error:", err);
        return null;
      }
    }

    default:
      return null;
  }
}

/**
 * Main pipeline: process a document from raw file to embedded chunks.
 *
 * If the document already has rawText, skips text extraction.
 * Deletes existing chunks before creating new ones (idempotent).
 */
export async function processDocument(
  documentId: string,
): Promise<{ chunks: number; error?: string }> {
  const doc = await prisma.internalDocument.findUnique({ where: { id: documentId } });
  if (!doc) return { chunks: 0, error: "Document not found" };

  // Update status
  await prisma.internalDocument.update({
    where: { id: documentId },
    data: { embeddingStatus: "processing" },
  });

  try {
    // Step 1: Get text (extract if needed)
    let text = doc.rawText;
    if (!text) {
      text = await extractText(doc.filePath, doc.mimeType);
      if (!text) {
        await prisma.internalDocument.update({
          where: { id: documentId },
          data: { embeddingStatus: "error" },
        });
        return { chunks: 0, error: "Could not extract text from document" };
      }
      // Save raw text
      await prisma.internalDocument.update({
        where: { id: documentId },
        data: { rawText: text },
      });
    }

    // Step 2: Chunk
    const chunks = chunkDocument(text);
    if (chunks.length === 0) {
      await prisma.internalDocument.update({
        where: { id: documentId },
        data: { embeddingStatus: "error" },
      });
      return { chunks: 0, error: "No chunks produced from text" };
    }

    // Step 3: Embed
    const embeddings = await embedChunks(chunks.map((c) => c.content));

    // Step 4: Store — delete old chunks first (idempotent)
    const entityId = doc.entityId;
    if (!entityId) {
      await prisma.internalDocument.update({
        where: { id: documentId },
        data: { embeddingStatus: "error" },
      });
      return { chunks: 0, error: "Document has no linked entity" };
    }

    await prisma.documentChunk.deleteMany({
      where: { entityId },
    });

    // Batch create chunks
    for (let i = 0; i < chunks.length; i++) {
      await prisma.documentChunk.create({
        data: {
          entityId,
          operatorId: doc.operatorId,
          chunkIndex: chunks[i].chunkIndex,
          content: chunks[i].content,
          embedding: embeddings[i] ? JSON.stringify(embeddings[i]) : null,
          tokenCount: chunks[i].tokenCount,
        },
      });
    }

    // Update status
    await prisma.internalDocument.update({
      where: { id: documentId },
      data: { embeddingStatus: "complete" },
    });

    return { chunks: chunks.length };
  } catch (err) {
    console.error("[rag/pipeline] Processing error:", err);
    await prisma.internalDocument.update({
      where: { id: documentId },
      data: { embeddingStatus: "error" },
    });
    return { chunks: 0, error: String(err) };
  }
}
