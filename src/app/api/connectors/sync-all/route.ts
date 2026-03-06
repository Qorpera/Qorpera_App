import { NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runConnectorSync } from "@/lib/connector-sync";

export async function POST() {
  try {
    const operatorId = await getOperatorId();

    const connectors = await prisma.sourceConnector.findMany({
      where: {
        operatorId,
        status: "active",
        lastSyncAt: null,
      },
    });

    const synced: Array<{
      connectorId: string;
      name: string;
      eventsCreated: number;
      status: string;
    }> = [];
    const errors: Array<{
      connectorId: string;
      name: string;
      error: string;
    }> = [];

    for (const connector of connectors) {
      try {
        const result = await runConnectorSync(operatorId, connector.id);
        synced.push({
          connectorId: connector.id,
          name: connector.name || connector.provider,
          eventsCreated: result.eventsCreated,
          status: result.status,
        });
      } catch (err) {
        errors.push({
          connectorId: connector.id,
          name: connector.name || connector.provider,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({ synced, errors });
  } catch (err) {
    console.error("[sync-all] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Batch sync failed" },
      { status: 500 }
    );
  }
}
