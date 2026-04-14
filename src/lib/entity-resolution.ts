import { prisma } from "@/lib/db";
import { CATEGORY_PRIORITY } from "@/lib/hardcoded-type-defs";

// ── Types ────────────────────────────────────────────────────────────────────

type EntityHints = {
  displayName?: string;
  sourceSystem?: string;
  externalId?: string;
  identityValues?: Record<string, string>;
};

export type EntityInput = {
  displayName: string;
  sourceSystem?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
  properties?: Record<string, string>;
};

export type ExternalRef = {
  sourceSystem: string;
  externalId: string;
};

type EntityContext = {
  id: string;
  displayName: string;
  typeName: string;
  typeSlug: string;
  status: string;
  sourceSystem: string | null;
  externalId: string | null;
  properties: Record<string, string>;
  relationships: {
    direction: "from" | "to";
    relationshipType: string;
    entityName: string;
    entityId: string;
  }[];
  recentMentions: {
    sourceType: string;
    sourceId: string;
    snippet: string | null;
    createdAt: Date;
  }[];
};

type EntitySearchResult = {
  id: string;
  displayName: string;
  typeName: string;
  typeSlug: string;
  status: string;
  properties: Record<string, string>;
};

// ── Identity Property Cache ──────────────────────────────────────────────────

type IdentityPropEntry = { propertyId: string; entityTypeId: string; identityRole: string };
type CacheEntry = { props: IdentityPropEntry[]; expiresAt: number };

const identityPropCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getIdentityProperties(operatorId: string): Promise<IdentityPropEntry[]> {
  const now = Date.now();
  const cached = identityPropCache.get(operatorId);
  if (cached && cached.expiresAt > now) return cached.props;

  const props = await prisma.entityProperty.findMany({
    where: {
      entityType: { operatorId },
      identityRole: { not: null },
    },
    select: { id: true, entityTypeId: true, identityRole: true },
  });

  const entries = props.map((p) => ({
    propertyId: p.id,
    entityTypeId: p.entityTypeId,
    identityRole: p.identityRole!,
  }));

  identityPropCache.set(operatorId, { props: entries, expiresAt: now + CACHE_TTL_MS });
  return entries;
}

// ── Property Validation ──────────────────────────────────────────────────────

async function validateInputProperties(
  operatorId: string,
  typeSlug: string,
  properties: Record<string, string>,
): Promise<Record<string, string>> {
  const entityType = await prisma.entityType.findFirst({
    where: { operatorId, slug: typeSlug },
    select: { id: true },
  });
  if (!entityType) return properties;

  const schemaDefs = await prisma.entityProperty.findMany({
    where: { entityTypeId: entityType.id },
    select: { slug: true, dataType: true, enumValues: true, required: true },
  });
  const schemaMap = new Map(schemaDefs.map((d) => [d.slug, d]));

  const validated: Record<string, string> = {};
  for (const [slug, value] of Object.entries(properties)) {
    const def = schemaMap.get(slug);
    if (!def) continue;
    const parsedEnumValues = def.enumValues ? JSON.parse(def.enumValues) as string[] : undefined;
    const error = validatePropertyValue(value, def.dataType, parsedEnumValues);
    if (error) {
      console.warn(`[entity-resolution] Dropping invalid property "${slug}": ${error}`);
      continue;
    }
    validated[slug] = value;
  }

  return validated;
}

// ── Resolution — 4-step cascade ──────────────────────────────────────────────

