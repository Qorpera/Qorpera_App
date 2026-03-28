/**
 * Per-million-token pricing for supported models.
 * Update when providers change pricing.
 * Prices in USD per million tokens.
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-5.4": { input: 2.00, output: 8.00 },
  "gpt-5.4-mini": { input: 0.40, output: 1.60 },
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o-2024-11-20": { input: 2.50, output: 10.00 },
  "gpt-4.1": { input: 2.00, output: 8.00 },
  "gpt-4.1-mini": { input: 0.40, output: 1.60 },
  "gpt-4.1-nano": { input: 0.10, output: 0.40 },
  "o3-mini": { input: 1.10, output: 4.40 },

  // Anthropic (fallback)
  "claude-opus-4-6-20250415": { input: 5.00, output: 25.00 },
  "claude-sonnet-4-20250514": { input: 3.00, output: 15.00 },
  "claude-haiku-3-5-20241022": { input: 0.80, output: 4.00 },

  // Anthropic (failover targets)
  "claude-sonnet-4-6-20250514": { input: 3.00, output: 15.00 },
  "claude-haiku-4-5-20251001": { input: 1.00, output: 5.00 },
};

/**
 * Calculate cost of an LLM call in cents.
 * Returns 0 if model not found in pricing table (log warning, don't crash).
 */
export function calculateCallCostCents(
  modelId: string,
  usage: { inputTokens: number; outputTokens: number },
): number {
  const pricing = MODEL_PRICING[modelId];
  if (!pricing) {
    console.warn(`[model-pricing] Unknown model "${modelId}" — cost tracked as 0`);
    return 0;
  }
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 100);
}
