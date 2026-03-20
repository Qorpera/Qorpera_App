import OpenAI from "openai";
import { prisma } from "@/lib/db";

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

export async function getAIConfig(aiFunction?: AIFunction): Promise<AIConfig> {
  const keysToFetch = ["ai_provider", "ai_api_key", "ai_base_url", "ai_model"];
  if (aiFunction) {
    keysToFetch.push(
      `ai_${aiFunction}_provider`,
      `ai_${aiFunction}_key`,
      `ai_${aiFunction}_model`,
    );
  }

  const settings = await prisma.appSetting.findMany({
    where: { key: { in: keysToFetch } },
  });
  const map = new Map(settings.map((s) => [s.key, s.value]));

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

// ── Main Call ─────────────────────────────────────────────────────────────────

export async function callLLM(options: LLMRequestOptions): Promise<LLMResponse> {
  const config = await getAIConfig(options.aiFunction);
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
  const config = await getAIConfig(options.aiFunction);
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

function getOpenAIClient(config: AIConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey ?? "",
    baseURL: config.baseUrl ?? "https://api.openai.com/v1",
  });
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
    tools.push({ type: "web_search_preview" });
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

  const params: Record<string, unknown> = {
    model,
    input: buildResponsesInput(options),
    store,
  };

  if (options.instructions) {
    params.instructions = options.instructions;
  }

  const tools = buildResponsesTools(options);
  if (tools) params.tools = tools;

  if (options.responseFormat) {
    params.text = { format: options.responseFormat };
  }

  if (options.thinking) {
    params.reasoning = { effort: "high" };
  }

  if (options.temperature !== undefined && !options.thinking) {
    params.temperature = options.temperature;
  }

  if (options.maxTokens !== undefined) {
    params.max_output_tokens = options.maxTokens;
  }

  const response = await (client.responses as any).create(params);

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
    if (item.type === "web_search_result") {
      webSources.push({
        url: item.url ?? "",
        title: item.title ?? "",
        snippet: item.snippet ?? "",
      });
    }
  }

  return {
    text,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage: response.usage ? {
      inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens ?? 0,
    } : undefined,
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

  const params: Record<string, unknown> = {
    model,
    input: buildResponsesInput(options),
    stream: true,
    store,
  };

  if (options.instructions) {
    params.instructions = options.instructions;
  }

  const tools = buildResponsesTools(options);
  if (tools) params.tools = tools;

  if (options.thinking) {
    params.reasoning = { effort: "high" };
  }

  if (options.temperature !== undefined && !options.thinking) {
    params.temperature = options.temperature;
  }

  if (options.maxTokens !== undefined) {
    params.max_output_tokens = options.maxTokens;
  }

  const stream = await (client.responses as any).create(params);

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
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = await res.json();
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

  return {
    text: content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage: data.usage ? {
      inputTokens: data.usage.input_tokens ?? 0,
      outputTokens: data.usage.output_tokens ?? 0,
    } : undefined,
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
