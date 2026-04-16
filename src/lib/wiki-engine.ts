/**
 * Wiki engine — core CRUD for KnowledgePage.
 *
 * Processes wiki updates from reasoning, background synthesis, and onboarding.
 * Provides entity profile lookups, full-text search, and seed context loading
 * for the reasoning engine.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifyPage } from "@/lib/wiki-verification";

import { getDefaultVisibility } from "@/lib/wiki-visibility";

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
  synthesisPath: "reasoning" | "background" | "onboarding" | "lint" | "investigation" | "research" | "reflection" | "living_research" | "adversarial" | "document_intelligence" | "initiative_reasoning";
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
  properties?: Record<string, unknown>;
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
  // Create page via Prisma — searchVector is a STORED generated column, auto-updates
  const created = await prisma.knowledgePage.create({
    data: {
      operatorId: params.operatorId,
      projectId: params.projectId ?? null,
      visibility: getDefaultVisibility(params.pageType),
      pageType: params.pageType,
      subjectEntityId: params.subjectEntityId ?? null,
      title: params.title,
      slug,
      content: params.content,
      contentTokens,
      crossReferences,
      properties: params.properties
        ? (params.properties as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
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
  properties?: Record<string, unknown>;
}): Promise<void> {
  const slug = normalizeSlug(params.slug);

  const existing = await prisma.knowledgePage.findUnique({
    where: { operatorId_slug: { operatorId: params.operatorId, slug } },
    select: {
      id: true, content: true, slug: true, sources: true, sourceTypes: true,
      sourceCount: true, confidence: true, contentTokens: true, version: true,
      crossReferences: true, status: true, trustLevel: true, situationId: true,
    },
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
  try {
    await createVersionSnapshot(existing.id, "synthesis", params.synthesizedByModel ?? "unknown");
  } catch (err) {
    console.warn(`[wiki-engine] Version snapshot skipped for ${slug} (${err instanceof Error ? err.message : "unknown"})`);
  }

  // searchVector is a STORED generated column — auto-updates when content changes
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
      ...(params.properties
        ? { properties: params.properties as unknown as Prisma.InputJsonValue }
        : {}),
    },
  });

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
    select: { id: true, content: true, version: true },
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
        visibility: "management",
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
): Promise<{ content: string; status: string; confidence: number; slug: string; title: string; pageType: string; properties: unknown; activityContent: string | null; trustLevel: string | null } | null> {
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
    select: { content: true, status: true, confidence: true, slug: true, title: true, pageType: true, properties: true, activityContent: true, id: true, trustLevel: true },
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

  // Full-text search via tsvector — websearch_to_tsquery handles natural language,
  // quoted phrases, implicit AND, and -exclusion gracefully
  const conditions: string[] = [
    `"operatorId" = $1`,
    `status = ANY($2::text[])`,
    `scope = 'operator'`,
    `"searchVector" @@ websearch_to_tsquery('english', $3)`,
  ];
  const params: unknown[] = [operatorId, statusFilter, query];
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
    SELECT slug, title, "pageType", status, confidence, LEFT(content, 500) as content,
           ts_rank("searchVector", websearch_to_tsquery('english', $3)) as rank
    FROM "KnowledgePage"
    WHERE ${conditions.join(" AND ")}
    ORDER BY rank DESC
    LIMIT $${limitIdx}
  `;

  const results = await prisma.$queryRawUnsafe<Array<{
    slug: string;
    title: string;
    pageType: string;
    status: string;
    confidence: number;
    content: string;
    rank: number;
  }>>(sql, ...params);

  if (results.length > 0) {
    return results.map((r) => ({
      slug: r.slug,
      title: r.title,
      pageType: r.pageType,
      status: r.status,
      confidence: r.confidence,
      contentPreview: r.content ?? "",
    }));
  }

  // Fallback: ILIKE on title + slug when FTS returns nothing (proper nouns, abbreviations)
  const fallback = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      status: { in: statusFilter },
      ...(options?.pageType ? { pageType: options.pageType } : {}),
      ...(options?.projectId ? { projectId: options.projectId } : { projectId: null }),
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { slug: { contains: query.replace(/\s+/g, "-"), mode: "insensitive" } },
        { content: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { slug: true, title: true, pageType: true, status: true, confidence: true, content: true },
    take: limit,
    orderBy: { confidence: "desc" },
  });

  return fallback.map((r) => ({
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

  // Full-text search if query provided
  if (params.query) {
    const conditions = [
      `scope = 'system'`,
      `status = 'verified'`,
      `("stagingStatus" IS NULL OR "stagingStatus" = 'approved')`,
      `"searchVector" @@ websearch_to_tsquery('english', $1)`,
    ];
    const sqlParams: unknown[] = [params.query];
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
      ORDER BY ts_rank("searchVector", websearch_to_tsquery('english', $1)) DESC
      LIMIT $${nextIdx}
    `;

    const ftsResults = await prisma.$queryRawUnsafe<Array<{
      slug: string;
      title: string;
      pageType: string;
      status: string;
      confidence: number;
      content: string;
    }>>(sql, ...sqlParams);

    if (ftsResults.length > 0) return ftsResults;
  }

  // Fallback: sort by citedByPages and confidence
  return prisma.knowledgePage.findMany({
    where: {
      scope: "system",
      status: "verified",
      OR: [{ stagingStatus: null }, { stagingStatus: "approved" }],
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

  // Full-text search via tsvector
  const conditions = [
    `scope = 'system'`,
    `status IN ('verified', 'stale')`,
    `("stagingStatus" IS NULL OR "stagingStatus" = 'approved')`,
    `"searchVector" @@ websearch_to_tsquery('english', $1)`,
  ];
  const ftsParams: unknown[] = [query];
  let nextIdx = 2;

  if (options?.pageType) {
    conditions.push(`"pageType" = $${nextIdx}`);
    ftsParams.push(options.pageType);
    nextIdx++;
  }

  ftsParams.push(limit);

  const sql = `
    SELECT slug, title, "pageType", status, confidence, LEFT(content, 500) as content, scope
    FROM "KnowledgePage"
    WHERE ${conditions.join(" AND ")}
    ORDER BY ts_rank("searchVector", websearch_to_tsquery('english', $1)) DESC
    LIMIT $${nextIdx}
  `;

  const ftsResults = await prisma.$queryRawUnsafe<Array<{
    slug: string;
    title: string;
    pageType: string;
    status: string;
    confidence: number;
    content: string;
    scope: string;
  }>>(sql, ...ftsParams);

  if (ftsResults.length > 0) {
    return ftsResults.map((r) => ({
      slug: r.slug,
      title: r.title,
      pageType: r.pageType,
      status: r.status,
      confidence: r.confidence,
      contentPreview: r.content ?? "",
      scope: r.scope,
    }));
  }

  // Fallback text search
  const results = await prisma.knowledgePage.findMany({
    where: {
      scope: "system",
      status: { in: ["verified", "stale"] },
      OR: [{ stagingStatus: null }, { stagingStatus: "approved" }],
      ...(options?.pageType ? { pageType: options.pageType } : {}),
      AND: [
        { OR: [
          { title: { contains: query, mode: "insensitive" } },
          { content: { contains: query, mode: "insensitive" } },
        ] },
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

export function extractCrossReferences(content: string): string[] {
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

  // Append routing map if available
  try {
    const { generateRoutingMap } = await import("@/lib/wiki-routing");
    const routingMap = await generateRoutingMap(operatorId);

    if (routingMap.entries.length > 0) {
      content += "## Routing Map\n\n";
      content += `_Based on ${routingMap.basedOnEvaluations} resolved situations_\n\n`;
      for (const entry of routingMap.entries) {
        content += `### ${entry.situationPattern}\n`;
        content += `Recommended pages:\n`;
        for (const page of entry.recommendedPages) {
          content += `- [[${page.slug}]] — ${page.relevanceReason}\n`;
        }
        if (entry.avoidPages.length > 0) {
          content += `Pages to skip: ${entry.avoidPages.join(", ")}\n`;
        }
        content += "\n";
      }
    }
  } catch (err) {
    console.warn("[wiki-engine] Routing map generation failed:", err);
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
      visibility: "operator",
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
    select: { id: true, content: true, version: true },
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
        visibility: "management",
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

  const situationPage = await prisma.knowledgePage.findFirst({
    where: {
      pageType: "situation_instance",
      scope: "operator",
      properties: { path: ["situation_id"], equals: situationId },
    },
    select: { operatorId: true },
  });
  if (!situationPage) return;

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
    where: { operatorId: situationPage.operatorId, scope: "operator", slug: { in: [...pageSlugs] } },
    select: { id: true, slug: true },
  });
  const pageIdBySlug = new Map(pages.map((p) => [p.slug, p.id]));

  for (const slug of pageSlugs) {
    await prisma.knowledgePage.updateMany({
      where: { operatorId: situationPage.operatorId, scope: "operator", slug },
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

  // searchVector is a STORED generated column — auto-updates from restored content
}

// ─── Activity Pipeline Helpers ────────────────────────────

/**
 * Resolve an email or name to a person_profile wiki page slug.
 * Used by the activity pipeline to route activity to the right person page.
 * Returns null if no matching person page found.
 */
