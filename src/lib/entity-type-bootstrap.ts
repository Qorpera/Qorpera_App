/**
 * Entity type auto-seeding — ensures hardcoded entity types exist for an operator.
 * Extracted from event-materializer.ts (deprecated).
 */
import { prisma } from "@/lib/db";
import { HARDCODED_TYPE_DEFS } from "@/lib/hardcoded-type-defs";

// Cache: operatorId:slug → true (already ensured)
const ensuredTypeCache = new Set<string>();

export async function ensureHardcodedEntityType(operatorId: string, slug: string): Promise<void> {
  const cacheKey = `${operatorId}:${slug}`;
  if (ensuredTypeCache.has(cacheKey)) return;

  const def = HARDCODED_TYPE_DEFS[slug];
  if (!def) return; // Not a hardcoded type, nothing to ensure

  const existing = await prisma.entityType.findFirst({
    where: { operatorId, slug },
    include: { properties: { select: { slug: true } } },
  });

  if (!existing) {
    // Create the entity type with all properties
    await prisma.entityType.create({
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
    });
  } else {
    // Entity type exists — ensure all properties exist (additive only)
    const existingSlugs = new Set(existing.properties.map((p) => p.slug));
    for (const prop of def.properties) {
      if (!existingSlugs.has(prop.slug)) {
        await prisma.entityProperty.create({
          data: {
            entityTypeId: existing.id,
            slug: prop.slug,
            name: prop.name,
            dataType: prop.dataType,
            identityRole: prop.identityRole ?? null,
          },
        });
      }
    }
    // Ensure defaultCategory is set correctly
    if (existing.defaultCategory === "digital") {
      await prisma.entityType.update({
        where: { id: existing.id },
        data: { defaultCategory: def.defaultCategory },
      });
    }
  }

  ensuredTypeCache.add(cacheKey);
}
