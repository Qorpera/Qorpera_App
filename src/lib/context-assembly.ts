import { prisma } from "@/lib/db";
import { getEntityContext } from "@/lib/entity-resolution";
import { searchAround } from "@/lib/graph-traversal";
import { retrieveRelevantChunks } from "@/lib/rag/retriever";
import { embedChunks } from "@/lib/rag/embedder";
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
  entityId: string | null;
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

// ── Activity Intelligence Types (v3) ────────────────────────────────────────

interface ActivityTimelineBucket {
  period: string;
  emailSent: number;
  emailReceived: number;
  meetingsHeld: number;
  meetingMinutes: number;
  slackMessages: number;
  docsEdited: number;
  docsCreated: number;
  avgResponseTimeHours: number | null;
}

export interface ActivityTimeline {
  buckets: ActivityTimelineBucket[];
  trend: string;
  totalSignals: number;
}

interface CommunicationExcerpt {
  sourceType: string;
  content: string;
  metadata: {
    subject?: string;
    sender?: string;
    channel?: string;
    timestamp?: string;
    direction?: string;
  };
  score: number;
}

export interface CommunicationContext {
  excerpts: CommunicationExcerpt[];
  sourceBreakdown: Record<string, number>;
}

interface CrossDepartmentSignal {
  departmentName: string;
  departmentId: string;
  emailCount: number;
  meetingCount: number;
  slackMentions: number;
  lastActivityDate: string | null;
}

export interface CrossDepartmentContext {
  signals: CrossDepartmentSignal[];
}

export interface ConnectorCapability {
  provider: string;
  type: string;
  scope: "personal" | "company";
}

export interface ContextSectionMeta {
  section: string;
  itemCount: number;
  tokenEstimate: number;
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

  // v3 additions
  activityTimeline: ActivityTimeline;
  communicationContext: CommunicationContext;
  crossDepartmentSignals: CrossDepartmentContext;
  contextSections: ContextSectionMeta[];
  connectorCapabilities: ConnectorCapability[];

  // v3 day 4 additions
  workStreamContexts?: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    goal: { id: string; title: string; description: string } | null;
    items: Array<{ type: string; id: string; status: string; summary: string }>;
    parent: { id: string; title: string; description: string | null; itemCount: number } | null;
  }>;
  delegationSource?: {
    id: string;
    instruction: string;
    context: unknown;
    fromAiEntityId: string;
    fromAiEntityName: string | null;
  } | null;

  // v3 day 6: operational knowledge
  operationalInsights: OperationalInsightContext[];

  // Action cycles
  actionCycles: Array<{
    cycleNumber: number;
    triggerType: string;
    triggerSummary: string;
    steps: Array<{ title: string; completed: boolean; notes?: string }>;
  }>;
}

export interface OperationalInsightContext {
  id: string;
  insightType: string;
  description: string;
  confidence: number;
  promptModification: string | null;
  shareScope: string;
  sampleSize: number;
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

  // Home members
  const homeMembers = await prisma.entity.findMany({
    where: { operatorId, parentDepartmentId: deptId, category: "base", status: "active" },
    include: { propertyValues: { include: { property: { select: { slug: true } } } } },
  });

  // Cross-department members via department-member relationship
  const deptMemberRels = await prisma.relationship.findMany({
    where: {
      OR: [
        { toEntityId: deptId, relationshipType: { slug: "department-member" }, fromEntity: { category: "base", status: "active" } },
        { fromEntityId: deptId, relationshipType: { slug: "department-member" }, toEntity: { category: "base", status: "active" } },
      ],
    },
    select: { fromEntityId: true, toEntityId: true, metadata: true },
  });
  const crossIds = deptMemberRels
    .map(r => r.fromEntityId === deptId ? r.toEntityId : r.fromEntityId)
    .filter(id => !homeMembers.some(m => m.id === id));

  const crossMembers = crossIds.length > 0
    ? await prisma.entity.findMany({
        where: { id: { in: crossIds }, status: "active" },
        include: { propertyValues: { include: { property: { select: { slug: true } } } } },
      })
    : [];

  const allMembers = [...homeMembers, ...crossMembers];

  let lead: { name: string; role: string } | null = null;
  for (const m of allMembers) {
    // For cross-department members, check metadata role first
    const crossRel = deptMemberRels.find(r => r.fromEntityId === m.id || r.toEntityId === m.id);
    const crossRole = crossRel?.metadata ? JSON.parse(crossRel.metadata).role : null;
    const roleVal = crossRole || m.propertyValues.find((pv) => pv.property.slug === "role")?.value;
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
    memberCount: allMembers.length,
  };
}

