import { prisma } from "@/lib/db";
import { callLLM, getAIConfig, type AIMessage } from "@/lib/ai-provider";
import { listEntityTypes } from "@/lib/entity-model-store";
import type { Recommendation } from "@prisma/client";

// ── Types ────────────────────────────────────────────────────────────────────

type RuleCheck = {
  title: string;
  description: string;
  reasoning: string;
  actionType: string | null;
  entityId: string | null;
  entityTypeSlug: string | null;
  confidence: number;
  priority: "low" | "medium" | "high" | "critical";
};

// ── Generate Recommendations ─────────────────────────────────────────────────

export async function generateRecommendations(operatorId: string): Promise<void> {
  // Expire old active recommendations before generating new ones
  await prisma.recommendation.updateMany({
    where: { operatorId, status: "active" },
    data: { status: "expired" },
  });

  const checks: RuleCheck[] = [];

  // 1. Orphan entities (no relationships)
  const orphanChecks = await findOrphanEntities(operatorId);
  checks.push(...orphanChecks);

  // 2. Missing required properties
  const missingPropChecks = await findMissingRequiredProperties(operatorId);
  checks.push(...missingPropChecks);

  // 3. Stale entities (no updates in 30 days)
  const staleChecks = await findStaleEntities(operatorId);
  checks.push(...staleChecks);

  // 4. Entities with no mentions
  const noMentionChecks = await findEntitiesWithNoMentions(operatorId);
  checks.push(...noMentionChecks);

  // 5. AI-enriched operational insights (if AI is configured)
  const aiChecks = await generateAIInsights(operatorId);
  checks.push(...aiChecks);

  // Store all results
  for (const check of checks) {
    await prisma.recommendation.create({
      data: {
        operatorId,
        title: check.title,
        description: check.description,
        reasoning: check.reasoning,
        actionType: check.actionType,
        entityId: check.entityId,
        entityTypeSlug: check.entityTypeSlug,
        confidence: check.confidence,
        priority: check.priority,
        status: "active",
      },
    });
  }
}

// ── Rule-Based Checks ────────────────────────────────────────────────────────

async function findOrphanEntities(operatorId: string): Promise<RuleCheck[]> {
  const entities = await prisma.oemEntity.findMany({
    where: { operatorId, status: "active" },
    select: {
      id: true,
      displayName: true,
      entityType: { select: { slug: true, name: true } },
      _count: { select: { fromRelations: true, toRelations: true } },
    },
  });

  return entities
    .filter((e) => e._count.fromRelations === 0 && e._count.toRelations === 0)
    .slice(0, 20)
    .map((e) => ({
      title: `Orphan entity: ${e.displayName}`,
      description: `"${e.displayName}" (${e.entityType.name}) has no relationships to other entities. Consider connecting it to related entities or archiving it if no longer relevant.`,
      reasoning: "Entities without relationships are disconnected from the knowledge graph and may represent incomplete data entry or stale records.",
      actionType: "update_entity",
      entityId: e.id,
      entityTypeSlug: e.entityType.slug,
      confidence: 0.7,
      priority: "low" as const,
    }));
}

async function findMissingRequiredProperties(operatorId: string): Promise<RuleCheck[]> {
  const entityTypes = await prisma.oemEntityType.findMany({
    where: { operatorId },
    include: {
      properties: { where: { required: true } },
      entities: {
        where: { status: "active" },
        include: { propertyValues: { select: { propertyId: true } } },
        take: 100,
      },
    },
  });

  const checks: RuleCheck[] = [];

  for (const type of entityTypes) {
    if (type.properties.length === 0) continue;

    const requiredPropIds = new Set(type.properties.map((p) => p.id));

    for (const entity of type.entities) {
      const filledPropIds = new Set(entity.propertyValues.map((pv) => pv.propertyId));
      const missingProps = type.properties.filter((p) => !filledPropIds.has(p.id));

      if (missingProps.length > 0) {
        checks.push({
          title: `Missing required data: ${entity.displayName}`,
          description: `"${entity.displayName}" (${type.name}) is missing required properties: ${missingProps.map((p) => p.name).join(", ")}.`,
          reasoning: "Required properties indicate essential data fields. Missing values may cause issues in downstream processes or reporting.",
          actionType: "update_entity",
          entityId: entity.id,
          entityTypeSlug: type.slug,
          confidence: 0.9,
          priority: "high" as const,
        });
      }
    }
  }

  return checks.slice(0, 20);
}

