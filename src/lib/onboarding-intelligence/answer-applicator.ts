import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

/**
 * Takes answered uncertainty questions and applies knowledge
 * back to the entity graph and business context.
 */
export async function applyAnswersToGraph(
  operatorId: string,
  answeredQuestions: Array<Record<string, unknown>>,
): Promise<{ propertiesUpdated: number; relationshipsCreated: number; contextStored: number }> {
  let propertiesUpdated = 0;
  let relationshipsCreated = 0;
  let contextStored = 0;

  const questionsText = answeredQuestions.map((q, i) =>
    `Q${i}: ${q.question}\nContext: ${q.context ?? ""}\nAnswer: ${q.userAnswer}`
  ).join("\n\n");

  const response = await callLLM({
    instructions: `You extract structured entity updates from answered questions about a company.

For each answered question, determine if the answer implies:
1. A property update on a person (role, title, status clarification)
2. A new relationship (reporting line, responsibility)
3. A business rule or policy (pricing, thresholds, processes)

Respond with ONLY valid JSON:
{
  "propertyUpdates": [
    { "entityName": "Henrik Bolt", "propertySlug": "job-title", "value": "Driftskoordinator" }
  ],
  "relationships": [
    { "fromName": "Henrik Bolt", "toName": "Lars Bolt", "type": "reports-to" }
  ],
  "businessRules": [
    "Standard hourly rate is 525 DKK/time — template to be updated",
    "Revenue target for 2026 is 2.8M DKK (FINAL version, draft at 2.2M is obsolete)"
  ]
}

If an answer is vague or doesn't imply a concrete update, skip it. Only produce high-confidence updates.`,
    messages: [{ role: "user", content: questionsText }],
    temperature: 0.1,
    maxTokens: 2000,
    aiFunction: "reasoning",
    model: HAIKU_MODEL,
  });

  try {
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { propertiesUpdated, relationshipsCreated, contextStored };
    const updates = JSON.parse(jsonMatch[0]);

    // Apply property updates
    if (Array.isArray(updates.propertyUpdates)) {
      for (const update of updates.propertyUpdates) {
        try {
          const entity = await prisma.entity.findFirst({
            where: { operatorId, displayName: update.entityName, status: "active" },
            select: { id: true, entityTypeId: true },
          });
          if (!entity) continue;

          const property = await prisma.entityProperty.findFirst({
            where: { entityTypeId: entity.entityTypeId, slug: update.propertySlug },
            select: { id: true },
          });
          if (!property) continue;

          await prisma.propertyValue.upsert({
            where: { entityId_propertyId: { entityId: entity.id, propertyId: property.id } },
            update: { value: String(update.value) },
            create: { entityId: entity.id, propertyId: property.id, value: String(update.value) },
          });
          propertiesUpdated++;
        } catch (err) {
          console.error(`[answer-applicator] Property update failed for ${update.entityName}:`, err);
        }
      }
    }

    // Apply relationships
    if (Array.isArray(updates.relationships)) {
      for (const rel of updates.relationships) {
        try {
          const fromEntity = await prisma.entity.findFirst({
            where: { operatorId, displayName: rel.fromName, status: "active" },
            select: { id: true },
          });
          const toEntity = await prisma.entity.findFirst({
            where: { operatorId, displayName: rel.toName, status: "active" },
            select: { id: true },
          });
          if (!fromEntity || !toEntity) continue;

          const relType = await prisma.relationshipType.findFirst({
            where: { operatorId, slug: rel.type },
            select: { id: true },
          });
          if (!relType) continue;

          const existing = await prisma.relationship.findFirst({
            where: {
              fromEntityId: fromEntity.id,
              toEntityId: toEntity.id,
              relationshipTypeId: relType.id,
            },
          });
          if (!existing) {
            await prisma.relationship.create({
              data: {
                fromEntityId: fromEntity.id,
                toEntityId: toEntity.id,
                relationshipTypeId: relType.id,
              },
            });
            relationshipsCreated++;
          }
        } catch (err) {
          console.error(`[answer-applicator] Relationship failed for ${rel.fromName} → ${rel.toName}:`, err);
        }
      }
    }

    // Store business rules in OrientationSession context (used by reasoning engine)
    if (Array.isArray(updates.businessRules) && updates.businessRules.length > 0) {
      try {
        const session = await prisma.orientationSession.findFirst({
          where: { operatorId },
          orderBy: { createdAt: "desc" },
          select: { id: true, context: true },
        });
        if (session) {
          let ctx: Record<string, unknown> = {};
          if (session.context) {
            try { ctx = JSON.parse(session.context); } catch {}
          }
          const existingRules = Array.isArray(ctx.businessRules) ? ctx.businessRules as string[] : [];
          ctx.businessRules = [...existingRules, ...updates.businessRules];
          await prisma.orientationSession.update({
            where: { id: session.id },
            data: { context: JSON.stringify(ctx) },
          });
          contextStored = updates.businessRules.length;
        }
      } catch (err) {
        console.error("[answer-applicator] Business context storage failed:", err);
      }
    }
  } catch (err) {
    console.error("[answer-applicator] Failed to parse/apply updates:", err);
  }

  return { propertiesUpdated, relationshipsCreated, contextStored };
}
