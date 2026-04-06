/**
 * Layer 6 — Cross-Document Correlation
 *
 * After a document is understood and extracted, check its claims against
 * ALL other evidence. Finds discrepancies between a report's narrative and
 * operational data, confirmations from independent sources, and implications
 * that span multiple documents.
 *
 * Uses Opus — cross-document reasoning is highest-judgment work.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSON } from "@/lib/json-helpers";
import type { DocumentRegistration, DocumentUnderstanding } from "./types";

const BATCH_SIZE = 4;

export interface CorrelationReport {
  findingsCreated: number;
  confirmations: number;
  contradictions: number;
  gaps: number;
  implications: number;
  patterns: number;
  costCents: number;
}

export async function runCorrelation(
  registration: DocumentRegistration,
  understanding: DocumentUnderstanding,
): Promise<CorrelationReport> {
  const report: CorrelationReport = {
    findingsCreated: 0,
    confirmations: 0,
    contradictions: 0,
    gaps: 0,
    implications: 0,
    patterns: 0,
    costCents: 0,
  };

  const queries = understanding.crossReferenceQueries;
  if (queries.length === 0) return report;

  const model = getModel("documentComprehensionDeep");

  // Exclude the document's own chunks from correlation search
  const excludeChunkIds =
    registration.chunkIds.length > 0
      ? Prisma.join(registration.chunkIds)
      : Prisma.sql`'__none__'`;

  for (let i = 0; i < queries.length; i += BATCH_SIZE) {
    const batch = queries.slice(i, i + BATCH_SIZE);

    const evidencePerQuery = await Promise.all(
      batch.map((query) =>
        gatherEvidence(registration.operatorId, query, excludeChunkIds),
      ),
    );

    const queryContext = batch
      .map(
        (query, idx) =>
          `### Query: ${query}\n\nEvidence from other sources:\n${evidencePerQuery[idx]}`,
      )
      .join("\n\n════════════════\n\n");

    try {
      const response = await callLLM({
        operatorId: registration.operatorId,
        instructions: CORRELATION_PROMPT,
        messages: [{ role: "user", content: queryContext }],
        model,
        maxTokens: 65_536,
        thinking: true,
        thinkingBudget: 16_000,
      });

      report.costCents += response.apiCostCents;

      const parsed = extractJSON(response.text);
      const findings = (parsed?.findings ?? []) as Array<
        Record<string, unknown>
      >;

      for (const finding of findings) {
        const type = validateFindingType(finding.type as string);

        await prisma.correlationFinding.create({
          data: {
            operatorId: registration.operatorId,
            type,
            finding: (finding.finding as string) ?? "",
            significance: validateSignificance(
              finding.significance as string,
            ),
            confidence:
              typeof finding.confidence === "number"
                ? finding.confidence
                : 0.5,
            primarySourceId:
              registration.chunkIds[0] ?? registration.id,
            correlatedSourceIds: [],
            implications: (finding.implications as string) ?? null,
          },
        });

        report.findingsCreated++;
        switch (type) {
          case "confirmation":
            report.confirmations++;
            break;
          case "contradiction":
            report.contradictions++;
            break;
          case "gap":
            report.gaps++;
            break;
          case "implication":
            report.implications++;
            break;
          case "pattern":
            report.patterns++;
            break;
        }
      }
    } catch (err) {
      console.error(`[correlation] Batch failed:`, err);
    }
  }

  return report;
}

async function gatherEvidence(
  operatorId: string,
  query: string,
  excludeChunkIds: Prisma.Sql,
): Promise<string> {
  const parts: string[] = [];

  // Build a loose ILIKE pattern from the first few query words
  const queryPattern = `%${query.split(" ").slice(0, 4).join("%")}%`;

  const registryResults = await prisma.$queryRaw<
    Array<{
      id: string;
      sourceType: string;
      extractions: unknown;
      analyticalClaims: unknown;
    }>
  >`
    SELECT id, "sourceType", extractions, "analyticalClaims"
    FROM "EvidenceExtraction"
    WHERE "operatorId" = ${operatorId}
      AND (extractions::text ILIKE ${queryPattern}
        OR "analyticalClaims"::text ILIKE ${queryPattern})
      AND "sourceChunkId" NOT IN (${excludeChunkIds})
    ORDER BY "extractedAt" DESC
    LIMIT 5
  `;

  if (registryResults.length > 0) {
    parts.push("Evidence registry findings:");
    for (const r of registryResults) {
      const claims = Array.isArray(r.extractions)
        ? (r.extractions as Array<{ claim?: string }>).slice(0, 3)
        : [];
      for (const c of claims) {
        if (c.claim) parts.push(`- [${r.sourceType}] ${c.claim}`);
      }
      if (Array.isArray(r.analyticalClaims)) {
        for (const a of (
          r.analyticalClaims as Array<{ claim?: string }>
        ).slice(0, 2)) {
          if (a.claim) parts.push(`- [analytical] ${a.claim}`);
        }
      }
    }
  }

  // Search wiki pages for corroborating/contradicting knowledge
  const { searchPages } = await import("@/lib/wiki-engine");
  const wikiResults = await searchPages(operatorId, query, { limit: 3 });

  if (wikiResults.length > 0) {
    parts.push("\nWiki page findings:");
    for (const p of wikiResults) {
      parts.push(
        `- [${p.pageType}] ${p.title}: ${p.contentPreview.slice(0, 300)}`,
      );
    }
  }

  return parts.length > 0
    ? parts.join("\n")
    : "No relevant evidence found in other sources.";
}

function validateFindingType(
  type: string,
): "confirmation" | "contradiction" | "gap" | "implication" | "pattern" {
  const valid = [
    "confirmation",
    "contradiction",
    "gap",
    "implication",
    "pattern",
  ] as const;
  return (valid as readonly string[]).includes(type)
    ? (type as (typeof valid)[number])
    : "gap";
}

function validateSignificance(
  sig: string,
): "critical" | "significant" | "minor" {
  const valid = ["critical", "significant", "minor"] as const;
  return (valid as readonly string[]).includes(sig)
    ? (sig as (typeof valid)[number])
    : "minor";
}

const CORRELATION_PROMPT = `You are assessing whether a document's claims are supported by other evidence.

For each cross-reference query below, you have:
1. The query (what needs to be checked)
2. Evidence from other data sources (emails, other documents, wiki pages)

For each, determine:
- **confirmation**: other evidence supports the document's claim
- **contradiction**: other evidence conflicts with the document's claim (MOST VALUABLE — explain the discrepancy)
- **gap**: the query couldn't be answered — we don't have data to verify this
- **implication**: the combination of the document's claim and other evidence reveals something neither source stated explicitly

Respond with JSON:
{
  "findings": [
    {
      "query": "the original query",
      "type": "confirmation|contradiction|gap|implication",
      "finding": "detailed explanation of what was found",
      "significance": "critical|significant|minor",
      "confidence": 0.0-1.0,
      "primaryEvidence": "what the document claims",
      "correlatedEvidence": "what other sources show",
      "implications": "what this means for understanding the business"
    }
  ]
}`;
