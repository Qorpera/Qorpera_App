import { prisma } from "@/lib/db";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";

// ── Types ─────────────────────────────────────────────────────────────────

export type SystemEventType =
  | "situation.detected"
  | "situation.resolved"
  | "situation.escalated"
  | "idea.proposed"
  | "idea.accepted"
  | "idea.rejected"
  | "system_job.completed"
  | "page.updated";

export type SystemEvent = {
  type: SystemEventType;
  operatorId: string;
  payload: Record<string, unknown>;
};

/**
 * Trigger chain for loop prevention. An entry is a job slug that already ran as
 * part of this chain. A job cannot appear twice. Max depth is MAX_CHAIN_DEPTH.
 */
export type TriggerChain = string[];

const MAX_CHAIN_DEPTH = 5;

// ── Event known types (also used for filter validation in the UI later) ──

const EVENT_TYPES: readonly SystemEventType[] = [
  "situation.detected",
  "situation.resolved",
  "situation.escalated",
  "idea.proposed",
  "idea.accepted",
  "idea.rejected",
  "system_job.completed",
  "page.updated",
];

export function isKnownEventType(t: string): t is SystemEventType {
  return (EVENT_TYPES as readonly string[]).includes(t);
}

// ── Filter evaluation ─────────────────────────────────────────────────────

/**
 * Evaluate a filter object against an event payload.
 * Empty/null filter matches anything; malformed filter matches nothing.
 *
 * Filter shape:
 *   - Keys are exact payload field names (no suffix magic).
 *   - Primitive value: equality check (field === value)
 *   - Object { op, value }: explicit operator
 *     - op "eq"  → payload[field] === value
 *     - op "gte" → typeof both number && payload[field] >= value
 *     - op "lte" → typeof both number && payload[field] <= value
 *     - op "in"  → Array.isArray(value) && value.includes(payload[field])
 *
 * All keys ANDed. Unknown operator → warn + return false (fail loud, don't fire).
 */
export function matchesFilter(
  filter: Record<string, unknown> | null | undefined,
  payload: Record<string, unknown>,
): boolean {
  if (filter === null || filter === undefined) return true;

  // Any non-plain-object is malformed → match nothing, warn loudly
  if (typeof filter !== "object" || Array.isArray(filter)) {
    console.warn(`[system-job-events] Malformed filter (not a plain object): ${JSON.stringify(filter)}`);
    return false;
  }

  const keys = Object.keys(filter);
  if (keys.length === 0) return true;

  for (const key of keys) {
    const predicate = filter[key];
    const actual = payload[key];

    // Shorthand: primitive value ⇒ equality
    if (
      predicate === null ||
      typeof predicate === "string" ||
      typeof predicate === "number" ||
      typeof predicate === "boolean"
    ) {
      if (actual !== predicate) return false;
      continue;
    }

    // Must be an object with {op, value}
    if (typeof predicate !== "object" || Array.isArray(predicate)) {
      console.warn(`[system-job-events] Malformed predicate for field "${key}": ${JSON.stringify(predicate)}`);
      return false;
    }

    const op = (predicate as { op?: unknown }).op;
    const value = (predicate as { value?: unknown }).value;

    if (op === "eq") {
      if (actual !== value) return false;
    } else if (op === "gte") {
      if (typeof actual !== "number" || typeof value !== "number") return false;
      if (actual < value) return false;
    } else if (op === "lte") {
      if (typeof actual !== "number" || typeof value !== "number") return false;
      if (actual > value) return false;
    } else if (op === "in") {
      if (!Array.isArray(value)) return false;
      if (!value.includes(actual)) return false;
    } else {
      console.warn(`[system-job-events] Unknown filter op "${String(op)}" on field "${key}"`);
      return false;
    }
  }

  return true;
}

// ── Main emit ─────────────────────────────────────────────────────────────

/**
 * Emit an event. Finds subscribing system jobs, checks filters and loop
 * guard, enqueues a worker job for each match.
 *
 * `triggerChain` carries the chain of job slugs that led here. Events
 * originating from user actions supply `[]`; events from a running system
 * job supply the current chain.
 *
 * Throws on DB errors (subscriber lookup, enqueue). Per-subscriber failures
 * within the loop are caught and logged, not rethrown. Callers in
 * user-facing paths (e.g. wiki save handler, idea accept route) MUST
 * wrap the call in try/catch — a transient DB blip in the bus must not
 * break the primary write path. See prompt 5 for the canonical wrap pattern.
 */
export async function emitEvent(
  event: SystemEvent,
  triggerChain: TriggerChain = [],
): Promise<{ enqueued: number; skipped: number }> {
  if (!isKnownEventType(event.type)) {
    console.warn(`[system-job-events] Unknown event type: ${event.type}`);
    return { enqueued: 0, skipped: 0 };
  }

  // Loop-depth guard
  if (triggerChain.length >= MAX_CHAIN_DEPTH) {
    console.warn(`[system-job-events] Chain depth limit hit (${triggerChain.length}), dropping event ${event.type}`);
    return { enqueued: 0, skipped: 0 };
  }

  // Find subscribing jobs
  const subscribers = await prisma.systemJobIndex.findMany({
    where: {
      operatorId: event.operatorId,
      status: "active",
      subscribedEvents: { has: event.type },
    },
    select: {
      id: true,
      slug: true,
      eventFilters: true,
    },
  });

  let enqueued = 0;
  let skipped = 0;

  for (const sub of subscribers) {
    // Loop membership guard
    if (triggerChain.includes(sub.slug)) {
      skipped++;
      continue;
    }

    // Filter check
    const filterMap = (sub.eventFilters ?? {}) as Record<string, unknown>;
    const filterForType = filterMap[event.type];
    const filter = (
      filterForType &&
      typeof filterForType === "object" &&
      !Array.isArray(filterForType)
    )
      ? filterForType as Record<string, unknown>
      : null;

    if (!matchesFilter(filter, event.payload)) {
      skipped++;
      continue;
    }

    // Enqueue
    try {
      await enqueueWorkerJob("run_system_job", event.operatorId, {
        systemJobIndexId: sub.id,
        jobSlug: sub.slug,
        triggerContext: {
          triggerType: "event",
          eventType: event.type,
          payload: event.payload,
        },
        triggerChain: [...triggerChain, sub.slug],
      });
      enqueued++;
    } catch (err) {
      console.error(`[system-job-events] Failed to enqueue for ${sub.slug}:`, err);
      skipped++;
    }
  }

  if (enqueued > 0) {
    console.log(`[system-job-events] ${event.type} in op ${event.operatorId}: enqueued ${enqueued}, skipped ${skipped}`);
  }

  return { enqueued, skipped };
}
