import { prisma } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────────────────────

export type AIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  // OpenAI tool calling fields
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;  // for role: "tool" messages
  name?: string;          // tool name for role: "tool" messages
};

export type AITool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AIResponse = {
  content: string;
  toolCalls?: { id: string; name: string; arguments: Record<string, unknown> }[];
};

type AIConfig = {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model: string;
};

type CallOptions = {
  tools?: AITool[];
  temperature?: number;
  maxTokens?: number;
};

// ── Config ───────────────────────────────────────────────────────────────────

export async function getAIConfig(): Promise<AIConfig> {
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: ["ai_provider", "ai_api_key", "ai_base_url", "ai_model"] } },
  });
  const map = new Map(settings.map((s) => [s.key, s.value]));

  const provider = map.get("ai_provider") || process.env.AI_PROVIDER || "ollama";
  const apiKey = map.get("ai_api_key") || process.env.AI_API_KEY;
  const baseUrl = map.get("ai_base_url") || defaultBaseUrlForProvider(provider);
  const model = map.get("ai_model") || process.env.AI_MODEL || defaultModelForProvider(provider);

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
      return "gpt-4o";
    case "anthropic":
      return "claude-sonnet-4-20250514";
    case "ollama":
      return "llama3.2";
    default:
      return "llama3.2";
  }
}

// ── Main Call ─────────────────────────────────────────────────────────────────

export async function callLLM(
  messages: AIMessage[],
  options?: CallOptions,
): Promise<AIResponse> {
  const config = await getAIConfig();

  switch (config.provider) {
    case "openai":
      return callOpenAI(config, messages, options);
    case "anthropic":
      return callAnthropic(config, messages, options);
    case "ollama":
      return callOllama(config, messages, options);
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}

// ── Streaming ────────────────────────────────────────────────────────────────

export async function* streamLLM(
  messages: AIMessage[],
  options?: CallOptions,
): AsyncGenerator<string> {
  const config = await getAIConfig();

  switch (config.provider) {
    case "openai":
      yield* streamOpenAI(config, messages, options);
      break;
    case "anthropic":
      yield* streamAnthropic(config, messages, options);
      break;
    case "ollama":
      yield* streamOllama(config, messages, options);
      break;
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}

// ── OpenAI ───────────────────────────────────────────────────────────────────

function buildOpenAITools(tools?: AITool[]) {
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

async function callOpenAI(
  config: AIConfig,
  messages: AIMessage[],
  options?: CallOptions,
): Promise<AIResponse> {
  const baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
  const body: Record<string, unknown> = {
    model: config.model,
    messages: messages.map((m) => {
      if (m.role === "tool") {
        return { role: "tool", content: m.content, tool_call_id: m.tool_call_id };
      }
      if (m.role === "assistant" && m.tool_calls) {
        return { role: "assistant", content: m.content || null, tool_calls: m.tool_calls };
      }
      return { role: m.role, content: m.content };
    }),
    ...(options?.temperature !== undefined && { temperature: options.temperature }),
    ...(options?.maxTokens !== undefined && { max_tokens: options.maxTokens }),
  };

  const tools = buildOpenAITools(options?.tools);
  if (tools) body.tools = tools;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const message = choice?.message;

  const toolCalls = message?.tool_calls?.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: safeParseJSON(tc.function.arguments),
  }));

  return {
    content: message?.content ?? "",
    toolCalls: toolCalls?.length ? toolCalls : undefined,
  };
}