// ── Activity Intelligence Loaders (v3) ───────────────────────────────────────

async function loadActivityTimeline(
  operatorId: string,
  entityId: string,
  relatedEntityIds: string[],
  days: number,
): Promise<ActivityTimeline> {
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const priorCutoff = new Date(cutoff.getTime() - days * 24 * 60 * 60 * 1000);

    // Fetch current period + prior period in one query (broad fetch, filter in app)
    const allSignals = await prisma.activitySignal.findMany({
      where: {
        operatorId,
        occurredAt: { gte: priorCutoff },
      },
      select: {
        signalType: true,
        actorEntityId: true,
        targetEntityIds: true,
        metadata: true,
        occurredAt: true,
      },
    });

    // Filter to signals relevant to this entity
    const relevantSignals = allSignals.filter((s) => {
      if (s.actorEntityId === entityId) return true;
      if (s.targetEntityIds) {
        try {
          const targets: string[] = JSON.parse(s.targetEntityIds);
          if (targets.includes(entityId)) return true;
        } catch {}
      }
      // Related entity is actor AND this entity is target
      if (s.actorEntityId && relatedEntityIds.includes(s.actorEntityId) && s.targetEntityIds) {
        try {
          const targets: string[] = JSON.parse(s.targetEntityIds);
          if (targets.includes(entityId)) return true;
        } catch {}
      }
      return false;
    });

    const currentSignals = relevantSignals.filter((s) => s.occurredAt >= cutoff);
    const priorSignals = relevantSignals.filter((s) => s.occurredAt < cutoff);

    // Bucket current signals
    const bucketDefs = [
      { period: "Last 7 days", minDays: 0, maxDays: 7 },
      { period: "Days 8-14", minDays: 7, maxDays: 14 },
      { period: "Days 15-30", minDays: 14, maxDays: 30 },
    ];

    const buckets: ActivityTimelineBucket[] = bucketDefs.map(({ period, minDays, maxDays }) => {
      const bucketStart = new Date(now.getTime() - maxDays * 24 * 60 * 60 * 1000);
      const bucketEnd = new Date(now.getTime() - minDays * 24 * 60 * 60 * 1000);
      const inBucket = currentSignals.filter(
        (s) => s.occurredAt >= bucketStart && s.occurredAt < bucketEnd,
      );

      let meetingMinutes = 0;
      const responseTimes: number[] = [];

      for (const s of inBucket) {
        if (s.signalType === "meeting_held" && s.metadata) {
          try {
            const meta = JSON.parse(s.metadata);
            if (meta.durationMinutes) meetingMinutes += Number(meta.durationMinutes);
          } catch {}
        }
        if (s.signalType === "email_response_time" && s.metadata) {
          try {
            const meta = JSON.parse(s.metadata);
            if (meta.responseTimeHours != null) responseTimes.push(Number(meta.responseTimeHours));
          } catch {}
        }
      }

      return {
        period,
        emailSent: inBucket.filter((s) => s.signalType === "email_sent").length,
        emailReceived: inBucket.filter((s) => s.signalType === "email_received").length,
        meetingsHeld: inBucket.filter((s) => s.signalType === "meeting_held").length,
        meetingMinutes,
        slackMessages: inBucket.filter(
          (s) => s.signalType === "slack_message" || s.signalType === "teams_message",
        ).length,
        docsEdited: inBucket.filter((s) => s.signalType === "doc_edited").length,
        docsCreated: inBucket.filter((s) => s.signalType === "doc_created").length,
        avgResponseTimeHours:
          responseTimes.length > 0
            ? Math.round((responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) * 10) / 10
            : null,
      };
    });

    // Trend: compare current vs prior email + meeting counts
    const currentEmail = currentSignals.filter(
      (s) => s.signalType === "email_sent" || s.signalType === "email_received",
    ).length;
    const priorEmail = priorSignals.filter(
      (s) => s.signalType === "email_sent" || s.signalType === "email_received",
    ).length;
    const currentMeetings = currentSignals.filter((s) => s.signalType === "meeting_held").length;
    const priorMeetings = priorSignals.filter((s) => s.signalType === "meeting_held").length;

    const trendParts: string[] = [];
    if (priorEmail > 0) {
      const pct = Math.round(((currentEmail - priorEmail) / priorEmail) * 100);
      trendParts.push(`Email volume ${pct >= 0 ? "↑" : "↓"}${Math.abs(pct)}%`);
    } else if (currentEmail > 0) {
      trendParts.push(`Email volume: ${currentEmail} (no prior data)`);
    }
    if (priorMeetings > 0) {
      const pct = Math.round(((currentMeetings - priorMeetings) / priorMeetings) * 100);
      trendParts.push(`meetings ${pct >= 0 ? "↑" : "↓"}${Math.abs(pct)}%`);
    } else if (currentMeetings > 0) {
      trendParts.push(`meetings: ${currentMeetings} (no prior data)`);
    }

    return {
      buckets,
      trend: trendParts.length > 0 ? trendParts.join(", ") + " vs prior 30d" : "No trend data available",
      totalSignals: currentSignals.length,
    };
  } catch (err) {
    console.warn("[context-assembly] loadActivityTimeline failed:", err);
    return { buckets: [], trend: "No trend data available", totalSignals: 0 };
  }
}

