import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = await params;

  // Load step with plan and source
  const step = await prisma.executionStep.findUnique({
    where: { id },
    include: {
      plan: {
        include: {
          situation: { select: { assignedUserId: true } },
        },
      },
    },
  });

  if (!step || step.plan.operatorId !== operatorId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Must be pending
  if (step.status !== "pending") {
    return NextResponse.json({ error: "Step is not pending" }, { status: 400 });
  }

  // Authorization: admin/superadmin, step's assignedUserId, or situation's assignedUserId
  const isAdmin = user.role === "admin" || user.role === "superadmin";
  const isStepAssignee = step.assignedUserId === user.id;
  const isSituationAssignee = step.plan.situation?.assignedUserId === user.id;

  if (!isAdmin && !isStepAssignee && !isSituationAssignee) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.parameters || typeof body.parameters !== "object" || Array.isArray(body.parameters)) {
    return NextResponse.json({ error: "parameters must be an object" }, { status: 400 });
  }

  // Full replacement (not merge)
  const [updatedStep] = await prisma.$transaction([
    prisma.executionStep.update({
      where: { id },
      data: { parameters: JSON.stringify(body.parameters) },
    }),
    prisma.executionPlan.update({
      where: { id: step.planId },
      data: { modifiedBeforeApproval: true },
    }),
  ]);

  return NextResponse.json({
    id: updatedStep.id,
    parameters: body.parameters,
    modifiedBeforeApproval: true,
  });
}
