import { prisma } from "@/lib/db";
import type { AgentTool } from "../types";

const getFinancialData: AgentTool = {
  name: "get_financial_data",
  description:
    "Query financial entities (invoices, payments, deals). Returns entity details with all financial properties like amount, status, dates, and related contacts/companies.",
  parameters: {
    type: "object",
    properties: {
      entityType: {
        type: "string",
        enum: ["invoice", "payment", "deal"],
        description: "Type of financial entity to query",
      },
      status: { type: "string", description: "Filter by status property" },
      dateFrom: { type: "string", description: "Filter by date (ISO format)" },
      dateTo: { type: "string", description: "Filter by date (ISO format)" },
      limit: { type: "number", description: "Max results (default 50)" },
    },
    required: ["entityType"],
  },
  async handler(args, ctx) {
    const entityType = args.entityType as string;
    const limit = Math.min((args.limit as number) || 50, 200);

    const entities = await prisma.entity.findMany({
      where: {
        operatorId: ctx.operatorId,
        status: "active",
        mergedIntoId: null,
        entityType: { slug: entityType },
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
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    if (entities.length === 0) {
      return `No ${entityType} entities found.`;
    }

    const lines: string[] = [`Found ${entities.length} ${entityType} entities:\n`];

    for (const e of entities) {
      lines.push(`${e.displayName} (ID: ${e.id})`);

      const props = e.propertyValues;
      if (props.length > 0) {
        for (const pv of props) {
          lines.push(`  ${pv.property.name}: ${pv.value}`);
        }
      }

      if (e.fromRelations.length > 0) {
        for (const rel of e.fromRelations) {
          lines.push(`  → ${rel.relationshipType.name}: ${rel.toEntity.displayName}`);
        }
      }

      lines.push("");
    }

    return lines.join("\n");
  },
};

export default getFinancialData;
