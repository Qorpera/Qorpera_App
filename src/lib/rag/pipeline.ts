/**
 * @deprecated v0.3.10 — ContentChunk-based pipeline replaced by RawContent storage.
 * This file is no longer called from any active code path.
 * Scheduled for removal in v0.4.x.
 *
 * Document processing pipeline: text extraction → universal content ingestion.
 *
 * Called fire-and-forget after document upload.
 * Delegates chunking/embedding/storage to the universal content pipeline.
 * Updates embeddingStatus on InternalDocument throughout.
 */

import { prisma } from "@/lib/db";
import { ingestContent } from "@/lib/content-pipeline";
import { readFile } from "fs/promises";
import path from "path";

/** Resolve a document filePath (which may be relative) to an absolute path. */
function resolveDocumentPath(filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  const storageBase = process.env.DOCUMENT_STORAGE_PATH || "./uploads/documents";
  return path.join(storageBase, filePath);
}

// Text extraction (reused from existing extract route logic)
export async function extractText(filePath: string, mimeType: string): Promise<string | null> {
  const buffer = await readFile(filePath);

  switch (mimeType) {
    case "text/plain":
    case "text/markdown":
    case "text/x-markdown":
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

    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheets = workbook.SheetNames.map(name => {
        const sheet = workbook.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        return `Sheet: ${name}\n${csv}`;
      });
      return sheets.join("\n\n");
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
 * Extracts text from the file, then delegates to the universal content pipeline.
 * If the document already has rawText, skips text extraction.
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
      text = await extractText(resolveDocumentPath(doc.filePath), doc.mimeType);
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

    // Step 2: Delegate to universal content pipeline
    // Note: InternalDocument does not track uploadedById — userId will be null.
    // The backfill script can resolve ownership from context.
    const result = await ingestContent({
      operatorId: doc.operatorId,
      userId: null,
      sourceType: "uploaded_doc",
      sourceId: documentId,
      content: text,
      entityId: doc.entityId ?? undefined,
      domainIds: doc.domainId ? [doc.domainId] : [],
      projectId: doc.projectId ?? undefined,
      metadata: {
        fileName: doc.fileName,
        documentType: doc.documentType,
        mimeType: doc.mimeType,
      },
    });

    // Step 3: Update status
    await prisma.internalDocument.update({
      where: { id: documentId },
      data: { embeddingStatus: result.chunksCreated > 0 ? "complete" : "error" },
    });

    return { chunks: result.chunksCreated };
  } catch (err) {
    console.error(`[rag/pipeline] Processing failed for "${doc.fileName}":`, err);
    await prisma.internalDocument.update({
      where: { id: documentId },
      data: { embeddingStatus: "error" },
    });
    return { chunks: 0, error: String(err) };
  }
}
