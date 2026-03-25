import type Anthropic from "@anthropic-ai/sdk";

const TOKEN_PRUNE = 800_000;
const KEEP_RECENT_ITERATIONS = 10; // Keep last 10 tool result exchanges

export function estimateTokenCount(messages: Anthropic.MessageParam[]): number {
  let chars = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      chars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if ("text" in block && typeof block.text === "string") chars += block.text.length;
        if ("content" in block && typeof block.content === "string") chars += block.content.length;
        if ("input" in block) chars += JSON.stringify(block.input).length;
      }
    }
  }
  return Math.ceil(chars / 3.5); // Conservative estimate
}

export function shouldPrune(messages: Anthropic.MessageParam[]): boolean {
  return estimateTokenCount(messages) > TOKEN_PRUNE;
}

/**
 * Prune old tool results from the conversation.
 * NEVER removes assistant messages (the agent's reasoning and findings).
 * Only removes raw tool_result content from older user messages,
 * replacing with a note that the data was pruned.
 */
export function pruneOldToolResults(messages: Anthropic.MessageParam[]): void {
  // Find all user messages that contain tool_result blocks
  const toolResultIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "user" && Array.isArray(msg.content)) {
      const hasToolResult = msg.content.some(
        (b) => "type" in b && b.type === "tool_result",
      );
      if (hasToolResult) toolResultIndices.push(i);
    }
  }

  // Keep the most recent KEEP_RECENT_ITERATIONS worth of tool results
  const pruneCandidates = toolResultIndices.slice(0, -KEEP_RECENT_ITERATIONS);

  for (const idx of pruneCandidates) {
    const msg = messages[idx];
    if (Array.isArray(msg.content)) {
      messages[idx] = {
        role: "user",
        content: msg.content.map((block) => {
          if ("type" in block && block.type === "tool_result") {
            return {
              ...block,
              content: "[Tool result pruned — findings preserved in agent responses above]",
            } as Anthropic.ToolResultBlockParam;
          }
          return block;
        }),
      };
    }
  }
}
