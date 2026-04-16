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
      content: true,
      properties: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Dismissed initiatives are never listed — they fire a notification on dismissal,
  // but don't deserve presence in the initiatives list. Detected initiatives are
  // also hidden (pre-reasoning, user shouldn't see).
  const visiblePages = pages.filter(p => {
    const props = (p.properties ?? {}) as Record<string, unknown>;
    return props.status !== "detected" && props.status !== "dismissed";
  });

  // Apply statusFilter to visiblePages. Note: statusFilter=dismissed returns empty
  // because dismissed never survives the visiblePages filter above.
  const filtered = statusFilter
    ? visiblePages.filter(p => {
        const props = (p.properties ?? {}) as Record<string, unknown>;
        return props.status === statusFilter;
      })
    : visiblePages;

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
    const proposalMatch = p.content?.match(/## Proposal\s*\n([\s\S]*?)(?=\n## |\n$|$)/);
    const triggerMatch = p.content?.match(/## Trigger\s*\n([\s\S]*?)(?=\n## |\n$|$)/);
    return {
      id: p.slug,
      aiEntityId: null,
      ownerPageSlug: ownerSlug,
      ownerName: ownerSlug ? ownerPageMap.get(ownerSlug) ?? null : null,
      proposalType: props.proposal_type ?? "general",
      triggerSummary: p.title || "Untitled initiative",
      status: props.status ?? "proposed",
      rationale: (props.rationale as string)
        ?? proposalMatch?.[1]?.trim()
        ?? triggerMatch?.[1]?.trim()
        ?? null,
      impactAssessment: (props.impact_assessment as string) ?? null,
      proposedProjectConfig: props.project_config ?? null,
      projectId: (props.project_id as string) ?? null,
      createdAt: p.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ items });
}
