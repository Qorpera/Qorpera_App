import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// ─── Types ───────────────────────────────────────────────

export type ConnectorHealth = {
  id: string;
  name: string;
  provider: string;
  status: string; // active, error, disconnected, paused, pending
  lastSyncAt: string | null;
  entityCount: number;
  issue: string | null;
  action: { label: string; href: string } | null;
};

export type DataPipelineHealth = {
  connectors: ConnectorHealth[];
  totalEntities: number;
  lastIngestion: string | null;
  status: "healthy" | "degraded" | "disconnected" | "empty";
};

export type KnowledgeHealth = {
  people: {
    count: number;
    withRoles: number;
    withReportingLines: number;
    gaps: string[];
  };
  documents: {
    count: number;           // InternalDocument count (uploaded docs)
    ragChunks: number;       // Knowledge chunks (uploaded + drive + slack) with department assignment
    operationalChunks: number; // Operational data chunks (email + calendar) with department assignment
    staleCount: number;
  };
  operationalInsights: {
    count: number;
    withPromptMods: number;
    situationTypeCoverage: {
      typeId: string;
      typeName: string;
      hasInsights: boolean;
      insightCount: number;
    }[];
  };
  status: "complete" | "partial" | "minimal" | "empty";
};

export type SituationTypeHealth = {
  id: string;
  name: string;
  autonomyLevel: string;
  // last7d, last30d, confirmationRate are read LIVE by the API route
  lastDetectionAt: string | null;
  diagnosis:
    | "healthy"
    | "no_data"
    | "no_matches"
    | "low_accuracy"
    | "inactive"
    | "new";
  diagnosisDetail: string;
  action: { label: string; href: string } | null;
};

export type DetectionHealth = {
  situationTypes: SituationTypeHealth[];
  status: "active" | "sparse" | "silent" | "unconfigured";
};

export type DepartmentSnapshot = {
  departmentId: string;
  departmentName: string;
  dataPipeline: DataPipelineHealth;
  knowledge: KnowledgeHealth;
  detection: DetectionHealth;
  overallStatus: "healthy" | "attention" | "critical" | "unconfigured";
  criticalIssueCount: number;
};

export type OperatorSnapshot = {
  operatorId: string;
  departments: DepartmentSnapshot[];
  overallStatus: "healthy" | "attention" | "critical";
  criticalIssueCount: number;
  staleJobCount: number;
  computedAt: string;
};

// ─── Extended types with live data (used by API route + UI) ──

export type SituationTypeHealthWithLive = SituationTypeHealth & {
  detectedCount: number;
  confirmedCount: number;
  dismissedCount: number;
  confirmationRate: number | null;
  last7d: { detected: number; confirmed: number; dismissed: number };
  last30d: { detected: number; confirmed: number; dismissed: number };
};

export type DetectionHealthWithLive = Omit<DetectionHealth, "situationTypes"> & {
  situationTypes: SituationTypeHealthWithLive[];
};

export type DepartmentSnapshotWithLive = Omit<DepartmentSnapshot, "detection"> & {
  detection: DetectionHealthWithLive;
};

export type OperatorSnapshotWithLive = Omit<OperatorSnapshot, "departments"> & {
  departments: DepartmentSnapshotWithLive[];
};

// ─── Detection logic types (mirrors situation-detector.ts) ───

type DetectionLogic = {
  mode: "structured" | "natural" | "hybrid" | "content";
  structured?: { entityType: string };
  preFilter?: { entityType: string };
};

function safeParseDetection(str: string): DetectionLogic {
  try {
    return JSON.parse(str);
  } catch {
    return { mode: "natural" };
  }
}

function getTargetEntityType(detection: DetectionLogic): string | null {
  if (detection.structured?.entityType) return detection.structured.entityType;
  if (detection.preFilter?.entityType) return detection.preFilter.entityType;
  return null;
}

// ─── Data Pipeline ───────────────────────────────────────

