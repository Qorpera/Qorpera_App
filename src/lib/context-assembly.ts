import { prisma } from "@/lib/db";
import { getEntityContext } from "@/lib/entity-resolution";
import { searchAround } from "@/lib/graph-traversal";
import { retrieveRelevantContext } from "@/lib/rag/retriever";
import { getBusinessContext, formatBusinessContext } from "@/lib/business-context";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DepartmentContext {
  id: string;
  name: string;
  description: string | null;
  lead: { name: string; role: string } | null;
  memberCount: number;
}

export interface RAGReference {
  documentName: string;
  departmentName: string;
  content: string;
  preview: string;
  score: number;
  entityId: string;
  chunkIndex: number;
}

export interface EntitySummary {
  id: string;
  type: string;
  typeSlug: string;
  displayName: string;
  category: string;
  relationship: string;
  direction: string;
  properties: Record<string, string>;
}

export interface SituationContext {
  triggerEntity: {
    id: string;
    type: string;
    typeSlug: string;
    displayName: string;
    category: string;
    properties: Record<string, string>;
  };
  departments: DepartmentContext[];
  departmentKnowledge: RAGReference[];
  relatedEntities: {
    base: EntitySummary[];
    digital: EntitySummary[];
    external: EntitySummary[];
  };
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

// ── Department Discovery ─────────────────────────────────────────────────────

async function findRelevantDepartments(
  operatorId: string,
  entityId: string,
  category: string | null,
  parentDepartmentId: string | null,
): Promise<string[]> {
  let candidateDeptIds: string[] = [];

  // Path A — base or internal category
  if (category === "base" || category === "internal") {
    if (parentDepartmentId) candidateDeptIds = [parentDepartmentId];
    else return [];
  }

  // Path B — digital category
  else if (category === "digital") {
    const deptRels = await prisma.relationship.findMany({
      where: {
        OR: [
          { fromEntityId: entityId, relationshipType: { slug: "department-member" } },
          { toEntityId: entityId, relationshipType: { slug: "department-member" } },
        ],
      },
      select: { fromEntityId: true, toEntityId: true },
    });
    const deptIds = deptRels.map((r) =>
      r.fromEntityId === entityId ? r.toEntityId : r.fromEntityId,
    );
    candidateDeptIds = [...new Set(deptIds)];
  }

  // Path C — external category
  else if (category === "external") {
    const rels = await prisma.relationship.findMany({
      where: {
        OR: [{ fromEntityId: entityId }, { toEntityId: entityId }],
        relationshipType: { slug: { not: "department-member" } },
      },
      select: { fromEntityId: true, toEntityId: true },
    });
    const relatedIds = [
      ...new Set(
        rels
          .flatMap((r) => [r.fromEntityId, r.toEntityId])
          .filter((id) => id !== entityId),
      ),
    ];

    if (relatedIds.length === 0) return [];

    const [withParent, deptMemberRels] = await Promise.all([
      prisma.entity.findMany({
        where: { id: { in: relatedIds }, parentDepartmentId: { not: null } },
        select: { parentDepartmentId: true },
      }),
      prisma.relationship.findMany({
        where: {
          OR: [
            { fromEntityId: { in: relatedIds }, relationshipType: { slug: "department-member" } },
            { toEntityId: { in: relatedIds }, relationshipType: { slug: "department-member" } },
          ],
        },
        select: { fromEntityId: true, toEntityId: true },
      }),
    ]);

    const deptIds = new Set<string>();
    for (const e of withParent) {
      if (e.parentDepartmentId) deptIds.add(e.parentDepartmentId);
    }
    for (const r of deptMemberRels) {
      deptIds.add(r.fromEntityId);
      deptIds.add(r.toEntityId);
    }
    for (const id of relatedIds) deptIds.delete(id);
    deptIds.delete(entityId);

    candidateDeptIds = [...deptIds];
  }

  if (candidateDeptIds.length === 0) return [];

  // Verify candidates are actually foundational entities
  const verifiedDepts = await prisma.entity.findMany({
    where: { id: { in: candidateDeptIds }, operatorId, category: "foundational", status: "active" },
    select: { id: true },
  });
  return verifiedDepts.map((d) => d.id);
}

// ── Department Context Loading ───────────────────────────────────────────────

async function loadDepartmentContext(
  operatorId: string,
  deptId: string,
): Promise<DepartmentContext> {
  const dept = await prisma.entity.findUnique({
    where: { id: deptId },
    select: { id: true, displayName: true, description: true },
  });

  const members = await prisma.entity.findMany({
    where: { operatorId, parentDepartmentId: deptId, category: "base", status: "active" },
    include: { propertyValues: { include: { property: { select: { slug: true } } } } },
  });

  let lead: { name: string; role: string } | null = null;
  for (const m of members) {
    const roleVal = m.propertyValues.find((pv) => pv.property.slug === "role")?.value;
    if (roleVal && /lead|manager|head|director/i.test(roleVal)) {
      lead = { name: m.displayName, role: roleVal };
      break;
    }
  }

  return {
    id: deptId,
    name: dept?.displayName ?? "Unknown Department",
    description: dept?.description ?? null,
    lead,
    memberCount: members.length,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function assembleSituationContext(
  operatorId: string,
  situationTypeId: string,
  triggerEntityId: string,
  triggerEventId?: string,
): Promise<SituationContext> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Step 1: Load trigger entity
  const [entityCtx, rawEntity] = await Promise.all([
    getEntityContext(operatorId, triggerEntityId),
    prisma.entity.findUnique({
      where: { id: triggerEntityId },
      select: {
        category: true,
        parentDepartmentId: true,
        entityType: { select: { slug: true, name: true } },
      },
    }),
  ]);

  const triggerEntity = entityCtx
    ? {
        id: entityCtx.id,
        type: entityCtx.typeName,
        typeSlug: entityCtx.typeSlug,
        displayName: entityCtx.displayName,
        category: rawEntity?.category ?? "digital",
        properties: entityCtx.properties,
      }
    : {
        id: triggerEntityId,
        type: "unknown",
        typeSlug: "unknown",
        displayName: triggerEntityId,
        category: rawEntity?.category ?? "digital",
        properties: {},
      };

  // Step 2: Find relevant departments
  const departmentIds = await findRelevantDepartments(
    operatorId,
    triggerEntityId,
    rawEntity?.category ?? null,
    rawEntity?.parentDepartmentId ?? null,
  );

  // Step 3: Load department context (parallel)
  const departments = await Promise.all(
    departmentIds.map((id) => loadDepartmentContext(operatorId, id)),
  );

  // Step 4: RAG retrieval
  const situationType = await prisma.situationType.findUnique({
    where: { id: situationTypeId },
    select: { description: true, name: true },
  });

  const entityTypeName = rawEntity?.entityType?.name ?? "entity";
  const ragQuery = `${situationType?.description ?? situationType?.name ?? "situation"} ${entityTypeName}`;

  let departmentKnowledge: RAGReference[] = [];
  try {
    const ragResults =
      departmentIds.length > 0
        ? await retrieveRelevantContext(ragQuery, operatorId, departmentIds, 8)
        : [];
    departmentKnowledge = ragResults.map((r) => ({
      documentName: r.documentName,
      departmentName: r.departmentName,
      content: r.content,
      preview: r.content.slice(0, 100),
      score: r.score,
      entityId: r.entityId,
      chunkIndex: r.chunkIndex,
    }));
  } catch (err) {
    console.warn("[context-assembly] RAG retrieval failed, continuing without document context:", err);
  }

  // Step 5: Load related entities grouped by category
  const [graphResult, events, priorSituations, capabilities, policyRules, businessCtx] =
    await Promise.all([
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

  // Fetch categories for neighbor nodes
  const neighborIds = graphResult.nodes
    .filter((n) => n.id !== triggerEntityId)
    .map((n) => n.id);
  const neighborEntities =
    neighborIds.length > 0
      ? await prisma.entity.findMany({
          where: { id: { in: neighborIds } },
          select: { id: true, category: true },
        })
      : [];
  const categoryMap = new Map(neighborEntities.map((e) => [e.id, e.category]));

  const allNeighbors: EntitySummary[] = graphResult.nodes
    .filter((n) => n.id !== triggerEntityId)
    .map((n) => {
      const edge = graphResult.edges.find(
        (e) =>
          (e.source === triggerEntityId && e.target === n.id) ||
          (e.target === triggerEntityId && e.source === n.id),
      );
      return {
        id: n.id,
        type: n.entityType,
        typeSlug: n.typeSlug,
        displayName: n.displayName,
        category: categoryMap.get(n.id) ?? "digital",
        relationship: edge?.label ?? "related",
        direction: edge?.source === triggerEntityId ? "outgoing" : "incoming",
        properties: n.properties,
      };
    });

  const relatedEntities = {
    base: allNeighbors.filter((n) => n.category === "base" || n.category === "foundational"),
    digital: allNeighbors.filter((n) => n.category === "digital" || n.category === "internal"),
    external: allNeighbors.filter((n) => n.category === "external"),
  };

  // Step 6: Events, priors, capabilities, policies, business context
  const recentEvents = events.map((e) => ({
    id: e.id,
    source: e.source,
    eventType: e.eventType,
    payload: safeParseJSON(e.payload),
    createdAt: e.createdAt.toISOString(),
  }));

  // Step 7: Resolve prior situation entity names
  const priorEntityIds = priorSituations
    .map((s) => s.triggerEntityId)
    .filter((id): id is string => !!id);
  const priorEntities =
    priorEntityIds.length > 0
      ? await prisma.entity.findMany({
          where: { id: { in: priorEntityIds } },
          select: { id: true, displayName: true },
        })
      : [];
  const priorEntityNameMap = new Map(priorEntities.map((e) => [e.id, e.displayName]));

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

  const availableActions = capabilities.map((c) => ({
    name: c.name,
    description: c.description,
    connector: c.connectorId,
    inputSchema: c.inputSchema ? safeParseJSON(c.inputSchema) : null,
    sideEffects: c.sideEffects ? safeParseJSON(c.sideEffects) : null,
  }));

  const policies = policyRules.map((p) => ({
    id: p.id,
    effect: p.effect,
    conditions: p.conditions ? safeParseJSON(p.conditions) : null,
  }));

  const bizCtxStr = businessCtx ? formatBusinessContext(businessCtx) : "";

  // Step 8: Return full context
  return {
    triggerEntity,
    departments,
    departmentKnowledge,
    relatedEntities,
    recentEvents,
    priorSituations: priorSits,
    availableActions,
    policies,
    businessContext: bizCtxStr,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeParseJSON(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
