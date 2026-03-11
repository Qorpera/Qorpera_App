import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";

// ── Types ────────────────────────────────────────────────────────────────────

export type StructuredSignal = {
  field: string;
  condition: string;
  value?: string | number;
  threshold?: number;
};

export type PreFilter = {
  entityType: string;
  signals: StructuredSignal[];
};

type DetectionLogic = {
  mode: "structured" | "natural" | "hybrid";
  structured?: { entityType: string; signals: StructuredSignal[]; excludeIf?: StructuredSignal[] };
  naturalLanguage?: string;
  preFilter?: PreFilter;
};

// ── Generate Pre-Filter ──────────────────────────────────────────────────────

export async function generatePreFilter(
  situationTypeId: string,
): Promise<PreFilter | null> {
  const situationType = await prisma.situationType.findUnique({
    where: { id: situationTypeId },
  });
  if (!situationType) return null;

  const detection: DetectionLogic = safeParseJSON(situationType.detectionLogic);
  if (detection.mode === "structured") return null; // structured doesn't need pre-filter

  const naturalDesc = detection.naturalLanguage || situationType.description;
  if (!naturalDesc) return null;

  const prompt = `You are generating a coarse structured pre-filter for a situation detection system.

Given this situation description, generate a structured pre-filter that identifies candidate entities. The filter should be BROAD — it's better to include false positives than miss real situations.

SITUATION: "${situationType.name}"
DESCRIPTION: ${naturalDesc}

Return ONLY valid JSON matching this format (no markdown, no explanation):
{
  "entityType": "the entity type slug to search (e.g. invoice, contact, deal, customer)",
  "signals": [
    { "field": "property_slug", "condition": "equals|not_equals|greater_than|less_than|days_past|days_until|contains|is_not_empty", "value": "...", "threshold": 0 }
  ]
}

Keep the signals broad — 1-3 conditions maximum. Use days_past/days_until for time-based patterns.`;

  try {
    const response = await callLLM(
      [{ role: "user", content: prompt }],
      { temperature: 0.1, maxTokens: 500, aiFunction: "reasoning" },
    );

    const parsed = extractJSON(response.content);
    if (!parsed || !parsed.entityType) return null;

    const preFilter: PreFilter = {
      entityType: String(parsed.entityType),
      signals: Array.isArray(parsed.signals) ? parsed.signals as StructuredSignal[] : [],
    };

    // Store in detectionLogic
    detection.preFilter = preFilter;
    await prisma.situationType.update({
      where: { id: situationTypeId },
      data: { detectionLogic: JSON.stringify(detection) },
    });

    return preFilter;
  } catch (err) {
    console.error(`[prefilter] Failed to generate pre-filter for ${situationType.slug}:`, err);
    return null;
  }
}

// ── Regenerate with context ──────────────────────────────────────────────────

export async function regeneratePreFilter(
  situationTypeId: string,
  missedExamples?: string[],
): Promise<PreFilter | null> {
  const situationType = await prisma.situationType.findUnique({
    where: { id: situationTypeId },
  });
  if (!situationType) return null;

  const detection: DetectionLogic = safeParseJSON(situationType.detectionLogic);
  const naturalDesc = detection.naturalLanguage || situationType.description;

  const missContext = missedExamples?.length
    ? `\n\nThe current pre-filter MISSED these entities that are actual situations:\n${missedExamples.join("\n")}\nMake the new filter broader to catch these.`
    : "";

  const statsContext = `\nCurrent stats: ${situationType.preFilterPassCount} entities passed pre-filter, ${situationType.llmConfirmCount} confirmed by AI, ${situationType.auditMissCount} missed by audit.`;

  const prompt = `You are regenerating a structured pre-filter for situation detection. The previous filter was too narrow.

SITUATION: "${situationType.name}"
DESCRIPTION: ${naturalDesc}
${statsContext}${missContext}

Return ONLY valid JSON (no markdown):
{
  "entityType": "slug",
  "signals": [{ "field": "...", "condition": "...", "value": "...", "threshold": 0 }]
}

Make this filter BROADER than before — it's a coarse filter, not a final decision.`;

  try {
    const response = await callLLM(
      [{ role: "user", content: prompt }],
      { temperature: 0.1, maxTokens: 500, aiFunction: "reasoning" },
    );

    const parsed = extractJSON(response.content);
    if (!parsed || !parsed.entityType) return null;

    const preFilter: PreFilter = {
      entityType: String(parsed.entityType),
      signals: Array.isArray(parsed.signals) ? parsed.signals as StructuredSignal[] : [],
    };

    detection.preFilter = preFilter;
    await prisma.situationType.update({
      where: { id: situationTypeId },
      data: {
        detectionLogic: JSON.stringify(detection),
        auditMissCount: 0, // reset after regen
      },
    });

    return preFilter;
  } catch (err) {
    console.error(`[prefilter] Failed to regenerate pre-filter for ${situationType.slug}:`, err);
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeParseJSON(str: string): DetectionLogic {
  try {
    return JSON.parse(str);
  } catch {
    return { mode: "natural" };
  }
}

function extractJSON(text: string): Record<string, unknown> | null {
  // Try to extract JSON from LLM response (may have markdown fences)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}
