import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { advanceStep } from "@/lib/execution-engine";

const VALID_ACTIONS = ["approve", "reject", "skip"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id, stepId } = await params;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  // Load initiative and verify operator
  const initiative = await prisma.initiative.findFirst({
    where: { id, operatorId },
    select: { executionPlanId: true },
  });

  if (!initiative || !initiative.executionPlanId) {
    return NextResponse.json({ error: "Initiative or plan not found" }, { status: 404 });
  }

  // Verify step belongs to this initiative's plan
  const step = await prisma.executionStep.findUnique({
    where: { id: stepId },
  });

  if (!step || step.planId !== initiative.executionPlanId) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
  }

  const body = await req.json();
  if (!VALID_ACTIONS.includes(body.action)) {
    return NextResponse.json(
      { error: "Invalid action. Must be one of: approve, reject, skip" },
      { status: 400 },
    );
  }

  await advanceStep(stepId, body.action, user.id);

  const updated = await prisma.executionStep.findUnique({
    where: { id: stepId },
  });

  return NextResponse.json(updated);
}
