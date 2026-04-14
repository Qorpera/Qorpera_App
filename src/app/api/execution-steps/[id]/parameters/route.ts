import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updatePageWithLock, resolvePageSlug } from "@/lib/wiki-engine";
import { parseActionPlan, renderActionPlan, replaceSection } from "@/lib/wiki-execution-engine";
import type { SituationProperties } from "@/lib/situation-wiki-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = await params;

  // Wiki-first: synthetic step IDs like "wiki-step-3"
  if (id.startsWith("wiki-step-")) {
    const stepOrder = parseInt(id.replace("wiki-step-", ""), 10);
    if (!isFinite(stepOrder) || stepOrder < 1) {
      return NextResponse.json({ error: "Invalid wiki step ID" }, { status: 400 });
    }

    const body = await req.json();
    if (!body.parameters || typeof body.parameters !== "object" || Array.isArray(body.parameters)) {
      return NextResponse.json({ error: "parameters must be an object" }, { status: 400 });
    }

    const situationId = req.nextUrl.searchParams.get("situationId");
    if (!situationId) {
      return NextResponse.json({ error: "situationId query param required for wiki steps" }, { status: 400 });
    }

    const pages = await prisma.$queryRawUnsafe<Array<{ slug: string; content: string; properties: SituationProperties | null }>>(
      `SELECT slug, content, properties FROM "KnowledgePage"
       WHERE "operatorId" = $1
         AND "pageType" = 'situation_instance'
         AND properties->>'situation_id' = $2
       LIMIT 1`,
      operatorId, situationId,
    );

    if (pages.length === 0) {
      return NextResponse.json({ error: "Situation not found" }, { status: 404 });
    }

    const page = pages[0];
    const plan = parseActionPlan(page.content);
    const step = plan.steps.find(s => s.order === stepOrder);

    if (!step) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }
    if (step.status !== "pending") {
      return NextResponse.json({ error: "Step is not pending" }, { status: 400 });
    }

    // Authorization: admin, step assignee (by wiki slug), or situation assignee
    const isAdmin = user.role === "admin" || user.role === "superadmin";
    if (!isAdmin) {
      const userSlug = await resolvePageSlug(operatorId, user.email ?? undefined, user.name ?? undefined);
      const isStepAssignee = userSlug != null && step.assignedSlug === userSlug;
      const isSituationAssignee = userSlug != null && page.properties?.assigned_to === userSlug;
      if (!isStepAssignee && !isSituationAssignee) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    await updatePageWithLock(operatorId, page.slug, (current) => {
      const currentPlan = parseActionPlan(current.content);
      const targetStep = currentPlan.steps.find(s => s.order === stepOrder);
      if (!targetStep || targetStep.status !== "pending") return {};
      targetStep.params = body.parameters;
      const newSection = renderActionPlan(currentPlan.steps);
      const content = replaceSection(current.content, "Action Plan", newSection);
      return { content };
    });

    return NextResponse.json({
      id,
      parameters: body.parameters,
      _wikiFirst: true,
    });
  }

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
