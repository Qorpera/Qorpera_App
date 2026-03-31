vi.mock("@/lib/db", () => ({ prisma: {} }));

import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateSituationFee, calculateCopilotFee } from "@/lib/billing-calc";
import { calculateCallCostCents, MODEL_PRICING } from "@/lib/model-pricing";
import { prisma } from "@/lib/db";

// ── Fee Calculation: calculateSituationFee ──────────────────────────────────

describe("calculateSituationFee", () => {
  it("propose (supervised) with multiplier 1.0 → API cost × 2.5", () => {
    const result = calculateSituationFee({
      situationApiCostCents: 100,
      stepApiCostsCents: [],
      autonomyLevel: "supervised",
      orchestrationFeeMultiplier: 1.0,
    });
    // 100 * (1 + 1.5 * 1.0) = 250
    expect(result).toBe(250);
  });

  it("propose (notify) with multiplier 1.0 → same as supervised", () => {
    const result = calculateSituationFee({
      situationApiCostCents: 100,
      stepApiCostsCents: [],
      autonomyLevel: "notify",
      orchestrationFeeMultiplier: 1.0,
    });
    // 100 * (1 + 1.5 * 1.0) = 250
    expect(result).toBe(250);
  });

  it("autonomous with multiplier 1.0 → API cost × 4.0", () => {
    const result = calculateSituationFee({
      situationApiCostCents: 100,
      stepApiCostsCents: [],
      autonomyLevel: "autonomous",
      orchestrationFeeMultiplier: 1.0,
    });
    // 100 * (1 + 3.0 * 1.0) = 400
    expect(result).toBe(400);
  });

  it("propose with multiplier 0.50 (discount)", () => {
    const result = calculateSituationFee({
      situationApiCostCents: 100,
      stepApiCostsCents: [],
      autonomyLevel: "supervised",
      orchestrationFeeMultiplier: 0.50,
    });
    // 100 * (1 + 1.5 * 0.5) = 175
    expect(result).toBe(175);
  });

  it("notify with multiplier 0.50 → same as supervised", () => {
    const result = calculateSituationFee({
      situationApiCostCents: 100,
      stepApiCostsCents: [],
      autonomyLevel: "notify",
      orchestrationFeeMultiplier: 0.50,
    });
    // 100 * (1 + 1.5 * 0.5) = 175
    expect(result).toBe(175);
  });

  it("autonomous with multiplier 0.50 → half fee", () => {
    const result = calculateSituationFee({
      situationApiCostCents: 100,
      stepApiCostsCents: [],
      autonomyLevel: "autonomous",
      orchestrationFeeMultiplier: 0.50,
    });
    // 100 * (1 + 3.0 * 0.5) = 250
    expect(result).toBe(250);
  });

  it("multi-step situation: reasoning 50 + 3 steps × 20 = 110 total API cost", () => {
    const result = calculateSituationFee({
      situationApiCostCents: 50,
      stepApiCostsCents: [20, 20, 20],
      autonomyLevel: "supervised",
      orchestrationFeeMultiplier: 1.0,
    });
    // total = 50 + 60 = 110, fee = 110 * (1 + 1.5) = 275
    expect(result).toBe(275);
  });

  it("zero API cost → zero fee", () => {
    const result = calculateSituationFee({
      situationApiCostCents: 0,
      stepApiCostsCents: [],
      autonomyLevel: "autonomous",
      orchestrationFeeMultiplier: 1.0,
    });
    expect(result).toBe(0);
  });

  it("unknown autonomy level falls back to 1.0 multiplier", () => {
    const result = calculateSituationFee({
      situationApiCostCents: 100,
      stepApiCostsCents: [],
      autonomyLevel: "unknown_level",
      orchestrationFeeMultiplier: 1.0,
    });
    // Fallback: 100 * (1 + 1.0 * 1.0) = 200
    expect(result).toBe(200);
  });
});

// ── Fee Calculation: calculateCopilotFee ────────────────────────────────────

describe("calculateCopilotFee", () => {
  it("multiplier 1.0 → API cost × 2.5", () => {
    const result = calculateCopilotFee({
      apiCostCents: 100,
      orchestrationFeeMultiplier: 1.0,
    });
    // 100 * (1 + 1.5 * 1.0) = 250
    expect(result).toBe(250);
  });

  it("multiplier 0.50 → API cost × 1.75", () => {
    const result = calculateCopilotFee({
      apiCostCents: 100,
      orchestrationFeeMultiplier: 0.50,
    });
    // 100 * (1 + 1.5 * 0.5) = 175
    expect(result).toBe(175);
  });
});

