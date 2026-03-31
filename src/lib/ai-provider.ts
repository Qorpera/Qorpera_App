import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { ResponseCreateParamsNonStreaming, ResponseCreateParamsStreaming } from "openai/resources/responses/responses";
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db";
import { calculateCallCostCents } from "@/lib/model-pricing";

// ── Content Block Types ─────────────────────────────────────────────────────

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image_base64"; mediaType: string; data: string };

// ── Model Routing ───────────────────────────────────────────────────────────

const MODEL_ROUTES = {
  // ── Situation reasoning (default fallback for custom/unclassified situation types) ──
  situationReasoning: "claude-sonnet-4-6-20250514",

  // ── Multi-agent pipeline ──
  multiAgentSpecialist: "claude-sonnet-4-6-20250514",
  multiAgentCoordinator: "claude-opus-4-6",

  // ── Strategic intelligence ──
  initiativeReasoning: "claude-opus-4-6",
  strategicScan: "claude-opus-4-6",

  // ── Content detection pipeline ──
  contentDetection: "gpt-5.4-mini",
  contentPreFilter: "gpt-5.4-nano",
  signalPreFilter: "gpt-5.4-nano",
  situationAudit: "claude-sonnet-4-6-20250514",

  // ── Execution & extraction ──
  copilot: "gpt-5.4",
  insightExtraction: "claude-sonnet-4-6-20250514",
  executionGenerate: "gpt-5.4",
  recurringTasks: "gpt-5.4-mini",

  // ── Infrastructure ──
  embedding: "text-embedding-3-small",
  chunkClassification: "claude-haiku-4-5-20251001",

  // ── Onboarding pipeline (no changes) ──
  onboardingIntelligence: "gpt-5.4",
  onboardingMemory: "gpt-5.4-mini",
  onboardingTemporal: "claude-haiku-4-5-20251001",
  onboardingAgent: "claude-sonnet-4-20250514",
  onboardingAgentFollowup: "claude-sonnet-4-20250514",
  onboardingOrganizer: "claude-opus-4-6",
  onboardingSynthesis: "claude-sonnet-4-20250514",
  onboardingChat: "claude-sonnet-4-20250514",
  onboardingExtraction: "claude-haiku-4-5-20251001",
} as const;

export type ModelRoute = keyof typeof MODEL_ROUTES;

export function getModel(route: ModelRoute): string {
  return MODEL_ROUTES[route];
}

// ── Archetype-Based Dynamic Routing ─────────────────────────────────────────
// Maps situation archetype slugs to model tiers for situation reasoning.
// The archetype is available via situation.situationType.archetypeSlug at reasoning time.

type ArchetypeTier = "deep" | "standard" | "structured" | "light";

const ARCHETYPE_MODEL_TIER: Record<string, ArchetypeTier> = {
  // Opus 4.6 — deep interpretive reasoning + strategic analysis
  budget_variance: "deep",
  cash_flow_alert: "deep",
  deal_stagnation: "deep",
  pipeline_risk: "deep",
  client_escalation: "deep",
  relationship_cooling: "deep",
  workload_imbalance: "deep",
  employee_concern: "deep",
  delivery_risk: "deep",
  decision_needed: "deep",

  // Sonnet 4.6 — communication craft + factual grounding + moderate reasoning
  overdue_invoice: "standard",
  contract_renewal: "standard",
  lead_follow_up: "standard",
  upsell_opportunity: "standard",
  response_overdue: "standard",
  meeting_follow_up: "standard",
  communication_gap: "standard",
  deadline_approaching: "standard",
  compliance_deadline: "standard",
  process_bottleneck: "standard",
  knowledge_request: "standard",
  document_action: "standard",

  // GPT-5.4 — structured precision + tool calling + speed
  payment_reconciliation: "structured",
  onboarding_task: "structured",
  team_coordination: "structured",
  material_order: "structured",
  urgent_dispatch: "structured",

  // GPT-5.4 Mini — procedural, low-stakes
  expense_approval: "light",
  access_request: "light",
};

const TIER_TO_MODEL: Record<ArchetypeTier, string> = {
  deep: "claude-opus-4-6",
  standard: "claude-sonnet-4-6-20250514",
  structured: "gpt-5.4",
  light: "gpt-5.4-mini",
};

