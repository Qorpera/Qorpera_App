import { prisma } from "@/lib/db";
import { getProvider } from "@/lib/connectors/registry";
import { materializeUnprocessed } from "@/lib/event-materializer";

export type SyncResult = {
  status: "success" | "partial" | "failed";
  eventsCreated: number;
  eventsSkipped: number;
  errors: string[];
  durationMs: number;
};

export async function runConnectorSync(
  operatorId: string,
  connectorId: string
): Promise<SyncResult> {
  const start = Date.now();
  const errors: string[] = [];
  let eventsCreated = 0;
  let eventsSkipped = 0;

  const connector = await prisma.sourceConnector.findFirst({
    where: { id: connectorId, operatorId },
  });

  if (!connector) {
    return {
      status: "failed",
      eventsCreated: 0,
      eventsSkipped: 0,
      errors: ["Connector not found"],
      durationMs: Date.now() - start,
    };
  }

  const provider = getProvider(connector.provider);
  if (!provider) {
    return {
      status: "failed",
      eventsCreated: 0,
      eventsSkipped: 0,
      errors: [`Unknown provider: ${connector.provider}`],
      durationMs: Date.now() - start,
    };
  }

  const config = connector.config ? JSON.parse(connector.config) : {};
  let syncStatus: "success" | "partial" | "failed" = "success";

  try {
    const since = connector.lastSyncAt ?? undefined;

    for await (const event of provider.sync(config, since)) {
      try {
        await prisma.event.create({
          data: {
            operatorId,
            connectorId,
            source: connector.provider,
            eventType: event.eventType,
            payload: JSON.stringify(event.payload),
          },
        });
        eventsCreated++;
      } catch (err) {
        // Likely a duplicate or constraint violation
        eventsSkipped++;
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    errors.push(errMsg);
    syncStatus = eventsCreated > 0 ? "partial" : "failed";
  }

  const durationMs = Date.now() - start;

  // Persist updated tokens (may have been refreshed during sync)
  await prisma.sourceConnector.update({
    where: { id: connectorId },
    data: {
      config: JSON.stringify(config),
      lastSyncAt: new Date(),
      status: syncStatus === "failed" ? "error" : "active",
    },
  });

  // Log the sync
  await prisma.syncLog.create({
    data: {
      connectorId,
      status: syncStatus,
      eventsCreated,
      eventsSkipped,
      errors: errors.length > 0 ? JSON.stringify(errors) : null,
      durationMs,
    },
  });

  // Register action capabilities from this connector
  if (provider.getCapabilities) {
    try {
      const capabilities = await provider.getCapabilities(config);
      for (const cap of capabilities) {
        const existing = await prisma.actionCapability.findFirst({
          where: { operatorId, connectorId, name: cap.name },
        });
        if (existing) {
          await prisma.actionCapability.update({
            where: { id: existing.id },
            data: {
              description: cap.description,
              inputSchema: JSON.stringify(cap.inputSchema),
              sideEffects: JSON.stringify(cap.sideEffects),
              enabled: true,
            },
          });
        } else {
          await prisma.actionCapability.create({
            data: {
              operatorId,
              connectorId,
              name: cap.name,
              description: cap.description,
              inputSchema: JSON.stringify(cap.inputSchema),
              sideEffects: JSON.stringify(cap.sideEffects),
              enabled: true,
            },
          });
        }
      }
    } catch (err) {
      // Non-fatal — don't fail the sync over capability registration
      console.error("[connector-sync] Failed to register capabilities:", err);
    }
  }

  // Trigger materialization for the new events
  if (eventsCreated > 0) {
    try {
      await materializeUnprocessed(operatorId, eventsCreated);
    } catch {
      // Materialization errors are non-fatal for sync
    }
  }

  return {
    status: syncStatus,
    eventsCreated,
    eventsSkipped,
    errors,
    durationMs,
  };
}
