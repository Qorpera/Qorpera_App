import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { completeHumanStep } from "@/lib/execution-engine";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";

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

  // If notes were provided, create an ActivitySignal and possibly trigger re-evaluation
  if (notes) {
    try {
      await prisma.activitySignal.create({
        data: {
          operatorId,
          signalType: "human_task_note",
          actorEntityId: null,
          metadata: JSON.stringify({
            executionPlanId: planId,
            stepId,
            situationId: plan.sourceId,
            notes,
          }),
          occurredAt: new Date(),
        },
      });

      // Check if there are remaining steps — if so, re-evaluate the plan
      const currentPlan = await prisma.executionPlan.findUnique({
        where: { id: planId },
        select: { status: true },
      });

      const remainingSteps = await prisma.executionStep.count({
        where: {
          planId,
          status: { in: ["pending", "awaiting_approval"] },
        },
      });

      if (remainingSteps > 0 && currentPlan?.status === "executing") {
        await prisma.executionPlan.update({
          where: { id: planId },
          data: { status: "re_evaluating" },
        });

        await enqueueWorkerJob("re_evaluate_plan", operatorId, {
          operatorId,
          executionPlanId: planId,
          triggerStepId: stepId,
          humanNotes: notes,
        }).catch((err) =>
          console.error(`[step-complete] Failed to queue re-evaluation:`, err),
        );
      }
    } catch (err) {
      console.error(`[step-complete] Post-completion notes processing failed:`, err);
    }
  }

  const updated = await prisma.executionStep.findUnique({ where: { id: stepId } });
  return NextResponse.json(updated);
}