const TIER_TO_THINKING_BUDGET: Record<ArchetypeTier, number | null> = {
  deep: 16_384,
  standard: 8_192,
  structured: null,   // GPT uses reasoning.effort, not token budget
  light: null,
};

/** Get the optimal model for a situation archetype. Falls back to Sonnet 4.6 for unknown archetypes. */
export function getModelForArchetype(archetypeSlug: string | null | undefined): string {
  if (!archetypeSlug) return MODEL_ROUTES.situationReasoning;
  const tier = ARCHETYPE_MODEL_TIER[archetypeSlug] ?? "standard";
  return TIER_TO_MODEL[tier];
}

/** Get the thinking token budget for a situation archetype. Returns null for non-thinking models. */
export function getThinkingBudgetForArchetype(archetypeSlug: string | null | undefined): number | null {
  if (!archetypeSlug) return 8_192;
  const tier = ARCHETYPE_MODEL_TIER[archetypeSlug] ?? "standard";
  return TIER_TO_THINKING_BUDGET[tier];
}

/** Get the archetype tier for logging/monitoring. */
export function getArchetypeTier(archetypeSlug: string | null | undefined): ArchetypeTier {
  if (!archetypeSlug) return "standard";
  return ARCHETYPE_MODEL_TIER[archetypeSlug] ?? "standard";
}

/**
 * Extended thinking budget per route (tokens).
 * null = no extended thinking for this component.
 * The worker SDK (0.39.x) uses budget_tokens, not the newer effort parameter.
 */
export const THINKING_BUDGET: Partial<Record<ModelRoute, number | null>> = {
  // Situation reasoning uses per-archetype budgets via getThinkingBudgetForArchetype()
  // These are for the non-archetype-routed calls:
  multiAgentSpecialist: 4_096,
  multiAgentCoordinator: 16_384,
  initiativeReasoning: 16_384,
  strategicScan: 16_384,
  situationAudit: 2_048,
  insightExtraction: 8_192,
  // Onboarding (unchanged)
  onboardingTemporal: null,
  onboardingAgent: 4_096,
  onboardingAgentFollowup: 8_192,
  onboardingOrganizer: 8_192,
  onboardingSynthesis: 16_384,
  onboardingChat: null,
  onboardingExtraction: null,
};

export function getThinkingBudget(route: ModelRoute): number | null {
  return THINKING_BUDGET[route] ?? null;
}

const MAX_OUTPUT_TOKENS: Record<string, number> = {
  "claude-opus-4-6": 32_768,
  "claude-sonnet-4-20250514": 32_768,
  "claude-sonnet-4-6-20250514": 16_384,
  "claude-haiku-4-5-20251001": 8_192,
  "claude-haiku-3-5-20241022": 8_192,
  "gpt-5.4": 16_384,
  "gpt-5.4-mini": 16_384,
  "gpt-5.4-nano": 16_384,
  "gpt-4o": 16_384,
  "gpt-4o-mini": 16_384,
  "gpt-4.1": 32_768,
  "gpt-4.1-mini": 32_768,
  "gpt-4.1-nano": 16_384,
  "o3-mini": 16_384,
};

/** Returns the max output token limit for a model, defaulting to 4096 if unknown. */
export function getMaxOutputTokens(modelId: string): number {
  return MAX_OUTPUT_TOKENS[modelId] ?? 4_096;
}

// ── Cross-Provider Failover ─────────────────────────────────────────────────

/** Maps OpenAI models to equivalent Anthropic models for failover. */
const ANTHROPIC_MODEL_MAP: Record<string, string> = {
  "gpt-5.4": "claude-sonnet-4-6-20250514",
  "gpt-5.4-mini": "claude-haiku-4-5-20251001",
  "gpt-5.4-nano": "claude-haiku-4-5-20251001",
};

/** Per-provider in-flight call counters. */
const providerConcurrency = {
  openai: 0,
  anthropic: 0,
};

/** Soft limits — determine routing, never drop requests. */
const PROVIDER_CONCURRENCY_LIMITS = {
  openai: 8,
  anthropic: 8,
};

/** Anthropic SDK client cache, keyed by API key. */
const anthropicClients = new Map<string, Anthropic>();

