/**
 * Layer 7 — Analytical Wiki Synthesis
 *
 * Produces wiki pages from the full intelligence gathered in Layers 2-6.
 * Pages explain what the evidence MEANS, not just what it says — the kind
 * a board member would read and say "how did you know that?"
 *
 * Model: Opus — synthesis quality is the final output quality.
 */

import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSON } from "@/lib/json-helpers";
import { processWikiUpdates } from "@/lib/wiki-engine";
import type {
  DocumentRegistration,
  DocumentProfile,
  DocumentUnderstanding,
} from "./types";

export interface SynthesisReport {
  pagesCreated: number;
  pagesUpdated: number;
  costCents: number;
}

export async function runAnalyticalSynthesis(
  registration: DocumentRegistration,
  profile: DocumentProfile,
  understanding: DocumentUnderstanding,
): Promise<SynthesisReport> {
  const report: SynthesisReport = {
    pagesCreated: 0,
    pagesUpdated: 0,
    costCents: 0,
  };
  const model = getModel("documentComprehensionDeep");

  // 1. Load all enhanced extractions for this document
  const extractions = await prisma.evidenceExtraction.findMany({
    where: {
      operatorId: registration.operatorId,
      sourceChunkId: { in: registration.chunkIds },
    },
    select: {
      extractions: true,
      analyticalClaims: true,
      relationships: true,
      contradictions: true,
    },
  });

  const allRawClaims = extractions.flatMap((e) =>
    Array.isArray(e.extractions)
      ? (e.extractions as Array<Record<string, unknown>>)
      : [],
  );
  const allAnalyticalClaims = extractions.flatMap((e) =>
    Array.isArray(e.analyticalClaims)
      ? (e.analyticalClaims as Array<Record<string, unknown>>)
      : [],
  );
  const allRelationships = extractions.flatMap((e) =>
    Array.isArray(e.relationships)
      ? (e.relationships as Array<Record<string, unknown>>)
      : [],
  );
  const allContradictions = extractions.flatMap((e) =>
    Array.isArray(e.contradictions)
      ? (e.contradictions as Array<Record<string, unknown>>)
      : [],
  );

  // 2. Load correlation findings for this document
  const correlations = await prisma.correlationFinding.findMany({
    where: {
      operatorId: registration.operatorId,
      primarySourceId: { in: registration.chunkIds },
    },
    select: {
      type: true,
      finding: true,
      significance: true,
      confidence: true,
      implications: true,
    },
  });

  // 3. Build synthesis context
  const synthesisContext = buildSynthesisContext(
    registration,
    profile,
    understanding,
    allRawClaims,
    allAnalyticalClaims,
    allRelationships,
    allContradictions,
    correlations,
  );

  // 4. Ask Opus to plan and write wiki pages
  try {
    const response = await callLLM({
      operatorId: registration.operatorId,
      instructions: SYNTHESIS_PROMPT,
      messages: [{ role: "user", content: synthesisContext }],
      model,
      maxTokens: 65_536,
      thinking: true,
      thinkingBudget: 16_000,
    });

    report.costCents += response.apiCostCents;

    const parsed = extractJSON(response.text);
    if (!parsed?.wikiPages || !Array.isArray(parsed.wikiPages)) {
      console.warn(
        `[analytical-synthesis] No wiki pages produced for ${registration.filename}`,
      );
      return report;
    }

    const rawPages = parsed.wikiPages as Array<Record<string, unknown>>;

    // 5. Process wiki updates
    await processWikiUpdates({
      operatorId: registration.operatorId,
      projectId: registration.projectId,
      updates: rawPages.map((p) => ({
        slug: (p.slug as string) ?? "untitled",
        pageType: (p.pageType as string) ?? "topic_synthesis",
        title: (p.title as string) ?? "Untitled",
        updateType:
          (p.updateType as "create" | "update" | "flag_contradiction") ??
          "create",
        content: (p.content as string) ?? "",
        sourceCitations: Array.isArray(p.sourceCitations)
          ? (p.sourceCitations as Array<{
              sourceType: "chunk" | "signal" | "entity";
              sourceId: string;
              claim: string;
            }>)
          : [],
        reasoning: (p.reasoning as string) ?? "",
      })),
      synthesisPath: "document_intelligence",
      synthesizedByModel: model,
    });

    for (const page of rawPages) {
      if (page.updateType === "update") report.pagesUpdated++;
      else report.pagesCreated++;
    }

    // 6. Mark correlation findings as resolved in wiki
    for (const corr of correlations) {
      const matchingPage = rawPages.find(
        (p) =>
          typeof p.content === "string" &&
          p.content
            .toLowerCase()
            .includes(corr.finding.slice(0, 50).toLowerCase()),
      );
      if (matchingPage) {
        await prisma.correlationFinding.updateMany({
          where: {
            operatorId: registration.operatorId,
            finding: corr.finding,
            resolvedInWikiSlug: null,
          },
          data: { resolvedInWikiSlug: (matchingPage.slug as string) ?? null },
        });
      }
    }
  } catch (err) {
    console.error(
      `[analytical-synthesis] Failed for ${registration.filename}:`,
      err,
    );
  }

  return report;
}

