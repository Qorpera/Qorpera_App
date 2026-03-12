import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { operatorId } = su;

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
  const mergeType = url.searchParams.get("mergeType") || undefined;

  const where = {
    operatorId,
    ...(mergeType ? { mergeType } : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.entityMergeLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.entityMergeLog.count({ where }),
  ]);

  // Enrich with entity display names
  const entityIds = new Set<string>();
  for (const e of entries) {
    entityIds.add(e.survivorId);
    entityIds.add(e.absorbedId);
  }

  const entities = await prisma.entity.findMany({
    where: { id: { in: Array.from(entityIds) } },
    select: { id: true, displayName: true, status: true },
  });
  const entityMap = new Map(entities.map((e) => [e.id, e]));

  const enriched = entries.map((e) => ({
    id: e.id,
    mergeType: e.mergeType,
    confidence: e.confidence,
    signals: e.signals ? JSON.parse(e.signals) : null,
    reversible: e.reversible,
    reversedAt: e.reversedAt,
    createdAt: e.createdAt,
    survivor: entityMap.get(e.survivorId) ?? { id: e.survivorId, displayName: "Unknown", status: "unknown" },
    absorbed: entityMap.get(e.absorbedId) ?? { id: e.absorbedId, displayName: "Unknown", status: "unknown" },
  }));

  return NextResponse.json({ entries: enriched, total, page, limit });
}
