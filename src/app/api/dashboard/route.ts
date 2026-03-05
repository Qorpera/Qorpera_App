import { NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { getEntityCounts } from "@/lib/entity-model-store";
import { getPendingProposalCount } from "@/lib/action-executor";
import { listAuditEntries } from "@/lib/audit-logger";
import { prisma } from "@/lib/db";

export async function GET() {
  const operatorId = await getOperatorId();

  const [counts, pendingApprovals, recentAudit, recommendations] = await Promise.all([
    getEntityCounts(operatorId),
    getPendingProposalCount(operatorId),
    listAuditEntries(operatorId, { limit: 10 }),
    prisma.recommendation.count({ where: { operatorId, status: "active" } }),
  ]);

  return NextResponse.json({
    ...counts,
    pendingApprovals,
    activeRecommendations: recommendations,
    recentAudit: recentAudit.entries,
  });
}
