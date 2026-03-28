import Anthropic from "@anthropic-ai/sdk";
import { executeTool, getToolsForAgent } from "@/lib/onboarding-intelligence/tools/registry";
import type { ToolContext } from "@/lib/onboarding-intelligence/types";
import { addProgressMessage } from "@/lib/onboarding-intelligence/progress";
import { estimateTokenCount, shouldPrune, pruneOldToolResults } from "./context-manager";
import { getModel, getMaxOutputTokens, getThinkingBudget, type ModelRoute } from "@/lib/ai-provider";

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  initialContext: string;     // Round 0 preamble + any follow-up brief
  maxIterations: number;      // Safety cap (100 for Round 1, 50 for Round 2, 30 for Round 3)
  analysisId: string;
  operatorId: string;
  toolContext: ToolContext;
  modelOverride?: string;     // If set, uses this model instead of the route default
  modelRoute?: ModelRoute;    // For thinking budget lookup
}

export interface AgentResult {
  report: string;
  toolCallCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  iterationCount: number;
}

export async function runAgent(config: AgentConfig): Promise<AgentResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // Bypass SDK's client-side nonstreaming timeout check (throws for max_tokens > ~21k)
  (client as any)._calculateNonstreamingTimeout = () => 20 * 60 * 1000;
  const model = config.modelOverride ?? getModel("onboardingAgent");

  // Convert existing AgentTool[] to Anthropic tool format
  const agentTools = getToolsForAgent(config.name);
  const anthropicTools: Anthropic.Tool[] = agentTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool.InputSchema,
  }));

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: config.initialContext },
  ];

  let iterationCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let toolCallCount = 0;

  while (iterationCount < config.maxIterations) {
    iterationCount++;

    // Emergency pruning if approaching 1M context limit
    if (shouldPrune(messages)) {
      pruneOldToolResults(messages);
      console.log(`[${config.name}] Context pruned at iteration ${iterationCount}`);
    }

    const route = config.modelRoute ?? "onboardingAgent";
    const thinkingBudget = getThinkingBudget(route);

    const response = await client.messages.create({
      model,
      max_tokens: getMaxOutputTokens(model),
      system: [
        {
          type: "text" as const,
          text: config.systemPrompt,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      messages,
      tools: anthropicTools,
      ...(thinkingBudget ? { thinking: { type: "enabled" as const, budget_tokens: thinkingBudget } } : {}),
    }, { timeout: 20 * 60 * 1000 });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Log cache performance for monitoring
    if (iterationCount === 1 || iterationCount % 5 === 0) {
      const cacheRead = (response.usage as any).cache_read_input_tokens ?? 0;
      const cacheWrite = (response.usage as any).cache_creation_input_tokens ?? 0;
      console.log(`[${config.name}] iter=${iterationCount} input=${response.usage.input_tokens} output=${response.usage.output_tokens} cache_read=${cacheRead} cache_write=${cacheWrite}`);
    }

    // Add assistant response to conversation history
    messages.push({ role: "assistant", content: response.content });

    // Extract tool use blocks
    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    // No tool calls = agent is done
    if (toolUses.length === 0) {
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === "text",
      );
      return {
        report: textBlocks.map((b) => b.text).join("\n"),
        toolCallCount,
        totalInputTokens,
        totalOutputTokens,
        iterationCount,
      };
    }

    // Execute tool calls using EXISTING handlers from tools/registry.ts
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUses) {
      toolCallCount++;
      const { result, durationMs } = await executeTool(
        toolUse.name,
        toolUse.input as Record<string, unknown>,
        config.toolContext,
      );

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result,
      });

      // Progress update on every 3rd tool call
      if (toolCallCount % 3 === 0) {
        await addProgressMessage(
          config.analysisId,
          `${config.name} researching (${toolCallCount} queries so far)...`,
          config.name,
        );
      }
    }

    // Add tool results as user message (Anthropic API format)
    messages.push({ role: "user", content: toolResults });
  }

  // Safety cap reached — extract whatever the agent has said
  const lastAssistant = messages.filter((m) => m.role === "assistant").pop();
  const lastText = lastAssistant?.content;
  const report = Array.isArray(lastText)
    ? lastText.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n")
    : "";

  return { report: report || "[Agent reached iteration limit]", toolCallCount, totalInputTokens, totalOutputTokens, iterationCount };
}
