vi.mock("@/lib/db", () => ({ prisma: {} }));

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db";

// We need to mock OpenAI SDK before importing ai-provider
const mockCreate = vi.fn();
vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      responses = { create: mockCreate };
      constructor() {}
    },
  };
});

import { callLLM, streamLLM, getModel, getAIConfig, withRetry } from "@/lib/ai-provider";

// ── Setup ────────────────────────────────────────────────────────────────────

const mockPrisma = prisma as unknown as {
  appSetting: { findMany: ReturnType<typeof vi.fn> };
  operator: { findUnique: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();

  // Default: OpenAI provider configured
  mockPrisma.appSetting = { findMany: vi.fn().mockResolvedValue([
    { key: "ai_provider", value: "openai", operatorId: null },
    { key: "ai_api_key", value: "test-key-123", operatorId: null },
  ]) };

  mockPrisma.operator = { findUnique: vi.fn().mockResolvedValue({ aiResponseStore: false }) };

  // Default mock response
  mockCreate.mockResolvedValue({
    output_text: "Hello world",
    output: [],
    usage: { input_tokens: 10, output_tokens: 5 },
  });
});

// ── Model Routing ────────────────────────────────────────────────────────────

describe("getModel", () => {
  it("returns gpt-5.4 for situationReasoning", () => {
    expect(getModel("situationReasoning")).toBe("gpt-5.4");
  });

  it("returns gpt-5.4-mini for contentDetection", () => {
    expect(getModel("contentDetection")).toBe("gpt-5.4-mini");
  });

  it("returns gpt-5.4 for executionGenerate", () => {
    expect(getModel("executionGenerate")).toBe("gpt-5.4");
  });

  it("returns gpt-5.4 for copilot", () => {
    expect(getModel("copilot")).toBe("gpt-5.4");
  });

  it("returns gpt-5.4 for insightExtraction", () => {
    expect(getModel("insightExtraction")).toBe("gpt-5.4");
  });

  it("returns text-embedding-3-small for embedding", () => {
    expect(getModel("embedding")).toBe("text-embedding-3-small");
  });
});

// ── callLLM — message translation ────────────────────────────────────────────

