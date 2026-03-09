import { NextRequest, NextResponse } from "next/server";
import { getOperatorId, getUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";
import { paginationParams, parseQuery } from "@/lib/api-validation";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const operatorId = await getOperatorId();
  const { id } = await params;
  const _userId = await getUserId();
  const _visibleDepts = await getVisibleDepartmentIds(operatorId, _userId);
  if (_visibleDepts !== "all" && !_visibleDepts.includes(id)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const parsed = parseQuery(paginationParams, req.nextUrl.searchParams);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { limit, offset } = parsed.data;

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
    return NextResponse.json({ groups: [], totalCount: 0, limit, offset, hasMore: false });
  }

  const totalCount = await prisma.relationship.count({
    where: { relationshipTypeId: relType.id, toEntityId: id },
  });

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

  return NextResponse.json({ groups: Array.from(groupMap.values()), totalCount, limit, offset, hasMore: offset + limit < totalCount });
}
