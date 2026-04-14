import { prisma } from "@/lib/db";
import { getProvider } from "@/lib/connectors/registry";
import { encryptConfig, decryptConfig } from "@/lib/config-encryption";
import { storeRawContent } from "@/lib/storage/raw-content-store";
import {
  isEligibleCommunication,
  type CommunicationItem,
} from "@/lib/content-situation-detector";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";
import { captureApiError } from "@/lib/api-error";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { runSyncDiagnostics } from "@/lib/sync-diagnostics";

// ── Activity signal constants ────────────────────────────────────────────────

// Skip derived metrics — these aren't raw content.
// The wiki activity pipeline derives analytics from real activity.
const ACTIVITY_DERIVED_METRICS = new Set(["email_response_time", "meeting_frequency"]);

// Map signalType to RawContent sourceType (unmapped types fall through as-is)
const ACTIVITY_SOURCE_TYPE_MAP: Record<string, string> = {
  meeting_held: "calendar_event",
  doc_created: "drive_doc",
  doc_edited: "drive_doc",
  doc_shared: "drive_doc",
  shipment_milestone: "logistics_event",
  shipment_tracking_update: "logistics_event",
  erp_customer_synced: "erp_event",
};

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
  const activityRawContentIds: string[] = [];

  try {
    // Document providers (Google Drive, OneDrive) should crawl full history on
    // first sync; operational providers get a 30-day initial window to avoid
    // pulling years of stale transactional data.
    const FULL_HISTORY_PROVIDERS = new Set(["google", "google-sheets", "microsoft"]);
    const since = connector.lastSyncAt
      ? new Date(connector.lastSyncAt)
      : FULL_HISTORY_PROVIDERS.has(connector.provider)
        ? undefined
        : new Date(Date.now() - 30 * 86_400_000); // 30-day window for initial sync

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
            const meta = item.data.metadata as Record<string, unknown> | undefined;
            const occurredAt = meta?.date ? new Date(meta.date as string) : new Date();

            // Email dedup: skip if same Message-ID already stored
            if (item.data.sourceType === "email" && meta?.messageId) {
              const [existing] = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
                `SELECT id FROM "RawContent"
                 WHERE "operatorId" = $1
                   AND "sourceType" = 'email'
                   AND "rawMetadata"::jsonb->>'messageId' = $2
                 LIMIT 1`,
                operatorId,
                meta.messageId as string,
              );
              if (existing) {
                continue; // Already ingested from another provider
              }
            }

            const rawContentId = await storeRawContent({
              operatorId,
              accountId: connector.id,
              userId: connector.userId ?? undefined,
              sourceType: item.data.sourceType,
              sourceId: item.data.sourceId,
              content: item.data.content,
              metadata: (meta || {}) as Record<string, unknown>,
              occurredAt,
            });
            contentIngested++;
            activityRawContentIds.push(rawContentId);

            // Document intelligence: route drive_doc content >3000 chars through the pipeline
            if (item.data.sourceType === "drive_doc" && item.data.content.length > 3000) {
              try {
                const storageKey = `connector/${connector.id}/${item.data.sourceId}`;

                // Dedup: skip if already processed for this connector document
                const existingDoc = await prisma.fileUpload.findFirst({
                  where: { operatorId, storageProvider: "connector", storageKey },
                  select: { id: true },
                });

                if (!existingDoc) {
                  const docMeta = item.data.metadata as Record<string, unknown> | undefined;
                  const docRecord = await prisma.fileUpload.create({
                    data: {
                      operatorId,
                      uploadedBy: connector.userId,
                      filename: (docMeta?.fileName as string) ?? (docMeta?.title as string) ?? "connector-document",
                      mimeType: (docMeta?.mimeType as string) ?? "text/plain",
                      sizeBytes: Buffer.byteLength(item.data.content, "utf-8"),
                      storageProvider: "connector",
                      storageKey,
                      status: "ready",
                      extractedFullText: item.data.content,
                      intelligenceStatus: "pending",
                    },
                    select: { id: true },
                  });

                  // Enqueue intelligence pipeline (async — doesn't block sync)
                  enqueueWorkerJob("process_document_intelligence", operatorId, {
                    fileUploadId: docRecord.id,
                  }).catch((err) =>
                    console.warn(`[connector-sync] Intelligence enqueue failed:`, err),
                  );
                }
              } catch (err) {
                console.warn(
                  `[connector-sync] Document intelligence setup failed for ${item.data.sourceId}:`,
                  err,
                );
              }
            }

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
            const { signalType, actorEmail, targetEmails, metadata, occurredAt } = item.data;

            if (ACTIVITY_DERIVED_METRICS.has(signalType)) {
              break;
            }

            const sourceType = ACTIVITY_SOURCE_TYPE_MAP[signalType] ?? signalType;

            // Build a readable body from the activity data
            const bodyParts: string[] = [`Activity: ${signalType}`];
            if (actorEmail) bodyParts.push(`Actor: ${actorEmail}`);
            if (targetEmails?.length) bodyParts.push(`Targets: ${targetEmails.join(", ")}`);
            if (metadata) {
              for (const [k, v] of Object.entries(metadata)) {
                if (v != null && v !== "") bodyParts.push(`${k}: ${v}`);
              }
            }
            const rawBody = bodyParts.join("\n");

            // Build sourceId for dedup (signalType + key metadata fields + timestamp)
            const occurredDate = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
            const dedupKey = metadata?.eventId ?? metadata?.threadId ?? metadata?.sourceId ?? `${signalType}-${occurredDate.getTime()}`;
            const sourceId = `${signalType}:${dedupKey}`;

            const rawContentId = await storeRawContent({
              operatorId,
              accountId: connector.id,
              userId: connector.userId ?? undefined,
              sourceType,
              sourceId,
              content: rawBody,
              metadata: {
                ...(metadata || {}),
                signalType,
                actorEmail,
                targetEmails,
              },
              occurredAt: occurredDate,
            });

            activityRawContentIds.push(rawContentId);
            activitiesIngested++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`Activity storage error: ${msg}`);
          }
          break;
        }
      }
    }

    // Fire-and-forget content situation detection
    if (communicationBatch.length > 0) {
      enqueueWorkerJob("evaluate_content", operatorId, {
        operatorId,
        items: communicationBatch,
      }).catch((err) => console.error("[content-detection] Failed to enqueue:", err));
    }

    // Dispatch wiki activity pipeline for all new content
    if (activityRawContentIds.length > 0) {
      // Batch into chunks of 50 to avoid oversized payloads
      const BATCH_SIZE = 50;
      for (let i = 0; i < activityRawContentIds.length; i += BATCH_SIZE) {
        const batch = activityRawContentIds.slice(i, i + BATCH_SIZE);
        enqueueWorkerJob("process_activity", operatorId, {
          operatorId,
          rawContentIds: batch,
        }).catch((err) => console.error("[activity-pipeline] Failed to enqueue:", err));
      }
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
  const syncLog = await prisma.syncLog.create({
    data: {
      connectorId,
      status: syncStatus,
      eventsCreated,
      eventsSkipped,
      errors: errors.length > 0 ? JSON.stringify(errors) : null,
      durationMs,
    },
    select: { id: true },
  });

  // Post-sync diagnostics (developer observability, non-blocking)
  runSyncDiagnostics(
    operatorId,
    connectorId,
    syncLog.id,
    connector.provider,
    { eventsCreated, contentIngested, activitiesIngested },
  ).catch((err) => console.error("[sync-diagnostics] Failed:", err));

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
