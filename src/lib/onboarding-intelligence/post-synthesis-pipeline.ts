/**
 * Post-synthesis pipeline — runs research planning and content-based
 * situation detection BEFORE the intelligence preview is shown.
 *
 * Entity extraction and relationship inference removed — wiki pages
 * are now the primary representation of people, departments, and processes.
 */

import { prisma } from "@/lib/db";

export async function runPostSynthesisPipeline(operatorId: string): Promise<{
  situations: number;
  investigations: number;
  initiatives: number;
}> {
  // ── Research Planning ──────────────────────────────────────────
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
    console.error(`[post-synthesis] Research planning failed:`, err);
  }

  // Enqueue research plan execution
  if (investigationCount > 0) {
    try {
      const latestPlan = await prisma.researchPlan.findFirst({
        where: { operatorId, status: "planned" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (latestPlan) {
        const { enqueueWorkerJob } = await import("@/lib/worker-dispatch");
        await enqueueWorkerJob("execute_research_plan", operatorId, { planId: latestPlan.id });
      }
    } catch (err) {
      console.error("[post-synthesis] Failed to enqueue research plan:", err);
    }
  }

  // ── Content-Based Situation Detection ──────────────────────────
  // TODO: Wiki-based entity detection (Session 2) — for now only content-based
  console.log(`[post-synthesis] Running content-based situation detection for ${operatorId}`);
  try {
    const { evaluateContentForSituations, isEligibleCommunication } = await import("@/lib/content-situation-detector");

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const rawItems = await prisma.rawContent.findMany({
      where: {
        operatorId,
        occurredAt: { gte: thirtyDaysAgo },
        sourceType: { in: ["email", "slack_message", "teams_message"] },
        rawBody: { not: null },
      },
      select: { sourceType: true, sourceId: true, rawBody: true, rawMetadata: true },
      orderBy: { occurredAt: "desc" },
      take: 500,
    });

    const items: Array<{ sourceType: string; sourceId: string; content: string; metadata?: Record<string, unknown>; participantEmails?: string[] }> = [];
    for (const raw of rawItems) {
      const meta = (raw.rawMetadata ?? {}) as Record<string, unknown>;
      if (!isEligibleCommunication({ sourceType: raw.sourceType, metadata: meta })) continue;

      const emails: string[] = [];
      if (typeof meta.from === "string") emails.push(meta.from);
      if (Array.isArray(meta.to)) emails.push(...(meta.to as string[]));
      else if (typeof meta.to === "string") emails.push(...meta.to.split(/[,;]\s*/));
      if (Array.isArray(meta.cc)) emails.push(...(meta.cc as string[]));
      else if (typeof meta.cc === "string") emails.push(...meta.cc.split(/[,;]\s*/));

      items.push({
        sourceType: raw.sourceType,
        sourceId: raw.sourceId,
        content: raw.rawBody!,
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

  // ── Wiki Strategic Scanner ──────────────────────────
  console.log(`[post-synthesis] Running strategic wiki scan for ${operatorId}`);
  let initiativeCount = 0;
  try {
    const { runWikiStrategicScan } = await import("@/lib/wiki-strategic-scanner");
    const scanResult = await runWikiStrategicScan(operatorId);
    initiativeCount = scanResult.initiativesCreated;
    console.log(`[post-synthesis] Strategic scan: ${initiativeCount} initiatives, ${scanResult.situationsCreated} situations`);
  } catch (err) {
    console.error("[post-synthesis] Strategic scan failed:", err);
  }

  const totalSituations = await prisma.knowledgePage.count({
    where: { operatorId, pageType: "situation_instance", scope: "operator" },
  });

  console.log(`[post-synthesis] Complete: ${totalSituations} situations, ${investigationCount} investigations, ${initiativeCount} initiatives`);

  return {
    situations: totalSituations,
    investigations: investigationCount,
    initiatives: initiativeCount,
  };
}
