import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { processWikiUpdates } from "@/lib/wiki-engine";
import { verifyDraftPages } from "@/lib/wiki-verification";
import { embedChunks } from "@/lib/rag/embedder";

// ── Types ───────────────────────────────────────────────

interface SynthesisBatch {
  targetPage: {
    slug: string;
    pageType: string;
    title: string;
    subjectEntityId?: string;
    existingContent?: string;
  };
  sourceData: Array<{
    id: string;
    type: "chunk" | "signal";
    content: string;
    metadata: Record<string, unknown>;
    sourceType: string;
    occurredAt?: Date;
  }>;
}

interface BackgroundSynthesisReport {
  mode: "onboarding" | "incremental";
  dataProcessed: { chunks: number; signals: number };
  pagesCreated: number;
  pagesUpdated: number;
  pagesVerified: number;
  pagesQuarantined: number;
  errors: number;
  costCents: number;
  durationMs: number;
}

interface ChunkData {
  id: string;
  content: string;
  sourceType: string;
  sourceId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

interface SignalData {
  id: string;
  signalType: string;
  actorEntityId: string | null;
  targetEntityIds: string[];
  metadata: Record<string, unknown>;
  occurredAt: Date;
}

// ── Main Entry Point ────────────────────────────────────

export async function runBackgroundSynthesis(
  operatorId: string,
  options?: {
    mode?: "onboarding" | "incremental";
    projectId?: string;
  },
): Promise<BackgroundSynthesisReport> {
  const mode = options?.mode ?? "incremental";
  const startTime = performance.now();
  const report: BackgroundSynthesisReport = {
    mode,
    dataProcessed: { chunks: 0, signals: 0 },
    pagesCreated: 0,
    pagesUpdated: 0,
    pagesVerified: 0,
    pagesQuarantined: 0,
    errors: 0,
    costCents: 0,
    durationMs: 0,
  };

  console.log(
    `[background-synthesis] Starting ${mode} synthesis for operator ${operatorId}`,
  );

  // Check for outcome-driven staleness before synthesis
  if (mode === "incremental") {
    try {
      const { checkOutcomeStaleness } = await import("@/lib/reflection-engine");
      const flagged = await checkOutcomeStaleness(operatorId);
      if (flagged > 0) {
        console.log(`[background-synthesis] Flagged ${flagged} pages as stale due to high rejection rate`);
      }
    } catch (err) {
      console.error("[background-synthesis] Staleness check failed:", err);
    }
  }

  if (mode === "onboarding") {
    await runOnboardingSynthesis(operatorId, options?.projectId, report);
  } else {
    await runIncrementalSynthesis(operatorId, options?.projectId, report);
  }

  report.durationMs = Math.round(performance.now() - startTime);
  console.log(`[background-synthesis] Complete: ${JSON.stringify(report)}`);

  return report;
}

// ── Onboarding Synthesis ────────────────────────────────

async function runOnboardingSynthesis(
  operatorId: string,
  projectId: string | undefined,
  report: BackgroundSynthesisReport,
): Promise<void> {
  // Load ALL unprocessed data (no batch limit for onboarding)
  const { chunks, signals } = await loadUnprocessedData(
    operatorId,
    projectId,
    5000,
  );
  report.dataProcessed = { chunks: chunks.length, signals: signals.length };

  if (chunks.length === 0 && signals.length === 0) {
    console.log("[background-synthesis] No data to process");
    return;
  }

  // Phase 1: Required pages (Tiers 1-4)
  console.log("[background-synthesis] Phase 1: Required pages");
  await createRequiredPages(operatorId, projectId, chunks, signals, report);

  // Mark all source data as processed
  await markProcessed(chunks, signals);

  // Phase 2: Gap-filling loop
  console.log("[background-synthesis] Phase 2: Gap-filling loop");
  await runGapFillingLoop(operatorId, projectId, report);

  // Phase 3: Completion report
  const finalEvaluation = await evaluateWikiCoverage(operatorId, projectId);

  console.log(
    `[background-synthesis] Onboarding complete. Final coverage: ${finalEvaluation.overallCoverage} (confidence: ${finalEvaluation.confidence})`,
  );

  if (finalEvaluation.gaps.length > 0) {
    console.log(
      `[background-synthesis] Remaining gaps: ${finalEvaluation.gaps.map((g) => g.suggestedTitle).join(", ")}`,
    );
  }

  // Notify admins
  try {
    const { sendNotificationToAdmins } = await import(
      "@/lib/notification-dispatch"
    );
    await sendNotificationToAdmins({
      operatorId,
      type: "system_alert",
      title: "Knowledge wiki onboarding complete",
      body: `Wiki created with ${report.pagesCreated} pages (${report.pagesVerified} verified, ${report.pagesQuarantined} quarantined). Coverage: ${finalEvaluation.overallCoverage} (confidence: ${(finalEvaluation.confidence * 100).toFixed(0)}%). ${finalEvaluation.gaps.length > 0 ? `${finalEvaluation.gaps.length} remaining gaps will be filled as more data arrives.` : "No significant gaps detected."}`,
      sourceType: "wiki",
      sourceId: operatorId,
    });
  } catch {
    // Notification send is best-effort
  }
}

// ── Gap-Filling Loop ────────────────────────────────────

const MAX_GAP_ITERATIONS = 3;

interface CoverageEvaluation {
  overallCoverage: "sufficient" | "gaps_exist" | "insufficient";
  confidence: number;
  answeredWell: string[];
  gaps: Array<{
    question: string;
    missingPageType: string;
    suggestedTitle: string;
    suggestedSlug: string;
    dataHint: string;
  }>;
  reasoning: string;
}

async function runGapFillingLoop(
  operatorId: string,
  projectId: string | undefined,
  report: BackgroundSynthesisReport,
): Promise<void> {
  for (let iteration = 1; iteration <= MAX_GAP_ITERATIONS; iteration++) {
    console.log(
      `[background-synthesis] Gap-fill iteration ${iteration}/${MAX_GAP_ITERATIONS}`,
    );

    // 1. Evaluate current coverage
    const evaluation = await evaluateWikiCoverage(operatorId, projectId);

    console.log(
      `[background-synthesis] Coverage: ${evaluation.overallCoverage} (confidence: ${evaluation.confidence})`,
    );

    // 2. Check stop conditions
    if (
      evaluation.overallCoverage === "sufficient" &&
      evaluation.confidence >= 0.8
    ) {
      console.log(
        "[background-synthesis] Wiki coverage is sufficient — stopping gap-fill",
      );
      break;
    }

    if (evaluation.gaps.length === 0) {
      console.log(
        "[background-synthesis] No gaps identified — stopping gap-fill",
      );
      break;
    }

    // 3. Synthesize pages for identified gaps
    const gapBatches = await buildGapBatches(
      operatorId,
      projectId,
      evaluation.gaps,
    );

    if (gapBatches.length === 0) {
      console.log(
        "[background-synthesis] No data available to fill gaps — stopping",
      );
      break;
    }

    console.log(
      `[background-synthesis] Filling ${gapBatches.length} gaps`,
    );
    await synthesizeBatchesParallel(operatorId, projectId, gapBatches, report);

    // Verify new pages
    const verifyResult = await verifyDraftPages(operatorId, projectId);
    report.pagesVerified += verifyResult.verified;
    report.pagesQuarantined += verifyResult.quarantined;
  }
}

async function evaluateWikiCoverage(
  operatorId: string,
  projectId?: string,
): Promise<CoverageEvaluation> {
  // Load current wiki index
  const pages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      projectId: projectId ?? null,
      pageType: { notIn: ["index", "log"] },
    },
    select: {
      slug: true,
      title: true,
      pageType: true,
      status: true,
      sourceCount: true,
      contentTokens: true,
      confidence: true,
    },
    orderBy: { pageType: "asc" },
  });

  // Count unprocessed data remaining
  const [unprocessedChunks, unprocessedSignals] = await Promise.all([
    prisma.contentChunk.count({
      where: {
        operatorId,
        wikiProcessedAt: null,
        projectId: projectId ?? null,
      },
    }),
    prisma.activitySignal.count({
      where: { operatorId, wikiProcessedAt: null },
    }),
  ]);

  // Get distinct source types available
  const sourceTypes = await prisma.contentChunk.findMany({
    where: { operatorId, projectId: projectId ?? null },
    select: { sourceType: true },
    distinct: ["sourceType"],
  });

  // Build page summary for the LLM
  const pagesByType = new Map<string, typeof pages>();
  for (const p of pages) {
    const group = pagesByType.get(p.pageType) ?? [];
    group.push(p);
    pagesByType.set(p.pageType, group);
  }

  let pageSummary = "";
  for (const [type, pgs] of pagesByType) {
    pageSummary += `\n${type} (${pgs.length} pages):\n`;
    for (const p of pgs.slice(0, 10)) {
      pageSummary += `  - ${p.title} [${p.status}] (${p.sourceCount} sources, confidence: ${p.confidence.toFixed(2)})\n`;
    }
    if (pgs.length > 10)
      pageSummary += `  ... and ${pgs.length - 10} more\n`;
  }

  // Load operator info for context
  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { companyName: true, displayName: true },
  });
  const companyName =
    operator?.companyName ?? operator?.displayName ?? "the company";

  const systemPrompt = `You are evaluating whether an organizational knowledge wiki is comprehensive enough for an AI system to reason about ${companyName}'s operations.

Current wiki pages (${pages.length} total):
${pageSummary}

Unprocessed data remaining: ${unprocessedChunks} content chunks, ${unprocessedSignals} activity signals
Source types available: ${sourceTypes.map((s) => s.sourceType).join(", ")}

Questions the AI system needs to answer about this company:
1. Who are the key people and what do they do?
2. Who are the important clients/vendors/partners and what's the relationship health?
3. What are the financial patterns and risks?
4. How do common business processes work here?
5. What's each department working on right now?
6. Are there any emerging risks or opportunities?
7. What is the communication culture like?
8. Are there any unresolved contradictions in the data?

Evaluate:
- Which questions can be answered well from existing pages?
- Which have significant gaps?
- What specific NEW pages should be created to fill the most important gaps?
- Only suggest pages where unprocessed data likely exists to synthesize from

Respond with ONLY a JSON object:
{
  "overallCoverage": "sufficient" | "gaps_exist" | "insufficient",
  "confidence": 0.0-1.0,
  "answeredWell": ["question numbers that are well covered"],
  "gaps": [
    {
      "question": "which question has a gap",
      "missingPageType": "entity_profile | process_description | financial_pattern | communication_pattern | department_overview | topic_synthesis | relationship_map",
      "suggestedTitle": "descriptive page title",
      "suggestedSlug": "lowercase-slug",
      "dataHint": "what source data type to look for (email, slack_message, invoice, etc.)"
    }
  ],
  "reasoning": "brief explanation of coverage assessment"
}

Be critical but practical. A wiki doesn't need to cover everything — it needs to cover enough that the reasoning engine can investigate operational situations effectively. Suggest at most 15 new pages per evaluation.`;

  const model = getModel("verifier"); // Sonnet

  try {
    const response = await callLLM({
      operatorId,
      instructions: systemPrompt,
      messages: [
        {
          role: "user",
          content: "Evaluate wiki coverage and identify gaps.",
        },
      ],
      model,
      maxTokens: 2000,
    });

    const text = response.text;
    const cleaned = text.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleaned) as CoverageEvaluation;

    // Validate and cap gaps
    result.gaps = (result.gaps ?? []).slice(0, 15);
    result.confidence = Math.max(0, Math.min(1, result.confidence ?? 0.5));

    return result;
  } catch (err) {
    console.error("[background-synthesis] Coverage evaluation failed:", err);
    return {
      overallCoverage: "gaps_exist",
      confidence: 0.3,
      answeredWell: [],
      gaps: [],
      reasoning: "Coverage evaluation failed — will retry on next run",
    };
  }
}

