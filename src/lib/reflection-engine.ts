/**
 * Outcome-driven reflection engine.
 *
 * After situation resolution (approved/rejected/dismissed), reads the
 * situation, reasoning output, wiki pages used, and outcome to produce
 * operational_learning wiki pages that capture what worked, what didn't,
 * and why — so future reasoning benefits from past outcomes.
 */

import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSON } from "@/lib/json-helpers";
import { embedChunks } from "@/lib/rag/embedder";
import { createVersionSnapshot } from "@/lib/wiki-engine";

// ── Types ──────────────────────────────────────────────

interface ReflectionResult {
  learning: string;
  category: string;
  confidence: number;
  shouldUpdatePage: boolean;
  updatedContent: string | null;
}

// ── Main ───────────────────────────────────────────────

export async function reflectOnOutcome(params: {
  situationId: string;
  outcome: "approved" | "rejected" | "dismissed";
  feedback?: string | null;
}): Promise<void> {
  const { situationId, outcome, feedback } = params;

  // 1. Load situation context
  const situation = await prisma.situation.findUnique({
    where: { id: situationId },
    include: {
      situationType: { select: { id: true, name: true, slug: true, description: true } },
    },
  });
  if (!situation) return;

  const operatorId = situation.operatorId;

  // Parse reasoning output
  let reasoning: Record<string, unknown> | null = null;
  if (situation.reasoning) {
    try { reasoning = JSON.parse(situation.reasoning); } catch {}
  }

  // Load execution plan steps
  let planSteps: Array<{ title: string; executionMode: string; status: string }> = [];
  if (situation.executionPlanId) {
    const plan = await prisma.executionPlan.findUnique({
      where: { id: situation.executionPlanId },
      include: {
        steps: {
          orderBy: { sequenceOrder: "asc" },
          select: { title: true, executionMode: true, status: true },
        },
      },
    });
    planSteps = plan?.steps ?? [];
  }

  // 2. Load wiki pages that were used during reasoning
  // Pages WRITTEN during reasoning
  const writtenPages = await prisma.knowledgePage.findMany({
    where: { situationId, operatorId },
    select: { slug: true, title: true, pageType: true, content: true },
    take: 10,
  });

  // Pages READ during reasoning (from tool call trace)
  const readToolCalls = await prisma.toolCallTrace.findMany({
    where: {
      situationId,
      toolName: { in: ["read_wiki_page", "search_wiki"] },
    },
    select: { resultSummary: true },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const readPageTitles = readToolCalls
    .map((tc) => {
      // resultSummary contains first 500 chars — extract title from "Wiki page: Title [type]" format
      const match = tc.resultSummary?.match(/^Wiki page: (.+?) \[/);
      return match?.[1] ?? null;
    })
    .filter((t): t is string => t !== null);

  const usedPagesContext = [
    ...writtenPages.map((p) => `[written] ${p.title} (${p.pageType}): ${p.content.slice(0, 200)}`),
    ...readPageTitles.map((title) => `[read] ${title}`),
  ];

  // 3. Load existing operational learning page for this situation type
  const learningSlug = `operational-learning-${situation.situationType.slug}`;
  const existingPage = await prisma.knowledgePage.findFirst({
    where: {
      operatorId,
      scope: "operator",
      pageType: "operational_learning",
      slug: learningSlug,
    },
    select: { id: true, content: true, version: true },
  });

  // 4. Build LLM prompt
  const analysisSnippet = reasoning?.analysis
    ? String(reasoning.analysis).slice(0, 1000)
    : "No analysis available";
  const evidenceSnippet = reasoning?.evidenceSummary
    ? String(reasoning.evidenceSummary).slice(0, 500)
    : "";
  const triggerSnippet = situation.triggerSummary ?? "No trigger summary";

  const editDiffs = situation.editInstruction;

  const systemPrompt = buildReflectionPrompt(outcome, editDiffs, feedback);

  const userContent = [
    `SITUATION TYPE: ${situation.situationType.name}`,
    situation.situationType.description ? `Description: ${situation.situationType.description}` : null,
    `\nTRIGGER: ${triggerSnippet}`,
    `\nAI ANALYSIS:\n${analysisSnippet}`,
    evidenceSnippet ? `\nEVIDENCE:\n${evidenceSnippet}` : null,
    planSteps.length > 0
      ? `\nACTION PLAN:\n${planSteps.map((s) => `- ${s.title} (${s.executionMode}, ${s.status})`).join("\n")}`
      : "\nNo action plan proposed.",
    editDiffs ? `\nHUMAN EDITS:\n${editDiffs}` : null,
    feedback ? `\nHUMAN FEEDBACK:\n${feedback}` : null,
    usedPagesContext.length > 0
      ? `\nWIKI PAGES USED DURING REASONING:\n${usedPagesContext.map((s) => `- ${s}`).join("\n")}`
      : null,
    existingPage
      ? `\nEXISTING OPERATIONAL LEARNING PAGE:\n${existingPage.content.slice(0, 2000)}`
      : "\nNo existing operational learning page for this situation type.",
  ].filter(Boolean).join("\n");

  // 5. Call LLM
  const response = await callLLM({
    operatorId,
    instructions: systemPrompt,
    messages: [{ role: "user", content: userContent }],
    model: getModel("reflection"),
    aiFunction: "reasoning",
    temperature: 0.2,
    maxTokens: 4096,
  });

  const parsed = extractJSON(response.text);
  if (!parsed) {
    console.warn(`[reflection] Failed to parse LLM response for ${situationId}`);
    return;
  }

  const result: ReflectionResult = {
    learning: String(parsed.learning ?? ""),
    category: String(parsed.category ?? "process_improvement"),
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    shouldUpdatePage: parsed.shouldUpdatePage === true,
    updatedContent: typeof parsed.updatedContent === "string" ? parsed.updatedContent : null,
  };

  if (!result.shouldUpdatePage || !result.updatedContent) {
    console.log(`[reflection] No page update needed for ${situationId} (${outcome}): ${result.learning.slice(0, 100)}`);
    return;
  }

  // 6. Update or create the operational learning page
  const contentTokens = Math.ceil(result.updatedContent.length / 4);

  if (existingPage) {
    await createVersionSnapshot(existingPage.id, "reflection", getModel("reflection"));

    await prisma.knowledgePage.update({
      where: { id: existingPage.id },
      data: {
        content: result.updatedContent,
        contentTokens,
        version: { increment: 1 },
        synthesisPath: "reflection",
        synthesizedByModel: getModel("reflection"),
        lastSynthesizedAt: new Date(),
        status: "verified",
        verifiedAt: new Date(),
        verifiedByModel: "reflection",
      },
    });

    // Re-embed (fire-and-forget)
    embedChunks([result.updatedContent])
      .then(([embedding]) => {
        if (embedding) {
          const embeddingStr = `[${embedding.join(",")}]`;
          return prisma.$executeRawUnsafe(
            `UPDATE "KnowledgePage" SET "embedding" = $1::vector WHERE "id" = $2`,
            embeddingStr,
            existingPage.id,
          );
        }
      })
      .catch(() => {});

    console.log(`[reflection] Updated operational learning page "${learningSlug}" (v${existingPage.version + 1}) for ${outcome}`);
  } else {
    const page = await prisma.knowledgePage.create({
      data: {
        operatorId,
        scope: "operator",
        pageType: "operational_learning",
        title: `Operational Learning — ${situation.situationType.name}`,
        slug: learningSlug,
        content: result.updatedContent,
        contentTokens,
        crossReferences: [],
        sources: [],
        sourceCount: 0,
        sourceTypes: ["reflection"],
        status: "verified",
        confidence: result.confidence,
        version: 1,
        synthesisPath: "reflection",
        synthesizedByModel: getModel("reflection"),
        lastSynthesizedAt: new Date(),
        verifiedAt: new Date(),
        verifiedByModel: "reflection",
      },
      select: { id: true },
    });

    // Embed (fire-and-forget)
    embedChunks([result.updatedContent])
      .then(([embedding]) => {
        if (embedding) {
          const embeddingStr = `[${embedding.join(",")}]`;
          return prisma.$executeRawUnsafe(
            `UPDATE "KnowledgePage" SET "embedding" = $1::vector WHERE "id" = $2`,
            embeddingStr,
            page.id,
          );
        }
      })
      .catch(() => {});

    console.log(`[reflection] Created operational learning page "${learningSlug}" for ${outcome}`);
  }
}

// ── Staleness Check ────────────────────────────────────

/**
 * Flag wiki pages with high rejection rates as stale.
 * Call before incremental synthesis so stale pages get resynthesized.
 */
export async function checkOutcomeStaleness(operatorId: string): Promise<number> {
  const pages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      status: "verified",
      reasoningUseCount: { gte: 5 },
    },
    select: { id: true, outcomeApproved: true, outcomeRejected: true, slug: true },
  });

  let flagged = 0;
  for (const page of pages) {
    const total = page.outcomeApproved + page.outcomeRejected;
    if (total < 5) continue;
    const rejectionRate = page.outcomeRejected / total;
    if (rejectionRate > 0.4) {
      await prisma.knowledgePage.update({
        where: { id: page.id },
        data: {
          status: "stale",
          staleReason: `High rejection rate: ${(rejectionRate * 100).toFixed(0)}% (${page.outcomeRejected}/${total}). Needs resynthesis.`,
        },
      });
      flagged++;
      console.log(`[reflection] Flagged "${page.slug}" as stale — ${(rejectionRate * 100).toFixed(0)}% rejection rate`);
    }
  }

  return flagged;
}

