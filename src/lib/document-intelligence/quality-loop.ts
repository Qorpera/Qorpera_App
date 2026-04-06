/**
 * Autoresearch Quality Loop
 *
 * Karpathy's autoresearch pattern: editable asset (analysis prompts),
 * scalar metric (composite quality score), time-boxed cycle (per-operator).
 *
 * - Lightweight at 20+ resolved situations (BootstrapFewShot — best outputs as examples)
 * - Full optimization at 200+ (prompt mutations with A/B testing)
 * - Mutations start in "testing" status — human or graduated autonomy promotes to "active"
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getPageEffectiveness } from "@/lib/context-evaluation";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSON } from "@/lib/json-helpers";

// ── Composite Score ────────────────────────────────────────────────────────

/**
 * Composite quality score for document-intelligence wiki pages.
 *
 * Formula: citationRate × approvalRate × (0.5 + analyticalDepth × 0.5)
 *
 * - citationRate: how often reasoning cites these pages when they're in context
 * - approvalRate: how often outcomes are approved when these pages are cited
 * - analyticalDepth: ratio of extractions with analytical claims to total extractions
 *
 * The (0.5 + depth × 0.5) term ensures the score isn't zeroed by low depth
 * but rewards deeper analysis up to a 2x multiplier.
 */
export async function calculateCompositeScore(operatorId: string): Promise<{
  score: number;
  citationRate: number;
  approvalRate: number;
  analyticalDepth: number;
  sampledPages: number;
} | null> {
  const effectiveness = await getPageEffectiveness(operatorId);

  // Filter to document-intelligence pages only
  const diPages = await prisma.knowledgePage.findMany({
    where: { operatorId, synthesisPath: "document_intelligence" },
    select: { slug: true },
  });
  const diSlugs = new Set(diPages.map((p) => p.slug));

  const relevantStats = effectiveness.filter(
    (e) => diSlugs.has(e.slug) && e.timesInContext >= 2,
  );
  if (relevantStats.length < 5) return null; // Not enough data

  const avgCitationRate =
    relevantStats.reduce((s, e) => s + e.citationRate, 0) /
    relevantStats.length;

  const avgApprovalRate =
    relevantStats.reduce((s, e) => {
      const total = e.approvedWhenCited + e.rejectedWhenCited;
      return s + (total > 0 ? e.approvedWhenCited / total : 0.5);
    }, 0) / relevantStats.length;

  // Analytical depth: ratio of extractions with analytical claims
  const pagesWithAnalytical = await prisma.evidenceExtraction.count({
    where: {
      operatorId,
      analyticalClaims: { not: Prisma.DbNull },
      sourceChunk: { fileUpload: { intelligenceStatus: "complete" } },
    },
  });
  const totalExtractions = await prisma.evidenceExtraction.count({
    where: {
      operatorId,
      sourceChunk: { fileUpload: { intelligenceStatus: "complete" } },
    },
  });
  const analyticalDepth =
    totalExtractions > 0 ? pagesWithAnalytical / totalExtractions : 0;

  const composite =
    avgCitationRate * avgApprovalRate * (0.5 + analyticalDepth * 0.5);

  return {
    score: composite,
    citationRate: avgCitationRate,
    approvalRate: avgApprovalRate,
    analyticalDepth,
    sampledPages: relevantStats.length,
  };
}

// ── Few-Shot Selection ─────────────────────────────────────────────────────

/**
 * Select best analysis outputs as few-shot examples (BootstrapFewShot).
 *
 * Threshold: effectiveness score > 0.3 AND at least 3 citations.
 * Returns up to 3 top-performing page contents as prompt examples.
 */
export async function selectFewShotExamples(
  operatorId: string,
): Promise<string[]> {
  const effectiveness = await getPageEffectiveness(operatorId);

  const diPages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      synthesisPath: "document_intelligence",
      status: "verified",
    },
    select: {
      slug: true,
      title: true,
      content: true,
      pageType: true,
      confidence: true,
    },
  });
  const diSlugMap = new Map(diPages.map((p) => [p.slug, p]));

  const topPerformers = effectiveness
    .filter(
      (e) =>
        diSlugMap.has(e.slug) &&
        e.effectivenessScore > 0.3 &&
        e.timesCited >= 3,
    )
    .sort((a, b) => b.effectivenessScore - a.effectivenessScore)
    .slice(0, 3);

  return topPerformers.map((perf) => {
    const page = diSlugMap.get(perf.slug)!;
    const approvalPct =
      perf.timesCited > 0
        ? Math.round((perf.approvedWhenCited / perf.timesCited) * 100)
        : 0;
    return `### Example: "${page.title}" (${page.pageType}, effectiveness: ${perf.effectivenessScore.toFixed(2)})
This page was cited in ${perf.timesCited} reasoning sessions with ${approvalPct}% approval rate.

${page.content.slice(0, 2000)}${page.content.length > 2000 ? "\n[truncated]" : ""}`;
  });
}

