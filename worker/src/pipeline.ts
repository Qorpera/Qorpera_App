import Anthropic from "@anthropic-ai/sdk";
import type { PrismaClient } from "@prisma/client";
import { addProgressMessage } from "@/lib/onboarding-intelligence/progress";
import { getModel, getMaxOutputTokens, getThinkingBudget } from "@/lib/ai-provider";
import { calculateCallCostCents } from "@/lib/model-pricing";
import { buildPeopleRegistry } from "@/lib/onboarding-intelligence/people-discovery";
import type { PeopleRegistryEntry } from "@/lib/onboarding-intelligence/people-discovery";
import {
  SYNTHESIS_PROMPT_V2,
  buildRawDataSynthesisInput,
  createEntitiesFromModel,
  createEntityTypesFromModel,
  createExternalEntitiesFromModel,
  createSituationTypesFromModel,
  createGoalsFromModel,
  normalizeCompanyModel,
  sendAnalysisCompleteEmail,
  type CompanyModel,
} from "@/lib/onboarding-intelligence/synthesis";
import { getArchetypeTaxonomy } from "@/lib/archetype-classifier";

export async function runAnalysisPipeline(analysisId: string, prisma: PrismaClient): Promise<void> {
  const analysis = await prisma.onboardingAnalysis.findUnique({
    where: { id: analysisId },
    include: { operator: true },
  });
  if (!analysis) throw new Error("Analysis not found");

  const operatorId = analysis.operatorId;
  const modelOverride = analysis.modelOverride ?? undefined;
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
    // Non-fatal — structural synthesis can still work with raw data
  }

  // ═══ PHASE 2: Structural Synthesis ═════════════════════════════════════════
  await updatePhase(prisma, analysisId, "synthesis");
  await addProgressMessage(analysisId, "Analyzing your data and building company model...");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  (client as any)._calculateNonstreamingTimeout = () => 20 * 60 * 1000;

  // Build raw data summary for the synthesis model
  const registryForSynthesis = (peopleRegistry ?? []).map((p) => ({
    displayName: p.displayName,
    email: p.email,
    isInternal: p.isInternal,
    adminApiVerified: p.adminApiVerified ?? false,
    title: p.adminTitle ?? p.sources?.[0]?.title,
    department: p.adminDepartment ?? p.sources?.[0]?.role,
  }));

  const synthesisInput = await buildRawDataSynthesisInput(operatorId, registryForSynthesis);

  // Enrich synthesis input with evidence registry summary
  let evidenceEnrichment = "";
  try {
    const { getExtractionStats } = await import("@/lib/evidence-registry");
    const stats = await getExtractionStats(operatorId);

    if (stats.totalExtractions > 0) {
      const entityMentions = await prisma.$queryRaw<Array<{ entity: string; count: number }>>`
        SELECT entity, COUNT(*)::int as count FROM (
          SELECT jsonb_array_elements_text(
            jsonb_path_query_array(extractions::jsonb, '$[*].entities[*]')
          ) as entity
          FROM "EvidenceExtraction"
          WHERE "operatorId" = ${operatorId}
        ) sub
        GROUP BY entity
        ORDER BY count DESC
        LIMIT 50
      `;

      evidenceEnrichment =
        `\n\n## Evidence Registry Summary\n\n` +
        `Total extractions: ${stats.totalExtractions} from ${Object.keys(stats.bySourceType).length} source types\n` +
        `Total claims: ${stats.totalClaims}, contradictions: ${stats.totalContradictions}\n` +
        `Source types: ${Object.entries(stats.bySourceType).map(([t, c]) => `${t}: ${c}`).join(", ")}\n\n` +
        `### Most-mentioned entities (use for department assignment and role inference):\n` +
        entityMentions.map((e) => `- ${e.entity}: mentioned ${e.count} times`).join("\n");
    }
  } catch (err) {
    console.error("[pipeline] Evidence enrichment failed:", err);
    // Non-fatal
  }

  const enrichedInput = synthesisInput + evidenceEnrichment;

  const archetypeTaxonomy = await getArchetypeTaxonomy();
  const synthesisSystemPrompt = SYNTHESIS_PROMPT_V2 + `

## Archetype Taxonomy

Each situationTypeRecommendation should include an archetypeSlug — the slug of the closest matching archetype from this taxonomy. Match based on the situation's purpose and detection intent, not just name similarity. Use null only if no archetype fits.

${archetypeTaxonomy}`;

  const synthModel = modelOverride ?? getModel("onboardingSynthesis");
  const synthThinking = getThinkingBudget("onboardingSynthesis");
  const synthStart = Date.now();

  const response = await client.messages.create({
    model: synthModel,
    max_tokens: getMaxOutputTokens(synthModel),
    temperature: synthThinking ? undefined : 0,
    ...(synthThinking ? { thinking: { type: "enabled" as const, budget_tokens: synthThinking } } : {}),
    system: [
      {
        type: "text" as const,
        text: synthesisSystemPrompt,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [{ role: "user", content: enrichedInput }],
  }, { timeout: 20 * 60 * 1000 });

  const synthDurationMs = Date.now() - synthStart;
  const synthTokens = response.usage.input_tokens + response.usage.output_tokens;
  const synthCost = await calculateCallCostCents(synthModel, {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });
  totalCostCents += synthCost;

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  let companyModel: CompanyModel;
  try {
    const rawModel = JSON.parse(extractJson(text));
    companyModel = normalizeCompanyModel(rawModel);
  } catch (parseErr) {
    const reason = `Synthesis JSON parse failed: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`;
    console.error(`[pipeline] ${reason}`);
    await prisma.onboardingAgentRun.create({
      data: {
        analysisId,
        agentName: "synthesis",
        round: 0,
        status: "failed",
        iterationCount: 1,
        maxIterations: 1,
        report: text as any,
        tokensUsed: synthTokens,
        startedAt: new Date(synthStart),
        completedAt: new Date(),
      },
    });
    await prisma.onboardingAnalysis.update({
      where: { id: analysisId },
      data: { status: "failed", failureReason: reason, completedAt: new Date() },
    });
    return;
  }

  // ═══ PHASE 3: Entity Creation + Finalization ═══════════════════════════════

  await createEntityTypesFromModel(operatorId, companyModel);
  await createEntitiesFromModel(operatorId, companyModel);
  await createExternalEntitiesFromModel(operatorId, companyModel);
  await createSituationTypesFromModel(operatorId, companyModel);
  await createGoalsFromModel(operatorId, companyModel);

  // Record synthesis run for audit
  await prisma.onboardingAgentRun.create({
    data: {
      analysisId,
      agentName: "synthesis",
      round: 0,
      status: "complete",
      iterationCount: 1,
      maxIterations: 1,
      report: text as any,
      tokensUsed: synthTokens,
      costCents: synthCost,
      startedAt: new Date(synthStart),
      completedAt: new Date(),
    },
  });

  // Mark analysis complete
  await prisma.onboardingAnalysis.update({
    where: { id: analysisId },
    data: {
      status: "confirming",
      currentPhase: "synthesis",
      synthesisOutput: companyModel as any,
      uncertaintyLog: companyModel.uncertaintyLog as any,
      completedAt: new Date(),
    },
  });

  // Send email notification
  await sendAnalysisCompleteEmail(operatorId);

  // Enqueue chunk classification
  try {
    await prisma.workerJob.create({
      data: {
        jobType: "classify_chunks",
        operatorId,
        payload: { operatorId } as any,
      },
    });
    console.log(`[pipeline] Enqueued classify_chunks for operator ${operatorId}`);
  } catch (err) {
    console.error("[pipeline] Failed to enqueue classify_chunks:", err);
  }

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

  console.log(`[pipeline] Complete — 1 LLM call, ${synthTokens} tokens, $${(totalCostCents / 100).toFixed(2)}, ${synthDurationMs}ms`);
}

// ── Utilities ────────────────────────────────────────────────────────────────

function extractJson(text: string): string {
  // 1. Try markdown fence extraction
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // 2. Try finding the outermost JSON object/array
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  const start = firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)
    ? firstBrace
    : firstBracket;

  if (start >= 0) {
    const closer = text[start] === "{" ? "}" : "]";
    const lastClose = text.lastIndexOf(closer);
    if (lastClose > start) {
      return text.slice(start, lastClose + 1);
    }
  }

  // 3. Fallback: return as-is
  return text.trim();
}

async function updatePhase(prisma: PrismaClient, analysisId: string, phase: string): Promise<void> {
  await prisma.onboardingAnalysis.update({
    where: { id: analysisId },
    data: { currentPhase: phase },
  });
}
