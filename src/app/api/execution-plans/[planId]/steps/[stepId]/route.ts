import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { advanceStep } from "@/lib/execution-engine";

const VALID_ACTIONS = ["approve", "reject", "skip"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string; stepId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { planId, stepId } = await params;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

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
