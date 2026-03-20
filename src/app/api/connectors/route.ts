import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getProvider, listProviders } from "@/lib/connectors/registry";
import { encrypt, decrypt } from "@/lib/encryption";
import { registerConnectorCapabilities } from "@/lib/connectors/capability-registration";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

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

  const items = connectors.map((c) => {
    let spreadsheetCount = 0;
    if (c.provider === "google-sheets" && c.config) {
      try {
        const parsed = JSON.parse(decrypt(c.config));
        spreadsheetCount = (parsed.spreadsheet_ids || []).length;
      } catch { /* ignore */ }
    }
    return {
      id: c.id,
      provider: c.provider,
      providerName: providerMap[c.provider] || c.provider,
      name: c.name,
      status: c.status,
      userId: c.userId,
      lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
      spreadsheetCount,
      lastSyncResult: c.syncLogs[0]
        ? {
            eventsCreated: c.syncLogs[0].eventsCreated,
            status: c.syncLogs[0].status,
            createdAt: c.syncLogs[0].createdAt.toISOString(),
          }
        : undefined,
    };
  });

  return NextResponse.json({ connectors: items });
}

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { operatorId } = su;
  const body = await req.json();
  const { provider: providerId, name, config } = body;

  if (!providerId) {
    return NextResponse.json({ error: "provider is required" }, { status: 400 });
  }

  const provider = getProvider(providerId);
  if (!provider) {
    return NextResponse.json({ error: `Unknown provider: ${providerId}` }, { status: 400 });
  }

  // For connectors with inline config (non-OAuth), test connection first
  if (config && Object.keys(config).length > 0) {
    try {
      const testResult = await provider.testConnection(config);
      if (!testResult.ok) {
        return NextResponse.json(
          { error: testResult.error || "Connection test failed" },
          { status: 400 }
        );
      }
    } catch (err) {
      return NextResponse.json(
        { error: `Connection test error: ${err instanceof Error ? err.message : String(err)}` },
        { status: 400 }
      );
    }
  }

  const connector = await prisma.sourceConnector.create({
    data: {
      operatorId,
      provider: providerId,
      name: name || provider.name,
      status: config ? "active" : "pending",
      config: config ? encrypt(JSON.stringify(config)) : null,
    },
  });

  // Register write-back capabilities (fire-and-forget)
  registerConnectorCapabilities(connector.id, operatorId, provider).catch((err) =>
    console.error("[connectors] Failed to register write capabilities:", err),
  );

  const { config: _config, ...connectorResponse } = connector;
  return NextResponse.json(connectorResponse, { status: 201 });
}
