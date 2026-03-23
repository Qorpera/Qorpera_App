import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { advanceStep } from "@/lib/execution-engine";
import { getVisibleDepartmentIds } from "@/lib/user-scope";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { recheckWorkStreamStatus } from "@/lib/workstreams";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = await params;

  const initiative = await prisma.initiative.findFirst({
    where: { id, operatorId },
    include: {
      goal: { select: { id: true, title: true, description: true, departmentId: true } },
      executionPlan: {
        include: {
          steps: { orderBy: { sequenceOrder: "asc" } },
        },
      },
    },
  });

  if (!initiative) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Department visibility check
  const visibleDepts = await getVisibleDepartmentIds(operatorId, user.id);
  if (visibleDepts !== "all" && initiative.goal.departmentId) {
    if (!visibleDepts.includes(initiative.goal.departmentId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  // Resolve AI entity display name
  const aiEntity = await prisma.entity.findFirst({
    where: { id: initiative.aiEntityId, operatorId },
    select: { displayName: true },
  });

  // Batch-load action capabilities for preview component mapping
  const rawSteps = initiative.executionPlan?.steps ?? [];
  const capIds = [...new Set(rawSteps.map(s => s.actionCapabilityId).filter(Boolean))] as string[];
  const capabilities = capIds.length > 0
    ? await prisma.actionCapability.findMany({
        where: { id: { in: capIds } },
        select: { id: true, slug: true, name: true },
      })
    : [];
  const capMap = new Map(capabilities.map(c => [c.id, c]));

  // Parse step outputs for completed steps
  const steps = rawSteps.map(s => ({
    id: s.id,
    sequenceOrder: s.sequenceOrder,
    title: s.title,
    description: s.description,
    executionMode: s.executionMode,
    status: s.status,
    assignedUserId: s.assignedUserId,
    parameters: s.parameters ? (() => { try { return JSON.parse(s.parameters); } catch { return null; } })() : null,
    actionCapability: s.actionCapabilityId ? capMap.get(s.actionCapabilityId) ?? null : null,
    outputResult: s.outputResult ? (() => { try { return JSON.parse(s.outputResult); } catch { return null; } })() : null,
    approvedAt: s.approvedAt?.toISOString() ?? null,
    approvedById: s.approvedById,
    executedAt: s.executedAt?.toISOString() ?? null,
    errorMessage: s.errorMessage,
    createdAt: s.createdAt.toISOString(),
  }));

  return NextResponse.json({
    id: initiative.id,
    goalId: initiative.goalId,
    goal: initiative.goal,
    aiEntityId: initiative.aiEntityId,
    aiEntityName: aiEntity?.displayName ?? null,
    status: initiative.status,
    rationale: initiative.rationale,
    impactAssessment: initiative.impactAssessment,
    executionPlanId: initiative.executionPlanId,
    planStatus: initiative.executionPlan?.status ?? null,
    steps,
    createdAt: initiative.createdAt.toISOString(),
    updatedAt: initiative.updatedAt.toISOString(),
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

  const initiative = await prisma.initiative.findFirst({
    where: { id, operatorId },
    include: { goal: { select: { title: true } } },
  });

  if (!initiative) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();

  if (body.status !== "approved" && body.status !== "rejected") {
    return NextResponse.json({ error: "Status must be 'approved' or 'rejected'" }, { status: 400 });
  }

  if (body.status === "approved") {
    // Update initiative
    await prisma.initiative.update({
      where: { id },
      data: { status: "approved" },
    });

    if (initiative.executionPlanId) {
      // Approve the execution plan
      await prisma.executionPlan.update({
        where: { id: initiative.executionPlanId },
        data: { status: "approved", approvedAt: new Date(), approvedById: user.id },
      });

      // Find the first awaiting step
      const firstStep = await prisma.executionStep.findFirst({
        where: { planId: initiative.executionPlanId, status: "awaiting_approval" },
        orderBy: { sequenceOrder: "asc" },
      });

      if (firstStep) {
        // Assign approving user to unassigned action steps
        await prisma.executionStep.updateMany({
          where: {
            planId: initiative.executionPlanId,
            executionMode: "action",
            assignedUserId: null,
          },
          data: { assignedUserId: user.id },
        });

        // Advance the first step and update initiative to executing
        await prisma.initiative.update({
          where: { id },
          data: { status: "executing" },
        });

        advanceStep(firstStep.id, "approve", user.id).catch(err =>
          console.error(`[initiatives-api] Step advance failed for initiative ${id}:`, err),
        );
      }
    }

    // Trigger WorkStream recheck
    triggerInitiativeWorkStreamRecheck(id);

    const current = await prisma.initiative.findUnique({ where: { id }, select: { status: true } });
    return NextResponse.json({ id, status: current?.status ?? "approved" });
  }

  // Rejected
  await prisma.initiative.update({
    where: { id },
    data: { status: "rejected" },
  });

  if (initiative.executionPlanId) {
    await prisma.executionPlan.update({
      where: { id: initiative.executionPlanId },
      data: { status: "failed" },
    });
  }

  sendNotificationToAdmins({
    operatorId,
    type: "system_alert",
    title: `Initiative rejected: ${initiative.goal.title}`,
    body: `The proposed initiative was rejected by ${user.id}.`,
    sourceType: "initiative",
    sourceId: id,
  }).catch(() => {});

  // Trigger WorkStream recheck
  triggerInitiativeWorkStreamRecheck(id);

  return NextResponse.json({ id, status: "rejected" });
}

function triggerInitiativeWorkStreamRecheck(initiativeId: string) {
  prisma.workStreamItem.findMany({
    where: { itemType: "initiative", itemId: initiativeId },
    select: { workStreamId: true },
  }).then(items => {
    for (const item of items) {
      recheckWorkStreamStatus(item.workStreamId).catch(console.error);
    }
  }).catch(console.error);
}
