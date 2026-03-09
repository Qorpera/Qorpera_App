import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getProvider, listProviders } from "@/lib/connectors/registry";
import { encrypt } from "@/lib/encryption";

export async function GET() {
  const operatorId = await getOperatorId();

  const connectors = await prisma.sourceConnector.findMany({
    where: { operatorId },
    include: {
      syncLogs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const providers = listProviders();
  const providerMap = Object.fromEntries(providers.map((p) => [p.id, p.name]));

  const items = connectors.map((c) => ({
    id: c.id,
    provider: c.provider,
    providerName: providerMap[c.provider] || c.provider,
    name: c.name,
    status: c.status,
    lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
    lastSyncResult: c.syncLogs[0]
      ? {
          eventsCreated: c.syncLogs[0].eventsCreated,
          status: c.syncLogs[0].status,
          createdAt: c.syncLogs[0].createdAt.toISOString(),
        }
      : undefined,
  }));

  return NextResponse.json({ connectors: items });
}

export async function POST(req: NextRequest) {
  const operatorId = await getOperatorId();
  const body = await req.json();
  const { provider: providerId, name, config } = body;

  if (!providerId) {
    return NextResponse.json({ error: "provider is required" }, { status: 400 });
  }

  const provider = getProvider(providerId);
  if (!provider) {
    return NextResponse.json({ error: `Unknown provider: ${providerId}` }, { status: 400 });
  }

  const connector = await prisma.sourceConnector.create({
    data: {
      operatorId,
      provider: providerId,
      name: name || "",
      status: "pending",
      config: config ? encrypt(JSON.stringify(config)) : null,
    },
  });

  return NextResponse.json(connector, { status: 201 });
}
