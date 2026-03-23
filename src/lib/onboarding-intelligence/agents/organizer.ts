/**
 * Organizer — coordinator agent that cross-pollinates findings
 * between specialist agents and generates follow-up briefs.
 *
 * NOT a research agent — doesn't call tools. Reads all round reports,
 * identifies overlaps/contradictions, generates targeted follow-ups.
 */

import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import { triggerNextIteration } from "@/lib/internal-api";
import { addProgressMessage } from "../progress";
import { launchSynthesis } from "../synthesis";

// ── Organizer Prompt ─────────────────────────────────────────────────────────

export const ORGANIZER_PROMPT = `You are the Organizer coordinating a multi-agent organizational intelligence analysis. You have just received reports from specialist agents who independently researched the same company from different angles.

Your job is to:

1. **Identify Overlaps**: Two agents discovered the same thing independently → INCREASE confidence. Note what was confirmed.

2. **Identify Contradictions**: Two agents found conflicting information → FLAG for resolution. Be specific: what exactly conflicts, which agents disagree, what evidence each cites.

3. **Identify New Leads**: One agent's findings suggest another agent should investigate something specific they might have missed.

4. **Generate Follow-Up Briefs**: For each agent that has new investigation targets, write a specific, actionable follow-up brief. Don't send vague instructions — give the agent specific questions with specific data to look for.

5. **Track Unresolved Contradictions**: After Round 2, some contradictions may not be resolvable from data alone. These become uncertainty log entries for the CEO.

## Output Rules

- Follow-up briefs should be SHORT and SPECIFIC. "Investigate whether Thomas handles invoicing solo" — not "Look into the finance team more."
- Only generate follow-up briefs for agents whose findings would materially benefit from cross-agent intelligence. Don't create busywork.
- If all findings are consistent and complete, it's valid to produce zero follow-up briefs. That means synthesis can proceed immediately.
- Contradictions are only flagged when two agents cite different facts about the SAME thing (not when they focus on different aspects).`;

// ── Output Types ─────────────────────────────────────────────────────────────

export interface OrganizerOutput {
  overlaps: Array<{
    topic: string;
    agents: string[];
    finding: string;
    confidenceBoost: string;
  }>;
  contradictions: Array<{
    topic: string;
    agent1: string;
    agent1Finding: string;
    agent2: string;
    agent2Finding: string;
    resolvable: boolean;
    resolutionSuggestion: string;
  }>;
  followUpBriefs: Array<{
    targetAgent: string;
    brief: string;
    reason: string;
    priority: "high" | "medium";
  }>;
  unresolvedContradictions: Array<{
    topic: string;
    description: string;
    resolvable: boolean;
    ceoQuestion?: string;
  }>;
  synthesisNotes: string;
}

const ORGANIZER_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    overlaps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          agents: { type: "array", items: { type: "string" } },
          finding: { type: "string" },
          confidenceBoost: { type: "string" },
        },
        required: ["topic", "agents", "finding", "confidenceBoost"],
      },
    },
    contradictions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          agent1: { type: "string" },
          agent1Finding: { type: "string" },
          agent2: { type: "string" },
          agent2Finding: { type: "string" },
          resolvable: { type: "boolean" },
          resolutionSuggestion: { type: "string" },
        },
        required: ["topic", "agent1", "agent1Finding", "agent2", "agent2Finding", "resolvable", "resolutionSuggestion"],
      },
    },
    followUpBriefs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          targetAgent: { type: "string" },
          brief: { type: "string" },
          reason: { type: "string" },
          priority: { type: "string", enum: ["high", "medium"] },
        },
        required: ["targetAgent", "brief", "reason", "priority"],
      },
    },
    unresolvedContradictions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          description: { type: "string" },
          resolvable: { type: "boolean" },
          ceoQuestion: { type: "string" },
        },
        required: ["topic", "description", "resolvable"],
      },
    },
    synthesisNotes: { type: "string" },
  },
  required: ["overlaps", "contradictions", "followUpBriefs", "unresolvedContradictions", "synthesisNotes"],
};

