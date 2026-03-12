import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";
import { HARDCODED_TYPE_DEFS } from "@/lib/hardcoded-type-defs";
import { CATEGORY_PRIORITY } from "@/lib/hardcoded-type-defs";
import { createMemberSchema, parseBody } from "@/lib/api-validation";

const MEMBER_INCLUDE = {
  entityType: { select: { slug: true, name: true, icon: true, color: true } },
  propertyValues: {
    include: { property: { select: { slug: true, name: true, dataType: true } } },
  },
} as const;

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

  // Validate parent department
  const dept = await prisma.entity.findFirst({
    where: { id, operatorId, category: "foundational", status: "active" },
  });
  if (!dept) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  // Home members (parentDepartmentId = this department)
  const homeMembers = await prisma.entity.findMany({
    where: { operatorId, parentDepartmentId: id, category: "base", status: "active" },
    include: MEMBER_INCLUDE,
    orderBy: { displayName: "asc" },
  });

  // Cross-department members linked via department-member relationship
  const deptMemberRels = await prisma.relationship.findMany({
    where: {
      OR: [
        { toEntityId: id, relationshipType: { slug: "department-member" }, fromEntity: { category: "base", status: "active" } },
        { fromEntityId: id, relationshipType: { slug: "department-member" }, toEntity: { category: "base", status: "active" } },
      ],
    },
    select: { id: true, fromEntityId: true, toEntityId: true, metadata: true },
  });

  const crossMemberIds = deptMemberRels.map(r => r.fromEntityId === id ? r.toEntityId : r.fromEntityId);
  const homeMemberIds = new Set(homeMembers.map(m => m.id));
  const uniqueCrossIds = crossMemberIds.filter(mid => !homeMemberIds.has(mid));

  let crossMembers: Array<Record<string, unknown>> = [];
  if (uniqueCrossIds.length > 0) {
    const crossEntities = await prisma.entity.findMany({
      where: { id: { in: uniqueCrossIds }, operatorId, status: "active" },
      include: {
        ...MEMBER_INCLUDE,
        parentDepartment: { select: { id: true, displayName: true } },
      },
      orderBy: { displayName: "asc" },
    });

    crossMembers = crossEntities.map(entity => {
      const rel = deptMemberRels.find(r =>
        r.fromEntityId === entity.id || r.toEntityId === entity.id
      );
      const meta = rel?.metadata ? JSON.parse(rel.metadata) : {};
      return {
        ...entity,
        crossDepartment: true,
        homeDepartment: entity.parentDepartment?.displayName ?? null,
        homeDepartmentId: entity.parentDepartment?.id ?? null,
        departmentRole: meta.role ?? null,
        relationshipId: rel?.id ?? null,
      };
    });
  }

  return NextResponse.json([...homeMembers, ...crossMembers]);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = await params;
  const _visibleDepts2 = await getVisibleDepartmentIds(operatorId, user.id);
  if (_visibleDepts2 !== "all" && !_visibleDepts2.includes(id)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = parseBody(createMemberSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { name, role, email } = parsed.data;

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
      include: {
        entity: {
          include: { parentDepartment: { select: { id: true, displayName: true } } },
        },
      },
    });

    if (existingPV) {
      const existing = existingPV.entity;

      // Already in THIS department (actual duplicate)
      if (existing.parentDepartmentId === id) {
        return NextResponse.json(
          { error: "This person already belongs to this department" },
          { status: 409 },
        );
      }

      // Check if already linked to this dept via department-member relationship
      if (existing.parentDepartmentId && existing.parentDepartmentId !== id) {
        const existingRel = await prisma.relationship.findFirst({
          where: {
            relationshipType: { slug: "department-member", operatorId },
            OR: [
              { fromEntityId: existing.id, toEntityId: id },
              { fromEntityId: id, toEntityId: existing.id },
            ],
          },
        });
        if (existingRel) {
          return NextResponse.json(
            { error: "This person is already a member of this department" },
            { status: 409 },
          );
        }

        // Create cross-department membership via department-member relationship
        // Ensure department-member relationship type exists
        let relType = await prisma.relationshipType.findFirst({
          where: { operatorId, slug: "department-member" },
        });
        if (!relType) {
          // Need department entity type for from/to
          const deptType = await prisma.entityType.findFirst({ where: { operatorId, slug: "department" } });
          relType = await prisma.relationshipType.create({
            data: {
              operatorId,
              name: "Department Member",
              slug: "department-member",
              fromEntityTypeId: tmType.id,
              toEntityTypeId: deptType?.id ?? tmType.id,
              description: "Links a person to a department they belong to",
            },
          });
        }

        await prisma.relationship.create({
          data: {
            relationshipTypeId: relType.id,
            fromEntityId: existing.id,
            toEntityId: id,
            metadata: JSON.stringify({ role: role.trim() }),
          },
        });

        // Return existing entity with cross-department info
        const result = await prisma.entity.findUnique({
          where: { id: existing.id },
          include: MEMBER_INCLUDE,
        });

        return NextResponse.json({
          ...result,
          crossDepartment: true,
          homeDepartment: existing.parentDepartment?.displayName ?? null,
          homeDepartmentId: existing.parentDepartmentId,
          departmentRole: role.trim(),
        }, { status: 201 });
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
        include: MEMBER_INCLUDE,
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
    include: MEMBER_INCLUDE,
  });

  return NextResponse.json(result, { status: 201 });
}
