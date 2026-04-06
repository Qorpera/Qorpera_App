/**
 * Layer 5 — Section-Aware Deep Extraction
 *
 * Extracts structured evidence from each section WITH the full-document
 * understanding from Layer 4. Instead of blind per-chunk extraction, each
 * section extraction is informed by purpose, red flags, contradictions,
 * and assembled domain expertise.
 *
 * Produces both raw claims (facts, numbers, commitments) and analytical
 * claims (insights, discrepancies, risks derived from cross-section context).
 */

import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSON } from "@/lib/json-helpers";
import {
  createExtraction,
  type EvidenceClaim,
  type EvidenceRelationship,
  type EvidenceContradiction,
} from "@/lib/evidence-registry";
import type {
  DocumentRegistration,
  DocumentProfile,
  DocumentUnderstanding,
  AnalyticalClaim,
} from "./types";

const CONCURRENCY = 3;

export interface DeepExtractionReport {
  sectionsProcessed: number;
  extractionsCreated: number;
  rawClaims: number;
  analyticalClaims: number;
  costCents: number;
}

export async function runDeepExtraction(
  registration: DocumentRegistration,
  profile: DocumentProfile,
  understanding: DocumentUnderstanding,
  assembledExpertise: string,
): Promise<DeepExtractionReport> {
  const report: DeepExtractionReport = {
    sectionsProcessed: 0,
    extractionsCreated: 0,
    rawClaims: 0,
    analyticalClaims: 0,
    costCents: 0,
  };

  // Determine sections to extract from
  let sections = understanding.criticalSections;

  // Unstructured document — treat whole doc as one section
  if (sections.length === 0) {
    sections = [
      {
        title: "Full document",
        startChar: 0,
        endChar: registration.textLength,
        importance: "full document — no sections identified",
        requiresDeepExtraction: true,
      },
    ];
  }

  const contextHeader = buildExtractionContext(
    profile,
    understanding,
    assembledExpertise,
  );
  const model = getModel("evidenceIngestion");

  // Process sections with controlled concurrency
  const executing: Promise<void>[] = [];
  for (const section of sections) {
    const task = extractSection(
      registration,
      section,
      contextHeader,
      model,
      profile,
      understanding,
      report,
    ).then(() => {
      executing.splice(executing.indexOf(task), 1);
    });
    executing.push(task);
    if (executing.length >= CONCURRENCY) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);

  return report;
}