// ── Main Runner ──────────────────────────────────────────────────────────────

export async function runOrganizer(analysisId: string, afterRound: number): Promise<void> {
  const run = await prisma.onboardingAgentRun.create({
    data: {
      analysisId,
      agentName: "organizer",
      round: afterRound,
      status: "running",
      maxIterations: 1,
      startedAt: new Date(),
    },
  });

  try {
    // Load completed reports from the round (exclude prior organizer runs)
    const agentRuns = await prisma.onboardingAgentRun.findMany({
      where: {
        analysisId,
        round: afterRound,
        status: "complete",
        agentName: { not: "organizer" },
      },
    });

    const reports = agentRuns.map((r) => ({
      agentName: r.agentName,
      report: r.report,
    }));

    await addProgressMessage(
      analysisId,
      `Cross-referencing findings from ${reports.length} specialist analyses...`,
      "organizer",
    );

    // Load analysis for operatorId
    const analysis = await prisma.onboardingAnalysis.findUnique({
      where: { id: analysisId },
      select: { operatorId: true },
    });

    // Single LLM call
    const organizerInput = buildOrganizerInput(reports, afterRound);
    const response = await callLLM({
      operatorId: analysis?.operatorId,
      model: "gpt-5.4",
      instructions: ORGANIZER_PROMPT,
      messages: [{ role: "user", content: organizerInput }],
      thinking: true,
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "organizer_output",
          strict: true,
          schema: ORGANIZER_OUTPUT_SCHEMA,
        },
      },
    });

    const tokensUsed = (response.usage?.inputTokens || 0) + (response.usage?.outputTokens || 0);

    let output: OrganizerOutput;
    try {
      output = JSON.parse(response.text);
    } catch {
      // If JSON parsing fails, proceed to synthesis
      output = {
        overlaps: [],
        contradictions: [],
        followUpBriefs: [],
        unresolvedContradictions: [],
        synthesisNotes: "Organizer output parsing failed. Proceeding with available findings.",
      };
    }

    // Save organizer report
    await prisma.onboardingAgentRun.update({
      where: { id: run.id },
      data: {
        status: "complete",
        iterationCount: 1,
        report: output as any,
        completedAt: new Date(),
        tokensUsed,
        costCents: response.apiCostCents || 0,
      },
    });

    // Update analysis token totals
    await prisma.onboardingAnalysis.update({
      where: { id: analysisId },
      data: {
        totalTokensUsed: { increment: tokensUsed },
        totalCostCents: { increment: response.apiCostCents || 0 },
      },
    });

    // Decision: need another round?
    if (afterRound === 1 && output.followUpBriefs.length > 0) {
      await addProgressMessage(
        analysisId,
        `${output.followUpBriefs.length} targeted follow-up investigations needed...`,
        "organizer",
      );
      await updateAnalysisPhase(analysisId, "round_2");
      await launchRound2Agents(analysisId, output.followUpBriefs);
    } else if (afterRound === 2 && output.unresolvedContradictions.length > 0) {
      const resolvableCount = output.unresolvedContradictions.filter((c) => c.resolvable).length;
      if (resolvableCount > 0) {
        await addProgressMessage(
          analysisId,
          `${resolvableCount} remaining contradictions — launching targeted resolution...`,
          "organizer",
        );
        await updateAnalysisPhase(analysisId, "round_3");
        await launchRound3Agents(analysisId, output);
      } else {
        await proceedToSynthesis(analysisId);
      }
    } else {
      await proceedToSynthesis(analysisId);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.onboardingAgentRun.update({
      where: { id: run.id },
      data: { status: "failed", report: { error: message } as any, completedAt: new Date() },
    });
    // Graceful degradation: proceed to synthesis with whatever we have
    await addProgressMessage(
      analysisId,
      "Cross-reference encountered an issue. Proceeding with available findings...",
      "organizer",
    );
    await proceedToSynthesis(analysisId);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function proceedToSynthesis(analysisId: string): Promise<void> {
  await addProgressMessage(analysisId, "All investigations complete. Synthesizing company model...", "organizer");
  await updateAnalysisPhase(analysisId, "synthesis");
  await launchSynthesis(analysisId);
}

async function updateAnalysisPhase(analysisId: string, phase: string): Promise<void> {
  await prisma.onboardingAnalysis.update({
    where: { id: analysisId },
    data: { currentPhase: phase },
  });
}

function buildOrganizerInput(
  reports: Array<{ agentName: string; report: unknown }>,
  round: number,
): string {
  let input = `## Round ${round} Agent Reports\n\n`;

  for (const { agentName, report } of reports) {
    input += `### ${formatAgentName(agentName)} Report\n\n`;
    input += `\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n\n`;
  }

  if (round === 1) {
    input +=
      "\nGenerate follow-up briefs for any agents whose findings would benefit from cross-agent intelligence. " +
      "If all findings are consistent and complete, return empty followUpBriefs to proceed directly to synthesis.";
  } else {
    input +=
      `\nThis is Round ${round}. Check whether contradictions from Round ${round - 1} have been resolved. ` +
      "Flag any remaining unresolvable contradictions as CEO questions for the uncertainty log.";
  }

  return input;
}

function formatAgentName(name: string): string {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function launchRound2Agents(
  analysisId: string,
  followUpBriefs: OrganizerOutput["followUpBriefs"],
): Promise<void> {
  // Group briefs by target agent
  const briefsByAgent = new Map<string, string[]>();
  for (const brief of followUpBriefs) {
    const existing = briefsByAgent.get(brief.targetAgent) || [];
    existing.push(`[${brief.priority.toUpperCase()}] ${brief.brief}\nReason: ${brief.reason}`);
    briefsByAgent.set(brief.targetAgent, existing);
  }

  // Launch only agents that have follow-up work
  for (const [agentName, briefs] of briefsByAgent) {
    const followUpBrief = {
      instructions: briefs.join("\n\n"),
      fromOrganizer: true,
      round: 2,
    };

    const run = await prisma.onboardingAgentRun.create({
      data: {
        analysisId,
        agentName,
        round: 2,
        status: "running",
        maxIterations: 15,
        followUpBrief: followUpBrief as any,
        startedAt: new Date(),
      },
    });

    await addProgressMessage(
      analysisId,
      `${formatAgentName(agentName)} investigating cross-referenced findings...`,
      agentName,
    );
    await triggerNextIteration(run.id);
  }
}

async function launchRound3Agents(
  analysisId: string,
  organizerOutput: OrganizerOutput,
): Promise<void> {
  const agentsNeeded = new Set<string>();
  const contradictionBriefs = new Map<string, string[]>();

  for (const contradiction of organizerOutput.unresolvedContradictions.filter((c) => c.resolvable)) {
    for (const c of organizerOutput.contradictions.filter(
      (cc) => cc.topic === contradiction.topic,
    )) {
      for (const agent of [c.agent1, c.agent2]) {
        agentsNeeded.add(agent);
        const existing = contradictionBriefs.get(agent) || [];
        existing.push(
          `CONTRADICTION on "${contradiction.topic}": ${contradiction.description}\n` +
            `Resolution suggestion: ${c.resolutionSuggestion}`,
        );
        contradictionBriefs.set(agent, existing);
      }
    }
  }

  for (const agentName of agentsNeeded) {
    const briefs = contradictionBriefs.get(agentName) || [];
    const run = await prisma.onboardingAgentRun.create({
      data: {
        analysisId,
        agentName,
        round: 3,
        status: "running",
        maxIterations: 10,
        followUpBrief: { instructions: briefs.join("\n\n"), round: 3 } as any,
        startedAt: new Date(),
      },
    });

    await triggerNextIteration(run.id);
  }
}