export async function resolvePageSlug(
  operatorId: string,
  email?: string,
  name?: string,
): Promise<string | null> {
  // Try email match first (most precise)
  if (email) {
    const byEmail = await prisma.knowledgePage.findFirst({
      where: {
        operatorId,
        scope: "operator",
        pageType: "person_profile",
        content: { contains: email, mode: "insensitive" },
      },
      select: { slug: true },
    });
    if (byEmail) return byEmail.slug;
  }

  // Fall back to name match
  if (name) {
    const byName = await prisma.knowledgePage.findFirst({
      where: {
        operatorId,
        scope: "operator",
        pageType: "person_profile",
        title: { contains: name, mode: "insensitive" },
      },
      select: { slug: true },
    });
    if (byName) return byName.slug;
  }

  return null;
}

/**
 * Resolve a person page slug to their domain hub page slug.
 * Reads the person page's properties.department field.
 */
export async function resolveDomainSlugForPerson(
  operatorId: string,
  personPageSlug: string,
): Promise<string | null> {
  const page = await prisma.knowledgePage.findUnique({
    where: { operatorId_slug: { operatorId, slug: personPageSlug } },
    select: { properties: true },
  });

  if (!page?.properties) return null;

  const props = page.properties as Record<string, unknown>;
  const department = props.department as string | undefined;

  return department ?? null;
}

