import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import {
  createExtraction,
  type EvidenceClaim,
  type EvidenceRelationship,
  type EvidenceContradiction,
} from "@/lib/evidence-registry";
import { extractJSON } from "@/lib/json-helpers";

// ── Configuration ──────────────────────────────────────────────────────────────
const BATCH_SIZE = 8; // raw items per LLM call (full content, larger than chunks)
const CONCURRENCY = 5; // parallel extraction batches

// ── Source-type extraction prompts ─────────────────────────────────────────────

const EXTRACTION_PROMPTS: Record<string, string | null> = {
  email: `You are extracting structured evidence from email communications.

For each email in the batch, extract:
- CLAIMS: Specific factual statements, commitments ("I'll send the report by Friday"), decisions ("We decided to go with Option B"), questions asked, and opinions expressed. Each claim must quote or closely paraphrase the source text.
- RELATIONSHIPS: Who is communicating with whom, what role do they play, who reports to whom, who is a client/vendor/partner. Each relationship must cite the specific evidence.
- CONTRADICTIONS: If any claim in this batch contradicts a claim you see in another email in the same batch, flag it with both source references.

For numbers (prices, amounts, dates, quantities), always extract them with their full context — "$525/hr quoted to Client X on 2024-03-15" not just "525".

Respond ONLY with JSON matching this schema:
{
  "extractions": [
    {
      "sourceChunkId": "the chunk ID from the header",
      "claims": [
        { "claim": "string", "type": "fact|commitment|decision|opinion|question", "confidence": 0.0-1.0, "entities": ["name1", "name2"], "date": "ISO date or null", "numbers": [{ "value": number, "unit": "string", "context": "string" }] }
      ],
      "relationships": [
        { "from": "entity name", "to": "entity name", "type": "relationship type", "evidence": "quoted text" }
      ],
      "contradictions": [
        { "claim": "first claim text", "counterclaim": "contradicting claim text", "claimSourceId": "chunk ID", "counterSourceId": "chunk ID" }
      ]
    }
  ]
}`,

  slack_message: `You are extracting structured evidence from Slack/Teams messages.

Focus on: decisions made in channels, action items assigned, recurring discussion topics, escalation patterns, informal commitments, team dynamics (who responds to whom, who is consulted).

Slack messages are often informal — extract the substance beneath the casual tone. "Yeah I'll handle it" is a commitment. "Not sure about that pricing" is a question/concern about pricing.

Respond ONLY with JSON matching this schema:
{
  "extractions": [
    {
      "sourceChunkId": "the chunk ID from the header",
      "claims": [
        { "claim": "string", "type": "fact|commitment|decision|opinion|question", "confidence": 0.0-1.0, "entities": ["name1", "name2"], "date": "ISO date or null", "numbers": [{ "value": number, "unit": "string", "context": "string" }] }
      ],
      "relationships": [
        { "from": "entity name", "to": "entity name", "type": "relationship type", "evidence": "quoted text" }
      ],
      "contradictions": [
        { "claim": "first claim text", "counterclaim": "contradicting claim text", "claimSourceId": "chunk ID", "counterSourceId": "chunk ID" }
      ]
    }
  ]
}`,

  drive_doc: `You are extracting structured evidence from documents (contracts, proposals, reports, policies, templates, spreadsheets, presentations).

Focus on: document type and purpose, key claims and assertions, numerical data (financial figures, targets, KPIs), named entities (people, companies, projects), dates and deadlines, contractual terms and obligations, process descriptions, organizational policies.

For contracts/proposals: extract every specific term, price, deadline, party name, and obligation.
For reports: extract findings, recommendations, and data points.
For policies: extract rules, thresholds, and exceptions.
For templates: note what process they serve and what fields they expect.

Respond ONLY with JSON matching this schema:
{
  "extractions": [
    {
      "sourceChunkId": "the chunk ID from the header",
      "claims": [
        { "claim": "string", "type": "fact|commitment|decision|opinion|question", "confidence": 0.0-1.0, "entities": ["name1", "name2"], "date": "ISO date or null", "numbers": [{ "value": number, "unit": "string", "context": "string" }] }
      ],
      "relationships": [
        { "from": "entity name", "to": "entity name", "type": "relationship type", "evidence": "quoted text" }
      ],
      "contradictions": [
        { "claim": "first claim text", "counterclaim": "contradicting claim text", "claimSourceId": "chunk ID", "counterSourceId": "chunk ID" }
      ]
    }
  ]
}`,

  file_upload: `You are extracting structured evidence from uploaded documents. These may be any document type — financial records, legal documents, project plans, HR records, operational manuals.

Apply the same extraction rigor as for drive documents. Every specific claim, number, commitment, relationship, and contradiction.

Respond ONLY with JSON matching this schema:
{
  "extractions": [
    {
      "sourceChunkId": "the chunk ID from the header",
      "claims": [
        { "claim": "string", "type": "fact|commitment|decision|opinion|question", "confidence": 0.0-1.0, "entities": ["name1", "name2"], "date": "ISO date or null", "numbers": [{ "value": number, "unit": "string", "context": "string" }] }
      ],
      "relationships": [
        { "from": "entity name", "to": "entity name", "type": "relationship type", "evidence": "quoted text" }
      ],
      "contradictions": [
        { "claim": "first claim text", "counterclaim": "contradicting claim text", "claimSourceId": "chunk ID", "counterSourceId": "chunk ID" }
      ]
    }
  ]
}`,

  uploaded_doc: null, // alias — use drive_doc prompt

  calendar_note: `You are extracting structured evidence from calendar events and meeting records.

Focus on: meeting participants and their roles, meeting frequency/recurrence patterns, meeting purposes and topics, decisions made in meetings, action items from meetings, external vs internal meetings.

Respond ONLY with JSON matching this schema:
{
  "extractions": [
    {
      "sourceChunkId": "the chunk ID from the header",
      "claims": [
        { "claim": "string", "type": "fact|commitment|decision|opinion|question", "confidence": 0.0-1.0, "entities": ["name1", "name2"], "date": "ISO date or null", "numbers": [{ "value": number, "unit": "string", "context": "string" }] }
      ],
      "relationships": [
        { "from": "entity name", "to": "entity name", "type": "relationship type", "evidence": "quoted text" }
      ],
      "contradictions": []
    }
  ]
}`,
};

