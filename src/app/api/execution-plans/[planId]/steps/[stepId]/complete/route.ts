import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { completeHumanStep } from "@/lib/execution-engine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string; stepId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { planId, stepId } = await params;

  const plan = await prisma.executionPlan.findFirst({
    where: { id: planId, operatorId },
  });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const step = await prisma.executionStep.findUnique({
    where: { id: stepId },
  });
  if (!step || step.planId !== planId) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
  }

  if (step.executionMode !== "human_task" || step.status !== "executing") {
    return NextResponse.json(
      { error: "Step is not an executing human task" },
      { status: 400 },
    );
  }

  if (user.id !== step.assignedUserId) {
    return NextResponse.json(
      { error: "Only the assigned user can complete this task" },
      { status: 403 },
    );
  }

  const body = await req.json();
  if (!body.notes || typeof body.notes !== "string" || !body.notes.trim()) {
    return NextResponse.json({ error: "notes is required" }, { status: 400 });
  }

  await completeHumanStep(stepId, user.id, body.notes.trim(), body.attachments);

  const updated = await prisma.executionStep.findUnique({
    where: { id: stepId },
  });

  return NextResponse.json(updated);
}
