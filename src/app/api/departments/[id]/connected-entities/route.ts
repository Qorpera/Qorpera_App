import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const operatorId = await getOperatorId();
  const { id } = await params;

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || "50"), 200);
  const offset = Number(req.nextUrl.searchParams.get("offset") || "0");

  const dept = await prisma.entity.findFirst({
    where: { id, operatorId, category: "foundational", status: "active" },
  });
  if (!dept) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  // Find department-member relationship type
  const relType = await prisma.relationshipType.findFirst({
    where: { operatorId, slug: "department-member" },
  });

  if (!relType) {
    return NextResponse.json({ groups: [] });
  }

  const relationships = await prisma.relationship.findMany({
    where: {
      relationshipTypeId: relType.id,
      toEntityId: id,
    },
    include: {
      fromEntity: {
        include: {
          entityType: { select: { slug: true, name: true, color: true } },
          propertyValues: {
            include: { property: { select: { slug: true, name: true, dataType: true } } },
          },
        },
      },
    },
    skip: offset,
    take: limit,
  });

  // Group by entity type slug
  const groupMap = new Map<string, {
    typeSlug: string;
    typeName: string;
    typeColor: string;
    entities: Array<{
      id: string;
      displayName: string;
      properties: Record<string, string>;
      sourceSystem: string | null;
    }>;
  }>();

  for (const rel of relationships) {
    const e = rel.fromEntity;
    const slug = e.entityType.slug;

    if (!groupMap.has(slug)) {
      groupMap.set(slug, {
        typeSlug: slug,
        typeName: e.entityType.name,
        typeColor: e.entityType.color || "#888",
        entities: [],
      });
    }

    const props: Record<string, string> = {};
    for (const pv of e.propertyValues) {
      props[pv.property.slug] = pv.value;
    }

    groupMap.get(slug)!.entities.push({
      id: e.id,
      displayName: e.displayName,
      properties: props,
      sourceSystem: e.sourceSystem,
    });
  }

  return NextResponse.json({ groups: Array.from(groupMap.values()) });
}
