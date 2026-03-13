import { prisma } from "@/lib/db";
import { getProvider } from "@/lib/connectors/registry";
import { materializeUnprocessed } from "@/lib/event-materializer";
import { decrypt, encrypt } from "@/lib/encryption";
import { ingestContent } from "@/lib/content-pipeline";
import { ingestActivity, resolveDepartmentsFromEmails } from "@/lib/activity-pipeline";

type SyncResult = {
  status: "success" | "partial" | "failed";
  eventsCreated: number;
  eventsSkipped: number;
  contentIngested: number;
  activitiesIngested: number;
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
  let contentIngested = 0;
  let activitiesIngested = 0;

  const connector = await prisma.sourceConnector.findFirst({
    where: { id: connectorId, operatorId },
  });

  if (!connector) {
    return {
      status: "failed",
      eventsCreated: 0,
      eventsSkipped: 0,
      contentIngested: 0,
      activitiesIngested: 0,
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
      contentIngested: 0,
      activitiesIngested: 0,
      errors: [`Unknown provider: ${connector.provider}`],
      durationMs: Date.now() - start,
    };
  }

  const config = connector.config ? JSON.parse(decrypt(connector.config)) : {};
  config._operatorId = operatorId; // Available to providers that need it (e.g. Gmail entity creation)
  let syncStatus: "success" | "partial" | "failed" = "success";

  try {
    const since = connector.lastSyncAt ?? undefined;

    for await (const item of provider.sync(config, since)) {
      switch (item.kind) {
        case "event": {
          try {
            await prisma.event.create({
              data: {
                operatorId,
                connectorId,
                source: connector.provider,
                eventType: item.data.eventType,
                payload: JSON.stringify(item.data.payload),
              },
            });
            eventsCreated++;
          } catch (err) {
            // Likely a duplicate or constraint violation
            eventsSkipped++;
          }
          break;
        }

        case "content": {
          try {
            const deptIds = await resolveDepartmentsFromEmails(
              operatorId,
              item.data.participantEmails,
            );
            await ingestContent({
              operatorId,
              connectorId: connector.id,
              sourceType: item.data.sourceType,
              sourceId: item.data.sourceId,
              content: item.data.content,
              entityId: item.data.entityId,
              departmentIds: deptIds,
              metadata: item.data.metadata,
            });
            contentIngested++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`Content ingestion error: ${msg}`);
          }
          break;
        }

        case "activity": {
          try {
            const result = await ingestActivity({
              operatorId,
              connectorId,
              signalType: item.data.signalType,
              actorEmail: item.data.actorEmail,
              targetEmails: item.data.targetEmails,
              metadata: item.data.metadata,
              occurredAt: item.data.occurredAt,
            });
            if (result) activitiesIngested++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`Activity ingestion error: ${msg}`);
          }
          break;
        }
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
      config: encrypt(JSON.stringify(config)),
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

  // Identity resolution: find entities updated during this sync and check for merges
  if (eventsCreated > 0) {
    const syncCutoff = new Date(start);
    prisma.entity
      .findMany({
        where: { operatorId, updatedAt: { gte: syncCutoff } },
        select: { id: true },
      })
      .then(async (entities) => {
        if (entities.length === 0) return;
        const { runDeterministicMerges, runIdentityResolution } = await import("@/lib/identity-resolution");
        const ids = entities.map((e) => e.id);

        // Phase 1: deterministic email merges (fast, no embeddings)
        const deterministicResult = await runDeterministicMerges(operatorId, ids);
        if (deterministicResult.mergesExecuted > 0) {
          console.log(
            `[identity-resolution] operator=${operatorId}: ${deterministicResult.mergesExecuted} deterministic email merge(s)`,
          );
        }

        // Phase 2: ML fuzzy matching for remaining entities
        return runIdentityResolution(operatorId, ids);
      })
      .then((result) => {
        if (result && (result.autoMerged > 0 || result.suggested > 0)) {
          console.log(
            `[identity-resolution] operator=${operatorId}: ${result.autoMerged} auto-merged, ${result.suggested} suggestions`,
          );
        }
      })
      .catch((err) => console.error("[identity-resolution] Error:", err));
  }

  return {
    status: syncStatus,
    eventsCreated,
    eventsSkipped,
    contentIngested,
    activitiesIngested,
    errors,
    durationMs,
  };
}
