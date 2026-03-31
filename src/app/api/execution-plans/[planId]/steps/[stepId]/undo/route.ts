import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string; stepId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { planId, stepId } = await params;

  const plan = await prisma.executionPlan.findFirst({
    where: { id: planId, operatorId },
    include: { steps: { orderBy: { sequenceOrder: "asc" } } },
  });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const step = plan.steps.find(s => s.id === stepId);
  if (!step) return NextResponse.json({ error: "Step not found" }, { status: 404 });

  if (step.executionMode !== "human_task" || step.status !== "completed") {
    return NextResponse.json({ error: "Can only undo completed human tasks" }, { status: 400 });
  }

  // Cascading undo: revert this step and all subsequent completed human tasks
  const stepsToRevert = plan.steps.filter(
    s => s.sequenceOrder >= step.sequenceOrder && s.status === "completed" && s.executionMode === "human_task"
  );

  await prisma.$transaction([
    prisma.executionStep.updateMany({
      where: { id: { in: stepsToRevert.map(s => s.id) } },
      data: { status: "pending", executedAt: null, outputResult: null },
    }),
    prisma.executionPlan.update({
      where: { id: planId },
      data: {
        status: "executing",
        currentStepOrder: step.sequenceOrder,
        completedAt: null,
      },
    }),
  ]);

  const updated = await prisma.executionPlan.findUnique({
    where: { id: planId },
    include: { steps: { orderBy: { sequenceOrder: "asc" } } },
  });

  return NextResponse.json(updated);
}
