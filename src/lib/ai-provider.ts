import OpenAI from "openai";
import type { ResponseCreateParamsNonStreaming, ResponseCreateParamsStreaming } from "openai/resources/responses/responses";
import { prisma } from "@/lib/db";
import { calculateCallCostCents } from "@/lib/model-pricing";

// ── Content Block Types ─────────────────────────────────────────────────────

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image_base64"; mediaType: string; data: string };

// ── Model Routing ───────────────────────────────────────────────────────────

const MODEL_ROUTES = {
  situationReasoning: "gpt-5.4",
  initiativeReasoning: "gpt-5.4",
  copilot: "gpt-5.4",
  contentDetection: "gpt-5.4-mini",
  insightExtraction: "gpt-5.4",
  executionGenerate: "gpt-5.4",
  embedding: "text-embedding-3-small",
  onboardingIntelligence: "gpt-5.4",
  onboardingMemory: "gpt-5.4-mini",
} as const;

export type ModelRoute = keyof typeof MODEL_ROUTES;

export function getModel(route: ModelRoute): string {
  return MODEL_ROUTES[route];
}

// ── Types ────────────────────────────────────────────────────────────────────

export type LLMMessage = {
  role: "user" | "assistant" | "tool";
  content: string | ContentBlock[];
  // Tool calling fields (for multi-turn tool use in copilot)
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

// Keep backward-compatible alias
export type AIMessage = LLMMessage | { role: "system"; content: string | ContentBlock[] };

export type AITool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AIFunction = "reasoning" | "copilot" | "embedding" | "orientation";

export interface LLMRequestOptions {
  operatorId?: string;
  model?: string;
  instructions?: string;
  messages: LLMMessage[];
  tools?: AITool[];
  webSearch?: boolean;
  store?: boolean;
  responseFormat?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  thinking?: boolean;
  aiFunction?: AIFunction;
}

export interface LLMResponse {
  text: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  apiCostCents: number;
  webSources?: Array<{
    url: string;
    title: string;
    snippet: string;
  }>;
}

type AIConfig = {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model: string;
};

// ── Config ───────────────────────────────────────────────────────────────────

export async function getAIConfig(aiFunction?: AIFunction, operatorId?: string): Promise<AIConfig> {
  const keysToFetch = ["ai_provider", "ai_api_key", "ai_base_url", "ai_model"];
  if (aiFunction) {
    keysToFetch.push(
      `ai_${aiFunction}_provider`,
      `ai_${aiFunction}_key`,
      `ai_${aiFunction}_model`,
    );
  }

  let map: Map<string, string>;
  if (operatorId) {
    const { getOperatorSettings } = await import("@/lib/operator-settings");
    map = await getOperatorSettings(operatorId, keysToFetch);
  } else {
    const settings = await prisma.appSetting.findMany({
      where: { key: { in: keysToFetch }, operatorId: null },
    });
    map = new Map(settings.map((s) => [s.key, s.value]));
  }

  const provider =
    (aiFunction && map.get(`ai_${aiFunction}_provider`)) ||
    map.get("ai_provider") ||
    process.env.AI_PROVIDER ||
    "ollama";
  const apiKey =
    (aiFunction && map.get(`ai_${aiFunction}_key`)) ||
    map.get("ai_api_key") ||
    process.env.AI_API_KEY;
  const baseUrl = map.get("ai_base_url") || defaultBaseUrlForProvider(provider);
  const model =
    (aiFunction && map.get(`ai_${aiFunction}_model`)) ||
    map.get("ai_model") ||
    process.env.AI_MODEL ||
    defaultModelForProvider(provider);

  return { provider, apiKey, baseUrl, model };
}

function defaultBaseUrlForProvider(provider: string): string {
  switch (provider) {
    case "openai":
      return "https://api.openai.com/v1";
    case "anthropic":
      return "https://api.anthropic.com/v1";
    case "ollama":
      return "http://localhost:11434";
    default:
      return "http://localhost:11434";
  }
}

function defaultModelForProvider(provider: string): string {
  switch (provider) {
    case "openai":
      return "gpt-5.4";
    case "anthropic":
      return "claude-sonnet-4-20250514";
    case "ollama":
      return "llama3.2";
    default:
      return "llama3.2";
  }
}

// ── Resolve store setting ────────────────────────────────────────────────────

async function resolveStoreSetting(options: LLMRequestOptions): Promise<boolean> {
  if (options.store !== undefined) return options.store;
  if (!options.operatorId) return false;
  try {
    const operator = await prisma.operator.findUnique({
      where: { id: options.operatorId },
      select: { aiResponseStore: true },
    });
    return operator?.aiResponseStore ?? false;
  } catch {
    return false;
  }
}

// ── Retry with Exponential Backoff ────────────────────────────────────────────

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number; retryableStatuses?: number[] } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, retryableStatuses = [429, 500, 502, 503, 504] } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      const isRetryable = status && retryableStatuses.includes(status);

      if (!isRetryable || attempt === maxRetries) throw error;

      // Exponential backoff with jitter
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;

      // Respect Retry-After header if present
      const retryAfter = (error as { headers?: { get?: (k: string) => string | null } })?.headers?.get?.("retry-after");
      const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : null;

      const waitMs = retryAfterMs && retryAfterMs > 0 ? Math.min(retryAfterMs, 60000) : delay;
      console.warn(`[ai-provider] Retrying after ${Math.round(waitMs)}ms (attempt ${attempt + 1}/${maxRetries}, status ${status})`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw new Error("withRetry: unreachable");
}

