import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const params = req.nextUrl.searchParams;
  const statusFilter = params.get("status") ?? undefined;

  const where: Record<string, unknown> = { operatorId };
  if (statusFilter) where.status = statusFilter;

  const initiatives = await prisma.initiative.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  const aiEntityIds = [...new Set(initiatives.map(i => i.aiEntityId))];
  const aiEntities = aiEntityIds.length > 0
    ? await prisma.entity.findMany({
        where: { id: { in: aiEntityIds }, operatorId },
        select: { id: true, displayName: true },
      })
    : [];
  const aiEntityMap = new Map(aiEntities.map(e => [e.id, e.displayName]));

  const items = initiatives.map(i => ({
    id: i.id,
    aiEntityId: i.aiEntityId,
    aiEntityName: aiEntityMap.get(i.aiEntityId) ?? null,
    proposalType: i.proposalType,
    triggerSummary: i.triggerSummary,
    status: i.status,
    rationale: i.rationale,
    impactAssessment: i.impactAssessment,
    proposedProjectConfig: i.proposedProjectConfig,
    projectId: i.projectId,
    createdAt: i.createdAt.toISOString(),
  }));

  return NextResponse.json({ items });
}