async function buildGapBatches(
  operatorId: string,
  projectId: string | undefined,
  gaps: CoverageEvaluation["gaps"],
): Promise<SynthesisBatch[]> {
  const batches: SynthesisBatch[] = [];

  for (const gap of gaps) {
    // Check if a page with this slug already exists (avoid duplicates)
    const existing = await prisma.knowledgePage.findUnique({
      where: {
        operatorId_slug: { operatorId, slug: gap.suggestedSlug },
      },
      select: { id: true },
    });
    if (existing) continue;

    // Find relevant source data based on the gap's dataHint
    const hintTypes = gap.dataHint
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const chunks = await prisma.contentChunk.findMany({
      where: {
        operatorId,
        projectId: projectId ?? null,
        ...(hintTypes.length > 0 ? { sourceType: { in: hintTypes } } : {}),
      },
      select: {
        id: true,
        content: true,
        sourceType: true,
        sourceId: true,
        metadata: true,
        createdAt: true,
      },
      take: 50,
      orderBy: { createdAt: "desc" },
    });

    // Also try semantic search if the suggested title gives us a query
    let semanticChunks: typeof chunks = [];
    if (gap.suggestedTitle) {
      try {
        const embeddings = await embedChunks([gap.suggestedTitle]);
        const embedding = embeddings[0];
        if (embedding) {
          const embeddingStr = `[${embedding.join(",")}]`;
          semanticChunks = await prisma.$queryRawUnsafe<typeof chunks>(
            `SELECT id, content, "sourceType", "sourceId", metadata::text as metadata, "createdAt"
             FROM "ContentChunk"
             WHERE "operatorId" = $1
             ${projectId ? `AND "projectId" = $3` : `AND "projectId" IS NULL`}
             AND embedding IS NOT NULL
             ORDER BY embedding <=> $2::vector
             LIMIT 20`,
            operatorId,
            embeddingStr,
            ...(projectId ? [projectId] : []),
          );
        }
      } catch {
        // Semantic search failed — proceed with type-based results
      }
    }

    // Merge and deduplicate
    const allChunks = [...chunks, ...semanticChunks];
    const seen = new Set<string>();
    const deduped = allChunks.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    if (deduped.length === 0) continue;

    batches.push({
      targetPage: {
        slug: gap.suggestedSlug,
        pageType: gap.missingPageType,
        title: gap.suggestedTitle,
      },
      sourceData: deduped.slice(0, 60).map((c) => ({
        id: c.id,
        type: "chunk" as const,
        content:
          typeof c.content === "string" ? c.content : String(c.content),
        metadata: c.metadata
          ? JSON.parse(c.metadata as string)
          : {},
        sourceType: c.sourceType,
        occurredAt:
          c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt),
      })),
    });
  }

  return batches;
}

