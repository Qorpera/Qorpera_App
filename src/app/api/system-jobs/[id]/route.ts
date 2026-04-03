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
  const { user, operatorId } = su;
  const { id } = await params;

  const systemJob = await prisma.systemJob.findFirst({
    where: { id, operatorId },
  });

  if (!systemJob) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Department visibility check
  const visibleDepts = await getVisibleDepartmentIds(operatorId, user.id);
  if (visibleDepts !== "all" && systemJob.scopeEntityId) {
    if (!visibleDepts.includes(systemJob.scopeEntityId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const runs = await prisma.systemJobRun.findMany({
    where: { systemJobId: systemJob.id, operatorId },
    orderBy: { cycleNumber: "desc" },
    take: 20,
  });

  return NextResponse.json({ systemJob, runs });
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
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const systemJob = await prisma.systemJob.findFirst({
    where: { id, operatorId },
  });

  if (!systemJob) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const action = body.action as string;

  if (!["approve", "pause", "resume", "deactivate"].includes(action)) {
    return NextResponse.json(
      { error: "Invalid action. Must be: approve, pause, resume, or deactivate" },
      { status: 400 },
    );
  }

  let updateData: Record<string, unknown> = {};

  switch (action) {
    case "approve": {
      if (systemJob.status !== "proposed") {
        return NextResponse.json(
          { error: "Can only approve proposed System Jobs" },
          { status: 400 },
        );
      }
      const { CronExpressionParser } = await import("cron-parser");
      try {
        const interval = CronExpressionParser.parse(systemJob.cronExpression, { currentDate: new Date() });
        updateData = {
          status: "active",
          nextTriggerAt: interval.next().toDate(),
        };
      } catch {
        return NextResponse.json(
          { error: `Invalid cron expression: ${systemJob.cronExpression}` },
          { status: 400 },
        );
      }
      break;
    }

    case "pause": {
      if (systemJob.status !== "active") {
        return NextResponse.json(
          { error: "Can only pause active System Jobs" },
          { status: 400 },
        );
      }
      updateData = {
        status: "paused",
        nextTriggerAt: null,
      };
      break;
    }

    case "resume": {
      if (systemJob.status !== "paused") {
        return NextResponse.json(
          { error: "Can only resume paused System Jobs" },
          { status: 400 },
        );
      }
      const { CronExpressionParser } = await import("cron-parser");
      try {
        const interval = CronExpressionParser.parse(systemJob.cronExpression, { currentDate: new Date() });
        updateData = {
          status: "active",
          nextTriggerAt: interval.next().toDate(),
        };
      } catch {
        return NextResponse.json(
          { error: `Invalid cron expression: ${systemJob.cronExpression}` },
          { status: 400 },
        );
      }
      break;
    }

    case "deactivate": {
      updateData = {
        status: "deactivated",
        nextTriggerAt: null,
      };
      break;
    }
  }

  const updated = await prisma.systemJob.update({
    where: { id: systemJob.id },
    data: updateData,
  });

  return NextResponse.json({ systemJob: updated });
}