function getAnthropicClient(apiKey?: string): Anthropic {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Anthropic API key not configured — set ANTHROPIC_API_KEY or configure via AI settings");
  let client = anthropicClients.get(key);
  if (!client) {
    client = new Anthropic({ apiKey: key });
    anthropicClients.set(key, client);
  }
  return client;
}

/** Returns true for HTTP 429 (rate limit) and 5xx (server errors). */
function isRetryableError(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (!status) return false;
  return status === 429 || (status >= 500 && status < 600);
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
  thinkingBudget?: number;  // Token budget for extended thinking (Anthropic only)
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
  /** Which model actually handled the call (important for failover audit trail). */
  modelId?: string;
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

      // Respect Retry-After header if present (supports seconds or HTTP-date)
      const retryAfter = (error as { headers?: { get?: (k: string) => string | null } })?.headers?.get?.("retry-after");
      let retryAfterMs: number | null = null;
      if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) {
          retryAfterMs = seconds * 1000;
        } else {
          const date = Date.parse(retryAfter);
          if (!isNaN(date)) retryAfterMs = date - Date.now();
        }
      }

      const waitMs = retryAfterMs && retryAfterMs > 0 ? Math.min(retryAfterMs, 60000) : delay;
      console.warn(`[ai-provider] Retrying after ${Math.round(waitMs)}ms (attempt ${attempt + 1}/${maxRetries}, status ${status})`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw new Error("withRetry: unreachable");
}

// ── Bastion Worker Proxy ──────────────────────────────────────────────────────

function signWorkerRequest(body: string): { timestamp: string; signature: string } {
  const secret = process.env.WORKER_SECRET || "";
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", secret)
    .update(timestamp + body)
    .digest("hex");
  return { timestamp, signature };
}

async function proxyCallLLM(workerUrl: string, options: LLMRequestOptions): Promise<LLMResponse> {
  const body = JSON.stringify(options);
  const { timestamp, signature } = signWorkerRequest(body);

  const res = await fetch(`${workerUrl}/llm/call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Worker-Timestamp": timestamp,
      "X-Worker-Signature": signature,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(`Worker LLM call failed (${res.status}): ${err}`);
  }

  return res.json();
}

async function* proxyStreamLLM(workerUrl: string, options: LLMRequestOptions): AsyncGenerator<string> {
  const body = JSON.stringify(options);
  const { timestamp, signature } = signWorkerRequest(body);

  const res = await fetch(`${workerUrl}/llm/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Worker-Timestamp": timestamp,
      "X-Worker-Signature": signature,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(`Worker LLM stream failed (${res.status}): ${err}`);
  }

  if (!res.body) throw new Error("Worker returned no stream body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6);
      if (payload === "[DONE]") return;
      if (line.startsWith("event: error")) continue;
      try {
        yield JSON.parse(payload);
      } catch {
        // Non-JSON SSE line, skip
      }
    }
  }
}

// ── Anthropic (SDK-based, unified for configured-provider + failover) ────────

/**
 * Calls Anthropic Messages API via SDK.
 * Used for both the configured-provider path and OpenAI failover.
 */
