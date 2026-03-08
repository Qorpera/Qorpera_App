import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HARDCODED_TYPE_DEFS } from "@/lib/hardcoded-type-defs";
import { CATEGORY_PRIORITY } from "@/lib/hardcoded-type-defs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const operatorId = await getOperatorId();
  const { id } = await params;

  // Validate parent department
  const dept = await prisma.entity.findFirst({
    where: { id, operatorId, category: "foundational", status: "active" },
  });
  if (!dept) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  const members = await prisma.entity.findMany({
    where: { parentDepartmentId: id, category: "base", status: "active" },
    include: {
      entityType: { select: { slug: true, name: true, icon: true, color: true } },
      propertyValues: {
        include: { property: { select: { slug: true, name: true, dataType: true } } },
      },
    },
    orderBy: { displayName: "asc" },
  });

  return NextResponse.json(members);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const operatorId = await getOperatorId();
  const { id } = await params;
  const body = await req.json();
  const { name, role, email } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!role || typeof role !== "string" || !role.trim()) {
    return NextResponse.json({ error: "role is required" }, { status: 400 });
  }
  if (!email || typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  // Validate parent department
  const dept = await prisma.entity.findFirst({
    where: { id, operatorId, category: "foundational", status: "active" },
  });
  if (!dept) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  // Ensure team-member entity type
  let tmType = await prisma.entityType.findFirst({
    where: { operatorId, slug: "team-member" },
    include: { properties: { select: { id: true, slug: true } } },
  });
  if (!tmType) {
    const def = HARDCODED_TYPE_DEFS["team-member"];
    tmType = await prisma.entityType.create({
      data: {
        operatorId,
        slug: def.slug,
        name: def.name,
        description: def.description,
        icon: def.icon,
        color: def.color,
        defaultCategory: def.defaultCategory,
        properties: {
          create: def.properties.map((p, i) => ({
            slug: p.slug,
            name: p.name,
            dataType: p.dataType,
            identityRole: p.identityRole ?? null,
            displayOrder: i,
          })),
        },
      },
      include: { properties: { select: { id: true, slug: true } } },
    });
  }

  // Check for existing entity with same email via identity resolution
  const emailNorm = email.trim().toLowerCase();
  const emailProp = tmType.properties.find((p) => p.slug === "email");

  if (emailProp) {
    const existingPV = await prisma.propertyValue.findFirst({
      where: {
        propertyId: emailProp.id,
        value: emailNorm,
        entity: { operatorId, status: "active" },
      },
      include: { entity: { select: { id: true, parentDepartmentId: true, category: true } } },
    });

    if (existingPV) {
      const existing = existingPV.entity;

      // Already in a different department
      if (existing.parentDepartmentId && existing.parentDepartmentId !== id) {
        return NextResponse.json(
          { error: "This person already belongs to another department" },
          { status: 409 },
        );
      }

      // Existing entity, no department — assign to this one
      const updateData: Record<string, unknown> = { parentDepartmentId: id };
      const existingPriority = CATEGORY_PRIORITY[existing.category] ?? 0;
      const basePriority = CATEGORY_PRIORITY["base"] ?? 0;
      if (basePriority > existingPriority) {
        updateData.category = "base";
      }

      const updated = await prisma.entity.update({
        where: { id: existing.id },
        data: updateData,
        include: {
          entityType: { select: { slug: true, name: true, icon: true, color: true } },
          propertyValues: {
            include: { property: { select: { slug: true, name: true, dataType: true } } },
          },
        },
      });

      return NextResponse.json(updated);
    }
  }

  // Create new team member
  const slugToId = new Map(tmType.properties.map((p) => [p.slug, p.id]));

  const entity = await prisma.entity.create({
    data: {
      operatorId,
      entityTypeId: tmType.id,
      displayName: name.trim(),
      category: "base",
      parentDepartmentId: id,
    },
  });

  // Create properties
  const propsToCreate: Array<{ slug: string; value: string }> = [
    { slug: "email", value: emailNorm },
    { slug: "role", value: role.trim() },
  ];
  for (const { slug, value } of propsToCreate) {
    const propId = slugToId.get(slug);
    if (propId) {
      await prisma.propertyValue.create({
        data: { entityId: entity.id, propertyId: propId, value },
      });
    }
  }

  const result = await prisma.entity.findUnique({
    where: { id: entity.id },
    include: {
      entityType: { select: { slug: true, name: true, icon: true, color: true } },
      propertyValues: {
        include: { property: { select: { slug: true, name: true, dataType: true } } },
      },
    },
  });

  return NextResponse.json(result, { status: 201 });
}
