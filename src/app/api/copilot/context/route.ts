import { NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listEntityTypes } from "@/lib/entity-model-store";

export async function GET() {
  const operatorId = await getOperatorId();

  const [entityTypes, pendingProposals, activeRecommendations, totalRelationships] =
    await Promise.all([
      listEntityTypes(operatorId),
      prisma.actionProposal.count({ where: { operatorId, status: "PENDING" } }),
      prisma.recommendation.count({ where: { operatorId, status: "active" } }),
      prisma.relationship.count({ where: { fromEntity: { operatorId } } }),
    ]);

  const types = entityTypes.map((t) => ({
    name: t.name,
    slug: t.slug,
    icon: t.icon,
    color: t.color,
    entityCount: t._count.entities,
    propertyCount: t.properties.length,
  }));

  const totalEntities = types.reduce((sum, t) => sum + t.entityCount, 0);

  return NextResponse.json({
    entityTypes: types,
    totalEntities,
    totalRelationships,
    pendingProposals,
    activeRecommendations,
  });
}