// ── Optimization Cycle ─────────────────────────────────────────────────────

/**
 * Run one optimization cycle — propose a single prompt mutation.
 *
 * Single-mutation-per-cycle to keep changes reviewable.
 * Mutations start in "testing" status — not "active".
 */
export async function runOptimizationCycle(operatorId: string): Promise<{
  mutationProposed: boolean;
  promptType?: string;
  mutation?: string;
  newVersionId?: string;
}> {
  const score = await calculateCompositeScore(operatorId);
  if (!score) return { mutationProposed: false };

  // Load current active prompts
  const activePrompts = await prisma.analysisPromptVersion.findMany({
    where: { status: "active" },
    orderBy: { version: "desc" },
  });

  if (activePrompts.length === 0) {
    console.log(
      "[quality-loop] No versioned prompts found — skipping optimization (cold start)",
    );
    return { mutationProposed: false };
  }

  // Focus on comprehension prompts (highest leverage)
  const comprehensionPrompt = activePrompts.find(
    (p) => p.promptType === "comprehension",
  );
  if (!comprehensionPrompt) return { mutationProposed: false };

  // Get few-shot examples and low-performers
  const examples = await selectFewShotExamples(operatorId);
  const effectiveness = await getPageEffectiveness(operatorId);
  const lowPerformers = effectiveness
    .filter((e) => e.effectivenessScore < -0.2 && e.timesCited >= 3)
    .slice(0, 3);

  if (examples.length === 0 && lowPerformers.length === 0) {
    return { mutationProposed: false };
  }

  const model = getModel("researchPlanner");
  let response;
  try {
    response = await callLLM({
      operatorId,
      instructions: buildOptimizationPrompt(
        comprehensionPrompt.content,
        score,
        examples,
        lowPerformers,
      ),
      messages: [
        {
          role: "user",
          content:
            "Propose a single mutation to improve analysis quality.",
        },
      ],
      model,
      maxTokens: 16_000,
    });
  } catch (err) {
    console.error("[quality-loop] LLM call failed:", err);
    return { mutationProposed: false };
  }

  const parsed = extractJSON(response.text);
  if (!parsed?.newPromptContent || !parsed?.mutation) {
    return { mutationProposed: false };
  }

  const newVersion = await prisma.analysisPromptVersion.create({
    data: {
      promptType: "comprehension",
      version: comprehensionPrompt.version + 1,
      content: (parsed.newPromptContent as string) ?? "",
      parentVersionId: comprehensionPrompt.id,
      mutation: (parsed.mutation as string) ?? "",
      status: "testing",
    },
  });

  console.log(
    `[quality-loop] Proposed mutation for comprehension prompt: ${parsed.mutation}`,
  );

  return {
    mutationProposed: true,
    promptType: "comprehension",
    mutation: parsed.mutation as string,
    newVersionId: newVersion.id,
  };
}

function buildOptimizationPrompt(
  currentPrompt: string,
  score: {
    score: number;
    citationRate: number;
    approvalRate: number;
    analyticalDepth: number;
  },
  examples: string[],
  lowPerformers: Array<{
    slug: string;
    effectivenessScore: number;
    timesCited: number;
    rejectedWhenCited: number;
  }>,
): string {
  const examplesSection =
    examples.length > 0
      ? `## High-performing analysis examples (learn from these):\n${examples.join("\n\n")}`
      : "";

  const lowPerformersSection =
    lowPerformers.length > 0
      ? `## Low-performing pages (avoid producing pages like these):\n${lowPerformers.map((p) => `- ${p.slug}: effectiveness ${p.effectivenessScore.toFixed(2)}, cited ${p.timesCited} times, rejected ${p.rejectedWhenCited} times`).join("\n")}`
      : "";

  return `You are optimizing an analysis prompt based on outcome data.

Current prompt (comprehension type):
${currentPrompt.slice(0, 3000)}${currentPrompt.length > 3000 ? "[truncated]" : ""}

Current composite quality score: ${score.score.toFixed(3)}
- Citation rate: ${score.citationRate.toFixed(3)} (how often reasoning cites these pages)
- Approval rate: ${score.approvalRate.toFixed(3)} (how often outcomes are approved)
- Analytical depth: ${score.analyticalDepth.toFixed(3)} (ratio of analytical to raw claims)

${examplesSection}

${lowPerformersSection}

Propose ONE specific mutation to the prompt that would improve the composite score. The mutation should be:
- A single, specific change (not a rewrite)
- Targeted at the weakest metric
- Informed by what the high-performing examples did well
- Avoiding what the low-performing pages did poorly

Respond with JSON:
{
  "targetMetric": "citationRate|approvalRate|analyticalDepth",
  "mutation": "Description of the specific change",
  "newPromptContent": "The full updated prompt with the mutation applied",
  "reasoning": "Why this mutation should improve the target metric"
}`;
}
