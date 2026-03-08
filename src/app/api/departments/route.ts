import { NextRequest, NextResponse } from "next/server";
import { getOperatorId, getUserId, getUserRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HARDCODED_TYPE_DEFS } from "@/lib/hardcoded-type-defs";
import { getVisibleDepartmentIds } from "@/lib/user-scope";

export async function GET() {
  const operatorId = await getOperatorId();
  const userId = await getUserId();
  const visibleDepts = await getVisibleDepartmentIds(operatorId, userId);

  const departments = await prisma.entity.findMany({
    where: {
      operatorId,
      category: "foundational",
      status: "active",
      entityType: { slug: { in: ["department", "organization"] } },
      ...(visibleDepts !== "all" ? {
        OR: [
          { id: { in: visibleDepts } },
          { entityType: { slug: "organization" } },
        ],
      } : {}),
    },
    include: {
      entityType: { select: { slug: true, name: true, icon: true, color: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const results = await Promise.all(
    departments.map(async (dept) => {
      const [memberCount, documentCount, digitalCount, connectorCount, filledSlotDocs] = await Promise.all([
        prisma.entity.count({
          where: { parentDepartmentId: dept.id, category: "base", status: "active" },
        }),
        prisma.entity.count({
          where: { parentDepartmentId: dept.id, category: "internal", status: "active" },
        }),
        prisma.relationship.count({
          where: {
            toEntityId: dept.id,
            relationshipType: { slug: "department-member" },
          },
        }),
        prisma.connectorDepartmentBinding.count({
          where: { departmentId: dept.id },
        }),
        prisma.internalDocument.findMany({
          where: {
            departmentId: dept.id,
            documentType: { not: "context" },
            status: { not: "replaced" },
          },
          select: { documentType: true },
          distinct: ["documentType"],
        }),
      ]);
      const filledSlots = filledSlotDocs.map((d) => d.documentType);

      return {
        id: dept.id,
        displayName: dept.displayName,
        description: dept.description,
        category: dept.category,
        mapX: dept.mapX,
        mapY: dept.mapY,
        entityType: dept.entityType,
        parentDepartmentId: dept.parentDepartmentId,
        createdAt: dept.createdAt,
        memberCount,
        documentCount,
        digitalCount,
        connectorCount,
        filledSlots,
      };
    }),
  );

  return NextResponse.json(results);
}

export async function POST(req: NextRequest) {
  const operatorId = await getOperatorId();
  const role = await getUserRole();
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const body = await req.json();
  const { name, description, mapX, mapY } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!description || typeof description !== "string" || !description.trim()) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  // Ensure department entity type exists
  let deptType = await prisma.entityType.findFirst({
    where: { operatorId, slug: "department" },
  });
  if (!deptType) {
    const def = HARDCODED_TYPE_DEFS["department"];
    deptType = await prisma.entityType.create({
      data: {
        operatorId,
        slug: def.slug,
        name: def.name,
        description: def.description,
        icon: def.icon,
        color: def.color,
        defaultCategory: def.defaultCategory,
      },
    });
  }

  // Auto-calculate position if not provided
  const posX = typeof mapX === "number" ? mapX : 0;
  const posY = typeof mapY === "number" ? mapY : 0;

  const entity = await prisma.entity.create({
    data: {
      operatorId,
      entityTypeId: deptType.id,
      displayName: name.trim(),
      category: "foundational",
      description: description.trim(),
      mapX: posX,
      mapY: posY,
    },
    include: {
      entityType: { select: { slug: true, name: true, icon: true, color: true } },
    },
  });

  return NextResponse.json({
    id: entity.id,
    displayName: entity.displayName,
    description: entity.description,
    category: entity.category,
    mapX: entity.mapX,
    mapY: entity.mapY,
    entityType: entity.entityType,
    parentDepartmentId: entity.parentDepartmentId,
    createdAt: entity.createdAt,
    memberCount: 0,
    documentCount: 0,
    digitalCount: 0,
    connectorCount: 0,
    filledSlots: [],
  }, { status: 201 });
}
