/**
 * Backfill embeddings for ContentChunk rows that have content but no embedding.
 *
 * Reads embedding config from AppSetting (same cascade as the app).
 * Processes in batches of 20 (matching embedder batch size).
 * Skips chunks with empty/whitespace content (they will remain null).
 * Idempotent: only touches rows where embedding IS NULL.
 *
 * Usage: npx tsx scripts/backfill-embeddings.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BATCH_SIZE = 20;

// ── Embedding config (mirrors src/lib/rag/embedder.ts) ──

interface EmbeddingConfig {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model: string;
}

async function getEmbeddingConfig(): Promise<EmbeddingConfig> {
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

  return { provider, apiKey, baseUrl, model };
}

// ── Embedding API calls ──

async function embedOpenAI(config: EmbeddingConfig, texts: string[]): Promise<number[][]> {
  const url = (config.baseUrl || "https://api.openai.com") + "/v1/embeddings";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: config.model, input: texts }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI embedding error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const sorted = data.data.sort(
    (a: { index: number }, b: { index: number }) => a.index - b.index,
  );
  return sorted.map((item: { embedding: number[] }) => item.embedding);
}

async function embedOllama(config: EmbeddingConfig, texts: string[]): Promise<number[][]> {
  const baseUrl = config.baseUrl || "http://localhost:11434";
  const results: number[][] = [];

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

async function embedBatch(config: EmbeddingConfig, texts: string[]): Promise<number[][]> {
  if (config.provider === "ollama") return embedOllama(config, texts);
  return embedOpenAI(config, texts);
}

// ── Main ──

async function main() {
  const config = await getEmbeddingConfig();

  if (!config.apiKey && config.provider !== "ollama") {
    console.error("[backfill] No embedding API key configured — cannot backfill");
    process.exit(1);
  }

  console.log(`[backfill] Using provider: ${config.provider}, model: ${config.model}`);

  const [{ count }] = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count
    FROM "ContentChunk"
    WHERE embedding IS NULL
      AND content IS NOT NULL
      AND TRIM(content) != ''
  `;

  const total = Number(count);
  console.log(`[backfill] Found ${total} chunks needing embeddings`);

  if (total === 0) {
    console.log("[backfill] Nothing to do");
    return;
  }

  let processed = 0;
  let embedded = 0;
  let failed = 0;

  while (true) {
    const chunks = await prisma.$queryRaw<{ id: string; content: string }[]>`
      SELECT id, content
      FROM "ContentChunk"
      WHERE embedding IS NULL
        AND content IS NOT NULL
        AND TRIM(content) != ''
      ORDER BY "createdAt" ASC
      LIMIT ${BATCH_SIZE}
    `;

    if (chunks.length === 0) break;

    // Filter out any empty/whitespace content (belt-and-suspenders with the SQL filter)
    const validChunks = chunks.filter((c) => c.content.trim().length > 0);
    const texts = validChunks.map((c) => c.content);

    try {
      const embeddings = await embedBatch(config, texts);

      for (let i = 0; i < validChunks.length; i++) {
        try {
          const vectorLiteral = `[${embeddings[i].join(",")}]`;
          await prisma.$executeRawUnsafe(
            `UPDATE "ContentChunk" SET embedding = $1::vector WHERE id = $2`,
            vectorLiteral,
            validChunks[i].id,
          );
          embedded++;
        } catch (err) {
          console.error(`[backfill] Failed to write embedding for chunk ${validChunks[i].id}:`, err);
          failed++;
        }
      }
    } catch (err) {
      console.error(`[backfill] Batch embedding failed, skipping ${texts.length} chunks:`, err);
      failed += texts.length;

      // Mark these chunks so we don't loop forever — set content to trimmed version
      // Actually just break to avoid infinite loop on persistent API errors
      break;
    }

    processed += chunks.length;
    if (processed % 100 === 0 || chunks.length < BATCH_SIZE) {
      console.log(`[backfill] Progress: ${processed}/${total} processed, ${embedded} embedded, ${failed} failed`);
    }
  }

  console.log(`[backfill] Done. ${embedded} embedded, ${failed} failed out of ${processed} chunks`);
}

main()
  .catch((err) => {
    console.error("[backfill] Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
