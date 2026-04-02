/**
 * Post-synthesis pipeline — runs entity extraction, relationship inference,
 * and full situation detection BEFORE the intelligence preview is shown.
 *
 * This ensures the knowledge graph is populated and situations are detected
 * before the user sees results, rather than after they confirm.
 */

import { prisma } from "@/lib/db";
import { extractEntitiesFromChunks } from "./entity-extraction";
import { inferRelationships } from "./relationship-inference";

export async function runPostSynthesisPipeline(operatorId: string): Promise<{
  entities: number;
  properties: number;
  relationships: number;
  situations: number;
}> {
  console.log(`[post-synthesis] Starting entity extraction for ${operatorId}`);
  const extraction = await extractEntitiesFromChunks(operatorId);

  console.log(`[post-synthesis] Starting relationship inference for ${operatorId}`);
  const inference = await inferRelationships(operatorId);

  // Backfill content/activity linkage BEFORE detection — chunks need department IDs
  // for department-scoped situation types and System Health knowledge metrics
  console.log(`[post-synthesis] Running content linkage for ${operatorId}`);
  try {
    const { backfillContentLinkage } = await import("./content-linkage");
    const linkResult = await backfillContentLinkage(operatorId);
    console.log(`[post-synthesis] Content linkage: ${linkResult.chunksUpdated} chunks, ${linkResult.signalsUpdated} signals`);
  } catch (err) {
    console.error("[post-synthesis] Content linkage failed:", err);
    // Non-fatal — detection proceeds with degraded department context
  }

  console.log(`[post-synthesis] Running full situation detection for ${operatorId}`);

  // Run entity-based detection
  const { detectSituations } = await import("@/lib/situation-detector");
  await detectSituations(operatorId);

  // Run content-based detection (retroactive scan of recent communications)
  try {
    const { evaluateContentForSituations, isEligibleCommunication } = await import("@/lib/content-situation-detector");

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const chunks = await prisma.contentChunk.findMany({
      where: {
        operatorId,
        createdAt: { gte: thirtyDaysAgo },
        sourceType: { in: ["email", "slack_message", "teams_message"] },
        chunkIndex: 0,
      },
      select: { sourceType: true, sourceId: true, content: true, metadata: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const items: Array<{ sourceType: string; sourceId: string; content: string; metadata?: Record<string, unknown>; participantEmails?: string[] }> = [];
    for (const chunk of chunks) {
      const meta = chunk.metadata ? JSON.parse(chunk.metadata) as Record<string, unknown> : undefined;
      if (!isEligibleCommunication({ sourceType: chunk.sourceType, metadata: meta })) continue;

      const emails: string[] = [];
      if (meta) {
        if (typeof meta.from === "string") emails.push(meta.from);
        if (Array.isArray(meta.to)) emails.push(...(meta.to as string[]));
        else if (typeof meta.to === "string") emails.push(...meta.to.split(/[,;]\s*/));
        if (Array.isArray(meta.cc)) emails.push(...(meta.cc as string[]));
        else if (typeof meta.cc === "string") emails.push(...meta.cc.split(/[,;]\s*/));
      }

      items.push({
        sourceType: chunk.sourceType,
        sourceId: chunk.sourceId,
        content: chunk.content,
        metadata: meta,
        participantEmails: emails.length > 0 ? emails : undefined,
      });
    }

    if (items.length > 0) {
      console.log(`[post-synthesis] Evaluating ${items.length} communication items`);
      const BATCH_SIZE = 20;
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        await evaluateContentForSituations(operatorId, items.slice(i, i + BATCH_SIZE) as any);
      }
    }
  } catch (err) {
    console.error("[post-synthesis] Content detection failed:", err);
  }

  // Count total situations created
  const totalSituations = await prisma.situation.count({
    where: { operatorId, status: { in: ["detected", "reasoning", "proposed"] } },
  });

  console.log(`[post-synthesis] Complete: ${extraction.entitiesCreated} entities, ${inference.relationshipsCreated} relationships, ${totalSituations} situations`);

  return {
    entities: extraction.entitiesCreated,
    properties: extraction.propertiesSet,
    relationships: inference.relationshipsCreated,
    situations: totalSituations,
  };
}
