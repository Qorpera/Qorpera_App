/**
 * Source Library — service layer for system-scoped reference material.
 *
 * SourceDocuments are the ground truth archive: books, research papers,
 * standards, empirical data. They feed the system wiki through the
 * synthesis pipeline (Session 3) and are verified via integrity checks.
 *
 * All queries are system-scoped (no operatorId filter).
 */

import { prisma } from "@/lib/db";

// ─── Types ──────────────────────────────────────────────

export interface SourceDetail {
  id: string;
  title: string;
  authors: string | null;
  domain: string | null;
  domains: string[];
  sourceType: string;
  sourceAuthority: string;
  status: string;
  sectionCount: number | null;
  pagesProduced: number;
  publicationYear: number | null;
  isbn: string | null;
  version: string | null;
  notes: string | null;
  integrityStatus: string | null;
  integrityNotes: string | null;
  lastIntegrityCheck: Date | null;
  supersededById: string | null;
  fileUploadId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  sections: Array<{
    id: string;
    sectionIndex: number;
    title: string;
    titleHierarchy: string[];
    tokenCount: number;
    sectionType: string;
    status: string;
    pagesProduced: number;
    skipReason: string | null;
  }>;
  producedPages: Array<{
    slug: string;
    title: string;
    pageType: string;
    status: string;
    stagingStatus: string | null;
  }>;
}

export interface SourceListItem {
  id: string;
  title: string;
  authors: string | null;
  domain: string | null;
  domains: string[];
  sourceType: string;
  sourceAuthority: string;
  status: string;
  sectionCount: number | null;
  pagesProduced: number;
  publicationYear: number | null;
  integrityStatus: string | null;
  createdAt: Date;
}

export interface SourceSearchResult {
  id: string;
  title: string;
  sourceType: string;
  domain: string | null;
  highlight: string;
}

export type SourceMetadata = {
  title?: string;
  authors?: string;
  domain?: string;
  domains?: string[];
  sourceType?: string;
  sourceAuthority?: string;
  publicationYear?: number;
  isbn?: string;
  version?: string;
  notes?: string;
};

// ─── Create ─────────────────────────────────────────────

export async function createSourceFromFile(params: {
  title: string;
  authors?: string;
  domain?: string;
  domains?: string[];
  sourceType: string;
  sourceAuthority: string;
  fileUploadId: string;
  publicationYear?: number;
  isbn?: string;
  version?: string;
  notes?: string;
}): Promise<string> {
  const source = await prisma.sourceDocument.create({
    data: {
      title: params.title,
      authors: params.authors,
      domain: params.domain,
      domains: params.domains ?? [],
      sourceType: params.sourceType,
      sourceAuthority: params.sourceAuthority,
      fileUploadId: params.fileUploadId,
      publicationYear: params.publicationYear,
      isbn: params.isbn,
      version: params.version,
      notes: params.notes,
      status: "uploaded",
    },
    select: { id: true },
  });
  return source.id;
}

export async function createSourceFromText(params: {
  title: string;
  authors?: string;
  domain?: string;
  domains?: string[];
  sourceType: string;
  sourceAuthority: string;
  rawMarkdown: string;
  publicationYear?: number;
  notes?: string;
}): Promise<string> {
  const source = await prisma.sourceDocument.create({
    data: {
      title: params.title,
      authors: params.authors,
      domain: params.domain,
      domains: params.domains ?? [],
      sourceType: params.sourceType,
      sourceAuthority: params.sourceAuthority,
      rawMarkdown: params.rawMarkdown,
      publicationYear: params.publicationYear,
      notes: params.notes,
      status: "uploaded",
    },
    select: { id: true },
  });
  return source.id;
}

// ─── Read ───────────────────────────────────────────────