async function loadCommunicationContext(
  operatorId: string,
  entityId: string,
  situationDescription: string,
  departmentIds: string[],
  limit: number,
): Promise<CommunicationContext> {
  try {
    const [queryEmbedding] = await embedChunks([situationDescription]);
    if (!queryEmbedding) return { excerpts: [], sourceBreakdown: {} };

    const sourceTypes = ["email", "slack_message", "teams_message"];

    // Resolve related entities so we find content tagged with communication
    // counterparts (e.g. trigger entity is the recipient, content is tagged
    // with the sender's entityId)
    const relatedEntityIds = await prisma.relationship.findMany({
      where: {
        OR: [{ fromEntityId: entityId }, { toEntityId: entityId }],
      },
      select: { fromEntityId: true, toEntityId: true },
      take: 20,
    });
    const participantIds = [
      entityId,
      ...new Set(
        relatedEntityIds.flatMap((r) =>
          [r.fromEntityId, r.toEntityId].filter((id) => id !== entityId),
        ),
      ),
    ];

    // Primary: entity-scoped results (trigger entity + related entities)
    // Reasoning needs full department context for situation analysis, not user-scoped content
    const entityResults = await retrieveRelevantChunks(operatorId, queryEmbedding, {
      limit,
      sourceTypes,
      entityIds: participantIds,
      departmentIds: departmentIds.length > 0 ? departmentIds : undefined,
      minScore: 0.3,
      skipUserFilter: true,
    });

    // Secondary: broader departmental results without entity filter
    let allResults = entityResults;
    if (entityResults.length < limit) {
      const broaderResults = await retrieveRelevantChunks(operatorId, queryEmbedding, {
        limit,
        sourceTypes,
        departmentIds: departmentIds.length > 0 ? departmentIds : undefined,
        minScore: 0.3,
        skipUserFilter: true,
      });
      // Merge, preferring entity-matched, dedup by id
      const seenIds = new Set(entityResults.map((r) => r.id));
      const additional = broaderResults.filter((r) => !seenIds.has(r.id));
      allResults = [...entityResults, ...additional].slice(0, limit);
    }

    const excerpts: CommunicationExcerpt[] = allResults.map((r) => {
      const meta = r.metadata ?? {};
      return {
        sourceType: r.sourceType,
        content: r.content,
        metadata: {
          subject: meta.subject as string | undefined,
          sender: meta.sender as string | undefined,
          channel: meta.channel as string | undefined,
          timestamp: meta.timestamp as string | undefined,
          direction: meta.direction as string | undefined,
        },
        score: r.score,
      };
    });

    const sourceBreakdown: Record<string, number> = {};
    for (const e of excerpts) {
      sourceBreakdown[e.sourceType] = (sourceBreakdown[e.sourceType] ?? 0) + 1;
    }

    return { excerpts, sourceBreakdown };
  } catch (err) {
    console.warn("[context-assembly] loadCommunicationContext failed:", err);
    return { excerpts: [], sourceBreakdown: {} };
  }
}