// ── Incremental Synthesis ───────────────────────────────

const INCREMENTAL_BATCH_SIZE = 200;
const INCREMENTAL_MAX_PAGES = 30;

async function runIncrementalSynthesis(
  operatorId: string,
  projectId: string | undefined,
  report: BackgroundSynthesisReport,
): Promise<void> {
  const { chunks, signals } = await loadUnprocessedData(
    operatorId,
    projectId,
    INCREMENTAL_BATCH_SIZE,
  );
  report.dataProcessed = { chunks: chunks.length, signals: signals.length };

  if (chunks.length === 0 && signals.length === 0) return;

  // Group into batches by affected entity
  const batches = groupIntoBatches(chunks, signals);

  // Process up to INCREMENTAL_MAX_PAGES
  const toProcess = batches.slice(0, INCREMENTAL_MAX_PAGES);
  await synthesizeBatchesParallel(operatorId, projectId, toProcess, report);

  // Mark processed data
  const processedChunkIds = toProcess.flatMap((b) =>
    b.sourceData.filter((s) => s.type === "chunk").map((s) => s.id),
  );
  const processedSignalIds = toProcess.flatMap((b) =>
    b.sourceData.filter((s) => s.type === "signal").map((s) => s.id),
  );
  await markProcessed(
    chunks.filter((c) => processedChunkIds.includes(c.id)),
    signals.filter((s) => processedSignalIds.includes(s.id)),
  );
}

