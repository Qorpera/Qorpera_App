import { prisma } from "@/lib/db";
import { getProvider } from "@/lib/connectors/registry";
import { materializeUnprocessed } from "@/lib/event-materializer";
import { encryptConfig, decryptConfig } from "@/lib/config-encryption";
import { ingestContent } from "@/lib/content-pipeline";
import { ingestActivity, resolveDepartmentsFromEmails } from "@/lib/activity-pipeline";
import {
  evaluateContentForSituations,
  isEligibleCommunication,
  type CommunicationItem,
} from "@/lib/content-situation-detector";
import { captureApiError } from "@/lib/api-error";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

// ── Retry helpers ────────────────────────────────────────────────────────────

function isTransientError(error: any): boolean {
  if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT" || error.code === "ENOTFOUND") return true;
  const status = error.status || error.statusCode || error.response?.status;
  return [429, 500, 502, 503, 504].includes(status);
}

function isAuthError(error: any): boolean {
  const status = error.status || error.statusCode || error.response?.status;
  return status === 401 || status === 403;
}

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
    where: { id: connectorId, operatorId, deletedAt: null },
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

  const config = (connector.config ? decryptConfig(connector.config) : {}) as Record<string, any>;
  config._operatorId = operatorId; // Available to providers that need it (e.g. Gmail entity creation)
  config._connectorId = connectorId; // Available for channel mapping lookups
  let syncStatus: "success" | "partial" | "failed" = "success";

  const communicationBatch: CommunicationItem[] = [];

  try {
    const since = connector.lastSyncAt ?? undefined;

    // Sync with retry for transient errors
    const p = provider; // non-null assertion for generator scope
    async function* syncWithRetry() {
      try {
        yield* p.sync(config, since);
      } catch (error) {
        if (isTransientError(error)) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          yield* p.sync(config, since);
        } else {
          throw error;
        }
      }
    }

    for await (const item of syncWithRetry()) {
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
            // Merge channel-mapped departmentId if present (Slack channel→department mapping)
            const mappedDeptId = (item.data.metadata as Record<string, unknown> | undefined)?.departmentId as string | null;
            if (mappedDeptId && !deptIds.includes(mappedDeptId)) {
              deptIds.push(mappedDeptId);
            }
            await ingestContent({
              operatorId,
              userId: connector.userId ?? null,
              connectorId: connector.id,
              sourceType: item.data.sourceType,
              sourceId: item.data.sourceId,
              content: item.data.content,
              entityId: item.data.entityId,
              departmentIds: deptIds,
              metadata: item.data.metadata,
            });
            contentIngested++;

            // Collect eligible communication items for situation detection
            if (isEligibleCommunication(item.data)) {
              communicationBatch.push({
                sourceType: item.data.sourceType,
                sourceId: item.data.sourceId,
                content: item.data.content,
                metadata: item.data.metadata,
                participantEmails: item.data.participantEmails,
              });
            }
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

    // Fire-and-forget content situation detection
    if (communicationBatch.length > 0) {
      evaluateContentForSituations(operatorId, communicationBatch)
        .catch((err) => console.error("[content-detection] Error:", err));
    }
  } catch (err) {
    captureApiError(err, { route: "connector-sync", operatorId, connectorId });
    const errMsg = err instanceof Error ? err.message : String(err);
    errors.push(errMsg);
    syncStatus = eventsCreated > 0 ? "partial" : "failed";

    // Detect auth errors → mark as disconnected and skip generic health update
    if (isAuthError(err)) {
      await prisma.sourceConnector.update({
        where: { id: connectorId },
        data: {
          config: encryptConfig(config),
          lastSyncAt: new Date(),
          healthStatus: "disconnected",
          lastHealthCheck: new Date(),
          lastError: "Authentication expired or revoked. Please reconnect this integration.",
          consecutiveFailures: { increment: 1 },
          status: "disconnected",
        },
      });

      sendNotificationToAdmins({
        operatorId,
        type: "system_alert",
        title: `Connector "${connector.name || connector.provider}" disconnected`,
        body: `Authentication has expired or been revoked. Please reconnect this integration.`,
        sourceType: "connector",
        sourceId: connectorId,
        linkUrl: "/settings?tab=connections",
        emailContext: {
          alertTitle: "Connector Disconnected",
          alertBody: `The ${connector.name || connector.provider} connector has been disconnected because authentication expired or was revoked. Please reconnect it from Settings.`,
          viewUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/settings?tab=connections`,
        },
      }).catch(console.error);

      // Log sync and return early — auth errors are fully handled above
      const durationMs = Date.now() - start;
      await prisma.syncLog.create({
        data: { connectorId, status: "failed", eventsCreated, eventsSkipped, errors: JSON.stringify(errors), durationMs },
      });
      return { status: "failed" as const, eventsCreated, eventsSkipped, contentIngested, activitiesIngested, errors, durationMs };
    }
  }

  const durationMs = Date.now() - start;

  // Persist updated tokens + health status (may have been refreshed during sync)
  const healthData = syncStatus === "failed"
    ? {
        healthStatus: (connector.consecutiveFailures + 1 >= 3) ? "error" : "degraded",
        consecutiveFailures: { increment: 1 },
        lastError: errors[0]?.substring(0, 500) ?? null,
      }
    : {
        healthStatus: "healthy",
        consecutiveFailures: 0,
        lastError: null,
      };

  const updatedConnector = await prisma.sourceConnector.update({
    where: { id: connectorId },
    data: {
      config: encryptConfig(config),
      lastSyncAt: new Date(),
      lastHealthCheck: new Date(),
      status: syncStatus === "failed" ? "error" : "active",
      ...healthData,
    },
    select: { healthStatus: true, consecutiveFailures: true },
  });

  // Notify admins when transitioning to error status
  if (updatedConnector.healthStatus === "error" && connector.healthStatus !== "error") {
    sendNotificationToAdmins({
      operatorId,
      type: "system_alert",
      title: `Connector "${connector.name || connector.provider}" needs attention`,
      body: `${connector.name || connector.provider} has failed ${updatedConnector.consecutiveFailures} consecutive syncs. Last error: ${errors[0]?.substring(0, 200) ?? "Unknown"}`,
      sourceType: "connector",
      sourceId: connectorId,
      linkUrl: "/settings?tab=connections",
      emailContext: {
        alertTitle: "Connector Sync Failures",
        alertBody: `The ${connector.name || connector.provider} connector has failed ${updatedConnector.consecutiveFailures} consecutive syncs and needs attention.`,
        viewUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/settings?tab=connections`,
      },
    }).catch(console.error);
  }

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
