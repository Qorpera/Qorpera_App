import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { daysParam, parseQuery } from "@/lib/api-validation";
import { getVisibleDomainIds, situationScopeFilter } from "@/lib/domain-scope";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const visibleDomains = await getVisibleDomainIds(operatorId, user.id);
  const daysSchema = z.object({ days: daysParam });
  const parsed = parseQuery(daysSchema, req.nextUrl.searchParams);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { days } = parsed.data;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Load all situations in the period
  const situations = await prisma.situation.findMany({
    where: { operatorId, createdAt: { gte: since }, ...situationScopeFilter(visibleDomains) },
    select: {
      id: true,
      status: true,
      outcome: true,
      feedback: true,
      feedbackCategory: true,
      actionTaken: true,
      resolvedAt: true,
      createdAt: true,
    },
  });

  // Load situation type aggregates
  const situationTypes = await prisma.situationType.findMany({
    where: { operatorId },
    select: {
      autonomyLevel: true,
      totalProposed: true,
      totalApproved: true,
    },
  });

  const totalDetected = situations.length;

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
    (s) =>
      (s.status === "rejected" || s.status === "closed") &&
      s.feedbackCategory !== null,
  ).length;

  const totalAutoResolved = situations.filter((s) => {
    if (s.status !== "resolved") return false;
    if (!s.actionTaken) return false;
    try {
      const action = JSON.parse(s.actionTaken);
      return action?.auto === true || String(s.actionTaken).includes('"auto"');
    } catch {
      return String(s.actionTaken).includes("auto");
    }
  }).length;

  const totalResolved = situations.filter((s) => s.status === "resolved").length;

  // Overall approval rate from SituationType aggregates
  const sumProposed = situationTypes.reduce((a, t) => a + t.totalProposed, 0);
  const sumApproved = situationTypes.reduce((a, t) => a + t.totalApproved, 0);
  const overallApprovalRate = sumProposed > 0 ? sumApproved / sumProposed : 0;

  // Autonomy distribution
  const autonomyDistribution: Record<string, number> = {
    supervised: 0,
    notify: 0,
    autonomous: 0,
  };
  for (const st of situationTypes) {
    const level = st.autonomyLevel ?? "supervised";
    if (level in autonomyDistribution) {
      autonomyDistribution[level]++;
    }
  }

  // Approval rate over time — group resolved situations by resolvedAt date
  const resolvedSituations = situations.filter(
    (s) => s.status === "resolved" && s.resolvedAt,
  );
  const dailyBuckets = new Map<string, { positive: number; total: number }>();
  for (const s of resolvedSituations) {
    const date = s.resolvedAt!.toISOString().slice(0, 10);
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

  // Outcome distribution
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

  return NextResponse.json({
    totalDetected,
    totalProposed,
    totalApproved,
    totalRejected,
    totalAutoResolved,
    totalResolved,
    overallApprovalRate: Math.round(overallApprovalRate * 100) / 100,
    autonomyDistribution,
    approvalRateOverTime,
    outcomeDistribution,
  });
}
