import Anthropic from "@anthropic-ai/sdk";
import type { PrismaClient } from "@prisma/client";
import { runAgent, type AgentConfig, type AgentResult } from "./agent-runner";
import { addProgressMessage } from "@/lib/onboarding-intelligence/progress";
import { buildPeopleRegistry } from "@/lib/onboarding-intelligence/agents/people-discovery";
import { getAgentPrompt } from "@/lib/onboarding-intelligence/agents/prompt-registry";
import { buildRound1Preamble } from "@/lib/onboarding-intelligence/orchestration";
import {
  SYNTHESIS_PROMPT,
  buildSynthesisInput,
  createEntitiesFromModel,
  createSituationTypesFromModel,
  sendAnalysisCompleteEmail,
  type CompanyModel,
} from "@/lib/onboarding-intelligence/synthesis";
import { TEMPORAL_ANALYST_PROMPT } from "@/lib/onboarding-intelligence/agents/temporal-analyst";
import type { TemporalReport } from "@/lib/onboarding-intelligence/agents/temporal-analyst";
import { ORGANIZER_PROMPT } from "@/lib/onboarding-intelligence/agents/organizer";
import type { OrganizerOutput } from "@/lib/onboarding-intelligence/agents/organizer";
import type { ToolContext, TemporalIndexEntry } from "@/lib/onboarding-intelligence/types";
import type { PeopleRegistryEntry } from "@/lib/onboarding-intelligence/agents/people-discovery";

