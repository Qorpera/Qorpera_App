import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordEntityMention } from "@/lib/entity-resolution";

// Internal entity type seeds
const INTERNAL_TYPES: Record<string, { name: string; icon: string; color: string }> = {
  "organization": { name: "Organization", icon: "building-2", color: "#6366f1" },
  "department": { name: "Department", icon: "users", color: "#8b5cf6" },
  "team-member": { name: "Team Member", icon: "user", color: "#a78bfa" },
  "role": { name: "Role", icon: "briefcase", color: "#c084fc" },
  "process": { name: "Process", icon: "workflow", color: "#e879f9" },
  "policy": { name: "Policy", icon: "shield", color: "#f0abfc" },
};

async function findOrCreateEntityType(operatorId: string, typeSlug: string) {
  const existing = await prisma.entityType.findFirst({
    where: { operatorId, slug: typeSlug },
  });
  if (existing) return existing;

  const seed = INTERNAL_TYPES[typeSlug];
  return prisma.entityType.create({
    data: {
      operatorId,
      slug: typeSlug,
      name: seed?.name ?? typeSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      icon: seed?.icon ?? "box",
      color: seed?.color ?? "#a855f7",
    },
  });
}

async function findOrCreateRelationshipType(
  operatorId: string,
  slug: string,
  fromEntityTypeId: string,
  toEntityTypeId: string,
) {
  const existing = await prisma.relationshipType.findFirst({
    where: { operatorId, slug },
  });
  if (existing) return existing;

  return prisma.relationshipType.create({
    data: {
      operatorId,
      slug,
      name: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      fromEntityTypeId,
      toEntityTypeId,
    },
  });
}

type ExtractedEntity = {
  type: string;
  displayName: string;
  properties?: Record<string, string>;
};

type ExtractedRelationship = {
  fromName: string;
  toName: string;
  type: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const operatorId = await getOperatorId();
  const { id } = await params;

  const doc = await prisma.internalDocument.findFirst({
    where: { id, operatorId },
  });
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const body = await req.json();
  const entities: ExtractedEntity[] = body.entities ?? [];
  const relationships: ExtractedRelationship[] = body.relationships ?? [];

  const createdEntities: { id: string; displayName: string; type: string }[] = [];
  const entityNameToId = new Map<string, string>();
  const createdRelationships: string[] = [];

  // Create entities
  for (const ent of entities) {
    const entityType = await findOrCreateEntityType(operatorId, ent.type);

    const entity = await prisma.entity.create({
      data: {
        operatorId,
        entityTypeId: entityType.id,
        displayName: ent.displayName,
        sourceSystem: "document",
        externalId: id,
      },
    });

    // Create property values
    if (ent.properties && Object.keys(ent.properties).length > 0) {
      for (const [key, value] of Object.entries(ent.properties)) {
        // Find or create the property definition
        let prop = await prisma.entityProperty.findFirst({
          where: { entityTypeId: entityType.id, slug: key },
        });
        if (!prop) {
          prop = await prisma.entityProperty.create({
            data: {
              entityTypeId: entityType.id,
              slug: key,
              name: key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
              dataType: "STRING",
            },
          });
        }
        await prisma.propertyValue.create({
          data: { entityId: entity.id, propertyId: prop.id, value: String(value) },
        });
      }
    }

    // Record mention linking entity to document
    await recordEntityMention(
      operatorId,
      entity.id,
      "internal_document",
      id,
      ent.displayName,
    );

    entityNameToId.set(ent.displayName, entity.id);
    createdEntities.push({ id: entity.id, displayName: ent.displayName, type: ent.type });
  }

  // Create relationships
  for (const rel of relationships) {
    const fromId = entityNameToId.get(rel.fromName);
    const toId = entityNameToId.get(rel.toName);
    if (!fromId || !toId) continue;

    const fromEntity = await prisma.entity.findUnique({
      where: { id: fromId },
      select: { entityTypeId: true },
    });
    const toEntity = await prisma.entity.findUnique({
      where: { id: toId },
      select: { entityTypeId: true },
    });
    if (!fromEntity || !toEntity) continue;

    const relType = await findOrCreateRelationshipType(
      operatorId,
      rel.type,
      fromEntity.entityTypeId,
      toEntity.entityTypeId,
    );

    await prisma.relationship.upsert({
      where: {
        relationshipTypeId_fromEntityId_toEntityId: {
          relationshipTypeId: relType.id,
          fromEntityId: fromId,
          toEntityId: toId,
        },
      },
      update: {},
      create: {
        relationshipTypeId: relType.id,
        fromEntityId: fromId,
        toEntityId: toId,
      },
    });

    createdRelationships.push(`${rel.fromName} --[${rel.type}]--> ${rel.toName}`);
  }

  // Update business context on orientation session
  if (doc.businessContext) {
    const session = await prisma.orientationSession.findFirst({
      where: { operatorId, phase: "active" },
      orderBy: { createdAt: "desc" },
    });
    if (session) {
      const ctx = session.context ? JSON.parse(session.context) : {};
      const existing = ctx.documentContext ?? "";
      ctx.documentContext = existing
        ? `${existing}\n\n--- From ${doc.fileName} ---\n${doc.businessContext}`
        : `--- From ${doc.fileName} ---\n${doc.businessContext}`;
      await prisma.orientationSession.update({
        where: { id: session.id },
        data: { context: JSON.stringify(ctx) },
      });
    }
  }

  // Mark document as confirmed
  await prisma.internalDocument.update({
    where: { id },
    data: { status: "confirmed" },
  });

  return NextResponse.json({
    status: "confirmed",
    entitiesCreated: createdEntities.length,
    relationshipsCreated: createdRelationships.length,
    entities: createdEntities,
    relationships: createdRelationships,
  });
}
