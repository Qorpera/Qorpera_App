import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const isAdmin = su.user.role === "admin" || su.user.role === "superadmin";

  const connectors = await prisma.sourceConnector.findMany({
    where: isAdmin
      ? { operatorId }  // Admins see soft-deleted connectors too
      : { operatorId, deletedAt: null },
    include: {
      syncLogs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          createdAt: true,
          eventsCreated: true,
          eventsSkipped: true,
          durationMs: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const items = connectors.map((c) => ({
    id: c.id,
    name: c.name,
    provider: c.provider,
    status: c.status,
    healthStatus: c.healthStatus,
    lastHealthCheck: c.lastHealthCheck?.toISOString() ?? null,
    lastError: c.lastError,
    consecutiveFailures: c.consecutiveFailures,
    deletedAt: c.deletedAt?.toISOString() ?? null,
    lastSync: c.syncLogs[0]
      ? {
          completedAt: c.syncLogs[0].createdAt.toISOString(),
          eventsCreated: c.syncLogs[0].eventsCreated,
          eventsSkipped: c.syncLogs[0].eventsSkipped,
          durationMs: c.syncLogs[0].durationMs,
          status: c.syncLogs[0].status,
        }
      : null,
  }));

  return NextResponse.json(items);
}