export async function runAnalysisPipeline(analysisId: string, prisma: PrismaClient): Promise<void> {
  const analysis = await prisma.onboardingAnalysis.findUnique({
    where: { id: analysisId },
    include: { operator: true },
  });
  if (!analysis) throw new Error("Analysis not found");

  const operatorId = analysis.operatorId;

  // ═══ ROUND 0: Foundation ═══════════════════════════════════════════════════
  await updatePhase(prisma, analysisId, "round_0");
  await addProgressMessage(analysisId, "Starting organizational intelligence analysis...");

  // People Discovery — algorithmic, no LLM
  // Call buildPeopleRegistry() directly instead of runPeopleDiscovery() to avoid
  // triggering checkRoundCompletion() which would launch old serverless agents.
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

    const internalCount = registry.filter((p) => p.isInternal).length;
    const externalCount = registry.filter((p) => !p.isInternal).length;
    await addProgressMessage(
      analysisId,
      `Discovered ${internalCount} team members and ${externalCount} external contacts across all sources`,
      "people_discovery",
    );

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
    // Continue without people registry — agents can still work with other data
  }

  // Temporal Analyst — first LLM agent
  const temporalCtx: ToolContext = { operatorId, analysisId };
  const temporalResult = await runAgentAndRecord(prisma, {
    name: "temporal_analyst",
    systemPrompt: TEMPORAL_ANALYST_PROMPT,
    initialContext: "Analyze all documents and content for this company. Build a temporal map and freshness index.",
    maxIterations: 50,
    analysisId,
    operatorId,
    toolContext: temporalCtx,
  }, 0);

  const temporalReport = parseJsonReport<TemporalReport>(temporalResult.report);
  const round0Preamble = buildRound1Preamble(peopleRegistry, temporalReport);

  // ═══ ROUND 1: Parallel Deep Research ═══════════════════════════════════════
  await updatePhase(prisma, analysisId, "round_1");
  await addProgressMessage(analysisId, "Foundation complete. Launching specialist research agents...");

  const round1Agents = ["org_analyst", "process_analyst", "relationship_analyst", "knowledge_analyst", "financial_analyst"];

  // Map temporal report entries to TemporalIndexEntry format for tool context
  const temporalIndex: TemporalIndexEntry[] = (temporalReport?.temporalMap || []).map((e) => ({
    date: e.date,
    eventType: e.significance,
    summary: e.event,
    entityIds: [],
  }));

  const round1ToolCtx: ToolContext = {
    operatorId,
    analysisId,
    peopleRegistry: (peopleRegistry || []).map((p) => ({
      entityId: p.entityId || "",
      displayName: p.displayName,
      email: p.email,
    })),
    temporalIndex,
  };

  // Launch all agents with staggered starts (10s apart) to avoid API rate limits
  const round1Promises = round1Agents.map((agentName, i) =>
    sleep(i * 10_000).then(() =>
      runAgentAndRecord(prisma, {
        name: agentName,
        systemPrompt: getAgentPrompt(agentName)!,
        initialContext: round0Preamble,
        maxIterations: 100,
        analysisId,
        operatorId,
        toolContext: round1ToolCtx,
      }, 1)
    )
  );

  const round1Results: AgentResult[] = [];
  const round1Settled = await Promise.allSettled(round1Promises);
  for (let i = 0; i < round1Settled.length; i++) {
    const result = round1Settled[i];
    if (result.status === "fulfilled") {
      round1Results.push(result.value);
    } else {
      console.error(`[pipeline] ${round1Agents[i]} failed:`, result.reason);
      await addProgressMessage(analysisId, `${round1Agents[i]} failed: ${result.reason}`, round1Agents[i]);
    }
  }

  await addProgressMessage(analysisId, `Round 1 complete (${round1Results.length}/${round1Agents.length} agents succeeded)`);

  // ═══ ORGANIZER 1: Cross-Pollination ════════════════════════════════════════
  await updatePhase(prisma, analysisId, "organizer_1");
  const organizerResult = await runOrganizerCall(prisma, analysisId, round1Results, round1Agents, 1);

  // ═══ ROUND 2: Targeted Follow-Ups (if needed) ═════════════════════════════
  let round2Results: AgentResult[] = [];
  const round2AgentNames: string[] = [];
  if (organizerResult.followUpBriefs.length > 0) {
    await updatePhase(prisma, analysisId, "round_2");
    await addProgressMessage(analysisId, `${organizerResult.followUpBriefs.length} targeted follow-up investigations...`);

    // Deduplicate agent names to avoid @@unique([analysisId, agentName, round]) violation
    const nameCounters = new Map<string, number>();
    const uniqueNames = organizerResult.followUpBriefs.map((brief) => {
      const base = brief.targetAgent;
      const count = nameCounters.get(base) || 0;
      nameCounters.set(base, count + 1);
      const name = count === 0 ? base : `${base}_followup_${count}`;
      round2AgentNames.push(name);
      return name;
    });

    const round2Promises = organizerResult.followUpBriefs.map((brief, i) =>
      sleep(i * 5_000).then(() =>
        runAgentAndRecord(prisma, {
          name: uniqueNames[i],
          systemPrompt: getAgentPrompt(brief.targetAgent) || "You are a specialist analyst.",
          initialContext: round0Preamble + "\n\n## Follow-Up Investigation\n\n" + brief.brief,
          maxIterations: 50,
          analysisId,
          operatorId,
          toolContext: round1ToolCtx,
        }, 2)
      )
    );

    const round2Settled = await Promise.allSettled(round2Promises);
    for (const r of round2Settled) {
      if (r.status === "fulfilled") round2Results.push(r.value);
    }
  }

  // ═══ ROUND 3: Contradiction Resolution (if needed) ═════════════════════════
  let round3Results: AgentResult[] = [];
  if (organizerResult.unresolvedContradictions.some((c) => c.resolvable)) {
    await updatePhase(prisma, analysisId, "organizer_2");
    const orgResult2 = await runOrganizerCall(prisma, analysisId, round2Results, round2AgentNames, 2);

    if (orgResult2.followUpBriefs.length > 0) {
      await updatePhase(prisma, analysisId, "round_3");
      await addProgressMessage(analysisId, `Resolving ${orgResult2.followUpBriefs.length} remaining contradictions...`);

      // Deduplicate agent names for round 3
      const r3NameCounters = new Map<string, number>();
      const r3UniqueNames = orgResult2.followUpBriefs.map((brief) => {
        const base = brief.targetAgent;
        const count = r3NameCounters.get(base) || 0;
        r3NameCounters.set(base, count + 1);
        return count === 0 ? base : `${base}_resolve_${count}`;
      });

      const round3Promises = orgResult2.followUpBriefs.map((brief, i) =>
        sleep(i * 5_000).then(() =>
          runAgentAndRecord(prisma, {
            name: r3UniqueNames[i],
            systemPrompt: getAgentPrompt(brief.targetAgent) || "You are a specialist analyst.",
            initialContext: round0Preamble + "\n\n## Contradiction Resolution\n\n" + brief.brief,
            maxIterations: 30,
            analysisId,
            operatorId,
            toolContext: round1ToolCtx,
          }, 3)
        )
      );

      const round3Settled = await Promise.allSettled(round3Promises);
      for (const r of round3Settled) {
        if (r.status === "fulfilled") round3Results.push(r.value);
      }
    }
  }

  // ═══ SYNTHESIS ═════════════════════════════════════════════════════════════
  await updatePhase(prisma, analysisId, "synthesis");
  await addProgressMessage(analysisId, "All investigations complete. Synthesizing company model...");
  await runSynthesis(prisma, analysisId, operatorId, round1Results, round2Results, round3Results, round1Agents, organizerResult);

  // Update analysis totals from all agent runs
  const allRuns = await prisma.onboardingAgentRun.findMany({
    where: { analysisId },
    select: { tokensUsed: true },
  });
  const totalTokens = allRuns.reduce((sum, r) => sum + r.tokensUsed, 0);

  // Estimate cost: collect input/output from all agent results
  const allResults = [...round1Results, ...round2Results, ...round3Results];
  const totalInput = allResults.reduce((sum, r) => sum + r.totalInputTokens, 0);
  const totalOutput = allResults.reduce((sum, r) => sum + r.totalOutputTokens, 0);
  const totalCost = calculateAnthropicCost(totalInput, totalOutput);

  await prisma.onboardingAnalysis.update({
    where: { id: analysisId },
    data: { totalTokensUsed: totalTokens, totalCostCents: totalCost },
  });

  await addProgressMessage(analysisId, "Your operational map is ready for review!");
}

