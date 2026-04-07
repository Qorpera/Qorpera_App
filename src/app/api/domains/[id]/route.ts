import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDomainIds } from "@/lib/domain-scope";
import { updateDepartmentSchema, parseBody } from "@/lib/api-validation";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = await params;

  const visibleDomains = await getVisibleDomainIds(operatorId, user.id);
  if (visibleDomains !== "all" && !visibleDomains.includes(id)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const dept = await prisma.entity.findFirst({
    where: { id, operatorId, category: "foundational", status: "active" },
    include: {
      entityType: { select: { slug: true, name: true, icon: true, color: true } },
    },
  });
  if (!dept) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  const [members, documents, digitalEntities] = await Promise.all([
    prisma.entity.findMany({
      where: { primaryDomainId: id, category: "base", status: "active" },
      include: {
        entityType: { select: { slug: true, name: true, icon: true, color: true } },
        propertyValues: {
          include: { property: { select: { slug: true, name: true, dataType: true } } },
        },
      },
      orderBy: { displayName: "asc" },
    }),
    prisma.entity.findMany({
      where: { primaryDomainId: id, category: "internal", status: "active" },
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
        relationshipType: { slug: "domain-member" },
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
  ]);

  return NextResponse.json({
    id: dept.id,
    displayName: dept.displayName,
    description: dept.description,
    category: dept.category,
    mapX: dept.mapX,
    mapY: dept.mapY,
    entityType: dept.entityType,
    primaryDomainId: dept.primaryDomainId,
    createdAt: dept.createdAt,
    members,
    documents,
    digitalEntities: digitalEntities.map((r) => r.fromEntity),
    memberCount: members.length,
    documentCount: documents.length,
    digitalCount: digitalEntities.length,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = await params;

  const patchVisibleDepts = await getVisibleDomainIds(operatorId, user.id);
  if (patchVisibleDepts !== "all" && !patchVisibleDepts.includes(id)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = parseBody(updateDepartmentSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const dept = await prisma.entity.findFirst({
    where: { id, operatorId, category: "foundational", status: "active" },
  });
  if (!dept) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.displayName !== undefined) data.displayName = parsed.data.displayName;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.mapX !== undefined) data.mapX = parsed.data.mapX;
  if (parsed.data.mapY !== undefined) data.mapY = parsed.data.mapY;

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
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  if (user.role === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { id } = await params;

  const delVisibleDepts = await getVisibleDomainIds(operatorId, user.id);
  if (delVisibleDepts !== "all" && !delVisibleDepts.includes(id)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const dept = await prisma.entity.findFirst({
    where: { id, operatorId, category: "foundational", status: "active" },
    include: { entityType: { select: { slug: true } } },
  });
  if (!dept) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  // Guard: cannot delete CompanyHQ
  if (dept.entityType.slug === "organization") {
    return NextResponse.json(
      { error: "Cannot delete the company headquarters" },
      { status: 403 },
    );
  }

  // Orphan children, then delete
  await prisma.entity.updateMany({
    where: { primaryDomainId: id },
    data: { primaryDomainId: null },
  });

  await prisma.entity.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
