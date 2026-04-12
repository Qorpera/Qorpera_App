import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDomainIds } from "@/lib/domain-scope";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;

  const params = req.nextUrl.searchParams;
  const domainSlug = params.get("domain") ?? undefined;
  const scope = params.get("scope");
  const insightType = params.get("insightType");
  const status = params.get("status") ?? "active";

  const where: Record<string, unknown> = { operatorId, status };

  if (insightType) where.insightType = insightType;
  if (domainSlug) where.domainPageSlug = domainSlug;
  if (scope) where.shareScope = scope;

  // Member scoping: operator-scoped insights visible to all
  const visibleDomains = await getVisibleDomainIds(operatorId, user.id);
  if (visibleDomains !== "all") {
    where.shareScope = "operator";
  }

  const insights = await prisma.operationalInsight.findMany({
    where,
    orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  // Resolve domain names from wiki pages
  const slugs = [...new Set(insights.map(i => i.domainPageSlug).filter(Boolean))] as string[];
  const pageMap = new Map<string, string>();
  if (slugs.length > 0) {
    const pages = await prisma.knowledgePage.findMany({
      where: { operatorId, slug: { in: slugs }, scope: "operator" },
      select: { slug: true, title: true },
    });
    for (const p of pages) pageMap.set(p.slug, p.title);
  }

  const items = insights.map((i) => {
    let evidence = null;
    try { evidence = JSON.parse(i.evidence); } catch {}
    return {
      id: i.id,
      domainPageSlug: i.domainPageSlug ?? null,
      domainName: i.domainPageSlug ? pageMap.get(i.domainPageSlug) ?? null : null,
      insightType: i.insightType,
      description: i.description,
      evidence,
      confidence: i.confidence,
      shareScope: i.shareScope,
      status: i.status,
      createdAt: i.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ items });
}
