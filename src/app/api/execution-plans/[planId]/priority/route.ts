import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";
import {
  computeSinglePlanPriority,
  computePlanPriorityWithBreakdown,
} from "@/lib/prioritization-engine";

async function checkPlanVisibility(
  planId: string,
  operatorId: string,
  userId: string,
): Promise<{ id: string; sourceType: string; sourceId: string; priorityScore: number | null; priorityOverride: { overrideType: string; snoozeUntil: Date | null } | null } | null> {
  const plan = await prisma.executionPlan.findFirst({
    where: { id: planId, operatorId },
    select: {
      id: true,
      sourceType: true,
      sourceId: true,
      priorityScore: true,
      priorityOverride: {
        select: { overrideType: true, snoozeUntil: true },
      },
    },
  });

  if (!plan) return null;

  const visibleDepts = await getVisibleDepartmentIds(operatorId, userId);
  if (visibleDepts === "all") return plan;

  // Member visibility check based on source department
  if (plan.sourceType === "situation") {
    const situation = await prisma.situation.findUnique({
      where: { id: plan.sourceId },
      select: { situationType: { select: { scopeEntityId: true } } },
    });
    // Unscoped situation types are visible to all
    if (situation && situation.situationType.scopeEntityId !== null) {
      if (!visibleDepts.includes(situation.situationType.scopeEntityId)) return null;
    }
  } else if (plan.sourceType === "initiative") {
    const initiative = await prisma.initiative.findUnique({
      where: { id: plan.sourceId },
      select: { goal: { select: { departmentId: true } } },
    });
    // HQ-level goals (null department) not visible to members
    if (!initiative?.goal?.departmentId) return null;
    if (!visibleDepts.includes(initiative.goal.departmentId)) return null;
  }

  return plan;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { planId } = await params;

  const plan = await checkPlanVisibility(planId, operatorId, user.id);
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await computePlanPriorityWithBreakdown(planId);

  return NextResponse.json({
    priorityScore: result.score,
    override: plan.priorityOverride
      ? {
          type: plan.priorityOverride.overrideType,
          snoozeUntil: plan.priorityOverride.snoozeUntil?.toISOString() ?? null,
        }
      : null,
    breakdown: result.breakdown,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { planId } = await params;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const plan = await prisma.executionPlan.findFirst({
    where: { id: planId, operatorId },
    select: { id: true },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { action, snoozeUntil } = body as {
    action: "pin" | "snooze" | "clear";
    snoozeUntil?: string;
  };

  if (!["pin", "snooze", "clear"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  let priorityScore: number;
  let override: { type: string; snoozeUntil?: string | null } | null = null;

  if (action === "pin") {
    await prisma.priorityOverride.upsert({
      where: { executionPlanId: planId },
      create: {
        operatorId,
        executionPlanId: planId,
        overrideType: "pin",
        createdById: user.id,
      },
      update: {
        overrideType: "pin",
        snoozeUntil: null,
        createdById: user.id,
      },
    });
    priorityScore = 100;
    await prisma.executionPlan.update({
      where: { id: planId },
      data: { priorityScore: 100 },
    });
    override = { type: "pin" };
  } else if (action === "snooze") {
    if (!snoozeUntil) {
      return NextResponse.json(
        { error: "snoozeUntil is required for snooze action" },
        { status: 400 },
      );
    }
    const snoozeDate = new Date(snoozeUntil);
    if (isNaN(snoozeDate.getTime()) || snoozeDate <= new Date()) {
      return NextResponse.json(
        { error: "snoozeUntil must be a valid future date" },
        { status: 400 },
      );
    }
    await prisma.priorityOverride.upsert({
      where: { executionPlanId: planId },
      create: {
        operatorId,
        executionPlanId: planId,
        overrideType: "snooze",
        snoozeUntil: snoozeDate,
        createdById: user.id,
      },
      update: {
        overrideType: "snooze",
        snoozeUntil: snoozeDate,
        createdById: user.id,
      },
    });
    priorityScore = 0;
    await prisma.executionPlan.update({
      where: { id: planId },
      data: { priorityScore: 0 },
    });
    override = { type: "snooze", snoozeUntil: snoozeDate.toISOString() };
  } else {
    // clear
    await prisma.priorityOverride
      .delete({ where: { executionPlanId: planId } })
      .catch(() => {});
    priorityScore = await computeSinglePlanPriority(planId);
    override = null;
  }

  return NextResponse.json({ priorityScore, override });
}
