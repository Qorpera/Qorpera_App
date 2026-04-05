/**
 * Generic agentic loop — hypothesis → tool-use → iteration pattern.
 *
 * Extracted from reasoning-engine.ts so it can be reused by
 * deliverable generation and other agentic pipelines.
 */

import { callLLM, getModel, getThinkingBudget } from "@/lib/ai-provider";
import type { LLMMessage, AITool, ModelRoute } from "@/lib/ai-provider";
import { extractJSON } from "@/lib/json-helpers";
import { logToolCall } from "@/lib/tool-call-trace";
import type { ZodSchema } from "zod";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AgenticLoopParams<T> {
  operatorId: string;
  contextId: string;        // situationId, deliverableId, etc. — for telemetry
  contextType: string;      // "situation" | "deliverable" — for telemetry
  cycleNumber: number;
  systemPrompt: string;
  seedContext: string;
  tools: AITool[];
  dispatchTool: (toolName: string, args: Record<string, unknown>) => Promise<string>;
  outputSchema: ZodSchema<T>;
  softBudget: number;
  hardBudget: number;
  modelRoute?: ModelRoute;  // override model route (default: "agenticReasoning")
  editInstruction?: string | null;
  priorFeedbackLines?: string[] | null;
}

export interface AgenticLoopResult<T> {
  output: T;
  apiCostCents: number;
  durationMs: number;
  modelId: string;
  toolCallCount: number;
}

// ── Loop ───────────────────────────────────────────────────────────────────────

export async function runAgenticLoop<T>(params: AgenticLoopParams<T>): Promise<AgenticLoopResult<T>> {
  const modelRoute = params.modelRoute ?? "agenticReasoning";
  const model = getModel(modelRoute);
  const thinkingBudget = getThinkingBudget(modelRoute);
  const startTime = performance.now();
  let apiCostCents = 0;
  let totalCalls = 0;
  let callIndex = 0;
  let softNudgeSent = false;
  let parseRetried = false;

  // Build initial user message
  let initialContent = params.seedContext;
  if (params.editInstruction) {
    initialContent += `\n\nEDIT REQUEST:\n${params.editInstruction}\nRevise your actionPlan to incorporate this feedback. Keep the same situation analysis but adjust the plan steps and justification accordingly.`;
  }
  if (params.priorFeedbackLines) {
    initialContent += `\n\nHUMAN FEEDBACK ON SIMILAR SITUATIONS:\n${params.priorFeedbackLines.join("\n")}\nIncorporate this feedback into your reasoning.`;
  }

  const messages: LLMMessage[] = [
    { role: "user", content: initialContent },
  ];

  while (totalCalls < params.hardBudget) {
    // Soft budget nudge
    if (totalCalls >= params.softBudget && !softNudgeSent) {
      messages.push({
        role: "user",
        content: `BUDGET NOTICE: You have used ${totalCalls} of your ${params.hardBudget} tool call budget. You may make up to ${params.hardBudget - totalCalls} more calls if critical evidence is still missing. Otherwise, produce your final JSON assessment now.`,
      });
      softNudgeSent = true;
    }

    const response = await callLLM({
      instructions: params.systemPrompt,
      messages,
      tools: params.tools,
      temperature: 0.2,
      aiFunction: "reasoning",
      model,
      operatorId: params.operatorId,
      thinking: thinkingBudget !== null,
      thinkingBudget: thinkingBudget ?? undefined,
    });
    apiCostCents += response.apiCostCents;

    // Terminal check — model produced final output (no tool calls)
    if (!response.toolCalls?.length) {
      const parsed = extractJSON(response.text);
      if (!parsed) {
        if (!parseRetried) {
          parseRetried = true;
          messages.push({ role: "assistant", content: response.text });
          messages.push({ role: "user", content: "Your output could not be parsed as JSON. Produce valid JSON matching the required schema." });
          continue;
        }
        throw new Error(`Agentic loop failed (${params.contextType}/${params.contextId}): could not parse JSON after retry`);
      }
      const result = params.outputSchema.safeParse(parsed);
      if (!result.success) {
        const errors = result.error.issues.map((i: { path: (string | number)[]; message: string }) => `${i.path.join(".")}: ${i.message}`).join("; ");
        if (!parseRetried) {
          parseRetried = true;
          messages.push({ role: "assistant", content: response.text });
          messages.push({ role: "user", content: `Your output could not be parsed: ${errors}. Produce valid JSON matching the required schema.` });
          continue;
        }
        throw new Error(`Agentic loop failed (${params.contextType}/${params.contextId}): schema validation failed after retry: ${errors}`);
      }
      return {
        output: result.data,
        apiCostCents,
        durationMs: Math.round(performance.now() - startTime),
        modelId: model,
        toolCallCount: totalCalls,
      };
    }

    // Tool execution — push assistant message with tool_calls, then execute each
    messages.push({
      role: "assistant",
      content: response.text || "",
      tool_calls: response.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      })),
    });

    for (const toolCall of response.toolCalls) {
      const toolStart = performance.now();
      const result = await params.dispatchTool(toolCall.name, toolCall.arguments);
      const toolDurationMs = Math.round(performance.now() - toolStart);

      messages.push({
        role: "tool",
        content: result,
        tool_call_id: toolCall.id,
        name: toolCall.name,
      });

      // Fire-and-forget telemetry
      logToolCall({
        situationId: params.contextType === "situation" ? params.contextId : undefined,
        contextId: params.contextId,
        contextType: params.contextType,
        cycleNumber: params.cycleNumber,
        callIndex,
        toolName: toolCall.name,
        arguments: toolCall.arguments,
        result,
        durationMs: toolDurationMs,
      }).catch(() => {});

      callIndex++;
      totalCalls++;
    }
  }

  // Hard budget hit — force final output with no tools
  messages.push({
    role: "user",
    content: "You must produce your final JSON assessment now. Note any remaining evidence gaps in the missingContext or gaps field.",
  });

  const finalResponse = await callLLM({
    instructions: params.systemPrompt,
    messages,
    temperature: 0.2,
    aiFunction: "reasoning",
    model,
    operatorId: params.operatorId,
    thinking: thinkingBudget !== null,
    thinkingBudget: thinkingBudget ?? undefined,
  });
  apiCostCents += finalResponse.apiCostCents;

  const parsed = extractJSON(finalResponse.text);
  if (!parsed) throw new Error(`Agentic loop failed (${params.contextType}/${params.contextId}): could not parse final JSON after budget exhaustion`);
  const result = params.outputSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues.map((i: { path: (string | number)[]; message: string }) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Agentic loop failed (${params.contextType}/${params.contextId}): final output schema validation failed: ${errors}`);
  }

  return {
    output: result.data,
    apiCostCents,
    durationMs: Math.round(performance.now() - startTime),
    modelId: model,
    toolCallCount: totalCalls,
  };
}