async function extractSection(
  registration: DocumentRegistration,
  section: DocumentUnderstanding["criticalSections"][0],
  contextHeader: string,
  model: string,
  profile: DocumentProfile,
  understanding: DocumentUnderstanding,
  report: DeepExtractionReport,
): Promise<void> {
  try {
    const sectionText = registration.fullText.slice(
      section.startChar,
      section.endChar,
    );
    if (sectionText.trim().length < 50) return;

    const prompt = `${contextHeader}

## Section to Extract: "${section.title}"
Importance: ${section.importance}
Deep extraction required: ${section.requiresDeepExtraction}

Extract from this section TWO types of claims:

1. **RAW CLAIMS** — specific facts, numbers, commitments, decisions, relationships directly stated in the text.

2. **ANALYTICAL CLAIMS** — insights that emerge from reading this section WITH your knowledge of the full document:
   - "The section claims X, but the full-document understanding flagged Y as a red flag — this means Z"
   - "This number looks healthy in isolation, but combined with [finding from another section], it reveals a pattern"
   - "The author presents this positively, but the expertise domain knowledge suggests this is actually a risk indicator"

Every claim must cite the specific text. Every analytical claim must explain the reasoning chain.

Respond with JSON:
{
  "extractions": [{
    "claims": [{ "claim": "string", "type": "fact|commitment|decision|opinion|question", "confidence": 0.0-1.0, "entities": ["name"], "date": "ISO or null", "numbers": [{ "value": 0, "unit": "string", "context": "string" }] }],
    "relationships": [{ "from": "entity", "to": "entity", "type": "string", "evidence": "quoted text" }],
    "contradictions": [{ "claim": "text", "counterclaim": "text", "claimSourceId": "id", "counterSourceId": "id" }]
  }],
  "analyticalClaims": [
    { "claim": "the insight", "type": "insight|discrepancy|risk|opportunity|implication", "derivedFrom": ["raw claim text that led to this"], "expertiseBasis": "which domain knowledge informed this", "confidence": 0.0-1.0, "reasoning": "the analytical chain" }
  ]
}`;

    const response = await callLLM({
      operatorId: registration.operatorId,
      instructions: prompt,
      messages: [{ role: "user", content: sectionText }],
      model,
      maxTokens: 8000,
    });

    report.costCents += response.apiCostCents;

    const parsed = extractJSON(response.text);
    if (!parsed?.extractions) return;

    const rawExtractions = parsed.extractions as Array<Record<string, unknown>>;
    const rawAnalytical = (parsed.analyticalClaims ?? []) as Array<
      Record<string, unknown>
    >;

    // Find the closest ContentChunk for this section by position
    const sectionMidpoint =
      section.startChar + (section.endChar - section.startChar) / 2;
    const chunkId =
      findClosestChunk(
        sectionMidpoint,
        registration.textLength,
        registration.chunkIds,
      ) ??
      registration.chunkIds[0] ??
      registration.id;

    // Build document context metadata for this section
    const documentContext = {
      documentType: profile.documentType,
      sectionTitle: section.title,
      authorIntent: understanding.authorIntent,
      relevantRedFlags: understanding.redFlags
        .filter(
          (f) =>
            f.location.toLowerCase().includes(section.title.toLowerCase()) ||
            f.severity === "high",
        )
        .map((f) => ({ flag: f.flag, severity: f.severity })),
    };

    // Parse analytical claims once (shared across all extraction objects in this section)
    const analyticalClaims: AnalyticalClaim[] = rawAnalytical.map((a) => ({
      claim: (a.claim as string) ?? "",
      type: (a.type as AnalyticalClaim["type"]) ?? "insight",
      derivedFrom: Array.isArray(a.derivedFrom) ? a.derivedFrom : [],
      expertiseBasis: (a.expertiseBasis as string) ?? "",
      confidence: typeof a.confidence === "number" ? a.confidence : 0.5,
      reasoning: (a.reasoning as string) ?? "",
    }));

    for (const ext of rawExtractions) {
      const rawClaims = (ext.claims ?? []) as Array<Record<string, unknown>>;
      const rawRels = (ext.relationships ?? []) as Array<Record<string, unknown>>;
      const rawContras = (ext.contradictions ?? []) as Array<Record<string, unknown>>;

      const claims: EvidenceClaim[] = rawClaims.map((c) => ({
        claim: (c.claim as string) ?? "",
        type: (c.type as EvidenceClaim["type"]) ?? "fact",
        confidence: typeof c.confidence === "number" ? c.confidence : 0.5,
        entities: Array.isArray(c.entities) ? c.entities : [],
        date: (c.date as string) ?? null,
        numbers: Array.isArray(c.numbers) ? c.numbers : [],
      }));

      const relationships: EvidenceRelationship[] = rawRels.map((r) => ({
        from: (r.from as string) ?? "",
        to: (r.to as string) ?? "",
        type: (r.type as string) ?? "unknown",
        evidence: (r.evidence as string) ?? "",
      }));

      const contradictions: EvidenceContradiction[] = rawContras.map((c) => ({
        claim: (c.claim as string) ?? "",
        counterclaim: (c.counterclaim as string) ?? "",
        claimSourceId: (c.claimSourceId as string) ?? chunkId,
        counterSourceId: (c.counterSourceId as string) ?? chunkId,
      }));

      await createExtraction({
        operatorId: registration.operatorId,
        sourceChunkId: chunkId,
        sourceType: registration.sourceType,
        extractions: claims,
        relationships,
        contradictions,
        extractedBy: model,
        documentContext,
        ...(ext === rawExtractions[0] ? { analyticalClaims } : {}),
      });

      report.extractionsCreated++;
      report.rawClaims += claims.length;
    }

    report.analyticalClaims += analyticalClaims.length;
    report.sectionsProcessed++;
  } catch (err) {
    console.error(
      `[deep-extraction] Section "${section.title}" failed:`,
      err,
    );
  }
}

/**
 * Find the ContentChunk closest to a character position in the original document.
 * Uses chunk index as a proxy — chunk 0 = start, chunk N = end.
 */
function findClosestChunk(
  targetCharPosition: number,
  totalTextLength: number,
  knownChunkIds: string[],
): string | null {
  if (knownChunkIds.length === 0) return null;
  const targetIndex = Math.floor(
    (targetCharPosition / totalTextLength) * knownChunkIds.length,
  );
  const clampedIndex = Math.max(
    0,
    Math.min(targetIndex, knownChunkIds.length - 1),
  );
  return knownChunkIds[clampedIndex];
}

function buildExtractionContext(
  profile: DocumentProfile,
  understanding: DocumentUnderstanding,
  assembledExpertise: string,
): string {
  return `You are extracting structured evidence from a ${profile.documentType}.

${assembledExpertise}

## Full-Document Understanding (from comprehension pass)

**Purpose:** ${understanding.purpose}
**Author's Intent:** ${understanding.authorIntent}
**Key Narrative:** ${understanding.keyNarrative}

**Red Flags Identified:**
${understanding.redFlags.map((f) => `- [${f.severity}] ${f.flag} (${f.location}): ${f.explanation}`).join("\n") || "None"}

**Internal Contradictions:**
${understanding.internalContradictions.map((c) => `- "${c.claim1}" vs "${c.claim2}": ${c.analysis}`).join("\n") || "None"}

**Gaps:**
${understanding.gaps.map((g) => `- ${g.topic}: ${g.significance}`).join("\n") || "None"}

Use this understanding to inform your extraction. When you see a claim that relates to a known red flag or contradiction, note the connection in your analytical claims.`;
}
