import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { OperatorHealthSnapshot } from "@/lib/system-health/compute-snapshot";
import { computeOperatorHealth, recomputeHealthSnapshots } from "@/lib/system-health/compute-snapshot";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  // Read persisted operator-level snapshot (domainEntityId = null)
  const healthRow = await prisma.domainHealth.findFirst({
    where: { operatorId, domainEntityId: null },
    select: { snapshot: true, computedAt: true },
  });

  // If no snapshot exists, compute on-the-fly and persist in background
  if (!healthRow) {
    const snapshot = await computeOperatorHealth(operatorId);
    recomputeHealthSnapshots(operatorId).catch(() => {});
    return NextResponse.json(snapshot);
  }

  return NextResponse.json(healthRow.snapshot as unknown as OperatorHealthSnapshot);
}
