import { describe, it, expect } from "vitest";
import { MODEL_PRICING, calculateCallCostCents } from "@/lib/model-pricing";

describe("MODEL_PRICING", () => {
  it("has correct Opus 4.6 pricing ($5/$25, not legacy $15/$75)", () => {
    const opus = MODEL_PRICING["claude-opus-4-6-20250415"];
    expect(opus).toBeDefined();
    expect(opus.input).toBe(5.00);
    expect(opus.output).toBe(25.00);
  });

  it("has correct Sonnet 4.6 pricing ($3/$15)", () => {
    const sonnet = MODEL_PRICING["claude-sonnet-4-20250514"];
    expect(sonnet).toBeDefined();
    expect(sonnet.input).toBe(3.00);
    expect(sonnet.output).toBe(15.00);
  });

  it("calculates Opus cost correctly", () => {
    // 100K input + 20K output at $5/$25
    const cost = calculateCallCostCents("claude-opus-4-6-20250415", { inputTokens: 100_000, outputTokens: 20_000 });
    // (100K/1M × 5.00 + 20K/1M × 25.00) × 100 = (0.50 + 0.50) × 100 = 100 cents
    expect(cost).toBe(100);
  });
});
