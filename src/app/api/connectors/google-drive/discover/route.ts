import { NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getValidAccessToken, extractFolderId } from "@/lib/connectors/google-auth";

export async function POST(req: Request) {
  try {
    const operatorId = await getOperatorId();
    const body = await req.json();
    const { folderUrl, connectorId } = body;

    if (!folderUrl || !connectorId) {
      return NextResponse.json(
        { error: "folderUrl and connectorId are required" },
        { status: 400 }
      );
    }

    // Load the pending connector and verify ownership
    const connector = await prisma.sourceConnector.findFirst({
      where: { id: connectorId, operatorId, status: "pending" },
    });

    if (!connector) {
      return NextResponse.json(
        { error: "Pending connector not found" },
        { status: 404 }
      );
    }

    const config = connector.config ? JSON.parse(connector.config) : {};
    const folderId = extractFolderId(folderUrl);

    // Get a valid access token
    let token: string;
    try {
      token = await getValidAccessToken(config);
    } catch {
      return NextResponse.json(
        { error: "Token refresh failed. Please re-authorize Google." },
        { status: 401 }
      );
    }

    // Persist refreshed tokens back to the pending connector
    await prisma.sourceConnector.update({
      where: { id: connectorId },
      data: { config: JSON.stringify(config) },
    });

    // List spreadsheets in the folder
    const query = encodeURIComponent(
      `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet'`
    );
    const driveResp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=100`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!driveResp.ok) {
      const errText = await driveResp.text();
      if (driveResp.status === 404) {
        return NextResponse.json(
          { error: "Folder not found or you don't have access to it." },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `Google Drive API error: ${driveResp.status} ${errText}` },
        { status: 502 }
      );
    }

    const driveData = await driveResp.json();
    const files: Array<{ id: string; name: string }> = driveData.files || [];

    if (files.length === 0) {
      // Clean up the pending connector
      await prisma.sourceConnector.delete({ where: { id: connectorId } });
      return NextResponse.json({
        created: [],
        skipped: [],
        total: 0,
        message: "No spreadsheets found in this folder.",
      });
    }

    // Load existing google-sheets connectors to check for duplicates
    const existingConnectors = await prisma.sourceConnector.findMany({
      where: {
        operatorId,
        provider: "google-sheets",
        status: { not: "pending" },
      },
    });

    const existingSpreadsheetIds = new Set<string>();
    for (const ec of existingConnectors) {
      if (ec.config) {
        try {
          const ecConfig = JSON.parse(ec.config);
          if (ecConfig.spreadsheet_id) {
            existingSpreadsheetIds.add(ecConfig.spreadsheet_id);
          }
        } catch {}
      }
    }

    const created: Array<{ id: string; name: string; spreadsheetId: string }> = [];
    const skipped: Array<{ name: string; reason: string }> = [];

    for (const file of files) {
      if (existingSpreadsheetIds.has(file.id)) {
        skipped.push({ name: file.name, reason: "duplicate" });
        continue;
      }

      const newConfig = {
        access_token: config.access_token,
        refresh_token: config.refresh_token,
        token_expiry: config.token_expiry,
        spreadsheet_id: file.id,
      };

      const newConnector = await prisma.sourceConnector.create({
        data: {
          operatorId,
          provider: "google-sheets",
          name: file.name,
          status: "active",
          config: JSON.stringify(newConfig),
        },
      });

      created.push({
        id: newConnector.id,
        name: file.name,
        spreadsheetId: file.id,
      });
    }

    // Delete the original pending connector
    await prisma.sourceConnector.delete({ where: { id: connectorId } });

    return NextResponse.json({
      created,
      skipped,
      total: created.length,
    });
  } catch (err) {
    console.error("[google-drive/discover] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Discovery failed" },
      { status: 500 }
    );
  }
}