export async function resolveEntity(
  operatorId: string,
  hints: EntityHints,
): Promise<string | null> {
  // 1. ExternalRef
  if (hints.sourceSystem && hints.externalId) {
    const entity = await prisma.entity.findFirst({
      where: {
        operatorId,
        sourceSystem: hints.sourceSystem,
        externalId: hints.externalId,
        mergedIntoId: null,
        status: "active",
      },
      select: { id: true },
    });
    if (entity) return entity.id;
  }

  // 2-3. Identity-role based resolution
  if (hints.identityValues) {
    const identityProps = await getIdentityProperties(operatorId);

    for (const role of ["email", "domain", "phone"] as const) {
      const value = hints.identityValues[role];
      if (!value) continue;

      const normalizedValue = value.toLowerCase().trim();
      const propsForRole = identityProps.filter((p) => p.identityRole === role);
      if (propsForRole.length === 0) continue;

      const match = await prisma.propertyValue.findFirst({
        where: {
          propertyId: { in: propsForRole.map((p) => p.propertyId) },
          value: normalizedValue,
          entity: { operatorId, mergedIntoId: null, status: "active" },
        },
        select: { entityId: true },
      });
      if (match) return match.entityId;
    }
  }

  // 4. DisplayName — SQLite: contains is case-insensitive by default
  if (hints.displayName) {
    const matches = await prisma.entity.findMany({
      where: {
        operatorId,
        displayName: { contains: hints.displayName },
        mergedIntoId: null,
        status: "active",
      },
      select: { id: true },
      take: 2,
    });
    if (matches.length === 1) return matches[0].id;
  }

  return null;
}

// ── Upsert ───────────────────────────────────────────────────────────────────

export async function upsertEntity(
  operatorId: string,
  typeSlug: string,
  input: EntityInput,
  externalRef?: ExternalRef,
): Promise<string> {
  const identityValues: Record<string, string> = {};
  if (input.properties) {
    const entityType = await prisma.entityType.findFirst({
      where: { operatorId, slug: typeSlug },
      select: { id: true },
    });
    if (entityType) {
      const propsForType = await prisma.entityProperty.findMany({
        where: { entityTypeId: entityType.id, identityRole: { not: null } },
        select: { slug: true, identityRole: true },
      });
      for (const p of propsForType) {
        const val = input.properties[p.slug];
        if (val && p.identityRole) {
          identityValues[p.identityRole] = val;
        }
      }
    }
  }

  const hints: EntityHints = {
    displayName: input.displayName,
    sourceSystem: externalRef?.sourceSystem ?? input.sourceSystem,
    externalId: externalRef?.externalId ?? input.externalId,
    identityValues: Object.keys(identityValues).length > 0 ? identityValues : undefined,
  };

  const existingId = await resolveEntity(operatorId, hints);
  const validatedProperties = input.properties
    ? await validateInputProperties(operatorId, typeSlug, input.properties)
    : undefined;

  if (existingId) {
    // Fetch existing entity state in a single query
    const existingEntity = await prisma.entity.findUnique({
      where: { id: existingId },
      select: { category: true, entityTypeId: true, sourceSystem: true },
    });

    if (existingEntity) {
      // Update properties (additive merge)
      if (validatedProperties && Object.keys(validatedProperties).length > 0) {
        const props = await prisma.entityProperty.findMany({
          where: { entityTypeId: existingEntity.entityTypeId },
        });
        const slugToId = new Map(props.map((p) => [p.slug, p.id]));

        for (const [slug, value] of Object.entries(validatedProperties)) {
          const propertyId = slugToId.get(slug);
          if (!propertyId) continue;
          await prisma.propertyValue.upsert({
            where: { entityId_propertyId: { entityId: existingId, propertyId } },
            create: { entityId: existingId, propertyId, value: String(value) },
            update: { value: String(value) },
          });
        }
      }

      // Category merge: keep higher priority
      const incomingType = await prisma.entityType.findFirst({
        where: { operatorId, slug: typeSlug },
        select: { defaultCategory: true },
      });
      const incomingCategory = incomingType?.defaultCategory ?? "digital";
      const existingPriority = CATEGORY_PRIORITY[existingEntity.category] ?? 0;
      const incomingPriority = CATEGORY_PRIORITY[incomingCategory] ?? 0;

      if (incomingPriority > existingPriority) {
        await prisma.entity.update({
          where: { id: existingId },
          data: { category: incomingCategory },
        });
        console.log(
          `[entity-resolution] Category upgrade: entity ${existingId} from "${existingEntity.category}" to "${incomingCategory}"`
        );
      }

      // Update sourceSystem if not set
      if (!existingEntity.sourceSystem && externalRef) {
        await prisma.entity.update({
          where: { id: existingId },
          data: { sourceSystem: externalRef.sourceSystem, externalId: externalRef.externalId },
        });
      }
    }

    return existingId;
  }

  // Create new entity
  const entityType = await prisma.entityType.findFirst({
    where: { operatorId, slug: typeSlug },
    select: { id: true },
  });
  if (!entityType) throw new Error(`Entity type "${typeSlug}" not found`);

  const created = await prisma.$transaction(async (tx) => {
    const et = await tx.entityType.findUnique({
      where: { id: entityType.id },
      select: { defaultCategory: true },
    });

    const entity = await tx.entity.create({
      data: {
        operatorId,
        entityTypeId: entityType.id,
        displayName: input.displayName,
        sourceSystem: externalRef?.sourceSystem ?? input.sourceSystem ?? null,
        externalId: externalRef?.externalId ?? input.externalId ?? null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        category: et?.defaultCategory ?? "digital",
      },
    });

    if (validatedProperties && Object.keys(validatedProperties).length > 0) {
      const props = await tx.entityProperty.findMany({
        where: { entityTypeId: entityType.id },
      });
      const slugToId = new Map(props.map((p) => [p.slug, p.id]));
      for (const [slug, value] of Object.entries(validatedProperties)) {
        const propId = slugToId.get(slug);
        if (propId && value) {
          await tx.propertyValue.create({
            data: { entityId: entity.id, propertyId: propId, value },
          });
        }
      }
    }

    return entity;
  });

  return created.id;
}

