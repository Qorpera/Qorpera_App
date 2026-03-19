import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CronExpressionParser } from "cron-parser";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await params;

  const task = await prisma.recurringTask.findFirst({
    where: { id, operatorId: su.operatorId },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Load recent execution history
  const recentPlans = await prisma.executionPlan.findMany({
    where: { sourceType: "recurring", sourceId: task.id, operatorId: su.operatorId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      status: true,
      createdAt: true,
      completedAt: true,
      steps: {
        select: { id: true, title: true, status: true, executionMode: true },
        orderBy: { sequenceOrder: "asc" },
      },
    },
  });

  return NextResponse.json({ ...task, recentPlans });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await params;

  const task = await prisma.recurringTask.findFirst({
    where: { id, operatorId: su.operatorId },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) {
    updates.description = body.description;
    const config = JSON.parse(task.executionPlanTemplate);
    config.description = body.description;
    updates.executionPlanTemplate = JSON.stringify(config);
  }
  if (body.autoApproveSteps !== undefined) updates.autoApproveSteps = body.autoApproveSteps;

  if (body.contextHints !== undefined) {
    const config = JSON.parse(updates.executionPlanTemplate as string ?? task.executionPlanTemplate);
    config.contextHints = body.contextHints;
    updates.executionPlanTemplate = JSON.stringify(config);
  }

  if (body.cronExpression !== undefined) {
    try {
      CronExpressionParser.parse(body.cronExpression);
    } catch {
      return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
    }
    updates.cronExpression = body.cronExpression;
    const effectiveStatus = body.status ?? task.status;
    if (effectiveStatus === "active") {
      const interval = CronExpressionParser.parse(body.cronExpression, { currentDate: new Date() });
      updates.nextTriggerAt = interval.next().toDate();
    }
  }

  if (body.status !== undefined) {
    if (body.status === "paused") {
      updates.status = "paused";
      updates.nextTriggerAt = null;
    } else if (body.status === "active") {
      updates.status = "active";
      const expr = (updates.cronExpression as string) ?? task.cronExpression;
      const interval = CronExpressionParser.parse(expr, { currentDate: new Date() });
      updates.nextTriggerAt = interval.next().toDate();
    }
  }

  const updated = await prisma.recurringTask.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await params;

  const task = await prisma.recurringTask.findFirst({
    where: { id, operatorId: su.operatorId },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.recurringTask.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
