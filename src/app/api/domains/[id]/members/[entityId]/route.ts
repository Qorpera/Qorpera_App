import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDomainIds } from "@/lib/domain-scope";
import { updateMemberSchema, parseBody } from "@/lib/api-validation";

async function mirrorDepartmentRemovalToAi(
  entityId: string,
  domainId: string,
  operatorId: string,
) {
  const humanUser = await prisma.user.findFirst({
    where: { entityId },
    select: { id: true },
  });
  if (!humanUser) return;

  const aiEntity = await prisma.entity.findFirst({
    where: { ownerUserId: humanUser.id, operatorId, status: "active" },
    select: { id: true },
  });
  if (!aiEntity) return;

  // Clear home department if it matches
  const aiHome = await prisma.entity.findFirst({
    where: { id: aiEntity.id, primaryDomainId: domainId },
  });
  if (aiHome) {
    await prisma.entity.update({
      where: { id: aiEntity.id },
      data: { primaryDomainId: null },
    });
  }

  // Remove cross-dept relationship if exists
  const aiCrossRel = await prisma.relationship.findFirst({
    where: {
      relationshipType: { slug: "department-member", operatorId },
      OR: [
        { fromEntityId: aiEntity.id, toEntityId: domainId },
        { fromEntityId: domainId, toEntityId: aiEntity.id },
      ],
    },
  });
  if (aiCrossRel) {
    await prisma.relationship.delete({ where: { id: aiCrossRel.id } });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entityId: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id, entityId } = await params;
  const _visibleDomains = await getVisibleDomainIds(operatorId, user.id);
  if (_visibleDomains !== "all" && !_visibleDomains.includes(id)) {
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
      primaryDomainId: id,
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
  const _visibleDomains2 = await getVisibleDomainIds(operatorId, user.id);
  if (_visibleDomains2 !== "all" && !_visibleDomains2.includes(id)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Check if this is a home member (primaryDomainId = this dept)
  const homeMember = await prisma.entity.findFirst({
    where: {
      id: entityId,
      operatorId,
      primaryDomainId: id,
      status: "active",
    },
  });

  if (homeMember) {
    await prisma.entity.update({
      where: { id: entityId },
      data: { primaryDomainId: null },
    });
    await mirrorDepartmentRemovalToAi(entityId, id, operatorId);

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
    await mirrorDepartmentRemovalToAi(entityId, id, operatorId);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Member not found in this department" }, { status: 404 });
}
