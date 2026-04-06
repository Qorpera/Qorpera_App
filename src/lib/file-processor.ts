/**
 * Worker-side file processing.
 *
 * Extracts text from uploaded files and feeds through the existing
 * ingestContent() pipeline (chunking, embedding, pgvector storage).
 * Then routes through the document intelligence pipeline (Layers 2-4)
 * asynchronously — chunking completes immediately, intelligence runs after.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/file-storage";
import { ingestContent } from "@/lib/content-pipeline";
import type { DocumentRegistration } from "@/lib/document-intelligence/types";

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

    // 2. Extract text
    const text = await extractText(buffer, file.mimeType);
    if (!text || text.trim().length === 0) {
      throw new Error("No text content extracted from file");
    }

    // 3. Store full text for intelligence pipeline
    await prisma.fileUpload.update({
      where: { id: file.id },
      data: { extractedFullText: text },
    });

    // 4. Chunk and embed (existing pipeline — needed for retrieval regardless of intelligence depth)
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

    // 5. Link ContentChunks to the FileUpload
    await prisma.contentChunk.updateMany({
      where: {
        operatorId: file.operatorId,
        sourceType: "file_upload",
        sourceId: file.id,
      },
      data: { fileUploadId: file.id },
    });

    // 6. Mark file as ready — chunking is done, retrieval works immediately
    await prisma.fileUpload.update({
      where: { id: file.id },
      data: {
        status: "ready",
        chunkCount: result.chunksCreated,
        metadata: { extractedTextLength: text.length },
      },
    });

    // 7. Route through document intelligence pipeline (async — doesn't block "ready" status)
    const { registerDocument, routeContent } = await import(
      "@/lib/document-intelligence/router"
    );
    const registration = await registerDocument(
      file.operatorId,
      file.id,
      text,
    );
    const route = routeContent(registration);

    if (route === "full_pipeline" || route === "large_document") {
      // Run intelligence pipeline asynchronously
      runDocumentIntelligence(registration).catch((err) => {
        console.error(
          `[file-processor] Intelligence pipeline failed for ${file.id}:`,
          err,
        );
        prisma.fileUpload
          .update({
            where: { id: file.id },
            data: {
              intelligenceStatus: "failed",
              intelligenceError:
                err instanceof Error ? err.message : "Unknown error",
            },
          })
          .catch(() => {});
      });
    } else if (route === "short_document") {
      // Short documents get basic classification only
      try {
        const { classifyDocument } = await import(
          "@/lib/document-intelligence/classifier"
        );
        const profile = await classifyDocument(registration);
        await prisma.fileUpload.update({
          where: { id: file.id },
          data: {
            documentProfile: profile as unknown as Prisma.InputJsonValue,
            intelligenceStatus: "complete",
          },
        });
      } catch (err) {
        console.warn(
          `[file-processor] Short doc classification failed for ${file.id}:`,
          err,
        );
      }
    }
    // message_extraction route → handled by evidence ingestion, not here

    console.log(
      `[file-processor] Processed ${file.filename}: ${result.chunksCreated} chunks, route: ${route}`,
    );
  } catch (error) {
    console.error(
      `[file-processor] Failed for ${file.id} (${file.filename}):`,
      error,
    );
    await prisma.fileUpload.update({
      where: { id: file.id },
      data: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
}

/**
 * Run the document intelligence pipeline (Layers 2-4).
 * Called asynchronously after chunking completes — file is already "ready".
 * Failure here only affects intelligenceStatus, never the file's main status.
 */