// ── Organizer Call ────────────────────────────────────────────────────────────

async function runOrganizerCall(
  prisma: PrismaClient,
  analysisId: string,
  agentResults: AgentResult[],
  agentNames: string[],
  afterRound: number,
): Promise<OrganizerOutput> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  await addProgressMessage(analysisId, `Cross-referencing findings from ${agentResults.length} specialist analyses...`, "organizer");

  // Build input from agent reports
  let input = `## Round ${afterRound} Agent Reports\n\n`;
  for (let i = 0; i < agentResults.length; i++) {
    const name = agentNames[i] || `Agent ${i}`;
    input += `### ${formatAgentName(name)} Report\n\n${agentResults[i].report}\n\n---\n\n`;
  }

  const response = await client.messages.create({
    model: "claude-opus-4-6-20250415",
    max_tokens: 16384,
    system: ORGANIZER_PROMPT,
    messages: [{ role: "user", content: input }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  // Record organizer run for audit
  await prisma.onboardingAgentRun.create({
    data: {
      analysisId,
      agentName: "organizer",
      round: afterRound,
      status: "complete",
      iterationCount: 1,
      maxIterations: 1,
      report: text as any,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });

  // Parse JSON from the response text, with safe field defaults
  try {
    const parsed = JSON.parse(extractJson(text));
    return {
      overlaps: parsed.overlaps || [],
      contradictions: parsed.contradictions || [],
      followUpBriefs: parsed.followUpBriefs || [],
      unresolvedContradictions: parsed.unresolvedContradictions || [],
      synthesisNotes: parsed.synthesisNotes || "",
    };
  } catch {
    // Graceful degradation
    return {
      overlaps: [],
      contradictions: [],
      followUpBriefs: [],
      unresolvedContradictions: [],
      synthesisNotes: "Organizer output parsing failed. Proceeding with available findings.",
    };
  }
}

// ── Synthesis ─────────────────────────────────────────────────────────────────

async function runSynthesis(
  prisma: PrismaClient,
  analysisId: string,
  operatorId: string,
  round1: AgentResult[],
  round2: AgentResult[],
  round3: AgentResult[],
  round1Agents: string[],
  organizerResult: OrganizerOutput,
): Promise<void> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Build input from ALL reports
  const allReports: Array<{ agent: string; round: number; report: unknown }> = [];

  for (let i = 0; i < round1.length; i++) {
    allReports.push({ agent: round1Agents[i] || `round1_agent_${i}`, round: 1, report: round1[i].report });
  }
  allReports.push({ agent: "organizer", round: 1, report: organizerResult.synthesisNotes });
  for (let i = 0; i < round2.length; i++) {
    allReports.push({ agent: `follow_up_${i}`, round: 2, report: round2[i].report });
  }
  for (let i = 0; i < round3.length; i++) {
    allReports.push({ agent: `contradiction_resolution_${i}`, round: 3, report: round3[i].report });
  }

  const synthesisInput = buildSynthesisInput(allReports);

  const response = await client.messages.create({
    model: "claude-opus-4-6-20250415",
    max_tokens: 16384,
    system: SYNTHESIS_PROMPT,
    messages: [{ role: "user", content: synthesisInput }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  let companyModel: CompanyModel;
  try {
    companyModel = JSON.parse(extractJson(text));
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
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    await prisma.onboardingAnalysis.update({
      where: { id: analysisId },
      data: { status: "failed", failureReason: reason, completedAt: new Date() },
    });
    return;
  }

  // Create real entities from the company model
  await createEntitiesFromModel(operatorId, companyModel);
  await createSituationTypesFromModel(operatorId, companyModel);

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
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      startedAt: new Date(),
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
}

// ── Agent Runner with Audit Record ───────────────────────────────────────────

async function runAgentAndRecord(
  prisma: PrismaClient,
  config: AgentConfig,
  round: number,
): Promise<AgentResult> {
  const run = await prisma.onboardingAgentRun.create({
    data: {
      analysisId: config.analysisId,
      agentName: config.name,
      round,
      status: "running",
      maxIterations: config.maxIterations,
      startedAt: new Date(),
    },
  });

  try {
    const result = await runAgent(config);

    await prisma.onboardingAgentRun.update({
      where: { id: run.id },
      data: {
        status: "complete",
        iterationCount: result.iterationCount,
        report: result.report as any,
        tokensUsed: result.totalInputTokens + result.totalOutputTokens,
        completedAt: new Date(),
      },
    });

    return result;
  } catch (err) {
    await prisma.onboardingAgentRun.update({
      where: { id: run.id },
      data: { status: "failed", completedAt: new Date() },
    });
    throw err;
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function formatAgentName(name: string): string {
  return name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** Anthropic Opus 4.6: $5/1M input, $25/1M output. Returns cost in cents. */
function calculateAnthropicCost(inputTokens: number, outputTokens: number): number {
  return Math.ceil((inputTokens / 1_000_000) * 500 + (outputTokens / 1_000_000) * 2500);
}

function extractJson(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : text.trim();
}

function parseJsonReport<T>(reportText: string): T | undefined {
  try {
    return JSON.parse(extractJson(reportText));
  } catch {
    console.warn("[pipeline] Failed to parse agent report as JSON");
    return undefined;
  }
}

async function updatePhase(prisma: PrismaClient, analysisId: string, phase: string): Promise<void> {
  await prisma.onboardingAnalysis.update({
    where: { id: analysisId },
    data: { currentPhase: phase },
  });
}
