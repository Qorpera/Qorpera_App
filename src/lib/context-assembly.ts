import { prisma } from "@/lib/db";
import { getEntityContext } from "@/lib/entity-resolution";
import { searchAround } from "@/lib/graph-traversal";
import { getBusinessContext, formatBusinessContext } from "@/lib/business-context";

// ── Types ────────────────────────────────────────────────────────────────────

export interface OrganizationalContextEntry {
  displayName: string;
  type: string;
  properties: Record<string, string>;
  relationship: string;
}

export interface SituationContext {
  triggerEntity: {
    id: string;
    type: string;
    displayName: string;
    properties: Record<string, string>;
  };
  neighborhood: {
    entities: Array<{
      id: string;
      type: string;
      displayName: string;
      relationshipType: string;
      direction: string;
      properties: Record<string, string>;
    }>;
  };
  organizationalContext: OrganizationalContextEntry[];
  recentEvents: Array<{
    id: string;
    source: string;
    eventType: string;
    payload: unknown;
    createdAt: string;
  }>;
  priorSituations: Array<{
    id: string;
    triggerEntityName: string;
    status: string;
    outcome: string | null;
    feedback: string | null;
    actionTaken: unknown;
    resolvedAt: string | null;
    createdAt: string;
  }>;
  availableActions: Array<{
    name: string;
    description: string;
    connector: string | null;
    inputSchema: unknown;
    sideEffects: unknown;
  }>;
  policies: Array<{
    id: string;
    effect: string;
    conditions: unknown;
  }>;
  businessContext: string;
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function assembleSituationContext(
  operatorId: string,
  situationTypeId: string,
  triggerEntityId: string,
  triggerEventId?: string,
): Promise<SituationContext> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Parallel fetch all context pieces
  const [
    entityCtx,
    graphResult,
    events,
    priorSituations,
    capabilities,
    policyRules,
    businessCtx,
  ] = await Promise.all([
    getEntityContext(operatorId, triggerEntityId),
    searchAround(operatorId, triggerEntityId, 1),
    prisma.event.findMany({
      where: {
        operatorId,
        entityRefs: { contains: triggerEntityId },
        createdAt: { gte: thirtyDaysAgo },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.situation.findMany({
      where: {
        operatorId,
        situationTypeId,
        status: { in: ["resolved", "closed"] },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.actionCapability.findMany({
      where: { operatorId, enabled: true },
    }),
    prisma.policyRule.findMany({
      where: { operatorId, enabled: true },
      take: 20,
    }),
    getBusinessContext(operatorId),
  ]);

  // Build trigger entity
  const triggerEntity = entityCtx
    ? {
        id: entityCtx.id,
        type: entityCtx.typeName,
        displayName: entityCtx.displayName,
        properties: entityCtx.properties,
      }
    : {
        id: triggerEntityId,
        type: "unknown",
        displayName: triggerEntityId,
        properties: {},
      };

  // Build neighborhood from graph traversal
  const neighborhood = {
    entities: graphResult.nodes
      .filter((n) => n.id !== triggerEntityId)
      .map((n) => {
        // Find the edge connecting this node to the trigger
        const edge = graphResult.edges.find(
          (e) => (e.source === triggerEntityId && e.target === n.id) ||
                 (e.target === triggerEntityId && e.source === n.id),
        );
        return {
          id: n.id,
          type: n.entityType,
          displayName: n.displayName,
          relationshipType: edge?.label ?? "related",
          direction: edge?.source === triggerEntityId ? "outgoing" : "incoming",
          properties: n.properties,
        };
      }),
  };

  // Build recent events
  const recentEvents = events.map((e) => ({
    id: e.id,
    source: e.source,
    eventType: e.eventType,
    payload: safeParseJSON(e.payload),
    createdAt: e.createdAt.toISOString(),
  }));

  // Resolve entity names for prior situations
  const priorEntityIds = priorSituations
    .map((s) => s.triggerEntityId)
    .filter((id): id is string => !!id);
  const priorEntities = priorEntityIds.length > 0
    ? await prisma.entity.findMany({
        where: { id: { in: priorEntityIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const priorEntityNameMap = new Map(priorEntities.map((e) => [e.id, e.displayName]));

  // Build prior situations (including retrospectives)
  const priorSits = priorSituations.map((s) => ({
    id: s.id,
    triggerEntityName: s.triggerEntityId
      ? (priorEntityNameMap.get(s.triggerEntityId) ?? s.triggerEntityId)
      : "unknown",
    status: s.status,
    outcome: s.outcome,
    feedback: s.feedback,
    actionTaken: s.actionTaken ? safeParseJSON(s.actionTaken) : null,
    resolvedAt: s.resolvedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
  }));

  // Build available actions
  const availableActions = capabilities.map((c) => ({
    name: c.name,
    description: c.description,
    connector: c.connectorId,
    inputSchema: c.inputSchema ? safeParseJSON(c.inputSchema) : null,
    sideEffects: c.sideEffects ? safeParseJSON(c.sideEffects) : null,
  }));

  // Build policies
  const policies = policyRules.map((p) => ({
    id: p.id,
    effect: p.effect,
    conditions: p.conditions ? safeParseJSON(p.conditions) : null,
  }));

  // Business context
  const bizCtxStr = businessCtx ? formatBusinessContext(businessCtx) : "";

  // Upward traversal — find org chain (entity → owner → department → org)
  const organizationalContext = await traverseUpward(operatorId, triggerEntityId);

  return {
    triggerEntity,
    neighborhood,
    organizationalContext,
    recentEvents,
    priorSituations: priorSits,
    availableActions,
    policies,
    businessContext: bizCtxStr,
  };
}

// ── Upward Traversal ────────────────────────────────────────────────────────

const UPWARD_REL_SLUGS = new Set([
  "owns-account", "has-member", "has-department", "manages", "reports-to",
]);

async function traverseUpward(
  operatorId: string,
  entityId: string,
): Promise<OrganizationalContextEntry[]> {
  const chain: OrganizationalContextEntry[] = [];
  const visited = new Set<string>([entityId]);
  let currentId = entityId;

  for (let hop = 0; hop < 5; hop++) {
    // Find relationships where this entity is the target of an internal rel
    const incomingRels = await prisma.relationship.findMany({
      where: {
        toEntityId: currentId,
        fromEntity: { operatorId, status: "active" },
      },
      include: {
        relationshipType: { select: { slug: true, name: true } },
        fromEntity: {
          include: {
            entityType: { select: { name: true, slug: true } },
            propertyValues: { include: { property: { select: { slug: true } } } },
          },
        },
      },
    });

    // Filter to internal relationship types
    const upwardRel = incomingRels.find(
      (r) => UPWARD_REL_SLUGS.has(r.relationshipType.slug) && !visited.has(r.fromEntityId),
    );

    if (!upwardRel) break;

    visited.add(upwardRel.fromEntityId);
    const parent = upwardRel.fromEntity;
    const props: Record<string, string> = {};
    for (const pv of parent.propertyValues) {
      props[pv.property.slug] = pv.value;
    }

    chain.push({
      displayName: parent.displayName,
      type: parent.entityType.name,
      properties: props,
      relationship: upwardRel.relationshipType.name,
    });

    currentId = upwardRel.fromEntityId;
  }

  return chain;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeParseJSON(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
