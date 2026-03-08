import { NextRequest, NextResponse } from "next/server";
import { getOperatorId, getUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entityId: string }> },
) {
  const operatorId = await getOperatorId();
  const { id, entityId } = await params;
  const _userId = await getUserId();
  const _visibleDepts = await getVisibleDepartmentIds(operatorId, _userId);
  if (_visibleDepts !== "all" && !_visibleDepts.includes(id)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  const body = await req.json();

  // Validate member exists, belongs to this department, is base category
  const member = await prisma.entity.findFirst({
    where: {
      id: entityId,
      operatorId,
      parentDepartmentId: id,
      category: "base",
      status: "active",
    },
    select: { id: true, entityTypeId: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Member not found in this department" }, { status: 404 });
  }

  // Update displayName
  if (body.name !== undefined) {
    await prisma.entity.update({
      where: { id: entityId },
      data: { displayName: String(body.name).trim() },
    });
  }

  // Update properties
  const propsToUpdate: Array<{ slug: string; value: string }> = [];
  if (body.role !== undefined) propsToUpdate.push({ slug: "role", value: String(body.role).trim() });
  if (body.email !== undefined) propsToUpdate.push({ slug: "email", value: String(body.email).trim().toLowerCase() });

  if (propsToUpdate.length > 0) {
    const propDefs = await prisma.entityProperty.findMany({
      where: { entityTypeId: member.entityTypeId, slug: { in: propsToUpdate.map((p) => p.slug) } },
      select: { id: true, slug: true },
    });
    const slugToId = new Map(propDefs.map((p) => [p.slug, p.id]));

    for (const { slug, value } of propsToUpdate) {
      const propId = slugToId.get(slug);
      if (!propId) continue;
      await prisma.propertyValue.upsert({
        where: { entityId_propertyId: { entityId, propertyId: propId } },
        create: { entityId, propertyId: propId, value },
        update: { value },
      });
    }
  }

  const updated = await prisma.entity.findUnique({
    where: { id: entityId },
    include: {
      entityType: { select: { slug: true, name: true, icon: true, color: true } },
      propertyValues: {
        include: { property: { select: { slug: true, name: true, dataType: true } } },
      },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; entityId: string }> },
) {
  const operatorId = await getOperatorId();
  const { id, entityId } = await params;
  const _userId2 = await getUserId();
  const _visibleDepts2 = await getVisibleDepartmentIds(operatorId, _userId2);
  if (_visibleDepts2 !== "all" && !_visibleDepts2.includes(id)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const member = await prisma.entity.findFirst({
    where: {
      id: entityId,
      operatorId,
      parentDepartmentId: id,
      status: "active",
    },
  });
  if (!member) {
    return NextResponse.json({ error: "Member not found in this department" }, { status: 404 });
  }

  await prisma.entity.update({
    where: { id: entityId },
    data: { parentDepartmentId: null },
  });

  return NextResponse.json({ ok: true });
}