// ── Main Call ─────────────────────────────────────────────────────────────────

export async function callLLM(options: LLMRequestOptions): Promise<LLMResponse> {
  const config = await getAIConfig(options.aiFunction, options.operatorId);
  const model = options.model || config.model;

  switch (config.provider) {
    case "openai":
      return callOpenAIResponses(config, model, options);
    case "anthropic":
      return callAnthropic(config, model, options);
    case "ollama":
      return callOllama(config, model, options);
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}

// ── Streaming ────────────────────────────────────────────────────────────────

export async function* streamLLM(
  options: LLMRequestOptions,
): AsyncGenerator<string> {
  const config = await getAIConfig(options.aiFunction, options.operatorId);
  const model = options.model || config.model;

  switch (config.provider) {
    case "openai":
      yield* streamOpenAIResponses(config, model, options);
      break;
    case "anthropic":
      yield* streamAnthropic(config, model, options);
      break;
    case "ollama":
      yield* streamOllama(config, model, options);
      break;
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}

// ── OpenAI Responses API ─────────────────────────────────────────────────────

const clientCache = new Map<string, OpenAI>();

function getOpenAIClient(config: AIConfig): OpenAI {
  if (!config.apiKey) {
    throw new Error("OpenAI API key is not configured. Set AI_API_KEY in environment variables or AppSettings.");
  }
  const baseURL = config.baseUrl ?? "https://api.openai.com/v1";
  const cacheKey = `${config.apiKey}:${baseURL}`;
  let client = clientCache.get(cacheKey);
  if (!client) {
    client = new OpenAI({ apiKey: config.apiKey, baseURL });
    clientCache.set(cacheKey, client);
  }
  return client;
}

function buildResponsesInput(options: LLMRequestOptions): Array<Record<string, unknown>> {
  const input: Array<Record<string, unknown>> = [];

  for (const msg of options.messages) {
    if (msg.role === "user") {
      if (Array.isArray(msg.content)) {
        const contentBlocks = msg.content.map((block) => {
          if (block.type === "text") return { type: "input_text", text: block.text };
          if (block.type === "image_base64") {
            return { type: "input_image", image_url: `data:${block.mediaType};base64,${block.data}` };
          }
          return { type: "input_text", text: "" };
        });
        input.push({ role: "user", content: contentBlocks });
      } else {
        input.push({ role: "user", content: [{ type: "input_text", text: msg.content }] });
      }
    } else if (msg.role === "assistant") {
      if (msg.tool_calls?.length) {
        // Assistant text (if any)
        if (contentToString(msg.content)) {
          input.push({ role: "assistant", content: [{ type: "output_text", text: contentToString(msg.content) }] });
        }
        // Function calls as separate items
        for (const tc of msg.tool_calls) {
          input.push({
            type: "function_call",
            id: tc.id,
            call_id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          });
        }
      } else {
        input.push({
          role: "assistant",
          content: [{ type: "output_text", text: contentToString(msg.content) }],
        });
      }
    } else if (msg.role === "tool") {
      // Tool results → function_call_output
      input.push({
        type: "function_call_output",
        call_id: msg.tool_call_id ?? "",
        output: contentToString(msg.content),
      });
    }
  }

  return input;
}

function buildResponsesTools(options: LLMRequestOptions): Array<Record<string, unknown>> | undefined {
  const tools: Array<Record<string, unknown>> = [];

  if (options.webSearch) {
    tools.push({ type: "web_search" });
  }

  if (options.tools?.length) {
    for (const t of options.tools) {
      tools.push({
        type: "function",
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      });
    }
  }

  return tools.length > 0 ? tools : undefined;
}

async function callOpenAIResponses(
  config: AIConfig,
  model: string,
  options: LLMRequestOptions,
): Promise<LLMResponse> {
  const client = getOpenAIClient(config);
  const store = await resolveStoreSetting(options);

  const responsesTools = buildResponsesTools(options);

  const response = await withRetry(() => client.responses.create({
    model,
    input: buildResponsesInput(options) as unknown as ResponseCreateParamsNonStreaming["input"],
    store,
    ...(options.instructions && { instructions: options.instructions }),
    ...(responsesTools && { tools: responsesTools as unknown as ResponseCreateParamsNonStreaming["tools"] }),
    // CONSTRAINT: thinking: true (reasoning.effort) and text.format.json_schema
    // may be incompatible depending on the model. Currently no callers combine both.
    // Reasoning callers rely on prompt instructions + extractJSON() for structured output.
    // If a future caller needs both, test against the target model first.
    ...(options.responseFormat && { text: { format: options.responseFormat } as unknown as ResponseCreateParamsNonStreaming["text"] }),
    ...(options.thinking && { reasoning: { effort: "high" as const } }),
    // Reasoning models (thinking: true) do not support the temperature parameter.
    // The Responses API will reject requests that include both reasoning.effort and temperature.
    // Callers that set temperature for determinism (e.g., multi-agent specialists) should be aware
    // that thinking mode provides its own consistency through chain-of-thought, not temperature control.
    ...(options.temperature !== undefined && !options.thinking && { temperature: options.temperature }),
    ...(options.maxTokens !== undefined && { max_output_tokens: options.maxTokens }),
    // Include web search sources in output when web search is enabled
    ...(options.webSearch && { include: ["web_search_call.action.sources" as const] }),
  }));

  // Parse response
  const text = response.output_text ?? "";
  const toolCalls: LLMResponse["toolCalls"] = [];
  const webSources: NonNullable<LLMResponse["webSources"]> = [];

  for (const item of response.output ?? []) {
    if (item.type === "function_call") {
      toolCalls.push({
        id: item.call_id ?? item.id,
        name: item.name,
        arguments: safeParseJSON(item.arguments ?? "{}"),
      });
    }
    // Extract web search sources from web_search_call items
    if (item.type === "web_search_call" && item.status === "completed") {
      const action = item.action;
      if (action.type === "search" && action.sources) {
        for (const source of action.sources) {
          webSources.push({
            url: source.url,
            title: "",
            snippet: "",
          });
        }
      }
    }
  }

  const usage = response.usage ? {
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
  } : undefined;

  return {
    text,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage,
    apiCostCents: usage ? calculateCallCostCents(model, usage) : 0,
    webSources: webSources.length > 0 ? webSources : undefined,
  };
}

async function* streamOpenAIResponses(
  config: AIConfig,
  model: string,
  options: LLMRequestOptions,
): AsyncGenerator<string> {
  const client = getOpenAIClient(config);
  const store = await resolveStoreSetting(options);

  const responsesTools = buildResponsesTools(options);

  const stream = await client.responses.create({
    model,
    input: buildResponsesInput(options) as unknown as ResponseCreateParamsStreaming["input"],
    stream: true,
    store,
    ...(options.instructions && { instructions: options.instructions }),
    ...(responsesTools && { tools: responsesTools as unknown as ResponseCreateParamsStreaming["tools"] }),
    ...(options.thinking && { reasoning: { effort: "high" as const } }),
    ...(options.temperature !== undefined && !options.thinking && { temperature: options.temperature }),
    ...(options.maxTokens !== undefined && { max_output_tokens: options.maxTokens }),
  });

  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      yield event.delta;
    }
  }
}

