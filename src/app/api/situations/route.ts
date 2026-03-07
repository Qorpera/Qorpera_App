import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const operatorId = await getOperatorId();
  const params = req.nextUrl.searchParams;

  const statusParam = params.get("status");
  const typeId = params.get("typeId");
  const severityMin = params.get("severity_min");
  const severityMax = params.get("severity_max");
  const limit = Math.min(parseInt(params.get("limit") ?? "50"), 200);
  const offset = parseInt(params.get("offset") ?? "0");

  // Build where clause
  const where: Record<string, unknown> = { operatorId };

  if (statusParam) {
    const statuses = statusParam.split(",").map((s) => s.trim());
    where.status = { in: statuses };
  } else {
    // Default: exclude closed and resolved
    where.status = { notIn: ["closed", "resolved"] };
  }

  if (typeId) where.situationTypeId = typeId;
  if (severityMin || severityMax) {
    const severity: Record<string, number> = {};
    if (severityMin) severity.gte = parseFloat(severityMin);
    if (severityMax) severity.lte = parseFloat(severityMax);
    where.severity = severity;
  }

  const [situations, total] = await Promise.all([
    prisma.situation.findMany({
      where,
      include: {
        situationType: { select: { name: true, slug: true, autonomyLevel: true } },
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      skip: offset,
      take: limit,
    }),
    prisma.situation.count({ where }),
  ]);

  // Resolve trigger entity display names
  const entityIds = situations.map((s) => s.triggerEntityId).filter(Boolean) as string[];
  const entities = entityIds.length > 0
    ? await prisma.entity.findMany({
        where: { id: { in: entityIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const entityMap = new Map(entities.map((e) => [e.id, e.displayName]));

  const items = situations.map((s) => {
    let reasoning = null;
    let proposedAction = null;
    try { reasoning = s.reasoning ? JSON.parse(s.reasoning) : null; } catch {}
    try { proposedAction = s.proposedAction ? JSON.parse(s.proposedAction) : null; } catch {}

    return {
      id: s.id,
      situationType: s.situationType,
      severity: s.severity,
      confidence: s.confidence,
      status: s.status,
      source: s.source,
      triggerEntityId: s.triggerEntityId,
      triggerEntityName: s.triggerEntityId ? entityMap.get(s.triggerEntityId) ?? null : null,
      reasoning,
      proposedAction,
      editInstruction: s.editInstruction,
      createdAt: s.createdAt.toISOString(),
      resolvedAt: s.resolvedAt?.toISOString() ?? null,
    };
  });

  return NextResponse.json({ items, total, limit, offset });
}