const DEFAULT_EXTRACTION_PROMPT = `You are extracting structured evidence from organizational data. Extract every specific claim, number, commitment, relationship, and contradiction you can find.

Respond ONLY with JSON matching this schema:
{
  "extractions": [
    {
      "sourceChunkId": "the chunk ID from the header",
      "claims": [
        { "claim": "string", "type": "fact|commitment|decision|opinion|question", "confidence": 0.0-1.0, "entities": ["name1", "name2"], "date": "ISO date or null", "numbers": [{ "value": number, "unit": "string", "context": "string" }] }
      ],
      "relationships": [
        { "from": "entity name", "to": "entity name", "type": "relationship type", "evidence": "quoted text" }
      ],
      "contradictions": [
        { "claim": "first claim text", "counterclaim": "contradicting claim text", "claimSourceId": "chunk ID", "counterSourceId": "chunk ID" }
      ]
    }
  ]
}`;

// ── Concurrency helper ─────────────────────────────────────────────────────────

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const executing: Promise<void>[] = [];
  for (const item of items) {
    const p = fn(item).then(() => {
      executing.splice(executing.indexOf(p), 1);
    });
    executing.push(p);
    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface IngestionReport {
  totalChunks: number;
  batchesProcessed: number;
  extractionsCreated: number;
  totalClaims: number;
  totalRelationships: number;
  totalContradictions: number;
  costCents: number;
  durationMs: number;
  errors: number;
  bySourceType: Record<string, { chunks: number; claims: number }>;
}

interface ExtractionBatch {
  sourceType: string;
  chunks: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    content: string;
    metadata: unknown;
    chunkIndex: number;
    createdAt: Date;
  }>;
}

// ── Orchestrator ───────────────────────────────────────────────────────────────

