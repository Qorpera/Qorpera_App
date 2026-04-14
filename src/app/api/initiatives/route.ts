import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const params = req.nextUrl.searchParams;
  const statusFilter = params.get("status") ?? undefined;

  // Query initiative wiki pages
  const pages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      pageType: "initiative",
      scope: "operator",
    },
    select: {
      slug: true,
      title: true,
      properties: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Filter by status in JS (JSONB filter in Prisma is awkward for optional params)
  const filtered = statusFilter
    ? pages.filter(p => {
        const props = (p.properties ?? {}) as Record<string, unknown>;
        return props.status === statusFilter;
      })
    : pages;

  // Resolve owner wiki page titles
  const ownerSlugs = [...new Set(
    filtered.map(p => ((p.properties ?? {}) as Record<string, unknown>).owner as string | undefined).filter(Boolean),
  )] as string[];
  const ownerPages = ownerSlugs.length > 0
    ? await prisma.knowledgePage.findMany({
        where: { operatorId, slug: { in: ownerSlugs }, scope: "operator" },
        select: { slug: true, title: true },
      })
    : [];
  const ownerPageMap = new Map(ownerPages.map(p => [p.slug, p.title]));

  const items = filtered.map(p => {
    const props = (p.properties ?? {}) as Record<string, unknown>;
    const ownerSlug = (props.owner as string) ?? null;
    return {
      id: p.slug,
      aiEntityId: null,
      ownerPageSlug: ownerSlug,
      ownerName: ownerSlug ? ownerPageMap.get(ownerSlug) ?? null : null,
      proposalType: props.proposal_type ?? "general",
      triggerSummary: p.title,
      status: props.status ?? "proposed",
      rationale: (props.rationale as string) ?? null,
      impactAssessment: (props.impact_assessment as string) ?? null,
      proposedProjectConfig: props.project_config ?? null,
      projectId: (props.project_id as string) ?? null,
      createdAt: p.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ items });
}