// ── Anthropic ────────────────────────────────────────────────────────────────

function buildAnthropicTools(tools?: AITool[]) {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

async function callAnthropic(
  config: AIConfig,
  model: string,
  options: LLMRequestOptions,
): Promise<LLMResponse> {
  const baseUrl = config.baseUrl ?? "https://api.anthropic.com/v1";

  const mappedMessages = options.messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "user" as const,
        content: [{
          type: "tool_result",
          tool_use_id: m.tool_call_id,
          content: contentToString(m.content),
        }],
      };
    }
    if (m.role === "assistant" && m.tool_calls) {
      const content: Array<Record<string, unknown>> = [];
      const text = contentToString(m.content);
      if (text) content.push({ type: "text", text });
      for (const tc of m.tool_calls) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: safeParseJSON(tc.function.arguments),
        });
      }
      return { role: "assistant" as const, content };
    }
    if (Array.isArray(m.content)) {
      return {
        role: m.role,
        content: m.content.map((block) => {
          if (block.type === "text") return { type: "text", text: block.text };
          if (block.type === "image_base64") {
            return {
              type: "image",
              source: { type: "base64", media_type: block.mediaType, data: block.data },
            };
          }
          return { type: "text", text: "" };
        }),
      };
    }
    return { role: m.role, content: m.content };
  });

  const body: Record<string, unknown> = {
    model,
    messages: mappedMessages,
    max_tokens: options.maxTokens ?? 4096,
    ...(options.instructions && { system: options.instructions }),
    ...(options.temperature !== undefined && { temperature: options.temperature }),
  };

  const tools = buildAnthropicTools(options.tools);
  if (tools) body.tools = tools;

  const url = `${baseUrl}/messages`;
  const data = await withRetry(async () => {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });
    } catch (fetchErr) {
      throw new Error(`Anthropic unreachable at ${url} — check API key and network (${fetchErr instanceof Error ? fetchErr.message : fetchErr})`);
    }

    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`Anthropic API error ${res.status}: ${text}`);
      (err as Error & { status: number }).status = res.status;
      (err as Error & { headers: Headers }).headers = res.headers;
      throw err;
    }

    return res.json();
  });
  let content = "";
  const toolCalls: NonNullable<LLMResponse["toolCalls"]> = [];

  for (const block of data.content ?? []) {
    if (block.type === "text") {
      content += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: block.input as Record<string, unknown>,
      });
    }
  }

  const usage = data.usage ? {
    inputTokens: data.usage.input_tokens ?? 0,
    outputTokens: data.usage.output_tokens ?? 0,
  } : undefined;

  return {
    text: content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage,
    apiCostCents: usage ? calculateCallCostCents(model, usage) : 0,
  };
}

