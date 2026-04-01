/**
 * Chunk-level entity extraction — populates the knowledge graph with entities
 * and properties extracted from ingested content chunks during onboarding.
 *
 * Runs AFTER synthesis materializes entity types (so extraction knows what types exist)
 * and BEFORE the intelligence preview.
 */

import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { upsertEntity } from "@/lib/entity-resolution";
import { extractJSON } from "@/lib/json-helpers";

// ── Concurrency Helper ──────────────────────────────────────────────────────

async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  limit: number,
): Promise<void> {
  const executing = new Set<Promise<void>>();
  for (const item of items) {
    const p = fn(item).then(() => { executing.delete(p); });
    executing.add(p);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

// ── Main Extraction ─────────────────────────────────────────────────────────

export async function extractEntitiesFromChunks(
  operatorId: string,
): Promise<{ entitiesCreated: number; propertiesSet: number; totalChunks: number }> {
  // 1. Load all entity types for this operator (including the just-created ones)
  const entityTypes = await prisma.entityType.findMany({
    where: { operatorId },
    include: { properties: true },
  });

  // Build a compact schema description for the prompt
  const typeSchemaStr = entityTypes.map(et => {
    const propsStr = et.properties.map(p =>
      `${p.slug} (${p.dataType}${p.identityRole ? `, identity: ${p.identityRole}` : ""})`
    ).join(", ");
    return `- ${et.slug} [${et.defaultCategory}]: ${et.description}. Properties: ${propsStr}`;
  }).join("\n");

  // 2. Load all content chunks with actual content
  const chunks = await prisma.contentChunk.findMany({
    where: { operatorId, content: { not: "" } },
    select: { id: true, content: true, sourceType: true, metadata: true },
    orderBy: { createdAt: "desc" },
  });

  if (chunks.length === 0) {
    console.log("[entity-extraction] No content chunks found");
    return { entitiesCreated: 0, propertiesSet: 0, totalChunks: 0 };
  }

  // 3. Batch chunks (8 per LLM call to balance cost vs context)
  const BATCH_SIZE = 8;
  const batches: typeof chunks[] = [];
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    batches.push(chunks.slice(i, i + BATCH_SIZE));
  }

  let entitiesCreated = 0;
  let propertiesSet = 0;
  const startTime = Date.now();

  // 4. Extract from batches in parallel (max 10 concurrent LLM calls)
  const CONCURRENCY = 10;

  await runWithConcurrency(batches, async (batch) => {
    const batchContent = batch.map((c, i) => {
      let meta: Record<string, unknown> = {};
      try { meta = c.metadata ? JSON.parse(c.metadata as string) : {}; } catch { /* */ }
      const header = `[Chunk ${i + 1}] Source: ${c.sourceType}${meta.subject ? `, Subject: ${meta.subject}` : ""}${meta.sender || meta.from ? `, From: ${meta.sender || meta.from}` : ""}`;
      return `${header}\n${c.content}`;
    }).join("\n\n---\n\n");

    try {
      const response = await callLLM({
        instructions: `You are extracting structured entities from business communications.

ENTITY TYPES AVAILABLE:
${typeSchemaStr}

Extract every entity instance mentioned in the content below. For each entity:
1. Match it to an entity type from the list above
2. Extract ALL properties you can find evidence for
3. Use exact values from the text — do not infer or guess

OUTPUT FORMAT — respond with ONLY valid JSON:
{
  "entities": [
    {
      "typeSlug": "invoice",
      "displayName": "INV-2026-035",
      "properties": {
        "invoice-number": "INV-2026-035",
        "total-amount": "87000",
        "due-date": "2026-03-15",
        "status": "overdue"
      }
    },
    {
      "typeSlug": "contact",
      "displayName": "Karen Holm",
      "properties": {
        "name": "Karen Holm",
        "email": "karen@vestegnen.dk",
        "company": "Vestegnen Boligforening",
        "role": "Driftsansvarlig"
      }
    }
  ]
}

RULES:
- Extract entities you see EVIDENCE for in the text. Do not hallucinate entities.
- If a property value is mentioned but ambiguous, include it with the most likely interpretation.
- For people who are internal employees (mentioned in context as team members), use typeSlug "team-member".
- For external people (customers, vendors, partners), use typeSlug "contact".
- For companies/organizations, use typeSlug "company".
- If the same entity appears in multiple chunks, include it once with the most complete properties from all mentions.`,
        messages: [{ role: "user", content: batchContent }],
        model: getModel("onboardingExtraction"), // Haiku — fast, cheap, good at extraction
        temperature: 0,
        maxTokens: 4096,
        operatorId,
      });

      // Parse and upsert entities
      const parsed = extractJSON(response.text);
      if (parsed?.entities && Array.isArray(parsed.entities)) {
        for (const entity of parsed.entities) {
          if (!entity.typeSlug || !entity.displayName) continue;

          const entityId = await upsertEntity(
            operatorId,
            entity.typeSlug as string,
            {
              displayName: entity.displayName as string,
              properties: (entity.properties || {}) as Record<string, string>,
            },
          );

          if (entityId) {
            entitiesCreated++;
            propertiesSet += Object.keys(entity.properties || {}).length;
          }
        }
      }
    } catch (err) {
      console.warn(`[entity-extraction] Batch failed:`, err);
    }
  }, CONCURRENCY);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[entity-extraction] Extracted ${entitiesCreated} entities from ${chunks.length} chunks in ${elapsed}s (${batches.length} batches, concurrency ${CONCURRENCY})`);
  return { entitiesCreated, propertiesSet, totalChunks: chunks.length };
}