// ── Required Page Creation ──────────────────────────────

const CONCURRENCY = 5;

async function createRequiredPages(
  operatorId: string,
  projectId: string | undefined,
  chunks: ChunkData[],
  signals: SignalData[],
  report: BackgroundSynthesisReport,
): Promise<void> {
  // ── Tier 1: Structural pages ──

  const orgEntity = await prisma.entity.findFirst({
    where: {
      operatorId,
      category: "foundational",
      entityType: { slug: "organization" },
      status: "active",
    },
    select: { id: true, displayName: true, description: true },
  });

  const departments = await prisma.entity.findMany({
    where: {
      operatorId,
      category: "foundational",
      entityType: { slug: "department" },
      status: "active",
    },
    select: { id: true, displayName: true, description: true },
  });

  const teamMembers = await prisma.entity.findMany({
    where: { operatorId, category: "base", status: "active" },
    select: {
      id: true,
      displayName: true,
      parentDepartmentId: true,
      entityType: { select: { slug: true } },
      propertyValues: {
        select: {
          value: true,
          property: { select: { slug: true, identityRole: true } },
        },
      },
    },
  });

  // Build entity-to-data index for efficient batching
  const entityDataIndex = buildEntityDataIndex(chunks, signals, teamMembers);

  // Organization page
  if (orgEntity) {
    const orgBatch = buildEntityBatch(
      orgEntity,
      "entity_profile",
      chunks,
      signals,
      entityDataIndex,
    );
    if (orgBatch.sourceData.length > 0) {
      await synthesizeBatchSafe(operatorId, projectId, orgBatch, report);
    }
  }

  // Department overview pages (parallel, batches of CONCURRENCY)
  const deptBatches = departments
    .map((dept) =>
      buildDepartmentBatch(dept, teamMembers, chunks, signals, entityDataIndex),
    )
    .filter((b) => b.sourceData.length > 0);

  await synthesizeBatchesParallel(operatorId, projectId, deptBatches, report);

  // Team member entity profiles (parallel)
  const memberBatches = teamMembers
    .filter((m) => m.entityType.slug !== "ai-agent")
    .map((member) =>
      buildEntityBatch(member, "entity_profile", chunks, signals, entityDataIndex),
    )
    .filter((b) => b.sourceData.length > 0);

  await synthesizeBatchesParallel(operatorId, projectId, memberBatches, report);

  // ── Tier 2: External entity profiles ──

  const externalEntities = await prisma.entity.findMany({
    where: { operatorId, category: "external", status: "active" },
    select: {
      id: true,
      displayName: true,
      description: true,
      entityType: { select: { slug: true, name: true } },
      propertyValues: {
        select: {
          value: true,
          property: { select: { slug: true } },
        },
      },
    },
  });

  // Only create pages for externals with 3+ data points
  const externalBatches = externalEntities
    .map((ext) =>
      buildEntityBatch(ext, "entity_profile", chunks, signals, entityDataIndex),
    )
    .filter((b) => b.sourceData.length >= 3);

  await synthesizeBatchesParallel(operatorId, projectId, externalBatches, report);

  // ── Tier 3: Pattern pages ──

  // Financial patterns (company-wide)
  const financialChunks = chunks.filter((c) =>
    ["invoice", "payment", "accounting_entry", "bank_transaction"].includes(
      c.sourceType,
    ),
  );
  if (financialChunks.length > 0) {
    const financialBatch: SynthesisBatch = {
      targetPage: {
        slug: projectId
          ? `financial-overview-${projectId}`
          : "financial-overview",
        pageType: "financial_pattern",
        title: "Financial overview",
      },
      sourceData: financialChunks.slice(0, 100).map(formatChunkForBatch),
    };
    await synthesizeBatchSafe(operatorId, projectId, financialBatch, report);
  }

  // Communication patterns (per department)
  for (const dept of departments) {
    const deptMemberIds = teamMembers
      .filter((m) => m.parentDepartmentId === dept.id)
      .map((m) => m.id);

    const commSignals = signals.filter(
      (s) =>
        ["email_sent", "email_received", "slack_message", "meeting_held"].includes(
          s.signalType,
        ) &&
        (deptMemberIds.includes(s.actorEntityId ?? "") ||
          deptMemberIds.some((id) => (s.targetEntityIds ?? []).includes(id))),
    );

    if (commSignals.length >= 5) {
      const commBatch: SynthesisBatch = {
        targetPage: {
          slug: `communication-pattern-${normalizeSlug(dept.displayName)}`,
          pageType: "communication_pattern",
          title: `Communication patterns — ${dept.displayName}`,
        },
        sourceData: commSignals.slice(0, 80).map(formatSignalForBatch),
      };
      await synthesizeBatchSafe(operatorId, projectId, commBatch, report);
    }
  }

  // ── Tier 4: System pages ──
  // Index and log are automatically updated by processWikiUpdates in wiki-engine.ts
}

