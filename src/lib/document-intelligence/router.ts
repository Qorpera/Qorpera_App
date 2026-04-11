import { prisma } from "@/lib/db";
import type { DocumentRegistration } from "./types";

/**
 * Determines which processing pipeline a piece of content should go through.
 *
 * Messages (email, Slack, calendar): current evidence extraction — each is a complete document.
 * Short documents (< 3000 chars / ~750 tokens): enhanced extraction with basic context, no comprehension.
 * Standard documents (3000-50000 chars / 750-12500 tokens): full intelligence pipeline (Layers 2-7).
 * Large documents (> 50000 chars / ~12500 tokens): section detection -> per-section comprehension.
 */
export function routeContent(
  registration: DocumentRegistration,
): "message_extraction" | "short_document" | "full_pipeline" | "large_document" {
  // Messages — self-contained, current pipeline handles well
  const messageTypes = [
    "email",
    "slack_message",
    "teams_message",
    "calendar_note",
  ];
  if (messageTypes.includes(registration.sourceType)) {
    return "message_extraction";
  }

  // Route by estimated token count
  if (registration.estimatedTokens < 750) {
    return "short_document";
  }

  if (registration.estimatedTokens > 12500) {
    return "large_document";
  }

  return "full_pipeline";
}

/**
 * Register a document for intelligence processing.
 * Assembles the registration from a FileUpload record.
 */
export async function registerDocument(
  operatorId: string,
  fileUploadId: string,
  fullText: string,
): Promise<DocumentRegistration> {
  const file = await prisma.fileUpload.findFirstOrThrow({
    where: { id: fileUploadId, operatorId },
    select: {
      id: true,
      operatorId: true,
      filename: true,
      mimeType: true,
      projectId: true,
    },
  });

  // Find associated RawContent IDs
  const rawItems = await prisma.rawContent.findMany({
    where: { operatorId, sourceId: fileUploadId, rawBody: { not: null } },
    select: { id: true },
  });

  return {
    id: file.id,
    operatorId: file.operatorId,
    sourceType: "file_upload",
    mimeType: file.mimeType,
    filename: file.filename,
    fullText,
    textLength: fullText.length,
    estimatedTokens: Math.ceil(fullText.length / 4),
    chunkIds: rawItems.map((r) => r.id),
    fileUploadId: file.id,
    projectId: file.projectId ?? undefined,
  };
}