async function computeDataPipeline(
  operatorId: string,
  departmentEntityId: string,
): Promise<DataPipelineHealth> {
  const connectors = await prisma.sourceConnector.findMany({
    where: { operatorId, deletedAt: null },
    select: {
      id: true,
      name: true,
      provider: true,
      status: true,
      lastSyncAt: true,
      lastError: true,
      consecutiveFailures: true,
    },
  });

  const totalEntities = await prisma.entity.count({
    where: {
      operatorId,
      parentDepartmentId: departmentEntityId,
      status: "active",
      category: { in: ["digital", "external"] },
    },
  });

  // Latest sync log per connector
  const connectorIds = connectors.map((c) => c.id);
  const latestSyncs: { connectorId: string; createdAt: Date }[] =
    connectorIds.length > 0
      ? await prisma.syncLog.findMany({
          where: { connectorId: { in: connectorIds } },
          orderBy: { createdAt: "desc" },
          distinct: ["connectorId"],
          select: { connectorId: true, createdAt: true },
        })
      : [];
  const syncMap = new Map(latestSyncs.map((s) => [s.connectorId, s.createdAt]));

  // Slack channel bindings to this department
  const slackBindings = await prisma.slackChannelMapping.findMany({
    where: { operatorId, departmentId: departmentEntityId },
    select: { connectorId: true },
  });
  const boundConnectorIds = new Set(slackBindings.map((b) => b.connectorId));

  // Count content chunks per source connector (more meaningful than entity counts)
  const chunkCountsByConnector = await prisma.contentChunk.groupBy({
    by: ["connectorId"],
    where: {
      operatorId,
      connectorId: { not: null },
    },
    _count: true,
  });
  const connectorChunkMap = new Map(
    chunkCountsByConnector.map((g) => [g.connectorId, g._count]),
  );

  const allConnectors: ConnectorHealth[] = connectors.map((c) => {
    const effectiveStatus =
      c.consecutiveFailures >= 3 && c.status === "active" ? "error" : c.status;
    const lastSync = syncMap.get(c.id);
    const entityCount = connectorChunkMap.get(c.id) ?? 0;

    let issue: string | null = null;
    let action: { label: string; href: string } | null = null;

    switch (effectiveStatus) {
      case "error":
        issue = c.lastError
          ? `Sync failing — ${c.lastError.slice(0, 120)}`
          : "Sync failing";
        action = { label: "Reconnect", href: "/settings?tab=connections" };
        break;
      case "disconnected":
        issue = "Authentication expired";
        action = { label: "Reconnect", href: "/settings?tab=connections" };
        break;
      case "pending":
        issue = "Setup incomplete";
        action = { label: "Complete setup", href: "/settings?tab=connections" };
        break;
      case "paused":
        issue = "Connector paused";
        break;
    }

    return {
      id: c.id,
      name: c.name || c.provider,
      provider: c.provider,
      status: effectiveStatus,
      lastSyncAt: lastSync?.toISOString() ?? c.lastSyncAt?.toISOString() ?? null,
      entityCount,
      issue,
      action,
    };
  });

  // Only return connectors relevant to this department
  const relevantConnectors = allConnectors.filter(
    (c) => boundConnectorIds.has(c.id) || c.provider !== "slack",
  );

  let pipelineStatus: DataPipelineHealth["status"];
  if (relevantConnectors.length === 0) {
    pipelineStatus = "empty";
  } else {
    const healthyCount = relevantConnectors.filter((c) => c.status === "active").length;
    if (healthyCount === relevantConnectors.length && totalEntities > 0) {
      pipelineStatus = "healthy";
    } else if (healthyCount > 0) {
      pipelineStatus = "degraded";
    } else {
      pipelineStatus = "disconnected";
    }
  }

  const allSyncDates = relevantConnectors
    .map((c) => c.lastSyncAt)
    .filter(Boolean) as string[];
  const lastIngestion =
    allSyncDates.length > 0 ? allSyncDates.sort().reverse()[0] : null;

  return {
    connectors: relevantConnectors,
    totalEntities,
    lastIngestion,
    status: pipelineStatus,
  };
}

// ─── Knowledge ───────────────────────────────────────────

