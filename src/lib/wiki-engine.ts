/**
 * Wiki engine — core CRUD for KnowledgePage.
 *
 * Processes wiki updates from reasoning, background synthesis, and onboarding.
 * Provides entity profile lookups, semantic search, and seed context loading
 * for the reasoning engine.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { embedChunks } from "@/lib/rag/embedder";
import { verifyPage } from "@/lib/wiki-verification";

// ─── Types ──────────────────────────────────────────────

export interface WikiUpdate {
  slug: string;
  pageType: string;
  title: string;
  subjectEntityId?: string;
  updateType: "create" | "update" | "flag_contradiction";
  content: string;
  sourceCitations: Array<{
    sourceType: "chunk" | "signal" | "entity";
    sourceId: string;
    claim: string;
  }>;
  reasoning: string;
}

export interface ProcessWikiUpdatesParams {
  operatorId: string;
  projectId?: string;
  situationId?: string;
  updates: WikiUpdate[];
  synthesisPath: "reasoning" | "background" | "onboarding" | "lint" | "investigation" | "research" | "reflection" | "living_research";
  synthesizedByModel: string;
  synthesisCostCents?: number;
  synthesisDurationMs?: number;
}

// ─── Main entry point ───────────────────────────────────

export async function processWikiUpdates(params: ProcessWikiUpdatesParams): Promise<{
  created: number;
  updated: number;
  contradictions: number;
  errors: number;
}> {
  const stats = { created: 0, updated: 0, contradictions: 0, errors: 0 };

  for (const update of params.updates) {
    try {
      switch (update.updateType) {
        case "create":
          await createPage({
            operatorId: params.operatorId,
            projectId: params.projectId,
            ...update,
            synthesisPath: params.synthesisPath,
            synthesizedByModel: params.synthesizedByModel,
            situationId: params.situationId,
            synthesisCostCents: params.synthesisCostCents,
            synthesisDurationMs: params.synthesisDurationMs,
          });
          stats.created++;
          break;

        case "update":
          await updatePage({
            operatorId: params.operatorId,
            projectId: params.projectId,
            ...update,
            synthesisPath: params.synthesisPath,
            synthesizedByModel: params.synthesizedByModel,
            situationId: params.situationId,
          });
          stats.updated++;
          break;

        case "flag_contradiction":
          await flagContradiction({
            operatorId: params.operatorId,
            projectId: params.projectId,
            ...update,
            synthesizedByModel: params.synthesizedByModel,
          });
          stats.contradictions++;
          break;
      }
    } catch (err) {
      console.error(`[wiki-engine] Failed to process update for ${update.slug}:`, err);
      stats.errors++;
    }
  }

  // Update the index page
  await updateIndexPage(params.operatorId, params.projectId).catch((err) => {
    console.error("[wiki-engine] Failed to update index:", err);
  });

  // Append to the log page
  await appendToLog(params.operatorId, params.projectId, params.updates, params.synthesisPath).catch((err) => {
    console.error("[wiki-engine] Failed to update log:", err);
  });

  console.log(
    `[wiki-engine] Processed ${params.updates.length} updates: ` +
    `${stats.created} created, ${stats.updated} updated, ${stats.contradictions} contradictions, ${stats.errors} errors`,
  );
  return stats;
}

// ─── Page CRUD ──────────────────────────────────────────

async function createPage(params: {
  operatorId: string;
  projectId?: string;
  slug: string;
  pageType: string;
  title: string;
  subjectEntityId?: string;
  content: string;
  sourceCitations: WikiUpdate["sourceCitations"];
  synthesisPath: string;
  synthesizedByModel: string;
  situationId?: string;
  synthesisCostCents?: number;
  synthesisDurationMs?: number;
}): Promise<void> {
  const slug = normalizeSlug(params.slug);

  // Check if page already exists — if so, delegate to updatePage
  const existing = await prisma.knowledgePage.findUnique({
    where: { operatorId_slug: { operatorId: params.operatorId, slug } },
    select: { id: true },
  });
  if (existing) {
    return updatePage({ ...params, slug });
  }

  const sources = buildSourcesArray(params.sourceCitations);
  const contentTokens = Math.ceil(params.content.length / 4);
  const crossReferences = extractCrossReferences(params.content);
  const sourceTypes = [...new Set(params.sourceCitations.map((c) => c.sourceType))];

  // Embed content for search
  const embeddings = await embedChunks([params.content]).catch(() => [null]);
  const embedding = embeddings[0];

  // Create page via Prisma (generates cuid), then set embedding via raw SQL
  const created = await prisma.knowledgePage.create({
    data: {
      operatorId: params.operatorId,
      projectId: params.projectId ?? null,
      pageType: params.pageType,
      subjectEntityId: params.subjectEntityId ?? null,
      title: params.title,
      slug,
      content: params.content,
      contentTokens,
      crossReferences,
      sources,
      sourceCount: params.sourceCitations.length,
      sourceTypes,
      status: "draft",
      confidence: 0.5,
      version: 1,
      synthesisPath: params.synthesisPath,
      synthesizedByModel: params.synthesizedByModel,
      situationId: params.situationId ?? null,
      synthesisCostCents: params.synthesisCostCents ?? null,
      synthesisDurationMs: params.synthesisDurationMs ?? null,
      lastSynthesizedAt: new Date(),
    },
    select: { id: true },
  });

  if (embedding) {
    const embeddingStr = `[${embedding.join(",")}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE "KnowledgePage" SET "embedding" = $1::vector WHERE "id" = $2`,
      embeddingStr,
      created.id,
    );
  }

  // Update citedByPages counter on referenced pages
  if (crossReferences.length > 0) {
    await prisma.knowledgePage.updateMany({
      where: { operatorId: params.operatorId, scope: "operator", slug: { in: crossReferences } },
      data: { citedByPages: { increment: 1 } },
    });
  }

  // Trigger verification
  if (params.synthesisPath === "reasoning") {
    verifyPage(created.id).catch((err) => {
      console.error(`[wiki-engine] Verification failed for ${slug}:`, err);
    });
  } else {
    await verifyPage(created.id);
  }
}

async function updatePage(params: {
  operatorId: string;
  projectId?: string;
  slug: string;
  pageType: string;
  title: string;
  subjectEntityId?: string;
  content: string;
  sourceCitations: WikiUpdate["sourceCitations"];
  synthesisPath: string;
  synthesizedByModel: string;
  situationId?: string;
}): Promise<void> {
  const slug = normalizeSlug(params.slug);

  const existing = await prisma.knowledgePage.findUnique({
    where: { operatorId_slug: { operatorId: params.operatorId, slug } },
  });

  if (!existing) {
    return createPage({ ...params, slug });
  }

  // Merge sources (existing + new, dedup by sourceId)
  const existingSources = (existing.sources as Array<{ id: string }>) ?? [];
  const newSources = buildSourcesArray(params.sourceCitations);
  const mergedSources = mergeSources(existingSources, newSources);

  const contentTokens = Math.ceil(params.content.length / 4);
  const crossReferences = extractCrossReferences(params.content);
  const sourceTypes = [...new Set([
    ...existing.sourceTypes,
    ...params.sourceCitations.map((c) => c.sourceType),
  ])];

  // Snapshot current version before update
  await createVersionSnapshot(existing.id, "synthesis", params.synthesizedByModel ?? "unknown");

  // Re-embed updated content
  const embeddings = await embedChunks([params.content]).catch(() => [null]);
  const embedding = embeddings[0];

  if (embedding) {
    const embeddingStr = `[${embedding.join(",")}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE "KnowledgePage"
       SET "title" = $1, "content" = $2, "contentTokens" = $3, "crossReferences" = $4::text[],
           "sources" = $5::jsonb, "sourceCount" = $6, "sourceTypes" = $7::text[],
           "status" = 'draft', "version" = "version" + 1,
           "synthesisPath" = $8, "synthesizedByModel" = $9,
           "situationId" = COALESCE($10, "situationId"),
           "lastSynthesizedAt" = NOW(), "updatedAt" = NOW(),
           "verifiedAt" = NULL, "verifiedByModel" = NULL,
           "verificationLog" = NULL, "quarantineReason" = NULL, "staleReason" = NULL,
           "embedding" = $11::vector
       WHERE "id" = $12`,
      params.title,
      params.content,
      contentTokens,
      crossReferences,
      JSON.stringify(mergedSources),
      mergedSources.length,
      sourceTypes,
      params.synthesisPath,
      params.synthesizedByModel,
      params.situationId ?? null,
      embeddingStr,
      existing.id,
    );
  } else {
    await prisma.knowledgePage.update({
      where: { id: existing.id },
      data: {
        title: params.title,
        content: params.content,
        contentTokens,
        crossReferences,
        sources: mergedSources as unknown as Prisma.InputJsonValue,
        sourceCount: mergedSources.length,
        sourceTypes,
        status: "draft",
        version: { increment: 1 },
        synthesisPath: params.synthesisPath,
        synthesizedByModel: params.synthesizedByModel,
        situationId: params.situationId ?? existing.situationId,
        lastSynthesizedAt: new Date(),
        verifiedAt: null,
        verifiedByModel: null,
        verificationLog: Prisma.JsonNull,
        quarantineReason: null,
        staleReason: null,
      },
    });
  }

  // Trigger verification
  if (params.synthesisPath === "reasoning") {
    verifyPage(existing.id).catch((err) => {
      console.error(`[wiki-engine] Verification failed for ${slug}:`, err);
    });
  } else {
    await verifyPage(existing.id);
  }
}

async function flagContradiction(params: {
  operatorId: string;
  projectId?: string;
  slug: string;
  content: string;
  sourceCitations: WikiUpdate["sourceCitations"];
  synthesizedByModel: string;
}): Promise<void> {
  const logSlug = params.projectId
    ? `contradiction-log-${params.projectId}`
    : "contradiction-log";

  const existing = await prisma.knowledgePage.findUnique({
    where: { operatorId_slug: { operatorId: params.operatorId, slug: logSlug } },
  });

  const timestamp = new Date().toISOString().split("T")[0];
  const entry = `\n\n## [${timestamp}] ${params.slug}\n\n${params.content}`;

  if (existing) {
    await createVersionSnapshot(existing.id, "synthesis", "system");

    await prisma.knowledgePage.update({
      where: { id: existing.id },
      data: {
        content: existing.content + entry,
        version: { increment: 1 },
        lastSynthesizedAt: new Date(),
      },
    });
  } else {
    await prisma.knowledgePage.create({
      data: {
        operatorId: params.operatorId,
        projectId: params.projectId ?? null,
        pageType: "contradiction_log",
        title: "Contradiction log",
        slug: logSlug,
        content: `# Contradiction log\n\nActive contradictions detected across knowledge pages.${entry}`,
        contentTokens: Math.ceil(entry.length / 4),
        sources: buildSourcesArray(params.sourceCitations),
        sourceCount: params.sourceCitations.length,
        status: "verified",
        confidence: 1.0,
        version: 1,
        synthesisPath: "reasoning",
        synthesizedByModel: params.synthesizedByModel,
        lastSynthesizedAt: new Date(),
      },
    });
  }

  // Mark the referenced page as stale
  await prisma.knowledgePage.updateMany({
    where: {
      operatorId: params.operatorId,
      scope: "operator",
      slug: normalizeSlug(params.slug),
      status: "verified",
    },
    data: {
      status: "stale",
      staleReason: "Contradiction flagged — new data conflicts with existing claims",
    },
  });
}

// ─── Query functions ────────────────────────────────────

export async function getPageForEntity(
  operatorId: string,
  entityId: string,
  projectId?: string,
  pageType: string = "entity_profile",
): Promise<{ content: string; status: string; confidence: number; slug: string; trustLevel: string | null } | null> {
  // Prefer verified > stale > draft (exclude quarantined)
  const page = await prisma.knowledgePage.findFirst({
    where: {
      operatorId,
      scope: "operator",
      subjectEntityId: entityId,
      pageType,
      projectId: projectId ?? null,
      status: { in: ["verified", "stale", "draft"] },
    },
    orderBy: [{ lastSynthesizedAt: "desc" }],
    select: { content: true, status: true, confidence: true, slug: true, id: true, trustLevel: true },
  });

  if (!page) return null;

  // Increment reasoning use count (fire-and-forget)
  prisma.knowledgePage.update({
    where: { id: page.id },
    data: { reasoningUseCount: { increment: 1 } },
  }).catch(() => {});

  return page;
}

export async function searchPages(
  operatorId: string,
  query: string,
  options?: {
    pageType?: string;
    projectId?: string;
    limit?: number;
    statusFilter?: string[];
  },
): Promise<Array<{
  slug: string;
  title: string;
  pageType: string;
  status: string;
  confidence: number;
  contentPreview: string;
}>> {
  const limit = options?.limit ?? 5;
  const statusFilter = options?.statusFilter ?? ["verified", "stale"];

  // Try embedding-based search first
  const embeddings = await embedChunks([query]).catch(() => [null]);
  const queryEmbedding = embeddings[0];

  if (queryEmbedding) {
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // Build parameterized query with stable parameter indices
    const conditions: string[] = [
      `"operatorId" = $2`,
      `status = ANY($3::text[])`,
      `embedding IS NOT NULL`,
      `scope = 'operator'`,
    ];
    const params: unknown[] = [embeddingStr, operatorId, statusFilter];
    let nextIdx = 4;

    if (options?.pageType) {
      conditions.push(`"pageType" = $${nextIdx}`);
      params.push(options.pageType);
      nextIdx++;
    }

    if (options?.projectId) {
      conditions.push(`"projectId" = $${nextIdx}`);
      params.push(options.projectId);
      nextIdx++;
    } else {
      conditions.push(`"projectId" IS NULL`);
    }

    params.push(limit);
    const limitIdx = nextIdx;

    const sql = `
      SELECT id, slug, title, "pageType", status, confidence, content,
             1 - (embedding <=> $1::vector) as score
      FROM "KnowledgePage"
      WHERE ${conditions.join(" AND ")}
      ORDER BY embedding <=> $1::vector
      LIMIT $${limitIdx}
    `;

    const results = await prisma.$queryRawUnsafe<Array<{
      id: string;
      slug: string;
      title: string;
      pageType: string;
      status: string;
      confidence: number;
      content: string;
      score: number;
    }>>(sql, ...params);

    return results.map((r) => ({
      slug: r.slug,
      title: r.title,
      pageType: r.pageType,
      status: r.status,
      confidence: r.confidence,
      contentPreview: r.content.slice(0, 500),
    }));
  }

  // Fallback: text search on title and content
  const results = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      status: { in: statusFilter },
      ...(options?.pageType ? { pageType: options.pageType } : {}),
      ...(options?.projectId ? { projectId: options.projectId } : { projectId: null }),
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { content: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { slug: true, title: true, pageType: true, status: true, confidence: true, content: true },
    take: limit,
    orderBy: { confidence: "desc" },
  });

  return results.map((r) => ({
    slug: r.slug,
    title: r.title,
    pageType: r.pageType,
    status: r.status,
    confidence: r.confidence,
    contentPreview: r.content.slice(0, 500),
  }));
}

// ─── System Wiki Queries ───────────────────────────────

export async function getSystemWikiPages(params: {
  pageTypes?: string[];
  maxPages?: number;
  query?: string;
}): Promise<Array<{
  slug: string;
  title: string;
  pageType: string;
  status: string;
  confidence: number;
  content: string;
}>> {
  const limit = params.maxPages ?? 5;

  // Semantic search if query provided and embedding available
  if (params.query) {
    const embeddings = await embedChunks([params.query]).catch(() => [null]);
    if (embeddings[0]) {
      const embeddingStr = `[${embeddings[0].join(",")}]`;
      const conditions = [
        `scope = 'system'`,
        `status = 'verified'`,
        `embedding IS NOT NULL`,
      ];
      const sqlParams: unknown[] = [embeddingStr];
      let nextIdx = 2;

      if (params.pageTypes?.length) {
        conditions.push(`"pageType" = ANY($${nextIdx}::text[])`);
        sqlParams.push(params.pageTypes);
        nextIdx++;
      }

      sqlParams.push(limit);

      const sql = `
        SELECT slug, title, "pageType", status, confidence, content
        FROM "KnowledgePage"
        WHERE ${conditions.join(" AND ")}
        ORDER BY embedding <=> $1::vector
        LIMIT $${nextIdx}
      `;

      return prisma.$queryRawUnsafe<Array<{
        slug: string;
        title: string;
        pageType: string;
        status: string;
        confidence: number;
        content: string;
      }>>(sql, ...sqlParams);
    }
  }

  // Fallback: sort by citedByPages and confidence
  return prisma.knowledgePage.findMany({
    where: {
      scope: "system",
      status: "verified",
      ...(params.pageTypes?.length ? { pageType: { in: params.pageTypes } } : {}),
    },
    orderBy: [{ citedByPages: "desc" }, { confidence: "desc" }],
    take: limit,
    select: { slug: true, title: true, pageType: true, status: true, confidence: true, content: true },
  });
}

export async function searchSystemPages(
  query: string,
  options?: { pageType?: string; limit?: number },
): Promise<Array<{
  slug: string;
  title: string;
  pageType: string;
  status: string;
  confidence: number;
  contentPreview: string;
  scope: string;
}>> {
  const limit = options?.limit ?? 5;

  const embeddings = await embedChunks([query]).catch(() => [null]);
  if (embeddings[0]) {
    const embeddingStr = `[${embeddings[0].join(",")}]`;
    const conditions = [
      `scope = 'system'`,
      `status IN ('verified', 'stale')`,
      `embedding IS NOT NULL`,
    ];
    const params: unknown[] = [embeddingStr];
    let nextIdx = 2;

    if (options?.pageType) {
      conditions.push(`"pageType" = $${nextIdx}`);
      params.push(options.pageType);
      nextIdx++;
    }

    params.push(limit);

    const sql = `
      SELECT slug, title, "pageType", status, confidence, content, scope
      FROM "KnowledgePage"
      WHERE ${conditions.join(" AND ")}
      ORDER BY embedding <=> $1::vector
      LIMIT $${nextIdx}
    `;

    const results = await prisma.$queryRawUnsafe<Array<{
      slug: string;
      title: string;
      pageType: string;
      status: string;
      confidence: number;
      content: string;
      scope: string;
    }>>(sql, ...params);

    return results.map((r) => ({
      slug: r.slug,
      title: r.title,
      pageType: r.pageType,
      status: r.status,
      confidence: r.confidence,
      contentPreview: r.content.slice(0, 500),
      scope: r.scope,
    }));
  }

  // Fallback text search
  const results = await prisma.knowledgePage.findMany({
    where: {
      scope: "system",
      status: { in: ["verified", "stale"] },
      ...(options?.pageType ? { pageType: options.pageType } : {}),
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { content: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { slug: true, title: true, pageType: true, status: true, confidence: true, content: true, scope: true },
    take: limit,
    orderBy: { confidence: "desc" },
  });

  return results.map((r) => ({
    slug: r.slug,
    title: r.title,
    pageType: r.pageType,
    status: r.status,
    confidence: r.confidence,
    contentPreview: r.content.slice(0, 500),
    scope: r.scope,
  }));
}

// ─── Seed Context Loading ──────────────────────────────

export async function getRelevantPagesForSeed(
  operatorId: string,
  triggerEntityId: string,
  situationTypeSlug?: string,
  projectId?: string,
  situationDescription?: string,
): Promise<Array<{ slug: string; title: string; pageType: string; status: string; content: string; trustLevel: string }>> {
  const pages: Array<{ slug: string; title: string; pageType: string; status: string; content: string; trustLevel: string }> = [];
  const TOKEN_BUDGET = 8000;
  let tokensUsed = 0;
  const usedSlugs = new Set<string>();

  // 1. Entity profile for trigger entity (always include if exists)
  const entityProfile = await getPageForEntity(operatorId, triggerEntityId, projectId);
  if (entityProfile && tokensUsed + Math.ceil(entityProfile.content.length / 4) < TOKEN_BUDGET) {
    pages.push({
      slug: entityProfile.slug,
      title: "Entity profile",
      pageType: "entity_profile",
      status: entityProfile.status,
      content: entityProfile.content,
      trustLevel: entityProfile.trustLevel ?? "provisional",
    });
    tokensUsed += Math.ceil(entityProfile.content.length / 4);
    usedSlugs.add(entityProfile.slug);
  }

  // 2. Situation pattern page (if situation type known)
  if (situationTypeSlug) {
    const pattern = await prisma.knowledgePage.findFirst({
      where: {
        operatorId,
        scope: "operator",
        pageType: "situation_pattern",
        slug: { contains: situationTypeSlug },
        status: { in: ["verified", "stale"] },
        projectId: projectId ?? null,
      },
      select: { slug: true, title: true, pageType: true, status: true, content: true, trustLevel: true },
    });
    if (pattern && !usedSlugs.has(pattern.slug) && tokensUsed + Math.ceil(pattern.content.length / 4) < TOKEN_BUDGET) {
      pages.push({ ...pattern, trustLevel: pattern.trustLevel ?? "provisional" });
      tokensUsed += Math.ceil(pattern.content.length / 4);
      usedSlugs.add(pattern.slug);
    }
  }

  // 3. Semantic retrieval — embed the situation and find relevant pages via vector similarity
  if (situationDescription && tokensUsed < TOKEN_BUDGET - 1000) {
    const [queryEmbedding] = await embedChunks([situationDescription]);

    if (queryEmbedding) {
      const embeddingStr = `[${queryEmbedding.join(",")}]`;
      const excludeSlugs = [...usedSlugs];

      const semanticPages = await prisma.$queryRaw<Array<{
        slug: string;
        title: string;
        pageType: string;
        status: string;
        content: string;
        trustLevel: string;
        contentTokens: number;
        similarity: number;
      }>>`
        SELECT slug, title, "pageType", status, content, "trustLevel", "contentTokens",
          1 - (embedding <=> ${embeddingStr}::vector) as similarity
        FROM "KnowledgePage"
        WHERE "operatorId" = ${operatorId}
          AND scope = 'operator'
          AND status IN ('verified', 'stale')
          AND embedding IS NOT NULL
          AND slug NOT IN (${Prisma.join(excludeSlugs.length > 0 ? excludeSlugs : ["__none__"])})
          ${projectId ? Prisma.sql`AND ("projectId" = ${projectId} OR "projectId" IS NULL)` : Prisma.sql`AND "projectId" IS NULL`}
        ORDER BY embedding <=> ${embeddingStr}::vector ASC
        LIMIT 10
      `;

      const trustPriority: Record<string, number> = {
        authoritative: 4, established: 3, provisional: 2, challenged: 1, quarantined: 0,
      };

      // Score = similarity * trust weight (authoritative pages rank higher)
      const scored = semanticPages
        .filter(p => (trustPriority[p.trustLevel] ?? 0) > 0)
        .map(p => ({
          ...p,
          score: p.similarity * (1 + (trustPriority[p.trustLevel] ?? 0) * 0.1),
        }))
        .sort((a, b) => b.score - a.score);

      for (const page of scored) {
        if (tokensUsed + page.contentTokens > TOKEN_BUDGET) continue;
        if (usedSlugs.has(page.slug)) continue;
        pages.push({
          slug: page.slug,
          title: page.title,
          pageType: page.pageType,
          status: page.status,
          content: page.content,
          trustLevel: page.trustLevel ?? "provisional",
        });
        tokensUsed += page.contentTokens;
        usedSlugs.add(page.slug);
      }
    }
  }

  // 4. Fallback: if semantic search didn't run or returned too few pages,
  //    use the old heuristic (department overview + high-use pages)
  if (pages.length < 3 && tokensUsed < TOKEN_BUDGET - 500) {
    const entity = await prisma.entity.findFirst({
      where: { id: triggerEntityId, operatorId },
      select: { parentDepartmentId: true },
    });
    if (entity?.parentDepartmentId) {
      const deptPage = await getPageForEntity(operatorId, entity.parentDepartmentId, projectId, "department_overview");
      if (deptPage && !usedSlugs.has(deptPage.slug) && tokensUsed + Math.ceil(deptPage.content.length / 4) < TOKEN_BUDGET) {
        pages.push({
          slug: deptPage.slug,
          title: "Department overview",
          pageType: "department_overview",
          status: deptPage.status,
          content: deptPage.content,
          trustLevel: deptPage.trustLevel ?? "provisional",
        });
        tokensUsed += Math.ceil(deptPage.content.length / 4);
        usedSlugs.add(deptPage.slug);
      }
    }

    const additional = await prisma.knowledgePage.findMany({
      where: {
        operatorId,
        scope: "operator",
        status: "verified",
        pageType: { in: ["process_description", "financial_pattern", "communication_pattern"] },
        projectId: projectId ?? null,
        slug: { notIn: [...usedSlugs] },
      },
      orderBy: [{ reasoningUseCount: "desc" }, { confidence: "desc" }],
      take: 3,
      select: { slug: true, title: true, pageType: true, status: true, content: true, contentTokens: true, trustLevel: true },
    });
    for (const page of additional) {
      if (tokensUsed + page.contentTokens > TOKEN_BUDGET) break;
      pages.push({ ...page, trustLevel: page.trustLevel ?? "provisional" });
      tokensUsed += page.contentTokens;
      usedSlugs.add(page.slug);
    }
  }

  return pages;
}

// ─── Helpers ────────────────────────────────────────────

function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[æ]/g, "ae").replace(/[ø]/g, "oe").replace(/[å]/g, "aa")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function buildSourcesArray(citations: WikiUpdate["sourceCitations"]): Array<{
  type: string;
  id: string;
  citation: string;
  claimCount: number;
}> {
  const map = new Map<string, { type: string; id: string; citation: string; claimCount: number }>();
  for (const c of citations) {
    const key = `${c.sourceType}:${c.sourceId}`;
    const existing = map.get(key);
    if (existing) {
      existing.claimCount++;
    } else {
      map.set(key, { type: c.sourceType, id: c.sourceId, citation: c.claim, claimCount: 1 });
    }
  }
  return [...map.values()];
}

function mergeSources(
  existing: Array<{ id: string; [k: string]: unknown }>,
  incoming: Array<{ id: string; [k: string]: unknown }>,
): Array<{ id: string; [k: string]: unknown }> {
  const map = new Map<string, { id: string; [k: string]: unknown }>();
  for (const s of existing) map.set(s.id, s);
  for (const s of incoming) map.set(s.id, s);
  return [...map.values()];
}

function extractCrossReferences(content: string): string[] {
  const matches = content.match(/\[\[([a-z0-9-]+)\]\]|\[page:([a-z0-9-]+)\]/g) ?? [];
  return [...new Set(matches.map((m) => m.replace(/[\[\]]/g, "").replace("page:", "")))];
}

async function updateIndexPage(operatorId: string, projectId?: string): Promise<void> {
  const pages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      projectId: projectId ?? null,
      pageType: { not: "index" },
    },
    select: { slug: true, title: true, pageType: true, status: true, sourceCount: true, lastSynthesizedAt: true },
    orderBy: [{ pageType: "asc" }, { title: "asc" }],
  });

  // Group by pageType
  const groups = new Map<string, typeof pages>();
  for (const p of pages) {
    const group = groups.get(p.pageType) ?? [];
    group.push(p);
    groups.set(p.pageType, group);
  }

  let content = "# Wiki index\n\n";
  for (const [type, pgs] of groups) {
    content += `## ${type.replace(/_/g, " ")}\n\n`;
    for (const p of pgs) {
      const statusTag = p.status !== "verified" ? ` [${p.status}]` : "";
      const date = p.lastSynthesizedAt.toISOString().split("T")[0];
      content += `- [[${p.slug}]] — ${p.title}${statusTag} (${p.sourceCount} sources, ${date})\n`;
    }
    content += "\n";
  }

  const slug = projectId ? `index-${projectId}` : "index";
  await prisma.knowledgePage.upsert({
    where: { operatorId_slug: { operatorId, slug } },
    update: {
      content,
      contentTokens: Math.ceil(content.length / 4),
      version: { increment: 1 },
      lastSynthesizedAt: new Date(),
    },
    create: {
      operatorId,
      projectId: projectId ?? null,
      pageType: "index",
      title: "Wiki index",
      slug,
      content,
      contentTokens: Math.ceil(content.length / 4),
      status: "verified",
      confidence: 1.0,
      version: 1,
      synthesisPath: "background",
      synthesizedByModel: "system",
      lastSynthesizedAt: new Date(),
    },
  });
}

async function appendToLog(
  operatorId: string,
  projectId: string | undefined,
  updates: WikiUpdate[],
  synthesisPath: string,
): Promise<void> {
  const slug = projectId ? `log-${projectId}` : "log";
  const timestamp = new Date().toISOString();
  const entries = updates.map((u) =>
    `## [${timestamp}] ${synthesisPath} | ${u.updateType} | ${u.slug}\n${u.reasoning}`,
  ).join("\n\n");

  const existing = await prisma.knowledgePage.findUnique({
    where: { operatorId_slug: { operatorId, slug } },
  });

  if (existing) {
    await prisma.knowledgePage.update({
      where: { id: existing.id },
      data: {
        content: existing.content + "\n\n" + entries,
        contentTokens: Math.ceil((existing.content.length + entries.length) / 4),
        version: { increment: 1 },
        lastSynthesizedAt: new Date(),
      },
    });
  } else {
    await prisma.knowledgePage.create({
      data: {
        operatorId,
        projectId: projectId ?? null,
        pageType: "log",
        title: "Wiki log",
        slug,
        content: `# Wiki log\n\nChronological record of wiki operations.\n\n${entries}`,
        contentTokens: Math.ceil(entries.length / 4),
        status: "verified",
        confidence: 1.0,
        version: 1,
        synthesisPath: "background",
        synthesizedByModel: "system",
        lastSynthesizedAt: new Date(),
      },
    });
  }
}

// ─── Outcome feedback ───────────────────────────────────

export async function updateWikiOutcomeSignals(
  situationId: string,
  outcome: "approved" | "rejected" | "dismissed",
): Promise<void> {
  if (outcome === "dismissed") return;

  const situation = await prisma.situation.findUnique({
    where: { id: situationId },
    select: { operatorId: true },
  });
  if (!situation) return;

  // Find wiki pages accessed via tool calls during reasoning
  const traces = await prisma.toolCallTrace.findMany({
    where: { situationId, toolName: { in: ["read_wiki_page", "search_wiki"] } },
    select: { arguments: true },
  });

  const pageSlugs = new Set<string>();
  for (const trace of traces) {
    const args = trace.arguments as Record<string, unknown> | null;
    if (args?.slug) pageSlugs.add(String(args.slug));
  }

  if (pageSlugs.size === 0) return;

  const field = outcome === "approved" ? "outcomeApproved" : "outcomeRejected";

  const pages = await prisma.knowledgePage.findMany({
    where: { operatorId: situation.operatorId, scope: "operator", slug: { in: [...pageSlugs] } },
    select: { id: true, slug: true },
  });
  const pageIdBySlug = new Map(pages.map((p) => [p.slug, p.id]));

  for (const slug of pageSlugs) {
    await prisma.knowledgePage.updateMany({
      where: { operatorId: situation.operatorId, scope: "operator", slug },
      data: { [field]: { increment: 1 } },
    }).catch(() => {});

    const pageId = pageIdBySlug.get(slug);
    if (pageId) {
      updateTrustLevel(pageId).catch(() => {});
    }
  }
}

// ─── Version snapshots ─────────────────────────────────

/**
 * Creates a snapshot of the current page state before any content modification.
 * Failure is non-blocking — must never prevent the actual wiki update.
 */
