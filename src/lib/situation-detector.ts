import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { getEntityContext } from "@/lib/entity-resolution";
import { getPageForEntity } from "@/lib/wiki-engine";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";
import { isEntityInScope } from "@/lib/situation-scope";
import { extractJSONArray } from "@/lib/json-helpers";
import { checkConfirmationRate } from "@/lib/confirmation-rate";

// ── Types ────────────────────────────────────────────────────────────────────

interface TriggerEntityContext {
  displayName: string;
  type: string;
  properties: Record<string, string>;
  wikiSummary?: string | null;
}

type StructuredSignal = {
  field: string;
  condition: string;
  value?: string | number;
  threshold?: number;
};

// ── Lightweight Entity Context Loader ──────────────────────────────────────

async function loadTriggerEntityContext(
  operatorId: string,
  entityId: string,
): Promise<TriggerEntityContext> {
  const entity = await prisma.entity.findFirst({
    where: { id: entityId, operatorId },
    include: {
      entityType: { select: { name: true } },
      propertyValues: {
        include: { property: { select: { slug: true } } },
      },
    },
  });

  if (!entity) {
    return { displayName: "Unknown", type: "unknown", properties: {} };
  }

  const properties: Record<string, string> = {};
  for (const pv of entity.propertyValues) {
    properties[pv.property.slug] = pv.value;
  }

  let wikiSummary: string | null = null;
  try {
    const page = await getPageForEntity(operatorId, entityId);
    if (page) wikiSummary = page.content.slice(0, 500);
  } catch (err) {
    console.error("[situation-detector] Wiki lookup failed:", err);
  }

  return {
    displayName: entity.displayName,
    type: entity.entityType.name,
    properties,
    wikiSummary,
  };
}

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

  // Emergency stop — highest priority gate, checked before anything else
  const detOperator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { aiPaused: true, billingStatus: true, freeDetectionStartedAt: true, freeDetectionSituationCount: true },
  });
  if (detOperator?.aiPaused) {
    console.log(`[situation-detector] Skipping operator ${operatorId} — AI paused`);
    return results;
  }

  // Detection cap check for free/past_due operators
  if (detOperator) {
    const { checkDetectionCap } = await import("@/lib/billing-gate");
    const cap = checkDetectionCap(detOperator);
    if (!cap.allowed) {
      console.log(`[situation-detector] Skipping operator ${operatorId}: ${cap.reason}`);
      return results;
    }
  }

  const situationTypes = await prisma.situationType.findMany({
    where: { operatorId, enabled: true },
  });

  // Pre-cache entity type categories to avoid repeated DB lookups per situation type
  const entityTypeCategories = new Map<string, string>();
  const allEntityTypes = await prisma.entityType.findMany({
    where: { operatorId },
    select: { slug: true, defaultCategory: true },
  });
  for (const et of allEntityTypes) {
    entityTypeCategories.set(et.slug, et.defaultCategory);
  }

  for (const st of situationTypes) {
    try {
      const typeResults = await detectForSituationType(operatorId, st, entityTypeCategories);
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

async function detectSituationsForEntity(
  operatorId: string,
  entityId: string,
  entityTypeSlug: string,
  triggerEventId?: string,
): Promise<DetectionResult[]> {
  const results: DetectionResult[] = [];
  const correlationId = `${operatorId}:reason_situation:${Date.now()}`;

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
      const triggerEntity = await loadTriggerEntityContext(operatorId, entityId);
      const signals = detection.structured?.signals;
      const situation = await createDetectedSituation(
        operatorId, st, entityId, triggerEntity, match.confidence, triggerEventId,
        {
          detectedBy: match.detectedBy,
          llmReasoning: match.reasoning,
          matchedSignals: signals,
          matchedValues: signals ? Object.fromEntries(signals.map(s => [s.field, candidate.properties[s.field] ?? ""])) : undefined,
        },
      );

      // Enqueue reasoning for Bastion worker
      enqueueWorkerJob("reason_situation", operatorId, { situationId: situation.id }, correlationId).catch((err) =>
        console.error(`[situation-detector] Failed to enqueue reasoning for ${situation.id}:`, err),
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
  entityTypeCategories?: Map<string, string>,
): Promise<DetectionResult[]> {
  const results: DetectionResult[] = [];
  const correlationId = `${operatorId}:reason_situation:${Date.now()}`;
  const detection: DetectionLogic = safeParseDetection(st.detectionLogic);
  const targetType = getTargetEntityType(detection);

  // Get candidate entities
  let candidates: CandidateEntity[];

  if (targetType) {
    candidates = await getCandidateEntities(operatorId, targetType, detection);
  } else if (detection.mode === "natural" || detection.mode === "hybrid") {
    // Natural/hybrid mode without entity type filter — scan active entities
    // Scope by department if the situation type is scoped (limits blast radius)
    candidates = await getNaturalModeCandidates(operatorId, st.scopeEntityId);
  } else {
    // Structured mode requires an entity type — can't evaluate without properties to check
    return results;
  }

  if (candidates.length === 0) return results;

  // Filter by scope if set — but skip for digital entity types (invoices, deals,
  // tickets, etc.) which are operator-wide resources with no department membership.
  // The scopeEntityId still determines who "owns" detected situations, but digital
  // entities must be scanned operator-wide or they'll never be found.
  if (st.scopeEntityId) {
    const isDigitalScan = targetType
      ? entityTypeCategories
        ? entityTypeCategories.get(targetType) === "digital"
        : await isDigitalEntityType(operatorId, targetType)
      : false;

    if (!isDigitalScan) {
      const scopeEntityId = st.scopeEntityId;
      const scopeDepth = st.scopeDepth ?? null;
      const inScopeChecks = await Promise.all(
        candidates.map((c) => isEntityInScope(operatorId, scopeEntityId, scopeDepth, c.id)),
      );
      candidates = candidates.filter((_, i) => inScopeChecks[i]);
      if (candidates.length === 0) return results;
    }
  }

  // Track pre-filter stats
  let preFilterPassCount = 0;
  let llmConfirmCount = 0;

  // Evaluate candidates
  const matches: Array<{
    candidate: CandidateEntity;
    confidence: number;
    detectedBy: "structured" | "llm" | "both";
    reasoning?: string;
    matchedSignals?: StructuredSignal[];
    matchedValues?: Record<string, string>;
  }> = [];

  if (detection.mode === "structured") {
    for (const c of candidates) {
      if (evaluateStructuredSignals(c.properties, detection.structured?.signals ?? [], detection.structured?.excludeIf)) {
        const signalFields = detection.structured?.signals ?? [];
        matches.push({ candidate: c, confidence: 1.0, detectedBy: "structured", matchedSignals: signalFields, matchedValues: Object.fromEntries(signalFields.map(s => [s.field, c.properties[s.field] ?? ""])) });
      }
    }
  } else if (detection.mode === "natural") {
    preFilterPassCount = candidates.length;
    const llmResults = await batchLLMEvaluate(candidates, st.description, detection.naturalLanguage ?? st.description);
    for (const r of llmResults) {
      if (r.matches) {
        llmConfirmCount++;
        matches.push({ candidate: r.candidate, confidence: r.confidence, detectedBy: "llm", reasoning: r.reasoning });
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
          const hybridSignalFields = detection.structured?.signals ?? [];
          matches.push({ candidate: r.candidate, confidence: r.confidence, detectedBy: "both", reasoning: r.reasoning, matchedSignals: hybridSignalFields, matchedValues: Object.fromEntries(hybridSignalFields.map(s => [s.field, r.candidate.properties[s.field] ?? ""])) });
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

    const triggerEntity = await loadTriggerEntityContext(operatorId, m.candidate.id);
    const situation = await createDetectedSituation(
      operatorId, st, m.candidate.id, triggerEntity, m.confidence,
      undefined,
      { detectedBy: m.detectedBy, matchedSignals: m.matchedSignals, matchedValues: m.matchedValues, llmReasoning: m.reasoning },
    );

    // Enqueue reasoning for Bastion worker
    enqueueWorkerJob("reason_situation", operatorId, { situationId: situation.id }, correlationId).catch((err) =>
      console.error(`[situation-detector] Failed to enqueue reasoning for ${situation.id}:`, err),
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

// ── Natural mode candidates (no entity type filter) ─────────────────────────

const NATURAL_MODE_SCAN_LIMIT = 200;

async function getNaturalModeCandidates(
  operatorId: string,
  scopeEntityId: string | null,
): Promise<CandidateEntity[]> {
  const baseWhere: Record<string, unknown> = {
    operatorId,
    status: "active",
    category: "base",
  };

  if (scopeEntityId) {
    const memberIds = await getDepartmentMemberIds(operatorId, scopeEntityId);
    if (memberIds.length === 0) return [];
    baseWhere.id = { in: memberIds };
  }

  const baseEntities = await prisma.entity.findMany({
    where: baseWhere,
    include: {
      propertyValues: { include: { property: true } },
      entityType: true,
    },
    take: NATURAL_MODE_SCAN_LIMIT,
  });

  const results: CandidateEntity[] = baseEntities.map((e) => {
    const properties: Record<string, string> = {};
    for (const pv of e.propertyValues) {
      properties[pv.property.slug] = pv.value;
    }
    return {
      id: e.id,
      displayName: e.displayName,
      entityTypeSlug: e.entityType.slug,
      properties,
    };
  });

  // If not department-scoped, also include external entities (clients, partners)
  if (!scopeEntityId && results.length < NATURAL_MODE_SCAN_LIMIT) {
    const externalEntities = await prisma.entity.findMany({
      where: {
        operatorId,
        status: "active",
        category: "external",
      },
      include: {
        propertyValues: { include: { property: true } },
        entityType: true,
      },
      take: NATURAL_MODE_SCAN_LIMIT - results.length,
    });

    for (const e of externalEntities) {
      const properties: Record<string, string> = {};
      for (const pv of e.propertyValues) {
        properties[pv.property.slug] = pv.value;
      }
      results.push({
        id: e.id,
        displayName: e.displayName,
        entityTypeSlug: e.entityType.slug,
        properties,
      });
    }
  }

  return results;
}

async function getDepartmentMemberIds(
  operatorId: string,
  domainId: string,
): Promise<string[]> {
  const homeMembers = await prisma.entity.findMany({
    where: { operatorId, primaryDomainId: domainId, category: "base", status: "active" },
    select: { id: true },
  });

  const crossRels = await prisma.relationship.findMany({
    where: {
      OR: [
        { fromEntityId: domainId, relationshipType: { slug: "domain-member" } },
        { toEntityId: domainId, relationshipType: { slug: "domain-member" } },
      ],
    },
    select: { fromEntityId: true, toEntityId: true },
  });
  const crossIds = crossRels
    .map((r) => (r.fromEntityId === domainId ? r.toEntityId : r.fromEntityId));

  return [...new Set([...homeMembers.map((m) => m.id), ...crossIds])];
}

// ── Evaluate a single candidate ──────────────────────────────────────────────

async function evaluateCandidate(
  candidate: CandidateEntity,
  detection: DetectionLogic,
  description: string,
): Promise<{ confidence: number; detectedBy: "structured" | "llm" | "both"; reasoning?: string } | null> {
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
    return result?.matches ? { confidence: result.confidence, detectedBy: "llm", reasoning: result.reasoning } : null;
  }

  if (detection.mode === "hybrid") {
    const signals = detection.structured?.signals ?? [];
    const excludeIf = detection.structured?.excludeIf;
    if (!evaluateStructuredSignals(candidate.properties, signals, excludeIf)) {
      return null;
    }
    const result = await singleLLMEvaluate(candidate, description, detection.naturalLanguage ?? description);
    return result?.matches ? { confidence: result.confidence, detectedBy: "both", reasoning: result.reasoning } : null;
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
): Promise<{ matches: boolean; confidence: number; reasoning: string } | null> {
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
      const response = await callLLM({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        maxTokens: 1000,
        aiFunction: "reasoning",
        model: getModel("contentDetection"),
      });

      const parsed = extractJSONArray(response.text);
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
  triggerEntity: TriggerEntityContext,
  confidence: number,
  triggerEventId?: string,
  triggerInfo?: { detectedBy: "structured" | "llm" | "both"; matchedSignals?: StructuredSignal[]; matchedValues?: Record<string, string>; llmReasoning?: string },
) {
  const severity = calculateSeverity(triggerEntity.properties);

  // Build trigger evidence based on detection method
  let triggerEvidence: string | null = null;
  let triggerSummary: string | null = null;

  if (triggerInfo) {
    if (triggerInfo.detectedBy === "structured") {
      triggerEvidence = JSON.stringify({
        type: "structured",
        matchedSignals: triggerInfo.matchedSignals ?? [],
        matchedValues: triggerInfo.matchedValues ?? {},
        entityName: triggerEntity.displayName,
        entityType: triggerEntity.type,
      });
      const signalDescriptions = (triggerInfo.matchedSignals ?? []).map(s => {
        const val = triggerInfo.matchedValues?.[s.field] ?? s.value ?? s.threshold;
        return `${s.field} ${s.condition} ${val}`;
      });
      triggerSummary = `${triggerEntity.displayName}: ${signalDescriptions.join(", ")}`.slice(0, 300);
    } else if (triggerInfo.detectedBy === "llm") {
      triggerEvidence = JSON.stringify({
        type: "natural",
        reasoning: triggerInfo.llmReasoning ?? "",
        entityName: triggerEntity.displayName,
        entityType: triggerEntity.type,
        properties: triggerEntity.properties,
      });
      triggerSummary = (triggerInfo.llmReasoning ?? `Pattern detected for ${triggerEntity.displayName}`).slice(0, 300);
    } else if (triggerInfo.detectedBy === "both") {
      triggerEvidence = JSON.stringify({
        type: "hybrid",
        matchedSignals: triggerInfo.matchedSignals ?? [],
        matchedValues: triggerInfo.matchedValues ?? {},
        llmReasoning: triggerInfo.llmReasoning ?? "",
        entityName: triggerEntity.displayName,
        entityType: triggerEntity.type,
      });
      triggerSummary = (triggerInfo.llmReasoning ?? `${triggerEntity.displayName}: pattern confirmed by structured + AI analysis`).slice(0, 300);
    }
  }

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
      triggerEvidence,
      triggerSummary,
      contextSnapshot: JSON.stringify({ triggerEntity, wikiSummary: triggerEntity.wikiSummary }),
    },
  });

  // Link trigger event
  if (triggerEventId) {
    await prisma.situationEvent.create({
      data: { situationId: situation.id, eventId: triggerEventId },
    }).catch(() => {}); // may fail if event doesn't exist
  }

  // Free tier tracking: set start date and increment counter
  trackFreeDetection(operatorId).catch(console.error);

  // Increment detectedCount on the SituationType
  await prisma.situationType.update({
    where: { id: situationType.id },
    data: { detectedCount: { increment: 1 } },
  }).catch(() => {});

  // Check confirmation rate degradation
  checkConfirmationRate(situationType.id).catch(console.error);

  return situation;
}

export async function trackFreeDetection(operatorId: string): Promise<void> {
  const op = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { billingStatus: true, freeDetectionStartedAt: true, freeDetectionSituationCount: true },
  });
  if (!op || op.billingStatus === "active") return;

  const updates: Record<string, unknown> = {
    freeDetectionSituationCount: { increment: 1 },
  };
  if (!op.freeDetectionStartedAt) {
    updates.freeDetectionStartedAt = new Date();
  }

  await prisma.operator.update({
    where: { id: operatorId },
    data: updates,
  });

  // Check if cap hit — notify admins
  if (op.freeDetectionSituationCount + 1 >= 50) {
    const { sendNotificationToAdmins } = await import("@/lib/notification-dispatch");
    await sendNotificationToAdmins({
      operatorId,
      type: "system_alert",
      title: "Free detection limit reached",
      body: "Qorpera has detected 50 situations in your organization. Add credits to continue detection and start acting on situations.",
      sourceType: "operator",
      sourceId: operatorId,
    }).catch(console.error);
  }
}

function calculateSeverity(props: Record<string, string>): number {
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

async function isDigitalEntityType(operatorId: string, entityTypeSlug: string): Promise<boolean> {
  const et = await prisma.entityType.findFirst({
    where: { operatorId, slug: entityTypeSlug },
    select: { defaultCategory: true },
  });
  return et?.defaultCategory === "digital";
}

function safeParseDetection(str: string): DetectionLogic {
  try {
    return JSON.parse(str);
  } catch {
    return { mode: "natural" };
  }
}

