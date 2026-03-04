import { prisma } from "@/lib/db";
import { callLLM, type AIMessage } from "@/lib/ai-provider";

// ── Types ────────────────────────────────────────────────────────────────────

export type ExtractedEntity = {
  name: string;
  type: string;
  properties: Record<string, string>;
};

export type ExtractedRelationship = {
  from: string;
  to: string;
  type: string;
};

export type ExtractionResult = {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
};

// ── Entity Extraction ────────────────────────────────────────────────────────

export async function extractEntitiesFromText(
  operatorId: string,
  text: string,
): Promise<ExtractionResult> {
  // Read entity types from DB so the LLM knows valid types + properties
  const entityTypes = await prisma.oemEntityType.findMany({
    where: { operatorId },
    include: {
      properties: {
        select: { name: true, slug: true, dataType: true },
        orderBy: { displayOrder: "asc" },
      },
    },
  });

  const relationshipTypes = await prisma.oemRelationshipType.findMany({
    where: { operatorId },
    select: { slug: true, name: true },
  });

  if (entityTypes.length === 0) {
    return { entities: [], relationships: [] };
  }

  const typeDescriptions = entityTypes.map((t) => {
    const props = t.properties.map((p) => `    - ${p.slug} (${p.dataType})`).join("\n");
    return `  ${t.slug} ("${t.name}"):\n${props || "    (no properties defined)"}`;
  }).join("\n");

  const relTypeDescriptions = relationshipTypes.length > 0
    ? relationshipTypes.map((r) => `  - ${r.slug} ("${r.name}")`).join("\n")
    : "  (no relationship types defined — you may suggest new ones)";

  const messages: AIMessage[] = [
    {
      role: "system",
      content: `You are an entity extraction engine. Extract structured entities and relationships from the provided text.

AVAILABLE ENTITY TYPES AND THEIR PROPERTIES:
${typeDescriptions}

AVAILABLE RELATIONSHIP TYPES:
${relTypeDescriptions}

RULES:
1. Only extract entities that match the available entity types listed above.
2. For each entity, fill in as many properties as the text supports using the property slugs.
3. For relationships, use the entity names as "from" and "to" fields and a relationship type slug as "type".
4. If a relationship type does not exist in the available list, use a descriptive kebab-case slug.
5. Entity names should be normalized (proper casing, no trailing whitespace).
6. Be precise — only extract what is clearly stated or strongly implied in the text.

Respond with ONLY a JSON object in this exact format:
{
  "entities": [
    { "name": "Entity Name", "type": "entity-type-slug", "properties": { "prop-slug": "value" } }
  ],
  "relationships": [
    { "from": "Entity Name A", "to": "Entity Name B", "type": "relationship-type-slug" }
  ]
}`,
    },
    {
      role: "user",
      content: `Extract entities and relationships from the following text:\n\n${text}`,
    },
  ];

  const response = await callLLM(messages, { temperature: 0.1, maxTokens: 2000 });

  return parseExtractionResponse(response.content, entityTypes.map((t) => t.slug));
}

// ── Response Parser ──────────────────────────────────────────────────────────

function parseExtractionResponse(
  content: string,
  validTypeSlugs: string[],
): ExtractionResult {
  const empty: ExtractionResult = { entities: [], relationships: [] };

  try {
    const trimmed = content.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return empty;

    const parsed = JSON.parse(jsonMatch[0]);

    const entities: ExtractedEntity[] = [];
    if (Array.isArray(parsed.entities)) {
      for (const e of parsed.entities) {
        if (
          typeof e.name !== "string" ||
          typeof e.type !== "string" ||
          !e.name.trim()
        ) continue;

        // Only accept known entity types
        if (!validTypeSlugs.includes(e.type)) continue;

        const properties: Record<string, string> = {};
        if (e.properties && typeof e.properties === "object") {
          for (const [k, v] of Object.entries(e.properties)) {
            if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
              properties[k] = String(v);
            }
          }
        }

        entities.push({
          name: e.name.trim(),
          type: e.type,
          properties,
        });
      }
    }

    const relationships: ExtractedRelationship[] = [];
    if (Array.isArray(parsed.relationships)) {
      for (const r of parsed.relationships) {
        if (
          typeof r.from !== "string" ||
          typeof r.to !== "string" ||
          typeof r.type !== "string" ||
          !r.from.trim() ||
          !r.to.trim()
        ) continue;

        relationships.push({
          from: r.from.trim(),
          to: r.to.trim(),
          type: r.type,
        });
      }
    }

    return { entities, relationships };
  } catch (err) {
    console.error("[entity-extractor] Failed to parse LLM response:", err);
    return empty;
  }
}
