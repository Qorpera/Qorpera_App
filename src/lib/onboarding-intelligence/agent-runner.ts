/**
 * @deprecated Replaced by worker/src/agent-runner.ts which uses a persistent Anthropic API
 * loop with full 1M context instead of self-chaining serverless invocations with lossy summarization.
 *
 * Core agent iteration loop for onboarding intelligence.
 *
 * Each invocation runs ONE iteration: load state → LLM call → process response → chain next.
 * The LLM decides: investigate (call tools), update_memory, or done.
 * We control the loop — the LLM does NOT run native tool loops.
 */

import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import { executeTool, formatToolsForLLM } from "./tools/registry";
import { triggerNextIteration } from "@/lib/internal-api";
import { addProgressMessage } from "./progress";
import { checkRoundCompletion } from "./orchestration";
import { getAgentPrompt } from "./agents/prompt-registry";
import type {
  WorkingMemory,
  AgentLLMResponse,
  ToolCallLogEntry,
  ToolContext,
} from "./types";

// ── Main Iteration ───────────────────────────────────────────────────────────

export async function runAgentIteration(runId: string): Promise<void> {
  // 1. Load state
  const run = await prisma.onboardingAgentRun.findUnique({
    where: { id: runId },
    include: { analysis: { select: { operatorId: true } } },
  });

  if (!run) {
    console.error(`OnboardingAgentRun not found: ${runId}`);
    return;
  }

  // 2. Check guards
  if (run.status !== "running") return;

  if (run.iterationCount >= run.maxIterations) {
    await markRunComplete(runId, run.analysisId, run.agentName, run.round, run.workingMemory);
    return;
  }

  const operatorId = run.analysis.operatorId;
  const workingMemory = run.workingMemory as unknown as WorkingMemory;
  const toolCallLog = run.toolCallLog as unknown as ToolCallLogEntry[];

  // Load Round 0 data for Round 1+ agents (enriches ToolContext)
  let toolContext: ToolContext = { operatorId, analysisId: run.analysisId };
  if (run.round > 0) {
    const round0Runs = await prisma.onboardingAgentRun.findMany({
      where: { analysisId: run.analysisId, round: 0, status: "complete" },
      select: { agentName: true, report: true },
    });
    const peopleRegistry = round0Runs.find((r) => r.agentName === "people_discovery")?.report;
    const temporalIndex = round0Runs.find((r) => r.agentName === "temporal_analyst")?.report;
    toolContext = {
      ...toolContext,
      peopleRegistry: peopleRegistry as any,
      temporalIndex: temporalIndex as any,
    };
  }

  try {
    // 3. Build LLM input
    const tools = formatToolsForLLM(run.agentName);
    const systemPrompt = buildAgentSystemPrompt(run.agentName);

    const userPrompt = buildIterationPrompt(
      run.iterationCount,
      workingMemory,
      run.followUpBrief as Record<string, unknown> | null,
    );

    // 4. Call LLM (reasoning model for agent decisions)
    const llmResponse = await callLLM({
      operatorId,
      model: "gpt-5.4",
      instructions: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools,
      thinking: true,
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "agent_response",
          strict: true,
          schema: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["investigate", "update_memory", "done"] },
              toolCalls: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    arguments: { type: "object" },
                  },
                  required: ["name", "arguments"],
                },
              },
              updatedMemory: {
                type: "object",
                properties: {
                  findings: { type: "string" },
                  hypotheses: { type: "array", items: { type: "string" } },
                  openQuestions: { type: "array", items: { type: "string" } },
                  investigationPlan: { type: "string" },
                },
              },
              report: { type: "object" },
            },
            required: ["action"],
          },
        },
      },
    });

    // Track token usage
    const tokensUsed = (llmResponse.usage?.inputTokens || 0) + (llmResponse.usage?.outputTokens || 0);
    const costCents = llmResponse.apiCostCents || 0;

    // Parse response
    let agentResponse: AgentLLMResponse;
    try {
      agentResponse = JSON.parse(llmResponse.text);
    } catch {
      // LLM didn't return valid JSON — treat as update_memory with raw text
      agentResponse = {
        action: "update_memory",
        updatedMemory: {
          ...workingMemory,
          findings: workingMemory.findings + "\n" + llmResponse.text.slice(0, 1000),
        },
      };
    }

    // 5. Process response
    if (agentResponse.action === "investigate" && agentResponse.toolCalls?.length) {
      await processToolCalls(
        runId,
        run.analysisId,
        operatorId,
        run.agentName,
        run.iterationCount,
        workingMemory,
        toolCallLog,
        agentResponse.toolCalls,
        tokensUsed,
        costCents,
        toolContext,
      );
    } else if (agentResponse.action === "update_memory" && agentResponse.updatedMemory) {
      await prisma.onboardingAgentRun.update({
        where: { id: runId },
        data: {
          workingMemory: agentResponse.updatedMemory as any,
          iterationCount: run.iterationCount + 1,
          lastIterationAt: new Date(),
          tokensUsed: { increment: tokensUsed },
          costCents: { increment: costCents },
        },
      });

      // Chain next iteration
      await triggerNextIteration(runId);
    } else if (agentResponse.action === "done") {
      await prisma.onboardingAgentRun.update({
        where: { id: runId },
        data: {
          status: "complete",
          report: agentResponse.report || (workingMemory as any),
          iterationCount: run.iterationCount + 1,
          lastIterationAt: new Date(),
          completedAt: new Date(),
          tokensUsed: { increment: tokensUsed },
          costCents: { increment: costCents },
        },
      });

      await addProgressMessage(
        run.analysisId,
        `${run.agentName} completed analysis (${run.iterationCount + 1} iterations)`,
        run.agentName,
      );

      // Update analysis token totals
      await updateAnalysisTokens(run.analysisId, tokensUsed, costCents);

      // Check if round is complete
      await checkRoundCompletion(run.analysisId, run.round);
    } else {
      // Unknown action — just continue with memory update
      await prisma.onboardingAgentRun.update({
        where: { id: runId },
        data: {
          iterationCount: run.iterationCount + 1,
          lastIterationAt: new Date(),
          tokensUsed: { increment: tokensUsed },
          costCents: { increment: costCents },
        },
      });
      await triggerNextIteration(runId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Agent iteration failed [${runId}]:`, message);

    await prisma.onboardingAgentRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        lastIterationAt: new Date(),
        completedAt: new Date(),
      },
    });

    await addProgressMessage(
      run.analysisId,
      `${run.agentName} failed: ${message}`,
      run.agentName,
    );

    await checkRoundCompletion(run.analysisId, run.round);
  }
}

// ── Tool Call Processing ─────────────────────────────────────────────────────

async function processToolCalls(
  runId: string,
  analysisId: string,
  operatorId: string,
  agentName: string,
  iterationCount: number,
  workingMemory: WorkingMemory,
  toolCallLog: ToolCallLogEntry[],
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>,
  tokensUsed: number,
  costCents: number,
  ctx: ToolContext,
): Promise<void> {

  const toolResults: string[] = [];
  const newLogEntries: ToolCallLogEntry[] = [];

  // Execute each tool call sequentially
  for (const tc of toolCalls) {
    const { result, durationMs } = await executeTool(tc.name, tc.arguments, ctx);

    // Truncate large tool results before memory summarization (cap at 8K chars per tool)
    const truncated = result.length > 8000 ? result.slice(0, 8000) + "\n... [truncated]" : result;
    toolResults.push(`[${tc.name}] ${truncated}`);

    newLogEntries.push({
      tool: tc.name,
      args: tc.arguments,
      resultSummary: result.slice(0, 200),
      durationMs,
      timestamp: new Date().toISOString(),
    });
  }

  // 7. Summarize tool results into updated working memory
  const summarizedMemory = await summarizeToolResults(
    operatorId,
    workingMemory,
    toolResults,
  );

  // Update run state
  await prisma.onboardingAgentRun.update({
    where: { id: runId },
    data: {
      workingMemory: summarizedMemory as any,
      toolCallLog: [...toolCallLog, ...newLogEntries] as any,
      iterationCount: iterationCount + 1,
      lastIterationAt: new Date(),
      tokensUsed: { increment: tokensUsed },
      costCents: { increment: costCents },
    },
  });

  await updateAnalysisTokens(analysisId, tokensUsed, costCents);

  // Progress update every 3 iterations
  if ((iterationCount + 1) % 3 === 0) {
    await addProgressMessage(
      analysisId,
      `${agentName} investigating (iteration ${iterationCount + 1})...`,
      agentName,
    );
  }

  // Chain next iteration
  await triggerNextIteration(runId);
}

// ── Memory Summarization ─────────────────────────────────────────────────────

async function summarizeToolResults(
  operatorId: string,
  currentMemory: WorkingMemory,
  toolResults: string[],
): Promise<WorkingMemory> {
  try {
    const response = await callLLM({
      operatorId,
      model: "gpt-5.4-mini",
      instructions:
        "You are a research assistant. Summarize the tool results and update the working memory. " +
        "Keep the memory under 2000 words. Preserve important findings, update hypotheses, note new questions.",
      messages: [
        {
          role: "user",
          content: `Current working memory:\n${JSON.stringify(currentMemory, null, 2)}\n\n` +
            `New tool results:\n${toolResults.join("\n\n")}\n\n` +
            "Update the working memory JSON with key findings from these results. " +
            "Return ONLY a valid JSON object with keys: findings, hypotheses, openQuestions, investigationPlan.",
        },
      ],
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "working_memory",
          strict: true,
          schema: {
            type: "object",
            properties: {
              findings: { type: "string" },
              hypotheses: { type: "array", items: { type: "string" } },
              openQuestions: { type: "array", items: { type: "string" } },
              investigationPlan: { type: "string" },
            },
            required: ["findings", "hypotheses", "openQuestions", "investigationPlan"],
          },
        },
      },
    });

    const parsed = JSON.parse(response.text);
    return parsed as WorkingMemory;
  } catch {
    // Fallback: append raw summary to existing memory
    return {
      ...currentMemory,
      findings: currentMemory.findings + "\n[Tool results appended but summarization failed]",
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function markRunComplete(
  runId: string,
  analysisId: string,
  agentName: string,
  round: number,
  workingMemory: unknown,
): Promise<void> {
  await prisma.onboardingAgentRun.update({
    where: { id: runId },
    data: {
      status: "complete",
      report: workingMemory as any,
      completedAt: new Date(),
      lastIterationAt: new Date(),
    },
  });

  await addProgressMessage(
    analysisId,
    `${agentName} reached iteration limit — completing with current findings`,
    agentName,
  );

  await checkRoundCompletion(analysisId, round);
}

async function updateAnalysisTokens(
  analysisId: string,
  tokensUsed: number,
  costCents: number,
): Promise<void> {
  await prisma.onboardingAnalysis.update({
    where: { id: analysisId },
    data: {
      totalTokensUsed: { increment: tokensUsed },
      totalCostCents: { increment: costCents },
    },
  });
}

function buildAgentSystemPrompt(agentName: string): string {
  // Use specialized prompt from registry if available
  const registeredPrompt = getAgentPrompt(agentName);
  if (registeredPrompt) return registeredPrompt;

  // Generic fallback for agents not yet registered
  return (
    `You are ${agentName}, an organizational intelligence analyst. ` +
    "Your job is to investigate a company's data and build a comprehensive understanding. " +
    "Use your available tools to search, query, and analyze data. " +
    "Build hypotheses, test them with evidence, and document your findings. " +
    "When you have sufficient evidence, signal DONE with your report."
  );
}

function buildIterationPrompt(
  iterationCount: number,
  workingMemory: WorkingMemory,
  followUpBrief: Record<string, unknown> | null,
): string {
  const parts: string[] = [
    `You are on iteration ${iterationCount + 1}.`,
    "",
    "## Your Working Memory",
    JSON.stringify(workingMemory, null, 2),
  ];

  if (followUpBrief) {
    // Round 0 preamble is pre-formatted text — include directly
    if (typeof followUpBrief.round0Preamble === "string") {
      parts.push("", followUpBrief.round0Preamble);
    }
    // Round 2/3 follow-up briefs from Organizer (targeted investigation instructions)
    if (followUpBrief.fromOrganizer && typeof followUpBrief.instructions === "string") {
      parts.push(
        "",
        "## Follow-Up Investigation (from Organizer)",
        "",
        "You previously completed a Round 1 analysis. The Organizer has identified specific areas " +
          "where cross-agent findings suggest you should investigate further:",
        "",
        followUpBrief.instructions as string,
        "",
        "Your Round 1 report is still in your working memory. Use it as context. " +
          "Focus specifically on the follow-up questions above. When you have addressed them, signal DONE with a supplementary report.",
      );
    }
  }

  parts.push(
    "",
    "## Instructions",
    "Review your working memory. Decide your next action:",
    '(a) **investigate**: Call tools to gather more data. Return { "action": "investigate", "toolCalls": [...] }',
    '(b) **update_memory**: Update your working memory with new insights. Return { "action": "update_memory", "updatedMemory": {...} }',
    '(c) **done**: You have sufficient evidence for your report. Return { "action": "done", "report": {...} }',
    "",
    "Return ONLY a JSON object with your chosen action.",
  );

  return parts.join("\n");
}