async function computeKnowledge(
  operatorId: string,
  departmentEntityId: string,
): Promise<KnowledgeHealth> {
  // People: base entities in this department
  const peopleCount = await prisma.entity.count({
    where: {
      operatorId,
      parentDepartmentId: departmentEntityId,
      category: "base",
      status: "active",
    },
  });

  // People with roles
  const roleProperties = await prisma.entityProperty.findMany({
    where: { slug: { contains: "role" }, entityType: { operatorId } },
    select: { id: true },
  });
  const titleProperties = await prisma.entityProperty.findMany({
    where: { slug: { contains: "title" }, entityType: { operatorId } },
    select: { id: true },
  });
  const rolePropertyIds = Array.from(
    new Set([...roleProperties.map((p) => p.id), ...titleProperties.map((p) => p.id)]),
  );

  let withRoles = 0;
  if (rolePropertyIds.length > 0) {
    const entitiesWithRoles = await prisma.propertyValue.findMany({
      where: {
        propertyId: { in: rolePropertyIds },
        entity: {
          operatorId,
          parentDepartmentId: departmentEntityId,
          category: "base",
          status: "active",
        },
      },
      select: { entityId: true },
      distinct: ["entityId"],
    });
    withRoles = entitiesWithRoles.length;
  }

  // Reporting lines
  const reportsToType = await prisma.relationshipType.findFirst({
    where: { operatorId, slug: "reports-to" },
    select: { id: true },
  });

  let withReportingLines = 0;
  if (reportsToType) {
    const reportingEntities = await prisma.relationship.findMany({
      where: {
        relationshipTypeId: reportsToType.id,
        fromEntity: {
          operatorId,
          parentDepartmentId: departmentEntityId,
          category: "base",
          status: "active",
        },
      },
      select: { fromEntityId: true },
      distinct: ["fromEntityId"],
    });
    withReportingLines = reportingEntities.length;
  }

  // Gaps
  const gaps: string[] = [];
  if (withRoles < peopleCount && peopleCount > 0) {
    const missing = peopleCount - withRoles;
    gaps.push(
      `${missing} team member${missing === 1 ? " has" : "s have"} no role defined`,
    );
  }
  if (withReportingLines === 0 && peopleCount > 1) {
    gaps.push("No reporting structure defined");
  }

  // Documents
  const docCount = await prisma.internalDocument.count({
    where: { operatorId, departmentId: departmentEntityId },
  });

  // RAG chunks — knowledge-type ContentChunks linked to this department
  // departmentIds is a JSON string array — use raw SQL jsonb ? operator
  const ragChunkResult = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "ContentChunk"
    WHERE "operatorId" = ${operatorId}
      AND "sourceType" IN ('uploaded_doc', 'drive_doc', 'slack_message')
      AND "departmentIds" IS NOT NULL
      AND "departmentIds" != 'null'
      AND "departmentIds" != '[]'
      AND "departmentIds"::jsonb ? ${departmentEntityId}
  `;
  const ragChunks = Number(ragChunkResult[0]?.count ?? 0);

  // Operational data chunks (email + calendar) linked to this department
  const operationalChunkResult = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "ContentChunk"
    WHERE "operatorId" = ${operatorId}
      AND "sourceType" IN ('email', 'calendar_note')
      AND "departmentIds" IS NOT NULL
      AND "departmentIds" != 'null'
      AND "departmentIds" != '[]'
      AND "departmentIds"::jsonb ? ${departmentEntityId}
  `;
  const operationalChunks = Number(operationalChunkResult[0]?.count ?? 0);

  // Stale docs: updated more than 90 days ago
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const staleCount = await prisma.internalDocument.count({
    where: {
      operatorId,
      departmentId: departmentEntityId,
      updatedAt: { lt: ninetyDaysAgo },
    },
  });

  // Operational insights
  const insights = await prisma.operationalInsight.findMany({
    where: {
      operatorId,
      status: "active",
      OR: [
        { shareScope: "department", departmentId: departmentEntityId },
        { shareScope: "operator" },
      ],
    },
    select: { id: true, promptModification: true },
  });
  const insightCount = insights.length;
  const withPromptMods = insights.filter((i) => i.promptModification !== null).length;

  // Situation type coverage
  const deptSituationTypes = await prisma.situationType.findMany({
    where: { operatorId, scopeEntityId: departmentEntityId },
    select: { id: true, name: true },
  });

  const situationTypeCoverage = deptSituationTypes.map((st) => ({
    typeId: st.id,
    typeName: st.name,
    hasInsights: insightCount > 0,
    insightCount,
  }));

  // Knowledge status
  let knowledgeStatus: KnowledgeHealth["status"];
  if (peopleCount > 0 && docCount > 0 && insightCount > 0) {
    knowledgeStatus = "complete";
  } else if (peopleCount > 0 && (docCount > 0 || insightCount > 0 || ragChunks > 0)) {
    knowledgeStatus = "partial";
  } else if (peopleCount > 0) {
    knowledgeStatus = "minimal";
  } else if (ragChunks > 0) {
    knowledgeStatus = "partial";
  } else {
    knowledgeStatus = "empty";
  }

  return {
    people: { count: peopleCount, withRoles, withReportingLines, gaps },
    documents: { count: docCount, ragChunks, operationalChunks, staleCount },
    operationalInsights: { count: insightCount, withPromptMods, situationTypeCoverage },
    status: knowledgeStatus,
  };
}

