import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";
import { canMemberAccessWorkStream } from "@/lib/workstreams";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = await params;

  // Member scope check
  const visibleDepts = await getVisibleDepartmentIds(operatorId, user.id);
  if (visibleDepts !== "all") {
    const canAccess = await canMemberAccessWorkStream(user.id, id, operatorId, visibleDepts);
    if (!canAccess) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const ws = await prisma.workStream.findFirst({
    where: { id, operatorId },
    include: {
      items: { orderBy: { addedAt: "asc" } },
      children: {
        select: { id: true, title: true, status: true, completedAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!ws) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Load item details
  const itemDetails = await Promise.all(
    ws.items.map(async (item) => {
      if (item.itemType === "situation") {
        const s = await prisma.situation.findUnique({
          where: { id: item.itemId },
          include: { situationType: { select: { name: true } } },
        });
        return {
          workStreamItemId: item.id,
          itemType: item.itemType,
          itemId: item.itemId,
          addedAt: item.addedAt.toISOString(),
          status: s?.status ?? "unknown",
          summary: s?.situationType.name ?? "Unknown situation",
        };
      } else {
        const i = await prisma.initiative.findUnique({
          where: { id: item.itemId },
          select: { id: true, status: true, rationale: true, goal: { select: { title: true } } },
        });
        return {
          workStreamItemId: item.id,
          itemType: item.itemType,
          itemId: item.itemId,
          addedAt: item.addedAt.toISOString(),
          status: i?.status ?? "unknown",
          summary: i ? `${i.goal.title}: ${i.rationale.slice(0, 120)}` : "Unknown initiative",
        };
      }
    }),
  );

  // Build parent chain
  const parentChain: Array<{ id: string; title: string }> = [];
  let currentParentId = ws.parentWorkStreamId;
  while (currentParentId) {
    const parent = await prisma.workStream.findUnique({
      where: { id: currentParentId },
      select: { id: true, title: true, parentWorkStreamId: true },
    });
    if (!parent) break;
    parentChain.unshift({ id: parent.id, title: parent.title });
    currentParentId = parent.parentWorkStreamId;
  }

  return NextResponse.json({
    id: ws.id,
    title: ws.title,
    description: ws.description,
    goalId: ws.goalId,
    ownerAiEntityId: ws.ownerAiEntityId,
    status: ws.status,
    parentWorkStreamId: ws.parentWorkStreamId,
    completedAt: ws.completedAt?.toISOString() ?? null,
    createdAt: ws.createdAt.toISOString(),
    updatedAt: ws.updatedAt.toISOString(),
    items: itemDetails,
    children: ws.children.map(c => ({
      id: c.id,
      title: c.title,
      status: c.status,
      completedAt: c.completedAt?.toISOString() ?? null,
    })),
    parentChain,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = await params;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const ws = await prisma.workStream.findFirst({
    where: { id, operatorId },
    select: { id: true },
  });
  if (!ws) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.goalId !== undefined) updates.goalId = body.goalId;
  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === "completed") {
      updates.completedAt = new Date();
    } else {
      updates.completedAt = null;
    }
  }

  const updated = await prisma.workStream.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json({
    id: updated.id,
    title: updated.title,
    description: updated.description,
    status: updated.status,
    goalId: updated.goalId,
    completedAt: updated.completedAt?.toISOString() ?? null,
  });
}
