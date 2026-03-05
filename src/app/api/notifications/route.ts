import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const operatorId = await getOperatorId();
  const url = new URL(req.url);

  const unreadOnly = url.searchParams.get("unreadOnly") ?? "true";
  const limit = parseInt(url.searchParams.get("limit") ?? "50");

  const where: Record<string, unknown> = { operatorId };
  if (unreadOnly === "true") where.read = false;

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });

  return NextResponse.json({ notifications });
}

export async function PATCH(req: NextRequest) {
  const operatorId = await getOperatorId();
  const body = await req.json();
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