function buildSynthesisContext(
  registration: DocumentRegistration,
  profile: DocumentProfile,
  understanding: DocumentUnderstanding,
  rawClaims: Array<Record<string, unknown>>,
  analyticalClaims: Array<Record<string, unknown>>,
  relationships: Array<Record<string, unknown>>,
  contradictions: Array<Record<string, unknown>>,
  correlations: Array<{
    type: string;
    finding: string;
    significance: string;
    confidence: number;
    implications: string | null;
  }>,
): string {
  const redFlagsSection =
    understanding.redFlags
      .map((f) => `- [${f.severity}] ${f.flag}: ${f.explanation}`)
      .join("\n") || "None identified";

  const gapsSection =
    understanding.gaps
      .map((g) => `- ${g.topic}: ${g.significance}`)
      .join("\n") || "None identified";

  const claimsPreview = rawClaims
    .slice(0, 30)
    .map((c) => `- [${c.type}] ${c.claim} (confidence: ${c.confidence})`)
    .join("\n");
  const claimsOverflow =
    rawClaims.length > 30
      ? `\n... and ${rawClaims.length - 30} more`
      : "";

  const analyticalSection =
    analyticalClaims
      .map((a) => `- [${a.type}] ${a.claim}\n  Reasoning: ${a.reasoning}`)
      .join("\n") || "None";

  const relsSection = relationships
    .slice(0, 20)
    .map((r) => `- ${r.from} → ${r.to} (${r.type})`)
    .join("\n");

  const correlationsSection =
    correlations
      .map(
        (c) =>
          `- [${c.type}/${c.significance}] ${c.finding}${c.implications ? "\n  Implication: " + c.implications : ""}`,
      )
      .join("\n") || "None";

  const contradictionsSection =
    contradictions
      .map((c) => `- "${c.claim}" vs "${c.counterclaim}"`)
      .join("\n") || "None";

  return `## Document: ${registration.filename ?? "untitled"}
Type: ${profile.documentType}
Importance: ${profile.estimatedImportance}

## Document Understanding
Purpose: ${understanding.purpose}
Author's Intent: ${understanding.authorIntent}
Key Narrative: ${understanding.keyNarrative}

## Red Flags
${redFlagsSection}

## Gaps
${gapsSection}

## Key Raw Claims (${rawClaims.length} total)
${claimsPreview}${claimsOverflow}

## Analytical Claims (${analyticalClaims.length} total)
${analyticalSection}

## Relationships (${relationships.length} total)
${relsSection}

## Cross-Document Correlations (${correlations.length} total)
${correlationsSection}

## Contradictions (${contradictions.length} total)
${contradictionsSection}`;
}

const SYNTHESIS_PROMPT = `You are writing analytical wiki pages based on deep document intelligence.

You have a complete picture: the document's purpose, its red flags, analytical insights from domain experts, and cross-document correlations that confirm or contradict its claims.

Write wiki pages that a senior analyst would find useful. Not summaries — ANALYSIS.

Rules:
- Lead with the most important finding, not the most obvious fact
- When the document's narrative differs from what evidence shows, explain BOTH and why
- Every finding must cite sources using [src:chunkId] format
- Include analytical claims with their reasoning chains
- Cross-document correlations are the highest-value content — lead with discoveries
- Confidence scores must reflect evidence strength
- Include "Risks and Caveats" for uncertain conclusions
- Flag areas where more data would change the analysis

Think: "What would a board member need to know? What would they NOT want to miss?"

Determine which wiki pages to create or update. Common patterns:
- One page per major analytical theme (e.g., "Revenue Quality Analysis", "Client Risk Profile")
- Entity profiles enriched with document findings
- Process descriptions derived from operational documents
- Financial pattern pages from financial documents

Respond with JSON:
{
  "wikiPages": [
    {
      "slug": "page-slug",
      "pageType": "entity_profile|financial_pattern|process_description|topic_synthesis|communication_pattern",
      "title": "Analytical Page Title",
      "updateType": "create|update",
      "content": "Full markdown content with [src:chunkId] citations and analytical depth",
      "sourceCitations": [{ "sourceType": "chunk", "sourceId": "chunk-id", "claim": "what this source proves" }],
      "reasoning": "Why this page was created and what intelligence it captures"
    }
  ]
}`;
