import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";
import { updateMemberSchema, parseBody } from "@/lib/api-validation";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entityId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id, entityId } = await params;
  const _visibleDepts = await getVisibleDepartmentIds(operatorId, user.id);
  if (_visibleDepts !== "all" && !_visibleDepts.includes(id)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = parseBody(updateMemberSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

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
  if (parsed.data.displayName !== undefined) {
    await prisma.entity.update({
      where: { id: entityId },
      data: { displayName: parsed.data.displayName },
    });
  }

  // Update properties
  const propsToUpdate: Array<{ slug: string; value: string }> = [];
  if (parsed.data.role !== undefined) propsToUpdate.push({ slug: "role", value: parsed.data.role });
  if (parsed.data.email !== undefined) propsToUpdate.push({ slug: "email", value: parsed.data.email.toLowerCase() });

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
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  if (user.role === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { id, entityId } = await params;
  const _visibleDepts2 = await getVisibleDepartmentIds(operatorId, user.id);
  if (_visibleDepts2 !== "all" && !_visibleDepts2.includes(id)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Check if this is a home member (parentDepartmentId = this dept)
  const homeMember = await prisma.entity.findFirst({
    where: {
      id: entityId,
      operatorId,
      parentDepartmentId: id,
      status: "active",
    },
  });

  if (homeMember) {
    await prisma.entity.update({
      where: { id: entityId },
      data: { parentDepartmentId: null },
    });
    return NextResponse.json({ ok: true });
  }

  // Check if this is a cross-department member linked via relationship
  const crossRel = await prisma.relationship.findFirst({
    where: {
      relationshipType: { slug: "department-member", operatorId },
      OR: [
        { fromEntityId: entityId, toEntityId: id },
        { fromEntityId: id, toEntityId: entityId },
      ],
    },
  });

  if (crossRel) {
    await prisma.relationship.delete({ where: { id: crossRel.id } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Member not found in this department" }, { status: 404 });
}