// ── Parallel Synthesis ──────────────────────────────────

async function synthesizeBatchesParallel(
  operatorId: string,
  projectId: string | undefined,
  batches: SynthesisBatch[],
  report: BackgroundSynthesisReport,
): Promise<void> {
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((batch) =>
        synthesizeBatchSafe(operatorId, projectId, batch, report),
      ),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[background-synthesis] Batch failed:", result.reason);
        report.errors++;
      }
    }
  }
}

// ── Single Batch Synthesis ──────────────────────────────

async function synthesizeBatchSafe(
  operatorId: string,
  projectId: string | undefined,
  batch: SynthesisBatch,
  report: BackgroundSynthesisReport,
): Promise<void> {
  try {
    // Select prompt template
    const template = getSynthesisTemplate(batch.targetPage.pageType);

    // Format source data
    const sourceFormatted = batch.sourceData
      .map((s) => {
        const dateStr = s.occurredAt
          ? ` (${s.occurredAt.toISOString().split("T")[0]})`
          : "";
        return `[${s.type}:${s.id}] [${s.sourceType}]${dateStr}\n${s.content.slice(0, 2000)}`;
      })
      .join("\n\n---\n\n");

    // Build prompt with template
    const systemPrompt = template
      .replace(
        /\{entityName\}/g,
        batch.targetPage.title.split("—")[0]?.trim() ?? batch.targetPage.title,
      )
      .replace(/\{entityType\}/g, batch.targetPage.pageType)
      .replace(/\{scopeName\}/g, batch.targetPage.title)
      .replace(/\{departmentName\}/g, batch.targetPage.title)
      .replace(/\{processName\}/g, batch.targetPage.title)
      .replace(
        /\{existingContent\}/g,
        batch.targetPage.existingContent ??
          "(No existing page — creating new)",
      )
      .replace(/\{sourceDataFormatted\}/g, sourceFormatted);

    // Call Sonnet for background work
    const model = getModel("verifier");
    const response = await callLLM({
      operatorId,
      instructions: systemPrompt,
      messages: [
        {
          role: "user",
          content:
            "Synthesize the knowledge page from the source data above.",
        },
      ],
      model,
      maxTokens: 4000,
    });

    const content = response.text;
    if (!content || content.trim().length < 50) {
      console.warn(
        `[background-synthesis] Empty synthesis for ${batch.targetPage.slug}`,
      );
      return;
    }

    report.costCents += response.apiCostCents;

    // Extract source citations
    const citationMatches =
      content.match(/\[src:([a-zA-Z0-9_-]+)\]/g) ?? [];
    const sourceCitations = citationMatches.map((match) => {
      const id = match.replace("[src:", "").replace("]", "");
      const sourceItem = batch.sourceData.find((s) => s.id === id);
      return {
        sourceType: (sourceItem?.type ?? "chunk") as
          | "chunk"
          | "signal"
          | "entity",
        sourceId: id,
        claim: "referenced in synthesis",
      };
    });

    const isUpdate = !!batch.targetPage.existingContent;

    await processWikiUpdates({
      operatorId,
      projectId,
      updates: [
        {
          slug: batch.targetPage.slug,
          pageType: batch.targetPage.pageType,
          title: batch.targetPage.title,
          subjectEntityId: batch.targetPage.subjectEntityId,
          updateType: isUpdate ? "update" : "create",
          content,
          sourceCitations,
          reasoning: `Background synthesis from ${batch.sourceData.length} source items`,
        },
      ],
      synthesisPath: "background",
      synthesizedByModel: model,
    });

    if (isUpdate) report.pagesUpdated++;
    else report.pagesCreated++;
  } catch (err) {
    console.error(
      `[background-synthesis] Failed for ${batch.targetPage.slug}:`,
      err,
    );
    report.errors++;
  }
}

