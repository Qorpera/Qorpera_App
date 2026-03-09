import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = await params;
  const _visibleDepts = await getVisibleDepartmentIds(operatorId, user.id);
  if (_visibleDepts !== "all" && !_visibleDepts.includes(id)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Validate department
  const dept = await prisma.entity.findFirst({
    where: { id, operatorId, category: "foundational", status: "active" },
  });
  if (!dept) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  const entityInclude = {
    entityType: { select: { slug: true, name: true, icon: true, color: true } },
    propertyValues: {
      include: { property: { select: { slug: true, name: true, dataType: true } } },
    },
  };

  // Base members (parentDepartmentId = id, category = "base")
  const base = await prisma.entity.findMany({
    where: { parentDepartmentId: id, category: "base", status: "active" },
    include: entityInclude,
    orderBy: { displayName: "asc" },
  });

  // Internal documents (parentDepartmentId = id, category = "internal")
  const internal = await prisma.entity.findMany({
    where: { parentDepartmentId: id, category: "internal", status: "active" },
    include: entityInclude,
    orderBy: { displayName: "asc" },
  });

  // Digital entities linked via "department-member" relationship
  const digitalRels = await prisma.relationship.findMany({
    where: {
      toEntityId: id,
      relationshipType: { slug: "department-member" },
    },
    include: {
      fromEntity: {
        select: {
          id: true,
          displayName: true,
          category: true,
          status: true,
          entityType: { select: { slug: true, name: true, icon: true, color: true } },
          propertyValues: {
            include: { property: { select: { slug: true, name: true, dataType: true } } },
          },
        },
      },
    },
  });
  const digital = digitalRels
    .filter((r) => r.fromEntity.status === "active")
    .map((r) => r.fromEntity);

  // External entities: related to any entity in this department
  const deptEntityIds = [
    ...base.map((e) => e.id),
    ...internal.map((e) => e.id),
    ...digital.map((e) => e.id),
  ];

  let external: Array<{
    id: string;
    displayName: string;
    category: string;
    entityType: { slug: string; name: string; icon: string; color: string };
    connectedVia: string;
  }> = [];

  if (deptEntityIds.length > 0) {
    const [outgoing, incoming] = await Promise.all([
      prisma.relationship.findMany({
        where: {
          fromEntityId: { in: deptEntityIds },
          toEntity: { category: "external", status: "active" },
        },
        include: {
          relationshipType: { select: { name: true } },
          toEntity: {
            select: {
              id: true,
              displayName: true,
              category: true,
              entityType: { select: { slug: true, name: true, icon: true, color: true } },
            },
          },
        },
      }),
      prisma.relationship.findMany({
        where: {
          toEntityId: { in: deptEntityIds },
          fromEntity: { category: "external", status: "active" },
        },
        include: {
          relationshipType: { select: { name: true } },
          fromEntity: {
            select: {
              id: true,
              displayName: true,
              category: true,
              entityType: { select: { slug: true, name: true, icon: true, color: true } },
            },
          },
        },
      }),
    ]);

    const seen = new Set<string>();
    const externalEntities: typeof external = [];

    for (const rel of outgoing) {
      if (!seen.has(rel.toEntity.id)) {
        seen.add(rel.toEntity.id);
        externalEntities.push({
          ...rel.toEntity,
          connectedVia: rel.relationshipType.name,
        });
      }
    }
    for (const rel of incoming) {
      if (!seen.has(rel.fromEntity.id)) {
        seen.add(rel.fromEntity.id);
        externalEntities.push({
          ...rel.fromEntity,
          connectedVia: rel.relationshipType.name,
        });
      }
    }

    external = externalEntities;
  }

  return NextResponse.json({
    base,
    internal,
    digital,
    external,
  });
}
