import { NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listEntityTypes } from "@/lib/entity-model-store";

export async function GET() {
  const operatorId = await getOperatorId();

  const [entityTypes, totalRelationships] =
    await Promise.all([
      listEntityTypes(operatorId),
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
  });
}
