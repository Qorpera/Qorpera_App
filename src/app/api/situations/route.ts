import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds, situationScopeFilter } from "@/lib/user-scope";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const visibleDepts = await getVisibleDepartmentIds(operatorId, su.effectiveUserId);
  const params = req.nextUrl.searchParams;

  const statusParam = params.get("status");
  const typeId = params.get("typeId");
  const severityMin = params.get("severity_min");
  const severityMax = params.get("severity_max");
  const sort = params.get("sort");
  const limit = Math.min(Math.max(parseInt(params.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(params.get("offset") ?? "0", 10) || 0, 0);

  // Build where clause
  const where: Record<string, unknown> = { operatorId, ...situationScopeFilter(visibleDepts) };

  // Members only see their own assigned situations
  if (su.effectiveRole === "member") {
    where.assignedUserId = su.effectiveUserId;
  }

  if (statusParam) {
    const statuses = statusParam.split(",").map((s) => s.trim()).filter(s => s !== "detected" && s !== "reasoning");
    where.status = { in: statuses };
  } else {
    // Default: exclude closed and resolved
    where.status = { notIn: ["closed", "resolved"] };
  }

  if (typeId) where.situationTypeId = typeId;
  if (severityMin || severityMax) {
    const severity: Record<string, number> = {};
    if (severityMin) { const v = parseFloat(severityMin); if (isFinite(v)) severity.gte = v; }
    if (severityMax) { const v = parseFloat(severityMax); if (isFinite(v)) severity.lte = v; }
    where.severity = severity;
  }

  const orderBy =
    sort === "priority"
      ? [{ executionPlan: { priorityScore: "desc" as const } }, { createdAt: "desc" as const }]
      : [{ severity: "desc" as const }, { createdAt: "desc" as const }];

  const [situations, total] = await Promise.all([
    prisma.situation.findMany({
      where,
      include: {
        situationType: { select: { name: true, slug: true, autonomyLevel: true, scopeEntityId: true } },
        ...(sort === "priority" ? { executionPlan: { select: { priorityScore: true } } } : {}),
      },
      orderBy,
      skip: offset,
      take: limit,
    }),
    prisma.situation.count({ where }),
  ]);

  // Resolve trigger entity + department display names
  const triggerIds = situations.map((s) => s.triggerEntityId).filter(Boolean) as string[];
  const scopeIds = situations.map((s) => s.situationType.scopeEntityId).filter(Boolean) as string[];
  const allIds = [...new Set([...triggerIds, ...scopeIds])];
  const entities = allIds.length > 0
    ? await prisma.entity.findMany({
        where: { id: { in: allIds }, operatorId },
        select: { id: true, displayName: true },
      })
    : [];
  const entityMap = new Map(entities.map((e) => [e.id, e.displayName]));

  const items = situations.map((s) => {
    let reasoning = null;
    let proposedAction = null;
    try { reasoning = s.reasoning ? JSON.parse(s.reasoning) : null; } catch {}
    try { proposedAction = s.proposedAction ? JSON.parse(s.proposedAction) : null; } catch {}

    const item: Record<string, unknown> = {
      id: s.id,
      situationType: s.situationType,
      severity: s.severity,
      confidence: s.confidence,
      status: s.status,
      source: s.source,
      triggerEntityId: s.triggerEntityId,
      triggerEntityName: s.triggerEntityId ? entityMap.get(s.triggerEntityId) ?? null : null,
      departmentName: s.situationType.scopeEntityId
        ? entityMap.get(s.situationType.scopeEntityId) ?? null
        : null,
      reasoning,
      proposedAction,
      triggerSummary: s.triggerSummary ?? null,
      editInstruction: s.editInstruction,
      createdAt: s.createdAt.toISOString(),
      resolvedAt: s.resolvedAt?.toISOString() ?? null,
    };
    if (sort === "priority" && "executionPlan" in s) {
      item.priorityScore = (s as { executionPlan?: { priorityScore: number | null } | null }).executionPlan?.priorityScore ?? null;
    }
    return item;
  });

  return NextResponse.json({ items, total, limit, offset });
}
