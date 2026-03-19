import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  computeSinglePlanPriority,
  computePlanPriorityWithBreakdown,
} from "@/lib/prioritization-engine";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { planId } = await params;

  const plan = await prisma.executionPlan.findFirst({
    where: { id: planId, operatorId },
    select: {
      id: true,
      priorityScore: true,
      priorityOverride: {
        select: { overrideType: true, snoozeUntil: true },
      },
    },
  });

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
