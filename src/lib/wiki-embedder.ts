/**
 * Embedding provider: generates vector embeddings for text.
 *
 * Supports OpenAI (text-embedding-3-small) and Ollama (nomic-embed-text).
 * Configuration: reads from AppSetting, falls back to AI provider config.
 * Batch size: 20 texts per API call.
 */

import { prisma } from "@/lib/db";

interface EmbeddingConfig {
  provider: string; // "openai" | "ollama"
  apiKey?: string;
  baseUrl?: string;
  model: string;
}

// Cache config for duration of process
let cachedConfig: EmbeddingConfig | null = null;

export async function getEmbeddingConfig(): Promise<EmbeddingConfig> {
  if (cachedConfig) return cachedConfig;

  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          "embedding_provider",
          "embedding_api_key",
          "embedding_base_url",
          "embedding_model",
          "ai_provider",
          "ai_api_key",
          "ai_base_url",
        ],
      },
      operatorId: null,
    },
  });
  const map = new Map(settings.map((s) => [s.key, s.value]));

  const provider = map.get("embedding_provider") || map.get("ai_provider") || "openai";
  const apiKey = map.get("embedding_api_key") || map.get("ai_api_key");
  const baseUrl = map.get("embedding_base_url") || map.get("ai_base_url");

  let model = map.get("embedding_model") || "";
  if (!model) {
    model = provider === "ollama" ? "nomic-embed-text" : "text-embedding-3-small";
  }

  cachedConfig = { provider, apiKey, baseUrl, model };
  return cachedConfig;
}

// Clear cache (call when settings change)
export function clearEmbeddingConfigCache() {
  cachedConfig = null;
}

const BATCH_SIZE = 20;

export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  const config = await getEmbeddingConfig();

  // If no API key and not using Ollama, skip embedding — store chunks without vectors
  if (!config.apiKey && config.provider !== "ollama") {
    console.warn("[embedder] No embedding API key configured — storing chunks without embeddings");
    return texts.map(() => null);
  }

  // Track which inputs are empty/whitespace — these get null embeddings without calling the API
  const validIndices: number[] = [];
  const validTexts: string[] = [];
  for (let i = 0; i < texts.length; i++) {
    if (texts[i].trim().length > 0) {
      validIndices.push(i);
      validTexts.push(texts[i]);
    }
  }

  if (validIndices.length < texts.length) {
    console.warn(
      `[embedder] Skipped ${texts.length - validIndices.length} empty/whitespace chunk(s)`,
    );
  }

  if (validTexts.length === 0) {
    return texts.map(() => null);
  }

  // Embed only non-empty texts
  const validEmbeddings: (number[] | null)[] = [];

  for (let i = 0; i < validTexts.length; i += BATCH_SIZE) {
    const batch = validTexts.slice(i, i + BATCH_SIZE);
    try {
      const embeddings = await embedBatch(config, batch);
      validEmbeddings.push(...embeddings);
    } catch (err) {
      console.error(`[embedder] Batch ${Math.floor(i / BATCH_SIZE)} failed, storing without embeddings:`, err);
      validEmbeddings.push(...batch.map(() => null));
    }
  }

  // Map results back into original positions (empty inputs get null)
  const result: (number[] | null)[] = texts.map(() => null);
  for (let i = 0; i < validIndices.length; i++) {
    result[validIndices[i]] = validEmbeddings[i];
  }

  return result;
}

async function embedBatch(config: EmbeddingConfig, texts: string[]): Promise<number[][]> {
  if (config.provider === "ollama") {
    return embedOllama(config, texts);
  }
  return embedOpenAI(config, texts);
}

async function embedOpenAI(config: EmbeddingConfig, texts: string[]): Promise<number[][]> {
  const url = (config.baseUrl || "https://api.openai.com") + "/v1/embeddings";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      input: texts,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI embedding error (${response.status}): ${err}`);
  }

  const data = await response.json();
  // Sort by index to ensure correct ordering
  const sorted = data.data.sort(
    (a: { index: number }, b: { index: number }) => a.index - b.index,
  );
  return sorted.map((item: { embedding: number[] }) => item.embedding);
}

async function embedOllama(config: EmbeddingConfig, texts: string[]): Promise<number[][]> {
  const baseUrl = config.baseUrl || "http://localhost:11434";
  const results: number[][] = [];

  // Ollama doesn't support batch embedding — call one at a time
  for (const text of texts) {
    const response = await fetch(`${baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, prompt: text }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama embedding error (${response.status}): ${err}`);
    }

    const data = await response.json();
    results.push(data.embedding);
  }

  return results;
}
