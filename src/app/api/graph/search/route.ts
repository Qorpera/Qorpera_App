import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDomainSlugs } from "@/lib/domain-scope";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const query = req.nextUrl.searchParams.get("q") || "";
  if (!query) return NextResponse.json({ results: [] });

  const pages = await prisma.knowledgePage.findMany({
    where: {
      operatorId: su.operatorId,
      scope: "operator",
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { slug: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { slug: true, title: true, pageType: true, mapX: true, mapY: true, crossReferences: true },
    take: 50,
  });

  const visibleDomains = await getVisibleDomainSlugs(su.operatorId, su.user.id);

  let results = pages;
  if (visibleDomains !== "all") {
    const visibleSet = new Set(visibleDomains);
    results = pages.filter(p => visibleSet.has(p.slug) || p.crossReferences.some(ref => visibleSet.has(ref)));
  }

  return NextResponse.json({
    results: results.slice(0, 20).map(({ crossReferences: _, ...rest }) => rest),
  });
}
