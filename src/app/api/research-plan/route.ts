import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  const plan = await prisma.researchPlan.findFirst({
    where: { operatorId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      completedCount: true,
      failedCount: true,
      totalWikiPages: true,
      progressMessage: true,
      estimatedDurationMinutes: true,
      estimatedCostCents: true,
      actualCostCents: true,
      createdAt: true,
    },
  });

  if (!plan) return NextResponse.json({ plan: null });

  // Count total investigations from JSON
  const fullPlan = await prisma.researchPlan.findUnique({
    where: { id: plan.id },
    select: { investigations: true },
  });
  const investigationsTotal = Array.isArray(fullPlan?.investigations)
    ? (fullPlan.investigations as unknown[]).length
    : 0;

  return NextResponse.json({
    plan: { ...plan, investigationsTotal },
  });
}
