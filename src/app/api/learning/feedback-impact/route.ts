import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { daysParam, parseQuery } from "@/lib/api-validation";
import { getVisibleDepartmentIds, situationScopeFilter } from "@/lib/user-scope";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const visibleDepts = await getVisibleDepartmentIds(operatorId, user.id);
  const daysSchema = z.object({ days: daysParam });
  const parsed = parseQuery(daysSchema, req.nextUrl.searchParams);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { days } = parsed.data;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Load situations with feedback in the period
  const feedbackSituations = await prisma.situation.findMany({
    where: {
      operatorId,
      createdAt: { gte: since },
      feedback: { not: null },
      ...situationScopeFilter(visibleDepts),
    },
    select: {
      id: true,
      situationTypeId: true,
      feedbackCategory: true,
      feedback: true,
      createdAt: true,
      situationType: {
        select: {
          name: true,
          scopeEntityId: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Resolve department names for scoped situation types
  const scopeEntityIds = [
    ...new Set(
      feedbackSituations
        .map((s) => s.situationType.scopeEntityId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const scopeEntities = scopeEntityIds.length > 0
    ? await prisma.entity.findMany({
        where: { id: { in: scopeEntityIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const deptNameMap = new Map(scopeEntities.map((e) => [e.id, e.displayName]));

  // Calculate before/after approval rates for each feedback entry
  const recentFeedback = await Promise.all(
    feedbackSituations.map(async (s) => {
      const feedbackDate = s.createdAt;
      const sevenDaysBefore = new Date(feedbackDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      const sevenDaysAfter = new Date(feedbackDate.getTime() + 7 * 24 * 60 * 60 * 1000);

      const [before, after] = await Promise.all([
        prisma.situation.findMany({
          where: {
            situationTypeId: s.situationTypeId,
            createdAt: { gte: sevenDaysBefore, lt: feedbackDate },
            status: { in: ["resolved", "closed", "rejected"] },
          },
          select: { status: true },
        }),
        prisma.situation.findMany({
          where: {
            situationTypeId: s.situationTypeId,
            createdAt: { gt: feedbackDate, lte: sevenDaysAfter },
            status: { in: ["resolved", "closed", "rejected"] },
          },
          select: { status: true },
        }),
      ]);

      const rateBefore = before.length > 0
        ? Math.round(
            (before.filter((b) => b.status === "resolved").length / before.length) * 100,
          ) / 100
        : null;
      const rateAfter = after.length > 0
        ? Math.round(
            (after.filter((a) => a.status === "resolved").length / after.length) * 100,
          ) / 100
        : null;

      const likelyLearned =
        rateBefore !== null && rateAfter !== null ? rateAfter > rateBefore : false;

      const deptName = s.situationType.scopeEntityId
        ? deptNameMap.get(s.situationType.scopeEntityId) ?? null
        : null;

      return {
        id: s.id,
        situationTypeName: s.situationType.name,
        departmentName: deptName,
        feedbackCategory: s.feedbackCategory,
        feedback: s.feedback,
        createdAt: s.createdAt.toISOString(),
        approvalRateBefore: rateBefore,
        approvalRateAfter: rateAfter,
        likelyLearned,
      };
    }),
  );

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