async function* streamOpenAI(
  config: AIConfig,
  messages: AIMessage[],
  options?: CallOptions,
): AsyncGenerator<string> {
  const baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: true,
    ...(options?.temperature !== undefined && { temperature: options.temperature }),
    ...(options?.maxTokens !== undefined && { max_tokens: options.maxTokens }),
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI stream error ${res.status}: ${text}`);
  }

  yield* parseSSEStream(res);
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
  messages: AIMessage[],
  options?: CallOptions,
): Promise<AIResponse> {
  const baseUrl = config.baseUrl ?? "https://api.anthropic.com/v1";
  const systemMsg = messages.find((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  const mappedMessages = nonSystemMessages.map((m) => {
    if (m.role === "tool") {
      // Anthropic expects tool results as user messages with tool_result content blocks
      return {
        role: "user" as const,
        content: [{
          type: "tool_result",
          tool_use_id: m.tool_call_id,
          content: m.content,
        }],
      };
    }
    if (m.role === "assistant" && m.tool_calls) {
      // Anthropic expects tool_use content blocks in assistant messages
      const content: Array<Record<string, unknown>> = [];
      if (m.content) content.push({ type: "text", text: m.content });
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
    return { role: m.role, content: m.content };
  });

  const body: Record<string, unknown> = {
    model: config.model,
    messages: mappedMessages,
    max_tokens: options?.maxTokens ?? 4096,
    ...(systemMsg && { system: systemMsg.content }),
    ...(options?.temperature !== undefined && { temperature: options.temperature }),
  };

  const tools = buildAnthropicTools(options?.tools);
  if (tools) body.tools = tools;

  const res = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  let content = "";
  const toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[] = [];

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
    content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

async function* streamAnthropic(
  config: AIConfig,
  messages: AIMessage[],
  options?: CallOptions,
): AsyncGenerator<string> {
  const baseUrl = config.baseUrl ?? "https://api.anthropic.com/v1";
  const systemMsg = messages.find((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model: config.model,
    messages: nonSystemMessages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: options?.maxTokens ?? 4096,
    stream: true,
    ...(systemMsg && { system: systemMsg.content }),
    ...(options?.temperature !== undefined && { temperature: options.temperature }),
  };

  const res = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

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

async function callOllama(
  config: AIConfig,
  messages: AIMessage[],
  options?: CallOptions,
): Promise<AIResponse> {
  const baseUrl = config.baseUrl ?? "http://localhost:11434";

  const body: Record<string, unknown> = {
    model: config.model,
    messages: messages.map((m) => {
      if (m.role === "tool") {
        return { role: "tool", content: m.content, tool_call_id: m.tool_call_id };
      }
      if (m.role === "assistant" && m.tool_calls) {
        return { role: "assistant", content: m.content || "", tool_calls: m.tool_calls };
      }
      return { role: m.role, content: m.content };
    }),
    stream: false,
    options: {
      ...(options?.temperature !== undefined && { temperature: options.temperature }),
      ...(options?.maxTokens !== undefined && { num_predict: options.maxTokens }),
    },
  };

  // Add tools if provided (Ollama supports OpenAI-compatible format)
  const tools = buildOpenAITools(options?.tools);
  if (tools) body.tools = tools;

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const message = data.message;

  // Parse tool calls (same format as OpenAI)
  const toolCalls = message?.tool_calls?.map((tc: { id?: string; function: { name: string; arguments: string | Record<string, unknown> } }) => ({
    id: tc.id || `call_${Math.random().toString(36).slice(2)}`,
    name: tc.function.name,
    arguments: typeof tc.function.arguments === "string"
      ? safeParseJSON(tc.function.arguments)
      : (tc.function.arguments as Record<string, unknown>),
  }));

  return {
    content: message?.content ?? "",
    toolCalls: toolCalls?.length ? toolCalls : undefined,
  };
}

async function* streamOllama(
  config: AIConfig,
  messages: AIMessage[],
  options?: CallOptions,
): AsyncGenerator<string> {
  const baseUrl = config.baseUrl ?? "http://localhost:11434";

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: true,
    options: {
      ...(options?.temperature !== undefined && { temperature: options.temperature }),
      ...(options?.maxTokens !== undefined && { num_predict: options.maxTokens }),
    },
  };

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

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

// ── SSE Helper (OpenAI format) ───────────────────────────────────────────────

async function* parseSSEStream(response: Response): AsyncGenerator<string> {
  if (!response.body) return;

  const reader = response.body.getReader();
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
          const data = JSON.parse(payload);
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) yield delta;
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

function safeParseJSON(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}
