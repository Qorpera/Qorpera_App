import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { operatorId } = su;

  // Find department-member relationship type
  const relType = await prisma.relationshipType.findFirst({
    where: { operatorId, slug: "department-member" },
  });

  // Get IDs of entities that have a department-member relationship (either side)
  const routedEntityIds: string[] = [];
  if (relType) {
    const routedRels = await prisma.relationship.findMany({
      where: { relationshipTypeId: relType.id },
      select: { fromEntityId: true, toEntityId: true },
    });
    const routedSet = new Set<string>();
    for (const r of routedRels) {
      routedSet.add(r.fromEntityId);
      routedSet.add(r.toEntityId);
    }
    routedEntityIds.push(...routedSet);
  }

  const entities = await prisma.entity.findMany({
    where: {
      operatorId,
      category: "base",
      status: "active",
      parentDepartmentId: null,
      ...(routedEntityIds.length > 0 ? { id: { notIn: routedEntityIds } } : {}),
    },
    include: {
      entityType: { select: { slug: true, name: true, color: true } },
    },
    take: 100,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    entities: entities.map((e) => ({
      id: e.id,
      displayName: e.displayName,
      entityType: {
        slug: e.entityType.slug,
        name: e.entityType.name,
        color: e.entityType.color,
      },
      sourceSystem: e.sourceSystem,
    })),
    count: entities.length,
  });
}