// ─── Optimistic Locking ─────────────────────────────────

export interface PageLockContext {
  id: string;
  slug: string;
  content: string;
  properties: Record<string, unknown> | null;
  version: number;
  activityContent: string | null;
  title: string;
}

export type PageUpdateFn = (page: PageLockContext) => {
  content?: string;
  properties?: Record<string, unknown>;
  activityContent?: string;
  title?: string;
};

/**
 * Read a page, apply an update function, write back with version check.
 * Retries up to maxRetries on version conflict (another writer got there first).
 *
 * Returns the updated page context on success.
 * Throws on permanent failure (page not found, max retries exceeded).
 */
export async function updatePageWithLock(
  operatorId: string,
  slug: string,
  updateFn: PageUpdateFn,
  options?: { maxRetries?: number },
): Promise<PageLockContext> {
  const maxRetries = options?.maxRetries ?? 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const page = await prisma.knowledgePage.findUnique({
      where: { operatorId_slug: { operatorId, slug } },
      select: {
        id: true,
        slug: true,
        content: true,
        properties: true,
        version: true,
        activityContent: true,
        title: true,
      },
    });

    if (!page) {
      throw new Error(`Page not found: ${slug}`);
    }

    const ctx: PageLockContext = {
      id: page.id,
      slug: page.slug,
      content: page.content,
      properties: page.properties as Record<string, unknown> | null,
      version: page.version,
      activityContent: page.activityContent,
      title: page.title,
    };

    const changes = updateFn(ctx);

    // Short-circuit: no-op update burns a version number and causes spurious conflicts
    if (!changes.content && !changes.properties && !changes.activityContent && !changes.title) {
      return ctx;
    }

    // Derive cross-references and token count if content changed
    const newCrossRefs = changes.content !== undefined
      ? extractCrossReferences(changes.content)
      : null;
    const newTokens = changes.content !== undefined
      ? Math.ceil(changes.content.length / 4)
      : null;

    const rowsAffected = await prisma.$executeRawUnsafe(
      `UPDATE "KnowledgePage"
       SET "content" = COALESCE($1, "content"),
           "properties" = COALESCE($2::jsonb, "properties"),
           "activityContent" = COALESCE($3, "activityContent"),
           "title" = COALESCE($4, "title"),
           "crossReferences" = COALESCE($5::text[], "crossReferences"),
           "contentTokens" = COALESCE($6, "contentTokens"),
           "version" = "version" + 1,
           "updatedAt" = NOW()
       WHERE "id" = $7 AND "version" = $8`,
      changes.content ?? null,
      changes.properties ? JSON.stringify(changes.properties) : null,
      changes.activityContent ?? null,
      changes.title ?? null,
      newCrossRefs,
      newTokens,
      ctx.id,
      ctx.version,
    );

    if (rowsAffected === 0) {
      // Version conflict — retry
      if (attempt < maxRetries) continue;
      throw new Error(`Version conflict after ${maxRetries} retries: ${slug}`);
    }

    // Return updated context
    return {
      ...ctx,
      ...(changes.content !== undefined ? { content: changes.content } : {}),
      ...(changes.title !== undefined ? { title: changes.title } : {}),
      ...(changes.activityContent !== undefined ? { activityContent: changes.activityContent } : {}),
      ...(changes.properties !== undefined ? { properties: changes.properties } : {}),
      version: ctx.version + 1,
    };
  }

  // Unreachable, but TypeScript needs it
  throw new Error(`Version conflict after ${maxRetries} retries: ${slug}`);
}