export async function createVersionSnapshot(
  pageId: string,
  changeReason: string,
  changedBy: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const page = await prisma.knowledgePage.findUniqueOrThrow({
      where: { id: pageId },
      select: { id: true, content: true, confidence: true, status: true, sourceCount: true, version: true },
    });

    await prisma.knowledgePageVersion.create({
      data: {
        pageId,
        versionNumber: page.version,
        content: page.content,
        confidence: page.confidence,
        status: page.status,
        sourceCount: page.sourceCount,
        changeReason,
        changedBy,
        metadata: metadata ? (metadata as any) : undefined,
      },
    });
  } catch (err) {
    // Version snapshot failure must NOT block the actual wiki update
    console.error(`[wiki-engine] Version snapshot failed for page ${pageId}:`, err);
  }
}

// ─── Trust level management ────────────────────────────

/**
 * Recalculates trust level for a page based on verification status,
 * reasoning use count, and outcome approval rate.
 *
 * Transitions:
 *   provisional → established: verified + 3+ reasoning uses + more approvals than rejections
 *   established → authoritative: verified + 10+ reasoning uses + >80% approval rate
 *   any → challenged: 5+ outcomes with more rejections than approvals
 *   any → quarantined: page status is quarantined
 */
export async function updateTrustLevel(pageId: string): Promise<void> {
  try {
    const page = await prisma.knowledgePage.findUniqueOrThrow({
      where: { id: pageId },
      select: {
        id: true,
        trustLevel: true,
        status: true,
        reasoningUseCount: true,
        outcomeApproved: true,
        outcomeRejected: true,
      },
    });

    const total = page.outcomeApproved + page.outcomeRejected;
    const approvalRate = total > 0 ? page.outcomeApproved / total : 0;
    let newLevel = page.trustLevel ?? "provisional";

    if (page.status === "quarantined") {
      newLevel = "quarantined";
    } else if (total >= 5 && page.outcomeRejected > page.outcomeApproved) {
      newLevel = "challenged";
    } else if (page.status === "verified" && page.reasoningUseCount >= 10 && approvalRate > 0.8) {
      newLevel = "authoritative";
    } else if (page.status === "verified" && page.reasoningUseCount >= 3 && page.outcomeApproved > page.outcomeRejected) {
      newLevel = "established";
    }
    // "provisional" stays as default — no explicit transition needed

    if (newLevel !== (page.trustLevel ?? "provisional")) {
      await prisma.knowledgePage.update({
        where: { id: pageId },
        data: { trustLevel: newLevel },
      });
    }
  } catch (err) {
    console.error(`[wiki-engine] Trust level update failed for page ${pageId}:`, err);
  }
}

// ─── Rollback ──────────────────────────────────────────

export async function rollbackPage(pageId: string, targetVersionNumber: number): Promise<void> {
  const targetVersion = await prisma.knowledgePageVersion.findUniqueOrThrow({
    where: { pageId_versionNumber: { pageId, versionNumber: targetVersionNumber } },
  });

  // Snapshot current state before rollback
  await createVersionSnapshot(pageId, "rollback", "system", {
    rolledBackTo: targetVersionNumber,
  });

  // Restore content from target version
  await prisma.knowledgePage.update({
    where: { id: pageId },
    data: {
      content: targetVersion.content,
      confidence: targetVersion.confidence,
      status: targetVersion.status,
      sourceCount: targetVersion.sourceCount,
      trustLevel: "challenged",
      version: { increment: 1 },
    },
  });

  // Re-embed the restored content
  const [embedding] = await embedChunks([targetVersion.content]).catch(() => [null]);
  if (embedding) {
    const embeddingStr = `[${embedding.join(",")}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE "KnowledgePage" SET embedding = $1::vector WHERE id = $2`,
      embeddingStr,
      pageId,
    );
  }
}
