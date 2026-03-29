import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptConfig } from "@/lib/config-encryption";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { operatorId } = session;

  const { tenantId, clientSecret } = await req.json();
  if (!tenantId || typeof tenantId !== "string" || !UUID_REGEX.test(tenantId)) {
    return NextResponse.json({ error: "tenantId must be a valid UUID" }, { status: 400 });
  }
  if (!clientSecret || typeof clientSecret !== "string" || clientSecret.length < 10) {
    return NextResponse.json({ error: "clientSecret is required" }, { status: 400 });
  }

  // Upsert microsoft-delegation-meta connector
  const existing = await prisma.sourceConnector.findFirst({
    where: { operatorId, provider: "microsoft-delegation-meta" },
  });

  const encrypted = encryptConfig({ tenantId, clientSecret });

  if (existing) {
    await prisma.sourceConnector.update({
      where: { id: existing.id },
      data: { config: encrypted, status: "active" },
    });
  } else {
    await prisma.sourceConnector.create({
      data: {
        operatorId,
        provider: "microsoft-delegation-meta",
        name: "Microsoft 365 Delegation",
        status: "active",
        config: encrypted,
      },
    });
  }

  return NextResponse.json({ success: true });
}
