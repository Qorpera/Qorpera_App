import { getEntityContext } from "@/lib/entity-resolution";
import { prisma } from "@/lib/db";
import type { AgentTool } from "../types";

const getEntityDetails: AgentTool = {
  name: "get_entity_details",
  description:
    "Get full details for a specific entity: all properties, relationships (both directions), department membership, recent activity signals, and source system info.",
  parameters: {
    type: "object",
    properties: {
      entityId: { type: "string", description: "The entity ID to look up" },
    },
    required: ["entityId"],
  },
  async handler(args, ctx) {
    const entityId = args.entityId as string;

    const context = await getEntityContext(ctx.operatorId, entityId);
    if (!context) {
      return `Entity not found: ${entityId}`;
    }

    const lines: string[] = [
      `Entity: ${context.displayName}`,
      `Type: ${context.typeName} (${context.typeSlug})`,
      `Status: ${context.status}`,
    ];

    if (context.sourceSystem) {
      lines.push(`Source: ${context.sourceSystem}${context.externalId ? ` (${context.externalId})` : ""}`);
    }

    // Properties
    const propEntries = Object.entries(context.properties);
    if (propEntries.length > 0) {
      lines.push("\nProperties:");
      for (const [key, val] of propEntries) {
        lines.push(`  ${key}: ${val}`);
      }
    }

    // Relationships
    if (context.relationships.length > 0) {
      lines.push("\nRelationships:");
      for (const rel of context.relationships) {
        const dir = rel.direction === "from" ? "→" : "←";
        lines.push(`  ${dir} ${rel.relationshipType}: ${rel.entityName} (${rel.entityId})`);
      }
    }

    // Recent activity signals
    const recentSignals = await prisma.activitySignal.findMany({
      where: {
        operatorId: ctx.operatorId,
        OR: [
          { actorEntityId: entityId },
          { targetEntityIds: { contains: entityId } },
        ],
      },
      orderBy: { occurredAt: "desc" },
      take: 10,
    });

    if (recentSignals.length > 0) {
      lines.push("\nRecent Activity:");
      for (const sig of recentSignals) {
        const meta = sig.metadata ? JSON.parse(sig.metadata) : {};
        lines.push(`  [${sig.occurredAt.toISOString().slice(0, 10)}] ${sig.signalType}${meta.channel ? ` in ${meta.channel}` : ""}`);
      }
    }

    // Recent mentions
    if (context.recentMentions.length > 0) {
      lines.push("\nRecent Mentions:");
      for (const m of context.recentMentions.slice(0, 5)) {
        lines.push(`  [${m.createdAt.toISOString().slice(0, 10)}] ${m.sourceType}: ${m.snippet?.slice(0, 100) || "(no snippet)"}`);
      }
    }

    return lines.join("\n");
  },
};

export default getEntityDetails;