export async function getSourceDetail(sourceId: string): Promise<SourceDetail | null> {
  const source = await prisma.sourceDocument.findUnique({
    where: { id: sourceId },
    select: {
      id: true,
      title: true,
      authors: true,
      domain: true,
      domains: true,
      sourceType: true,
      sourceAuthority: true,
      status: true,
      sectionCount: true,
      pagesProduced: true,
      publicationYear: true,
      isbn: true,
      version: true,
      notes: true,
      integrityStatus: true,
      integrityNotes: true,
      lastIntegrityCheck: true,
      supersededById: true,
      fileUploadId: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
      sections: {
        select: {
          id: true,
          sectionIndex: true,
          title: true,
          titleHierarchy: true,
          tokenCount: true,
          sectionType: true,
          status: true,
          pagesProduced: true,
          skipReason: true,
        },
        orderBy: { sectionIndex: "asc" },
      },
    },
  });

  if (!source) return null;

  const producedPages = await prisma.knowledgePage.findMany({
    where: { sourceDocumentId: sourceId },
    select: {
      slug: true,
      title: true,
      pageType: true,
      status: true,
      stagingStatus: true,
    },
    orderBy: { title: "asc" },
  });

  return { ...source, producedPages };
}

export async function listSources(filters?: {
  sourceType?: string;
  sourceAuthority?: string;
  domain?: string;
  status?: string;
  integrityStatus?: string;
}): Promise<SourceListItem[]> {
  const where: Record<string, unknown> = {};
  if (filters?.sourceType) where.sourceType = filters.sourceType;
  if (filters?.sourceAuthority) where.sourceAuthority = filters.sourceAuthority;
  if (filters?.domain) where.domain = filters.domain;
  if (filters?.status) where.status = filters.status;
  if (filters?.integrityStatus) where.integrityStatus = filters.integrityStatus;

  return prisma.sourceDocument.findMany({
    where,
    select: {
      id: true,
      title: true,
      authors: true,
      domain: true,
      domains: true,
      sourceType: true,
      sourceAuthority: true,
      status: true,
      sectionCount: true,
      pagesProduced: true,
      publicationYear: true,
      integrityStatus: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

// ─── Search ─────────────────────────────────────────────

export async function searchSourceText(
  query: string,
  options?: { domain?: string; sourceType?: string; limit?: number },
): Promise<SourceSearchResult[]> {
  const limit = Math.min(options?.limit ?? 10, 50);

  // Build WHERE conditions
  const conditions: string[] = [
    `to_tsvector('english', COALESCE("rawText", '') || ' ' || COALESCE("rawMarkdown", '')) @@ plainto_tsquery('english', $1)`,
  ];
  const params: unknown[] = [query];

  if (options?.domain) {
    params.push(options.domain);
    conditions.push(`"domain" = $${params.length}`);
  }
  if (options?.sourceType) {
    params.push(options.sourceType);
    conditions.push(`"sourceType" = $${params.length}`);
  }

  params.push(limit);

  const results = await prisma.$queryRawUnsafe<SourceSearchResult[]>(
    `SELECT id, title, "sourceType", domain,
            ts_headline('english', COALESCE("rawText", '') || ' ' || COALESCE("rawMarkdown", ''), plainto_tsquery('english', $1),
              'MaxWords=50, MinWords=20, StartSel=**, StopSel=**') as highlight
     FROM "SourceDocument"
     WHERE ${conditions.join(" AND ")}
     LIMIT $${params.length}`,
    ...params,
  );

  return results;
}

// ─── Update ─────────────────────────────────────────────

export async function updateSource(sourceId: string, updates: SourceMetadata): Promise<void> {
  await prisma.sourceDocument.update({
    where: { id: sourceId },
    data: updates,
  });
}

export async function supersededSource(oldSourceId: string, newSourceId: string): Promise<void> {
  await prisma.sourceDocument.update({
    where: { id: oldSourceId },
    data: { supersededById: newSourceId },
  });
}

// ─── Staging ────────────────────────────────────────────

export interface StagedPageListItem {
  id: string;
  slug: string;
  title: string;
  pageType: string;
  contentPreview: string;
  sourceReference: string | null;
  sourceDocumentId: string | null;
  sourceTitle: string | null;
  createdAt: Date;
}

export interface StagedPageDetail {
  id: string;
  slug: string;
  title: string;
  pageType: string;
  content: string;
  contentTokens: number;
  crossReferences: string[];
  sourceAuthority: string | null;
  sourceReference: string | null;
  sourceDocumentId: string | null;
  sourceTitle: string | null;
  sourceAuthors: string | null;
  stagingStatus: string | null;
  createdAt: Date;
  relatedPages: Array<{ slug: string; title: string; pageType: string }>;
}

export async function listStagedPages(filters?: {
  sourceId?: string;
  pageType?: string;
  limit?: number;
  offset?: number;
}): Promise<StagedPageListItem[]> {
  const where: Record<string, unknown> = {
    scope: "system",
    stagingStatus: "staged",
  };
  if (filters?.sourceId) where.sourceDocumentId = filters.sourceId;
  if (filters?.pageType) where.pageType = filters.pageType;

  const pages = await prisma.knowledgePage.findMany({
    where,
    select: {
      id: true,
      slug: true,
      title: true,
      pageType: true,
      content: true,
      sourceReference: true,
      sourceDocumentId: true,
      sourceDocument: { select: { title: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: filters?.limit ?? 50,
    skip: filters?.offset ?? 0,
  });

  return pages.map(p => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    pageType: p.pageType,
    contentPreview: p.content.slice(0, 500),
    sourceReference: p.sourceReference,
    sourceDocumentId: p.sourceDocumentId,
    sourceTitle: p.sourceDocument?.title ?? null,
    createdAt: p.createdAt,
  }));
}

export async function getStagedPage(pageId: string): Promise<StagedPageDetail | null> {
  const page = await prisma.knowledgePage.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      slug: true,
      title: true,
      pageType: true,
      content: true,
      contentTokens: true,
      crossReferences: true,
      sourceAuthority: true,
      sourceReference: true,
      sourceDocumentId: true,
      sourceDocument: { select: { title: true, authors: true } },
      stagingStatus: true,
      createdAt: true,
    },
  });
  if (!page) return null;

  // Load related pages by cross-references
  const relatedPages = page.crossReferences.length > 0
    ? await prisma.knowledgePage.findMany({
        where: { scope: "system", slug: { in: page.crossReferences } },
        select: { slug: true, title: true, pageType: true },
      })
    : [];

  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    pageType: page.pageType,
    content: page.content,
    contentTokens: page.contentTokens,
    crossReferences: page.crossReferences,
    sourceAuthority: page.sourceAuthority,
    sourceReference: page.sourceReference,
    sourceDocumentId: page.sourceDocumentId,
    sourceTitle: page.sourceDocument?.title ?? null,
    sourceAuthors: page.sourceDocument?.authors ?? null,
    stagingStatus: page.stagingStatus,
    createdAt: page.createdAt,
    relatedPages,
  };
}

export async function approveStagedPage(pageId: string, reviewNote?: string): Promise<void> {
  await prisma.knowledgePage.update({
    where: { id: pageId },
    data: {
      stagingStatus: "approved",
      stagingReviewedAt: new Date(),
      stagingReviewNote: reviewNote ?? null,
    },
  });
}

export async function rejectStagedPage(pageId: string, reason: string, reviewNote?: string): Promise<void> {
  await prisma.knowledgePage.update({
    where: { id: pageId },
    data: {
      stagingStatus: "rejected",
      stagingReviewedAt: new Date(),
      stagingReviewNote: reviewNote ? `${reason} — ${reviewNote}` : reason,
    },
  });
}

export async function editStagedPage(pageId: string, newContent: string): Promise<void> {
  const crossRefs = (newContent.match(/\[\[([^\]]+)\]\]/g) || []).map(m => m.slice(2, -2));
  await prisma.knowledgePage.update({
    where: { id: pageId },
    data: {
      content: newContent,
      contentTokens: Math.ceil(newContent.length / 4),
      crossReferences: [...new Set(crossRefs)],
    },
  });
}

export async function bulkApproveStagedPages(sourceId: string): Promise<number> {
  const result = await prisma.knowledgePage.updateMany({
    where: {
      sourceDocumentId: sourceId,
      scope: "system",
      stagingStatus: "staged",
    },
    data: {
      stagingStatus: "approved",
      stagingReviewedAt: new Date(),
    },
  });
  return result.count;
}

// ─── Delete ─────────────────────────────────────────────

export async function deleteSource(sourceId: string): Promise<void> {
  // Cascade handles sections and integrity checks.
  // Unlink knowledge pages (don't delete them — they may still be useful).
  await prisma.$transaction([
    prisma.knowledgePage.updateMany({
      where: { sourceDocumentId: sourceId },
      data: { sourceDocumentId: null },
    }),
    prisma.sourceDocument.delete({
      where: { id: sourceId },
    }),
  ]);
}
