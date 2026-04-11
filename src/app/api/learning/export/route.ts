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
  const exportSchema = z.object({ days: daysParam, format: z.enum(["csv"]).default("csv") });
  const parsed = parseQuery(exportSchema, req.nextUrl.searchParams);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { days } = parsed.data;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Load situations with related data
  const situations = await prisma.situation.findMany({
    where: { operatorId, createdAt: { gte: since }, ...situationScopeFilter(visibleDomains) },
    include: {
      situationType: {
        select: {
          name: true,
          scopeEntityId: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Resolve trigger names via wiki pages
  const triggerSlugs = [
    ...new Set(
      situations
        .map((s) => s.triggerPageSlug)
        .filter((s): s is string => s !== null),
    ),
  ];
  const triggerPages = triggerSlugs.length > 0
    ? await prisma.knowledgePage.findMany({
        where: { operatorId, slug: { in: triggerSlugs }, scope: "operator" },
        select: { slug: true, title: true },
      })
    : [];
  const triggerNameMap = new Map(triggerPages.map((p) => [p.slug, p.title]));

  // Resolve department names via wiki pages
  const domainSlugs = [
    ...new Set(
      situations
        .map((s) => s.domainPageSlug)
        .filter((s): s is string => s !== null),
    ),
  ];
  const domainPages = domainSlugs.length > 0
    ? await prisma.knowledgePage.findMany({
        where: { operatorId, slug: { in: domainSlugs }, scope: "operator" },
        select: { slug: true, title: true },
      })
    : [];
  const deptNameMap = new Map(domainPages.map((p) => [p.slug, p.title]));

  // Build CSV
  const header = "date,situation_type,department,entity,status,outcome,severity,confidence,reasoning_summary,feedback_category,feedback_text";
  const rows = situations.map((s) => {
    const date = s.createdAt.toISOString().slice(0, 10);
    const sitType = csvEscape(s.situationType.name);
    const dept = csvEscape(
      s.domainPageSlug
        ? deptNameMap.get(s.domainPageSlug) ?? ""
        : "",
    );
    const entity = csvEscape(
      s.triggerPageSlug
        ? triggerNameMap.get(s.triggerPageSlug) ?? s.triggerPageSlug
        : "",
    );
    const status = s.status;
    const outcome = s.outcome ?? "";
    const severity = s.severity.toFixed(2);
    const confidence = s.confidence.toFixed(2);

    let reasoningSummary = "";
    if (s.reasoning) {
      try {
        const parsed = JSON.parse(s.reasoning);
        if (typeof parsed.analysis === "string") {
          reasoningSummary = parsed.analysis.slice(0, 200);
        }
      } catch {
        // ignore parse errors
      }
    }

    const feedbackCategory = s.feedbackCategory ?? "";
    const feedbackText = csvEscape(s.feedback ?? "");

    return `${date},${sitType},${dept},${entity},${status},${outcome},${severity},${confidence},${csvEscape(reasoningSummary)},${feedbackCategory},${feedbackText}`;
  });

  const csv = [header, ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="learning-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
