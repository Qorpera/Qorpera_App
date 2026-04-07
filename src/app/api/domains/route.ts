import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { HARDCODED_TYPE_DEFS } from "@/lib/hardcoded-type-defs";
import { getVisibleDomainIds } from "@/lib/domain-scope";
import { createDomainSchema, parseBody } from "@/lib/api-validation";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const visibleDomains = await getVisibleDomainIds(operatorId, user.id);

  const departments = await prisma.entity.findMany({
    where: {
      operatorId,
      category: "foundational",
      status: "active",
      entityType: { slug: { in: ["domain", "organization"] } },
      ...(visibleDomains !== "all" ? {
        OR: [
          { id: { in: visibleDomains } },
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
      const [memberCount, documentCount, digitalCount, filledSlotDocs] = await Promise.all([
        prisma.entity.count({
          where: { primaryDomainId: dept.id, category: "base", status: "active" },
        }),
        prisma.entity.count({
          where: { primaryDomainId: dept.id, category: "internal", status: "active" },
        }),
        prisma.relationship.count({
          where: {
            toEntityId: dept.id,
            relationshipType: { slug: "domain-member" },
          },
        }),
        prisma.internalDocument.findMany({
          where: {
            domainId: dept.id,
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
        primaryDomainId: dept.primaryDomainId,
        createdAt: dept.createdAt,
        memberCount,
        documentCount,
        digitalCount,
        filledSlots,
      };
    }),
  );

  return NextResponse.json(results);
}

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  if (user.role === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = parseBody(createDomainSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { name, description, mapX, mapY } = parsed.data;

  // Ensure department entity type exists
  let deptType = await prisma.entityType.findFirst({
    where: { operatorId, slug: "domain" },
  });
  if (!deptType) {
    const def = HARDCODED_TYPE_DEFS["domain"];
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
      displayName: name,
      category: "foundational",
      description,
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
    primaryDomainId: entity.primaryDomainId,
    createdAt: entity.createdAt,
    memberCount: 0,
    documentCount: 0,
    digitalCount: 0,
    filledSlots: [],
  }, { status: 201 });
}
