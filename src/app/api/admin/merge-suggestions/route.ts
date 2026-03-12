import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { operatorId } = su;

  const suggestions = await prisma.entityMergeLog.findMany({
    where: {
      operatorId,
      mergeType: "ml_suggestion",
      reversedAt: null, // not dismissed
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Enrich with entity details for side-by-side comparison
  const entityIds = new Set<string>();
  for (const s of suggestions) {
    entityIds.add(s.survivorId);
    entityIds.add(s.absorbedId);
  }

  const entities = await prisma.entity.findMany({
    where: { id: { in: Array.from(entityIds) } },
    select: {
      id: true,
      displayName: true,
      status: true,
      category: true,
      sourceSystem: true,
      entityType: { select: { name: true, slug: true } },
      propertyValues: {
        include: { property: { select: { slug: true, name: true, identityRole: true } } },
      },
    },
  });
  const entityMap = new Map(entities.map((e) => [e.id, {
    id: e.id,
    displayName: e.displayName,
    status: e.status,
    category: e.category,
    sourceSystem: e.sourceSystem,
    entityType: e.entityType,
    properties: Object.fromEntries(
      e.propertyValues.map((pv) => [pv.property.slug, pv.value]),
    ),
    identityValues: Object.fromEntries(
      e.propertyValues
        .filter((pv) => pv.property.identityRole)
        .map((pv) => [pv.property.identityRole!, pv.value]),
    ),
  }]));

  const enriched = suggestions.map((s) => ({
    id: s.id,
    confidence: s.confidence,
    signals: s.signals ? JSON.parse(s.signals) : null,
    createdAt: s.createdAt,
    entityA: entityMap.get(s.survivorId) ?? { id: s.survivorId, displayName: "Unknown" },
    entityB: entityMap.get(s.absorbedId) ?? { id: s.absorbedId, displayName: "Unknown" },
  }));

  return NextResponse.json({ suggestions: enriched });
}
