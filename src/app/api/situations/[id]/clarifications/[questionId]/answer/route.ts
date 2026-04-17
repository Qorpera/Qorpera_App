import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolvePageSlug } from "@/lib/wiki-engine";
import { parseSituationPage } from "@/lib/situation-page-parser";
import { parseOpenQuestionsSection } from "@/lib/clarification-helpers";
import { answerClarification } from "@/lib/deliberation-pass";
import type { SituationProperties } from "@/lib/situation-wiki-helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id, questionId } = await params;

  const body = await req.json().catch(() => ({}));
  const choice = typeof body.choice === "string" ? body.choice.trim() : "";
  const isCustomAnswer = body.isCustomAnswer === true;
  if (!choice) {
    return NextResponse.json({ error: "choice must be a non-empty string" }, { status: 400 });
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

  const page = pages[0];

  const parsed = parseSituationPage(page.content, page.properties as Record<string, unknown> | null);
  const questions = parsed.sections.openQuestions
    ? parseOpenQuestionsSection(parsed.sections.openQuestions)
    : [];
  const question = questions.find((q) => q.id === questionId);

  if (!question) {
    return NextResponse.json({ error: "Open question not found" }, { status: 404 });
  }

  const isAdmin = user.role === "admin" || user.role === "superadmin";
  if (!isAdmin) {
    const userSlug = await resolvePageSlug(operatorId, user.email ?? undefined, user.name ?? undefined);
    const isSituationAssignee =
      userSlug != null && page.properties?.assigned_to === userSlug;
    if (!isSituationAssignee) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await answerClarification(
    operatorId,
    page.slug,
    questionId,
    choice,
    isCustomAnswer,
    user.id,
  );

  return NextResponse.json({
    questionId,
    choice,
    isCustomAnswer,
    answeredAt: new Date().toISOString(),
    _wikiFirst: true,
  });
}
