import { prisma } from "@/lib/db";
import { reasonAboutSituation } from "@/lib/reasoning-engine";
import { reassessWorkStream } from "@/lib/workstream-reassessment";
import { advanceStep } from "@/lib/execution-engine";
import { detectSituations } from "@/lib/situation-detector";
import { evaluateContentForSituations, isEligibleCommunication, type CommunicationItem } from "@/lib/content-situation-detector";
import { generatePreFilter } from "@/lib/situation-prefilter";

type JobPayload = Record<string, unknown>;

const handlers: Record<string, (payload: JobPayload) => Promise<void>> = {
  async reason_situation(payload) {
    const { situationId } = payload as { situationId: string };
    await reasonAboutSituation(situationId);
  },

  async reassess_workstream(payload) {
    const { workStreamId, completedSourceId, completedSourceType } = payload as {
      workStreamId: string;
      completedSourceId: string;
      completedSourceType: string;
    };
    await reassessWorkStream(workStreamId, completedSourceId, completedSourceType);
  },

  async advance_step(payload) {
    const { stepId, action, userId } = payload as { stepId: string; action: "approve" | "reject" | "skip"; userId: string };
    await advanceStep(stepId, action, userId);
  },

  async detect_situations(payload) {
    const { operatorId } = payload as { operatorId: string };
    await detectSituations(operatorId);
  },

  async evaluate_content(payload) {
    const { operatorId, items } = payload as { operatorId: string; items: CommunicationItem[] };
    await evaluateContentForSituations(operatorId, items);
  },

  async generate_prefilter(payload) {
    const { situationTypeId } = payload as { situationTypeId: string };
    await generatePreFilter(situationTypeId);
  },

  async extract_insights(payload) {
    const { operatorId, aiEntityId } = payload as {
      operatorId: string;
      aiEntityId: string;
    };
    const { extractInsights } = await import("@/lib/operational-knowledge");
    await extractInsights(operatorId, aiEntityId);
  },

  async evaluate_recent_content(payload) {
    const { operatorId } = payload as { operatorId: string };

    // Load recent communication content chunks (last 30 days, first chunk only)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const chunks = await prisma.contentChunk.findMany({
      where: {
        operatorId,
        createdAt: { gte: thirtyDaysAgo },
        sourceType: { in: ["email", "slack_message", "teams_message"] },
        chunkIndex: 0, // Only first chunk per message (avoid duplicates from multi-chunk content)
      },
      select: {
        sourceType: true,
        sourceId: true,
        content: true,
        metadata: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    if (chunks.length === 0) {
      console.log("[evaluate_recent_content] No recent communication content found");
      return;
    }

    // Convert ContentChunks to CommunicationItems
    const items: CommunicationItem[] = [];
    for (const chunk of chunks) {
      const meta = chunk.metadata ? JSON.parse(chunk.metadata) as Record<string, unknown> : undefined;

      // Skip automated messages
      if (!isEligibleCommunication({ sourceType: chunk.sourceType, metadata: meta })) continue;

      // Reconstruct participantEmails from metadata (from, to, cc)
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

    if (items.length === 0) {
      console.log("[evaluate_recent_content] No eligible communication items after filtering");
      return;
    }

    console.log(`[evaluate_recent_content] Evaluating ${items.length} items for operator ${operatorId}`);
    const BATCH_SIZE = 20;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      await evaluateContentForSituations(operatorId, items.slice(i, i + BATCH_SIZE));
    }
  },

  async audit_prefilters(payload) {
    const { operatorId } = payload as { operatorId: string };
    const { auditPreFilters } = await import("@/lib/situation-audit");
    await auditPreFilters(operatorId);
  },

  async classify_chunks(payload) {
    const { operatorId } = payload as { operatorId: string };
    const { classifyOperatorChunks } = await import("@/lib/knowledge/chunk-classifier");
    const result = await classifyOperatorChunks(operatorId);
    console.log(`[classify_chunks] Result:`, result);
  },

  async strategic_scan(payload) {
    const { operatorId } = payload as { operatorId: string };
    const { runStrategicScan } = await import("@/lib/strategic-scan");
    await runStrategicScan(operatorId);
  },

  async generate_deliverable(payload) {
    const { deliverableId, projectId } = payload as { deliverableId: string; projectId: string };
    const { generateDeliverable } = await import("@/lib/deliverable-generator");
    await generateDeliverable(deliverableId, projectId);
  },

  async compile_project(payload) {
    const { projectId } = payload as { projectId: string };
    const { compileProjectKnowledge } = await import("@/lib/project-compilation");
    await compileProjectKnowledge(projectId);
  },

  async post_synthesis_pipeline(payload) {
    const { operatorId } = payload as { operatorId: string };
    const { runPostSynthesisPipeline } = await import("@/lib/onboarding-intelligence/post-synthesis-pipeline");
    await runPostSynthesisPipeline(operatorId);
  },

  async reflect_on_outcome(payload) {
    const { situationId, outcome, feedback } = payload as {
      situationId: string;
      outcome: "approved" | "rejected" | "dismissed";
      feedback?: string | null;
    };
    const { reflectOnOutcome } = await import("@/lib/reflection-engine");
    await reflectOnOutcome({ situationId, outcome, feedback });
  },

  async wiki_background_synthesis(payload) {
    const { operatorId, mode } = payload as { operatorId: string; mode: "onboarding" | "incremental" };
    const { runBackgroundSynthesis } = await import("@/lib/wiki-background-synthesis");
    const result = await runBackgroundSynthesis(operatorId, { mode });
    console.log(`[wiki_background_synthesis] ${mode} for ${operatorId}: ${result.pagesCreated} pages created, ${result.pagesVerified} verified`);

    if (mode === "onboarding") {
      try {
        const { runWikiStrategicScan } = await import("@/lib/wiki-strategic-scanner");
        const scanResult = await runWikiStrategicScan(operatorId);
        console.log(`[wiki_background_synthesis] Post-synthesis scan: ${scanResult.patternsDetected} patterns, ${scanResult.initiativesCreated} initiatives`);
      } catch (err) {
        console.error(`[wiki_background_synthesis] Post-synthesis scan failed:`, err);
      }
    }
  },

  async synthesize_research(payload) {
    const { content, title, focusArea } = payload as { content: string; title: string; focusArea?: string };
    const { synthesizeResearchDocument } = await import("@/lib/research-synthesizer");
    const result = await synthesizeResearchDocument({ documentContent: content, documentTitle: title, focusArea });
    console.log(`[synthesize_research] Created ${result.pagesCreated} system wiki pages from "${title}"`);
  },
};

export async function dispatchJob(jobType: string, payload: JobPayload): Promise<void> {
  const handler = handlers[jobType];
  if (!handler) {
    throw new Error(`Unknown job type: ${jobType}`);
  }
  await handler(payload);
}
