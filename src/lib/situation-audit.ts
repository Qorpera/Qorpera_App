import { prisma } from "@/lib/db";
import { callLLM, getModel, getThinkingBudget } from "@/lib/ai-provider";
import { regeneratePreFilter } from "@/lib/situation-prefilter";
import { extractJSONArray } from "@/lib/json-helpers";

// ── Types ────────────────────────────────────────────────────────────────────

type DetectionLogic = {
  mode: "structured" | "natural" | "hybrid";
  structured?: { entityType: string };
  preFilter?: { entityType: string };
  naturalLanguage?: string;
};

type AuditResult = {
  situationTypeId: string;
  situationTypeSlug: string;
  entitiesSampled: number;
  missesFound: number;
  filterRegenerated: boolean;
};

// ── Main ─────────────────────────────────────────────────────────────────────

const MISS_THRESHOLD = 3;

export async function auditPreFilters(operatorId: string): Promise<AuditResult[]> {
  const results: AuditResult[] = [];

  const situationTypes = await prisma.situationType.findMany({
    where: { operatorId, enabled: true },
  });

  for (const st of situationTypes) {
    const detection: DetectionLogic = safeParseJSON(st.detectionLogic);
    if (detection.mode === "structured") continue;

    try {
      const result = await auditSingleType(operatorId, st, detection);
      results.push(result);
    } catch (err) {
      console.error(`[situation-audit] Error auditing ${st.slug}:`, err);
    }
  }

  return results;
}

// ── Audit a single situation type ────────────────────────────────────────────

async function auditSingleType(
  operatorId: string,
  st: { id: string; slug: string; name: string; description: string; detectionLogic: string; auditMissCount: number },
  detection: DetectionLogic,
): Promise<AuditResult> {
  const entityTypeSlug = detection.preFilter?.entityType ?? detection.structured?.entityType;
  if (!entityTypeSlug) {
    return { situationTypeId: st.id, situationTypeSlug: st.slug, entitiesSampled: 0, missesFound: 0, filterRegenerated: false };
  }

  // Get entity type
  const entityType = await prisma.entityType.findFirst({
    where: { operatorId, slug: entityTypeSlug },
  });
  if (!entityType) {
    return { situationTypeId: st.id, situationTypeSlug: st.slug, entitiesSampled: 0, missesFound: 0, filterRegenerated: false };
  }

  // Sample random entities that DON'T have an open situation of this type
  const existingSituationPages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      pageType: "situation_instance",
      scope: "operator",
      properties: { path: ["situation_type_id"], equals: st.id },
      NOT: {
        OR: [
          { properties: { path: ["status"], equals: "resolved" } },
          { properties: { path: ["status"], equals: "closed" } },
        ],
      },
    },
    select: { properties: true },
  });
  const excludeIds = new Set(
    existingSituationPages
      .map((p) => (p.properties as Record<string, unknown> | null)?.trigger_entity_id as string | undefined)
      .filter(Boolean),
  );

  const allEntities = await prisma.entity.findMany({
    where: { entityTypeId: entityType.id, operatorId, status: "active" },
    include: { propertyValues: { include: { property: true } } },
    take: 100,
  });

  // Filter to entities not already in situations, then sample
  const eligible = allEntities.filter((e) => !excludeIds.has(e.id));
  const sample = shuffle(eligible).slice(0, 15);

  if (sample.length === 0) {
    await prisma.situationType.update({
      where: { id: st.id },
      data: { lastAuditAt: new Date() },
    });
    return { situationTypeId: st.id, situationTypeSlug: st.slug, entitiesSampled: 0, missesFound: 0, filterRegenerated: false };
  }

  // Build entity descriptions for LLM
  const naturalDesc = detection.naturalLanguage ?? st.description;
  const entitiesStr = sample.map((e, idx) => {
    const props = e.propertyValues.map((pv) => `  ${pv.property.slug}: ${pv.value}`).join("\n");
    return `ENTITY ${idx + 1} (${entityTypeSlug}): ${e.displayName}\n${props}`;
  }).join("\n\n");

  let missesFound = 0;
  const missedDescriptions: string[] = [];

  try {
    // Note: temperature is not set because thinking mode handles determinism via reasoning chain
    const response = await callLLM({
      messages: [{
        role: "user",
        content: `You are auditing whether business entities match a situation pattern.

SITUATION PATTERN: "${st.name}"
DESCRIPTION: ${naturalDesc}

${entitiesStr}

For each entity, determine if it currently matches the situation pattern.
Respond with ONLY valid JSON (no markdown): an array with one object per entity in order:
[{ "matches": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation" }]`,
      }],
      maxTokens: 65_536,
      aiFunction: "reasoning",
      model: getModel("situationAudit"),
      thinking: true,
      thinkingBudget: getThinkingBudget("situationAudit") ?? undefined,
    });

    const parsed = extractJSONArray(response.text);
    if (Array.isArray(parsed)) {
      for (let i = 0; i < Math.min(sample.length, parsed.length); i++) {
        const result = parsed[i];
        if (result?.matches && (typeof result.confidence !== "number" || result.confidence >= 0.6)) {
          missesFound++;
          const props = sample[i].propertyValues.map((pv) => `${pv.property.slug}=${pv.value}`).join(", ");
          missedDescriptions.push(`${sample[i].displayName}: ${props}`);
        }
      }
    }
  } catch (err) {
    console.error(`[situation-audit] LLM audit failed for ${st.slug}:`, err);
  }

  // Update miss count
  const newMissCount = st.auditMissCount + missesFound;
  let filterRegenerated = false;

  if (newMissCount >= MISS_THRESHOLD && missedDescriptions.length > 0) {
    await regeneratePreFilter(st.id, missedDescriptions);
    filterRegenerated = true;
  } else {
    await prisma.situationType.update({
      where: { id: st.id },
      data: { auditMissCount: newMissCount },
    });
  }

  await prisma.situationType.update({
    where: { id: st.id },
    data: { lastAuditAt: new Date() },
  });

  return {
    situationTypeId: st.id,
    situationTypeSlug: st.slug,
    entitiesSampled: sample.length,
    missesFound,
    filterRegenerated,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function safeParseJSON(str: string): DetectionLogic {
  try {
    return JSON.parse(str);
  } catch {
    return { mode: "natural" };
  }
}

