import { prisma } from "@/lib/db";

// ─── Types matching EvidenceExtraction JSON columns ─────

export interface EvidenceClaim {
  claim: string;
  type: "fact" | "commitment" | "decision" | "opinion" | "question";
  confidence: number; // 0.0 - 1.0
  entities: string[]; // entity names referenced
  date: string | null; // ISO date string or null
  numbers: Array<{ value: number; unit: string; context: string }>;
}

export interface EvidenceRelationship {
  from: string;
  to: string;
  type: string; // "reports-to", "client-of", "works-with", "quoted-price", etc.
  evidence: string; // the specific text establishing this
}

export interface EvidenceContradiction {
  claim: string;
  counterclaim: string;
  claimSourceId: string; // ContentChunk ID
  counterSourceId: string; // ContentChunk ID
}

// ─── Service functions ──────────────────────────────────

export async function createExtraction(params: {
  operatorId: string;
  sourceChunkId: string;
  sourceType: string;
  extractions: EvidenceClaim[];
  relationships: EvidenceRelationship[];
  contradictions: EvidenceContradiction[];
  extractedBy: string;
}) {
  return prisma.evidenceExtraction.create({
    data: {
      operatorId: params.operatorId,
      sourceChunkId: params.sourceChunkId,
      sourceType: params.sourceType,
      extractions: params.extractions as any,
      relationships: params.relationships as any,
      contradictions: params.contradictions as any,
      extractedBy: params.extractedBy,
    },
    select: {
      id: true,
      sourceChunkId: true,
      sourceType: true,
      extractedAt: true,
    },
  });
}

export async function getExtractionsForChunk(operatorId: string, sourceChunkId: string) {
  return prisma.evidenceExtraction.findMany({
    where: { operatorId, sourceChunkId },
    orderBy: { extractedAt: "desc" },
  });
}

export async function getExtractionsForOperator(
  operatorId: string,
  options?: {
    sourceType?: string;
    since?: Date;
    skip?: number;
    take?: number;
  }
) {
  const where: any = { operatorId };
  if (options?.sourceType) where.sourceType = options.sourceType;
  if (options?.since) where.extractedAt = { gte: options.since };

  return prisma.evidenceExtraction.findMany({
    where,
    orderBy: { extractedAt: "desc" },
    skip: options?.skip ?? 0,
    take: options?.take ?? 100,
  });
}

export async function findContradictions(operatorId: string) {
  return prisma.$queryRaw<
    Array<{
      id: string;
      operatorId: string;
      sourceChunkId: string;
      sourceType: string;
      extractions: any;
      relationships: any;
      contradictions: any;
      extractedBy: string;
      extractedAt: Date;
      createdAt: Date;
    }>
  >`
    SELECT * FROM "EvidenceExtraction"
    WHERE "operatorId" = ${operatorId}
      AND jsonb_array_length("contradictions"::jsonb) > 0
    ORDER BY "extractedAt" DESC
  `;
}

export async function getExtractionStats(operatorId: string) {
  const [countResult, byTypeResult, claimsResult, contradictionsResult] =
    await Promise.all([
      prisma.evidenceExtraction.count({ where: { operatorId } }),

      prisma.evidenceExtraction.groupBy({
        by: ["sourceType"],
        where: { operatorId },
        _count: true,
      }),

      prisma.$queryRaw<[{ total: bigint }]>`
        SELECT COALESCE(SUM(jsonb_array_length("extractions"::jsonb)), 0) as total
        FROM "EvidenceExtraction"
        WHERE "operatorId" = ${operatorId}
      `,

      prisma.$queryRaw<[{ total: bigint }]>`
        SELECT COALESCE(SUM(jsonb_array_length("contradictions"::jsonb)), 0) as total
        FROM "EvidenceExtraction"
        WHERE "operatorId" = ${operatorId}
      `,
    ]);

  const bySourceType: Record<string, number> = {};
  for (const row of byTypeResult) {
    bySourceType[row.sourceType] = row._count;
  }

  return {
    totalExtractions: countResult,
    bySourceType,
    totalClaims: Number(claimsResult[0].total),
    totalContradictions: Number(contradictionsResult[0].total),
  };
}
