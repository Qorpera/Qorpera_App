import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = await params;
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || "100"), 500);
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

  // Find all entities belonging to this department
  const deptEntities = await prisma.entity.findMany({
    where: { parentDepartmentId: id, status: "active" },
    select: { id: true, displayName: true },
  });

  if (deptEntities.length === 0) {
    return NextResponse.json([]);
  }

  const deptEntityIds = deptEntities.map((e) => e.id);
  const deptEntityMap = new Map(deptEntities.map((e) => [e.id, e.displayName]));

  // Find relationships involving these entities
  const relationships = await prisma.relationship.findMany({
    where: {
      OR: [
        { fromEntityId: { in: deptEntityIds } },
        { toEntityId: { in: deptEntityIds } },
      ],
    },
    include: {
      fromEntity: {
        select: {
          id: true,
          displayName: true,
          category: true,
          status: true,
          entityType: { select: { slug: true, name: true, icon: true, color: true } },
        },
      },
      toEntity: {
        select: {
          id: true,
          displayName: true,
          category: true,
          status: true,
          entityType: { select: { slug: true, name: true, icon: true, color: true } },
        },
      },
      relationshipType: { select: { name: true } },
    },
  });

  // Collect external entities with linked-via context
  const seen = new Set<string>();
  const results: Array<{
    id: string;
    displayName: string;
    entityType: { name: string; icon: string | null; color: string | null };
    linkedVia: string;
  }> = [];

  for (const rel of relationships) {
    const isDeptFrom = deptEntityIds.includes(rel.fromEntityId);
    const other = isDeptFrom ? rel.toEntity : rel.fromEntity;
    const deptMember = isDeptFrom ? rel.fromEntity : rel.toEntity;

    if (other.category !== "external" || other.status !== "active") continue;
    if (seen.has(other.id)) continue;
    seen.add(other.id);

    const memberName = deptEntityMap.get(deptMember.id) ?? deptMember.displayName;
    results.push({
      id: other.id,
      displayName: other.displayName,
      entityType: {
        name: other.entityType.name,
        icon: other.entityType.icon,
        color: other.entityType.color,
      },
      linkedVia: `${rel.relationshipType.name} — ${memberName}`,
    });
  }

  return NextResponse.json({ links: results.slice(0, limit), totalCount: results.length, hasMore: results.length > limit });
}
