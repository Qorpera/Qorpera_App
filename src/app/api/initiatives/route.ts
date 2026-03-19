import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const params = req.nextUrl.searchParams;

  const statusFilter = params.get("status") ?? undefined;
  const goalIdFilter = params.get("goalId") ?? undefined;
  const departmentIdFilter = params.get("departmentId") ?? undefined;

  const visibleDepts = await getVisibleDepartmentIds(operatorId, user.id);

  const where: Record<string, unknown> = { operatorId };

  if (statusFilter) where.status = statusFilter;
  if (goalIdFilter) where.goalId = goalIdFilter;

  // Department filtering
  if (departmentIdFilter) {
    where.goal = { departmentId: departmentIdFilter };
  }

  // Members: only initiatives for goals in their visible departments + HQ goals
  if (visibleDepts !== "all") {
    where.goal = {
      ...(typeof where.goal === "object" ? where.goal as Record<string, unknown> : {}),
      OR: [
        { departmentId: { in: visibleDepts } },
        { departmentId: null },
      ],
    };
  }

  const initiatives = await prisma.initiative.findMany({
    where,
    include: {
      goal: { select: { title: true, departmentId: true } },
      executionPlan: {
        select: {
          id: true,
          status: true,
          _count: { select: { steps: true } },
          steps: {
            where: { status: "completed" },
            select: { id: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Resolve AI entity display names
  const aiEntityIds = [...new Set(initiatives.map(i => i.aiEntityId))];
  const aiEntities = aiEntityIds.length > 0
    ? await prisma.entity.findMany({
        where: { id: { in: aiEntityIds }, operatorId },
        select: { id: true, displayName: true },
      })
    : [];
  const aiEntityMap = new Map(aiEntities.map(e => [e.id, e.displayName]));

  const items = initiatives.map(i => ({
    id: i.id,
    goalId: i.goalId,
    goalTitle: i.goal.title,
    goalDepartmentId: i.goal.departmentId,
    aiEntityId: i.aiEntityId,
    aiEntityName: aiEntityMap.get(i.aiEntityId) ?? null,
    status: i.status,
    rationale: i.rationale,
    impactAssessment: i.impactAssessment,
    executionPlanId: i.executionPlanId,
    planStatus: i.executionPlan?.status ?? null,
    totalSteps: i.executionPlan?._count.steps ?? 0,
    completedSteps: i.executionPlan?.steps.length ?? 0,
    createdAt: i.createdAt.toISOString(),
  }));

  return NextResponse.json({ items });
}
