/**
 * Relationship inference — cross-references extracted entities with communication
 * evidence to infer entity-to-entity relationships during onboarding.
 *
 * Runs AFTER entity extraction populates the graph, BEFORE the intelligence preview.
 * Uses Opus for cross-referencing reasoning.
 */

import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { relateEntities } from "@/lib/entity-resolution";
import { extractJSON } from "@/lib/json-helpers";

export async function inferRelationships(
  operatorId: string,
): Promise<{ relationshipsCreated: number }> {
  // 1. Load all non-department entities (the ones we just extracted)
  const entities = await prisma.entity.findMany({
    where: { operatorId, status: "active", category: { in: ["digital", "external"] } },
    include: {
      entityType: { select: { slug: true, name: true } },
      propertyValues: { include: { property: { select: { slug: true, name: true } } } },
    },
    take: 200, // Cap for onboarding
  });

  if (entities.length < 2) {
    console.log(`[relationship-inference] Only ${entities.length} entities — skipping`);
    return { relationshipsCreated: 0 };
  }

  // 2. Load people entities for internal relationship mapping
  const people = await prisma.entity.findMany({
    where: { operatorId, status: "active", category: "base" },
    include: {
      propertyValues: { include: { property: { select: { slug: true } } } },
    },
  });

  // 3. Load recent communication excerpts that mention these entities
  const entityNames = entities.map(e => e.displayName);
  const relevantChunks = await prisma.contentChunk.findMany({
    where: {
      operatorId,
      OR: entityNames.slice(0, 50).map(name => ({
        content: { contains: name },
      })),
    },
    select: { content: true, sourceType: true, metadata: true },
    take: 100,
  });

  // 4. Build context for relationship inference
  const entitySummary = entities.map(e => {
    const props = e.propertyValues.map(pv => `${pv.property.slug}: ${pv.value}`).join(", ");
    return `- ${e.displayName} (${e.entityType.slug})${props ? ` — ${props}` : ""}`;
  }).join("\n");

  const peopleSummary = people.map(p => {
    const email = p.propertyValues.find(pv => pv.property.slug === "email")?.value;
    const role = p.propertyValues.find(pv => pv.property.slug === "role")?.value;
    return `- ${p.displayName}${role ? ` (${role})` : ""}${email ? ` <${email}>` : ""}`;
  }).join("\n");

  const evidenceExcerpts = relevantChunks.slice(0, 50).map((c, i) => {
    let meta: Record<string, unknown> = {};
    try { meta = c.metadata ? JSON.parse(c.metadata as string) : {}; } catch { /* */ }
    return `[${i + 1}] ${c.sourceType}${meta.subject ? `: ${meta.subject}` : ""}\n${c.content.slice(0, 300)}`;
  }).join("\n\n");

  if (!evidenceExcerpts) {
    console.log("[relationship-inference] No evidence found — skipping");
    return { relationshipsCreated: 0 };
  }

  const response = await callLLM({
    instructions: `You are inferring relationships between business entities based on evidence from communications and data.

PEOPLE IN THE ORGANIZATION:
${peopleSummary}

ENTITIES (business objects and external parties):
${entitySummary}

EVIDENCE FROM COMMUNICATIONS:
${evidenceExcerpts}

Infer relationships between these entities. A relationship connects two entities with a named type.

OUTPUT FORMAT — respond with ONLY valid JSON:
{
  "relationships": [
    {
      "fromName": "INV-2026-035",
      "toName": "Vestegnen Boligforening",
      "type": "invoice-from",
      "evidence": "Invoice addressed to Vestegnen Boligforening"
    },
    {
      "fromName": "Karen Holm",
      "toName": "Vestegnen Boligforening",
      "type": "works-at",
      "evidence": "Karen signs emails as Driftsansvarlig at Vestegnen"
    }
  ]
}

RULES:
- Only infer relationships you have evidence for. Cite the evidence briefly.
- Use descriptive relationship types: "invoice-from", "works-at", "responsible-for", "contact-for", "supplied-by", "project-member", etc.
- Include relationships between people and entities (who handles what), between external parties and entities (who owns what), and between entities (invoice belongs to project, etc.)
- Do NOT duplicate department-member or reports-to relationships — those already exist.`,
    messages: [{ role: "user", content: "Infer all relationships from the evidence above." }],
    model: getModel("multiAgentCoordinator"), // Opus — cross-referencing reasoning
    temperature: 0.2,
    maxTokens: 65_536,
    operatorId,
    thinking: true,
    thinkingBudget: 8192,
  });

  // 5. Parse and create relationships
  let created = 0;
  try {
    const parsed = extractJSON(response.text);
    if (parsed?.relationships && Array.isArray(parsed.relationships)) {
      const allEntities = [...entities, ...people];

      for (const rel of parsed.relationships) {
        if (!rel.fromName || !rel.toName || !rel.type) continue;

        // Resolve entity names to IDs (case-insensitive)
        const fromEntity = allEntities.find(e =>
          e.displayName.toLowerCase() === (rel.fromName as string).toLowerCase()
        );
        const toEntity = allEntities.find(e =>
          e.displayName.toLowerCase() === (rel.toName as string).toLowerCase()
        );

        if (!fromEntity || !toEntity) continue;

        const relTypeSlug = (rel.type as string).toLowerCase().replace(/\s+/g, "-");
        await relateEntities(operatorId, fromEntity.id, toEntity.id, relTypeSlug,
          rel.evidence ? `onboarding: ${rel.evidence}` : undefined);
        created++;
      }
    }
  } catch (err) {
    console.warn(`[relationship-inference] Failed to parse:`, err);
  }

  console.log(`[relationship-inference] Created ${created} relationships`);
  return { relationshipsCreated: created };
}
