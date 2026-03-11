import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import { getEntityContext } from "@/lib/entity-resolution";
import { assembleSituationContext, type SituationContext } from "@/lib/context-assembly";
import { reasonAboutSituation } from "@/lib/reasoning-engine";
import { isEntityInScope } from "@/lib/situation-scope";

// ── Types ────────────────────────────────────────────────────────────────────

type StructuredSignal = {
  field: string;
  condition: string;
  value?: string | number;
  threshold?: number;
};

type DetectionLogic = {
  mode: "structured" | "natural" | "hybrid";
  structured?: { entityType: string; signals: StructuredSignal[]; excludeIf?: StructuredSignal[] };
  naturalLanguage?: string;
  preFilter?: { entityType: string; signals: StructuredSignal[] };
};

export type DetectionResult = {
  situationTypeId: string;
  situationTypeName: string;
  entityId: string;
  entityDisplayName: string;
  confidence: number;
  detectedBy: "structured" | "llm" | "both";
  situationId?: string;
};

type CandidateEntity = {
  id: string;
  displayName: string;
  entityTypeSlug: string;
  properties: Record<string, string>;
};

// ── Event-driven hook (called by event-materializer) ─────────────────────────

export async function notifySituationDetectors(
  operatorId: string,
  entityIds: string[],
  triggerEventId?: string,
): Promise<void> {
  if (entityIds.length === 0) return;

  try {
    for (const entityId of entityIds) {
      const entity = await prisma.entity.findUnique({
        where: { id: entityId },
        include: { entityType: true },
      });
      if (!entity) continue;

      await detectSituationsForEntity(
        operatorId,
        entityId,
        entity.entityType.slug,
        triggerEventId,
      );
    }
  } catch (err) {
    console.error("[situation-detector] Error in event-driven detection:", err);
  }
}

// ── Main: detect all situations for an operator ──────────────────────────────

export async function detectSituations(operatorId: string): Promise<DetectionResult[]> {
  const start = Date.now();
  const results: DetectionResult[] = [];

  const situationTypes = await prisma.situationType.findMany({
    where: { operatorId, enabled: true },
  });

  for (const st of situationTypes) {
    try {
      const typeResults = await detectForSituationType(operatorId, st);
      results.push(...typeResults);
    } catch (err) {
      console.error(`[situation-detector] Error detecting ${st.slug}:`, err);
    }
  }

  const duration = Date.now() - start;
  if (duration > 5 * 60 * 1000) {
    console.warn(`[situation-detector] Detection took ${(duration / 1000).toFixed(1)}s — exceeds 5 min threshold`);
  } else {
    console.log(`[situation-detector] Detection completed in ${(duration / 1000).toFixed(1)}s — ${results.length} situations found`);
  }

  return results;
}

// ── Detect for a single entity ───────────────────────────────────────────────

export async function detectSituationsForEntity(
  operatorId: string,
  entityId: string,
  entityTypeSlug: string,
  triggerEventId?: string,
): Promise<DetectionResult[]> {
  const results: DetectionResult[] = [];

  const situationTypes = await prisma.situationType.findMany({
    where: { operatorId, enabled: true },
  });

  // Get entity properties once
  const entityCtx = await getEntityContext(operatorId, entityId);
  if (!entityCtx) return results;

  const candidate: CandidateEntity = {
    id: entityId,
    displayName: entityCtx.displayName,
    entityTypeSlug,
    properties: entityCtx.properties,
  };

  for (const st of situationTypes) {
    try {
      const detection: DetectionLogic = safeParseDetection(st.detectionLogic);
      const targetType = getTargetEntityType(detection);

      // Skip if this entity type doesn't match
      if (targetType && targetType !== entityTypeSlug) continue;

      // Skip if scoped and entity is out of scope
      if (st.scopeEntityId) {
        const inScope = await isEntityInScope(operatorId, st.scopeEntityId, st.scopeDepth, entityId);
        if (!inScope) continue;
      }

      const match = await evaluateCandidate(candidate, detection, st.description);
      if (!match) continue;

      // Dedup check
      const existing = await prisma.situation.findFirst({
        where: {
          situationTypeId: st.id,
          triggerEntityId: entityId,
          status: { notIn: ["resolved", "closed"] },
        },
      });
      if (existing) continue;

      // Assemble context and create situation
      const context = await assembleSituationContext(operatorId, st.id, entityId, triggerEventId);
      const situation = await createDetectedSituation(
        operatorId, st, entityId, context, match.confidence, triggerEventId,
      );

      // Fire-and-forget reasoning
      reasonAboutSituation(situation.id).catch((err) =>
        console.error(`[situation-detector] Reasoning failed for situation ${situation.id}:`, err),
      );

      results.push({
        situationTypeId: st.id,
        situationTypeName: st.name,
        entityId,
        entityDisplayName: candidate.displayName,
        confidence: match.confidence,
        detectedBy: match.detectedBy,
        situationId: situation.id,
      });
    } catch (err) {
      console.error(`[situation-detector] Error evaluating ${st.slug} for entity ${entityId}:`, err);
    }
  }

  return results;
}

