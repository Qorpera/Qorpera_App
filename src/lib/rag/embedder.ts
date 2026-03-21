/**
 * Embedding provider: generates vector embeddings for text chunks.
 *
 * Supports OpenAI (text-embedding-3-small) and Ollama (nomic-embed-text).
 * Configuration: reads from AppSetting, falls back to AI provider config.
 * Batch size: 20 chunks per API call.
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

export async function embedChunks(texts: string[]): Promise<(number[] | null)[]> {
  const config = await getEmbeddingConfig();

  // If no API key and not using Ollama, skip embedding — store chunks without vectors
  if (!config.apiKey && config.provider !== "ollama") {
    console.warn("[embedder] No embedding API key configured — storing chunks without embeddings");
    return texts.map(() => null);
  }

  const allEmbeddings: (number[] | null)[] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      const embeddings = await embedBatch(config, batch);
      allEmbeddings.push(...embeddings);
    } catch (err) {
      console.error(`[embedder] Batch ${i / BATCH_SIZE} failed, storing without embeddings:`, err);
      allEmbeddings.push(...batch.map(() => null));
    }
  }

  return allEmbeddings;
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