// ── Data Loading ────────────────────────────────────────

async function loadUnprocessedData(
  operatorId: string,
  projectId: string | undefined,
  limit: number,
): Promise<{ chunks: ChunkData[]; signals: SignalData[] }> {
  const [rawChunks, rawSignals] = await Promise.all([
    prisma.contentChunk.findMany({
      where: {
        operatorId,
        wikiProcessedAt: null,
        ...(projectId !== undefined ? { projectId } : { projectId: null }),
      },
      select: {
        id: true,
        content: true,
        sourceType: true,
        sourceId: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    }),
    prisma.activitySignal.findMany({
      where: { operatorId, wikiProcessedAt: null },
      select: {
        id: true,
        signalType: true,
        actorEntityId: true,
        targetEntityIds: true,
        metadata: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: "asc" },
      take: limit,
    }),
  ]);

  const chunks: ChunkData[] = rawChunks.map((c) => ({
    ...c,
    metadata: c.metadata ? JSON.parse(c.metadata) : {},
  }));

  const signals: SignalData[] = rawSignals.map((s) => ({
    ...s,
    targetEntityIds: s.targetEntityIds
      ? JSON.parse(s.targetEntityIds)
      : [],
    metadata: s.metadata ? JSON.parse(s.metadata) : {},
  }));

  return { chunks, signals };
}

// ── Entity Data Index ───────────────────────────────────

function buildEntityDataIndex(
  chunks: ChunkData[],
  signals: SignalData[],
  entities: Array<{
    id: string;
    propertyValues: Array<{
      value: string;
      property: { slug: string; identityRole: string | null };
    }>;
  }>,
): Map<string, { chunkIds: Set<string>; signalIds: Set<string> }> {
  const index = new Map<
    string,
    { chunkIds: Set<string>; signalIds: Set<string> }
  >();

  // Build email -> entityId map
  const emailToEntity = new Map<string, string>();
  for (const entity of entities) {
    const emailPv = entity.propertyValues.find(
      (pv) =>
        pv.property.identityRole === "email" || pv.property.slug === "email",
    );
    if (emailPv?.value) {
      emailToEntity.set(emailPv.value.toLowerCase(), entity.id);
    }
    index.set(entity.id, { chunkIds: new Set(), signalIds: new Set() });
  }

  // Map signals to entities
  for (const signal of signals) {
    if (signal.actorEntityId && index.has(signal.actorEntityId)) {
      index.get(signal.actorEntityId)!.signalIds.add(signal.id);
    }
    for (const targetId of signal.targetEntityIds) {
      if (index.has(targetId)) {
        index.get(targetId)!.signalIds.add(signal.id);
      }
    }
  }

  // Map chunks to entities by metadata email references
  for (const chunk of chunks) {
    const meta = chunk.metadata;
    const emails = [
      meta.sender,
      meta.from,
      meta.to,
      meta.organizer,
      ...(Array.isArray(meta.attendees) ? meta.attendees : []),
      ...(Array.isArray(meta.recipients) ? meta.recipients : []),
      ...(Array.isArray(meta.participantEmails) ? meta.participantEmails : []),
    ]
      .filter(Boolean)
      .map((e) => String(e).toLowerCase());

    for (const email of emails) {
      const entityId = emailToEntity.get(email);
      if (entityId && index.has(entityId)) {
        index.get(entityId)!.chunkIds.add(chunk.id);
      }
    }
  }

  return index;
}

// ── Batch Builders ──────────────────────────────────────

function buildEntityBatch(
  entity: { id: string; displayName: string; description?: string | null },
  pageType: string,
  chunks: ChunkData[],
  signals: SignalData[],
  index: Map<string, { chunkIds: Set<string>; signalIds: Set<string> }>,
): SynthesisBatch {
  const entityData = index.get(entity.id);
  const sourceData: SynthesisBatch["sourceData"] = [];

  if (entityData) {
    for (const chunkId of entityData.chunkIds) {
      const chunk = chunks.find((c) => c.id === chunkId);
      if (chunk) sourceData.push(formatChunkForBatch(chunk));
    }
    for (const signalId of entityData.signalIds) {
      const signal = signals.find((s) => s.id === signalId);
      if (signal) sourceData.push(formatSignalForBatch(signal));
    }
  }

  // Cap source data per page to keep synthesis focused
  const capped = sourceData.slice(0, 60);

  return {
    targetPage: {
      slug: normalizeSlug(
        `${entity.displayName}-${pageType.replace("_", "-")}`,
      ),
      pageType,
      title: entity.displayName,
      subjectEntityId: entity.id,
    },
    sourceData: capped,
  };
}

function buildDepartmentBatch(
  dept: { id: string; displayName: string; description: string | null },
  allMembers: Array<{
    id: string;
    displayName: string;
    parentDepartmentId: string | null;
    propertyValues: Array<{
      value: string;
      property: { slug: string };
    }>;
  }>,
  chunks: ChunkData[],
  signals: SignalData[],
  index: Map<string, { chunkIds: Set<string>; signalIds: Set<string> }>,
): SynthesisBatch {
  // Collect data from all department members
  const deptMembers = allMembers.filter(
    (m) => m.parentDepartmentId === dept.id,
  );
  const sourceData: SynthesisBatch["sourceData"] = [];

  for (const member of deptMembers) {
    const memberData = index.get(member.id);
    if (!memberData) continue;
    // Add a sample of each member's data
    for (const chunkId of [...memberData.chunkIds].slice(0, 5)) {
      const chunk = chunks.find((c) => c.id === chunkId);
      if (chunk) sourceData.push(formatChunkForBatch(chunk));
    }
    for (const signalId of [...memberData.signalIds].slice(0, 5)) {
      const signal = signals.find((s) => s.id === signalId);
      if (signal) sourceData.push(formatSignalForBatch(signal));
    }
  }

  return {
    targetPage: {
      slug: normalizeSlug(`department-overview-${dept.displayName}`),
      pageType: "department_overview",
      title: `Department overview — ${dept.displayName}`,
      subjectEntityId: dept.id,
    },
    sourceData: sourceData.slice(0, 80),
  };
}

// ── Format Helpers ──────────────────────────────────────

function formatChunkForBatch(chunk: ChunkData): SynthesisBatch["sourceData"][0] {
  return {
    id: chunk.id,
    type: "chunk",
    content: chunk.content,
    metadata: chunk.metadata,
    sourceType: chunk.sourceType,
    occurredAt: chunk.createdAt,
  };
}

function formatSignalForBatch(
  signal: SignalData,
): SynthesisBatch["sourceData"][0] {
  return {
    id: signal.id,
    type: "signal",
    content: `${signal.signalType}: ${JSON.stringify(signal.metadata)}`,
    metadata: signal.metadata,
    sourceType: signal.signalType,
    occurredAt: signal.occurredAt,
  };
}

function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[æ]/g, "ae")
    .replace(/[ø]/g, "oe")
    .replace(/[å]/g, "aa")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

