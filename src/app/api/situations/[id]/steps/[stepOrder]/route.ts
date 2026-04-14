import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { approveSituationStep, parseActionPlan } from "@/lib/wiki-execution-engine";

const VALID_ACTIONS = ["approve", "reject", "skip"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepOrder: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id, stepOrder: stepOrderStr } = await params;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const stepOrder = parseInt(stepOrderStr, 10);
  if (!isFinite(stepOrder) || stepOrder < 1) {
    return NextResponse.json({ error: "Invalid step order" }, { status: 400 });
  }

  const pages = await prisma.$queryRawUnsafe<Array<{ slug: string; content: string }>>(
    `SELECT slug, content FROM "KnowledgePage"
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
  if (!VALID_ACTIONS.includes(body.action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const page = pages[0];
  await approveSituationStep(operatorId, page.slug, stepOrder, user.id, body.action);

  const updatedPage = await prisma.knowledgePage.findUnique({
    where: { operatorId_slug: { operatorId, slug: page.slug } },
    select: { content: true },
  });
  const plan = parseActionPlan(updatedPage?.content ?? "");
  const step = plan.steps.find(s => s.order === stepOrder);

  return NextResponse.json({
    id: `wiki-step-${stepOrder}`,
    sequenceOrder: stepOrder,
    title: step?.title ?? "",
    status: step?.status ?? "unknown",
    description: step?.description ?? "",
    _wikiFirst: true,
  });
}
