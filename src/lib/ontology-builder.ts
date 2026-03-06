import { prisma } from "@/lib/db";
import {
  getEntityType,
  createEntityTypeWithProperties,
  addProperty,
  createRelationshipType,
} from "@/lib/entity-model-store";
import { materializeUnprocessed } from "@/lib/event-materializer";
import { invalidateMaterializerCache } from "@/lib/event-materializer";
import type { OntologyProposal } from "@/lib/ontology-inference";

// ── Types ────────────────────────────────────────────────────────────────────

export type BuildResult = {
  entityTypesCreated: string[];
  entityTypesSkipped: string[];
  propertiesAdded: number;
  relationshipTypesCreated: string[];
  relationshipTypesSkipped: string[];
  materializerRulesWritten: number;
  eventsReprocessed: number;
};

// ── Builder ──────────────────────────────────────────────────────────────────

export async function buildOntology(
  operatorId: string,
  proposal: OntologyProposal
): Promise<BuildResult> {
  const result: BuildResult = {
    entityTypesCreated: [],
    entityTypesSkipped: [],
    propertiesAdded: 0,
    relationshipTypesCreated: [],
    relationshipTypesSkipped: [],
    materializerRulesWritten: 0,
    eventsReprocessed: 0,
  };

  // 1. Create entity types and properties
  for (const et of proposal.entityTypes) {
    const existing = await getEntityType(operatorId, et.slug);

    if (!existing) {
      await createEntityTypeWithProperties(
        operatorId,
        {
          name: et.name,
          slug: et.slug,
          description: et.description || "",
          icon: et.icon || "box",
          color: et.color || "#a855f7",
        },
        et.properties.map((p, i) => ({
          name: p.name,
          slug: p.slug,
          dataType: p.dataType || "STRING",
          identityRole: p.identityRole,
          filterable: true,
          displayOrder: i,
        }))
      );
      result.entityTypesCreated.push(et.slug);
    } else {
      // Add missing properties
      const existingSlugs = new Set(
        existing.properties.map((p) => p.slug)
      );
      for (const p of et.properties) {
        if (!existingSlugs.has(p.slug)) {
          await addProperty(existing.id, {
            name: p.name,
            slug: p.slug,
            dataType: p.dataType || "STRING",
            identityRole: p.identityRole,
            filterable: true,
            displayOrder: existing.properties.length,
          });
          result.propertiesAdded++;
        }
      }
      result.entityTypesSkipped.push(et.slug);
    }
  }

  // 2. Create relationship types
  for (const rt of proposal.relationshipTypes) {
    const fromType = await getEntityType(operatorId, rt.fromEntityTypeSlug);
    const toType = await getEntityType(operatorId, rt.toEntityTypeSlug);
    if (!fromType || !toType) continue;

    const existingRt = await prisma.relationshipType.findFirst({
      where: { operatorId, slug: rt.slug },
    });

    if (!existingRt) {
      await createRelationshipType(operatorId, {
        name: rt.name,
        slug: rt.slug,
        fromEntityTypeId: fromType.id,
        toEntityTypeId: toType.id,
        description: rt.description || "",
      });
      result.relationshipTypesCreated.push(rt.slug);
    } else {
      result.relationshipTypesSkipped.push(rt.slug);
    }
  }

  // 3. Write materializer rules
  for (const et of proposal.entityTypes) {
    if (!et.sourceMapping) continue;

    const connector = await prisma.sourceConnector.findUnique({
      where: { id: et.sourceMapping.connectorId },
    });
    if (!connector) continue;

    const existingRules: MaterializerMapping[] = connector.materializerConfig
      ? JSON.parse(connector.materializerConfig)
      : [];

    const newRule: MaterializerMapping = {
      sourceFilter: et.sourceMapping.sourceFilter,
      entityTypeSlug: et.slug,
      propertyMap: et.sourceMapping.propertyMap,
      displayNameTemplate: et.sourceMapping.displayNameTemplate,
      identityFields: et.sourceMapping.identityFields,
    };

    // Replace existing rule with same sourceFilter, or append
    const idx = existingRules.findIndex(
      (r) => JSON.stringify(r.sourceFilter) === JSON.stringify(newRule.sourceFilter)
    );
    if (idx >= 0) {
      existingRules[idx] = newRule;
    } else {
      existingRules.push(newRule);
    }

    await prisma.sourceConnector.update({
      where: { id: connector.id },
      data: { materializerConfig: JSON.stringify(existingRules) },
    });

    invalidateMaterializerCache(connector.id);
    result.materializerRulesWritten++;
  }

  // 4. Re-process pending events
  const reprocessed = await materializeUnprocessed(operatorId, 500);
  result.eventsReprocessed = reprocessed.filter(
    (r) => r.status === "materialized"
  ).length;

  return result;
}

// ── Materializer mapping type (matches the shape stored in SourceConnector) ─

type MaterializerMapping = {
  sourceFilter: {
    sheet?: string;
    eventType?: string;
  };
  entityTypeSlug: string;
  propertyMap: Record<string, string>;
  displayNameTemplate: string;
  identityFields: string[];
};
