/**
 * @deprecated startAnalysis(), checkRoundCompletion(), and launchAgent() are replaced by
 * worker/src/pipeline.ts which orchestrates rounds in-process. buildRound1Preamble() is
 * still used by the worker pipeline.
 *
 * Onboarding intelligence orchestration:
 * start analysis, launch agents, round completion, phase transitions.
 */

import { prisma } from "@/lib/db";
import { triggerNextIteration } from "@/lib/internal-api";
import { addProgressMessage } from "./progress";
import { runPeopleDiscovery } from "./agents/people-discovery";
import { launchTemporalAnalyst } from "./agents/temporal-analyst";
import { runOrganizer } from "./agents/organizer";
import { launchSynthesis } from "./synthesis";
import type { PeopleRegistryEntry } from "./agents/people-discovery";
import type { TemporalReport } from "./agents/temporal-analyst";

const ROUND_1_AGENTS = [
  "org_analyst",
  "process_analyst",
  "relationship_analyst",
  "knowledge_analyst",
  "financial_analyst",
];
// Round 2 agent list managed by Organizer (only agents with follow-up briefs are launched)

// ── Start Analysis ───────────────────────────────────────────────────────────

export async function startAnalysis(operatorId: string): Promise<{ analysisId: string; status: string }> {
  // Check operator has synced data
  const connectorCount = await prisma.sourceConnector.count({
    where: { operatorId, status: "active" },
  });

  const contentCount = await prisma.contentChunk.count({
    where: { operatorId },
  });

  if (connectorCount === 0 && contentCount === 0) {
    throw new Error("No active connectors or synced content found. Connect your tools first.");
  }

  // Delete any existing analysis and its agent runs (restart)
  await prisma.onboardingAgentRun.deleteMany({
    where: { analysis: { operatorId } },
  });
  await prisma.onboardingAnalysis.deleteMany({
    where: { operatorId },
  });

  // Create new analysis
  const analysis = await prisma.onboardingAnalysis.create({
    data: {
      operatorId,
      status: "analyzing",
      currentPhase: "round_0",
      startedAt: new Date(),
    },
  });

  await addProgressMessage(analysis.id, "Starting organizational intelligence analysis...");

  // Launch Round 0:
  // People Discovery runs synchronously (algorithmic, fast)
  // Temporal Analyst launches as async LLM agent
  // Both call checkRoundCompletion when done — last to finish triggers Round 1
  await runPeopleDiscovery(analysis.id);
  await launchTemporalAnalyst(analysis.id);

  return { analysisId: analysis.id, status: "analyzing" };
}

// ── Launch Agent ─────────────────────────────────────────────────────────────

export async function launchAgent(
  analysisId: string,
  agentName: string,
  round: number,
  followUpBrief?: Record<string, unknown>,
): Promise<string> {
  const run = await prisma.onboardingAgentRun.create({
    data: {
      analysisId,
      agentName,
      round,
      status: "running",
      startedAt: new Date(),
      ...(followUpBrief ? { followUpBrief: followUpBrief as any } : {}),
    },
  });

  await addProgressMessage(analysisId, `${agentName} starting round ${round} analysis...`, agentName);

  // Trigger first iteration (fire-and-forget)
  await triggerNextIteration(run.id);

  return run.id;
}

// ── Round Completion ─────────────────────────────────────────────────────────

export async function checkRoundCompletion(analysisId: string, round: number): Promise<void> {
  // Exclude organizer runs from completion check — organizer is a post-round step
  const allRuns = await prisma.onboardingAgentRun.findMany({
    where: { analysisId, round, agentName: { not: "organizer" } },
  });

  if (allRuns.length === 0) return; // No agents launched for this round yet

  const allComplete = allRuns.every(
    (r) => r.status === "complete" || r.status === "failed",
  );
  if (!allComplete) return;

  // Atomic phase transition: only proceed if we're still in the expected phase.
  // This prevents duplicate launches when multiple agents complete simultaneously.
  const phaseMap: Record<number, string> = { 0: "round_0", 1: "round_1", 2: "round_2", 3: "round_3" };
  const expectedPhase = phaseMap[round];
  if (!expectedPhase) return;

  const updated = await prisma.onboardingAnalysis.updateMany({
    where: { id: analysisId, currentPhase: expectedPhase },
    data: { currentPhase: `transitioning_${round}` },
  });
  if (updated.count === 0) return; // Another agent already triggered the transition

  const successCount = allRuns.filter((r) => r.status === "complete").length;
  await addProgressMessage(
    analysisId,
    `Round ${round} complete (${successCount}/${allRuns.length} agents succeeded)`,
  );

  // Phase transitions
  if (round === 0) {
    await updateAnalysisPhase(analysisId, "round_1");
    await launchRound1Agents(analysisId);
  } else if (round === 1) {
    await updateAnalysisPhase(analysisId, "organizer_1");
    await runOrganizer(analysisId, 1);
  } else if (round === 2) {
    await updateAnalysisPhase(analysisId, "organizer_2");
    await runOrganizer(analysisId, 2);
  } else if (round === 3) {
    // After Round 3, go directly to synthesis
    await updateAnalysisPhase(analysisId, "synthesis");
    await addProgressMessage(analysisId, "All investigations complete. Synthesizing company model...");
    await launchSynthesis(analysisId);
  }
}

