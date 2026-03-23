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
          actionCapabilityId: true,
          status: true,
          assignedUserId: true,
          parameters: true,
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

  // Batch-load action capabilities for preview component mapping
  const capIds = [...new Set(plan.steps.map(s => s.actionCapabilityId).filter(Boolean))] as string[];
  const capabilities = capIds.length > 0
    ? await prisma.actionCapability.findMany({
        where: { id: { in: capIds } },
        select: { id: true, slug: true, name: true },
      })
    : [];
  const capMap = new Map(capabilities.map(c => [c.id, c]));

  const stepsWithCapability = plan.steps.map(s => ({
    ...s,
    parameters: s.parameters ? (() => { try { return JSON.parse(s.parameters); } catch { return null; } })() : null,
    actionCapability: s.actionCapabilityId ? capMap.get(s.actionCapabilityId) ?? null : null,
  }));

  return NextResponse.json({ ...plan, steps: stepsWithCapability });
}