// ── Entity Context ───────────────────────────────────────────────────────────

export async function getEntityContext(
  operatorId: string,
  entityIdOrName: string,
  typeSlug?: string,
): Promise<EntityContext | null> {
  const includeBlock = {
    entityType: { select: { name: true, slug: true } },
    propertyValues: { include: { property: { select: { slug: true, name: true } } } },
    fromRelations: {
      include: {
        relationshipType: { select: { name: true } },
        toEntity: { select: { id: true, displayName: true } },
      },
    },
    toRelations: {
      include: {
        relationshipType: { select: { name: true } },
        fromEntity: { select: { id: true, displayName: true } },
      },
    },
    mentions: {
      orderBy: { createdAt: "desc" as const },
      take: 10,
      select: { sourceType: true, sourceId: true, snippet: true, createdAt: true },
    },
  };

  const typeFilter = typeSlug ? { entityType: { slug: typeSlug } } : {};

  let entity = await prisma.entity.findFirst({
    where: { id: entityIdOrName, operatorId, ...typeFilter },
    include: includeBlock,
  });

  if (!entity) {
    entity = await prisma.entity.findFirst({
      where: {
        operatorId,
        displayName: { contains: entityIdOrName },
        mergedIntoId: null,
        status: "active",
        ...typeFilter,
      },
      include: includeBlock,
    });
  }

  if (!entity) return null;

  let resolved = entity;
  for (let i = 0; i < 3 && resolved.mergedIntoId; i++) {
    const merged = await prisma.entity.findFirst({
      where: { id: resolved.mergedIntoId, operatorId },
      include: includeBlock,
    });
    if (!merged) break;
    resolved = merged;
  }

  const relationships: EntityContext["relationships"] = [];
  for (const r of resolved.fromRelations) {
    relationships.push({
      direction: "from",
      relationshipType: r.relationshipType.name,
      entityName: r.toEntity.displayName,
      entityId: r.toEntity.id,
    });
  }
  for (const r of resolved.toRelations) {
    relationships.push({
      direction: "to",
      relationshipType: r.relationshipType.name,
      entityName: r.fromEntity.displayName,
      entityId: r.fromEntity.id,
    });
  }

  return {
    id: resolved.id,
    displayName: resolved.displayName,
    typeName: resolved.entityType.name,
    typeSlug: resolved.entityType.slug,
    status: resolved.status,
    sourceSystem: resolved.sourceSystem,
    externalId: resolved.externalId,
    properties: Object.fromEntries(
      resolved.propertyValues.map((pv) => [pv.property.slug, pv.value]),
    ),
    relationships,
    recentMentions: resolved.mentions,
  };
}

