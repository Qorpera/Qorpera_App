/**
 * Adversarial Challenge Engine
 *
 * An independent model reviews all investigation-produced wiki pages for logical
 * soundness, evidence sufficiency, alternative explanations, cross-page consistency,
 * and confidence calibration. Critical challenges reduce page confidence or quarantine
 * pages. Uses a DIFFERENT model instance (Opus) than the investigators.
 */

import { z } from "zod";

import { prisma } from "@/lib/db";
import { getModel } from "@/lib/ai-provider";
import type { ModelRoute } from "@/lib/ai-provider";
import { runAgenticLoop } from "@/lib/agentic-loop";

// ─── Types ──────────────────────────────────────────────

export interface PageChallenge {
  type:
    | "logical_gap"
    | "insufficient_evidence"
    | "alternative_explanation"
    | "overconfident"
    | "stale_basis"
    | "cross_page_contradiction";
  claim: string;
  challenge: string;
  severity: "minor" | "moderate" | "critical";
  suggestedAction:
    | "reduce_confidence"
    | "add_caveat"
    | "reinvestigate"
    | "quarantine";
}

export interface PageReview {
  pageSlug: string;
  pageTitle: string;
  overallAssessment: "sound" | "weak_points" | "significant_issues";
  challenges: PageChallenge[];
}

export interface AdversarialReport {
  pageReviews: PageReview[];
  missingInvestigations: Array<{
    topic: string;
    rationale: string;
    dataAvailable: boolean;
  }>;
  crossPageContradictions: Array<{
    page1Slug: string;
    page2Slug: string;
    contradiction: string;
    suggestedResolution: string;
  }>;
  overallConfidence: number; // 0-1 — adversary's assessment of wiki quality
  costCents: number;
  durationMs: number;
}

// ─── Zod Output Schema ─────────────────────────────────

const AdversarialOutputSchema = z.object({
  pageReviews: z.array(
    z.object({
      pageSlug: z.string(),
      pageTitle: z.string(),
      overallAssessment: z.enum(["sound", "weak_points", "significant_issues"]),
      challenges: z.array(
        z.object({
          type: z.enum([
            "logical_gap",
            "insufficient_evidence",
            "alternative_explanation",
            "overconfident",
            "stale_basis",
            "cross_page_contradiction",
          ]),
          claim: z.string(),
          challenge: z.string(),
          severity: z.enum(["minor", "moderate", "critical"]),
          suggestedAction: z.enum([
            "reduce_confidence",
            "add_caveat",
            "reinvestigate",
            "quarantine",
          ]),
        }),
      ),
    }),
  ),
  missingInvestigations: z
    .array(
      z.object({
        topic: z.string(),
        rationale: z.string(),
        dataAvailable: z.boolean(),
      }),
    )
    .optional()
    .default([]),
  crossPageContradictions: z
    .array(
      z.object({
        page1Slug: z.string(),
        page2Slug: z.string(),
        contradiction: z.string(),
        suggestedResolution: z.string(),
      }),
    )
    .optional()
    .default([]),
  overallConfidence: z.number().optional().default(0.5),
});

// ─── Adversarial System Prompt ──────────────────────────

const ADVERSARIAL_PROMPT = `You are an adversarial reviewer of an organizational knowledge base. Your job is to find weaknesses — not to validate. You are reviewing wiki pages produced by AI investigators, NOT written by humans.

You have access to the evidence registry (structured extractions from raw data) to check claims against source material.

For EACH wiki page provided, evaluate:

1. **LOGICAL SOUNDNESS:** Do conclusions follow from cited evidence? Are there logical leaps or unsupported inferences?
2. **EVIDENCE SUFFICIENCY:** Is each major claim supported by 2+ independent sources? Flag single-source claims as weak.
3. **ALTERNATIVE EXPLANATIONS:** Could the evidence support a different conclusion? What wasn't considered?
4. **CONFIDENCE CALIBRATION:** Are confidence scores appropriate? Flag overconfident claims (high confidence + thin evidence).
5. **TEMPORAL VALIDITY:** Are conclusions based on recent data? Would they change if the data is 6+ months old?
6. **CROSS-PAGE CONSISTENCY:** Do any pages contradict each other?

Also identify:
- Topics that SHOULD have been investigated but weren't (missing investigations)
- Cross-page contradictions where two pages make incompatible claims

Tools available:
- search_evidence — verify claims against raw evidence
- get_evidence_for_entity — check all evidence about a specific entity
- get_contradictions — find known contradictions
- read_full_content — read original source documents

Respond with JSON:
{
  "pageReviews": [
    {
      "pageSlug": "slug",
      "pageTitle": "title",
      "overallAssessment": "sound|weak_points|significant_issues",
      "challenges": [
        {
          "type": "logical_gap|insufficient_evidence|alternative_explanation|overconfident|stale_basis|cross_page_contradiction",
          "claim": "the specific claim being challenged",
          "challenge": "why it's problematic",
          "severity": "minor|moderate|critical",
          "suggestedAction": "reduce_confidence|add_caveat|reinvestigate|quarantine"
        }
      ]
    }
  ],
  "missingInvestigations": [
    { "topic": "string", "rationale": "why this matters", "dataAvailable": true|false }
  ],
  "crossPageContradictions": [
    { "page1Slug": "slug", "page2Slug": "slug", "contradiction": "string", "suggestedResolution": "string" }
  ],
  "overallConfidence": 0.0-1.0
}`;

