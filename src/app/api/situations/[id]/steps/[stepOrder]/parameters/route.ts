import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updatePageWithLock, resolvePageSlug } from "@/lib/wiki-engine";
import { parseActionPlan, renderActionPlan, replaceSection } from "@/lib/wiki-execution-engine";
import type { SituationProperties } from "@/lib/situation-wiki-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepOrder: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id, stepOrder: stepOrderStr } = await params;

  const stepOrder = parseInt(stepOrderStr, 10);
  if (!isFinite(stepOrder) || stepOrder < 1) {
    return NextResponse.json({ error: "Invalid step order" }, { status: 400 });
  }

  const pages = await prisma.$queryRawUnsafe<Array<{ slug: string; content: string; properties: SituationProperties | null }>>(
    `SELECT slug, content, properties FROM "KnowledgePage"
     WHERE "operatorId" = $1
       AND "pageType" = 'situation_instance'
       AND properties->>'situation_id' = $2
     LIMIT 1`,
    operatorId, id,
  );

  if (pages.length === 0) {
    return NextResponse.json({ error: "Situation not found" }, { status: 404 });
  }

  const body = await req.json();
  if (!body.parameters || typeof body.parameters !== "object" || Array.isArray(body.parameters)) {
    return NextResponse.json({ error: "parameters must be an object" }, { status: 400 });
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
    id: `wiki-step-${stepOrder}`,
    parameters: body.parameters,
    _wikiFirst: true,
  });
}
