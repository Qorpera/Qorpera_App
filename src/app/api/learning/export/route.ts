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
  const exportSchema = z.object({ days: daysParam, format: z.enum(["csv"]).default("csv") });
  const parsed = parseQuery(exportSchema, req.nextUrl.searchParams);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { days } = parsed.data;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Load situation instances from KnowledgePage
  type SitPage = {
    title: string;
    properties: Record<string, unknown> | null;
    createdAt: Date;
    crossReferences: string[];
  };
  const sitPages = await prisma.knowledgePage.findMany({
    where: { operatorId, pageType: "situation_instance", scope: "operator", createdAt: { gte: since } },
    select: { title: true, properties: true, createdAt: true, crossReferences: true },
    orderBy: { createdAt: "desc" },
  }) as SitPage[];

  // Filter by visible domains
  const filteredPages = visibleDomains === "all"
    ? sitPages
    : sitPages.filter((p) => {
        const domain = p.properties?.domain as string | undefined;
        return !domain || visibleDomains.includes(domain);
      });

  // Resolve domain slugs to names
  const domainSlugs = [
    ...new Set(
      filteredPages
        .map((p) => p.properties?.domain as string | undefined)
        .filter((s): s is string => !!s),
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
  const rows = filteredPages.map((p) => {
    const props = p.properties ?? {};
    const date = p.createdAt.toISOString().slice(0, 10);
    const sitType = csvEscape((props.situation_type as string) ?? "");
    const domain = props.domain as string | undefined;
    const dept = csvEscape(domain ? deptNameMap.get(domain) ?? "" : "");
    const entity = csvEscape(p.title ?? "");
    const status = (props.status as string) ?? "";
    const outcome = (props.outcome as string) ?? "";
    const severity = typeof props.severity === "number" ? (props.severity as number).toFixed(2) : "0.00";
    const confidence = typeof props.confidence === "number" ? (props.confidence as number).toFixed(2) : "0.00";
    const reasoningSummary = "";
    const feedbackCategory = "";
    const feedbackText = "";

    return `${date},${sitType},${dept},${entity},${status},${outcome},${severity},${confidence},${csvEscape(reasoningSummary)},${feedbackCategory},${csvEscape(feedbackText)}`;
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
