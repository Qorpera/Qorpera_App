import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptConfig } from "@/lib/config-encryption";
import { testMicrosoftAppAccess } from "@/lib/connectors/microsoft-365-delegation";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  let { tenantId } = await req.json().catch(() => ({ tenantId: null }));

  // If tenantId not provided, read from saved meta connector
  if (!tenantId) {
    const meta = await prisma.sourceConnector.findFirst({
      where: { operatorId: session.operatorId, provider: "microsoft-delegation-meta" },
    });
    if (meta?.config) {
      const config = decryptConfig(meta.config) as Record<string, unknown>;
      tenantId = config.tenantId as string;
    }
  }

  if (!tenantId || typeof tenantId !== "string") {
    return NextResponse.json({ error: "tenantId is required" }, { status: 400 });
  }
  if (!UUID_REGEX.test(tenantId)) {
    return NextResponse.json({ error: "tenantId must be a valid UUID" }, { status: 400 });
  }

  const result = await testMicrosoftAppAccess(tenantId);
  return NextResponse.json(result);
}