// ── Model Pricing: calculateCallCostCents ───────────────────────────────────

describe("calculateCallCostCents", () => {
  it("known model with known tokens → correct cents", () => {
    // gpt-5.4: input $2.00/M, output $8.00/M
    // 1000 input tokens = 0.002 USD, 500 output tokens = 0.004 USD
    // total = 0.006 USD = 0.6 cents → rounds to 1
    const result = calculateCallCostCents("gpt-5.4", {
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(result).toBe(1);
  });

  it("larger token counts produce correct cost", () => {
    // gpt-5.4: input $2.50/M, output $15.00/M
    // 100,000 input = 0.25 USD, 50,000 output = 0.75 USD
    // total = 1.00 USD = 100 cents
    const result = calculateCallCostCents("gpt-5.4", {
      inputTokens: 100_000,
      outputTokens: 50_000,
    });
    expect(result).toBe(100);
  });

  it("unknown model → returns 0 and warns", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = calculateCallCostCents("unknown-model-xyz", {
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(result).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown model "unknown-model-xyz"'),
    );
    warnSpy.mockRestore();
  });

  it("zero tokens → 0 cents", () => {
    const result = calculateCallCostCents("gpt-5.4", {
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(result).toBe(0);
  });

  it("rounding: fractional cents round correctly", () => {
    // gpt-4o-mini: input $0.15/M, output $0.60/M
    // 3333 input = 0.00049995 USD, 1666 output = 0.0009996 USD
    // total = 0.00149955 USD = 0.149955 cents → rounds to 0
    const result = calculateCallCostCents("gpt-4o-mini", {
      inputTokens: 3333,
      outputTokens: 1666,
    });
    expect(result).toBe(0);

    // With more tokens to get fractional rounding
    // gpt-4o: input $2.50/M, output $10.00/M
    // 5000 input = 0.0125 USD, 3000 output = 0.03 USD
    // total = 0.0425 USD = 4.25 cents → rounds to 4
    const result2 = calculateCallCostCents("gpt-4o", {
      inputTokens: 5000,
      outputTokens: 3000,
    });
    expect(result2).toBe(4);
  });

  it("MODEL_PRICING includes all models used in routes", () => {
    expect(MODEL_PRICING["gpt-5.4"]).toBeDefined();
    expect(MODEL_PRICING["gpt-5.4-mini"]).toBeDefined();
    expect(MODEL_PRICING["claude-sonnet-4-20250514"]).toBeDefined();
  });
});

// ── AppSettings Isolation ───────────────────────────────────────────────────

const mockPrisma = prisma as unknown as {
  appSetting: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

describe("getOperatorSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.appSetting = {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    };
  });

  it("returns operator-specific settings when they exist", async () => {
    const { getOperatorSettings } = await import("@/lib/operator-settings");

    mockPrisma.appSetting.findMany.mockResolvedValue([
      { key: "ai_provider", value: "ollama", operatorId: null },
      { key: "ai_provider", value: "openai", operatorId: "op1" },
    ]);

    const map = await getOperatorSettings("op1", ["ai_provider"]);
    expect(map.get("ai_provider")).toBe("openai");
  });

  it("falls back to global when no operator-specific setting exists", async () => {
    const { getOperatorSettings } = await import("@/lib/operator-settings");

    mockPrisma.appSetting.findMany.mockResolvedValue([
      { key: "ai_provider", value: "anthropic", operatorId: null },
    ]);

    const map = await getOperatorSettings("op2", ["ai_provider"]);
    expect(map.get("ai_provider")).toBe("anthropic");
  });

  it("two operators get independent settings", async () => {
    const { getOperatorSettings } = await import("@/lib/operator-settings");

    // Op1 query
    mockPrisma.appSetting.findMany.mockResolvedValueOnce([
      { key: "ai_model", value: "gpt-5.4", operatorId: null },
      { key: "ai_model", value: "gpt-5.4-mini", operatorId: "op1" },
    ]);

    // Op2 query
    mockPrisma.appSetting.findMany.mockResolvedValueOnce([
      { key: "ai_model", value: "gpt-5.4", operatorId: null },
      { key: "ai_model", value: "claude-sonnet-4-20250514", operatorId: "op2" },
    ]);

    const map1 = await getOperatorSettings("op1", ["ai_model"]);
    const map2 = await getOperatorSettings("op2", ["ai_model"]);

    expect(map1.get("ai_model")).toBe("gpt-5.4-mini");
    expect(map2.get("ai_model")).toBe("claude-sonnet-4-20250514");
  });
});
