import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role !== "superadmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const connectorId = req.nextUrl.searchParams.get("connectorId");
  if (!connectorId) return NextResponse.json({ error: "connectorId is required" }, { status: 400 });

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "10", 10), 50);

  const connector = await prisma.sourceConnector.findFirst({
    where: { id: connectorId },
    select: { id: true, provider: true, name: true },
  });

  if (!connector) return NextResponse.json({ error: "Connector not found" }, { status: 404 });

  const syncs = await prisma.syncLog.findMany({
    where: { connectorId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      status: true,
      eventsCreated: true,
      eventsSkipped: true,
      durationMs: true,
      diagnostics: true,
    },
  });

  return NextResponse.json({
    connectorId: connector.id,
    provider: connector.provider,
    name: connector.name,
    syncs: syncs.map((s) => ({
      syncLogId: s.id,
      syncedAt: s.createdAt,
      status: s.status,
      eventsCreated: s.eventsCreated,
      eventsSkipped: s.eventsSkipped,
      durationMs: s.durationMs,
      diagnostics: s.diagnostics ? JSON.parse(s.diagnostics) : null,
    })),
  });
}