// ── Detect for a specific situation type ─────────────────────────────────────

async function detectForSituationType(
  operatorId: string,
  st: { id: string; slug: string; name: string; description: string; detectionLogic: string; preFilterPassCount: number; llmConfirmCount: number; scopeEntityId: string | null; scopeDepth: number | null },
): Promise<DetectionResult[]> {
  const results: DetectionResult[] = [];
  const detection: DetectionLogic = safeParseDetection(st.detectionLogic);
  const targetType = getTargetEntityType(detection);

  if (!targetType) return results;

  // Get candidate entities
  let candidates = await getCandidateEntities(operatorId, targetType, detection);
  if (candidates.length === 0) return results;

  // Filter by scope if set
  if (st.scopeEntityId) {
    const scopeEntityId = st.scopeEntityId;
    const scopeDepth = st.scopeDepth ?? null;
    const inScopeChecks = await Promise.all(
      candidates.map((c) => isEntityInScope(operatorId, scopeEntityId, scopeDepth, c.id)),
    );
    candidates = candidates.filter((_, i) => inScopeChecks[i]);
    if (candidates.length === 0) return results;
  }

  // Track pre-filter stats
  let preFilterPassCount = 0;
  let llmConfirmCount = 0;

  // Evaluate candidates
  const matches: Array<{ candidate: CandidateEntity; confidence: number; detectedBy: "structured" | "llm" | "both" }> = [];

  if (detection.mode === "structured") {
    for (const c of candidates) {
      if (evaluateStructuredSignals(c.properties, detection.structured?.signals ?? [], detection.structured?.excludeIf)) {
        matches.push({ candidate: c, confidence: 1.0, detectedBy: "structured" });
      }
    }
  } else if (detection.mode === "natural") {
    preFilterPassCount = candidates.length;
    const llmResults = await batchLLMEvaluate(candidates, st.description, detection.naturalLanguage ?? st.description);
    for (const r of llmResults) {
      if (r.matches) {
        llmConfirmCount++;
        matches.push({ candidate: r.candidate, confidence: r.confidence, detectedBy: "llm" });
      }
    }
  } else if (detection.mode === "hybrid") {
    // First filter by structured rules
    const structPassed: CandidateEntity[] = [];
    for (const c of candidates) {
      if (evaluateStructuredSignals(c.properties, detection.structured?.signals ?? [], detection.structured?.excludeIf)) {
        structPassed.push(c);
      }
    }
    preFilterPassCount = structPassed.length;

    if (structPassed.length > 0) {
      const llmResults = await batchLLMEvaluate(structPassed, st.description, detection.naturalLanguage ?? st.description);
      for (const r of llmResults) {
        if (r.matches) {
          llmConfirmCount++;
          matches.push({ candidate: r.candidate, confidence: r.confidence, detectedBy: "both" });
        }
      }
    }
  }

  // Update pre-filter stats
  if (detection.mode !== "structured" && (preFilterPassCount > 0 || llmConfirmCount > 0)) {
    await prisma.situationType.update({
      where: { id: st.id },
      data: {
        preFilterPassCount: { increment: preFilterPassCount },
        llmConfirmCount: { increment: llmConfirmCount },
      },
    }).catch(() => {}); // non-critical
  }

  // Create situations for matches
  for (const m of matches) {
    // Dedup
    const existing = await prisma.situation.findFirst({
      where: {
        situationTypeId: st.id,
        triggerEntityId: m.candidate.id,
        status: { notIn: ["resolved", "closed"] },
      },
    });
    if (existing) continue;

    const context = await assembleSituationContext(operatorId, st.id, m.candidate.id);
    const situation = await createDetectedSituation(
      operatorId, st, m.candidate.id, context, m.confidence,
    );

    // Fire-and-forget reasoning
    reasonAboutSituation(situation.id).catch((err) =>
      console.error(`[situation-detector] Reasoning failed for situation ${situation.id}:`, err),
    );

    results.push({
      situationTypeId: st.id,
      situationTypeName: st.name,
      entityId: m.candidate.id,
      entityDisplayName: m.candidate.displayName,
      confidence: m.confidence,
      detectedBy: m.detectedBy,
      situationId: situation.id,
    });
  }

  return results;
}

