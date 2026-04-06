import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updateWikiFromAnswers } from "@/lib/wiki-answer-integration";

/**
 * GET — returns structured gap-analysis questions for the human.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id } = await params;

  const plan = await prisma.researchPlan.findFirst({
    where: { id, operatorId },
    select: {
      questionsForHuman: true,
      coverageScore: true,
      status: true,
    },
  });

  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    questions: plan.questionsForHuman ?? [],
    coverageScore: plan.coverageScore,
    planStatus: plan.status,
  });
}

/**
 * POST — accepts answered questions and integrates them into wiki pages.
 *
 * Body: { answers: Array<{ question: string; context: string; userAnswer: string }> }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id } = await params;

  const plan = await prisma.researchPlan.findFirst({
    where: { id, operatorId },
    select: { id: true },
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const answers: Array<{ question: string; context: string; userAnswer: string }> =
    body.answers;

  if (!Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json(
      { error: "answers must be a non-empty array" },
      { status: 400 },
    );
  }

  // Feed through wiki-answer-integration (same path as onboarding answers)
  const result = await updateWikiFromAnswers(operatorId, answers);

  return NextResponse.json(result);
}
