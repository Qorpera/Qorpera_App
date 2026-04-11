import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDomainSlugs } from "@/lib/domain-scope";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id: slug } = await params;
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || "100"), 500);

  const visibleDomains = await getVisibleDomainSlugs(operatorId, user.id);
  if (visibleDomains !== "all" && !visibleDomains.includes(slug)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Validate domain hub exists
  const hub = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug, scope: "operator", pageType: "domain_hub" },
    select: { slug: true },
  });
  if (!hub) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  // Find external_relationship pages that cross-reference this domain hub
  const externalPages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      pageType: "external_relationship",
      crossReferences: { has: slug },
    },
    select: { slug: true, title: true, pageType: true, content: true, confidence: true },
    take: limit + 1,
  });

  const hasMore = externalPages.length > limit;
  const results = externalPages.slice(0, limit);

  return NextResponse.json({
    links: results,
    totalCount: results.length,
    hasMore,
  });
}
