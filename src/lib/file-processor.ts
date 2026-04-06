/**
 * Worker-side file processing.
 *
 * Extracts text from uploaded files and feeds through the existing
 * ingestContent() pipeline (chunking, embedding, pgvector storage).
 */

import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/file-storage";
import { ingestContent } from "@/lib/content-pipeline";

export async function processFileUpload(fileUploadId: string): Promise<void> {
  const file = await prisma.fileUpload.findUniqueOrThrow({
    where: { id: fileUploadId },
    select: {
      id: true,
      operatorId: true,
      filename: true,
      mimeType: true,
      storageKey: true,
      uploadedBy: true,
      projectId: true,
    },
  });

  await prisma.fileUpload.update({
    where: { id: file.id },
    data: { status: "processing" },
  });

  try {
    // 1. Get file content from storage
    const storage = getStorageProvider();
    const buffer = await storage.getBuffer(file.storageKey);

    // 2. Extract text based on MIME type
    const text = await extractText(buffer, file.mimeType);
    if (!text || text.trim().length === 0) {
      throw new Error("No text content extracted from file");
    }

    // 3. Feed through the existing content pipeline
    // ingestContent handles: chunking, embedding, pgvector storage, dedup
    const result = await ingestContent({
      operatorId: file.operatorId,
      userId: file.uploadedBy,
      sourceType: "file_upload",
      sourceId: file.id,
      content: text,
      projectId: file.projectId ?? undefined,
      metadata: {
        fileName: file.filename,
        mimeType: file.mimeType,
        fileUploadId: file.id,
      },
    });

    // 4. Link ContentChunks to the FileUpload
    await prisma.contentChunk.updateMany({
      where: {
        operatorId: file.operatorId,
        sourceType: "file_upload",
        sourceId: file.id,
      },
      data: { fileUploadId: file.id },
    });

    // 5. Update FileUpload status
    await prisma.fileUpload.update({
      where: { id: file.id },
      data: {
        status: "ready",
        chunkCount: result.chunksCreated,
        metadata: { extractedTextLength: text.length },
      },
    });

    console.log(`[file-processor] Processed ${file.filename}: ${result.chunksCreated} chunks`);
  } catch (error) {
    console.error(`[file-processor] Failed for ${file.id} (${file.filename}):`, error);
    await prisma.fileUpload.update({
      where: { id: file.id },
      data: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
}

async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  switch (mimeType) {
    case "application/pdf": {
      const { PDFParse } = await import("pdf-parse");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parser = new PDFParse({ data: buffer, verbosity: 0 }) as any;
      await parser.load();
      const result = await parser.getText();
      return typeof result === "string" ? result : result?.text ?? "";
    }
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer);
      return workbook.SheetNames.map((name: string) => {
        const sheet = workbook.Sheets[name];
        return `## ${name}\n${XLSX.utils.sheet_to_csv(sheet)}`;
      }).join("\n\n");
    }
    case "text/plain":
    case "text/csv":
    case "text/markdown":
    case "application/json":
      return buffer.toString("utf-8");
    default:
      throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
}
