import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
      id: true,
      status: true,
      investigations: true,
      priorityOrder: true,
      planningReasoning: true,
      estimatedDurationMinutes: true,
      estimatedCostCents: true,
      actualCostCents: true,
      completedCount: true,
      failedCount: true,
      totalWikiPages: true,
      progressMessage: true,
      createdAt: true,
    },
  });

  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ plan });
}
