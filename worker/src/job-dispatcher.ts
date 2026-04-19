import { prisma } from "@/lib/db";
import { reasonAboutSituation } from "@/lib/reasoning-engine";
import { evaluateContentForSituations, isEligibleCommunication, type CommunicationItem } from "@/lib/content-situation-detector";
import { generatePreFilter } from "@/lib/situation-prefilter";

type JobPayload = Record<string, unknown>;

const handlers: Record<string, (payload: JobPayload) => Promise<void>> = {
  async reason_situation(payload) {
    const { situationId, wikiPageSlug } = payload as { situationId: string; wikiPageSlug?: string };
    await reasonAboutSituation(situationId, wikiPageSlug);
  },

  async run_deliberation_pass(payload) {
    const { operatorId, situationSlug } = payload as { operatorId: string; situationSlug: string };
    const { runDeliberationPass } = await import("@/lib/deliberation-pass");
    await runDeliberationPass(operatorId, situationSlug);
  },

  async run_partial_deliberation_pass(payload) {
    const { operatorId, situationSlug, unblockedStepOrders } = payload as {
      operatorId: string;
      situationSlug: string;
      unblockedStepOrders: number[];
    };
    const { runPartialDeliberationPass } = await import("@/lib/deliberation-pass");
    await runPartialDeliberationPass(operatorId, situationSlug, unblockedStepOrders);
  },

  async reason_idea(payload) {
    const { operatorId, pageSlug } = payload as { operatorId: string; pageSlug: string };
    const { reasonAboutIdea } = await import("@/lib/idea-reasoning");
    await reasonAboutIdea(operatorId, pageSlug);
  },

  async execute_idea(payload) {
    const { operatorId, pageSlug } = payload as { operatorId: string; pageSlug: string };
    const { executeIdea } = await import("@/lib/idea-execution");
    await executeIdea(operatorId, pageSlug);
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
    const { operatorId } = payload as { operatorId: string };
    const { extractOperatorInsights } = await import("@/lib/operational-knowledge");
    await extractOperatorInsights(operatorId);
  },

  async evaluate_recent_content(payload) {
    const { operatorId } = payload as { operatorId: string };

    // Load recent communication raw content (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const rawItems = await prisma.rawContent.findMany({
      where: {
        operatorId,
        occurredAt: { gte: thirtyDaysAgo },
        sourceType: { in: ["email", "slack_message", "teams_message"] },
        rawBody: { not: null },
      },
      select: {
        sourceType: true,
        sourceId: true,
        rawBody: true,
        rawMetadata: true,
      },
      orderBy: { occurredAt: "desc" },
      take: 500,
    });

    if (rawItems.length === 0) {
      console.log("[evaluate_recent_content] No recent communication content found");
      return;
    }

    // Convert RawContent to CommunicationItems
    const items: CommunicationItem[] = [];
    for (const raw of rawItems) {
      const meta = (raw.rawMetadata ?? {}) as Record<string, unknown>;

      // Skip automated messages
      if (!isEligibleCommunication({ sourceType: raw.sourceType, metadata: meta })) continue;

      // Reconstruct participantEmails from metadata (from, to, cc)
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

  async classify_chunks(_payload) {
    console.log("[cron] Chunk classification skipped — deprecated in v0.3.10");
  },

  async execute_wiki_step(payload) {
    const { operatorId, pageSlug, stepOrder } = payload as { operatorId: string; pageSlug: string; stepOrder: number };
    const { executeSituationStep } = await import("@/lib/wiki-execution-engine");
    await executeSituationStep(operatorId, pageSlug, stepOrder);
  },

  async approve_situation_step(payload) {
    const { operatorId, pageSlug, stepOrder, userId, action } = payload as {
      operatorId: string; pageSlug: string; stepOrder: number; userId: string; action: "approve" | "reject" | "skip";
    };
    const { approveSituationStep } = await import("@/lib/wiki-execution-engine");
    await approveSituationStep(operatorId, pageSlug, stepOrder, userId, action);
  },

  async strategic_scan(payload) {
    const { operatorId } = payload as { operatorId: string };
    const { runWikiStrategicScan } = await import("@/lib/wiki-strategic-scanner");
    await runWikiStrategicScan(operatorId);
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

  async run_living_research(payload) {
    const { operatorId } = payload as { operatorId: string };
    const { runLivingResearch } = await import("@/lib/living-research");
    const result = await runLivingResearch(operatorId);
    if (result.significantFindings > 0) {
      console.log(
        `[living-research] ${operatorId}: ${result.significantFindings} significant findings`,
      );
    }
  },

  async execute_research_plan(payload) {
    const { operatorId, planId } = payload as { operatorId: string; planId: string };
    const { executeResearchPlan } = await import("@/lib/investigation-executor");
    await executeResearchPlan(operatorId, planId, {
      concurrency: 5,
      onProgress: async (msg) => {
        console.log(`[research] ${msg}`);
      },
    });
  },

  async process_file_upload(payload) {
    const { fileUploadId } = payload as { fileUploadId: string };
    const { processFileUpload } = await import("@/lib/file-processor");
    await processFileUpload(fileUploadId);
  },

  async process_document_intelligence(payload) {
    const { fileUploadId } = payload as { fileUploadId: string };
    const { runDocumentIntelligenceOnly } = await import("@/lib/file-processor");
    await runDocumentIntelligenceOnly(fileUploadId);
  },

  async seed_ontology(payload) {
    const { vertical, content } = payload as { vertical: string; content: string };
    const { seedOntology } = await import("@/lib/system-intelligence-ontology");
    const pageId = await seedOntology(vertical, content);
    console.log(`[worker:seed-ontology] ${vertical}: ${pageId ? `created ${pageId}` : "already exists"}`);
  },

  async process_research_corpus(payload) {
    const { documents, vertical, dryRun } = payload as {
      documents: Array<{ id: string; title: string; content: string; focusArea?: string }>;
      vertical: string;
      dryRun?: boolean;
    };
    const { processResearchCorpus } = await import("@/lib/research-corpus-pipeline");
    const report = await processResearchCorpus(documents, vertical, {
      dryRun,
      onProgress: async (phase, msg) => {
        console.log(`[worker:research-corpus] [${phase}] ${msg}`);
      },
    });
    console.log(`[worker:research-corpus] ${report.phase}: ${report.pagesSynthesized} pages, $${(report.totalCostCents / 100).toFixed(2)}`);
  },

  async process_source_document(payload) {
    const { sourceId } = payload as { sourceId: string };
    const { extractRawText, extractSections } = await import("@/lib/source-extractor");
    const { synthesizeSourceSection } = await import("@/lib/source-synthesizer");

    try {
      const source = await prisma.sourceDocument.findUnique({
        where: { id: sourceId },
        select: { id: true, fileUploadId: true, rawText: true, rawMarkdown: true, sourceType: true },
      });
      if (!source) throw new Error(`Source document not found: ${sourceId}`);

      // Extract raw text if file upload and no text yet
      let text = source.rawText || source.rawMarkdown;
      if (source.fileUploadId && !text) {
        await prisma.sourceDocument.update({ where: { id: sourceId }, data: { status: "extracting" } });
        const rawText = await extractRawText(source.fileUploadId);
        await prisma.sourceDocument.update({ where: { id: sourceId }, data: { rawText } });
        text = rawText;
      }
      if (!text) throw new Error(`No text content for source ${sourceId}`);

      // Extract sections
      await extractSections({ sourceId, rawText: text, sourceType: source.sourceType });
      await prisma.sourceDocument.update({ where: { id: sourceId }, data: { status: "synthesizing" } });
      console.log(`[process_source_document] Sections extracted for "${sourceId}", starting synthesis`);

      // Synthesize each section sequentially (rate limits + later sections see earlier pages)
      const sections = await prisma.sourceSection.findMany({
        where: { sourceId, status: "pending" },
        orderBy: { sectionIndex: "asc" },
        select: { id: true, sectionIndex: true, title: true, tokenCount: true, sectionType: true },
      });

      // Skip non-content sections
      const skippable = new Set(["preface", "index", "appendix"]);
      const contentSections = sections.filter(s => !skippable.has(s.sectionType));

      let totalPages = 0;
      for (const section of contentSections) {
        try {
          const result = await synthesizeSourceSection({ sourceId, sectionId: section.id });
          totalPages += result.pagesCreated;
        } catch (err) {
          console.error(`[process_source_document] Synthesis failed for section ${section.id}:`, err);
          await prisma.sourceSection.update({
            where: { id: section.id },
            data: { status: "skipped", skipReason: err instanceof Error ? err.message : String(err) },
          }).catch(() => {});
        }
      }

      // Mark skipped sections
      for (const section of sections.filter(s => skippable.has(s.sectionType))) {
        await prisma.sourceSection.update({
          where: { id: section.id },
          data: { status: "skipped", skipReason: `Section type: ${section.sectionType}` },
        }).catch(() => {});
      }

      // Update source status
      await prisma.sourceDocument.update({
        where: { id: sourceId },
        data: {
          status: totalPages > 0 ? "staged" : "complete",
          pagesProduced: totalPages,
        },
      });
      console.log(`[process_source_document] Complete: ${totalPages} pages from "${sourceId}"`);
    } catch (err) {
      console.error(`[process_source_document] Failed for ${sourceId}:`, err);
      await prisma.sourceDocument.update({
        where: { id: sourceId },
        data: {
          status: "uploaded",
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      }).catch(() => {});
      throw err;
    }
  },

  async synthesize_research(payload) {
    const { content, title, focusArea } = payload as { content: string; title: string; focusArea?: string };
    const { synthesizeResearchDocument } = await import("@/lib/research-synthesizer");
    const result = await synthesizeResearchDocument({ documentContent: content, documentTitle: title, focusArea });
    console.log(`[synthesize_research] Created ${result.pagesCreated} system wiki pages from "${title}"`);
  },

  async process_activity(payload) {
    const { operatorId, rawContentIds } = payload as { operatorId: string; rawContentIds: string[] };
    const { processActivityBatch } = await import("@/lib/wiki-activity-pipeline");
    const result = await processActivityBatch(operatorId, rawContentIds);
    console.log(`[process_activity] Operator ${operatorId}: ${result.processed} processed, ${result.written} written, ${result.detected} detected, ${result.skipped} skipped`);
  },

  async clean_activity(payload) {
    const { operatorId } = payload as { operatorId: string };
    const { cleanActivityPages } = await import("@/lib/wiki-activity-pipeline");
    const result = await cleanActivityPages(operatorId);
    console.log(`[clean_activity] Operator ${operatorId}: ${result.pagesCleanedUp} pages, ${result.entriesRemoved} entries removed, ${result.entriesCompressed} compressed`);
  },

  async run_system_job(payload) {
    const { systemJobIndexId, triggerContext, triggerChain } = payload as {
      systemJobIndexId: string;
      triggerContext: { triggerType: "cron" | "event"; eventType?: string; payload?: Record<string, unknown> };
      triggerChain?: string[];
    };
    const { runSystemJobByIndex } = await import("@/lib/system-job-reasoning");
    await runSystemJobByIndex({
      systemJobIndexId,
      triggerContext,
      triggerChain: triggerChain ?? [],
    });
  },

};

export async function dispatchJob(jobType: string, payload: JobPayload): Promise<void> {
  const handler = handlers[jobType];
  if (!handler) {
    throw new Error(`Unknown job type: ${jobType}`);
  }
  await handler(payload);
}