// ── Search ───────────────────────────────────────────────────────────────────

export async function searchEntities(
  operatorId: string,
  query: string,
  typeSlug?: string,
  limit = 20,
): Promise<EntitySearchResult[]> {
  const entities = await prisma.entity.findMany({
    where: {
      operatorId,
      mergedIntoId: null,
      status: "active",
      ...(typeSlug ? { entityType: { slug: typeSlug } } : {}),
      OR: [
        { displayName: { contains: query } },
        { propertyValues: { some: { value: { contains: query } } } },
      ],
    },
    include: {
      entityType: { select: { name: true, slug: true } },
      propertyValues: { include: { property: { select: { slug: true } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: Math.min(limit, 50),
  });

  return entities.map((e) => ({
    id: e.id,
    displayName: e.displayName,
    typeName: e.entityType.name,
    typeSlug: e.entityType.slug,
    status: e.status,
    properties: Object.fromEntries(
      e.propertyValues.map((pv) => [pv.property.slug, pv.value]),
    ),
  }));
}

// ── Relate ───────────────────────────────────────────────────────────────────

export async function relateEntities(
  operatorId: string,
  fromId: string,
  toId: string,
  relationshipTypeSlug: string,
  label?: string,
): Promise<void> {
  const [from, to] = await Promise.all([
    prisma.entity.findFirst({ where: { id: fromId, operatorId }, select: { id: true, entityTypeId: true } }),
    prisma.entity.findFirst({ where: { id: toId, operatorId }, select: { id: true, entityTypeId: true } }),
  ]);
  if (!from || !to) return;

  let relType = await prisma.relationshipType.findFirst({
    where: { operatorId, slug: relationshipTypeSlug },
    select: { id: true },
  });

  if (!relType) {
    relType = await prisma.relationshipType.create({
      data: {
        operatorId,
        name: relationshipTypeSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        slug: relationshipTypeSlug,
        fromEntityTypeId: from.entityTypeId,
        toEntityTypeId: to.entityTypeId,
      },
      select: { id: true },
    });
  }

  await prisma.relationship.upsert({
    where: {
      relationshipTypeId_fromEntityId_toEntityId: {
        relationshipTypeId: relType.id,
        fromEntityId: fromId,
        toEntityId: toId,
      },
    },
    update: { metadata: label ? JSON.stringify({ label }) : undefined },
    create: {
      relationshipTypeId: relType.id,
      fromEntityId: fromId,
      toEntityId: toId,
      metadata: label ? JSON.stringify({ label }) : null,
    },
  });
}

// ── EAV Helpers ──────────────────────────────────────────────────────────────

function validatePropertyValue(
  value: string,
  dataType: string,
  enumValues?: string[],
): string | null {
  switch (dataType) {
    case "NUMBER":
    case "CURRENCY":
      if (isNaN(parseFloat(value))) return `"${value}" is not a valid number`;
      break;
    case "DATE":
      if (isNaN(new Date(value).getTime())) return `"${value}" is not a valid date`;
      break;
    case "BOOLEAN":
      if (value !== "true" && value !== "false") return `"${value}" must be "true" or "false"`;
      break;
    case "ENUM":
      if (enumValues && !enumValues.includes(value)) {
        return `"${value}" is not one of: ${enumValues.join(", ")}`;
      }
      break;
  }
  return null;
}