// ── Get candidate entities ───────────────────────────────────────────────────

async function getCandidateEntities(
  operatorId: string,
  entityTypeSlug: string,
  detection: DetectionLogic,
): Promise<CandidateEntity[]> {
  // Find the entity type
  const entityType = await prisma.entityType.findFirst({
    where: { operatorId, slug: entityTypeSlug },
  });
  if (!entityType) return [];

  // Get all entities of this type with their properties
  const entities = await prisma.entity.findMany({
    where: { entityTypeId: entityType.id, operatorId, status: "active" },
    include: {
      propertyValues: { include: { property: true } },
    },
    take: 500, // safety limit
  });

  return entities.map((e) => {
    const properties: Record<string, string> = {};
    for (const pv of e.propertyValues) {
      properties[pv.property.slug] = pv.value;
    }
    return {
      id: e.id,
      displayName: e.displayName,
      entityTypeSlug,
      properties,
    };
  });
}

// ── Evaluate a single candidate ──────────────────────────────────────────────

async function evaluateCandidate(
  candidate: CandidateEntity,
  detection: DetectionLogic,
  description: string,
): Promise<{ confidence: number; detectedBy: "structured" | "llm" | "both" } | null> {
  if (detection.mode === "structured") {
    const signals = detection.structured?.signals ?? [];
    const excludeIf = detection.structured?.excludeIf;
    if (evaluateStructuredSignals(candidate.properties, signals, excludeIf)) {
      return { confidence: 1.0, detectedBy: "structured" };
    }
    return null;
  }

  if (detection.mode === "natural") {
    // Check pre-filter first if available
    if (detection.preFilter?.signals?.length) {
      if (!evaluateStructuredSignals(candidate.properties, detection.preFilter.signals)) {
        return null;
      }
    }
    const result = await singleLLMEvaluate(candidate, description, detection.naturalLanguage ?? description);
    return result?.matches ? { confidence: result.confidence, detectedBy: "llm" } : null;
  }

  if (detection.mode === "hybrid") {
    const signals = detection.structured?.signals ?? [];
    const excludeIf = detection.structured?.excludeIf;
    if (!evaluateStructuredSignals(candidate.properties, signals, excludeIf)) {
      return null;
    }
    const result = await singleLLMEvaluate(candidate, description, detection.naturalLanguage ?? description);
    return result?.matches ? { confidence: result.confidence, detectedBy: "both" } : null;
  }

  return null;
}

// ── Structured Signal Evaluation ─────────────────────────────────────────────

function evaluateStructuredSignals(
  properties: Record<string, string>,
  signals: StructuredSignal[],
  excludeIf?: StructuredSignal[],
): boolean {
  // All signals must match
  for (const signal of signals) {
    if (!evaluateSignal(properties, signal)) return false;
  }

  // Check exclusions — if any match, exclude
  if (excludeIf) {
    for (const signal of excludeIf) {
      if (evaluateSignal(properties, signal)) return false;
    }
  }

  return signals.length > 0;
}