async function callAnthropic(
  apiKey: string,
  model: string,
  options: LLMRequestOptions,
): Promise<LLMResponse> {
  const client = getAnthropicClient(apiKey);

  // Build system message with prompt caching
  let system: Anthropic.Messages.MessageCreateParams["system"] | undefined;
  if (options.instructions) {
    system = [{
      type: "text" as const,
      text: options.instructions,
      cache_control: { type: "ephemeral" as const },
    }];
  }

  // Translate messages
  const messages: Anthropic.Messages.MessageParam[] = [];
  for (const msg of options.messages) {
    if (msg.role === "tool") {
      messages.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: msg.tool_call_id ?? "",
          content: contentToString(msg.content),
        }],
      });
    } else if (msg.role === "assistant" && msg.tool_calls) {
      const content: Anthropic.Messages.ContentBlockParam[] = [];
      const text = contentToString(msg.content);
      if (text) content.push({ type: "text", text });
      for (const tc of msg.tool_calls) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: safeParseJSON(tc.function.arguments),
        });
      }
      messages.push({ role: "assistant", content });
    } else if (msg.role === "assistant") {
      messages.push({
        role: "assistant",
        content: contentToString(msg.content),
      });
    } else {
      // user
      if (Array.isArray(msg.content)) {
        const contentBlocks: Anthropic.Messages.ContentBlockParam[] = msg.content.map((block) => {
          if (block.type === "image_base64") {
            return {
              type: "image" as const,
              source: { type: "base64" as const, media_type: block.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: block.data },
            };
          }
          return { type: "text" as const, text: block.text };
        });
        messages.push({ role: "user", content: contentBlocks });
      } else {
        messages.push({ role: "user", content: msg.content });
      }
    }
  }

  // Translate tools
  const tools: Anthropic.Messages.Tool[] | undefined = options.tools?.length
    ? options.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Messages.Tool["input_schema"],
      }))
    : undefined;

  // Web search not supported on Anthropic — log warning if requested
  if (options.webSearch) {
    console.warn("[ai-provider] Anthropic: webSearch not supported, proceeding without web search");
  }

  const params: Anthropic.Messages.MessageCreateParams = {
    model,
    messages,
    max_tokens: options.maxTokens ?? getMaxOutputTokens(model),
    ...(system && { system }),
    ...(tools && { tools }),
    // Anthropic extended thinking
    ...(options.thinking && { thinking: { type: "enabled" as const, budget_tokens: options.thinkingBudget ?? 10_000 } }),
    // Temperature not allowed with thinking
    ...(options.temperature !== undefined && !options.thinking && { temperature: options.temperature }),
  };

  const response = await client.messages.create(params);

  // Translate response
  let text = "";
  const toolCalls: NonNullable<LLMResponse["toolCalls"]> = [];

  for (const block of response.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: block.input as Record<string, unknown>,
      });
    }
  }

  const usage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };

  return {
    text,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage,
    apiCostCents: calculateCallCostCents(model, usage),
    modelId: model,
  };
}

/** Wraps callAnthropic with concurrency tracking for the failover path. */
async function callAnthropicWithTracking(
  options: LLMRequestOptions,
  anthropicModel: string,
): Promise<LLMResponse> {
  providerConcurrency.anthropic++;
  try {
    return await callAnthropic(process.env.ANTHROPIC_API_KEY!, anthropicModel, options);
  } finally {
    providerConcurrency.anthropic--;
  }
}

// ── Main Call ─────────────────────────────────────────────────────────────────

export async function callLLM(options: LLMRequestOptions): Promise<LLMResponse> {
  // Proxy through Bastion worker if WORKER_URL is set
  const workerUrl = process.env.WORKER_URL;
  if (workerUrl) {
    return proxyCallLLM(workerUrl, options);
  }

  const config = await getAIConfig(options.aiFunction, options.operatorId);
  const model = options.model || config.model;

  // If the requested model is explicitly an Anthropic model, route directly regardless of provider config
  if (model.startsWith("claude-") && process.env.ANTHROPIC_API_KEY) {
    return callAnthropic(process.env.ANTHROPIC_API_KEY, model, options);
  }

  // Non-OpenAI providers: route directly, no failover
  if (config.provider !== "openai") {
    switch (config.provider) {
      case "anthropic":
        return callAnthropic(config.apiKey ?? "", model, options);
      case "ollama":
        return callOllama(config, model, options);
      default:
        throw new Error(`Unknown AI provider: ${config.provider}`);
    }
  }

  // ── OpenAI with cross-provider failover ──────────────────────────────────
  const anthropicModel = ANTHROPIC_MODEL_MAP[model];
  const canFailover = !!process.env.ANTHROPIC_API_KEY && !!anthropicModel;

  // Primary: OpenAI under concurrency limit
  if (providerConcurrency.openai < PROVIDER_CONCURRENCY_LIMITS.openai) {
    providerConcurrency.openai++;
    try {
      return await callOpenAIResponses(config, model, options);
    } catch (error) {
      if (canFailover && isRetryableError(error)) {
        console.warn(`[ai-provider] OpenAI error (${(error as { status?: number }).status}), failing over to Anthropic`);
        return await callAnthropicWithTracking(options, anthropicModel);
      }
      throw error;
    } finally {
      providerConcurrency.openai--;
    }
  }

  // OpenAI at capacity — try Anthropic
  if (canFailover) {
    console.warn(`[ai-provider] OpenAI at capacity (${providerConcurrency.openai}/${PROVIDER_CONCURRENCY_LIMITS.openai}), routing to Anthropic`);
    return await callAnthropicWithTracking(options, anthropicModel);
  }

  // No failover available — proceed with OpenAI anyway (over-limit, may get rate-limited)
  providerConcurrency.openai++;
  try {
    return await callOpenAIResponses(config, model, options);
  } finally {
    providerConcurrency.openai--;
  }
}

