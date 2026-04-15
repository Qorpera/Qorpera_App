import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

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

export type OperatorHealthSnapshot = {
  operatorId: string;
  connectors: ConnectorHealth[];
  wiki: {
    totalPages: number;
    verifiedPages: number;
    draftPages: number;
    stalePages: number;
    avgConfidence: number;
    byPageType: Record<string, number>;
  };
  people: {
    totalProfiles: number;
    withRoles: number;
    withReportingLines: number;
  };
  detection: {
    totalSituationTypes: number;
    activeSituationTypes: number;
    totalDetected30d: number;
    confirmationRate: number | null;
  };
  rawContent: {
    totalItems: number;
    bySourceType: Record<string, number>;
  };
  overallStatus: "healthy" | "attention" | "critical";
  computedAt: string;
};

// ─── Connector mapping helper ───────────────────────────

type ConnectorRow = {
  id: string;
  name: string;
  provider: string;
  status: string;
  lastSyncAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
};

function mapConnectorToHealth(
  c: ConnectorRow,
  syncMap: Map<string, Date>,
  chunkMap: Map<string | null, number>,
): ConnectorHealth {
  const effectiveStatus =
    c.consecutiveFailures >= 3 && c.status === "active" ? "error" : c.status;
  const lastSync = syncMap.get(c.id);
  const entityCount = chunkMap.get(c.id) ?? 0;

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
}

async function fetchConnectorContext(
  connectors: ConnectorRow[],
  operatorId: string,
  accountFilter?: { in: string[] },
): Promise<{ syncMap: Map<string, Date>; chunkMap: Map<string | null, number> }> {
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

  const rawCountsByConnector = await prisma.rawContent.groupBy({
    by: ["accountId"],
    where: { operatorId, accountId: accountFilter ?? { not: null } },
    _count: true,
  });
  const chunkMap = new Map(
    rawCountsByConnector.map((g) => [g.accountId, g._count]),
  );

  return { syncMap, chunkMap };
}

// ─── Connector Health ───────────────────────────────────

const CONNECTOR_SELECT = {
  id: true,
  name: true,
  provider: true,
  status: true,
  lastSyncAt: true,
  lastError: true,
  consecutiveFailures: true,
} as const;

export async function computeConnectorHealth(
  operatorId: string,
): Promise<ConnectorHealth[]> {
  const connectors = await prisma.sourceConnector.findMany({
    where: { operatorId, deletedAt: null },
    select: CONNECTOR_SELECT,
  });

  const { syncMap, chunkMap } = await fetchConnectorContext(connectors, operatorId);
  return connectors.map((c) => mapConnectorToHealth(c, syncMap, chunkMap));
}

// ─── Personal Connector Health ──────────────────────────

export async function getPersonalConnectorHealth(
  operatorId: string,
  userId: string,
): Promise<ConnectorHealth[]> {
  const connectors = await prisma.sourceConnector.findMany({
    where: { operatorId, userId, deletedAt: null },
    select: CONNECTOR_SELECT,
  });

  const connectorIds = connectors.map((c) => c.id);
  const { syncMap, chunkMap } = await fetchConnectorContext(
    connectors,
    operatorId,
    { in: connectorIds },
  );
  return connectors.map((c) => mapConnectorToHealth(c, syncMap, chunkMap));
}

// ─── Operator Health ────────────────────────────────────