describe("callLLM — message translation", () => {
  it("passes instructions as top-level param, not in input array", async () => {
    await callLLM({
      instructions: "You are a helpful assistant",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(mockCreate).toHaveBeenCalledOnce();
    const params = mockCreate.mock.calls[0][0];
    expect(params.instructions).toBe("You are a helpful assistant");

    // Verify no system role in input
    const inputRoles = params.input
      .filter((i: Record<string, unknown>) => i.role)
      .map((i: Record<string, unknown>) => i.role);
    expect(inputRoles).not.toContain("system");
  });

  it("converts user messages to input_text format", async () => {
    await callLLM({
      messages: [{ role: "user", content: "Hello" }],
    });

    const params = mockCreate.mock.calls[0][0];
    const userMsg = params.input.find((i: Record<string, unknown>) => i.role === "user");
    expect(userMsg).toBeDefined();
    expect(userMsg.content[0]).toEqual({ type: "input_text", text: "Hello" });
  });
});

// ── callLLM — web search ─────────────────────────────────────────────────────

describe("callLLM — web search", () => {
  it("includes web_search tool when webSearch is true", async () => {
    await callLLM({
      messages: [{ role: "user", content: "Search for something" }],
      webSearch: true,
    });

    const params = mockCreate.mock.calls[0][0];
    expect(params.tools).toEqual(
      expect.arrayContaining([{ type: "web_search" }]),
    );
  });

  it("does NOT include web_search when webSearch is false", async () => {
    await callLLM({
      messages: [{ role: "user", content: "No search" }],
      webSearch: false,
    });

    const params = mockCreate.mock.calls[0][0];
    expect(params.tools).toBeUndefined();
  });

  it("does NOT include web_search when webSearch is omitted", async () => {
    await callLLM({
      messages: [{ role: "user", content: "No search" }],
    });

    const params = mockCreate.mock.calls[0][0];
    expect(params.tools).toBeUndefined();
  });
});

// ── callLLM — thinking mode ──────────────────────────────────────────────────

describe("callLLM — thinking mode", () => {
  it("passes reasoning.effort when thinking is true", async () => {
    await callLLM({
      messages: [{ role: "user", content: "Think hard" }],
      thinking: true,
    });

    const params = mockCreate.mock.calls[0][0];
    expect(params.reasoning).toEqual({ effort: "high" });
  });

  it("drops temperature when thinking is true", async () => {
    await callLLM({
      messages: [{ role: "user", content: "Think" }],
      thinking: true,
      temperature: 0.2,
    });

    const params = mockCreate.mock.calls[0][0];
    expect(params.reasoning).toEqual({ effort: "high" });
    expect(params.temperature).toBeUndefined();
  });

  it("passes temperature when thinking is false", async () => {
    await callLLM({
      messages: [{ role: "user", content: "Quick" }],
      thinking: false,
      temperature: 0.3,
    });

    const params = mockCreate.mock.calls[0][0];
    expect(params.temperature).toBe(0.3);
    expect(params.reasoning).toBeUndefined();
  });
});

// ── callLLM — store parameter ────────────────────────────────────────────────

describe("callLLM — store parameter", () => {
  it("reads store from operator settings when not explicitly set", async () => {
    mockPrisma.operator.findUnique = vi.fn().mockResolvedValue({ aiResponseStore: true });

    await callLLM({
      messages: [{ role: "user", content: "Test" }],
      operatorId: "op1",
    });

    const params = mockCreate.mock.calls[0][0];
    expect(params.store).toBe(true);
  });

  it("respects explicit store: false override even when operator has true", async () => {
    mockPrisma.operator.findUnique = vi.fn().mockResolvedValue({ aiResponseStore: true });

    await callLLM({
      messages: [{ role: "user", content: "Test" }],
      operatorId: "op1",
      store: false,
    });

    const params = mockCreate.mock.calls[0][0];
    expect(params.store).toBe(false);
  });

  it("defaults store to false when no operatorId provided", async () => {
    await callLLM({
      messages: [{ role: "user", content: "Test" }],
    });

    const params = mockCreate.mock.calls[0][0];
    expect(params.store).toBe(false);
  });
});

// ── callLLM — response parsing ───────────────────────────────────────────────

describe("callLLM — response parsing", () => {
  it("extracts text from output_text", async () => {
    mockCreate.mockResolvedValue({
      output_text: "The answer is 42",
      output: [],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const result = await callLLM({
      messages: [{ role: "user", content: "Question" }],
    });

    expect(result.text).toBe("The answer is 42");
  });

  it("extracts function calls from output", async () => {
    mockCreate.mockResolvedValue({
      output_text: "",
      output: [
        { type: "function_call", id: "fc1", call_id: "fc1", name: "get_weather", arguments: '{"city":"NYC"}' },
      ],
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    const result = await callLLM({
      messages: [{ role: "user", content: "Weather?" }],
    });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0].name).toBe("get_weather");
    expect(result.toolCalls![0].arguments).toEqual({ city: "NYC" });
  });

  it("extracts web sources from web_search_call output", async () => {
    mockCreate.mockResolvedValue({
      output_text: "Result with sources",
      output: [
        {
          type: "web_search_call",
          id: "ws1",
          status: "completed",
          action: {
            type: "search",
            query: "test",
            sources: [
              { type: "url", url: "https://example.com" },
              { type: "url", url: "https://other.com" },
            ],
          },
        },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const result = await callLLM({
      messages: [{ role: "user", content: "Search" }],
      webSearch: true,
    });

    expect(result.webSources).toHaveLength(2);
    expect(result.webSources![0].url).toBe("https://example.com");
    expect(result.webSources![1].url).toBe("https://other.com");
  });

  it("extracts usage tokens", async () => {
    mockCreate.mockResolvedValue({
      output_text: "Response",
      output: [],
      usage: { input_tokens: 150, output_tokens: 75 },
    });

    const result = await callLLM({
      messages: [{ role: "user", content: "Q" }],
    });

    expect(result.usage).toEqual({ inputTokens: 150, outputTokens: 75 });
  });
});

// ── callLLM — error handling ─────────────────────────────────────────────────

describe("callLLM — error handling", () => {
  it("propagates SDK errors", async () => {
    mockCreate.mockRejectedValue(new Error("API rate limit exceeded"));

    await expect(
      callLLM({ messages: [{ role: "user", content: "Test" }] }),
    ).rejects.toThrow("API rate limit exceeded");
  });
});

// ── streamLLM ────────────────────────────────────────────────────────────────

describe("streamLLM", () => {
  it("yields text deltas from stream events", async () => {
    // Mock async iterable
    const events = [
      { type: "response.output_text.delta", delta: "Hello" },
      { type: "response.output_text.delta", delta: " world" },
      { type: "response.completed", response: {} },
    ];

    mockCreate.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        for (const event of events) yield event;
      },
    });

    const chunks: string[] = [];
    for await (const chunk of streamLLM({
      messages: [{ role: "user", content: "Test" }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hello", " world"]);
  });
});

// ── withRetry ─────────────────────────────────────────────────────────────────

describe("withRetry", () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Zero jitter so delays are deterministic and tiny with baseDelayMs: 1
    randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it("succeeds on first try without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await withRetry(fn);

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("retries on 429 then succeeds", async () => {
    const err429 = Object.assign(new Error("rate limited"), { status: 429 });
    const fn = vi.fn()
      .mockRejectedValueOnce(err429)
      .mockResolvedValueOnce("ok");

    const result = await withRetry(fn, { baseDelayMs: 1 });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 500/502/503/504", async () => {
    for (const status of [500, 502, 503, 504]) {
      const err = Object.assign(new Error(`error ${status}`), { status });
      const fn = vi.fn()
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce("ok");

      const result = await withRetry(fn, { baseDelayMs: 1 });

      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    }
  });

  it("gives up after maxRetries", async () => {
    const err429 = Object.assign(new Error("rate limited"), { status: 429 });
    const fn = vi.fn().mockRejectedValue(err429);

    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 1 })).rejects.toThrow("rate limited");
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("does not retry non-retryable errors (400, 401, 403)", async () => {
    for (const status of [400, 401, 403]) {
      const err = Object.assign(new Error(`error ${status}`), { status });
      const fn = vi.fn().mockRejectedValue(err);

      await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow(`error ${status}`);
      expect(fn).toHaveBeenCalledOnce();
    }
  });

  it("does not retry errors without a status property", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("network failure"));

    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow("network failure");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("respects Retry-After header", async () => {
    const headers = { get: (k: string) => k === "retry-after" ? "1" : null };
    const err429 = Object.assign(new Error("rate limited"), { status: 429, headers });
    const fn = vi.fn()
      .mockRejectedValueOnce(err429)
      .mockResolvedValueOnce("ok");

    const result = await withRetry(fn, { baseDelayMs: 1 });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
