import Anthropic from "@anthropic-ai/sdk";
import { executeTool, getToolsForAgent } from "@/lib/onboarding-intelligence/tools/registry";
import type { ToolContext } from "@/lib/onboarding-intelligence/types";
import { addProgressMessage } from "@/lib/onboarding-intelligence/progress";
import { estimateTokenCount, shouldPrune, pruneOldToolResults } from "./context-manager";
import { getModel, getMaxOutputTokens } from "@/lib/ai-provider";

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  initialContext: string;     // Round 0 preamble + any follow-up brief
  maxIterations: number;      // Safety cap (100 for Round 1, 50 for Round 2, 30 for Round 3)
  analysisId: string;
  operatorId: string;
  toolContext: ToolContext;
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
  const model = getModel("onboardingAgent");

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

    const response = await client.messages.create({
      model,
      max_tokens: getMaxOutputTokens(model),
      system: config.systemPrompt,
      messages,
      tools: anthropicTools,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

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
