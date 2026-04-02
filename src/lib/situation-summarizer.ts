import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

/**
 * Generate a plain-language summary for a situation cycle and,
 * if the situation has 2+ cycles, a cumulative resume.
 *
 * Called at the end of reasonAboutSituation after the cycle record is created.
 * Fire-and-forget safe — failures are logged but don't block reasoning.
 */
export async function generateSituationSummaries(situationId: string): Promise<void> {
  try {
    const situation = await prisma.situation.findUnique({
      where: { id: situationId },
      select: {
        id: true,
        triggerSummary: true,
        triggerEvidence: true,
        reasoning: true,
        situationType: { select: { name: true } },
        cycles: {
          orderBy: { cycleNumber: "asc" },
          select: {
            id: true,
            cycleNumber: true,
            triggerType: true,
            triggerSummary: true,
            cycleSummary: true,
            reasoning: true,
            status: true,
            createdAt: true,
            executionPlan: {
              select: {
                steps: {
                  orderBy: { sequenceOrder: "asc" },
                  select: { title: true, executionMode: true, status: true },
                },
              },
            },
          },
        },
      },
    });

    if (!situation) return;

    // Find the most recent cycle (the one just created by reasoning)
    const latestCycle = situation.cycles[situation.cycles.length - 1];
    if (!latestCycle) return;

    // ── Generate cycle summary for the latest cycle ──
    const cycleContext = buildCycleContext(latestCycle, situation.situationType.name);

    const cycleSummaryResponse = await callLLM({
      instructions: `You summarize business situation updates for executives. Write 1-2 clear, plain-language sentences explaining what happened in this cycle. No jargon, no AI-speak. Write as if briefing a busy CEO who needs to understand this in 5 seconds. Use the same language as the source content (if the trigger/evidence is in Danish, write in Danish; if English, write in English).`,
      messages: [{ role: "user", content: cycleContext }],
      temperature: 0.2,
      maxTokens: 200,
      aiFunction: "reasoning",
      model: HAIKU_MODEL,
    });

    const cycleSummaryText = cycleSummaryResponse.text.trim();

    await prisma.situationCycle.update({
      where: { id: latestCycle.id },
      data: { cycleSummary: cycleSummaryText },
    });

    // ── Generate resume summary if 2+ cycles ──
    if (situation.cycles.length >= 2) {
      // Build context from ALL cycles (using existing summaries for older ones, fresh one for latest)
      const allSummaries = situation.cycles.map((c) => {
        const summary = c.id === latestCycle.id ? cycleSummaryText : (c.cycleSummary ?? c.triggerSummary);
        return `Cycle ${c.cycleNumber} (${c.triggerType}): ${summary}`;
      });

      const currentSteps = latestCycle.executionPlan?.steps ?? [];
      const stepsSummary = currentSteps.length > 0
        ? `Current plan: ${currentSteps.map(s => `${s.title} (${s.status})`).join(" → ")}`
        : "No current action plan.";

      const resumePrompt = `Situation type: ${situation.situationType.name}

Timeline:
${allSummaries.join("\n")}

${stepsSummary}

Write a 2-3 sentence briefing that tells someone walking into this situation cold: what is it about, what has happened so far, and where does it stand right now. Plain language, same language as the source content.`;

      const resumeResponse = await callLLM({
        instructions: `You write situation briefings for business leaders. Be concise, factual, and clear. No hedging. No AI-speak. Write in the same language as the input content.`,
        messages: [{ role: "user", content: resumePrompt }],
        temperature: 0.2,
        maxTokens: 300,
        aiFunction: "reasoning",
        model: HAIKU_MODEL,
      });

      await prisma.situation.update({
        where: { id: situationId },
        data: { resumeSummary: resumeResponse.text.trim() },
      });
    }
  } catch (err) {
    // Non-fatal — summaries are polish, not critical path
    console.error(`[situation-summarizer] Failed for situation ${situationId}:`, err);
  }
}

function buildCycleContext(
  cycle: {
    cycleNumber: number;
    triggerType: string;
    triggerSummary: string | null;
    reasoning: unknown;
    executionPlan: { steps: Array<{ title: string; executionMode: string; status: string }> } | null;
  },
  situationTypeName: string,
): string {
  let context = `Situation type: ${situationTypeName}\n`;
  context += `Cycle ${cycle.cycleNumber} — Trigger: ${cycle.triggerType}\n`;

  if (cycle.triggerSummary) {
    context += `Trigger: ${cycle.triggerSummary}\n`;
  }

  if (cycle.reasoning) {
    try {
      const r = typeof cycle.reasoning === "string" ? JSON.parse(cycle.reasoning) : cycle.reasoning;
      if (r.analysis) context += `Analysis: ${String(r.analysis).slice(0, 1000)}\n`;
      if (r.situationTitle) context += `Title: ${r.situationTitle}\n`;
    } catch { /* ignore */ }
  }

  if (cycle.executionPlan?.steps && cycle.executionPlan.steps.length > 0) {
    context += `Plan: ${cycle.executionPlan.steps.map(s => s.title).join(" → ")}\n`;
  }

  return context;
}