// ── Phase Transitions ────────────────────────────────────────────────────────

async function updateAnalysisPhase(analysisId: string, phase: string): Promise<void> {
  await prisma.onboardingAnalysis.update({
    where: { id: analysisId },
    data: { currentPhase: phase },
  });
}

async function launchRound1Agents(analysisId: string): Promise<void> {
  // Load Round 0 outputs for context
  const round0Runs = await prisma.onboardingAgentRun.findMany({
    where: { analysisId, round: 0, status: "complete" },
    select: { agentName: true, report: true },
  });

  const peopleReport = round0Runs.find((r) => r.agentName === "people_discovery")?.report as unknown as PeopleRegistryEntry[] | undefined;
  const temporalReport = round0Runs.find((r) => r.agentName === "temporal_analyst")?.report as unknown as TemporalReport | undefined;

  const preamble = buildRound1Preamble(peopleReport, temporalReport);

  await addProgressMessage(analysisId, "Foundation complete. Launching specialist research agents...");

  // Launch all 5 specialists with Round 0 context as follow-up brief
  for (const agentName of ROUND_1_AGENTS) {
    await launchAgent(analysisId, agentName, 1, { round0Preamble: preamble });
  }
}

// launchOrganizer removed — using runOrganizer from agents/organizer.ts directly

// Round 2 launch moved to agents/organizer.ts — organizer manages Round 2/3 launches directly

// ── Synthesis ────────────────────────────────────────────────────────────────

export async function completeSynthesis(
  analysisId: string,
  synthesisOutput: Record<string, unknown>,
  uncertaintyLog: Record<string, unknown>,
): Promise<void> {
  await prisma.onboardingAnalysis.update({
    where: { id: analysisId },
    data: {
      status: "confirming",
      currentPhase: "synthesis",
      synthesisOutput: synthesisOutput as any,
      uncertaintyLog: uncertaintyLog as any,
      completedAt: new Date(),
    },
  });

  await addProgressMessage(analysisId, "Analysis complete — review findings and confirm.");
}

// ── Round 1 Preamble ─────────────────────────────────────────────────────────

export function buildRound1Preamble(
  peopleReport?: PeopleRegistryEntry[],
  temporalReport?: TemporalReport,
): string {
  const parts: string[] = ["## Foundation Data (from Round 0 analysis)\n"];

  if (peopleReport && peopleReport.length > 0) {
    const internal = peopleReport.filter((p) => p.isInternal);
    parts.push(`### People Registry (${internal.length} internal team members discovered)`);
    for (const p of internal.slice(0, 50)) {
      const roleInfo = p.sources[0]?.role ? ` — Role: ${p.sources[0].role}` : "";
      parts.push(`- ${p.displayName} <${p.email}> — Sources: ${p.sources.map((s) => s.system).join(", ")}${roleInfo}`);
    }
    if (internal.length > 50) {
      parts.push(`- ... and ${internal.length - 50} more`);
    }
    parts.push("");
  }

  if (temporalReport) {
    parts.push("### Temporal Context");
    const majorEvents = temporalReport.temporalMap?.filter((e) => e.significance === "major") || [];
    if (majorEvents.length > 0) {
      parts.push("Key recent changes:");
      for (const e of majorEvents.slice(0, 10)) {
        parts.push(`- ${e.date}: ${e.event}`);
      }
    }
    if (temporalReport.recencyWarnings?.length > 0) {
      parts.push("\nDocument freshness warnings:");
      for (const w of temporalReport.recencyWarnings) {
        parts.push(`- ${w}`);
      }
    }
    parts.push(
      "\nUse the freshness scores when weighing evidence from documents. " +
      "Scores below 0.4 are historical context only — don't base structural conclusions on them without corroboration from recent data.",
    );
  }

  return parts.join("\n");
}

export async function markAnalysisFailed(analysisId: string, reason: string): Promise<void> {
  await prisma.onboardingAnalysis.update({
    where: { id: analysisId },
    data: {
      status: "failed",
      failureReason: reason,
      completedAt: new Date(),
    },
  });

  await addProgressMessage(analysisId, `Analysis failed: ${reason}`);
}
