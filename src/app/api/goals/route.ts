import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const departmentId = url.searchParams.get("departmentId") ?? undefined;

  const visibleDepts = await getVisibleDepartmentIds(operatorId, su.user.id);

  const where: Record<string, unknown> = { operatorId };
  if (status) where.status = status;
  if (departmentId) where.departmentId = departmentId;

  // Members: only goals for their visible departments + HQ-level goals
  if (visibleDepts !== "all") {
    where.OR = [
      { departmentId: { in: visibleDepts } },
      { departmentId: null },
    ];
  }

  const goals = await prisma.goal.findMany({
    where,
    include: {
      _count: { select: { initiatives: true } },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(goals);
}

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json();
  const { title, description, measurableTarget, departmentId, priority, deadline } = body;

  if (!title || !description) {
    return NextResponse.json({ error: "title and description are required" }, { status: 400 });
  }

  // Validate departmentId if provided
  if (departmentId) {
    const dept = await prisma.entity.findFirst({
      where: { id: departmentId, operatorId, category: "foundational" },
      select: { id: true },
    });
    if (!dept) {
      return NextResponse.json({ error: "Invalid departmentId" }, { status: 400 });
    }
  }

  const goal = await prisma.goal.create({
    data: {
      operatorId,
      title,
      description,
      measurableTarget: measurableTarget ?? null,
      departmentId: departmentId ?? null,
      priority: priority ?? 3,
      deadline: deadline ? new Date(deadline) : null,
    },
  });

  return NextResponse.json(goal, { status: 201 });
}
