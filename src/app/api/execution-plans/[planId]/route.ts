import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { planId } = await params;

  const plan = await prisma.executionPlan.findFirst({
    where: { id: planId, operatorId },
    select: {
      id: true,
      sourceType: true,
      sourceId: true,
      status: true,
      currentStepOrder: true,
      approvedAt: true,
      completedAt: true,
      priorityScore: true,
      createdAt: true,
      steps: {
        select: {
          id: true,
          sequenceOrder: true,
          title: true,
          description: true,
          executionMode: true,
          status: true,
          assignedUserId: true,
          outputResult: true,
          approvedAt: true,
          approvedById: true,
          executedAt: true,
          errorMessage: true,
          originalDescription: true,
          createdAt: true,
        },
        orderBy: { sequenceOrder: "asc" },
      },
    },
  });

  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(plan);
}
