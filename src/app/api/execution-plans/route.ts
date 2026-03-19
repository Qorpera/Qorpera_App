import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;

  const visibleDepts = await getVisibleDepartmentIds(operatorId, user.id);

  const params = req.nextUrl.searchParams;
  const statusParam = params.get("status");
  const sort = params.get("sort");
  const limit = Math.min(Math.max(parseInt(params.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(params.get("offset") ?? "0", 10) || 0, 0);

  const where: Record<string, unknown> = { operatorId };

  if (statusParam) {
    const statuses = statusParam.split(",").map((s) => s.trim());
    where.status = { in: statuses };
  }

  // Scope filtering for members
  if (visibleDepts !== "all") {
    where.OR = [
      // Situation-sourced: scope department visible or unscoped
      {
        sourceType: "situation",
        situation: {
          OR: [
            { situationType: { scopeEntityId: { in: visibleDepts } } },
            { situationType: { scopeEntityId: null } },
          ],
        },
      },
      // Initiative-sourced: goal department visible (HQ-level excluded for members)
      {
        sourceType: "initiative",
        initiative: {
          goal: { departmentId: { in: visibleDepts } },
        },
      },
      // Recurring/delegation: include for all authenticated users
      { sourceType: { in: ["recurring", "delegation"] } },
    ];
  }

  const orderBy =
    sort === "priority"
      ? [{ priorityScore: "desc" as const }, { createdAt: "desc" as const }]
      : [{ createdAt: "desc" as const }];

  const [plans, total] = await Promise.all([
    prisma.executionPlan.findMany({
      where,
      select: {
        id: true,
        sourceType: true,
        sourceId: true,
        status: true,
        currentStepOrder: true,
        priorityScore: true,
        createdAt: true,
        completedAt: true,
        priorityOverride: {
          select: { overrideType: true, snoozeUntil: true },
        },
        steps: {
          select: { id: true, title: true, status: true, sequenceOrder: true },
          orderBy: { sequenceOrder: "asc" },
        },
      },
      orderBy,
      skip: offset,
      take: limit,
    }),
    prisma.executionPlan.count({ where }),
  ]);

  // Resolve source titles
  const situationIds = plans.filter((p) => p.sourceType === "situation").map((p) => p.sourceId);
  const initiativeIds = plans.filter((p) => p.sourceType === "initiative").map((p) => p.sourceId);

  const [situations, initiatives] = await Promise.all([
    situationIds.length > 0
      ? prisma.situation.findMany({
          where: { id: { in: situationIds }, operatorId },
          select: {
            id: true,
            situationType: { select: { name: true } },
          },
        })
      : [],
    initiativeIds.length > 0
      ? prisma.initiative.findMany({
          where: { id: { in: initiativeIds }, operatorId },
          select: { id: true, rationale: true },
        })
      : [],
  ]);

  const situationMap = new Map(situations.map((s) => [s.id, s.situationType.name]));
  const initiativeMap = new Map(initiatives.map((i) => [i.id, i.rationale]));

  const items = plans.map((p) => {
    const currentStep = p.steps.find((s) => s.sequenceOrder === p.currentStepOrder);
    return {
      id: p.id,
      sourceType: p.sourceType,
      sourceId: p.sourceId,
      sourceTitle:
        p.sourceType === "situation"
          ? situationMap.get(p.sourceId) ?? null
          : p.sourceType === "initiative"
            ? initiativeMap.get(p.sourceId) ?? null
            : null,
      status: p.status,
      currentStepOrder: p.currentStepOrder,
      currentStepTitle: currentStep?.title ?? null,
      currentStepStatus: currentStep?.status ?? null,
      totalSteps: p.steps.length,
      priorityScore: p.priorityScore,
      override: p.priorityOverride
        ? {
            type: p.priorityOverride.overrideType,
            snoozeUntil: p.priorityOverride.snoozeUntil?.toISOString() ?? null,
          }
        : null,
      createdAt: p.createdAt.toISOString(),
      completedAt: p.completedAt?.toISOString() ?? null,
    };
  });

  return NextResponse.json({ items, total, limit, offset });
}
