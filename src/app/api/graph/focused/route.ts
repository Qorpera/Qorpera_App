import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDomainSlugs } from "@/lib/domain-scope";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const visibleDomains = await getVisibleDomainSlugs(su.operatorId, su.user.id);

  const page = await prisma.knowledgePage.findFirst({
    where: { operatorId: su.operatorId, slug, scope: "operator" },
    select: {
      slug: true, title: true, pageType: true, content: true,
      mapX: true, mapY: true, crossReferences: true, confidence: true,
    },
  });

  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  // Check page is visible (is a visible domain or references one)
  if (visibleDomains !== "all") {
    const visibleSet = new Set(visibleDomains);
    const pageVisible = visibleSet.has(page.slug) || page.crossReferences.some(ref => visibleSet.has(ref));
    if (!pageVisible) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Load all cross-referenced pages
  const related = await prisma.knowledgePage.findMany({
    where: { operatorId: su.operatorId, slug: { in: page.crossReferences }, scope: "operator" },
    select: { slug: true, title: true, pageType: true, mapX: true, mapY: true, crossReferences: true },
  });

  // Filter related pages by domain scope
  let filteredRelated = related;
  if (visibleDomains !== "all") {
    const visibleSet = new Set(visibleDomains);
    filteredRelated = related.filter(r => visibleSet.has(r.slug) || r.crossReferences.some(ref => visibleSet.has(ref)));
  }

  return NextResponse.json({
    page,
    related: filteredRelated.map(({ crossReferences: _, ...rest }) => rest),
  });
}
