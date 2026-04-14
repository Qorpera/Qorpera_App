import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { completeHumanSituationStep, parseActionPlan } from "@/lib/wiki-execution-engine";

export async function POST(
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

  const pages = await prisma.$queryRawUnsafe<Array<{ slug: string }>>(
    `SELECT slug FROM "KnowledgePage"
     WHERE "operatorId" = $1
       AND "pageType" = 'situation_instance'
       AND properties->>'situation_id' = $2
     LIMIT 1`,
    operatorId, id,
  );

  if (pages.length === 0) {
    return NextResponse.json({ error: "Situation not found" }, { status: 404 });
  }

  let notes: string | undefined;
  try {
    const body = await req.json();
    notes = typeof body.notes === "string" ? body.notes.trim() : undefined;
  } catch {
    // No body or invalid JSON — notes stays undefined
  }

  try {
    await completeHumanSituationStep(operatorId, pages[0].slug, stepOrder, user.id, notes);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 },
    );
  }

  const updatedPage = await prisma.knowledgePage.findUnique({
    where: { operatorId_slug: { operatorId, slug: pages[0].slug } },
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