// ── Streaming ────────────────────────────────────────────────────────────────

export async function* streamLLM(
  options: LLMRequestOptions,
): AsyncGenerator<string> {
  const config = await getAIConfig(options.aiFunction, options.operatorId);
  const model = options.model || config.model;

  // Direct Anthropic streaming — preferred for interactive paths (copilot, chat)
  // Avoids unnecessary proxy hop through worker when key is available locally
  if (model.startsWith("claude-") && process.env.ANTHROPIC_API_KEY) {
    yield* streamAnthropic(process.env.ANTHROPIC_API_KEY, model, options);
    return;
  }

  // Worker proxy for non-Anthropic models or when no local key
  const workerUrl = process.env.WORKER_URL;
  if (workerUrl) {
    yield* proxyStreamLLM(workerUrl, options);
    return;
  }

  // TODO: Anthropic streaming failover — when OpenAI streaming fails with
  // retryable error, fall back to Anthropic's streaming API (client.messages.stream()).
  // The copilot is the only streaming consumer and is less latency-sensitive
  // than the situation reasoning path, so this is lower priority.

  switch (config.provider) {
    case "openai":
      yield* streamOpenAIResponses(config, model, options);
      break;
    case "anthropic":
      yield* streamAnthropic(config.apiKey ?? "", model, options);
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
    modelId: model,
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

// ── Anthropic Streaming (SDK-based) ──────────────────────────────────────────

async function* streamAnthropic(
  apiKey: string,
  model: string,
  options: LLMRequestOptions,
): AsyncGenerator<string> {
  const client = getAnthropicClient(apiKey);

  // Build system message with prompt caching (same as callAnthropic)
  let system: Anthropic.Messages.MessageCreateParams["system"] | undefined;
  if (options.instructions) {
    system = [{
      type: "text" as const,
      text: options.instructions,
      cache_control: { type: "ephemeral" as const },
    }];
  }

  // Reuse the same message translation as callAnthropic
  const messages: Anthropic.Messages.MessageParam[] = [];
  for (const msg of options.messages) {
    if (msg.role === "tool") {
      messages.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: msg.tool_call_id ?? "",
          content: contentToString(msg.content),
        }],
      });
    } else if (msg.role === "assistant" && msg.tool_calls) {
      const content: Anthropic.Messages.ContentBlockParam[] = [];
      const text = contentToString(msg.content);
      if (text) content.push({ type: "text", text });
      for (const tc of msg.tool_calls) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: safeParseJSON(tc.function.arguments),
        });
      }
      messages.push({ role: "assistant", content });
    } else if (msg.role === "assistant") {
      messages.push({ role: "assistant", content: contentToString(msg.content) });
    } else {
      if (Array.isArray(msg.content)) {
        const contentBlocks: Anthropic.Messages.ContentBlockParam[] = msg.content.map((block) => {
          if (block.type === "image_base64") {
            return {
              type: "image" as const,
              source: { type: "base64" as const, media_type: block.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: block.data },
            };
          }
          return { type: "text" as const, text: block.text };
        });
        messages.push({ role: "user", content: contentBlocks });
      } else {
        messages.push({ role: "user", content: msg.content });
      }
    }
  }

  const stream = client.messages.stream({
    model,
    messages,
    max_tokens: options.maxTokens ?? getMaxOutputTokens(model),
    ...(system && { system }),
    ...(options.temperature !== undefined && { temperature: options.temperature }),
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
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
  const data = await withRetry(async () => {
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
      const err = new Error(`Ollama API error ${res.status}: ${text}`);
      (err as Error & { status: number }).status = res.status;
      throw err;
    }

    return res.json();
  });
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
    modelId: model,
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
