import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDepartmentIds } from "@/lib/user-scope";
import type {
  OperatorSnapshot,
  DepartmentSnapshot,
  SituationTypeHealth,
} from "@/lib/system-health/compute-snapshot";
import { computeOperatorSnapshot, recomputeHealthSnapshots } from "@/lib/system-health/compute-snapshot";

// Extended type with live stats
type SituationTypeHealthWithLive = SituationTypeHealth & {
  detectedCount: number;
  confirmedCount: number;
  dismissedCount: number;
  confirmationRate: number | null;
  last7d: { detected: number; confirmed: number; dismissed: number };
  last30d: { detected: number; confirmed: number; dismissed: number };
};

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  // Scope: members see only their departments
  const visibleDepts = await getVisibleDepartmentIds(operatorId, su.user.id);

  // Read persisted snapshot
  const healthRows = await prisma.departmentHealth.findMany({
    where: { operatorId },
    select: { departmentEntityId: true, snapshot: true, computedAt: true },
  });

  // If no snapshot exists, compute one on-the-fly and persist
  if (healthRows.length === 0) {
    const snapshot = await computeOperatorSnapshot(operatorId);
    // Persist in background
    recomputeHealthSnapshots(operatorId).catch(() => {});

    const scoped = scopeSnapshot(snapshot, visibleDepts);
    const enriched = await enrichWithLiveData(scoped, operatorId);
    return NextResponse.json(enriched);
  }

  // Reconstruct operator snapshot from persisted rows
  const operatorRow = healthRows.find((r) => r.departmentEntityId === null);
  const deptRows = healthRows.filter((r) => r.departmentEntityId !== null);

  // Scope filter
  const visibleDeptRows =
    visibleDepts === "all"
      ? deptRows
      : deptRows.filter(
          (r) => r.departmentEntityId && visibleDepts.includes(r.departmentEntityId),
        );

  const departments = visibleDeptRows.map(
    (r) => r.snapshot as unknown as DepartmentSnapshot,
  );

  // Recompute aggregate from visible departments only
  const criticalIssueCount = departments.reduce(
    (sum, d) => sum + d.criticalIssueCount,
    0,
  );
  let overallStatus: OperatorSnapshot["overallStatus"];
  if (departments.some((d) => d.overallStatus === "critical")) {
    overallStatus = "critical";
  } else if (departments.some((d) => d.overallStatus === "attention")) {
    overallStatus = "attention";
  } else {
    overallStatus = "healthy";
  }

  const snapshot: OperatorSnapshot = {
    operatorId,
    departments,
    overallStatus,
    criticalIssueCount,
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
  visibleDepts: string[] | "all",
): OperatorSnapshot {
  if (visibleDepts === "all") return snapshot;
  const departments = snapshot.departments.filter((d) =>
    visibleDepts.includes(d.departmentId),
  );
  const criticalIssueCount = departments.reduce(
    (sum, d) => sum + d.criticalIssueCount,
    0,
  );
  let overallStatus: OperatorSnapshot["overallStatus"];
  if (departments.some((d) => d.overallStatus === "critical")) {
    overallStatus = "critical";
  } else if (departments.some((d) => d.overallStatus === "attention")) {
    overallStatus = "attention";
  } else {
    overallStatus = "healthy";
  }
  return { ...snapshot, departments, overallStatus, criticalIssueCount };
}

// ─── Live data enrichment ────────────────────────────────

async function enrichWithLiveData(
  snapshot: OperatorSnapshot,
  operatorId: string,
): Promise<OperatorSnapshot> {
  // Collect all situation type IDs across departments
  const allStIds: string[] = [];
  for (const dept of snapshot.departments) {
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
  const departments = snapshot.departments.map((dept) => ({
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

  return { ...snapshot, departments };
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