// ── System Prompt ──────────────────────────────────────

function buildReflectionPrompt(
  outcome: "approved" | "rejected" | "dismissed",
  editDiffs: string | null,
  feedback: string | null | undefined,
): string {
  const outcomeContext =
    outcome === "approved" && editDiffs
      ? "The human approved but made edits before approving. The edits indicate where the AI's judgment needed correction."
      : outcome === "rejected"
        ? "The human rejected the plan. Understand WHY — what did the AI get wrong?"
        : outcome === "dismissed"
          ? "The human dismissed the situation entirely. This may mean the detection was wrong, or the situation didn't warrant AI involvement."
          : "The human approved the plan as-is.";

  const feedbackLine = feedback ? `\nHuman feedback: "${feedback}"` : "";

  return `You are analyzing the outcome of a business situation to extract operational learnings.

A situation was detected, investigated by the AI reasoning engine, and an action plan was proposed. The human ${outcome} the plan.

${outcomeContext}${feedbackLine}

Your task: produce a concise operational learning that should be remembered for future situations of this type.

Respond with ONLY valid JSON:
{
  "learning": "Concise description of what was learned (1-2 sentences)",
  "category": "detection_accuracy" | "plan_quality" | "action_selection" | "communication_tone" | "context_gap" | "process_improvement",
  "confidence": 0.0-1.0,
  "shouldUpdatePage": true if the learning is meaningful and not already captured,
  "updatedContent": "Full updated page content if shouldUpdatePage is true — integrate the new learning with the existing page content. Use markdown with ## section headers for each category of learning. If no existing page, write the initial page."
}

Rules:
- If the outcome is "approved" with no edits and no feedback → shouldUpdatePage: false (nothing notable to learn)
- If the outcome is "approved" with edits → learn what needed correction
- If rejected/dismissed → learn what went wrong and how to avoid it
- If there's existing page content, INTEGRATE the new learning — don't replace the whole page
- Keep the page concise and actionable — operators and future AI reasoning will read this`;
}
