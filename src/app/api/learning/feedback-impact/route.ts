import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { daysParam, parseQuery } from "@/lib/api-validation";
import { getVisibleDomainSlugs } from "@/lib/domain-scope";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const visibleDomains = await getVisibleDomainSlugs(operatorId, user.id);
  const daysSchema = z.object({ days: daysParam });
  const parsed = parseQuery(daysSchema, req.nextUrl.searchParams);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { days } = parsed.data;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Load situation instances with feedback from KnowledgePage
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
       AND properties->>'feedback' IS NOT NULL
     ORDER BY "createdAt" DESC
     LIMIT 50`,
    operatorId, since,
  );

  // Map and filter by domain visibility
  const feedbackSituations = sitPages
    .map((p) => {
      const props = p.properties ?? {};
      return {
        id: (props.situation_id as string) ?? "",
        situationTypeId: (props.situation_type_id as string) ?? "",
        situationTypeName: (props.situation_type as string) ?? "",
        feedbackCategory: (props.feedback_category as string) ?? null,
        feedback: (props.feedback as string) ?? null,
        domain: (props.domain as string) ?? null,
        createdAt: p.createdAt,
      };
    })
    .filter((s) => {
      if (visibleDomains === "all") return true;
      return !s.domain || visibleDomains.includes(s.domain);
    });

  // Resolve domain names from wiki pages
  const domainSlugs = [...new Set(feedbackSituations.map((s) => s.domain).filter(Boolean))] as string[];
  const domainHubs = domainSlugs.length > 0
    ? await prisma.knowledgePage.findMany({
        where: { operatorId, scope: "operator", pageType: "domain_hub", slug: { in: domainSlugs } },
        select: { slug: true, title: true },
      })
    : [];
  const deptNameMap = new Map(domainHubs.map(p => [p.slug, p.title]));

  // Build feedback entries (simplified -- no before/after approval rate queries since Situation table is gone)
  const recentFeedback = feedbackSituations.map((s) => {
    const deptName = s.domain ? deptNameMap.get(s.domain) ?? null : null;

    return {
      id: s.id,
      situationTypeName: s.situationTypeName,
      domainName: deptName,
      feedbackCategory: s.feedbackCategory,
      feedback: s.feedback,
      createdAt: s.createdAt.toISOString(),
      approvalRateBefore: null as number | null,
      approvalRateAfter: null as number | null,
      likelyLearned: false,
    };
  });

  // Feedback theme summary — group by category
  const categoryCounts = new Map<string, number>();
  for (const s of feedbackSituations) {
    const cat = s.feedbackCategory ?? "uncategorized";
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }
  const total = feedbackSituations.length;
  let feedbackThemeSummary = "";
  if (total > 0) {
    const parts = [...categoryCounts.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([cat, count]) => {
        const pct = Math.round((count / total) * 100);
        return `${pct}% ${cat.replace(/_/g, " ")}`;
      });
    feedbackThemeSummary = `Feedback breakdown: ${parts.join(", ")}.`;
  } else {
    feedbackThemeSummary = "No feedback received in this period.";
  }

  return NextResponse.json({
    recentFeedback,
    feedbackThemeSummary,
  });
}