// ── Data Marking ────────────────────────────────────────

async function markProcessed(
  chunks: ChunkData[],
  signals: SignalData[],
): Promise<void> {
  const now = new Date();
  if (chunks.length > 0) {
    await prisma.contentChunk.updateMany({
      where: { id: { in: chunks.map((c) => c.id) } },
      data: { wikiProcessedAt: now },
    });
  }
  if (signals.length > 0) {
    await prisma.activitySignal.updateMany({
      where: { id: { in: signals.map((s) => s.id) } },
      data: { wikiProcessedAt: now },
    });
  }
}

// ── Incremental Grouping ────────────────────────────────

function groupIntoBatches(
  chunks: ChunkData[],
  signals: SignalData[],
): SynthesisBatch[] {
  // Simple grouping: by entity mention (for incremental mode)
  const entityBatches = new Map<string, SynthesisBatch["sourceData"]>();

  for (const signal of signals) {
    const entityId = signal.actorEntityId ?? "unassigned";
    if (!entityBatches.has(entityId)) entityBatches.set(entityId, []);
    entityBatches.get(entityId)!.push(formatSignalForBatch(signal));
  }

  for (const chunk of chunks) {
    // For incremental, group by sourceType
    const key = chunk.sourceType;
    if (!entityBatches.has(key)) entityBatches.set(key, []);
    entityBatches.get(key)!.push(formatChunkForBatch(chunk));
  }

  // Convert to SynthesisBatch objects
  return [...entityBatches.entries()].map(([key, data]) => ({
    targetPage: {
      slug: normalizeSlug(key),
      pageType: "topic_synthesis",
      title: key,
    },
    sourceData: data.slice(0, 60),
  }));
}

// ── Synthesis Prompt Templates ──────────────────────────

