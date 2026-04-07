import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDomainIds } from "@/lib/domain-scope";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;

  const params = req.nextUrl.searchParams;
  const domainId = params.get("domainId");
  const scope = params.get("scope");
  const insightType = params.get("insightType");
  const status = params.get("status") ?? "active";

  const visibleDomains = await getVisibleDomainIds(operatorId, user.id);

  const where: Record<string, unknown> = { operatorId, status };

  if (insightType) where.insightType = insightType;
  if (domainId) where.domainId = domainId;
  if (scope) where.shareScope = scope;

  // Member scoping: own personal + visible department + operator-scoped
  if (visibleDomains !== "all") {
    // Find the member's AI entity
    const aiEntity = await prisma.entity.findFirst({
      where: { operatorId, ownerUserId: user.id, entityType: { slug: "ai-agent" } },
      select: { id: true },
    });

    where.OR = [
      // Own personal insights
      ...(aiEntity ? [{ aiEntityId: aiEntity.id, shareScope: "personal" }] : []),
      // Department-scoped insights for visible departments
      { domainId: { in: visibleDomains }, shareScope: "department" },
      // Operator-scoped insights
      { shareScope: "operator" },
    ];
  }

  const insights = await prisma.operationalInsight.findMany({
    where,
    orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  // Resolve AI entity names
  const aiEntityIds = [...new Set(insights.map((i) => i.aiEntityId))];
  const aiEntities = aiEntityIds.length > 0
    ? await prisma.entity.findMany({
        where: { id: { in: aiEntityIds }, operatorId },
        select: { id: true, displayName: true },
      })
    : [];
  const entityNameMap = new Map(aiEntities.map((e) => [e.id, e.displayName]));

  const items = insights.map((i) => {
    let evidence = null;
    try { evidence = JSON.parse(i.evidence); } catch {}
    return {
      id: i.id,
      aiEntityId: i.aiEntityId,
      aiEntityName: entityNameMap.get(i.aiEntityId) ?? null,
      domainId: i.domainId,
      insightType: i.insightType,
      description: i.description,
      evidence,
      confidence: i.confidence,
      promptModification: i.promptModification,
      shareScope: i.shareScope,
      status: i.status,
      createdAt: i.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ items });
}