async function runDocumentIntelligence(
  registration: DocumentRegistration,
): Promise<void> {
  const fileId = registration.fileUploadId!;

  // Layer 2: Classification
  await prisma.fileUpload.update({
    where: { id: fileId },
    data: { intelligenceStatus: "classifying" },
  });

  const { classifyDocument } = await import(
    "@/lib/document-intelligence/classifier"
  );
  const profile = await classifyDocument(registration);

  await prisma.fileUpload.update({
    where: { id: fileId },
    data: { documentProfile: profile as unknown as Prisma.InputJsonValue },
  });

  // Layer 3: Expertise Assembly (no LLM — retrieval only)
  const { assembleExpertise } = await import(
    "@/lib/document-intelligence/expertise-assembly"
  );
  const expertise = await assembleExpertise(profile, registration.operatorId);

  // Layer 4: Full-Document Comprehension
  await prisma.fileUpload.update({
    where: { id: fileId },
    data: { intelligenceStatus: "comprehending" },
  });

  const { comprehendDocument } = await import(
    "@/lib/document-intelligence/comprehension"
  );
  const { understanding, costCents } = await comprehendDocument(
    registration,
    profile,
    expertise,
  );

  let totalCost = costCents;

  await prisma.fileUpload.update({
    where: { id: fileId },
    data: {
      documentUnderstanding: understanding as unknown as Prisma.InputJsonValue,
    },
  });

  // Layer 5: Section-Aware Deep Extraction
  await prisma.fileUpload.update({
    where: { id: fileId },
    data: { intelligenceStatus: "extracting" },
  });

  const { runDeepExtraction } = await import(
    "@/lib/document-intelligence/deep-extraction"
  );
  const extractionReport = await runDeepExtraction(
    registration,
    profile,
    understanding,
    expertise,
  );
  totalCost += extractionReport.costCents;

  console.log(
    `[document-intelligence] Extraction: ${extractionReport.sectionsProcessed} sections, ` +
      `${extractionReport.rawClaims} raw + ${extractionReport.analyticalClaims} analytical claims`,
  );

  // Layer 6: Cross-Document Correlation
  await prisma.fileUpload.update({
    where: { id: fileId },
    data: { intelligenceStatus: "correlating" },
  });

  const { runCorrelation } = await import(
    "@/lib/document-intelligence/correlation"
  );
  const correlationReport = await runCorrelation(registration, understanding);
  totalCost += correlationReport.costCents;

  console.log(
    `[document-intelligence] Correlation: ${correlationReport.findingsCreated} findings ` +
      `(${correlationReport.contradictions} contradictions, ${correlationReport.confirmations} confirmations)`,
  );

  // Layer 7: Analytical Wiki Synthesis
  await prisma.fileUpload.update({
    where: { id: fileId },
    data: { intelligenceStatus: "synthesizing" },
  });

  const { runAnalyticalSynthesis } = await import(
    "@/lib/document-intelligence/analytical-synthesis"
  );
  const synthesisReport = await runAnalyticalSynthesis(
    registration,
    profile,
    understanding,
  );
  totalCost += synthesisReport.costCents;

  await prisma.fileUpload.update({
    where: { id: fileId },
    data: {
      intelligenceStatus: "complete",
      intelligenceCostCents: totalCost,
    },
  });

  console.log(
    `[document-intelligence] Complete: ${registration.filename} — ` +
      `${synthesisReport.pagesCreated} pages created, ${synthesisReport.pagesUpdated} updated, ` +
      `$${(totalCost / 100).toFixed(2)} total`,
  );
}

async function extractText(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
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

/**
 * Run document intelligence pipeline on a FileUpload that already has
 * extractedFullText and chunks. Used for connector-synced documents
 * where text extraction and chunking happened during sync.
 */
export async function runDocumentIntelligenceOnly(
  fileUploadId: string,
): Promise<void> {
  const file = await prisma.fileUpload.findUniqueOrThrow({
    where: { id: fileUploadId },
    select: {
      id: true,
      operatorId: true,
      filename: true,
      mimeType: true,
      extractedFullText: true,
      projectId: true,
    },
  });

  if (!file.extractedFullText) {
    console.warn(
      `[file-processor] No extracted text for ${fileUploadId} — skipping intelligence`,
    );
    await prisma.fileUpload.update({
      where: { id: fileUploadId },
      data: { intelligenceStatus: "skipped" },
    });
    return;
  }

  try {
    const { registerDocument, routeContent } = await import(
      "@/lib/document-intelligence/router"
    );
    const registration = await registerDocument(
      file.operatorId,
      file.id,
      file.extractedFullText,
    );
    const route = routeContent(registration);

    if (route === "full_pipeline" || route === "large_document") {
      await runDocumentIntelligence(registration);
    } else if (route === "short_document") {
      const { classifyDocument } = await import(
        "@/lib/document-intelligence/classifier"
      );
      const profile = await classifyDocument(registration);
      await prisma.fileUpload.update({
        where: { id: file.id },
        data: {
          documentProfile: profile as unknown as Prisma.InputJsonValue,
          intelligenceStatus: "complete",
        },
      });
    }
  } catch (err) {
    console.error(
      `[file-processor] Intelligence-only pipeline failed for ${fileUploadId}:`,
      err,
    );
    await prisma.fileUpload
      .update({
        where: { id: fileUploadId },
        data: {
          intelligenceStatus: "failed",
          intelligenceError:
            err instanceof Error ? err.message : "Unknown error",
        },
      })
      .catch(() => {});
  }
}
