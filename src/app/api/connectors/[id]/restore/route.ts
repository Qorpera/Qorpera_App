import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { operatorId } = su;
  const { id } = await params;

  const connector = await prisma.sourceConnector.findFirst({
    where: { id, operatorId },
  });

  if (!connector) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!connector.deletedAt) {
    return NextResponse.json({ error: "Connector is not deleted" }, { status: 400 });
  }

  const restored = await prisma.sourceConnector.update({
    where: { id },
    data: {
      deletedAt: null,
      deletedById: null,
      healthStatus: "degraded",
    },
  });

  return NextResponse.json({
    id: restored.id,
    provider: restored.provider,
    name: restored.name,
    status: restored.status,
    healthStatus: restored.healthStatus,
  });
}
