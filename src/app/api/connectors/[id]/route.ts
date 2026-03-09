import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getProvider } from "@/lib/connectors/registry";
import { decrypt, encrypt } from "@/lib/encryption";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const operatorId = await getOperatorId();
  const { id } = await params;

  const connector = await prisma.sourceConnector.findFirst({
    where: { id, operatorId },
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
    const parsed = JSON.parse(decrypt(connector.config));
    safeConfig = {
      spreadsheet_id: parsed.spreadsheet_id || "",
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
  const operatorId = await getOperatorId();
  const { id } = await params;
  const body = await req.json();

  const connector = await prisma.sourceConnector.findFirst({
    where: { id, operatorId },
  });

  if (!connector) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existingConfig = connector.config ? JSON.parse(decrypt(connector.config)) : {};
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.status !== undefined) updates.status = body.status;

  // Merge config fields (spreadsheet_id, etc.) without overwriting tokens
  if (body.spreadsheet_id !== undefined) {
    existingConfig.spreadsheet_id = body.spreadsheet_id;
    updates.config = encrypt(JSON.stringify(existingConfig));
  }

  // If finalizing from pending → active, test the connection
  if (
    connector.status === "pending" &&
    (body.status === "active" || body.spreadsheet_id)
  ) {
    const provider = getProvider(connector.provider);
    if (provider && existingConfig.spreadsheet_id) {
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
    updates.config = encrypt(JSON.stringify(existingConfig));
  }

  const updated = await prisma.sourceConnector.update({
    where: { id },
    data: updates,
  });

  // Strip sensitive config from response
  let safeConfig: Record<string, unknown> = {};
  if (updated.config) {
    const parsed = JSON.parse(decrypt(updated.config));
    safeConfig = {
      spreadsheet_id: parsed.spreadsheet_id || "",
      hasTokens: !!(parsed.access_token && parsed.refresh_token),
    };
  }

  return NextResponse.json({ ...updated, config: safeConfig });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const operatorId = await getOperatorId();
  const { id } = await params;

  const connector = await prisma.sourceConnector.findFirst({
    where: { id, operatorId },
  });

  if (!connector) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete sync logs first, then the connector
  await prisma.syncLog.deleteMany({ where: { connectorId: id } });
  await prisma.actionCapability.deleteMany({ where: { connectorId: id } });
  await prisma.sourceConnector.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
