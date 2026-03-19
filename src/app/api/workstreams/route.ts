import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";
import { createWorkStream } from "@/lib/workstreams";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;

  const url = new URL(req.url);
  const goalId = url.searchParams.get("goalId") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const ownerAiEntityId = url.searchParams.get("ownerAiEntityId") ?? undefined;

  const where: Record<string, unknown> = { operatorId };
  if (goalId) where.goalId = goalId;
  if (status) where.status = status;
  if (ownerAiEntityId) where.ownerAiEntityId = ownerAiEntityId;

  // Members: only WorkStreams containing their assigned situations or linked to their department goals
  const visibleDepts = await getVisibleDepartmentIds(operatorId, user.id);
  if (visibleDepts !== "all") {
    // Get situations assigned to this user
    const assignedSituations = await prisma.situation.findMany({
      where: { operatorId, assignedUserId: user.id },
      select: { id: true },
    });
    const assignedSitIds = assignedSituations.map(s => s.id);

    // Get workstream IDs containing assigned situations
    const memberWsItems = await prisma.workStreamItem.findMany({
      where: {
        itemType: "situation",
        itemId: { in: assignedSitIds },
      },
      select: { workStreamId: true },
    });
    const memberWsIds = memberWsItems.map(i => i.workStreamId);

    // Get goals visible to this member
    const visibleGoals = await prisma.goal.findMany({
      where: {
        operatorId,
        OR: [
          { departmentId: { in: visibleDepts } },
          { departmentId: null },
        ],
      },
      select: { id: true },
    });
    const visibleGoalIds = visibleGoals.map(g => g.id);

    where.OR = [
      { id: { in: memberWsIds } },
      { goalId: { in: visibleGoalIds } },
    ];
  }

  const workStreams = await prisma.workStream.findMany({
    where,
    include: {
      items: true,
      _count: { select: { children: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Compute completion percentage for each
  const result = await Promise.all(
    workStreams.map(async (ws) => {
      const totalItems = ws.items.length;
      let terminalCount = 0;

      for (const item of ws.items) {
        if (item.itemType === "situation") {
          const s = await prisma.situation.findUnique({
            where: { id: item.itemId },
            select: { status: true },
          });
          if (s && ["resolved", "dismissed"].includes(s.status)) terminalCount++;
        } else if (item.itemType === "initiative") {
          const i = await prisma.initiative.findUnique({
            where: { id: item.itemId },
            select: { status: true },
          });
          if (i && ["completed", "rejected"].includes(i.status)) terminalCount++;
        }
      }

      return {
        id: ws.id,
        title: ws.title,
        description: ws.description,
        goalId: ws.goalId,
        ownerAiEntityId: ws.ownerAiEntityId,
        status: ws.status,
        parentWorkStreamId: ws.parentWorkStreamId,
        completedAt: ws.completedAt?.toISOString() ?? null,
        createdAt: ws.createdAt.toISOString(),
        itemCount: totalItems,
        childCount: ws._count.children,
        completionPercentage: totalItems > 0 ? Math.round((terminalCount / totalItems) * 100) : 0,
      };
    }),
  );

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json();
  const { title, description, goalId, ownerAiEntityId, parentWorkStreamId } = body;

  if (!title || !description || !ownerAiEntityId) {
    return NextResponse.json({ error: "title, description, and ownerAiEntityId are required" }, { status: 400 });
  }

  // Validate ownerAiEntityId belongs to operator
  const aiEntity = await prisma.entity.findFirst({
    where: { id: ownerAiEntityId, operatorId, status: "active" },
    select: { id: true },
  });
  if (!aiEntity) {
    return NextResponse.json({ error: "Invalid ownerAiEntityId" }, { status: 400 });
  }

  try {
    const ws = await createWorkStream({
      operatorId,
      title,
      description,
      goalId,
      ownerAiEntityId,
      parentWorkStreamId,
    });
    return NextResponse.json(ws, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create WorkStream";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
