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

  const step = await prisma.executionStep.findUnique({ where: { id: stepId } });
  if (!step || step.planId !== planId) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
  }

  let notes: string | undefined;
  try {
    const body = await req.json();
    notes = typeof body.notes === "string" ? body.notes.trim() : undefined;
  } catch {
    // Empty body is fine — notes are optional
  }

  try {
    await completeHumanStep(stepId, user.id, notes);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }

  const updated = await prisma.executionStep.findUnique({ where: { id: stepId } });
  return NextResponse.json(updated);
}
