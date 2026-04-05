import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  const params = req.nextUrl.searchParams;
  const pageType = params.get("pageType");
  const status = params.get("status");
  const search = params.get("q");
  const projectId = params.get("projectId");
  const scopeParam = params.get("scope") ?? "operator";

  // System scope requires superadmin
  if (scopeParam === "system" && su.effectiveRole !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const where: Record<string, unknown> = {
    pageType: { notIn: ["index", "log"] },
  };

  if (scopeParam === "system") {
    where.scope = "system";
  } else {
    where.operatorId = operatorId;
    where.scope = "operator";
    where.projectId = projectId ?? null;
  }

  if (pageType && !["index", "log"].includes(pageType)) where.pageType = pageType;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { content: { contains: search, mode: "insensitive" } },
    ];
  }

  const pages = await prisma.knowledgePage.findMany({
    where,
    select: {
      id: true,
      slug: true,
      title: true,
      pageType: true,
      status: true,
      confidence: true,
      sourceCount: true,
      contentTokens: true,
      reasoningUseCount: true,
      outcomeApproved: true,
      outcomeRejected: true,
      version: true,
      lastSynthesizedAt: true,
      synthesisPath: true,
      verifiedAt: true,
      citedByPages: true,
    },
    orderBy: [{ pageType: "asc" }, { title: "asc" }],
  });

  const byType: Record<string, number> = {};
  for (const p of pages) {
    byType[p.pageType] = (byType[p.pageType] ?? 0) + 1;
  }

  const stats = {
    total: pages.length,
    verified: pages.filter((p) => p.status === "verified").length,
    stale: pages.filter((p) => p.status === "stale").length,
    draft: pages.filter((p) => p.status === "draft").length,
    quarantined: pages.filter((p) => p.status === "quarantined").length,
    avgConfidence:
      pages.length > 0
        ? pages.reduce((sum, p) => sum + p.confidence, 0) / pages.length
        : 0,
  };

  return NextResponse.json({ pages, byType, stats });
}
