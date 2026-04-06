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
  wikiPages: number;
  initiatives: number;
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

  // ── Research Planning ──────────────────────────────────────────────
  // Generate investigation plan from evidence registry + entity graph.
  // The actual investigations run in the next phase (Session 3).
  console.log(`[post-synthesis] Generating research plan for ${operatorId}`);
  let investigationCount = 0;
  try {
    const { generateResearchPlan } = await import("@/lib/research-planner");
    const plan = await generateResearchPlan(operatorId);
    investigationCount = plan.investigations.length;

    await prisma.researchPlan.create({
      data: {
        operatorId,
        investigations: plan.investigations as any,
        priorityOrder: plan.priorityOrder as any,
        planningReasoning: plan.planningReasoning,
        estimatedDurationMinutes: plan.estimatedDurationMinutes,
        estimatedCostCents: plan.estimatedCostCents,
      },
    });

    console.log(`[post-synthesis] Research plan: ${investigationCount} investigations planned`);
  } catch (err) {
    console.error(`[post-synthesis] Research planning failed for ${operatorId}:`, err);
    // Non-fatal — wiki synthesis below still produces immediate pages
  }

  // ── Wiki Knowledge Synthesis ──────────────────────────────────────
  // Build wiki pages from the enriched entity graph + raw data.
  // Runs BEFORE detection so the content-situation-detector can use
  // wiki enrichment for better-informed classification.
  // Session 3 will upgrade/replace these with deep investigation pages.
  console.log(`[post-synthesis] Running wiki background synthesis for ${operatorId}`);
  let wikiPageCount = 0;
  try {
    const { runBackgroundSynthesis } = await import("@/lib/wiki-background-synthesis");
    const wikiResult = await runBackgroundSynthesis(operatorId, { mode: "onboarding" });
    wikiPageCount = wikiResult?.pagesCreated ?? 0;
    console.log(`[post-synthesis] Wiki synthesis complete: ${wikiPageCount} pages created`);
  } catch (err) {
    console.error(`[post-synthesis] Wiki synthesis failed for ${operatorId}:`, err);
    // Non-fatal — detection proceeds without wiki pages (degraded but functional)
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

  // Reconcile orphaned entities (assign to departments via email/relationship matching)
  try {
    const { reconcileOrphanedEntities } = await import("@/lib/entity-reconciliation");
    await reconcileOrphanedEntities(operatorId);
  } catch (err) {
    console.error("[post-synthesis] Entity reconciliation failed:", err);
  }

  // ── Initiative Assembly from Bookmarks ───────────────────────────
  console.log(`[post-synthesis] Assembling initiatives from bookmarks for ${operatorId}`);
  let initiativeCount = 0;
  try {
    const { assembleInitiativesFromBookmarks } = await import("@/lib/wiki-bookmark-assembly");
    const assemblyResult = await assembleInitiativesFromBookmarks(operatorId);
    initiativeCount = assemblyResult.initiativesCreated;
    console.log(`[post-synthesis] Bookmark assembly: ${assemblyResult.bookmarksReviewed} reviewed, ${assemblyResult.groupsFormed} groups, ${initiativeCount} initiatives`);
  } catch (err) {
    console.error(`[post-synthesis] Bookmark assembly failed for ${operatorId}:`, err);
    // Non-fatal
  }

  // Count total situations created
  const totalSituations = await prisma.situation.count({
    where: { operatorId, status: { in: ["detected", "reasoning", "proposed"] } },
  });

  console.log(`[post-synthesis] Complete: ${extraction.entitiesCreated} entities, ${inference.relationshipsCreated} relationships, ${wikiPageCount} wiki pages, ${totalSituations} situations, ${initiativeCount} initiatives, ${investigationCount} investigations planned`);

  return {
    entities: extraction.entitiesCreated,
    properties: extraction.propertiesSet,
    relationships: inference.relationshipsCreated,
    situations: totalSituations,
    wikiPages: wikiPageCount,
    initiatives: initiativeCount,
  };
}
