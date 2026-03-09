import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";

// TODO: Apply situationScopeFilter when multi-user access is enabled

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const operatorId = await getOperatorId();
  const { id } = await params;
  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Load the situation type
  const situationType = await prisma.situationType.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      autonomyLevel: true,
      totalProposed: true,
      totalApproved: true,
      consecutiveApprovals: true,
      approvalRate: true,
      scopeEntityId: true,
      createdAt: true,
      operatorId: true,
    },
  });

  if (!situationType || situationType.operatorId !== operatorId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Load scoped department
  let department: { id: string; name: string } | null = null;
  if (situationType.scopeEntityId) {
    const dept = await prisma.entity.findUnique({
      where: { id: situationType.scopeEntityId },
      select: { id: true, displayName: true },
    });
    if (dept) {
      department = { id: dept.id, name: dept.displayName };
    }
  }

  // Load situations for this type in the period
  const situations = await prisma.situation.findMany({
    where: {
      operatorId,
      situationTypeId: id,
      createdAt: { gte: since },
    },
    select: {
      id: true,
      status: true,
      outcome: true,
      confidence: true,
      feedback: true,
      feedbackCategory: true,
      actionTaken: true,
      resolvedAt: true,
      createdAt: true,
    },
  });

  // Metrics
  const proposedStatuses = new Set([
    "proposed", "approved", "executing", "auto_executing", "resolved", "rejected", "closed",
  ]);
  const totalProposed = situations.filter((s) => proposedStatuses.has(s.status)).length;
  const totalApproved = situations.filter(
    (s) =>
      ["approved", "executing", "auto_executing", "resolved"].includes(s.status) &&
      s.actionTaken !== null,
  ).length;
  const totalRejected = situations.filter(
    (s) => s.status === "rejected" || (s.status === "closed" && s.feedbackCategory !== null),
  ).length;

  const approvalRate = situationType.approvalRate;
  const consecutiveApprovals = situationType.consecutiveApprovals;

  const avgConfidence = situations.length > 0
    ? Math.round(
        (situations.reduce((sum, s) => sum + s.confidence, 0) / situations.length) * 100,
      ) / 100
    : 0;

  // Outcome distribution
  const resolvedSituations = situations.filter((s) => s.status === "resolved");
  const outcomeDistribution: Record<string, number> = {
    positive: 0,
    negative: 0,
    neutral: 0,
    unknown: 0,
  };
  for (const s of resolvedSituations) {
    const outcome = s.outcome ?? "unknown";
    if (outcome in outcomeDistribution) {
      outcomeDistribution[outcome]++;
    } else {
      outcomeDistribution.unknown++;
    }
  }

  // Approval rate over time
  const dailyBuckets = new Map<string, { positive: number; total: number }>();
  for (const s of resolvedSituations) {
    if (!s.resolvedAt) continue;
    const date = s.resolvedAt.toISOString().slice(0, 10);
    const bucket = dailyBuckets.get(date) ?? { positive: 0, total: 0 };
    bucket.total++;
    if (s.outcome === "positive") bucket.positive++;
    dailyBuckets.set(date, bucket);
  }
  const approvalRateOverTime = [...dailyBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({
      date,
      rate: bucket.total > 0 ? Math.round((bucket.positive / bucket.total) * 100) / 100 : 0,
      count: bucket.total,
    }));

  // Recent feedback
  const recentFeedback = situations
    .filter((s) => s.feedback !== null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)
    .map((s) => ({
      id: s.id,
      feedbackCategory: s.feedbackCategory,
      feedback: s.feedback,
      createdAt: s.createdAt.toISOString(),
    }));

  // TODO: Track autonomy level changes historically for proper timeline
  const autonomyHistory = [
    {
      level: situationType.autonomyLevel ?? "supervised",
      since: situationType.createdAt.toISOString(),
    },
  ];

  return NextResponse.json({
    id: situationType.id,
    name: situationType.name,
    description: situationType.description,
    autonomyLevel: situationType.autonomyLevel ?? "supervised",
    department,
    metrics: {
      totalProposed,
      totalApproved,
      totalRejected,
      approvalRate,
      consecutiveApprovals,
      avgConfidence,
    },
    outcomeDistribution,
    approvalRateOverTime,
    recentFeedback,
    autonomyHistory,
  });
}
