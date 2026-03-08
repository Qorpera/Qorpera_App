import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const operatorId = await getOperatorId();
  const { id } = await params;

  const dept = await prisma.entity.findFirst({
    where: { id, operatorId, category: "foundational", status: "active" },
    include: {
      entityType: { select: { slug: true, name: true, icon: true, color: true } },
    },
  });
  if (!dept) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  const [members, documents, digitalEntities, connectorCount] = await Promise.all([
    prisma.entity.findMany({
      where: { parentDepartmentId: id, category: "base", status: "active" },
      include: {
        entityType: { select: { slug: true, name: true, icon: true, color: true } },
        propertyValues: {
          include: { property: { select: { slug: true, name: true, dataType: true } } },
        },
      },
      orderBy: { displayName: "asc" },
    }),
    prisma.entity.findMany({
      where: { parentDepartmentId: id, category: "internal", status: "active" },
      include: {
        entityType: { select: { slug: true, name: true, icon: true, color: true } },
        propertyValues: {
          include: { property: { select: { slug: true, name: true, dataType: true } } },
        },
      },
      orderBy: { displayName: "asc" },
    }),
    prisma.relationship.findMany({
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
            entityType: { select: { slug: true, name: true, icon: true, color: true } },
          },
        },
      },
    }),
    prisma.connectorDepartmentBinding.count({
      where: { departmentId: id },
    }),
  ]);

  return NextResponse.json({
    id: dept.id,
    displayName: dept.displayName,
    description: dept.description,
    category: dept.category,
    mapX: dept.mapX,
    mapY: dept.mapY,
    entityType: dept.entityType,
    parentDepartmentId: dept.parentDepartmentId,
    createdAt: dept.createdAt,
    members,
    documents,
    digitalEntities: digitalEntities.map((r) => r.fromEntity),
    memberCount: members.length,
    documentCount: documents.length,
    digitalCount: digitalEntities.length,
    connectorCount,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const operatorId = await getOperatorId();
  const { id } = await params;
  const body = await req.json();

  const dept = await prisma.entity.findFirst({
    where: { id, operatorId, category: "foundational", status: "active" },
  });
  if (!dept) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.displayName = String(body.name).trim();
  if (body.description !== undefined) data.description = String(body.description).trim();
  if (typeof body.mapX === "number") data.mapX = body.mapX;
  if (typeof body.mapY === "number") data.mapY = body.mapY;

  const updated = await prisma.entity.update({
    where: { id },
    data,
    include: {
      entityType: { select: { slug: true, name: true, icon: true, color: true } },
    },
  });

  return NextResponse.json({
    id: updated.id,
    displayName: updated.displayName,
    description: updated.description,
    category: updated.category,
    mapX: updated.mapX,
    mapY: updated.mapY,
    entityType: updated.entityType,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const operatorId = await getOperatorId();
  const { id } = await params;

  const dept = await prisma.entity.findFirst({
    where: { id, operatorId, category: "foundational", status: "active" },
    include: { entityType: { select: { slug: true } } },
  });
  if (!dept) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  // Guard: cannot delete CompanyHQ
  if (dept.entityType.slug === "organization") {
    return NextResponse.json(
      { error: "Cannot delete the company headquarters" },
      { status: 403 },
    );
  }

  // Guard: has connector bindings
  const bindingCount = await prisma.connectorDepartmentBinding.count({
    where: { departmentId: id },
  });
  if (bindingCount > 0) {
    return NextResponse.json(
      { error: "Remove connector bindings before deleting this department" },
      { status: 409 },
    );
  }

  // Orphan children, then delete
  await prisma.entity.updateMany({
    where: { parentDepartmentId: id },
    data: { parentDepartmentId: null },
  });

  await prisma.entity.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
