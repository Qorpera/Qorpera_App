import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDomainIds } from "@/lib/domain-scope";
import type {
  OperatorSnapshot,
  DepartmentSnapshot,
  SituationTypeHealthWithLive,
} from "@/lib/system-health/compute-snapshot";
import { computeOperatorSnapshot, recomputeHealthSnapshots } from "@/lib/system-health/compute-snapshot";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  // Scope: members see only their departments
  const visibleDomains = await getVisibleDomainIds(operatorId, su.user.id);

  // Read persisted snapshot
  const healthRows = await prisma.domainHealth.findMany({
    where: { operatorId },
    select: { domainEntityId: true, snapshot: true, computedAt: true },
  });

  // If no snapshot exists, compute one on-the-fly and persist
  if (healthRows.length === 0) {
    const snapshot = await computeOperatorSnapshot(operatorId);
    // Persist in background
    recomputeHealthSnapshots(operatorId).catch(() => {});

    const scoped = scopeSnapshot(snapshot, visibleDomains);
    const enriched = await enrichWithLiveData(scoped, operatorId);
    return NextResponse.json(enriched);
  }

  // Reconstruct operator snapshot from persisted rows
  const operatorRow = healthRows.find((r) => r.domainEntityId === null);
  const deptRows = healthRows.filter((r) => r.domainEntityId !== null);

  // Scope filter
  const visibleDeptRows =
    visibleDomains === "all"
      ? deptRows
      : deptRows.filter(
          (r) => r.domainEntityId && visibleDomains.includes(r.domainEntityId),
        );

  const domains = visibleDeptRows.map(
    (r) => r.snapshot as unknown as DepartmentSnapshot,
  );

  // Recompute aggregate from visible departments only
  const criticalIssueCount = domains.reduce(
    (sum, d) => sum + d.criticalIssueCount,
    0,
  );
  let overallStatus: OperatorSnapshot["overallStatus"];
  if (domains.some((d) => d.overallStatus === "critical")) {
    overallStatus = "critical";
  } else if (domains.some((d) => d.overallStatus === "attention")) {
    overallStatus = "attention";
  } else {
    overallStatus = "healthy";
  }

  // Read staleJobCount from persisted operator snapshot (computed by background recompute)
  const persistedOperator = operatorRow?.snapshot as unknown as OperatorSnapshot | undefined;
  const staleJobCount = persistedOperator?.staleJobCount ?? 0;

  const snapshot: OperatorSnapshot = {
    operatorId,
    domains,
    overallStatus,
    criticalIssueCount,
    staleJobCount,
    computedAt: operatorRow
      ? (operatorRow.computedAt ?? new Date()).toISOString()
      : new Date().toISOString(),
  };

  const enriched = await enrichWithLiveData(snapshot, operatorId);
  return NextResponse.json(enriched);
}

// ─── Scope filtering for on-the-fly snapshots ────────────

function scopeSnapshot(
  snapshot: OperatorSnapshot,
  visibleDomains: string[] | "all",
): OperatorSnapshot {
  if (visibleDomains === "all") return snapshot;
  const domains = snapshot.domains.filter((d) =>
    visibleDomains.includes(d.domainId),
  );
  const criticalIssueCount = domains.reduce(
    (sum, d) => sum + d.criticalIssueCount,
    0,
  );
  let overallStatus: OperatorSnapshot["overallStatus"];
  if (domains.some((d) => d.overallStatus === "critical")) {
    overallStatus = "critical";
  } else if (domains.some((d) => d.overallStatus === "attention")) {
    overallStatus = "attention";
  } else {
    overallStatus = "healthy";
  }
  return { ...snapshot, domains, overallStatus, criticalIssueCount };
}

// ─── Live data enrichment ────────────────────────────────

async function enrichWithLiveData(
  snapshot: OperatorSnapshot,
  operatorId: string,
): Promise<OperatorSnapshot> {
  // Collect all situation type IDs across domains
  const allStIds: string[] = [];
  for (const dept of snapshot.domains) {
    for (const st of dept.detection.situationTypes) {
      allStIds.push(st.id);
    }
  }

  if (allStIds.length === 0) return snapshot;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Batch query: all situations for these types in the last 30 days
  const recentSituations = await prisma.situation.findMany({
    where: {
      operatorId,
      situationTypeId: { in: allStIds },
      createdAt: { gte: thirtyDaysAgo },
    },
    select: {
      situationTypeId: true,
      status: true,
      createdAt: true,
    },
  });

  // Also get all-time counts from SituationType
  const situationTypes = await prisma.situationType.findMany({
    where: { operatorId, id: { in: allStIds } },
    select: {
      id: true,
      detectedCount: true,
      confirmedCount: true,
      dismissedCount: true,
    },
  });
  const stCountMap = new Map(situationTypes.map((st) => [st.id, st]));

  // Build per-type live stats
  const liveMap = new Map<string, SituationTypeHealthWithLive>();

  for (const stId of allStIds) {
    const allTime = stCountMap.get(stId);
    const detected = allTime?.detectedCount ?? 0;
    const confirmed = allTime?.confirmedCount ?? 0;
    const dismissed = allTime?.dismissedCount ?? 0;

    const recent = recentSituations.filter((s) => s.situationTypeId === stId);
    const last30 = bucketSituations(recent);
    const last7 = bucketSituations(
      recent.filter((s) => s.createdAt >= sevenDaysAgo),
    );

    liveMap.set(stId, {
      detectedCount: detected,
      confirmedCount: confirmed,
      dismissedCount: dismissed,
      confirmationRate: detected > 0 ? confirmed / detected : null,
      last7d: last7,
      last30d: last30,
    } as SituationTypeHealthWithLive);
  }

  // Merge into snapshot
  const domains = snapshot.domains.map((dept) => ({
    ...dept,
    detection: {
      ...dept.detection,
      situationTypes: dept.detection.situationTypes.map((st) => {
        const live = liveMap.get(st.id);
        if (!live) return st;
        return { ...st, ...live };
      }),
    },
  }));

  return { ...snapshot, domains };
}

function bucketSituations(
  situations: { status: string }[],
): { detected: number; confirmed: number; dismissed: number } {
  let detected = 0;
  let confirmed = 0;
  let dismissed = 0;
  for (const s of situations) {
    detected++;
    if (
      s.status === "approved" ||
      s.status === "executing" ||
      s.status === "resolved" ||
      s.status === "auto_executing"
    ) {
      confirmed++;
    } else if (s.status === "rejected" || s.status === "closed") {
      dismissed++;
    }
  }
  return { detected, confirmed, dismissed };
}
