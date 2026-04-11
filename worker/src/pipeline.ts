import type { PrismaClient } from "@prisma/client";
import { addProgressMessage } from "@/lib/onboarding-intelligence/progress";
import { buildPeopleRegistry } from "@/lib/onboarding-intelligence/people-discovery";
import type { PeopleRegistryEntry } from "@/lib/onboarding-intelligence/people-discovery";
import { sendAnalysisCompleteEmail } from "@/lib/onboarding-intelligence/synthesis";

export async function runAnalysisPipeline(analysisId: string, prisma: PrismaClient): Promise<void> {
  const analysis = await prisma.onboardingAnalysis.findUnique({
    where: { id: analysisId },
    include: { operator: true },
  });
  if (!analysis) throw new Error("Analysis not found");

  const operatorId = analysis.operatorId;
  let totalCostCents = 0;

  // ═══ PHASE 1: People Discovery ═════════════════════════════════════════════
  await updatePhase(prisma, analysisId, "people_discovery");
  await addProgressMessage(analysisId, "Starting organizational intelligence analysis...");
  await addProgressMessage(analysisId, "Scanning all connected systems for people...", "people_discovery");

  let peopleRegistry: PeopleRegistryEntry[] | undefined;

  const peopleRun = await prisma.onboardingAgentRun.create({
    data: {
      analysisId,
      agentName: "people_discovery",
      round: 0,
      status: "running",
      maxIterations: 1,
      startedAt: new Date(),
    },
  });

  try {
    const registry = await buildPeopleRegistry(operatorId);
    peopleRegistry = registry;

    const verifiedCount = registry.filter((p) => p.adminApiVerified).length;
    const inferredInternalCount = registry.filter((p) => p.isInternal && !p.adminApiVerified).length;
    const externalCount = registry.filter((p) => !p.isInternal).length;

    let progressMsg: string;
    if (verifiedCount > 0) {
      progressMsg = `Discovered ${verifiedCount} verified employees (company directory), ${inferredInternalCount} additional team members, and ${externalCount} external contacts`;
    } else {
      progressMsg = `Discovered ${inferredInternalCount} team members and ${externalCount} external contacts across all sources`;
    }

    await addProgressMessage(analysisId, progressMsg, "people_discovery");

    await prisma.onboardingAgentRun.update({
      where: { id: peopleRun.id },
      data: {
        status: "complete",
        iterationCount: 1,
        report: registry as any,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.onboardingAgentRun.update({
      where: { id: peopleRun.id },
      data: {
        status: "failed",
        report: { error: message } as any,
        completedAt: new Date(),
      },
    });
    await addProgressMessage(analysisId, `People discovery failed: ${message}`, "people_discovery");
    // Continue without people registry — synthesis can still work with content data
  }

  // ═══ PHASE 1.5: Total Ingestion — Evidence Extraction ═══════════════════════
  await updatePhase(prisma, analysisId, "evidence_extraction");
  await addProgressMessage(analysisId, "Reading all connected data and extracting evidence...", "evidence_extraction");

  try {
    const { runTotalIngestion } = await import("@/lib/evidence-ingestion");
    const ingestionReport = await runTotalIngestion(operatorId, {
      forceReExtract: true, // Always re-extract on new onboarding
      onProgress: async (msg) => {
        await addProgressMessage(analysisId, msg, "evidence_extraction");
      },
      analysisId,
    });
    totalCostCents += ingestionReport.costCents;
    await addProgressMessage(
      analysisId,
      `Evidence extraction complete: ${ingestionReport.totalClaims} claims from ${ingestionReport.extractionsCreated} chunks ($${(ingestionReport.costCents / 100).toFixed(2)})`,
      "evidence_extraction",
    );
  } catch (err) {
    console.error("[pipeline] Total ingestion failed:", err);
    await addProgressMessage(
      analysisId,
      `Evidence extraction failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      "evidence_extraction",
    );
    // Non-fatal — wiki synthesis can still work with raw data
  }

  // ═══ PHASE 2: Wiki Findings Pass ═══════════════════════════════════════════
  await updatePhase(prisma, analysisId, "wiki_findings");
  await addProgressMessage(analysisId, "Reading all your data and building findings...");

  try {
    const { runWikiFindingsPass } = await import("@/lib/onboarding-intelligence/wiki-findings-pass");
    const findingsReport = await runWikiFindingsPass(operatorId, {
      onProgress: async (msg) => {
        await addProgressMessage(analysisId, msg, "wiki_findings");
      },
      analysisId,
    });
    totalCostCents += findingsReport.totalCostCents;

    await addProgressMessage(
      analysisId,
      `Findings complete: ${findingsReport.personPages} people, ${findingsReport.domainPages} domains, ${findingsReport.processPages} processes, ${findingsReport.externalPages} external relationships`,
      "wiki_findings",
    );
  } catch (err) {
    console.error("[pipeline] Wiki findings pass failed:", err);
    await addProgressMessage(
      analysisId,
      `Findings pass failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      "wiki_findings",
    );
    // Non-fatal — synthesis pass can still attempt with whatever findings exist
  }

  // ═══ PHASE 3: Wiki Synthesis Pass ═══════════════════════════════════════════
  await updatePhase(prisma, analysisId, "wiki_synthesis");
  await addProgressMessage(analysisId, "Building your company wiki...");

  let synthesisReport: { totalPagesWritten: number; hubPagesWritten: number; leafPagesWritten: number; departments: number; situationTypes: number; totalCostCents: number } | undefined;

  try {
    const { runWikiSynthesisPass } = await import("@/lib/onboarding-intelligence/wiki-synthesis-pass");
    synthesisReport = await runWikiSynthesisPass(operatorId, {
      onProgress: async (msg) => {
        await addProgressMessage(analysisId, msg, "wiki_synthesis");
      },
      analysisId,
    });
    totalCostCents += synthesisReport.totalCostCents;

    await addProgressMessage(
      analysisId,
      `Wiki complete: ${synthesisReport.totalPagesWritten} pages (${synthesisReport.hubPagesWritten} hubs, ${synthesisReport.leafPagesWritten} leaves), ${synthesisReport.departments} departments, ${synthesisReport.situationTypes} situation types`,
      "wiki_synthesis",
    );
  } catch (err) {
    const reason = `Wiki synthesis failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[pipeline] ${reason}`);
    await addProgressMessage(analysisId, reason, "wiki_synthesis");
    await prisma.onboardingAnalysis.update({
      where: { id: analysisId },
      data: { status: "failed", failureReason: reason, completedAt: new Date() },
    });
    return;
  }

  // ═══ Finalization ═══════════════════════════════════════════════════════════

  // Mark analysis complete
  await prisma.onboardingAnalysis.update({
    where: { id: analysisId },
    data: {
      status: "confirming",
      currentPhase: "wiki_synthesis",
      synthesisOutput: { wikiPages: synthesisReport.totalPagesWritten } as any,
      completedAt: new Date(),
    },
  });

  // Send email notification
  await sendAnalysisCompleteEmail(operatorId);

  // Chunk classification removed in v0.3.10 — RawContent replaces ContentChunk pipeline

  // Enqueue post-synthesis pipeline
  try {
    await prisma.workerJob.create({
      data: {
        jobType: "post_synthesis_pipeline",
        operatorId,
        payload: { operatorId } as any,
      },
    });
    console.log(`[pipeline] Enqueued post_synthesis_pipeline for operator ${operatorId}`);
  } catch (err) {
    console.error("[pipeline] Failed to enqueue post_synthesis_pipeline:", err);
  }

  await addProgressMessage(analysisId, "Your operational map is ready for review!");

  console.log(`[pipeline] Complete — wiki-first synthesis, $${(totalCostCents / 100).toFixed(2)}`);
}

// ── Utilities ────────────────────────────────────────────────────────────────

async function updatePhase(prisma: PrismaClient, analysisId: string, phase: string): Promise<void> {
  await prisma.onboardingAnalysis.update({
    where: { id: analysisId },
    data: { currentPhase: phase },
  });
}