// ─── Challenge Executor ─────────────────────────────────

const MODEL_ROUTE: ModelRoute = "adversarialChallenge";
const BATCH_SIZE = 20;

export async function runAdversarialChallenge(
  operatorId: string,
  options?: {
    onProgress?: (msg: string) => Promise<void>;
    pageFilter?: string[]; // only challenge these slugs (for re-runs)
  },
): Promise<AdversarialReport> {
  const progress = options?.onProgress ?? (async () => {});
  const startTime = Date.now();

  // 1. Load all investigation-produced wiki pages
  const pageFilter = options?.pageFilter;
  const pages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      synthesisPath: { in: ["investigation", "background", "reasoning"] },
      status: { not: "quarantined" },
      pageType: { notIn: ["index", "log", "contradiction_log"] },
      ...(pageFilter ? { slug: { in: pageFilter } } : {}),
    },
    select: {
      slug: true,
      title: true,
      pageType: true,
      content: true,
      confidence: true,
      trustLevel: true,
      sourceCount: true,
    },
    orderBy: { confidence: "desc" },
  });

  if (pages.length === 0) {
    await progress("No pages to challenge");
    return {
      pageReviews: [],
      missingInvestigations: [],
      crossPageContradictions: [],
      overallConfidence: 1.0,
      costCents: 0,
      durationMs: 0,
    };
  }

  await progress(`Challenging ${pages.length} wiki pages...`);

  // 2. Batch pages — group into batches of ~20 to stay within context limits
  const batches: (typeof pages)[] = [];
  for (let i = 0; i < pages.length; i += BATCH_SIZE) {
    batches.push(pages.slice(i, i + BATCH_SIZE));
  }

  // 3. Build evidence-only tools for the adversary (no write tools)
  const { REASONING_TOOLS, executeReasoningTool } = await import(
    "@/lib/reasoning-tools"
  );
  const evidenceToolNames = [
    "search_evidence",
    "get_evidence_for_entity",
    "get_contradictions",
    "read_full_content",
    "read_wiki_page",
  ];
  const evidenceTools = REASONING_TOOLS.filter((t) =>
    evidenceToolNames.includes(t.name),
  );

  const dispatchTool = async (
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> => {
    return executeReasoningTool(operatorId, toolName, args);
  };

  // 4. Run adversary on each batch
  const allReviews: PageReview[] = [];
  const allMissing: AdversarialReport["missingInvestigations"] = [];
  const allContradictions: AdversarialReport["crossPageContradictions"] = [];
  let totalCost = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    await progress(
      `Adversarial review batch ${i + 1}/${batches.length} (${batch.length} pages)...`,
    );

    const pagesFormatted = batch
      .map(
        (p) =>
          `### ${p.title} (${p.pageType}) — slug: ${p.slug}\nConfidence: ${p.confidence}, Trust: ${p.trustLevel}, Sources: ${p.sourceCount}\n\n${p.content}`,
      )
      .join("\n\n════════════════════════════════════════\n\n");

    const result = await runAgenticLoop({
      operatorId,
      contextId: `adversarial-batch-${i}`,
      contextType: "adversarial",
      cycleNumber: 0,
      systemPrompt: ADVERSARIAL_PROMPT,
      seedContext: `Review the following ${batch.length} wiki pages:\n\n${pagesFormatted}`,
      tools: evidenceTools,
      dispatchTool,
      outputSchema: AdversarialOutputSchema,
      softBudget: 30,
      hardBudget: 50,
      modelRoute: MODEL_ROUTE,
    });

    totalCost += result.apiCostCents;
    const output = result.output;
    allReviews.push(...(output.pageReviews ?? []));
    allMissing.push(...(output.missingInvestigations ?? []));
    allContradictions.push(...(output.crossPageContradictions ?? []));
  }

  // 5. Apply challenge actions to wiki pages
  await progress("Applying adversarial findings to wiki pages...");

  for (const review of allReviews) {
    const criticalChallenges = review.challenges.filter(
      (c) => c.severity === "critical",
    );
    const moderateChallenges = review.challenges.filter(
      (c) => c.severity === "moderate",
    );

    if (criticalChallenges.length > 0) {
      // Any critical challenge → reduce confidence significantly
      const page = await prisma.knowledgePage.findFirst({
        where: { operatorId, slug: review.pageSlug },
        select: { id: true, confidence: true },
      });
      if (page) {
        const newConfidence = Math.max(0.2, page.confidence - 0.3);
        await prisma.knowledgePage.update({
          where: { id: page.id },
          data: {
            confidence: newConfidence,
            trustLevel: "challenged",
            staleReason: `Adversarial challenge: ${criticalChallenges.length} critical issue(s). ${criticalChallenges[0].challenge}`,
          },
        });

        // If suggested action is quarantine, quarantine it
        if (criticalChallenges.some((c) => c.suggestedAction === "quarantine")) {
          await prisma.knowledgePage.update({
            where: { id: page.id },
            data: {
              status: "quarantined",
              quarantineReason: `Adversarial challenge: ${criticalChallenges[0].challenge}`,
            },
          });
        }
      }
    } else if (moderateChallenges.length >= 2) {
      // 2+ moderate challenges → reduce confidence slightly, mark challenged
      const page = await prisma.knowledgePage.findFirst({
        where: { operatorId, slug: review.pageSlug },
        select: { id: true, confidence: true },
      });
      if (page) {
        await prisma.knowledgePage.update({
          where: { id: page.id },
          data: {
            confidence: Math.max(0.3, page.confidence - 0.15),
            trustLevel: "challenged",
          },
        });
      }
    }
    // Pages with only minor challenges or "sound" assessment → no changes
  }

  // 6. Flag cross-page contradictions in the contradiction log
  const { processWikiUpdates } = await import("@/lib/wiki-engine");
  for (const contradiction of allContradictions) {
    await processWikiUpdates({
      operatorId,
      updates: [
        {
          slug: "contradiction-log",
          pageType: "contradiction_log",
          title: "Contradiction Log",
          updateType: "flag_contradiction",
          content: `${contradiction.page1Slug} vs ${contradiction.page2Slug}: ${contradiction.contradiction}\nSuggested resolution: ${contradiction.suggestedResolution}`,
          sourceCitations: [],
          reasoning: `Adversarial review found contradiction between pages "${contradiction.page1Slug}" and "${contradiction.page2Slug}"`,
        },
      ],
      synthesisPath: "adversarial",
      synthesizedByModel: getModel(MODEL_ROUTE),
    });
  }

  // 7. Build report
  const report: AdversarialReport = {
    pageReviews: allReviews,
    missingInvestigations: allMissing,
    crossPageContradictions: allContradictions,
    overallConfidence:
      allReviews.length > 0
        ? allReviews.filter((r) => r.overallAssessment === "sound").length /
          allReviews.length
        : 1.0,
    costCents: totalCost,
    durationMs: Date.now() - startTime,
  };

  const soundCount = allReviews.filter(
    (r) => r.overallAssessment === "sound",
  ).length;
  const weakCount = allReviews.filter(
    (r) => r.overallAssessment === "weak_points",
  ).length;
  const issueCount = allReviews.filter(
    (r) => r.overallAssessment === "significant_issues",
  ).length;
  await progress(
    `Adversarial review complete: ${soundCount} sound, ${weakCount} weak, ${issueCount} significant issues. ${allContradictions.length} cross-page contradictions. $${(totalCost / 100).toFixed(2)}`,
  );

  return report;
}
