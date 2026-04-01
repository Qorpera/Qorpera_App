/**
 * Per-million-token pricing for supported models.
 * Update when providers change pricing.
 * Prices in USD per million tokens.
 *
 * This constant serves as a fallback when the database setting is unavailable.
 * Prefer updating pricing via the admin API or seed script.
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-5.4": { input: 2.50, output: 15.00 },
  "gpt-5.4-mini": { input: 0.75, output: 4.50 },
  "gpt-5.4-nano": { input: 0.20, output: 1.25 },
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o-2024-11-20": { input: 2.50, output: 10.00 },
  "gpt-4.1": { input: 2.00, output: 8.00 },
  "gpt-4.1-mini": { input: 0.40, output: 1.60 },
  "gpt-4.1-nano": { input: 0.10, output: 0.40 },
  "o3-mini": { input: 1.10, output: 4.40 },

  // Anthropic
  "claude-opus-4-6": { input: 5.00, output: 25.00 },
  "claude-sonnet-4-6": { input: 3.00, output: 15.00 },
  "claude-sonnet-4-20250514": { input: 3.00, output: 15.00 },
  "claude-haiku-4-5-20251001": { input: 1.00, output: 5.00 },
  "claude-haiku-3-5-20241022": { input: 0.80, output: 4.00 },
};

let cachedPricing: Record<string, { input: number; output: number }> | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export function invalidateModelPricingCache() { cachedPricing = null; cacheExpiry = 0; }

async function getModelPricing(): Promise<Record<string, { input: number; output: number }>> {
  const now = Date.now();
  if (cachedPricing && now < cacheExpiry) return cachedPricing;

  try {
    const { prisma } = await import("@/lib/db");
    const setting = await prisma.appSetting.findFirst({
      where: { key: "modelPricing", operatorId: null },
    });
    if (setting) {
      cachedPricing = JSON.parse(setting.value);
      cacheExpiry = now + CACHE_TTL_MS;
      return cachedPricing!;
    }
  } catch (err) {
    console.warn("[model-pricing] Failed to load from DB, using hardcoded fallback:", err);
  }

  return MODEL_PRICING;
}

/**
 * Calculate cost of an LLM call in cents.
 * Returns 0 if model not found in pricing table (log warning, don't crash).
 */
export async function calculateCallCostCents(
  modelId: string,
  usage: { inputTokens: number; outputTokens: number },
): Promise<number> {
  const pricing = await getModelPricing();
  const modelPricing = pricing[modelId] ?? MODEL_PRICING[modelId];
  if (!modelPricing) {
    console.warn(`[model-pricing] Unknown model "${modelId}" — cost tracked as 0`);
    return 0;
  }
  const inputCost = (usage.inputTokens / 1_000_000) * modelPricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * modelPricing.output;
  return Math.round((inputCost + outputCost) * 100);
}
