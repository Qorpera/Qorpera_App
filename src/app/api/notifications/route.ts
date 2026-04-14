import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVisibleDomainSlugs } from "@/lib/domain-scope";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const userId = su.effectiveUserId;
  const url = new URL(req.url);

  const unreadOnly = url.searchParams.get("unreadOnly") === "true";
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  const sourceType = url.searchParams.get("sourceType");

  const baseWhere = {
    operatorId,
    OR: [{ userId }, { userId: null }],
  };
  const where: Record<string, unknown> = { ...baseWhere };
  if (unreadOnly) where.read = false;
  if (sourceType) where.sourceType = sourceType;

  let [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
    }),
    prisma.notification.count({ where: { ...baseWhere, read: false } }),
  ]);

  // Filter out situation notifications from invisible departments
  const visibleDomains = await getVisibleDomainSlugs(operatorId, userId);
  if (visibleDomains !== "all") {
    const situationNotifIds = notifications
      .filter(n => n.sourceType === "situation" && n.sourceId)
      .map(n => n.sourceId!);

    if (situationNotifIds.length > 0) {
      // Query KnowledgePage for situation_instance pages matching these IDs
      const visibleSitPages = await prisma.$queryRawUnsafe<Array<{ situation_id: string }>>(
        `SELECT properties->>'situation_id' AS situation_id
         FROM "KnowledgePage"
         WHERE "operatorId" = $1
           AND "pageType" = 'situation_instance'
           AND properties->>'situation_id' = ANY($2::text[])
           AND (properties->>'domain' IS NULL OR properties->>'domain' = ANY($3::text[]))`,
        operatorId, situationNotifIds, visibleDomains,
      );
      const visibleSitIds = new Set(visibleSitPages.map(s => s.situation_id));

      notifications = notifications.filter(n =>
        n.sourceType !== "situation" || !n.sourceId || visibleSitIds.has(n.sourceId)
      );
    }

    // Recount unread after filtering
    unreadCount = notifications.filter(n => !n.read).length;
  }

  return NextResponse.json({
    items: notifications.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      read: n.read,
      sourceType: n.sourceType,
      sourceId: n.sourceId,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
  });
}

export async function PATCH(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const body = await req.json();

  if (body.markAllRead) {
    const result = await prisma.notification.updateMany({
      where: { operatorId, read: false, OR: [{ userId: su.user.id }, { userId: null }] },
      data: { read: true },
    });
    return NextResponse.json({ updated: result.count });
  }

  const { ids } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: "ids must be a non-empty array" },
      { status: 400 }
    );
  }

  const result = await prisma.notification.updateMany({
    where: {
      id: { in: ids },
      operatorId,
    },
    data: { read: true },
  });

  return NextResponse.json({ updated: result.count });
}
