import { prisma } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────────────────────

type EntityTypeInput = {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
};

export type PropertyInput = {
  name: string;
  slug: string;
  dataType?: string;
  required?: boolean;
  filterable?: boolean;
  displayOrder?: number;
  enumValues?: string[];
  identityRole?: string;
};

export type EntityInput = {
  entityTypeId: string;
  displayName: string;
  sourceSystem?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
  properties?: Record<string, string>;
  category?: string;
  parentDepartmentId?: string;
  description?: string;
  mapX?: number;
  mapY?: number;
};

export type RelationshipTypeInput = {
  name: string;
  slug: string;
  fromEntityTypeId: string;
  toEntityTypeId: string;
  description?: string;
};

export type EntityFilters = {
  typeSlug?: string;
  typeId?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
  scopeFilter?: Record<string, unknown>;
};

// ── Entity Types ─────────────────────────────────────────────────────────────

export async function listEntityTypes(operatorId: string) {
  return prisma.entityType.findMany({
    where: { operatorId },
    include: {
      properties: { orderBy: { displayOrder: "asc" } },
      _count: { select: { entities: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getEntityType(operatorId: string, idOrSlug: string) {
  return prisma.entityType.findFirst({
    where: {
      operatorId,
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
    include: {
      properties: { orderBy: { displayOrder: "asc" } },
      _count: { select: { entities: true } },
    },
  });
}

export async function createEntityType(operatorId: string, input: EntityTypeInput) {
  return prisma.entityType.create({
    data: {
      operatorId,
      name: input.name,
      slug: input.slug,
      description: input.description ?? "",
      icon: input.icon ?? "box",
      color: input.color ?? "#a855f7",
    },
    include: { properties: true },
  });
}

export async function createEntityTypeWithProperties(
  operatorId: string,
  input: EntityTypeInput,
  properties: PropertyInput[],
) {
  return prisma.entityType.create({
    data: {
      operatorId,
      name: input.name,
      slug: input.slug,
      description: input.description ?? "",
      icon: input.icon ?? "box",
      color: input.color ?? "#a855f7",
      properties: {
        create: properties.map((p, i) => ({
          name: p.name,
          slug: p.slug,
          dataType: p.dataType ?? "STRING",
          required: p.required ?? false,
          filterable: p.filterable ?? true,
          displayOrder: p.displayOrder ?? i,
          enumValues: p.enumValues ? JSON.stringify(p.enumValues) : null,
          identityRole: p.identityRole ?? null,
        })),
      },
    },
    include: { properties: { orderBy: { displayOrder: "asc" } } },
  });
}

export async function updateEntityType(
  operatorId: string,
  entityTypeId: string,
  fields: Partial<EntityTypeInput>,
) {
  const existing = await prisma.entityType.findFirst({
    where: { id: entityTypeId, operatorId },
  });
  if (!existing) return null;

  return prisma.entityType.update({
    where: { id: entityTypeId },
    data: {
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.slug !== undefined && { slug: fields.slug }),
      ...(fields.description !== undefined && { description: fields.description ?? "" }),
      ...(fields.icon !== undefined && { icon: fields.icon ?? "box" }),
      ...(fields.color !== undefined && { color: fields.color ?? "#a855f7" }),
    },
    include: {
      properties: { orderBy: { displayOrder: "asc" } },
      _count: { select: { entities: true } },
    },
  });
}

export async function deleteEntityType(operatorId: string, entityTypeId: string) {
  const existing = await prisma.entityType.findFirst({
    where: { id: entityTypeId, operatorId },
  });
  if (!existing) return false;
  await prisma.entityType.delete({ where: { id: entityTypeId } });
  return true;
}

// ── Entity Properties (schema definitions) ───────────────────────────────────

export async function addProperty(entityTypeId: string, input: PropertyInput) {
  return prisma.entityProperty.create({
    data: {
      entityTypeId,
      name: input.name,
      slug: input.slug,
      dataType: input.dataType ?? "STRING",
      required: input.required ?? false,
      filterable: input.filterable ?? true,
      displayOrder: input.displayOrder ?? 0,
      enumValues: input.enumValues ? JSON.stringify(input.enumValues) : null,
      identityRole: input.identityRole ?? null,
    },
  });
}

export async function updateProperty(
  entityTypeId: string,
  propertyId: string,
  fields: Partial<PropertyInput>,
) {
  const existing = await prisma.entityProperty.findFirst({
    where: { id: propertyId, entityTypeId },
  });
  if (!existing) return null;

  return prisma.entityProperty.update({
    where: { id: propertyId },
    data: {
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.slug !== undefined && { slug: fields.slug }),
      ...(fields.dataType !== undefined && { dataType: fields.dataType }),
      ...(fields.required !== undefined && { required: fields.required }),
      ...(fields.filterable !== undefined && { filterable: fields.filterable }),
      ...(fields.displayOrder !== undefined && { displayOrder: fields.displayOrder }),
      ...(fields.enumValues !== undefined && {
        enumValues: fields.enumValues ? JSON.stringify(fields.enumValues) : null,
      }),
      ...(fields.identityRole !== undefined && { identityRole: fields.identityRole ?? null }),
    },
  });
}

export async function deleteProperty(entityTypeId: string, propertyId: string) {
  const existing = await prisma.entityProperty.findFirst({
    where: { id: propertyId, entityTypeId },
  });
  if (!existing) return false;
  await prisma.entityProperty.delete({ where: { id: propertyId } });
  return true;
}

// ── Entities ─────────────────────────────────────────────────────────────────

export async function listEntities(operatorId: string, filters: EntityFilters = {}) {
  const { typeSlug, typeId, status, search, limit = 50, offset = 0, scopeFilter } = filters;

  // SQLite: no mode: "insensitive", use contains which SQLite handles case-insensitively
  const where: Record<string, unknown> = {
    operatorId,
    status: status ?? "active",
    ...scopeFilter,
  };

  if (typeId) {
    where.entityTypeId = typeId;
  } else if (typeSlug) {
    where.entityType = { slug: typeSlug };
  }

  if (search) {
    where.displayName = { contains: search };
  }

  const [entities, total] = await Promise.all([
    prisma.entity.findMany({
      where,
      include: {
        entityType: { select: { id: true, name: true, slug: true, icon: true, color: true } },
        propertyValues: {
          include: { property: { select: { id: true, name: true, slug: true, dataType: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: Math.min(limit, 100),
      skip: offset,
    }),
    prisma.entity.count({ where }),
  ]);

  return { entities, total };
}

export async function getEntity(operatorId: string, entityId: string) {
  return prisma.entity.findFirst({
    where: { id: entityId, operatorId },
    include: {
      entityType: {
        include: { properties: { orderBy: { displayOrder: "asc" } } },
      },
      propertyValues: {
        include: { property: true },
      },
      fromRelations: {
        include: {
          relationshipType: { select: { id: true, name: true, slug: true } },
          toEntity: {
            select: {
              id: true,
              displayName: true,
              status: true,
              entityType: { select: { id: true, name: true, slug: true, icon: true, color: true } },
            },
          },
        },
      },
      toRelations: {
        include: {
          relationshipType: { select: { id: true, name: true, slug: true } },
          fromEntity: {
            select: {
              id: true,
              displayName: true,
              status: true,
              entityType: { select: { id: true, name: true, slug: true, icon: true, color: true } },
            },
          },
        },
      },
    },
  });
}

export async function createEntity(operatorId: string, input: EntityInput) {
  const entityId = await prisma.$transaction(async (tx) => {
    const entityType = await tx.entityType.findUnique({
      where: { id: input.entityTypeId },
      select: { defaultCategory: true },
    });

    const entity = await tx.entity.create({
      data: {
        operatorId,
        entityTypeId: input.entityTypeId,
        displayName: input.displayName,
        sourceSystem: input.sourceSystem ?? null,
        externalId: input.externalId ?? null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        category: input.category ?? entityType?.defaultCategory ?? "digital",
        parentDepartmentId: input.parentDepartmentId ?? null,
        description: input.description ?? null,
        mapX: input.mapX ?? null,
        mapY: input.mapY ?? null,
      },
    });

    if (input.properties) {
      const props = await tx.entityProperty.findMany({
        where: { entityTypeId: input.entityTypeId },
      });
      const slugToId = new Map(props.map((p) => [p.slug, p.id]));

      // SQLite: createMany not supported, use sequential creates
      for (const [slug, value] of Object.entries(input.properties)) {
        const propertyId = slugToId.get(slug);
        if (propertyId) {
          await tx.propertyValue.create({
            data: { entityId: entity.id, propertyId, value: String(value) },
          });
        }
      }
    }

    return entity.id;
  });

  return getEntity(operatorId, entityId);
}

export async function updateEntity(
  operatorId: string,
  entityId: string,
  fields: {
    displayName?: string;
    status?: string;
    metadata?: Record<string, unknown>;
    properties?: Record<string, string>;
    category?: string;
    parentDepartmentId?: string;
    description?: string;
    mapX?: number;
    mapY?: number;
  },
) {
  const existing = await prisma.entity.findFirst({
    where: { id: entityId, operatorId },
  });
  if (!existing) return null;

  await prisma.$transaction(async (tx) => {
    await tx.entity.update({
      where: { id: entityId },
      data: {
        ...(fields.displayName !== undefined && { displayName: fields.displayName }),
        ...(fields.status !== undefined && { status: fields.status }),
        ...(fields.metadata !== undefined && { metadata: JSON.stringify(fields.metadata) }),
        ...(fields.category !== undefined && { category: fields.category }),
        ...(fields.parentDepartmentId !== undefined && { parentDepartmentId: fields.parentDepartmentId }),
        ...(fields.description !== undefined && { description: fields.description }),
        ...(fields.mapX !== undefined && { mapX: fields.mapX }),
        ...(fields.mapY !== undefined && { mapY: fields.mapY }),
      },
    });

    if (fields.properties) {
      const props = await tx.entityProperty.findMany({
        where: { entityTypeId: existing.entityTypeId },
      });
      const slugToId = new Map(props.map((p) => [p.slug, p.id]));

      for (const [slug, value] of Object.entries(fields.properties)) {
        const propertyId = slugToId.get(slug);
        if (!propertyId) continue;
        await tx.propertyValue.upsert({
          where: { entityId_propertyId: { entityId, propertyId } },
          create: { entityId, propertyId, value: String(value) },
          update: { value: String(value) },
        });
      }
    }
  });

  return getEntity(operatorId, entityId);
}

export async function deleteEntity(operatorId: string, entityId: string) {
  const existing = await prisma.entity.findFirst({
    where: { id: entityId, operatorId },
  });
  if (!existing) return false;
  await prisma.entity.delete({ where: { id: entityId } });
  return true;
}

// ── Relationships ────────────────────────────────────────────────────────────

export async function listRelationshipTypes(operatorId: string) {
  return prisma.relationshipType.findMany({
    where: { operatorId },
    include: {
      fromType: { select: { id: true, name: true, slug: true } },
      toType: { select: { id: true, name: true, slug: true } },
      _count: { select: { relationships: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function createRelationshipType(operatorId: string, input: RelationshipTypeInput) {
  return prisma.relationshipType.create({
    data: {
      operatorId,
      name: input.name,
      slug: input.slug,
      fromEntityTypeId: input.fromEntityTypeId,
      toEntityTypeId: input.toEntityTypeId,
      description: input.description ?? "",
    },
  });
}

export async function getEntityRelationships(operatorId: string, entityId: string) {
  const entity = await prisma.entity.findFirst({
    where: { id: entityId, operatorId },
  });
  if (!entity) return null;

  const [outgoing, incoming] = await Promise.all([
    prisma.relationship.findMany({
      where: { fromEntityId: entityId },
      include: {
        relationshipType: { select: { id: true, name: true, slug: true } },
        toEntity: {
          select: {
            id: true, displayName: true, status: true,
            entityType: { select: { id: true, name: true, slug: true, icon: true, color: true } },
          },
        },
      },
    }),
    prisma.relationship.findMany({
      where: { toEntityId: entityId },
      include: {
        relationshipType: { select: { id: true, name: true, slug: true } },
        fromEntity: {
          select: {
            id: true, displayName: true, status: true,
            entityType: { select: { id: true, name: true, slug: true, icon: true, color: true } },
          },
        },
      },
    }),
  ]);

  return { outgoing, incoming };
}

export async function createRelationship(
  operatorId: string,
  input: {
    relationshipTypeId: string;
    fromEntityId: string;
    toEntityId: string;
    metadata?: Record<string, unknown>;
  },
) {
  const [from, to] = await Promise.all([
    prisma.entity.findFirst({ where: { id: input.fromEntityId, operatorId } }),
    prisma.entity.findFirst({ where: { id: input.toEntityId, operatorId } }),
  ]);
  if (!from || !to) return null;

  return prisma.relationship.upsert({
    where: {
      relationshipTypeId_fromEntityId_toEntityId: {
        relationshipTypeId: input.relationshipTypeId,
        fromEntityId: input.fromEntityId,
        toEntityId: input.toEntityId,
      },
    },
    create: {
      relationshipTypeId: input.relationshipTypeId,
      fromEntityId: input.fromEntityId,
      toEntityId: input.toEntityId,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
    update: {
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
    include: {
      relationshipType: { select: { id: true, name: true, slug: true } },
      fromEntity: { select: { id: true, displayName: true } },
      toEntity: { select: { id: true, displayName: true } },
    },
  });
}

export async function deleteRelationship(operatorId: string, relationshipId: string) {
  const rel = await prisma.relationship.findFirst({
    where: { id: relationshipId },
    include: { fromEntity: { select: { operatorId: true } } },
  });
  if (!rel || rel.fromEntity.operatorId !== operatorId) return false;
  await prisma.relationship.delete({ where: { id: relationshipId } });
  return true;
}

// ── Graph Data ──────────────────────────────────────────────────────────────

export async function getGraphData(operatorId: string) {
  const [entities, relationships] = await Promise.all([
    prisma.entity.findMany({
      where: { operatorId, status: "active" },
      include: {
        entityType: { select: { name: true, slug: true, icon: true, color: true } },
        propertyValues: {
          include: { property: { select: { slug: true } } },
        },
      },
    }),
    prisma.relationship.findMany({
      where: { fromEntity: { operatorId } },
      include: {
        relationshipType: { select: { name: true, slug: true } },
      },
    }),
  ]);

  const nodes = entities.map((e) => ({
    id: e.id,
    displayName: e.displayName,
    entityType: e.entityType.name,
    typeSlug: e.entityType.slug,
    icon: e.entityType.icon,
    color: e.entityType.color,
    properties: Object.fromEntries(
      e.propertyValues.map((pv) => [pv.property.slug, pv.value]),
    ),
  }));

  const edges = relationships.map((r) => ({
    id: r.id,
    source: r.fromEntityId,
    target: r.toEntityId,
    label: r.relationshipType.name,
    typeSlug: r.relationshipType.slug,
  }));

  return { nodes, edges };
}

// ── Counts for dashboard ────────────────────────────────────────────────────

export async function getEntityCounts(operatorId: string) {
  const [totalEntities, totalTypes, totalRelationships] = await Promise.all([
    prisma.entity.count({ where: { operatorId, status: "active" } }),
    prisma.entityType.count({ where: { operatorId } }),
    prisma.relationship.count({ where: { fromEntity: { operatorId } } }),
  ]);
  return { totalEntities, totalTypes, totalRelationships };
}
