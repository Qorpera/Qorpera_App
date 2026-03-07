import { NextRequest, NextResponse } from "next/server";
import { getOperatorId, getUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const operatorId = await getOperatorId();
  const userId = await getUserId();
  const url = new URL(req.url);

  const unreadOnly = url.searchParams.get("unreadOnly") === "true";
  const limit = parseInt(url.searchParams.get("limit") ?? "50");
  const sourceType = url.searchParams.get("sourceType");

  const baseWhere = {
    operatorId,
    OR: [{ userId }, { userId: null }],
  };
  const where: Record<string, unknown> = { ...baseWhere };
  if (unreadOnly) where.read = false;
  if (sourceType) where.sourceType = sourceType;

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
    }),
    prisma.notification.count({ where: { ...baseWhere, read: false } }),
  ]);

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
  const operatorId = await getOperatorId();
  const body = await req.json();

  if (body.markAllRead) {
    const result = await prisma.notification.updateMany({
      where: { operatorId, read: false },
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
