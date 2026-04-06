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
      investigations: true,
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

  const investigationsTotal = Array.isArray(plan.investigations)
    ? (plan.investigations as unknown[]).length
    : 0;

  // Omit the raw investigations JSON from the response
  const { investigations: _, ...rest } = plan;

  return NextResponse.json({
    plan: { ...rest, investigationsTotal },
  });
}
