import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getProvider } from "@/lib/connectors/registry";
import { decryptConfig, encryptConfig } from "@/lib/config-encryption";
import { ACTIVE_CONNECTOR } from "@/lib/connector-filters";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id } = await params;

  const connector = await prisma.sourceConnector.findFirst({
    where: { ...ACTIVE_CONNECTOR, id, operatorId },
    include: {
      syncLogs: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!connector) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Strip sensitive fields from config for the response
  let safeConfig: Record<string, unknown> = {};
  if (connector.config) {
    const parsed = decryptConfig(connector.config) as Record<string, any>;
    safeConfig = {
      spreadsheet_id: parsed.spreadsheet_id || "",
      spreadsheet_ids: parsed.spreadsheet_ids || [],
      spreadsheets: parsed.spreadsheets || [],
      hasTokens: !!(parsed.access_token && parsed.refresh_token),
    };
  }

  return NextResponse.json({
    ...connector,
    config: safeConfig,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { operatorId } = su;
  const { id } = await params;
  const body = await req.json();

  const connector = await prisma.sourceConnector.findFirst({
    where: { ...ACTIVE_CONNECTOR, id, operatorId },
  });

  if (!connector) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existingConfig = (connector.config ? decryptConfig(connector.config) : {}) as Record<string, any>;
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.status !== undefined) updates.status = body.status;

  // Merge config fields (spreadsheet_id, spreadsheet_ids, spreadsheets) without overwriting tokens
  if (body.spreadsheet_id !== undefined) {
    existingConfig.spreadsheet_id = body.spreadsheet_id;
    updates.config = encryptConfig(existingConfig);
  }
  if (body.spreadsheet_ids !== undefined && Array.isArray(body.spreadsheet_ids)) {
    existingConfig.spreadsheet_ids = body.spreadsheet_ids;
    existingConfig.spreadsheet_id = body.spreadsheet_ids[0] || "";
    updates.config = encryptConfig(existingConfig);
  }
  if (body.spreadsheets !== undefined && Array.isArray(body.spreadsheets)) {
    existingConfig.spreadsheets = body.spreadsheets;
    const selectedIds = body.spreadsheets.filter((s: { selected?: boolean }) => s.selected !== false).map((s: { id: string }) => s.id);
    existingConfig.spreadsheet_ids = selectedIds;
    existingConfig.spreadsheet_id = selectedIds[0] || "";
    updates.config = encryptConfig(existingConfig);
  }

  // If finalizing from pending → active, test the connection
  if (
    connector.status === "pending" &&
    (body.status === "active" || body.spreadsheet_id || body.spreadsheet_ids?.length || body.spreadsheets?.length)
  ) {
    const provider = getProvider(connector.provider);
    if (provider && (existingConfig.spreadsheet_id || existingConfig.spreadsheet_ids?.length)) {
      const test = await provider.testConnection(existingConfig);
      if (test.ok) {
        updates.status = "active";

        // Register capabilities
        const caps = await provider.getCapabilities(existingConfig);
        for (const cap of caps) {
          await prisma.actionCapability.create({
            data: {
              operatorId,
              connectorId: id,
              name: cap.name,
              description: cap.description,
              inputSchema: JSON.stringify(cap.inputSchema),
              sideEffects: JSON.stringify(cap.sideEffects),
            },
          });
        }
      } else {
        updates.status = "error";
      }
    }
  }

  if (!updates.config && body.spreadsheet_id !== undefined) {
    updates.config = encryptConfig(existingConfig);
  }

  const updated = await prisma.sourceConnector.update({
    where: { id },
    data: updates,
  });

  // Strip sensitive config from response
  let safeConfig: Record<string, unknown> = {};
  if (updated.config) {
    const parsed = decryptConfig(updated.config) as Record<string, any>;
    safeConfig = {
      spreadsheet_id: parsed.spreadsheet_id || "",
      spreadsheet_ids: parsed.spreadsheet_ids || [],
      spreadsheets: parsed.spreadsheets || [],
      hasTokens: !!(parsed.access_token && parsed.refresh_token),
    };
  }

  return NextResponse.json({ ...updated, config: safeConfig });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id } = await params;

  const connector = await prisma.sourceConnector.findFirst({
    where: { ...ACTIVE_CONNECTOR, id, operatorId },
  });

  if (!connector) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Users can disconnect their own personal connectors; otherwise admin required
  const isOwnConnector = connector.userId === su.user.id;
  if (!isOwnConnector && su.user.role === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  // Soft-delete: mark as deleted, preserve historical data
  await prisma.sourceConnector.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedById: su.user.id,
      healthStatus: "disconnected",
    },
  });

  return NextResponse.json({ deleted: true });
}