async function loadCrossDepartmentSignals(
  operatorId: string,
  entityId: string,
  entityCategory: string | null,
  situationDepartmentIds: string[],
  days: number,
): Promise<CrossDepartmentContext> {
  try {
    // Only meaningful for external entities
    if (entityCategory !== "external") return { signals: [] };

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const allSignals = await prisma.activitySignal.findMany({
      where: {
        operatorId,
        occurredAt: { gte: cutoff },
      },
      select: {
        signalType: true,
        targetEntityIds: true,
        departmentIds: true,
        occurredAt: true,
      },
    });

    // Filter to signals targeting this entity
    const targetSignals = allSignals.filter((s) => {
      if (!s.targetEntityIds) return false;
      try {
        const targets: string[] = JSON.parse(s.targetEntityIds);
        return targets.includes(entityId);
      } catch {
        return false;
      }
    });

    // Group by department, excluding the situation's own departments
    const sitDeptSet = new Set(situationDepartmentIds);
    const deptMap = new Map<string, { emails: number; meetings: number; messages: number; lastDate: Date | null }>();

    for (const s of targetSignals) {
      let deptIds: string[] = [];
      if (s.departmentIds) {
        try { deptIds = JSON.parse(s.departmentIds); } catch {}
      }
      for (const deptId of deptIds) {
        if (sitDeptSet.has(deptId)) continue;
        const entry = deptMap.get(deptId) ?? { emails: 0, meetings: 0, messages: 0, lastDate: null };
        if (s.signalType === "email_sent" || s.signalType === "email_received") entry.emails++;
        if (s.signalType === "meeting_held") entry.meetings++;
        if (s.signalType === "slack_message" || s.signalType === "teams_message") entry.messages++;
        if (!entry.lastDate || s.occurredAt > entry.lastDate) entry.lastDate = s.occurredAt;
        deptMap.set(deptId, entry);
      }
    }

    if (deptMap.size === 0) return { signals: [] };

    // Resolve department names
    const deptIds = [...deptMap.keys()];
    const deptEntities = await prisma.entity.findMany({
      where: { id: { in: deptIds } },
      select: { id: true, displayName: true },
    });
    const nameMap = new Map(deptEntities.map((e) => [e.id, e.displayName]));

    const signals: CrossDepartmentSignal[] = deptIds
      .map((deptId) => {
        const d = deptMap.get(deptId)!;
        return {
          departmentId: deptId,
          departmentName: nameMap.get(deptId) ?? "Unknown Department",
          emailCount: d.emails,
          meetingCount: d.meetings,
          slackMentions: d.messages,
          lastActivityDate: d.lastDate?.toISOString() ?? null,
        };
      })
      .sort((a, b) => (b.emailCount + b.meetingCount + b.slackMentions) - (a.emailCount + a.meetingCount + a.slackMentions));

    return { signals };
  } catch (err) {
    console.warn("[context-assembly] loadCrossDepartmentSignals failed:", err);
    return { signals: [] };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function assembleSituationContext(
  operatorId: string,
  situationTypeId: string,
  triggerEntityId: string,
  triggerEventId?: string,
  situationId?: string,
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

  // Step 4: RAG retrieval + archetype lookup
  const situationType = await prisma.situationType.findUnique({
    where: { id: situationTypeId },
    select: { description: true, name: true, archetypeSlug: true },
  });

  const entityTypeName = rawEntity?.entityType?.name ?? "entity";
  const ragQuery = `${situationType?.description ?? situationType?.name ?? "situation"} ${entityTypeName}`;

  let departmentKnowledge: RAGReference[] = [];
  try {
    if (departmentIds.length > 0) {
      const [ragEmbedding] = await embedChunks([ragQuery]);
      if (ragEmbedding) {
        // Reasoning needs full department context for situation analysis, not user-scoped content
        const ragResults = await retrieveRelevantChunks(operatorId, ragEmbedding, {
          limit: 8,
          departmentIds,
          minScore: 0.3,
          includeParentContext: true,
          skipUserFilter: true,
        });
        departmentKnowledge = ragResults.map((r) => ({
          documentName: (r.metadata?.fileName as string) ?? "Unknown",
          departmentName: "—",
          content: r.content,
          preview: r.content.slice(0, 100),
          score: r.score,
          entityId: r.entityId,
          chunkIndex: r.chunkIndex,
        }));
      }
    }
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
      (async () => {
        let typeIds = [situationTypeId];
        if (situationType?.archetypeSlug) {
          const siblings = await prisma.situationType.findMany({
            where: { operatorId, archetypeSlug: situationType.archetypeSlug },
            select: { id: true },
          });
          if (siblings.length > 0) {
            typeIds = siblings.map(t => t.id);
          }
        }
        return prisma.situation.findMany({
          where: {
            operatorId,
            situationTypeId: { in: typeIds },
            status: { in: ["resolved", "closed"] },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        });
      })(),
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

  // Step 5b: Load activity intelligence (v3) — needs neighborIds from graph traversal
  const [activityTimeline, communicationContext, crossDepartmentSignals] = await Promise.all([
    loadActivityTimeline(operatorId, triggerEntityId, neighborIds, 30),
    loadCommunicationContext(operatorId, triggerEntityId, ragQuery, departmentIds, 8),
    loadCrossDepartmentSignals(operatorId, triggerEntityId, rawEntity?.category ?? null, departmentIds, 30),
  ]);

  // Step 5c: Load active connectors for draft payload provider resolution
  const activeConnectors = await prisma.sourceConnector.findMany({
    where: { operatorId, status: "active", deletedAt: null },
    select: { provider: true, name: true, userId: true },
  });

  // Map providers to their capability types for the reasoning engine
  const PROVIDER_TYPES: Record<string, string[]> = {
    google: ["gmail", "google_drive", "google_calendar", "google_sheets"],
    microsoft: ["outlook", "onedrive", "teams", "microsoft_calendar"],
    slack: ["slack"],
    hubspot: ["hubspot"],
    stripe: ["stripe"],
  };

  const seen = new Set<string>();
  const connectorCapabilities: ConnectorCapability[] = activeConnectors.flatMap((c) => {
    const types = PROVIDER_TYPES[c.provider] ?? [c.provider];
    return types
      .filter((type) => {
        const key = `${c.provider}:${type}:${c.userId ? "personal" : "company"}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((type) => ({
        provider: c.provider,
        type,
        scope: c.userId ? "personal" as const : "company" as const,
      }));
  });

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

  // Step 8: Load workstream + delegation context (requires situationId)
  let workStreamContexts: SituationContext["workStreamContexts"] = [];
  let delegationSource: SituationContext["delegationSource"] = null;

  if (situationId) {
    const wsItems = await prisma.workStreamItem.findMany({
      where: { itemType: "situation", itemId: situationId },
      select: { workStreamId: true },
    });
    if (wsItems.length > 0) {
      const { getWorkStreamContext } = await import("@/lib/workstreams");
      const contexts = await Promise.all(wsItems.map(i => getWorkStreamContext(i.workStreamId)));
      workStreamContexts = contexts.filter((c): c is NonNullable<typeof c> => c !== null);
    }

    const sitWithDelegation = await prisma.situation.findUnique({
      where: { id: situationId },
      select: { delegationId: true },
    });
    if (sitWithDelegation?.delegationId) {
      const delegation = await prisma.delegation.findUnique({
        where: { id: sitWithDelegation.delegationId },
        select: { id: true, instruction: true, context: true, fromAiEntityId: true },
      });
      if (delegation) {
        const fromEntity = await prisma.entity.findUnique({
          where: { id: delegation.fromAiEntityId },
          select: { displayName: true },
        });
        delegationSource = {
          id: delegation.id,
          instruction: delegation.instruction,
          context: delegation.context ? safeParseJSON(delegation.context) : null,
          fromAiEntityId: delegation.fromAiEntityId,
          fromAiEntityName: fromEntity?.displayName ?? null,
        };
      }
    }
  }

  // Step 9: Load operational insights
  const primaryDeptId = departments.length > 0 ? departments[0].id : null;
  // Resolve AI entity for the situation's assigned user (for personal insight loading)
  let insightAiEntityId: string | null = null;
  if (situationId) {
    const sit = await prisma.situation.findUnique({
      where: { id: situationId },
      select: { assignedUserId: true },
    });
    if (sit?.assignedUserId) {
      const aiEnt = await prisma.entity.findFirst({
        where: { operatorId, ownerUserId: sit.assignedUserId, entityType: { slug: "ai-agent" } },
        select: { id: true },
      });
      insightAiEntityId = aiEnt?.id ?? null;
    }
  }
  const operationalInsights = await loadOperationalInsights(
    operatorId,
    insightAiEntityId,
    primaryDeptId,
    situationTypeId,
  );

  // Step 10: Build telemetry and return full context
  const contextSections: ContextSectionMeta[] = [
    { section: "triggerEntity", itemCount: 1, tokenEstimate: Math.ceil(JSON.stringify(triggerEntity).length / 4) },
    { section: "departments", itemCount: departments.length, tokenEstimate: Math.ceil(JSON.stringify(departments).length / 4) },
    { section: "departmentKnowledge", itemCount: departmentKnowledge.length, tokenEstimate: Math.ceil(departmentKnowledge.reduce((sum, r) => sum + r.content.length, 0) / 4) },
    { section: "activityTimeline", itemCount: activityTimeline.totalSignals, tokenEstimate: Math.ceil(JSON.stringify(activityTimeline).length / 4) },
    { section: "communicationContext", itemCount: communicationContext.excerpts.length, tokenEstimate: Math.ceil(communicationContext.excerpts.reduce((sum, e) => sum + e.content.length, 0) / 4) },
    { section: "crossDepartmentSignals", itemCount: crossDepartmentSignals.signals.length, tokenEstimate: Math.ceil(JSON.stringify(crossDepartmentSignals).length / 4) },
    { section: "relatedEntities", itemCount: allNeighbors.length, tokenEstimate: Math.ceil(JSON.stringify(relatedEntities).length / 4) },
    { section: "recentEvents", itemCount: recentEvents.length, tokenEstimate: Math.ceil(JSON.stringify(recentEvents).length / 4) },
    { section: "priorSituations", itemCount: priorSits.length, tokenEstimate: Math.ceil(JSON.stringify(priorSits).length / 4) },
    ...(workStreamContexts.length > 0 ? [{ section: "workstream_context", itemCount: workStreamContexts.reduce((s, w) => s + w.items.length, 0), tokenEstimate: Math.ceil(JSON.stringify(workStreamContexts).length / 4) }] : []),
    ...(delegationSource ? [{ section: "delegation_source", itemCount: 1, tokenEstimate: Math.ceil(JSON.stringify(delegationSource).length / 4) }] : []),
    ...(operationalInsights.length > 0 ? [{ section: "operational_knowledge", itemCount: operationalInsights.length, tokenEstimate: Math.ceil(JSON.stringify(operationalInsights).length / 4) }] : []),
  ];

  // Load completed action cycles for this situation
  const actionCycles = situationId ? await (async () => {
    const completedCycles = await prisma.situationCycle.findMany({
      where: { situationId, status: "completed" },
      orderBy: { cycleNumber: "asc" },
      include: {
        executionPlan: {
          include: { steps: { orderBy: { sequenceOrder: "asc" } } },
        },
      },
    });
    return completedCycles.map((c) => ({
      cycleNumber: c.cycleNumber,
      triggerType: c.triggerType,
      triggerSummary: c.triggerSummary,
      steps: (c.executionPlan?.steps ?? []).map((s) => ({
        title: s.title,
        completed: s.status === "completed",
        notes: s.outputResult ? (() => {
          try {
            const r = JSON.parse(s.outputResult!);
            return r.notes || r.description || undefined;
          } catch { return undefined; }
        })() : undefined,
      })),
    }));
  })() : [];

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
    activityTimeline,
    communicationContext,
    crossDepartmentSignals,
    contextSections,
    connectorCapabilities,
    workStreamContexts,
    delegationSource,
    operationalInsights,
    actionCycles,
  };
}

// ── Operational Insights ─────────────────────────────────────────────────────

export async function loadOperationalInsights(
  operatorId: string,
  aiEntityId: string | null,
  departmentId: string | null,
  situationTypeId?: string,
): Promise<OperationalInsightContext[]> {
  const orConditions: Record<string, unknown>[] = [
    { shareScope: "operator" },
  ];

  if (aiEntityId) {
    orConditions.push({ aiEntityId, shareScope: "personal" });
  }

  if (departmentId) {
    orConditions.push({ departmentId, shareScope: "department" });
  }

  const allInsights = await prisma.operationalInsight.findMany({
    where: {
      operatorId,
      status: "active",
      OR: orConditions,
    },
    orderBy: { confidence: "desc" },
    take: 50, // fetch more, filter by situationType below
  });

  // Filter to insights relevant to this situation type
  const relevantInsights = allInsights.filter((insight) => {
    if (insight.shareScope === "operator") return true; // operator-scoped apply broadly
    try {
      const evidence = JSON.parse(insight.evidence);
      return (
        !evidence?.situationTypeId ||
        !situationTypeId ||
        evidence.situationTypeId === situationTypeId
      );
    } catch {
      return true;
    }
  }).slice(0, 20);

  return relevantInsights.map((i) => {
    let sampleSize = 0;
    try {
      const evidence = JSON.parse(i.evidence);
      sampleSize = evidence.sampleSize ?? 0;
    } catch {}
    return {
      id: i.id,
      insightType: i.insightType,
      description: i.description,
      confidence: i.confidence,
      promptModification: i.promptModification,
      shareScope: i.shareScope,
      sampleSize,
    };
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeParseJSON(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
