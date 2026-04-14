import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import { parseSituationPage } from "@/lib/situation-page-parser";
import { updatePageWithLock } from "@/lib/wiki-engine";

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
    // Load wiki page for situation content
    const page = await prisma.knowledgePage.findFirst({
      where: {
        pageType: "situation_instance",
        scope: "operator",
        properties: { path: ["situation_id"], equals: situationId },
      },
      select: { content: true, title: true, properties: true, operatorId: true, slug: true },
    });
    if (!page || !page.operatorId) return;

    const operatorId = page.operatorId;
    const props = (page.properties ?? {}) as Record<string, unknown>;
    const situationTypeSlug = props.situation_type as string | undefined;

    // Load situation type name + cycles in parallel (independent queries)
    const [situationTypeName, cycles] = await Promise.all([
      situationTypeSlug
        ? prisma.situationType.findFirst({
            where: { operatorId, slug: situationTypeSlug },
            select: { name: true },
          }).then((st) => st?.name ?? "Unknown")
        : Promise.resolve("Unknown"),
      prisma.situationCycle.findMany({
        where: { situationId },
        orderBy: { cycleNumber: "asc" },
        select: {
          id: true, cycleNumber: true, triggerType: true,
          triggerSummary: true, cycleSummary: true, status: true, createdAt: true,
        },
      }),
    ]);

    const latestCycle = cycles[cycles.length - 1];
    if (!latestCycle) return;

    // ── Generate cycle summary for the latest cycle ──
    // Build cycle context from wiki page content instead of executionPlan join
    const parsed = parseSituationPage(page.content, props);

    const cycleContext = `Situation type: ${situationTypeName}
Cycle ${latestCycle.cycleNumber} — Trigger: ${latestCycle.triggerType}
${latestCycle.triggerSummary ? `Trigger: ${latestCycle.triggerSummary}` : ""}

Investigation:
${parsed.sections.investigation?.slice(0, 500) ?? "No investigation recorded"}

Action Plan:
${parsed.sections.actionPlan?.slice(0, 500) ?? "No action plan"}`;

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
    if (cycles.length >= 2) {
      // Build context from ALL cycles (using existing summaries for older ones, fresh one for latest)
      const allSummaries = cycles.map((c) => {
        const summary = c.id === latestCycle.id ? cycleSummaryText : (c.cycleSummary ?? c.triggerSummary);
        return `Cycle ${c.cycleNumber} (${c.triggerType}): ${summary}`;
      });

      const stepsSummary = parsed.sections.actionPlan
        ? `Current plan:\n${parsed.sections.actionPlan.slice(0, 300)}`
        : "No current action plan.";

      const resumePrompt = `Situation type: ${situationTypeName}

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

      const resumeText = resumeResponse.text.trim();

      // Write resume summary to wiki page properties
      await updatePageWithLock(operatorId, page.slug, (current) => {
        const mergedProps = { ...(current.properties ?? {}), resume_summary: resumeText };
        return { properties: mergedProps };
      });
    }
  } catch (err) {
    // Non-fatal — summaries are polish, not critical path
    console.error(`[situation-summarizer] Failed for situation ${situationId}:`, err);
  }
}
