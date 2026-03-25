vi.mock("@/lib/db", () => ({ prisma: {} }));

const mockOpenAICreate = vi.fn();
vi.mock("openai", () => ({
  default: class MockOpenAI {
    responses = { create: mockOpenAICreate };
    constructor() {}
  },
}));

const mockAnthropicCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockAnthropicCreate };
    constructor() {}
  },
}));

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";

// ── Setup ────────────────────────────────────────────────────────────────────

const mockPrisma = prisma as unknown as {
  appSetting: { findMany: ReturnType<typeof vi.fn> };
  operator: { findUnique: ReturnType<typeof vi.fn> };
};

const originalEnv = { ...process.env };

function configureOpenAIProvider() {
  mockPrisma.appSetting = {
    findMany: vi.fn().mockResolvedValue([
      { key: "ai_provider", value: "openai", operatorId: null },
      { key: "ai_api_key", value: "test-openai-key", operatorId: null },
    ]),
  };
}

function openaiSuccessResponse(text = "OpenAI response") {
  return {
    output_text: text,
    output: [],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

function anthropicSuccessResponse(text = "Anthropic response") {
  return {
    content: [{ type: "text", text }],
    usage: { input_tokens: 80, output_tokens: 40 },
    model: "claude-sonnet-4-6-20250514",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  configureOpenAIProvider();
  mockPrisma.operator = { findUnique: vi.fn().mockResolvedValue({ aiResponseStore: false }) };
  mockOpenAICreate.mockResolvedValue(openaiSuccessResponse());
  mockAnthropicCreate.mockResolvedValue(anthropicSuccessResponse());
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  delete process.env.WORKER_URL;
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.useRealTimers();
});

// ── Provider Routing ────────────────────────────────────────────────────────

describe("provider routing", () => {
  it("routes to OpenAI when under concurrency limit", async () => {
    const result = await callLLM({
      messages: [{ role: "user", content: "Hello" }],
      model: "gpt-5.4",
    });

    expect(mockOpenAICreate).toHaveBeenCalledOnce();
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(result.text).toBe("OpenAI response");
  });

  it("routes to Anthropic when OpenAI concurrency is at limit", async () => {
    // Fill OpenAI concurrency by creating 8 concurrent calls that block
    const blockers: Array<{ resolve: () => void }> = [];
    for (let i = 0; i < 8; i++) {
      const blocker = { resolve: () => {} };
      blockers.push(blocker);
      mockOpenAICreate.mockImplementationOnce(
        () => new Promise<ReturnType<typeof openaiSuccessResponse>>((resolve) => {
          blocker.resolve = () => resolve(openaiSuccessResponse());
        }),
      );
    }

    // Start 8 blocking calls (fills OpenAI capacity)
    const blockingCalls = blockers.map(() =>
      callLLM({ messages: [{ role: "user", content: "Block" }], model: "gpt-5.4" }),
    );

    // Wait for all blocking calls to be in-flight
    await new Promise((r) => setTimeout(r, 50));

    // 9th call should route to Anthropic
    const overflowResult = await callLLM({
      messages: [{ role: "user", content: "Overflow" }],
      model: "gpt-5.4",
    });

    expect(mockAnthropicCreate).toHaveBeenCalledOnce();
    expect(overflowResult.text).toBe("Anthropic response");

    // Clean up blocking calls
    blockers.forEach((b) => b.resolve());
    await Promise.all(blockingCalls);
  });

  it("routes to OpenAI when ANTHROPIC_API_KEY is not set (no failover)", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await callLLM({
      messages: [{ role: "user", content: "Hello" }],
      model: "gpt-5.4",
    });

    expect(mockOpenAICreate).toHaveBeenCalledOnce();
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(result.text).toBe("OpenAI response");
  });

  it("routes to OpenAI when model has no Anthropic mapping", async () => {
    await callLLM({
      messages: [{ role: "user", content: "Hello" }],
      model: "gpt-4o",
    });

    expect(mockOpenAICreate).toHaveBeenCalledOnce();
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });
});

// ── Error Failover ──────────────────────────────────────────────────────────
// withRetry retries 429/500/502/503/504 with exponential backoff before the
// error reaches callLLM's failover catch block. To test failover quickly, we
// use status 529 which is retryable per isRetryableError (5xx range) but NOT
// in withRetry's default retryableStatuses, so it passes through immediately.

describe("error failover", () => {
  it("fails over to Anthropic on retryable 5xx error", async () => {
    // 529 bypasses withRetry's retry (not in its default list) but triggers failover
    const err5xx = Object.assign(new Error("server overloaded"), { status: 529 });
    mockOpenAICreate.mockRejectedValueOnce(err5xx);

    const result = await callLLM({
      messages: [{ role: "user", content: "Hello" }],
      model: "gpt-5.4",
    });

    expect(mockOpenAICreate).toHaveBeenCalledOnce();
    expect(mockAnthropicCreate).toHaveBeenCalledOnce();
    expect(result.text).toBe("Anthropic response");
  });

  it("fails over on 429 after withRetry exhausts retries", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const err429 = Object.assign(new Error("rate limited"), { status: 429 });
    // Must reject all 4 attempts (initial + 3 retries)
    mockOpenAICreate.mockRejectedValue(err429);

    const promise = callLLM({
      messages: [{ role: "user", content: "Hello" }],
      model: "gpt-5.4",
    });

    // Advance past all retry delays (1s + 2s + 4s)
    await vi.advanceTimersByTimeAsync(10_000);

    const result = await promise;

    expect(mockAnthropicCreate).toHaveBeenCalledOnce();
    expect(result.text).toBe("Anthropic response");
  });

  it("does NOT failover on OpenAI 400 (bad request)", async () => {
    const err400 = Object.assign(new Error("bad request"), { status: 400 });
    mockOpenAICreate.mockRejectedValueOnce(err400);

    await expect(
      callLLM({ messages: [{ role: "user", content: "Hello" }], model: "gpt-5.4" }),
    ).rejects.toThrow("bad request");

    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it("does NOT failover on OpenAI 401 (auth failure)", async () => {
    const err401 = Object.assign(new Error("unauthorized"), { status: 401 });
    mockOpenAICreate.mockRejectedValueOnce(err401);

    await expect(
      callLLM({ messages: [{ role: "user", content: "Hello" }], model: "gpt-5.4" }),
    ).rejects.toThrow("unauthorized");

    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it("does NOT failover when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    // 529 bypasses withRetry
    const err5xx = Object.assign(new Error("server overloaded"), { status: 529 });
    mockOpenAICreate.mockRejectedValueOnce(err5xx);

    await expect(
      callLLM({ messages: [{ role: "user", content: "Hello" }], model: "gpt-5.4" }),
    ).rejects.toThrow("server overloaded");

    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });
});

// ── Response Translation ────────────────────────────────────────────────────

describe("Anthropic response translation", () => {
  it("returns correct LLMResponse shape with text", async () => {
    // Use 529 to trigger immediate failover
    const err5xx = Object.assign(new Error("overloaded"), { status: 529 });
    mockOpenAICreate.mockRejectedValueOnce(err5xx);

    const result = await callLLM({
      messages: [{ role: "user", content: "Hello" }],
      model: "gpt-5.4",
    });

    expect(result).toMatchObject({
      text: "Anthropic response",
      usage: { inputTokens: 80, outputTokens: 40 },
    });
    expect(result.modelId).toBe("claude-sonnet-4-6-20250514");
    expect(typeof result.apiCostCents).toBe("number");
  });

  it("translates tool_use blocks in Anthropic response", async () => {
    const err5xx = Object.assign(new Error("overloaded"), { status: 529 });
    mockOpenAICreate.mockRejectedValueOnce(err5xx);

    mockAnthropicCreate.mockResolvedValueOnce({
      content: [
        { type: "text", text: "Let me check" },
        { type: "tool_use", id: "tu_1", name: "get_weather", input: { city: "NYC" } },
      ],
      usage: { input_tokens: 50, output_tokens: 30 },
    });

    const result = await callLLM({
      messages: [{ role: "user", content: "Weather?" }],
      model: "gpt-5.4",
      tools: [{ name: "get_weather", description: "Get weather", parameters: { type: "object", properties: { city: { type: "string" } } } }],
    });

    expect(result.text).toBe("Let me check");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0]).toEqual({
      id: "tu_1",
      name: "get_weather",
      arguments: { city: "NYC" },
    });
  });
});

// ── Concurrency Counter Correctness ────────────────────────────────────────

describe("concurrency counters", () => {
  it("decrements OpenAI counter on success (sequential calls work)", async () => {
    // If counter leaked, these would eventually overflow to Anthropic.
    // 10 sequential calls should all go to OpenAI.
    for (let i = 0; i < 10; i++) {
      await callLLM({ messages: [{ role: "user", content: "Hello" }], model: "gpt-5.4" });
    }

    expect(mockOpenAICreate).toHaveBeenCalledTimes(10);
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it("decrements OpenAI counter on non-retryable error", async () => {
    const err400 = Object.assign(new Error("bad request"), { status: 400 });
    mockOpenAICreate.mockRejectedValueOnce(err400);

    await callLLM({ messages: [{ role: "user", content: "Hello" }], model: "gpt-5.4" }).catch(() => {});

    // Counter should be back to 0, next call goes to OpenAI
    mockOpenAICreate.mockResolvedValueOnce(openaiSuccessResponse());
    await callLLM({ messages: [{ role: "user", content: "Hello" }], model: "gpt-5.4" });
    expect(mockOpenAICreate).toHaveBeenCalledTimes(2);
  });

  it("decrements Anthropic counter after failover completes", async () => {
    // Trigger 8 failovers, then verify counter is back to 0
    for (let i = 0; i < 8; i++) {
      const err5xx = Object.assign(new Error("overloaded"), { status: 529 });
      mockOpenAICreate.mockRejectedValueOnce(err5xx);
    }

    for (let i = 0; i < 8; i++) {
      await callLLM({ messages: [{ role: "user", content: "Hello" }], model: "gpt-5.4" });
    }

    // All 8 should have failed over to Anthropic
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(8);

    // Next call should go to OpenAI (counters reset)
    mockOpenAICreate.mockResolvedValueOnce(openaiSuccessResponse());
    const result = await callLLM({ messages: [{ role: "user", content: "Hello" }], model: "gpt-5.4" });
    expect(result.text).toBe("OpenAI response");
  });
});

// ── Cost Tracking ──────────────────────────────────────────────────────────

describe("cost tracking", () => {
  it("uses Anthropic model pricing for failover calls", async () => {
    const err5xx = Object.assign(new Error("overloaded"), { status: 529 });
    mockOpenAICreate.mockRejectedValueOnce(err5xx);

    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Response" }],
      usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    });

    const result = await callLLM({
      messages: [{ role: "user", content: "Hello" }],
      model: "gpt-5.4",
    });

    // claude-sonnet-4-6-20250514: $3.00/M input + $15.00/M output = $18.00 = 1800 cents
    expect(result.apiCostCents).toBe(1800);
    expect(result.modelId).toBe("claude-sonnet-4-6-20250514");
  });

  it("uses gpt-5.4-mini → claude-haiku mapping and pricing", async () => {
    const err5xx = Object.assign(new Error("overloaded"), { status: 529 });
    mockOpenAICreate.mockRejectedValueOnce(err5xx);

    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Response" }],
      usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    });

    const result = await callLLM({
      messages: [{ role: "user", content: "Hello" }],
      model: "gpt-5.4-mini",
    });

    // claude-haiku-4-5-20251001: $1.00/M input + $5.00/M output = $6.00 = 600 cents
    expect(result.apiCostCents).toBe(600);
    expect(result.modelId).toBe("claude-haiku-4-5-20251001");
  });
});

// ── Web Search Graceful Degradation ────────────────────────────────────────

describe("web search graceful degradation", () => {
  it("completes without error when webSearch call fails over to Anthropic", async () => {
    const err5xx = Object.assign(new Error("overloaded"), { status: 529 });
    mockOpenAICreate.mockRejectedValueOnce(err5xx);

    const result = await callLLM({
      messages: [{ role: "user", content: "Search for something" }],
      model: "gpt-5.4",
      webSearch: true,
    });

    // Should succeed without web search
    expect(result.text).toBe("Anthropic response");
    expect(result.webSources).toBeUndefined();
  });
});
