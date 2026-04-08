// ── Living Research Engine ──────────────────────────────────────────────
// Upgrades incremental synthesis: new data gets evidence-extracted, checked
// against existing wiki pages for relevance, and triggers targeted
// micro-investigations when significant new information is found.
//
// Called by cron every 2 hours per operator.

import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import {
  createExtraction,
  type EvidenceClaim,
  type EvidenceRelationship,
  type EvidenceContradiction,
} from "@/lib/evidence-registry";
import { processWikiUpdates, searchPages } from "@/lib/wiki-engine";
import { extractJSON } from "@/lib/json-helpers";

// ── Types ──────────────────────────────────────────────────

export interface LivingResearchReport {
  chunksProcessed: number;
  evidenceExtracted: number;
  significantFindings: number;
  wikiPagesUpdated: number;
  wikiPagesCreated: number;
  bookmarksEmitted: number;
  costCents: number;
  durationMs: number;
}

// ── Main Entry ─────────────────────────────────────────────

export async function runLivingResearch(
  operatorId: string,
): Promise<LivingResearchReport> {
  const startTime = Date.now();
  const report: LivingResearchReport = {
    chunksProcessed: 0,
    evidenceExtracted: 0,
    significantFindings: 0,
    wikiPagesUpdated: 0,
    wikiPagesCreated: 0,
    bookmarksEmitted: 0,
    costCents: 0,
    durationMs: 0,
  };

  // 1. Load new unprocessed chunks (since last run)
  //    Uses wikiProcessedAt as the marker — same as background synthesis
  const newChunks = await prisma.contentChunk.findMany({
    where: { operatorId, wikiProcessedAt: null },
    select: {
      id: true,
      sourceType: true,
      sourceId: true,
      content: true,
      metadata: true,
      chunkIndex: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  if (newChunks.length === 0) {
    report.durationMs = Date.now() - startTime;
    return report;
  }

  report.chunksProcessed = newChunks.length;

  // 2. Extract evidence from new chunks (idempotent — skip already-extracted)
  const existingExtractions = await prisma.evidenceExtraction.findMany({
    where: { operatorId, sourceChunkId: { in: newChunks.map((c) => c.id) } },
    select: { sourceChunkId: true },
  });
  const alreadyExtracted = new Set(existingExtractions.map((e) => e.sourceChunkId));
  const needsExtraction = newChunks.filter((c) => !alreadyExtracted.has(c.id));

  if (needsExtraction.length > 0) {
    const BATCH_SIZE = 10;
    const model = getModel("evidenceIngestion");

    for (let i = 0; i < needsExtraction.length; i += BATCH_SIZE) {
      const batch = needsExtraction.slice(i, i + BATCH_SIZE);
      try {
        const chunksFormatted = batch
          .map((chunk) => {
            const meta = chunk.metadata ? JSON.parse(chunk.metadata as string) : {};
            return `[CHUNK_ID: ${chunk.id}] [${chunk.sourceType}]\n${meta.subject ? `Subject: ${meta.subject}\n` : ""}${chunk.content}`;
          })
          .join("\n\n════\n\n");

        const response = await callLLM({
          operatorId,
          instructions: EVIDENCE_EXTRACTION_PROMPT,
          messages: [{ role: "user", content: chunksFormatted }],
          model,
          maxTokens: 6000,
        });

        report.costCents += response.apiCostCents;
        const parsed = extractJSON(response.text) as {
          extractions?: Array<{
            sourceChunkId: string;
            claims?: EvidenceClaim[];
            relationships?: EvidenceRelationship[];
            contradictions?: EvidenceContradiction[];
          }>;
        } | null;

        if (parsed?.extractions && Array.isArray(parsed.extractions)) {
          for (const ext of parsed.extractions) {
            if (!batch.some((c) => c.id === ext.sourceChunkId)) continue;
            await createExtraction({
              operatorId,
              sourceChunkId: ext.sourceChunkId,
              sourceType:
                batch.find((c) => c.id === ext.sourceChunkId)?.sourceType ?? "unknown",
              extractions: (ext.claims ?? []) as EvidenceClaim[],
              relationships: (ext.relationships ?? []) as EvidenceRelationship[],
              contradictions: (ext.contradictions ?? []) as EvidenceContradiction[],
              extractedBy: model,
            });
            report.evidenceExtracted++;
          }
        }
      } catch (err) {
        console.error("[living-research] Evidence extraction batch failed:", err);
      }
    }
  }

  // 3. Significance assessment — which new evidence matters?
  const recentExtractions = await prisma.evidenceExtraction.findMany({
    where: {
      operatorId,
      sourceChunkId: { in: newChunks.map((c) => c.id) },
    },
    select: {
      id: true,
      extractions: true,
      relationships: true,
      contradictions: true,
      sourceType: true,
    },
  });

  if (recentExtractions.length === 0) {
    await markChunksProcessed(operatorId, newChunks.map((c) => c.id));
    report.durationMs = Date.now() - startTime;
    return report;
  }

  // Collect entities and claims from new evidence
  const mentionedEntities = new Set<string>();
  const newClaims: Array<{
    claim: string;
    type: string;
    entities: string[];
    sourceType: string;
  }> = [];
  const newContradictions: Array<{ claim: string; counterclaim: string }> = [];

  for (const ext of recentExtractions) {
    const claims = Array.isArray(ext.extractions)
      ? (ext.extractions as Record<string, unknown>[])
      : [];
    for (const c of claims) {
      const entities = Array.isArray(c.entities) ? (c.entities as string[]) : [];
      entities.forEach((e) => mentionedEntities.add(e));
      newClaims.push({
        claim: String(c.claim ?? ""),
        type: String(c.type ?? "fact"),
        entities,
        sourceType: ext.sourceType,
      });
    }
    const contras = Array.isArray(ext.contradictions)
      ? (ext.contradictions as Record<string, unknown>[])
      : [];
    for (const c of contras) {
      newContradictions.push({
        claim: String(c.claim ?? ""),
        counterclaim: String(c.counterclaim ?? ""),
      });
    }
  }

  // 4. Find affected wiki pages — pages about mentioned entities or related topics
  const seenSlugs = new Set<string>();
  const matchedSlugs: string[] = [];

  for (const entityName of [...mentionedEntities].slice(0, 20)) {
    const pages = await searchPages(operatorId, entityName, { limit: 3 });
    for (const p of pages) {
      if (!seenSlugs.has(p.slug)) {
        seenSlugs.add(p.slug);
        matchedSlugs.push(p.slug);
      }
    }
  }

  // Fetch full page data for matched slugs (need id + full content)
  const affectedPages =
    matchedSlugs.length > 0
      ? await prisma.knowledgePage.findMany({
          where: {
            operatorId,
            slug: { in: matchedSlugs.slice(0, 15) },
            scope: "operator",
          },
          select: {
            id: true,
            slug: true,
            title: true,
            pageType: true,
            content: true,
          },
        })
      : [];

  if (affectedPages.length === 0 && newClaims.length === 0) {
    await markChunksProcessed(operatorId, newChunks.map((c) => c.id));
    report.durationMs = Date.now() - startTime;
    return report;
  }

  // 5. Micro-investigation: determine what's significant and how to update wiki
  const claimsSummary = newClaims
    .slice(0, 50)
    .map(
      (c, i) =>
        `${i + 1}. [${c.type}] ${c.claim} (entities: ${c.entities.join(", ") || "none"})`,
    )
    .join("\n");

  const contradictionsSummary =
    newContradictions.length > 0
      ? `\n## New Contradictions Detected\n${newContradictions
          .slice(0, 10)
          .map((c) => `- "${c.claim}" vs "${c.counterclaim}"`)
          .join("\n")}`
      : "";

  const pagesSummary = affectedPages
    .slice(0, 10)
    .map((p) => `### ${p.title} (${p.pageType})\n${p.content.slice(0, 500)}...`)
    .join("\n\n");

  const sourceTypeCount = new Set(newClaims.map((c) => c.sourceType)).size;

  // Load domain expertise for significance assessment
  let domainContext = "";
  try {
    const op = await prisma.operator.findUnique({
      where: { id: operatorId },
      select: { intelligenceAccess: true },
    });
    if (op?.intelligenceAccess) {
      const { getSystemWikiPages } = await import("@/lib/wiki-engine");
      const topEntity = [...mentionedEntities][0] ?? "business operations";
      const pages = await getSystemWikiPages({ query: topEntity, maxPages: 1 }).catch(() => []);
      if (pages.length > 0) {
        domainContext = `\n\n## Domain Context (industry best practices)\n${pages[0].content.slice(0, 1500)}`;
      }
    }
  } catch { /* non-fatal */ }

  const assessmentPrompt = `You are reviewing new evidence that arrived for an organization. Determine what's significant enough to update the wiki.

## New Evidence (${newClaims.length} claims from ${sourceTypeCount} source types)

${claimsSummary}
${contradictionsSummary}

## Existing Wiki Pages That May Be Affected

${pagesSummary || "(no existing pages matched)"}
${domainContext}

## Task

For each significant finding, decide:
1. **update** — new evidence strengthens, corrects, or adds to an existing wiki page
2. **bookmark** — something noteworthy that doesn't fit existing pages (a new engagement, risk, opportunity)
3. **skip** — routine data that doesn't change understanding

Only include genuinely significant items. Routine emails, standard transactions, and expected patterns should be skipped.

For wiki updates, include [[cross-references]] to other related wiki pages where appropriate.

Respond ONLY with JSON:
{
  "updates": [
    {
      "targetPageSlug": "existing page slug",
      "updateType": "update",
      "newContent": "paragraph to ADD to the existing page (not a full rewrite — just the new information with [src:chunkId] citation)",
      "reason": "why this matters"
    }
  ],
  "bookmarks": [
    {
      "type": "active_engagement|risk|contradiction|opportunity|notable_pattern|unresolved_question",
      "reason": "what caught attention",
      "subject": "entity or topic name",
      "confidence": 0.0-1.0
    }
  ],
  "summary": "one sentence: what's new and significant"
}`;

  try {
    const assessModel = getModel("livingResearch");
    const assessResponse = await callLLM({
      operatorId,
      instructions: assessmentPrompt,
      messages: [
        {
          role: "user",
          content: "Assess the new evidence and produce your update plan.",
        },
      ],
      model: assessModel,
      maxTokens: 4000,
    });

    report.costCents += assessResponse.apiCostCents;

    const assessment = extractJSON(assessResponse.text) as {
      updates?: Array<{
        targetPageSlug: string;
        newContent: string;
        reason: string;
      }>;
      bookmarks?: Array<{
        type: string;
        reason: string;
        subject?: string;
        confidence?: number;
      }>;
      summary?: string;
    } | null;

    if (assessment) {
      // 6. Apply wiki updates
      if (assessment.updates && Array.isArray(assessment.updates)) {
        for (const update of assessment.updates) {
          if (!update.targetPageSlug || !update.newContent) continue;

          const targetPage = affectedPages.find(
            (p) => p.slug === update.targetPageSlug,
          );
          if (!targetPage) continue;

          const updatedContent =
            targetPage.content +
            `\n\n---\n*Updated ${new Date().toISOString().split("T")[0]} — living research*\n\n${update.newContent}`;

          await processWikiUpdates({
            operatorId,
            updates: [
              {
                slug: targetPage.slug,
                pageType: targetPage.pageType,
                title: targetPage.title,
                updateType: "update",
                content: updatedContent,
                sourceCitations: [],
                reasoning: update.reason,
              },
            ],
            synthesisPath: "living_research",
            synthesizedByModel: assessModel,
          });

          report.wikiPagesUpdated++;
          report.significantFindings++;
        }
      }

      // 7. Store bookmarks
      if (assessment.bookmarks && Array.isArray(assessment.bookmarks)) {
        for (const bm of assessment.bookmarks) {
          if (!bm.reason) continue;

          const relevantPage = bm.subject
            ? affectedPages.find((p) =>
                p.title.toLowerCase().includes(bm.subject!.toLowerCase()),
              )
            : null;
          const attachPage = relevantPage ?? affectedPages[0];

          if (attachPage) {
            try {
              await prisma.wikiBookmark.create({
                data: {
                  operatorId,
                  pageId: attachPage.id,
                  pageSlug: attachPage.slug,
                  bookmarkType: bm.type || "notable_pattern",
                  reason: bm.reason,
                  confidence: Math.max(0, Math.min(1, bm.confidence ?? 0.5)),
                  subjectHint: bm.subject || null,
                },
              });
              report.bookmarksEmitted++;
            } catch (err) {
              console.warn("[living-research] Bookmark creation failed:", err);
            }
          }

          report.significantFindings++;
        }
      }

      if (assessment.summary) {
        console.log(`[living-research] ${operatorId}: ${assessment.summary}`);
      }
    }
  } catch (err) {
    console.error("[living-research] Assessment failed:", err);
  }

  // 8. Mark all chunks as processed
  await markChunksProcessed(operatorId, newChunks.map((c) => c.id));

  report.durationMs = Date.now() - startTime;
  console.log(
    `[living-research] ${operatorId}: ${report.evidenceExtracted} evidence, ` +
      `${report.significantFindings} findings, ${report.wikiPagesUpdated} pages updated, ` +
      `${report.bookmarksEmitted} bookmarks in ${Math.round(report.durationMs / 1000)}s`,
  );

  return report;
}

// ── Helpers ────────────────────────────────────────────────

async function markChunksProcessed(operatorId: string, chunkIds: string[]): Promise<void> {
  if (chunkIds.length === 0) return;
  await prisma.contentChunk.updateMany({
    where: { id: { in: chunkIds }, operatorId },
    data: { wikiProcessedAt: new Date() },
  });
}

// ── Prompts ────────────────────────────────────────────────

const EVIDENCE_EXTRACTION_PROMPT = `Extract structured evidence from these data items. For each chunk, extract claims (facts, commitments, decisions), relationships between entities, and contradictions with other claims.

Respond ONLY with JSON:
{
  "extractions": [
    {
      "sourceChunkId": "id",
      "claims": [
        {
          "claim": "text",
          "type": "fact|commitment|decision|opinion|question",
          "confidence": 0.0-1.0,
          "entities": ["name"],
          "date": null,
          "numbers": []
        }
      ],
      "relationships": [
        { "from": "name", "to": "name", "type": "type", "evidence": "text" }
      ],
      "contradictions": []
    }
  ]
}`;
