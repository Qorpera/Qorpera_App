import { searchEntities as searchEntitiesDB } from "@/lib/entity-resolution";
import type { AgentTool } from "../types";

const searchEntities: AgentTool = {
  name: "search_entities",
  description:
    "Search entities by name or property values. Returns entity cards with type, category, key properties, and department membership.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query (name or property value)" },
      entityType: { type: "string", description: "Entity type slug filter (e.g. 'contact', 'company', 'invoice')" },
      limit: { type: "number", description: "Max results (default 20)" },
    },
    required: ["query"],
  },
  async handler(args, ctx) {
    const query = args.query as string;
    const typeSlug = args.entityType as string | undefined;
    const limit = (args.limit as number) || 20;

    const results = await searchEntitiesDB(ctx.operatorId, query, typeSlug, limit);

    if (results.length === 0) {
      return `No entities found matching "${query}"${typeSlug ? ` (type: ${typeSlug})` : ""}.`;
    }

    const lines: string[] = [`Found ${results.length} entities matching "${query}":\n`];

    for (const e of results) {
      lines.push(`${e.displayName} [${e.typeName}] (ID: ${e.id})`);
      const propEntries = Object.entries(e.properties);
      if (propEntries.length > 0) {
        const propStr = propEntries
          .slice(0, 5)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        lines.push(`  Properties: ${propStr}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  },
};

export default searchEntities;