export async function runTotalIngestion(
  operatorId: string,
  options?: {
    onProgress?: (msg: string) => Promise<void>;
    analysisId?: string;
    forceReExtract?: boolean;
  },
): Promise<IngestionReport> {
  const startTime = Date.now();
  const report: IngestionReport = {
    totalChunks: 0,
    batchesProcessed: 0,
    extractionsCreated: 0,
    totalClaims: 0,
    totalRelationships: 0,
    totalContradictions: 0,
    costCents: 0,
    durationMs: 0,
    errors: 0,
    bySourceType: {},
  };

  const progress = options?.onProgress ?? (async () => {});

  if (options?.forceReExtract) {
    const deleted = await prisma.evidenceExtraction.deleteMany({
      where: { operatorId },
    });
    console.log(`[evidence-ingestion] Force re-extract: cleared ${deleted.count} existing extractions`);
  }

  // 1. Load ALL raw content for this operator
  const rawItems = await prisma.rawContent.findMany({
    where: { operatorId, rawBody: { not: null } },
    select: {
      id: true,
      sourceType: true,
      sourceId: true,
      rawBody: true,
      rawMetadata: true,
      occurredAt: true,
    },
    orderBy: { occurredAt: "asc" },
  });

  // Map to chunk-compatible shape for downstream processing
  const chunks = rawItems.map((r) => ({
    id: r.id,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    content: r.rawBody!,
    metadata: r.rawMetadata as unknown,
    chunkIndex: 0,
    createdAt: r.occurredAt,
  }));

  report.totalChunks = chunks.length;
  await progress(`Found ${chunks.length} raw content items to extract evidence from`);

  if (chunks.length === 0) return report;

  // 2. Skip items that already have extractions (idempotent re-run)
  const existingExtractions = await prisma.evidenceExtraction.findMany({
    where: { operatorId },
    select: { sourceChunkId: true },
  });
  const alreadyExtracted = new Set(existingExtractions.map((e) => e.sourceChunkId));
  const unprocessedChunks = chunks.filter((c) => !alreadyExtracted.has(c.id));

  if (unprocessedChunks.length < chunks.length) {
    await progress(
      `Skipping ${chunks.length - unprocessedChunks.length} already-extracted items`,
    );
  }

  if (unprocessedChunks.length === 0) {
    report.durationMs = Date.now() - startTime;
    return report;
  }

  // 3. Group by source type for appropriate prompts
  const bySourceType = new Map<string, typeof unprocessedChunks>();
  for (const chunk of unprocessedChunks) {
    const group = bySourceType.get(chunk.sourceType) ?? [];
    group.push(chunk);
    bySourceType.set(chunk.sourceType, group);
  }

  // 4. Create batches within each source type
  const allBatches: ExtractionBatch[] = [];
  for (const [sourceType, typeChunks] of bySourceType) {
    for (let i = 0; i < typeChunks.length; i += BATCH_SIZE) {
      allBatches.push({
        sourceType,
        chunks: typeChunks.slice(i, i + BATCH_SIZE),
      });
    }
  }

  await progress(
    `Processing ${allBatches.length} batches across ${bySourceType.size} source types (${CONCURRENCY} concurrent)`,
  );

  // 5. Process batches with controlled concurrency
  const model = getModel("evidenceIngestion");
  let completedBatches = 0;

  await runWithConcurrency(allBatches, CONCURRENCY, async (batch) => {
    await processExtractionBatch(operatorId, batch, model, report);
    completedBatches++;
    if (completedBatches % 10 === 0 || completedBatches === allBatches.length) {
      await progress(
        `Extracted evidence from ${completedBatches}/${allBatches.length} batches (${report.extractionsCreated} extractions, ${report.totalClaims} claims)`,
      );
    }
  });

  report.durationMs = Date.now() - startTime;
  await progress(
    `Total ingestion complete: ${report.extractionsCreated} extractions, ${report.totalClaims} claims, ${report.totalContradictions} contradictions in ${Math.round(report.durationMs / 1000)}s ($${(report.costCents / 100).toFixed(2)})`,
  );

  return report;
}

// ── Batch processor ────────────────────────────────────────────────────────────