async function* streamAnthropic(
  config: AIConfig,
  model: string,
  options: LLMRequestOptions,
): AsyncGenerator<string> {
  const baseUrl = config.baseUrl ?? "https://api.anthropic.com/v1";
  const nonToolMessages = options.messages.filter((m) => m.role !== "tool" && !m.tool_calls);

  const body: Record<string, unknown> = {
    model,
    messages: nonToolMessages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: options.maxTokens ?? 4096,
    stream: true,
    ...(options.instructions && { system: options.instructions }),
    ...(options.temperature !== undefined && { temperature: options.temperature }),
  };

  const url = `${baseUrl}/messages`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
  } catch (fetchErr) {
    throw new Error(`Anthropic unreachable at ${url} — check API key and network (${fetchErr instanceof Error ? fetchErr.message : fetchErr})`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic stream error ${res.status}: ${text}`);
  }

  if (!res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") return;

        try {
          const event = JSON.parse(payload);
          if (event.type === "content_block_delta" && event.delta?.text) {
            yield event.delta.text;
          }
        } catch {
          // skip malformed lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Ollama ───────────────────────────────────────────────────────────────────

function buildOpenAIStyleTools(tools?: AITool[]) {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

async function callOllama(
  config: AIConfig,
  model: string,
  options: LLMRequestOptions,
): Promise<LLMResponse> {
  const baseUrl = config.baseUrl ?? "http://localhost:11434";

  // Ollama uses Chat Completions format with system messages
  const ollamaMessages: Array<Record<string, unknown>> = [];
  if (options.instructions) {
    ollamaMessages.push({ role: "system", content: options.instructions });
  }
  for (const m of options.messages) {
    if (m.role === "tool") {
      ollamaMessages.push({ role: "tool", content: contentToString(m.content), tool_call_id: m.tool_call_id });
    } else if (m.role === "assistant" && m.tool_calls) {
      ollamaMessages.push({ role: "assistant", content: contentToString(m.content) || "", tool_calls: m.tool_calls });
    } else if (Array.isArray(m.content)) {
      const textParts: string[] = [];
      const images: string[] = [];
      for (const block of m.content) {
        if (block.type === "text") textParts.push(block.text);
        if (block.type === "image_base64") images.push(block.data);
      }
      ollamaMessages.push({
        role: m.role,
        content: textParts.join("\n"),
        ...(images.length > 0 && { images }),
      });
    } else {
      ollamaMessages.push({ role: m.role, content: m.content });
    }
  }

  const body: Record<string, unknown> = {
    model,
    messages: ollamaMessages,
    stream: false,
    options: {
      ...(options.temperature !== undefined && { temperature: options.temperature }),
      ...(options.maxTokens !== undefined && { num_predict: options.maxTokens }),
    },
  };

  const tools = buildOpenAIStyleTools(options.tools);
  if (tools) body.tools = tools;

  const url = `${baseUrl}/api/chat`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (fetchErr) {
    throw new Error(`Ollama unreachable at ${url} — is Ollama running? (${fetchErr instanceof Error ? fetchErr.message : fetchErr})`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const message = data.message;

  const toolCalls = message?.tool_calls?.map((tc: { id?: string; function: { name: string; arguments: string | Record<string, unknown> } }) => ({
    id: tc.id || `call_${Math.random().toString(36).slice(2)}`,
    name: tc.function.name,
    arguments: typeof tc.function.arguments === "string"
      ? safeParseJSON(tc.function.arguments)
      : (tc.function.arguments as Record<string, unknown>),
  }));

  return {
    text: message?.content ?? "",
    toolCalls: toolCalls?.length ? toolCalls : undefined,
    apiCostCents: 0,
  };
}

async function* streamOllama(
  config: AIConfig,
  model: string,
  options: LLMRequestOptions,
): AsyncGenerator<string> {
  const baseUrl = config.baseUrl ?? "http://localhost:11434";

  const ollamaMessages: Array<Record<string, unknown>> = [];
  if (options.instructions) {
    ollamaMessages.push({ role: "system", content: options.instructions });
  }
  for (const m of options.messages) {
    ollamaMessages.push({ role: m.role, content: contentToString(m.content) });
  }

  const body: Record<string, unknown> = {
    model,
    messages: ollamaMessages,
    stream: true,
    options: {
      ...(options.temperature !== undefined && { temperature: options.temperature }),
      ...(options.maxTokens !== undefined && { num_predict: options.maxTokens }),
    },
  };

  const url = `${baseUrl}/api/chat`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (fetchErr) {
    throw new Error(`Ollama unreachable at ${url} — is Ollama running? (${fetchErr instanceof Error ? fetchErr.message : fetchErr})`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama stream error ${res.status}: ${text}`);
  }

  if (!res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.message?.content) {
            yield data.message.content;
          }
        } catch {
          // skip malformed lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function contentToString(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function safeParseJSON(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}
