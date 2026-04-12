import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const classification = searchParams.get("classification"); // action_required | awareness | irrelevant | null (all)
  const actorEntityId = searchParams.get("actorEntityId");
  const cursor = searchParams.get("cursor"); // evaluationLog ID for pagination
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);

  const where: Record<string, unknown> = { operatorId: su.operatorId };
  if (classification) where.classification = classification;
  if (actorEntityId) where.actorEntityId = actorEntityId;
  if (cursor) where.id = { lt: cursor }; // cuid() is roughly time-ordered, so lt = older

  const logs = await prisma.evaluationLog.findMany({
    where,
    orderBy: { evaluatedAt: "desc" },
    take: limit + 1, // fetch one extra to determine if there's a next page
  });

  const hasMore = logs.length > limit;
  const items = hasMore ? logs.slice(0, limit) : logs;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  // Enrich with display names — try wiki pages first, fall back to entities
  const actorIds = [...new Set(items.filter((l) => l.actorEntityId).map((l) => l.actorEntityId!))];
  const actorMap = new Map<string, string>();
  if (actorIds.length > 0) {
    // Try wiki pages (by subjectEntityId)
    const pages = await prisma.knowledgePage.findMany({
      where: { operatorId: su.operatorId, scope: "operator", subjectEntityId: { in: actorIds } },
      select: { subjectEntityId: true, title: true },
    });
    for (const p of pages) {
      if (p.subjectEntityId) actorMap.set(p.subjectEntityId, p.title);
    }
    // Fall back to entity for any unresolved
    const unresolved = actorIds.filter(id => !actorMap.has(id));
    if (unresolved.length > 0) {
      const entities = await prisma.entity.findMany({
        where: { id: { in: unresolved } },
        select: { id: true, displayName: true },
      });
      for (const e of entities) actorMap.set(e.id, e.displayName);
    }
  }

  // Aggregate stats for the header
  const stats = await prisma.evaluationLog.groupBy({
    by: ["classification"],
    where: { operatorId: su.operatorId },
    _count: true,
  });
  const statMap: Record<string, number> = {};
  for (const s of stats) statMap[s.classification] = s._count;

  return NextResponse.json({
    items: items.map((l) => ({
      id: l.id,
      actorEntityId: l.actorEntityId,
      actorName: l.actorEntityId ? actorMap.get(l.actorEntityId) ?? null : null,
      sourceType: l.sourceType,
      sourceId: l.sourceId,
      classification: l.classification,
      summary: l.summary,
      reasoning: l.reasoning,
      urgency: l.urgency,
      confidence: l.confidence,
      situationId: l.situationId,
      metadata: l.metadata,
      evaluatedAt: l.evaluatedAt.toISOString(),
    })),
    nextCursor,
    stats: {
      total: (statMap.action_required ?? 0) + (statMap.awareness ?? 0) + (statMap.irrelevant ?? 0),
      action_required: statMap.action_required ?? 0,
      awareness: statMap.awareness ?? 0,
      irrelevant: statMap.irrelevant ?? 0,
    },
  });
}
