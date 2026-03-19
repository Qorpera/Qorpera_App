import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id } = await params;

  const goal = await prisma.goal.findFirst({
    where: { id, operatorId },
    include: {
      initiatives: {
        select: {
          id: true,
          status: true,
          rationale: true,
          executionPlan: {
            select: { _count: { select: { steps: true } } },
          },
        },
      },
    },
  });

  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Scope check: members can only see goals for their visible departments + HQ-level
  if (goal.departmentId) {
    const visibleDepts = await getVisibleDepartmentIds(operatorId, su.user.id);
    if (visibleDepts !== "all" && !visibleDepts.includes(goal.departmentId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  return NextResponse.json(goal);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id } = await params;

  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const existing = await prisma.goal.findFirst({ where: { id, operatorId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.measurableTarget !== undefined) data.measurableTarget = body.measurableTarget;
  if (body.departmentId !== undefined) data.departmentId = body.departmentId;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.status !== undefined) data.status = body.status;
  if (body.deadline !== undefined) data.deadline = body.deadline ? new Date(body.deadline) : null;

  const updated = await prisma.goal.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id } = await params;

  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const existing = await prisma.goal.findFirst({ where: { id, operatorId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Block delete if active initiatives reference this goal
  const activeInitiatives = await prisma.initiative.count({
    where: {
      goalId: id,
      status: { in: ["approved", "executing"] },
    },
  });

  if (activeInitiatives > 0) {
    return NextResponse.json(
      { error: "Cannot delete goal with approved or executing initiatives" },
      { status: 409 },
    );
  }

  await prisma.goal.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