function evaluateSignal(properties: Record<string, string>, signal: StructuredSignal): boolean {
  const value = properties[signal.field];

  switch (signal.condition) {
    case "equals":
      return value === String(signal.value ?? "");
    case "not_equals":
      return value !== String(signal.value ?? "");
    case "greater_than":
      return value !== undefined && parseFloat(value) > (signal.threshold ?? signal.value as number ?? 0);
    case "less_than":
      return value !== undefined && parseFloat(value) < (signal.threshold ?? signal.value as number ?? 0);
    case "days_past": {
      if (!value) return false;
      const date = new Date(value);
      if (isNaN(date.getTime())) return false;
      const daysDiff = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff > (signal.threshold ?? 0);
    }
    case "days_until": {
      if (!value) return false;
      const date = new Date(value);
      if (isNaN(date.getTime())) return false;
      const daysDiff = (date.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return daysDiff < (signal.threshold ?? 0);
    }
    case "contains":
      return value !== undefined && value.toLowerCase().includes(String(signal.value ?? "").toLowerCase());
    case "is_empty":
      return value === undefined || value === null || value === "";
    case "is_not_empty":
      return value !== undefined && value !== null && value !== "";
    default:
      return false;
  }
}

// ── LLM Evaluation ──────────────────────────────────────────────────────────

type LLMEvalResult = {
  candidate: CandidateEntity;
  matches: boolean;
  confidence: number;
  reasoning: string;
};

async function singleLLMEvaluate(
  candidate: CandidateEntity,
  situationName: string,
  naturalLanguage: string,
): Promise<{ matches: boolean; confidence: number } | null> {
  const results = await batchLLMEvaluate([candidate], situationName, naturalLanguage);
  return results[0] ?? null;
}

async function batchLLMEvaluate(
  candidates: CandidateEntity[],
  situationName: string,
  naturalLanguage: string,
): Promise<LLMEvalResult[]> {
  const results: LLMEvalResult[] = [];

  // Process in batches of 5
  for (let i = 0; i < candidates.length; i += 5) {
    const batch = candidates.slice(i, i + 5);

    const entitiesStr = batch.map((c, idx) => {
      const propsStr = Object.entries(c.properties)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n");
      return `ENTITY ${idx + 1} (${c.entityTypeSlug}): ${c.displayName}\n${propsStr}`;
    }).join("\n\n");

    const prompt = `You are evaluating whether business entities match a situation pattern.

SITUATION PATTERN: "${situationName}"
DESCRIPTION: ${naturalLanguage}

${entitiesStr}

For each entity, determine if it currently matches the situation pattern.
Respond with ONLY valid JSON (no markdown): an array with one object per entity in order:
[{ "matches": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation" }]`;

    try {
      const response = await callLLM(
        [{ role: "user", content: prompt }],
        { temperature: 0.1, maxTokens: 1000, aiFunction: "reasoning" },
      );

      const parsed = extractJSONArray(response.content);
      if (Array.isArray(parsed)) {
        for (let j = 0; j < batch.length; j++) {
          const result = parsed[j];
          if (result) {
            results.push({
              candidate: batch[j],
              matches: !!result.matches,
              confidence: typeof result.confidence === "number" ? result.confidence : 0.5,
              reasoning: String(result.reasoning ?? ""),
            });
          }
        }
      }
    } catch (err) {
      console.error("[situation-detector] LLM evaluation failed, skipping batch:", err);
      // Skip this batch — structured detection still works
    }
  }

  return results;
}

// ── Situation Creation ───────────────────────────────────────────────────────

async function createDetectedSituation(
  operatorId: string,
  situationType: { id: string; name: string },
  triggerEntityId: string,
  context: SituationContext,
  confidence: number,
  triggerEventId?: string,
) {
  // Calculate severity — if entity has a monetary property, use it
  const severity = calculateSeverity(context);

  const situation = await prisma.situation.create({
    data: {
      operatorId,
      situationTypeId: situationType.id,
      triggerEntityId,
      triggerEventId: triggerEventId ?? null,
      source: "detected",
      status: "detected",
      confidence,
      severity,
      contextSnapshot: JSON.stringify(context),
    },
  });

  // Link trigger event
  if (triggerEventId) {
    await prisma.situationEvent.create({
      data: { situationId: situation.id, eventId: triggerEventId },
    }).catch(() => {}); // may fail if event doesn't exist
  }

  // Create notification
  await prisma.notification.create({
    data: {
      operatorId,
      title: `${situationType.name}: ${context.triggerEntity.displayName}`,
      body: `New situation detected with ${(confidence * 100).toFixed(0)}% confidence.`,
      sourceType: "situation",
      sourceId: situation.id,
    },
  }).catch(() => {});

  return situation;
}

function calculateSeverity(context: SituationContext): number {
  const props = context.triggerEntity.properties;
  // Look for monetary properties
  const monetaryKeys = ["amount", "value", "total", "price", "arr", "mrr", "revenue"];
  for (const key of monetaryKeys) {
    const val = props[key];
    if (val) {
      const num = parseFloat(val.replace(/[^0-9.-]/g, ""));
      if (!isNaN(num) && num > 0) {
        // Simple log scale: $100 → 0.3, $1000 → 0.5, $10000 → 0.7, $100000 → 0.9
        return Math.min(1, Math.max(0.1, 0.1 + 0.2 * Math.log10(num)));
      }
    }
  }
  return 0.5; // default
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTargetEntityType(detection: DetectionLogic): string | null {
  if (detection.structured?.entityType) return detection.structured.entityType;
  if (detection.preFilter?.entityType) return detection.preFilter.entityType;
  return null;
}

function safeParseDetection(str: string): DetectionLogic {
  try {
    return JSON.parse(str);
  } catch {
    return { mode: "natural" };
  }
}

function extractJSONArray(text: string): Array<Record<string, unknown>> | null {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();
  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return null;
  }
}