export async function computeOperatorHealth(
  operatorId: string,
): Promise<OperatorHealthSnapshot> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // All queries are independent — run in parallel
  const [
    connectors,
    wikiGroups,
    totalProfiles,
    withRolesResult,
    withReportsToResult,
    totalSituationTypes,
    activeSituationTypes,
    totalDetected30d,
    stAggregates,
    rawContentGroups,
  ] = await Promise.all([
    computeConnectorHealth(operatorId),
    prisma.knowledgePage.groupBy({
      by: ["pageType", "status"],
      where: { operatorId, scope: "operator" },
      _count: true,
      _avg: { confidence: true },
    }),
    prisma.knowledgePage.count({
      where: { operatorId, scope: "operator", pageType: "person_profile" },
    }),
    // Expected person_profile properties schema (set by wiki-synthesis-pass.ts):
    //   properties.role — job title/role string
    //   properties.reportsTo — manager's person page slug
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "KnowledgePage"
      WHERE "operatorId" = ${operatorId}
        AND "scope" = 'operator'
        AND "pageType" = 'person_profile'
        AND "properties" IS NOT NULL
        AND "properties"->>'role' IS NOT NULL
    `,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "KnowledgePage"
      WHERE "operatorId" = ${operatorId}
        AND "scope" = 'operator'
        AND "pageType" = 'person_profile'
        AND "properties" IS NOT NULL
        AND "properties"->>'reportsTo' IS NOT NULL
    `,
    prisma.situationType.count({ where: { operatorId } }),
    prisma.situationType.count({
      where: { operatorId, enabled: true, detectedCount: { gt: 0 } },
    }),
    prisma.knowledgePage.count({
      where: {
        operatorId,
        pageType: "situation_instance",
        scope: "operator",
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.situationType.aggregate({
      where: { operatorId },
      _sum: { detectedCount: true, confirmedCount: true },
    }),
    prisma.rawContent.groupBy({
      by: ["sourceType"],
      where: { operatorId },
      _count: true,
    }),
  ]);

  // ── Derive wiki stats from groupBy ──
  let totalPages = 0;
  let verifiedPages = 0;
  let draftPages = 0;
  let stalePages = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;
  const byPageType: Record<string, number> = {};

  for (const g of wikiGroups) {
    const count = g._count;
    totalPages += count;
    byPageType[g.pageType] = (byPageType[g.pageType] ?? 0) + count;

    if (g.status === "verified") verifiedPages += count;
    else if (g.status === "draft") draftPages += count;
    else if (g.status === "stale") stalePages += count;

    if (g._avg.confidence !== null) {
      confidenceSum += g._avg.confidence * count;
      confidenceCount += count;
    }
  }

  const avgConfidence = confidenceCount > 0 ? confidenceSum / confidenceCount : 0;

  // ── Derive people stats ──
  const withRoles = Number(withRolesResult[0]?.count ?? 0);
  const withReportingLines = Number(withReportsToResult[0]?.count ?? 0);

  // ── Derive detection stats ──
  const totalDetected = stAggregates._sum.detectedCount ?? 0;
  const totalConfirmed = stAggregates._sum.confirmedCount ?? 0;
  const confirmationRate = totalDetected > 0 ? totalConfirmed / totalDetected : null;

  // ── Derive raw content stats ──
  let rawContentTotal = 0;
  const bySourceType: Record<string, number> = {};
  for (const g of rawContentGroups) {
    rawContentTotal += g._count;
    bySourceType[g.sourceType] = g._count;
  }

  // ── Overall status ──
  const hasDisconnected = connectors.some(
    (c) => c.status === "disconnected" || c.status === "error",
  );
  const wikiEmpty = totalPages === 0;
  const connectorsDegraded = connectors.some(
    (c) => c.status !== "active" && c.status !== "paused",
  );
  const manyStale = totalPages > 0 && stalePages / totalPages > 0.3;
  const detectionSilent = totalSituationTypes > 0 && activeSituationTypes === 0;

  let overallStatus: OperatorHealthSnapshot["overallStatus"];
  if (hasDisconnected && wikiEmpty) {
    overallStatus = "critical";
  } else if (connectorsDegraded || manyStale || detectionSilent) {
    overallStatus = "attention";
  } else {
    overallStatus = "healthy";
  }

  return {
    operatorId,
    connectors,
    wiki: {
      totalPages,
      verifiedPages,
      draftPages,
      stalePages,
      avgConfidence,
      byPageType,
    },
    people: {
      totalProfiles,
      withRoles,
      withReportingLines,
    },
    detection: {
      totalSituationTypes,
      activeSituationTypes,
      totalDetected30d,
      confirmationRate,
    },
    rawContent: {
      totalItems: rawContentTotal,
      bySourceType,
    },
    overallStatus,
    computedAt: new Date().toISOString(),
  };
}

// ─── Persistence ─────────────────────────────────────────

async function persistSnapshot(
  operatorId: string,
  snapshot: OperatorHealthSnapshot,
): Promise<void> {
  const now = new Date();
  const snapshotJson = JSON.stringify(snapshot);

  await prisma.$transaction([
    // Operator-level aggregate (domainEntityId = null)
    prisma.$executeRaw`
      INSERT INTO "DepartmentHealth" ("id", "operatorId", "departmentEntityId", "snapshot", "computedAt")
      VALUES (${randomUUID()}, ${operatorId}, NULL, ${snapshotJson}::jsonb, ${now})
      ON CONFLICT ("operatorId") WHERE "departmentEntityId" IS NULL
      DO UPDATE SET "snapshot" = EXCLUDED."snapshot", "computedAt" = EXCLUDED."computedAt"
    `,
    // Legacy cleanup: remove any per-domain rows
    prisma.domainHealth.deleteMany({
      where: { operatorId, domainEntityId: { not: null } },
    }),
  ]);
}

/**
 * Public entry point called by sync/reconnection triggers.
 * Fire-and-forget safe — never throws.
 */
export async function recomputeHealthSnapshots(
  operatorId: string,
): Promise<void> {
  try {
    const snapshot = await computeOperatorHealth(operatorId);
    await persistSnapshot(operatorId, snapshot);
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
