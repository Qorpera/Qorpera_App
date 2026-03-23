import { prisma } from "@/lib/db";
import type { AgentTool } from "../types";

const getCrmData: AgentTool = {
  name: "get_crm_data",
  description:
    "Query CRM entities (contacts, companies, deals, tickets). Returns entities with all properties, relationship links, and recent activity.",
  parameters: {
    type: "object",
    properties: {
      entityType: {
        type: "string",
        enum: ["contact", "company", "deal", "ticket"],
        description: "Type of CRM entity to query",
      },
      filters: {
        type: "object",
        description: "Property name:value pairs to filter by",
      },
      limit: { type: "number", description: "Max results (default 50)" },
    },
    required: ["entityType"],
  },
  async handler(args, ctx) {
    const entityType = args.entityType as string;
    const filters = (args.filters as Record<string, string>) || {};
    const limit = Math.min((args.limit as number) || 50, 200);

    // Build property filter conditions
    const propertyFilters = Object.entries(filters).map(([key, value]) => ({
      property: { slug: key },
      value: { contains: value },
    }));

    const entities = await prisma.entity.findMany({
      where: {
        operatorId: ctx.operatorId,
        status: "active",
        mergedIntoId: null,
        entityType: { slug: entityType },
        ...(propertyFilters.length > 0
          ? { propertyValues: { some: { AND: propertyFilters } } }
          : {}),
      },
      include: {
        entityType: { select: { name: true } },
        propertyValues: { include: { property: { select: { slug: true, name: true } } } },
        fromRelations: {
          include: {
            relationshipType: { select: { name: true } },
            toEntity: { select: { id: true, displayName: true } },
          },
          take: 5,
        },
        toRelations: {
          include: {
            relationshipType: { select: { name: true } },
            fromEntity: { select: { id: true, displayName: true } },
          },
          take: 5,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    if (entities.length === 0) {
      return `No ${entityType} entities found${Object.keys(filters).length ? " matching filters" : ""}.`;
    }

    const lines: string[] = [`Found ${entities.length} ${entityType} entities:\n`];

    for (const e of entities) {
      lines.push(`${e.displayName} (ID: ${e.id})`);

      // Properties
      if (e.propertyValues.length > 0) {
        for (const pv of e.propertyValues) {
          lines.push(`  ${pv.property.name}: ${pv.value}`);
        }
      }

      // Relationships
      const rels = [
        ...e.fromRelations.map((r) => `→ ${r.relationshipType.name}: ${r.toEntity.displayName}`),
        ...e.toRelations.map((r) => `← ${r.relationshipType.name}: ${r.fromEntity.displayName}`),
      ];
      if (rels.length > 0) {
        for (const rel of rels) {
          lines.push(`  ${rel}`);
        }
      }

      lines.push("");
    }

    return lines.join("\n");
  },
};

export default getCrmData;