async function processExtractionBatch(
  operatorId: string,
  batch: ExtractionBatch,
  model: string,
  report: IngestionReport,
): Promise<void> {
  try {
    // Resolve prompt: check direct match, then uploaded_doc→drive_doc alias, then default
    let promptTemplate =
      EXTRACTION_PROMPTS[batch.sourceType] ??
      (batch.sourceType === "uploaded_doc" ? EXTRACTION_PROMPTS["drive_doc"] : null) ??
      DEFAULT_EXTRACTION_PROMPT;

    // null means alias — uploaded_doc already handled above, but guard for safety
    if (promptTemplate === null) promptTemplate = DEFAULT_EXTRACTION_PROMPT;

    // Format chunks with their IDs as headers
    const chunksFormatted = batch.chunks
      .map((chunk) => {
        const meta =
          chunk.metadata && typeof chunk.metadata === "string"
            ? JSON.parse(chunk.metadata)
            : (chunk.metadata as Record<string, unknown> | null) ?? {};
        const header = `[CHUNK_ID: ${chunk.id}] [sourceType: ${batch.sourceType}] [index: ${chunk.chunkIndex}]`;
        const metaLine = (meta as any).subject
          ? `Subject: ${(meta as any).subject}`
          : (meta as any).fileName
            ? `File: ${(meta as any).fileName}`
            : (meta as any).channel
              ? `Channel: ${(meta as any).channel}`
              : "";
        return `${header}${metaLine ? "\n" + metaLine : ""}\n${chunk.content}`;
      })
      .join("\n\n════════════════════════════════════════\n\n");

    const response = await callLLM({
      instructions: promptTemplate,
      messages: [{ role: "user", content: chunksFormatted }],
      model,
      maxTokens: 8000,
    });

    report.costCents += response.apiCostCents;

    // Parse response
    const parsed = extractJSON(response.text);
    if (!parsed || !Array.isArray((parsed as any).extractions)) {
      console.warn(
        `[evidence-ingestion] Failed to parse extraction response for batch (${batch.sourceType})`,
      );
      report.errors++;
      return;
    }

    const batchChunkIds = new Set(batch.chunks.map((c) => c.id));

    // Store extractions
    for (const extraction of (parsed as any).extractions) {
      const chunkId = extraction.sourceChunkId;
      if (!batchChunkIds.has(chunkId)) {
        console.warn(
          `[evidence-ingestion] Extraction references unknown chunk ${chunkId}, skipping`,
        );
        continue;
      }

      const claims: EvidenceClaim[] = (extraction.claims ?? []).map((c: any) => ({
        claim: c.claim ?? "",
        type: c.type ?? "fact",
        confidence: typeof c.confidence === "number" ? c.confidence : 0.5,
        entities: Array.isArray(c.entities) ? c.entities : [],
        date: c.date ?? null,
        numbers: Array.isArray(c.numbers) ? c.numbers : [],
      }));

      const relationships: EvidenceRelationship[] = (extraction.relationships ?? []).map(
        (r: any) => ({
          from: r.from ?? "",
          to: r.to ?? "",
          type: r.type ?? "unknown",
          evidence: r.evidence ?? "",
        }),
      );

      const contradictions: EvidenceContradiction[] = (extraction.contradictions ?? []).map(
        (c: any) => ({
          claim: c.claim ?? "",
          counterclaim: c.counterclaim ?? "",
          claimSourceId: c.claimSourceId ?? chunkId,
          counterSourceId: c.counterSourceId ?? chunkId,
        }),
      );

      await createExtraction({
        operatorId,
        sourceChunkId: chunkId,
        sourceType: batch.sourceType,
        extractions: claims,
        relationships,
        contradictions,
        extractedBy: model,
      });

      report.extractionsCreated++;
      report.totalClaims += claims.length;
      report.totalRelationships += relationships.length;
      report.totalContradictions += contradictions.length;

      // Track per source type
      if (!report.bySourceType[batch.sourceType]) {
        report.bySourceType[batch.sourceType] = { chunks: 0, claims: 0 };
      }
      report.bySourceType[batch.sourceType].chunks++;
      report.bySourceType[batch.sourceType].claims += claims.length;
    }

    report.batchesProcessed++;
  } catch (err) {
    console.error(
      `[evidence-ingestion] Batch failed (${batch.sourceType}, ${batch.chunks.length} chunks):`,
      err,
    );
    report.errors++;
  }
}
