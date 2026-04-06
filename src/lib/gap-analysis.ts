/**
 * Gap Analysis — maps what the system knows vs doesn't know, then generates
 * precise surgical questions for the human. Not "tell us about your business"
 * but "We found two rates (525 and 495 DKK). Invoice history suggests 525 is
 * active. Is 495 obsolete?"
 *
 * Runs AFTER the adversarial challenge, consuming its report to avoid
 * re-discovering already-flagged issues.
 */

import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSON } from "@/lib/json-helpers";
import { getExtractionStats } from "@/lib/evidence-registry";
import type { AdversarialReport } from "@/lib/adversarial-challenge";

// ─── Types ──────────────────────────────────────────────

export interface KnowledgeGap {
  topic: string;
  importance: "critical" | "important" | "nice_to_have";
  currentKnowledge: string; // what we DO know
  missingKnowledge: string; // what we DON'T know
  dataAvailable: boolean; // could we find this in the data?
  suggestedQuestion: string; // precise question for the human
}

export interface GapAnalysisReport {
  gaps: KnowledgeGap[];
  questionsForHuman: Array<{
    question: string;
    context: string; // what we already know (so the human doesn't repeat)
    importance: string;
    relatedPageSlugs: string[];
  }>;
  coverageScore: number; // 0-1 — how complete is the wiki?
  costCents: number;
}

// ─── Prompt ─────────────────────────────────────────────

const GAP_ANALYSIS_PROMPT = `You are analyzing an organizational knowledge base for completeness. You have access to:
1. All wiki pages (provided below)
2. The evidence registry stats
3. An adversarial report highlighting weaknesses

Your job: identify what's MISSING, not what's wrong (the adversary handled that).

For each gap you find, generate a SURGICAL question for the human. Not generic questions — specific ones that reference what we already know:

GOOD: "We found two hourly rates (525 DKK in the March quote to Client X, 495 DKK in the January contract). Which is the current standard rate?"
BAD: "What are your standard rates?"

GOOD: "Thomas appears in 47 emails about field operations but has no formal title in our records. Is he the field operations lead?"
BAD: "What are people's roles?"

Categories of gaps to look for:
1. **Unconfirmed structural assumptions** — roles, reporting lines, department boundaries inferred but not verified
2. **Missing financial data** — pricing not confirmed, cost structures incomplete, revenue attribution unclear
3. **Process gaps** — we see outputs but not the process that produces them
4. **Relationship ambiguity** — client/vendor relationships implied but not confirmed
5. **Strategic unknowns** — company direction, goals, priorities not evidenced in data
6. **Temporal gaps** — we know the current state but not the trajectory

Respond with JSON:
{
  "gaps": [
    {
      "topic": "string",
      "importance": "critical|important|nice_to_have",
      "currentKnowledge": "what we know",
      "missingKnowledge": "what we need",
      "dataAvailable": false,
      "suggestedQuestion": "precise question"
    }
  ],
  "coverageScore": 0.0-1.0,
  "coverageReasoning": "explanation of score"
}`;

// ─── Executor ───────────────────────────────────────────

export async function runGapAnalysis(
  operatorId: string,
  adversarialReport?: AdversarialReport,
  options?: {
    onProgress?: (msg: string) => Promise<void>;
  },
): Promise<GapAnalysisReport> {
  const progress = options?.onProgress ?? (async () => {});
  await progress("Analyzing knowledge coverage...");

  // 1. Load all wiki pages (summaries, not full content)
  const pages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      status: { not: "quarantined" },
      pageType: { notIn: ["index", "log"] },
    },
    select: {
      slug: true,
      title: true,
      pageType: true,
      confidence: true,
      trustLevel: true,
      sourceCount: true,
      content: true,
    },
    orderBy: { pageType: "asc" },
  });

  if (pages.length === 0) {
    await progress("No wiki pages to analyze for gaps");
    return { gaps: [], questionsForHuman: [], coverageScore: 0, costCents: 0 };
  }

  // 2. Evidence stats for context
  const stats = await getExtractionStats(operatorId);

  // 3. Build gap analysis context
  const pagesSummary = pages
    .map(
      (p) =>
        `- **${p.title}** (${p.pageType}, ${p.trustLevel}, confidence: ${p.confidence}, sources: ${p.sourceCount})\n  ${p.content.slice(0, 300)}...`,
    )
    .join("\n");

  const adversarialContext = adversarialReport
    ? `\n\n## Adversarial Review Results\n\nMissing investigations identified by adversary:\n${(adversarialReport.missingInvestigations ?? []).map((m) => `- ${m.topic}: ${m.rationale}`).join("\n")}\n\nPages with significant issues:\n${(adversarialReport.pageReviews ?? [])
        .filter((r) => r.overallAssessment === "significant_issues")
        .map((r) => `- ${r.pageTitle}: ${r.challenges.length} challenges`)
        .join("\n")}`
    : "";

  const avgConfidence =
    pages.reduce((s, p) => s + p.confidence, 0) / pages.length;

  const analysisContext = `## Wiki Coverage Summary

Total pages: ${pages.length}
Page types: ${[...new Set(pages.map((p) => p.pageType))].join(", ")}
Average confidence: ${avgConfidence.toFixed(2)}
Evidence registry: ${stats.totalClaims} claims, ${stats.totalContradictions} contradictions

## All Pages

${pagesSummary}
${adversarialContext}`;

  // 4. Single Opus call for gap analysis
  const model = getModel("researchPlanner");
  const response = await callLLM({
    operatorId,
    instructions: GAP_ANALYSIS_PROMPT,
    messages: [{ role: "user", content: analysisContext }],
    model,
    maxTokens: 65_536,
    thinking: true,
    thinkingBudget: 8000,
  });

  const parsed = extractJSON(response.text);
  if (!parsed || !parsed.gaps) {
    throw new Error("Gap analysis produced invalid output");
  }

  // 5. Build questions with related page context — only ask humans about things NOT in the data
  const gaps = parsed.gaps as KnowledgeGap[];
  const importanceOrder: Record<string, number> = {
    critical: 0,
    important: 1,
    nice_to_have: 2,
  };

  const questionsForHuman = gaps
    .filter((g) => !g.dataAvailable)
    .sort(
      (a, b) =>
        (importanceOrder[a.importance] ?? 2) -
        (importanceOrder[b.importance] ?? 2),
    )
    .map((g) => ({
      question: g.suggestedQuestion,
      context: g.currentKnowledge,
      importance: g.importance,
      relatedPageSlugs: pages
        .filter((p) =>
          g.topic
            .toLowerCase()
            .split(" ")
            .some((w) => w.length >= 4 && p.title.toLowerCase().includes(w)),
        )
        .map((p) => p.slug)
        .slice(0, 3),
    }));

  await progress(
    `Gap analysis: ${gaps.length} gaps, ${questionsForHuman.length} questions for human, coverage: ${((parsed.coverageScore as number) * 100).toFixed(0)}%`,
  );

  return {
    gaps,
    questionsForHuman,
    coverageScore: (parsed.coverageScore as number) ?? 0.5,
    costCents: response.apiCostCents,
  };
}
