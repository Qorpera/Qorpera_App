import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { amendExecutionPlan } from "@/lib/execution-engine";
import { updatePageWithLock } from "@/lib/wiki-engine";
import { parseActionPlan, renderActionPlan, replaceSection } from "@/lib/wiki-execution-engine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { planId } = await params;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json();
  const { amendments } = body;

  if (!Array.isArray(amendments) || amendments.length === 0) {
    return NextResponse.json({ error: "amendments array is required" }, { status: 400 });
  }

  for (const a of amendments) {
    if (typeof a.stepSequenceOrder !== "number" || typeof a.newDescription !== "string" || !a.newDescription.trim()) {
      return NextResponse.json({ error: "Each amendment requires stepSequenceOrder (number) and newDescription (string)" }, { status: 400 });
    }
  }

  const plan = await prisma.executionPlan.findFirst({
    where: { id: planId, operatorId },
  });

  // Wiki-first fallback
  if (!plan && planId.startsWith("situation-")) {
    const wikiPage = await prisma.knowledgePage.findFirst({
      where: { operatorId, slug: planId, pageType: "situation_instance" },
      select: { slug: true, content: true },
    });
    if (!wikiPage) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const updated = await updatePageWithLock(operatorId, wikiPage.slug, (current) => {
      const parsed = parseActionPlan(current.content);
      for (const a of amendments) {
        const step = parsed.steps.find(s => s.order === a.stepSequenceOrder);
        if (step) step.description = a.newDescription;
      }
      const newSection = renderActionPlan(parsed.steps);
      const content = replaceSection(current.content, "Action Plan", newSection);
      return { content };
    });

    const updatedPlan = parseActionPlan(updated.content);

    return NextResponse.json({
      id: planId,
      steps: updatedPlan.steps.map(s => ({
        id: `wiki-step-${s.order}`,
        sequenceOrder: s.order,
        title: s.title,
        description: s.description,
        status: s.status,
      })),
      _wikiFirst: true,
    });
  }

  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  try {
    await amendExecutionPlan(planId, amendments);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Amendment failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const updated = await prisma.executionPlan.findUnique({
    where: { id: planId },
    include: { steps: { orderBy: { sequenceOrder: "asc" } } },
  });

  return NextResponse.json(updated);
}
