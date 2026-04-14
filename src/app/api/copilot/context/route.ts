import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  const [entityTypes, totalRelationships] =
    await Promise.all([
      prisma.entityType.findMany({
        where: { operatorId },
        include: {
          properties: { orderBy: { displayOrder: "asc" } },
          _count: { select: { entities: true } },
        },
        orderBy: { name: "asc" },
      }),
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
