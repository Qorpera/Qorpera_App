import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createRecurringTask } from "@/lib/recurring-tasks";
import { CronExpressionParser } from "cron-parser";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status");

  const tasks = await prisma.recurringTask.findMany({
    where: {
      operatorId: su.operatorId,
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json();
  const { title, description, cronExpression, aiEntityId, autoApproveSteps, contextHints } = body;

  if (!title || !description || !cronExpression || !aiEntityId) {
    return NextResponse.json({ error: "title, description, cronExpression, and aiEntityId are required" }, { status: 400 });
  }

  // Validate cron expression
  try {
    CronExpressionParser.parse(cronExpression);
  } catch {
    return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
  }

  // Validate aiEntityId belongs to operator
  const aiEntity = await prisma.entity.findFirst({
    where: { id: aiEntityId, operatorId: su.operatorId, status: "active" },
  });
  if (!aiEntity) {
    return NextResponse.json({ error: "AI entity not found" }, { status: 400 });
  }

  // Validate departmentId if provided
  if (contextHints?.departmentId) {
    const dept = await prisma.entity.findFirst({
      where: { id: contextHints.departmentId, operatorId: su.operatorId, category: "foundational" },
    });
    if (!dept) {
      return NextResponse.json({ error: "Department not found" }, { status: 400 });
    }
  }

  try {
    const task = await createRecurringTask({
      operatorId: su.operatorId,
      aiEntityId,
      title,
      description,
      cronExpression,
      autoApproveSteps,
      contextHints,
    });
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