const SYNTHESIS_TEMPLATES: Record<string, string> = {
  entity_profile: `You are synthesizing an entity profile for an organizational knowledge wiki.

Entity: {entityName} ({entityType})
Current page (if updating): {existingContent}

New source data to integrate:
{sourceDataFormatted}

Write a comprehensive entity profile covering:
1. **Summary** — who/what this entity is, relationship to the organization
2. **Communication patterns** — channel preferences, response times, activity levels
3. **Financial relationship** — if applicable: transaction history, payment behavior, deal status
4. **Current context** — what's active right now (open deals, pending items, recent interactions)
5. **Risk factors** — late payments, declining engagement, dependency risks
6. **Contradictions** — if any source data conflicts with existing page claims

Rules:
- Every claim must cite its source as [src:{id}] using the actual source IDs from the data above
- Be precise: specific numbers, dates, names. No generalizations.
- If updating, preserve existing claims that new data doesn't contradict
- Note gaps: what you'd expect to know but don't have data for
- Target 1500-2500 tokens of content

Output the full page in markdown.`,

  department_overview: `You are synthesizing a department overview for an organizational knowledge wiki.

Department: {departmentName}
Current page (if updating): {existingContent}

Department data:
{sourceDataFormatted}

Write a department overview covering:
1. **Purpose** — what this department does in the organization
2. **Team** — members, roles, reporting structure (as observed in data)
3. **Current priorities** — what the department is actively working on
4. **Key metrics** — measurable indicators from data (deal count, email volume, etc.)
5. **Cross-department interactions** — which other departments this one works with most

Rules:
- Every claim must cite its source as [src:{id}]
- Note team members by name and role
- Distinguish between what the data shows and what might be inferred

Output the full page in markdown.`,

  financial_pattern: `You are synthesizing financial patterns for an organizational knowledge wiki.

Scope: {scopeName}
Current page (if updating): {existingContent}

New financial data:
{sourceDataFormatted}

Write a financial pattern analysis covering:
1. **Revenue overview** — total, trends, concentration
2. **Payment behavior** — average payment times, late payment patterns, by client
3. **Cash flow indicators** — seasonal patterns, upcoming commitments
4. **Risk signals** — declining trends, concentration above thresholds, aging receivables

Rules:
- Every claim must cite its source as [src:{id}]
- Use specific numbers. "Revenue of 2.3M DKK" not "significant revenue"
- Compare periods when data exists
- Flag contradictions explicitly

Output the full page in markdown.`,

  communication_pattern: `You are synthesizing communication patterns for an organizational knowledge wiki.

Scope: {scopeName}
Current page (if updating): {existingContent}

Communication data:
{sourceDataFormatted}

Write a communication pattern analysis covering:
1. **Channel usage** — email vs Slack vs meetings, preferences by person
2. **Response patterns** — typical response times, business hours behavior
3. **Key relationships** — who communicates most, cross-department connections
4. **Topic clusters** — recurring themes
5. **Anomalies** — unusual patterns, sudden changes

Rules:
- Every claim must cite its source as [src:{id}]
- Quantify where possible: "responds within 4 hours on average" not "responds quickly"

Output the full page in markdown.`,

  process_description: `You are synthesizing a process description for an organizational knowledge wiki.

Process: {processName}
Current page (if updating): {existingContent}

Source data showing this process in action:
{sourceDataFormatted}

Write a process description covering:
1. **Process overview** — what this accomplishes, typical trigger
2. **Steps observed** — actual sequence seen in data (observed, not prescribed)
3. **Participants** — who is typically involved at each step
4. **Timing** — typical duration, bottlenecks observed
5. **Variations** — different paths for different cases
6. **Issues** — steps that frequently cause delays

Rules:
- Every claim must cite its source as [src:{id}]
- Describe observed behavior, not prescribed behavior

Output the full page in markdown.`,

  topic_synthesis: `You are synthesizing a topic analysis for an organizational knowledge wiki.

Topic: {scopeName}
Current page (if updating): {existingContent}

Source data:
{sourceDataFormatted}

Synthesize the key insights from this data into a structured knowledge page.
Cover: what the data shows, patterns identified, implications, and any contradictions.

Rules:
- Every claim must cite its source as [src:{id}]
- Be precise with numbers and dates
- Note what's missing or unclear

Output the full page in markdown.`,

  relationship_map: `You are synthesizing a relationship map for an organizational knowledge wiki.

Scope: {scopeName}
Current page (if updating): {existingContent}

Relationship data:
{sourceDataFormatted}

Map the key relationships between this entity/department and external parties.
Cover: who, nature of relationship, interaction frequency, financial significance, relationship health.

Rules:
- Every claim must cite its source as [src:{id}]
- Quantify interactions where possible

Output the full page in markdown.`,
};

function getSynthesisTemplate(pageType: string): string {
  return SYNTHESIS_TEMPLATES[pageType] ?? SYNTHESIS_TEMPLATES["topic_synthesis"];
}

// ── Exports ─────────────────────────────────────────────

export { type BackgroundSynthesisReport };
