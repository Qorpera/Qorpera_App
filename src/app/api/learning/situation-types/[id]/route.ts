import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { daysParam, parseQuery } from "@/lib/api-validation";
import { getVisibleDomainIds } from "@/lib/domain-scope";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const visibleDomains = await getVisibleDomainIds(operatorId, user.id);
  const { id } = await params;
  const daysSchema = z.object({ days: daysParam });
  const parsed = parseQuery(daysSchema, req.nextUrl.searchParams);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { days } = parsed.data;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Load the situation type
  const situationType = await prisma.situationType.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      autonomyLevel: true,
      totalProposed: true,
      totalApproved: true,
      consecutiveApprovals: true,
      approvalRate: true,
      scopeEntityId: true,
      wikiPageSlug: true,
      createdAt: true,
      operatorId: true,
    },
  });

  if (!situationType || situationType.operatorId !== operatorId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Scope check: deny if situation type is scoped to a department the user can't see
  if (visibleDomains !== "all" && situationType.scopeEntityId && !visibleDomains.includes(situationType.scopeEntityId)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Load scoped department — prefer wiki page title
  let department: { name: string; pageSlug?: string } | null = null;
  if (situationType.wikiPageSlug) {
    const hubPage = await prisma.knowledgePage.findFirst({
      where: { operatorId, scope: "operator", slug: situationType.wikiPageSlug },
      select: { slug: true, title: true },
    });
    if (hubPage) {
      department = { name: hubPage.title, pageSlug: hubPage.slug };
    }
  } else if (situationType.scopeEntityId) {
    // Legacy fallback
    const hubPage = await prisma.knowledgePage.findFirst({
      where: { operatorId, scope: "operator", pageType: "domain_hub", subjectEntityId: situationType.scopeEntityId },
      select: { slug: true, title: true },
    });
    if (hubPage) {
      department = { name: hubPage.title, pageSlug: hubPage.slug };
    }
  }

  // Load situation instances for this type from KnowledgePage
  const sitPages = await prisma.$queryRawUnsafe<Array<{
    properties: Record<string, unknown> | null;
    createdAt: Date;
  }>>(
    `SELECT properties, "createdAt"
     FROM "KnowledgePage"
     WHERE "operatorId" = $1
       AND "pageType" = 'situation_instance'
       AND scope = 'operator'
       AND "createdAt" >= $2
       AND (properties->>'situation_type' = $3 OR properties->>'situation_type_id' = $4)`,
    operatorId, since, situationType.slug, id,
  );

  const situations = sitPages.map((p) => {
    const props = p.properties ?? {};
    return {
      id: (props.situation_id as string) ?? "",
      status: (props.status as string) ?? "detected",
      outcome: (props.outcome as string) ?? null,
      confidence: typeof props.confidence === "number" ? (props.confidence as number) : 0,
      feedback: (props.feedback as string) ?? null,
      feedbackCategory: (props.feedback_category as string) ?? null,
      actionTaken: (props.action_taken as string) ?? null,
      resolvedAt: props.resolved_at ? new Date(props.resolved_at as string) : null,
      createdAt: p.createdAt,
    };
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
