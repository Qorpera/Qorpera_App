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
