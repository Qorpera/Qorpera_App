import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createHash } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoreRawContentInput {
  operatorId: string;
  accountId?: string;
  userId?: string;
  sourceType: string;
  sourceId: string;
  content: string;
  metadata: Record<string, unknown>;
  occurredAt: Date;
}

export interface RawContentRecord {
  id: string;
  sourceType: string;
  sourceId: string;
  rawBody: string | null;
  rawMetadata: Record<string, unknown>;
  occurredAt: Date;
}

export interface RawContentListItem {
  id: string;
  sourceType: string;
  sourceId: string;
  rawMetadata: Record<string, unknown>;
  occurredAt: Date;
  sizeBytes: number;
}

export interface StorageStats {
  totalItems: number;
  totalSizeBytes: number;
  bySourceType: Record<string, { count: number; sizeBytes: number }>;
}

// ── Store / Read ──────────────────────────────────────────────────────────────

export async function storeRawContent(input: StoreRawContentInput): Promise<string> {
  const contentHash = createHash("sha256").update(input.content).digest("hex");
  const sizeBytes = Buffer.byteLength(input.content, "utf-8");

  const result = await prisma.rawContent.upsert({
    where: {
      operatorId_sourceType_sourceId: {
        operatorId: input.operatorId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
    },
    create: {
      operatorId: input.operatorId,
      accountId: input.accountId ?? null,
      userId: input.userId ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      contentHash,
      rawBody: input.content,
      rawMetadata: input.metadata as any,
      sizeBytes,
      occurredAt: input.occurredAt,
    },
    update: {
      rawBody: input.content,
      rawMetadata: input.metadata as any,
      contentHash,
      sizeBytes,
      occurredAt: input.occurredAt,
      storedAt: new Date(),
    },
    select: { id: true },
  });

  return result.id;
}

export async function readRawContent(
  operatorId: string,
  sourceType: string,
  sourceId: string,
): Promise<{ rawBody: string | null; rawMetadata: Record<string, unknown>; occurredAt: Date } | null> {
  const record = await prisma.rawContent.findUnique({
    where: {
      operatorId_sourceType_sourceId: {
        operatorId,
        sourceType,
        sourceId,
      },
    },
    select: { rawBody: true, rawMetadata: true, occurredAt: true },
  });

  if (!record) return null;

  return {
    rawBody: record.rawBody,
    rawMetadata: record.rawMetadata as Record<string, unknown>,
    occurredAt: record.occurredAt,
  };
}

// ── Email convenience ─────────────────────────────────────────────────────────

export async function readRawEmail(
  operatorId: string,
  sourceId: string,
): Promise<string | null> {
  const record = await readRawContent(operatorId, "email", sourceId);
  if (!record) return null;

  const meta = record.rawMetadata;
  const headers = [
    meta.from ? `From: ${meta.from}` : null,
    meta.to ? `To: ${meta.to}` : null,
    meta.subject ? `Subject: ${meta.subject}` : null,
    meta.date ? `Date: ${meta.date}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const body = record.rawBody ?? "(no body)";
  return headers ? `${headers}\n\n${body}` : body;
}

// ── Search / List ─────────────────────────────────────────────────────────────

export async function searchRawContent(
  operatorId: string,
  query: string,
  options?: {
    sourceType?: string;
    accountId?: string;
    since?: Date;
    limit?: number;
  },
): Promise<RawContentRecord[]> {
  const limit = options?.limit ?? 20;

  // Use PostgreSQL full-text search via GIN tsvector index
  const results = await prisma.$queryRaw<Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    rawBody: string;
    rawMetadata: string;
    occurredAt: Date;
  }>>`
    SELECT id, "sourceType", "sourceId", "rawBody", COALESCE("rawMetadata", '{}')::text AS "rawMetadata", "occurredAt"
    FROM "RawContent"
    WHERE "operatorId" = ${operatorId}
      AND "rawBody" IS NOT NULL
      AND to_tsvector('english', COALESCE("rawBody", '')) @@ plainto_tsquery('english', ${query})
      ${options?.sourceType ? Prisma.sql`AND "sourceType" = ${options.sourceType}` : Prisma.empty}
      ${options?.accountId ? Prisma.sql`AND "accountId" = ${options.accountId}` : Prisma.empty}
      ${options?.since ? Prisma.sql`AND "occurredAt" >= ${options.since}` : Prisma.empty}
    ORDER BY "occurredAt" DESC
    LIMIT ${limit}
  `;

  return results.map((r) => ({
    ...r,
    rawBody: r.rawBody || "",
    rawMetadata: JSON.parse(r.rawMetadata) as Record<string, unknown>,
  }));
}

export async function listRawContent(
  operatorId: string,
  options?: {
    sourceType?: string;
    accountId?: string;
    since?: Date;
    until?: Date;
    limit?: number;
    offset?: number;
  },
): Promise<RawContentListItem[]> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const occurredAt: Record<string, Date> = {};
  if (options?.since) occurredAt.gte = options.since;
  if (options?.until) occurredAt.lte = options.until;

  const results = await prisma.rawContent.findMany({
    where: {
      operatorId,
      ...(options?.sourceType ? { sourceType: options.sourceType } : {}),
      ...(options?.accountId ? { accountId: options.accountId } : {}),
      ...(Object.keys(occurredAt).length > 0 ? { occurredAt } : {}),
    },
    select: {
      id: true,
      sourceType: true,
      sourceId: true,
      rawMetadata: true,
      occurredAt: true,
      sizeBytes: true,
    },
    orderBy: { occurredAt: "desc" },
    take: limit,
    skip: offset,
  });

  return results.map((r) => ({
    ...r,
    rawMetadata: r.rawMetadata as Record<string, unknown>,
  }));
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getStorageStats(operatorId: string): Promise<StorageStats> {
  const groups = await prisma.rawContent.groupBy({
    by: ["sourceType"],
    where: { operatorId },
    _count: { id: true },
    _sum: { sizeBytes: true },
  });

  let totalItems = 0;
  let totalSizeBytes = 0;
  const bySourceType: Record<string, { count: number; sizeBytes: number }> = {};

  for (const g of groups) {
    const count = g._count.id;
    const sizeBytes = g._sum.sizeBytes ?? 0;
    totalItems += count;
    totalSizeBytes += sizeBytes;
    bySourceType[g.sourceType] = { count, sizeBytes };
  }

  return { totalItems, totalSizeBytes, bySourceType };
}

// ── Bulk read (async generator) ───────────────────────────────────────────────

export async function* bulkReadRawContent(
  operatorId: string,
  sourceType: string,
  options?: { batchSize?: number; since?: Date; until?: Date; accountId?: string },
): AsyncGenerator<
  Array<{
    id: string;
    sourceId: string;
    rawBody: string;
    rawMetadata: Record<string, unknown>;
    occurredAt: Date;
  }>
> {
  const batchSize = options?.batchSize ?? 50;
  let cursor: string | undefined;

  while (true) {
    const occurredAt: Record<string, Date> = {};
    if (options?.since) occurredAt.gte = options.since;
    if (options?.until) occurredAt.lte = options.until;

    const batch = await prisma.rawContent.findMany({
      where: {
        operatorId,
        sourceType,
        rawBody: { not: null },
        ...(Object.keys(occurredAt).length > 0 ? { occurredAt } : {}),
        ...(options?.accountId ? { accountId: options.accountId } : {}),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true, sourceId: true, rawBody: true, rawMetadata: true, occurredAt: true },
      orderBy: { id: "asc" },
      take: batchSize,
    });

    if (batch.length === 0) break;

    yield batch.map((r) => ({
      ...r,
      rawBody: r.rawBody || "",
      rawMetadata: r.rawMetadata as Record<string, unknown>,
    }));

    cursor = batch[batch.length - 1].id;
    if (batch.length < batchSize) break;
  }
}