// ─── Detection ───────────────────────────────────────────

async function computeDetection(
  operatorId: string,
  departmentEntityId: string,
): Promise<DetectionHealth> {
  const situationTypes = await prisma.situationType.findMany({
    where: { operatorId, scopeEntityId: departmentEntityId },
    select: {
      id: true,
      name: true,
      autonomyLevel: true,
      enabled: true,
      detectionLogic: true,
      detectedCount: true,
      confirmedCount: true,
      dismissedCount: true,
      createdAt: true,
    },
  });

  const typeIds = situationTypes.map((st) => st.id);

  // Last detection per situation type
  const lastDetections: { situationTypeId: string; createdAt: Date }[] =
    typeIds.length > 0
      ? await prisma.situation.findMany({
          where: { situationTypeId: { in: typeIds } },
          orderBy: { createdAt: "desc" },
          distinct: ["situationTypeId"],
          select: { situationTypeId: true, createdAt: true },
        })
      : [];
  const lastDetectionMap = new Map(
    lastDetections.map((d) => [d.situationTypeId, d.createdAt]),
  );

  // Preload all entity type slugs for this operator
  const entityTypes = await prisma.entityType.findMany({
    where: { operatorId },
    select: { slug: true },
  });
  const entityTypeSlugs = new Set(entityTypes.map((et) => et.slug));

  const situationTypeHealthList: SituationTypeHealth[] = await Promise.all(
    situationTypes.map(async (st) => {
      const lastDetection = lastDetectionMap.get(st.id) ?? null;
      const detection = safeParseDetection(st.detectionLogic);
      const targetSlug = getTargetEntityType(detection);

      let diagnosis: SituationTypeHealth["diagnosis"];
      let diagnosisDetail: string;
      let action: SituationTypeHealth["action"] = null;

      const daysSinceCreation = Math.floor(
        (Date.now() - st.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      // a) Content mode — skip entity matching
      if (detection.mode === "content") {
        if (!st.enabled) {
          diagnosis = "inactive";
          diagnosisDetail =
            "Content detection is disabled and will not evaluate new messages.";
          action = { label: "Enable", href: `/situations?configure=${st.id}` };
        } else if (st.detectedCount === 0 && daysSinceCreation < 7) {
          diagnosis = "new";
          diagnosisDetail =
            "Recently created — detection will start once matching messages flow in.";
        } else if (st.detectedCount === 0) {
          diagnosis = "no_data";
          diagnosisDetail =
            "No messages have matched this type. Check that communication connectors are syncing.";
          action = { label: "Connect tools", href: "/settings?tab=connections" };
        } else if (
          st.detectedCount > 30 &&
          st.confirmedCount / st.detectedCount < 0.4
        ) {
          const rate = Math.round((st.confirmedCount / st.detectedCount) * 100);
          diagnosis = "low_accuracy";
          diagnosisDetail = `Confirmation rate is ${rate}% — review trigger conditions or provide feedback`;
          action = { label: "Review", href: `/learning?type=${st.id}` };
        } else {
          diagnosis = "healthy";
          diagnosisDetail = "Operating normally";
        }
      }
      // Not enabled
      else if (!st.enabled) {
        diagnosis = "inactive";
        diagnosisDetail =
          "This situation type is disabled and will not detect new situations.";
        action = { label: "Enable", href: `/situations?configure=${st.id}` };
      }
      // b) Target entity type doesn't exist in schema
      else if (targetSlug && !entityTypeSlugs.has(targetSlug)) {
        diagnosis = "inactive";
        diagnosisDetail = `Detection references unknown entity type '${targetSlug}'`;
      }
      // c) Count entities of target type in department
      else if (targetSlug) {
        const entityCount = await prisma.entity.count({
          where: {
            operatorId,
            parentDepartmentId: departmentEntityId,
            status: "active",
            entityType: { slug: targetSlug },
          },
        });

        if (entityCount === 0) {
          const typeName = targetSlug.replace(/-/g, " ");
          diagnosis = "no_data";
          diagnosisDetail = `No ${typeName} data in this department — connect a data source that provides ${typeName} records`;
          action = { label: "Connect tools", href: "/settings?tab=connections" };
        }
        // d) Entities exist — check recent detections
        else if (st.detectedCount === 0 && daysSinceCreation > 7) {
          const typeName = targetSlug.replace(/-/g, " ");
          diagnosis = "no_matches";
          diagnosisDetail = `${entityCount} ${typeName} records synced but none match trigger conditions — all may be within normal parameters`;
        } else if (st.detectedCount === 0 && daysSinceCreation <= 7) {
          diagnosis = "new";
          diagnosisDetail =
            "Recently created — waiting for first detection cycle";
        }
        // e) Low accuracy check
        else if (
          st.detectedCount > 30 &&
          st.confirmedCount / st.detectedCount < 0.4
        ) {
          const rate = Math.round((st.confirmedCount / st.detectedCount) * 100);
          diagnosis = "low_accuracy";
          diagnosisDetail = `Confirmation rate is ${rate}% — review trigger conditions or provide feedback`;
          action = { label: "Review", href: `/learning?type=${st.id}` };
        }
        // f) Healthy
        else {
          diagnosis = "healthy";
          diagnosisDetail = "Operating normally";
        }
      }
      // No target entity type (natural language only) — fallback to count-based
      else {
        if (st.detectedCount === 0 && daysSinceCreation > 7) {
          diagnosis = "no_matches";
          diagnosisDetail =
            "No situations detected despite active data — review detection description";
          action = {
            label: "Review detection logic",
            href: `/situations?configure=${st.id}`,
          };
        } else if (st.detectedCount === 0) {
          diagnosis = "new";
          diagnosisDetail =
            "Recently created — waiting for first detection cycle";
        } else if (
          st.detectedCount > 30 &&
          st.confirmedCount / st.detectedCount < 0.4
        ) {
          const rate = Math.round((st.confirmedCount / st.detectedCount) * 100);
          diagnosis = "low_accuracy";
          diagnosisDetail = `Confirmation rate is ${rate}% — review trigger conditions or provide feedback`;
          action = { label: "Review", href: `/learning?type=${st.id}` };
        } else {
          diagnosis = "healthy";
          diagnosisDetail = "Operating normally";
        }
      }

      return {
        id: st.id,
        name: st.name,
        autonomyLevel: st.autonomyLevel,
        lastDetectionAt: lastDetection?.toISOString() ?? null,
        diagnosis,
        diagnosisDetail,
        action,
      };
    }),
  );

  // Detection status logic
  let detectionStatus: DetectionHealth["status"];
  if (situationTypeHealthList.length === 0) {
    detectionStatus = "unconfigured";
  } else {
    const healthyWithRecent = situationTypeHealthList.filter(
      (s) => s.diagnosis === "healthy" && s.lastDetectionAt !== null,
    ).length;
    const noDataOrInactive = situationTypeHealthList.filter(
      (s) => s.diagnosis === "no_data" || s.diagnosis === "inactive",
    ).length;
    const noMatchesOrNew = situationTypeHealthList.filter(
      (s) => s.diagnosis === "no_matches" || s.diagnosis === "new",
    ).length;

    if (healthyWithRecent > 0) {
      detectionStatus = "active";
    } else if (noMatchesOrNew > 0) {
      detectionStatus = "sparse";
    } else if (noDataOrInactive === situationTypeHealthList.length) {
      detectionStatus = "silent";
    } else {
      detectionStatus = "sparse";
    }
  }

  return {
    situationTypes: situationTypeHealthList,
    status: detectionStatus,
  };
}

// ─── Snapshot Composition ────────────────────────────────

export async function computeDepartmentSnapshot(
  operatorId: string,
  departmentEntityId: string,
): Promise<DepartmentSnapshot> {
  const department = await prisma.entity.findFirst({
    where: { id: departmentEntityId, operatorId, category: "foundational" },
    select: { displayName: true },
  });

  const departmentName = department?.displayName ?? "Unknown Department";

  const [dataPipeline, knowledge, detection] = await Promise.all([
    computeDataPipeline(operatorId, departmentEntityId),
    computeKnowledge(operatorId, departmentEntityId),
    computeDetection(operatorId, departmentEntityId),
  ]);

  // criticalIssueCount = disconnected connectors + knowledge "empty" + detection types with "no_data"
  let criticalIssueCount = 0;
  for (const c of dataPipeline.connectors) {
    if (c.status === "disconnected") criticalIssueCount++;
  }
  if (knowledge.status === "empty") criticalIssueCount++;
  for (const st of detection.situationTypes) {
    if (st.diagnosis === "no_data") criticalIssueCount++;
  }

  // Overall status
  let overallStatus: DepartmentSnapshot["overallStatus"];
  if (
    dataPipeline.connectors.length === 0 &&
    knowledge.people.count === 0 &&
    detection.situationTypes.length === 0
  ) {
    overallStatus = "unconfigured";
    criticalIssueCount = 0; // nothing is configured — no issues to report
  } else if (criticalIssueCount > 0) {
    overallStatus = "critical";
  } else if (
    dataPipeline.status === "degraded" ||
    knowledge.status === "partial" ||
    detection.status === "sparse"
  ) {
    overallStatus = "attention";
  } else {
    overallStatus = "healthy";
  }

  return {
    departmentId: departmentEntityId,
    departmentName,
    dataPipeline,
    knowledge,
    detection,
    overallStatus,
    criticalIssueCount,
  };
}

export async function computeOperatorSnapshot(
  operatorId: string,
): Promise<OperatorSnapshot> {
  const departments = await prisma.entity.findMany({
    where: { operatorId, category: "foundational", status: "active" },
    select: { id: true },
    orderBy: { displayName: "asc" },
  });

  const departmentSnapshots = await Promise.all(
    departments.map((d) => computeDepartmentSnapshot(operatorId, d.id)),
  );

  let criticalIssueCount = departmentSnapshots.reduce(
    (sum, d) => sum + d.criticalIssueCount,
    0,
  );

  // Worker job queue health check
  const staleJobCount = await prisma.workerJob.count({
    where: {
      operatorId,
      status: "pending",
      createdAt: { lt: new Date(Date.now() - 15 * 60 * 1000) },
    },
  });

  if (staleJobCount > 0) {
    criticalIssueCount += 1;
  }

  let overallStatus: OperatorSnapshot["overallStatus"];
  if (staleJobCount > 0 || departmentSnapshots.some((d) => d.overallStatus === "critical")) {
    overallStatus = "critical";
  } else if (departmentSnapshots.some((d) => d.overallStatus === "attention")) {
    overallStatus = "attention";
  } else {
    overallStatus = "healthy";
  }

  return {
    operatorId,
    departments: departmentSnapshots,
    overallStatus,
    criticalIssueCount,
    staleJobCount,
    computedAt: new Date().toISOString(),
  };
}

// ─── Persistence ─────────────────────────────────────────

async function persistSnapshot(
  operatorId: string,
  snapshot: OperatorSnapshot,
): Promise<void> {
  const now = new Date();
  const snapshotJson = JSON.stringify(snapshot);
  const activeDepartmentIds = snapshot.departments.map((d) => d.departmentId);

  await prisma.$transaction([
    // Per-department snapshots
    ...snapshot.departments.map((dept) =>
      prisma.departmentHealth.upsert({
        where: {
          operatorId_departmentEntityId: {
            operatorId,
            departmentEntityId: dept.departmentId,
          },
        },
        create: {
          operatorId,
          departmentEntityId: dept.departmentId,
          snapshot: dept as unknown as Prisma.InputJsonValue,
          computedAt: now,
        },
        update: {
          snapshot: dept as unknown as Prisma.InputJsonValue,
          computedAt: now,
        },
      }),
    ),
    // Operator-level aggregate (departmentEntityId = null)
    // Postgres NULL != NULL so @@unique can't back a Prisma upsert —
    // use raw INSERT ON CONFLICT with partial unique index
    prisma.$executeRaw`
      INSERT INTO "DepartmentHealth" ("id", "operatorId", "departmentEntityId", "snapshot", "computedAt")
      VALUES (${randomUUID()}, ${operatorId}, NULL, ${snapshotJson}::jsonb, ${now})
      ON CONFLICT ("operatorId") WHERE "departmentEntityId" IS NULL
      DO UPDATE SET "snapshot" = EXCLUDED."snapshot", "computedAt" = EXCLUDED."computedAt"
    `,
    // Remove rows for departments that no longer exist
    ...(activeDepartmentIds.length > 0
      ? [
          prisma.departmentHealth.deleteMany({
            where: {
              operatorId,
              departmentEntityId: { notIn: activeDepartmentIds, not: null },
            },
          }),
        ]
      : [
          prisma.departmentHealth.deleteMany({
            where: { operatorId, departmentEntityId: { not: null } },
          }),
        ]),
  ]);
}

/**
 * Public entry point called by sync/reconnection triggers.
 * Fire-and-forget safe — never throws.
 *
 * If departmentEntityId provided: recompute just that department + operator aggregate.
 * If not provided: recompute all departments + operator aggregate.
 */
export async function recomputeHealthSnapshots(
  operatorId: string,
  departmentEntityId?: string,
): Promise<void> {
  try {
    if (departmentEntityId) {
      // Single-department recompute
      const deptSnapshot = await computeDepartmentSnapshot(
        operatorId,
        departmentEntityId,
      );
      const now = new Date();

      // Upsert the single department row
      await prisma.departmentHealth.upsert({
        where: {
          operatorId_departmentEntityId: {
            operatorId,
            departmentEntityId,
          },
        },
        create: {
          operatorId,
          departmentEntityId,
          snapshot: deptSnapshot as unknown as Prisma.InputJsonValue,
          computedAt: now,
        },
        update: {
          snapshot: deptSnapshot as unknown as Prisma.InputJsonValue,
          computedAt: now,
        },
      });

      // Rebuild operator aggregate from persisted department snapshots
      // instead of recomputing every department
      const allRows = await prisma.departmentHealth.findMany({
        where: { operatorId, departmentEntityId: { not: null } },
        select: { snapshot: true },
      });
      const departmentSnapshots = allRows.map(
        (r) => r.snapshot as unknown as DepartmentSnapshot,
      );

      let criticalIssueCount = departmentSnapshots.reduce(
        (sum, d) => sum + d.criticalIssueCount,
        0,
      );

      const staleJobCount = await prisma.workerJob.count({
        where: {
          operatorId,
          status: "pending",
          createdAt: { lt: new Date(Date.now() - 15 * 60 * 1000) },
        },
      });
      if (staleJobCount > 0) {
        criticalIssueCount += 1;
      }

      let overallStatus: OperatorSnapshot["overallStatus"];
      if (staleJobCount > 0 || departmentSnapshots.some((d) => d.overallStatus === "critical")) {
        overallStatus = "critical";
      } else if (departmentSnapshots.some((d) => d.overallStatus === "attention")) {
        overallStatus = "attention";
      } else {
        overallStatus = "healthy";
      }

      const operatorSnapshot: OperatorSnapshot = {
        operatorId,
        departments: departmentSnapshots,
        overallStatus,
        criticalIssueCount,
        staleJobCount,
        computedAt: now.toISOString(),
      };
      const snapshotJson = JSON.stringify(operatorSnapshot);
      await prisma.$executeRaw`
        INSERT INTO "DepartmentHealth" ("id", "operatorId", "departmentEntityId", "snapshot", "computedAt")
        VALUES (${randomUUID()}, ${operatorId}, NULL, ${snapshotJson}::jsonb, ${now})
        ON CONFLICT ("operatorId") WHERE "departmentEntityId" IS NULL
        DO UPDATE SET "snapshot" = EXCLUDED."snapshot", "computedAt" = EXCLUDED."computedAt"
      `;
    } else {
      // Full recompute
      const snapshot = await computeOperatorSnapshot(operatorId);
      await persistSnapshot(operatorId, snapshot);
    }
  } catch (err) {
    console.error(
      `[system-health] Failed to recompute snapshots for operator ${operatorId}:`,
      err,
    );
    try {
      const Sentry = require("@sentry/nextjs");
      Sentry.captureException(err);
    } catch {
      // Sentry not available
    }
  }
}

