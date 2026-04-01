export async function register() {
  // Sentry server-side init (works for both nodejs and edge runtimes)
  if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Validate environment variables before anything else
    const { validateEnv } = await import("@/lib/env-validation");
    const result = validateEnv();

    for (const warning of result.warnings) {
      console.warn(`[ENV] ${warning}`);
    }

    if (!result.valid) {
      console.error('=== ENVIRONMENT VALIDATION FAILED ===');
      for (const error of result.errors) {
        console.error(`[ENV] ${error}`);
      }
      console.error('=====================================');
      process.exit(1);
    }

    console.log('[ENV] Environment validation passed');

    // Auto-seed AI settings from env vars (only if not already set)
    await seedAISettingsFromEnv();

    // Sync scheduler and retention cleanup run in Bastion worker (worker/src/cron-scheduler.ts)
  }
}

async function seedAISettingsFromEnv() {
  try {
    const { prisma } = await import("@/lib/db");

    const provider = process.env.AI_PROVIDER;
    if (!provider) return;

    const defaultModels: Record<string, string> = {
      anthropic: "claude-sonnet-4-6",
      openai: "gpt-5.4",
      ollama: "llama3.2",
    };

    const defaultEmbeddingModels: Record<string, string> = {
      openai: "text-embedding-3-small",
      anthropic: "text-embedding-3-small",
      ollama: "nomic-embed-text",
    };

    const apiKey = process.env.AI_API_KEY;
    const model = process.env.AI_MODEL || defaultModels[provider] || "gpt-5.4";

    // Generic AI settings (backward compat)
    const seeds: Array<{ key: string; value: string }> = [
      { key: "ai_provider", value: provider },
      { key: "ai_model", value: model },
    ];
    if (apiKey) seeds.push({ key: "ai_api_key", value: apiKey });

    // Per-function AI settings: reasoning, copilot, orientation
    const functions = ["reasoning", "copilot", "orientation"] as const;
    for (const fn of functions) {
      seeds.push({ key: `ai_${fn}_provider`, value: provider });
      seeds.push({ key: `ai_${fn}_model`, value: model });
      if (apiKey) seeds.push({ key: `ai_${fn}_key`, value: apiKey });
    }

    // Embedding settings (separate provider/model possible)
    const embeddingProvider = process.env.EMBEDDING_PROVIDER || provider;
    const embeddingApiKey = process.env.EMBEDDING_API_KEY || apiKey;
    seeds.push({ key: "embedding_provider", value: embeddingProvider });
    seeds.push({ key: "ai_embedding_provider", value: embeddingProvider });
    seeds.push({ key: "ai_embedding_model", value: defaultEmbeddingModels[embeddingProvider] || "text-embedding-3-small" });
    if (embeddingApiKey) {
      seeds.push({ key: "embedding_api_key", value: embeddingApiKey });
      seeds.push({ key: "ai_embedding_key", value: embeddingApiKey });
    }

    for (const { key, value } of seeds) {
      const existing = await prisma.appSetting.findFirst({ where: { key, operatorId: null } });
      if (!existing) {
        await prisma.appSetting.create({ data: { key, value } });
        console.log(`[SEED] AppSetting "${key}" seeded from env`);
      }
    }
  } catch (err) {
    console.warn("[SEED] Failed to auto-seed AI settings:", err);
  }
}
