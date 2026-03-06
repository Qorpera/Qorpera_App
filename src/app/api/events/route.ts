import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const operatorId = await getOperatorId();
  const body = await req.json();
  const { source, eventType, payload, connectorId } = body;

  if (!source || !eventType || payload === undefined || !connectorId) {
    return NextResponse.json(
      { error: "source, eventType, payload, and connectorId are required" },
      { status: 400 }
    );
  }

  const event = await prisma.event.create({
    data: {
      operatorId,
      connectorId,
      source,
      eventType,
      payload: JSON.stringify(payload),
      processedAt: null,
    },
  });

  return NextResponse.json(event, { status: 201 });
}

export async function GET(req: NextRequest) {
  const operatorId = await getOperatorId();
  const url = new URL(req.url);

  const source = url.searchParams.get("source") ?? undefined;
  const eventType = url.searchParams.get("eventType") ?? undefined;
  const processed = url.searchParams.get("processed");
  const limit = parseInt(url.searchParams.get("limit") ?? "50");
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const where: Record<string, unknown> = { operatorId };

  if (source) where.source = source;
  if (eventType) where.eventType = eventType;
  if (processed === "true") where.processedAt = { not: null };
  else if (processed === "false") where.processedAt = null;
  if (cursor) where.createdAt = { lt: new Date(cursor) };

  const events = await prisma.event.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });

  const nextCursor =
    events.length === limit
      ? events[events.length - 1].createdAt.toISOString()
      : undefined;

  return NextResponse.json({ events, nextCursor });
}
