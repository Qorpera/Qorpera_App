import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDomainSlugs } from "@/lib/domain-scope";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  // Load all wiki pages with map positions
  const pages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      mapX: { not: null },
      mapY: { not: null },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      pageType: true,
      mapX: true,
      mapY: true,
      crossReferences: true,
      confidence: true,
      status: true,
    },
  });

  // Build nodes and edges from wiki pages
  const nodes = pages.map(p => ({
    id: p.slug,
    displayName: p.title,
    type: p.pageType,
    x: p.mapX,
    y: p.mapY,
    confidence: p.confidence,
    status: p.status,
  }));

  // Edges from cross-references (only between pages that both have map positions)
  const slugSet = new Set(pages.map(p => p.slug));
  const edges: Array<{ source: string; target: string }> = [];
  for (const page of pages) {
    for (const ref of page.crossReferences) {
      if (slugSet.has(ref)) {
        edges.push({ source: page.slug, target: ref });
      }
    }
  }

  // Apply domain scoping
  const visibleDomains = await getVisibleDomainSlugs(operatorId, su.user.id);
  if (visibleDomains !== "all") {
    const visibleSet = new Set(visibleDomains);
    // A page is visible if it IS a visible domain, or cross-references a visible domain
    const isVisible = (slug: string, crossRefs: string[]) => {
      if (visibleSet.has(slug)) return true;
      return crossRefs.some(ref => visibleSet.has(ref));
    };

    const visibleSlugs = new Set(
      pages.filter(p => isVisible(p.slug, p.crossReferences)).map(p => p.slug)
    );

    return NextResponse.json({
      nodes: nodes.filter(n => visibleSlugs.has(n.id)),
      edges: edges.filter(e => visibleSlugs.has(e.source) && visibleSlugs.has(e.target)),
    });
  }

  return NextResponse.json({ nodes, edges });
}
