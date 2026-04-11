import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const params = req.nextUrl.searchParams;
  const statusFilter = params.get("status") ?? undefined;

  const where: Record<string, unknown> = { operatorId };
  if (statusFilter) where.status = statusFilter;

  const initiatives = await prisma.initiative.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  // Resolve owner wiki page titles
  const ownerSlugs = [...new Set(initiatives.map(i => i.ownerPageSlug).filter(Boolean))] as string[];
  const ownerPages = ownerSlugs.length > 0
    ? await prisma.knowledgePage.findMany({
        where: { operatorId, slug: { in: ownerSlugs }, scope: "operator" },
        select: { slug: true, title: true },
      })
    : [];
  const ownerPageMap = new Map(ownerPages.map(p => [p.slug, p.title]));

  const items = initiatives.map(i => ({
    id: i.id,
    aiEntityId: i.aiEntityId,
    ownerPageSlug: i.ownerPageSlug,
    ownerName: i.ownerPageSlug ? ownerPageMap.get(i.ownerPageSlug) ?? null : null,
    proposalType: i.proposalType,
    triggerSummary: i.triggerSummary,
    status: i.status,
    rationale: i.rationale,
    impactAssessment: i.impactAssessment,
    proposedProjectConfig: i.proposedProjectConfig,
    projectId: i.projectId,
    createdAt: i.createdAt.toISOString(),
  }));

  return NextResponse.json({ items });
}