async function findStaleEntities(operatorId: string): Promise<RuleCheck[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const staleEntities = await prisma.oemEntity.findMany({
    where: {
      operatorId,
      status: "active",
      updatedAt: { lt: thirtyDaysAgo },
    },
    select: {
      id: true,
      displayName: true,
      updatedAt: true,
      entityType: { select: { slug: true, name: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: 20,
  });

  return staleEntities.map((e) => {
    const daysSinceUpdate = Math.floor((Date.now() - e.updatedAt.getTime()) / (24 * 60 * 60 * 1000));
    return {
      title: `Stale entity: ${e.displayName}`,
      description: `"${e.displayName}" (${e.entityType.name}) has not been updated in ${daysSinceUpdate} days. Review if this data is still current.`,
      reasoning: "Entities that haven't been updated recently may contain outdated information that could lead to incorrect decisions.",
      actionType: "update_entity",
      entityId: e.id,
      entityTypeSlug: e.entityType.slug,
      confidence: 0.5,
      priority: "medium" as const,
    };
  });
}

async function findEntitiesWithNoMentions(operatorId: string): Promise<RuleCheck[]> {
  const entities = await prisma.oemEntity.findMany({
    where: { operatorId, status: "active" },
    select: {
      id: true,
      displayName: true,
      entityType: { select: { slug: true, name: true } },
      _count: { select: { mentions: true } },
    },
  });

  return entities
    .filter((e) => e._count.mentions === 0)
    .slice(0, 15)
    .map((e) => ({
      title: `No activity: ${e.displayName}`,
      description: `"${e.displayName}" (${e.entityType.name}) has never been mentioned in any source. This may indicate it was manually created but never referenced in operations.`,
      reasoning: "Entities with zero mentions may not be actively tracked or may have been created speculatively.",
      actionType: null,
      entityId: e.id,
      entityTypeSlug: e.entityType.slug,
      confidence: 0.4,
      priority: "low" as const,
    }));
}

// ── AI-Enriched Insights ─────────────────────────────────────────────────────

async function generateAIInsights(operatorId: string): Promise<RuleCheck[]> {
  try {
    const config = await getAIConfig();
    if (!config.apiKey && config.provider !== "ollama") {
      return [];
    }
  } catch {
    return [];
  }

  try {
    const entityTypes = await listEntityTypes(operatorId);

    if (entityTypes.length === 0) return [];

    // Gather a compact summary of the entity graph
    const typeSummaries = entityTypes.map((t) => ({
      name: t.name,
      slug: t.slug,
      entityCount: t._count.entities,
      properties: t.properties.map((p) => ({
        name: p.name,
        dataType: p.dataType,
        required: p.required,
      })),
    }));

    // Sample some entities for context
    const sampleEntities = await prisma.oemEntity.findMany({
      where: { operatorId, status: "active" },
      include: {
        entityType: { select: { name: true, slug: true } },
        propertyValues: { include: { property: { select: { slug: true } } } },
        _count: { select: { fromRelations: true, toRelations: true, mentions: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });

    const entitySamples = sampleEntities.map((e) => ({
      name: e.displayName,
      type: e.entityType.name,
      properties: Object.fromEntries(e.propertyValues.map((pv) => [pv.property.slug, pv.value])),
      relationshipCount: e._count.fromRelations + e._count.toRelations,
      mentionCount: e._count.mentions,
    }));

    const totalRelationships = await prisma.oemEntityRelationship.count({
      where: { fromEntity: { operatorId } },
    });

    const messages: AIMessage[] = [
      {
        role: "system",
        content: `You are an operational intelligence analyst. Analyze the entity graph summary below and suggest actionable recommendations. Focus on:
1. Data quality issues (inconsistencies, duplicates, gaps)
2. Structural improvements (missing relationship types, unconnected clusters)
3. Operational insights (trends, patterns, anomalies)

Respond with a JSON array of objects, each with: title, description, reasoning, priority (low/medium/high/critical), confidence (0-1).
Return at most 5 recommendations. Return only the JSON array, no other text.`,
      },
      {
        role: "user",
        content: `Entity Graph Summary:
Types: ${JSON.stringify(typeSummaries, null, 2)}

Sample Entities (most recent 20):
${JSON.stringify(entitySamples, null, 2)}

Total Relationships: ${totalRelationships}`,
      },
    ];

    const response = await callLLM(messages, { temperature: 0.4, maxTokens: 2000 });

    // Parse the AI response
    const content = response.content.trim();
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const recommendations = JSON.parse(jsonMatch[0]) as Array<{
      title: string;
      description: string;
      reasoning: string;
      priority: string;
      confidence: number;
    }>;

    return recommendations.slice(0, 5).map((r) => ({
      title: r.title,
      description: r.description,
      reasoning: r.reasoning ?? "",
      actionType: null,
      entityId: null,
      entityTypeSlug: null,
      confidence: Math.max(0, Math.min(1, r.confidence ?? 0.5)),
      priority: (["low", "medium", "high", "critical"].includes(r.priority) ? r.priority : "medium") as "low" | "medium" | "high" | "critical",
    }));
  } catch (err) {
    console.error("[recommendation-engine] AI insight generation failed:", err);
    return [];
  }
}

// ── List / Accept / Dismiss ──────────────────────────────────────────────────

export async function listRecommendations(
  operatorId: string,
  status?: string,
): Promise<Recommendation[]> {
  const where: Record<string, unknown> = { operatorId };
  if (status) where.status = status;

  return prisma.recommendation.findMany({
    where,
    orderBy: [{ priority: "desc" }, { confidence: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
}

export async function acceptRecommendation(
  operatorId: string,
  id: string,
): Promise<void> {
  const rec = await prisma.recommendation.findFirst({
    where: { id, operatorId, status: "active" },
  });
  if (!rec) throw new Error("Recommendation not found or already processed");

  // Create an ActionProposal from the recommendation
  await prisma.actionProposal.create({
    data: {
      operatorId,
      actionType: rec.actionType ?? "review",
      description: `[From recommendation] ${rec.title}: ${rec.description}`,
      entityId: rec.entityId,
      entityTypeSlug: rec.entityTypeSlug,
      sourceAgent: "recommendation-engine",
      inputData: JSON.stringify({
        recommendationId: rec.id,
        reasoning: rec.reasoning,
      }),
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    },
  });

  await prisma.recommendation.update({
    where: { id },
    data: { status: "accepted" },
  });
}

export async function dismissRecommendation(
  operatorId: string,
  id: string,
): Promise<void> {
  const rec = await prisma.recommendation.findFirst({
    where: { id, operatorId, status: "active" },
  });
  if (!rec) throw new Error("Recommendation not found or already processed");

  await prisma.recommendation.update({
    where: { id },
    data: { status: "dismissed" },
  });
}
