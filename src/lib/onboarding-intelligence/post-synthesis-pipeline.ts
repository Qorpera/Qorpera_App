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
  ideas: number;
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
        await enqueueWorkerJob("execute_research_plan", operatorId, { operatorId, planId: latestPlan.id });
      }
    } catch (err) {
      console.error("[post-synthesis] Failed to enqueue research plan:", err);
    }
  }

  // ── Content-Based Situation Detection ──────────────────────────
  // Evaluates ALL eligible content — emails, messages, documents, calendar,
  // financial records — not just communications.
  console.log(`[post-synthesis] Running content-based situation detection for ${operatorId}`);
  try {
    const { evaluateContentForSituations, isEligibleContent } = await import("@/lib/content-situation-detector");

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const rawItems = await prisma.rawContent.findMany({
      where: {
        operatorId,
        occurredAt: { gte: thirtyDaysAgo },
        rawBody: { not: null },
      },
      select: { sourceType: true, sourceId: true, rawBody: true, rawMetadata: true },
      orderBy: { occurredAt: "desc" },
    });

    const items: Array<{ sourceType: string; sourceId: string; content: string; metadata?: Record<string, unknown>; participantEmails?: string[] }> = [];
    for (const raw of rawItems) {
      const meta = (raw.rawMetadata ?? {}) as Record<string, unknown>;
      if (!isEligibleContent({ sourceType: raw.sourceType, metadata: meta, content: raw.rawBody! })) continue;

      // Extract participant emails from all metadata fields
      const emails: string[] = [];
      for (const field of ["from", "to", "cc", "authorEmail", "ownerEmail", "organizerEmail", "lastModifiedBy", "createdBy", "contactEmail"]) {
        const val = meta[field];
        if (typeof val === "string" && val.includes("@")) {
          emails.push(...val.split(/[,;]\s*/));
        } else if (Array.isArray(val)) {
          for (const v of val as Array<string | { email?: string }>) {
            const email = typeof v === "string" ? v : v?.email;
            if (typeof email === "string" && email.includes("@")) emails.push(email);
          }
        }
      }
      if (Array.isArray(meta.attendees)) {
        for (const a of meta.attendees as Array<string | { email?: string }>) {
          const email = typeof a === "string" ? a : a?.email;
          if (typeof email === "string" && email.includes("@")) emails.push(email);
        }
      }

      items.push({
        sourceType: raw.sourceType,
        sourceId: raw.sourceId,
        content: raw.rawBody!,
        metadata: meta,
        participantEmails: emails.length > 0 ? emails : undefined,
      });
    }

    if (items.length > 0) {
      console.log(`[post-synthesis] Evaluating ${items.length} content items (${rawItems.length} raw, ${rawItems.length - items.length} filtered)`);
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
  let ideaCount = 0;
  try {
    const { runWikiStrategicScan } = await import("@/lib/wiki-strategic-scanner");
    const scanResult = await runWikiStrategicScan(operatorId);
    ideaCount = scanResult.ideasCreated;
    console.log(`[post-synthesis] Strategic scan: ${ideaCount} ideas, ${scanResult.situationsCreated} situations`);
  } catch (err) {
    console.error("[post-synthesis] Strategic scan failed:", err);
  }

  const totalSituations = await prisma.knowledgePage.count({
    where: { operatorId, pageType: "situation_instance", scope: "operator" },
  });

  console.log(`[post-synthesis] Complete: ${totalSituations} situations, ${investigationCount} investigations, ${ideaCount} ideas`);

  return {
    situations: totalSituations,
    investigations: investigationCount,
    ideas: ideaCount,
  };
}
