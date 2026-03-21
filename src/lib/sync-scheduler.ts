/**
 * Scheduled sync system.
 *
 * Runs on a 1-minute tick. For each active connector, checks whether its
 * sync interval has elapsed. Respects per-operator concurrency limits.
 * After 3 consecutive failures, marks connector as "error" and notifies admin.
 */

import { prisma } from "@/lib/db";
import { runConnectorSync } from "@/lib/connector-sync";

const SYNC_INTERVALS: Record<string, number> = {
  "google": 5 * 60 * 1000,       // unified Google (Gmail, Drive, Calendar, Sheets)
  "google-sheets": 30 * 60 * 1000, // standalone Sheets connectors (legacy)
  "slack": 5 * 60 * 1000,
  "microsoft": 5 * 60 * 1000,    // unified Microsoft (Outlook, OneDrive, Teams, Calendar)
  "hubspot": 15 * 60 * 1000,
  "stripe": 15 * 60 * 1000,
};

const DEFAULT_INTERVAL = 15 * 60 * 1000; // 15 min fallback
const MAX_CONCURRENT_SYNCS = 3;
const TICK_INTERVAL = 60 * 1000; // 1 minute
const MAX_CONSECUTIVE_FAILURES = 3;
const SYNC_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Track running syncs per operator
const runningSyncs = new Map<string, number>();

function getRunningCount(operatorId: string): number {
  return runningSyncs.get(operatorId) ?? 0;
}

function incrementRunning(operatorId: string): void {
  runningSyncs.set(operatorId, getRunningCount(operatorId) + 1);
}

function decrementRunning(operatorId: string): void {
  const count = getRunningCount(operatorId) - 1;
  if (count <= 0) runningSyncs.delete(operatorId);
  else runningSyncs.set(operatorId, count);
}

async function tick() {
  try {
    const connectors = await prisma.sourceConnector.findMany({
      where: { status: "active", deletedAt: null },
      select: {
        id: true,
        operatorId: true,
        provider: true,
        lastSyncAt: true,
        consecutiveFailures: true,
      },
    });

    const now = Date.now();

    for (const conn of connectors) {
      const interval = SYNC_INTERVALS[conn.provider] ?? DEFAULT_INTERVAL;
      const lastSync = conn.lastSyncAt?.getTime() ?? 0;

      if (lastSync + interval >= now) continue; // not due yet

      if (getRunningCount(conn.operatorId) >= MAX_CONCURRENT_SYNCS) continue;

      // Fire and forget — don't block the tick loop
      incrementRunning(conn.operatorId);
      syncConnector(conn.operatorId, conn.id, conn.provider).finally(() => {
        decrementRunning(conn.operatorId);
      });
    }
  } catch (err) {
    console.error("[sync-scheduler] Tick error:", err);
  }
}

async function syncConnector(
  operatorId: string,
  connectorId: string,
  provider: string,
): Promise<void> {
  const start = Date.now();
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Timeout: connector ${connectorId} exceeded 5 minutes`)),
        SYNC_TIMEOUT,
      );
    });

    const result = await Promise.race([
      runConnectorSync(operatorId, connectorId),
      timeoutPromise,
    ]);

    console.log(
      `[sync-scheduler] ${provider} (${connectorId}) for operator ${operatorId}: ` +
      `${result.eventsCreated} events, ${result.contentIngested} content, ` +
      `${result.activitiesIngested} activities in ${result.durationMs}ms`,
    );

    // Health tracking (consecutiveFailures, healthStatus) is now handled inside
    // runConnectorSync — the scheduler only handles errors that bypass the sync
    // (timeouts, uncaught exceptions). No-op here for normal sync results.
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("exceeded 5 minutes")) {
      console.warn(`[sync-scheduler] Timeout: connector ${connectorId} exceeded 5 minutes, releasing slot`);
    } else {
      console.error(`[sync-scheduler] ${provider} (${connectorId}) error:`, errMsg);
      await handleFailure(operatorId, connectorId, provider, errMsg);
    }
  }
}

async function handleFailure(
  operatorId: string,
  connectorId: string,
  provider: string,
  errorMsg: string,
): Promise<void> {
  const updated = await prisma.sourceConnector.update({
    where: { id: connectorId },
    data: { consecutiveFailures: { increment: 1 } },
    select: { consecutiveFailures: true },
  });

  if (updated.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    await prisma.sourceConnector.update({
      where: { id: connectorId },
      data: { status: "error" },
    });

    // Create admin notification
    await prisma.notification.create({
      data: {
        operatorId,
        sourceType: "system",
        title: `${provider} sync failed ${MAX_CONSECUTIVE_FAILURES} times`,
        body: `Connector has been disabled after ${MAX_CONSECUTIVE_FAILURES} consecutive sync failures. Last error: ${errorMsg.slice(0, 500)}. Reconnection may be needed.`,
      },
    });

    console.warn(
      `[sync-scheduler] ${provider} (${connectorId}) disabled after ${MAX_CONSECUTIVE_FAILURES} failures`,
    );
  }
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

const g = globalThis as typeof globalThis & {
  _syncSchedulerInterval?: ReturnType<typeof setInterval>;
};

export function startSyncScheduler(): void {
  if (g._syncSchedulerInterval) return; // already running

  g._syncSchedulerInterval = setInterval(tick, TICK_INTERVAL);
  console.log("[sync-scheduler] Started: checking every 1 minute");
}

export function stopSyncScheduler(): void {
  if (g._syncSchedulerInterval) {
    clearInterval(g._syncSchedulerInterval);
    g._syncSchedulerInterval = undefined;
  }
}
