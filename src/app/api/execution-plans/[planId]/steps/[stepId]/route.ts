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
    select: { id: true, sourceType: true, sourceId: true },
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

  // Check if this is a wiki-first situation
  let wikiPageSlug: string | undefined;
  if (plan.sourceType === "situation") {
    const situation = await prisma.situation.findFirst({
      where: { id: plan.sourceId, operatorId },
      select: { wikiPageSlug: true },
    });
    if (situation?.wikiPageSlug) {
      wikiPageSlug = situation.wikiPageSlug;
    }
  }

  if (wikiPageSlug) {
    // Wiki-first: approve via wiki execution engine
    const { approveSituationStep, parseActionPlan } = await import("@/lib/wiki-execution-engine");
    const pageStepOrder = step.sequenceOrder;
    await approveSituationStep(operatorId, wikiPageSlug, pageStepOrder, user.id, body.action);

    // Return the step data from the wiki page
    const page = await prisma.knowledgePage.findUnique({
      where: { operatorId_slug: { operatorId, slug: wikiPageSlug } },
      select: { content: true },
    });
    const parsedPlan = parseActionPlan(page?.content ?? "");
    const updatedStep = parsedPlan.steps.find((s) => s.order === pageStepOrder);

    return NextResponse.json({
      id: stepId,
      sequenceOrder: pageStepOrder,
      title: updatedStep?.title ?? step.title,
      status: updatedStep?.status ?? "unknown",
      description: updatedStep?.description ?? "",
      _wikiFirst: true,
    });
  }

  // Legacy: existing DB-based flow
  await advanceStep(stepId, body.action, user.id);

  const updated = await prisma.executionStep.findUnique({
    where: { id: stepId },
  });

  return NextResponse.json(updated);
}
