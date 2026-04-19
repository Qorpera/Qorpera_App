import { Prisma } from "@prisma/client";
import { CronExpressionParser } from "cron-parser";
import { prisma } from "@/lib/db";

// ── Types ─────────────────────────────────────────────────────────────────

type TriggerEntry =
  | { type: "cron"; expression: string }
  | { type: "event"; eventType: string; filter?: Record<string, unknown> };

interface SystemJobProperties {
  status?: string;
  triggers?: TriggerEntry[];
  schedule?: string;         // legacy fallback
  deliverable_kind?: string;
  trust_level?: string;
  creator_user_id_snapshot?: string;
  creator_role_snapshot?: string;
  // ...other fields are read by the reasoner, not the index
}

// ── Main entry ────────────────────────────────────────────────────────────

/**
 * Rebuild the SystemJobIndex row for a given wiki page.
 * Called after save of any KnowledgePage(pageType=system_job).
 * Idempotent. Creates row if missing, updates if present.
 */
export async function rebuildSystemJobIndex(params: {
  wikiPageId: string;
  operatorId: string;
  slug: string;
  scope?: string;  // expected to be "operator"; warn if anything else
  properties: unknown;
}): Promise<void> {
  if (params.scope && params.scope !== "operator") {
    console.warn(`[system-job-index] Skipping rebuild for non-operator-scoped page: scope=${params.scope}, slug=${params.slug}. system_job pages must be operator-scoped.`);
    return;
  }
  const props = (params.properties ?? {}) as SystemJobProperties;

  const status = typeof props.status === "string" ? props.status : "draft";
  const deliverableKind = typeof props.deliverable_kind === "string" ? props.deliverable_kind : "proposals";
  const trustLevel = typeof props.trust_level === "string" ? props.trust_level : "propose";

  // Parse triggers. Supports new `triggers[]` array; falls back to legacy `schedule` (cron string).
  const triggers = parseTriggers(props);
  const triggerTypes = Array.from(new Set(triggers.map(t => t.type)));

  const cronTrigger = triggers.find(t => t.type === "cron") as (TriggerEntry & { type: "cron" }) | undefined;
  const cronExpression = cronTrigger?.expression ?? null;

  let nextRunAt: Date | null = null;
  if (cronExpression && status === "active") {
    try {
      const iter = CronExpressionParser.parse(cronExpression, { currentDate: new Date() });
      nextRunAt = iter.next().toDate();
    } catch (err) {
      console.warn(`[system-job-index] Invalid cron "${cronExpression}" for ${params.slug}:`, err);
      nextRunAt = null;
    }
  }

  const eventTriggers = triggers.filter(t => t.type === "event") as Array<Extract<TriggerEntry, { type: "event" }>>;
  const subscribedEvents = eventTriggers.map(t => t.eventType);
  const eventFilters: Record<string, unknown> = {};
  for (const t of eventTriggers) {
    // If multiple subs to same event, last one wins (document this; OR-by-two-jobs pattern)
    eventFilters[t.eventType] = t.filter ?? {};
  }

  await prisma.systemJobIndex.upsert({
    where: { wikiPageId: params.wikiPageId },
    create: {
      wikiPageId: params.wikiPageId,
      operatorId: params.operatorId,
      slug: params.slug,
      status,
      triggerTypes,
      cronExpression,
      nextRunAt,
      subscribedEvents,
      eventFilters: eventFilters as Prisma.InputJsonValue,
      creatorUserIdSnapshot: typeof props.creator_user_id_snapshot === "string" ? props.creator_user_id_snapshot : null,
      creatorRoleSnapshot: typeof props.creator_role_snapshot === "string" ? props.creator_role_snapshot : null,
      deliverableKind,
      trustLevel,
    },
    update: {
      slug: params.slug,
      status,
      triggerTypes,
      cronExpression,
      nextRunAt,
      subscribedEvents,
      eventFilters: eventFilters as Prisma.InputJsonValue,
      deliverableKind,
      trustLevel,
      // NOTE: do NOT update creatorUserIdSnapshot or creatorRoleSnapshot — those are set at creation and immutable
    },
  });
}

/**
 * Advance nextRunAt after a cron-triggered run completes.
 * Called by the scheduler after execution.
 */
export async function advanceNextRun(params: {
  indexId: string;
  cronExpression: string;
  from?: Date;
}): Promise<Date | null> {
  try {
    const iter = CronExpressionParser.parse(params.cronExpression, {
      currentDate: params.from ?? new Date(),
    });
    const next = iter.next().toDate();
    await prisma.systemJobIndex.update({
      where: { id: params.indexId },
      data: { nextRunAt: next },
    });
    return next;
  } catch (err) {
    console.warn(`[system-job-index] Failed to advance cron for index ${params.indexId}:`, err);
    await prisma.systemJobIndex.update({
      where: { id: params.indexId },
      data: { nextRunAt: null, status: "paused" },
    });
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function parseTriggers(props: SystemJobProperties): TriggerEntry[] {
  const out: TriggerEntry[] = [];

  if (Array.isArray(props.triggers)) {
    for (const t of props.triggers) {
      if (!t || typeof t !== "object") continue;
      const type = (t as { type?: unknown }).type;
      if (type === "cron") {
        const expr = (t as { expression?: unknown }).expression;
        if (typeof expr === "string" && expr.trim().split(/\s+/).length >= 5) {
          out.push({ type: "cron", expression: expr.trim() });
        }
      } else if (type === "event") {
        const et = (t as { eventType?: unknown }).eventType;
        if (typeof et === "string") {
          const filter = (t as { filter?: unknown }).filter;
          out.push({
            type: "event",
            eventType: et,
            filter: (filter && typeof filter === "object") ? filter as Record<string, unknown> : {},
          });
        }
      }
    }
  }

  // Legacy fallback: if no triggers[] but a schedule string exists, treat as single cron trigger
  if (out.length === 0 && typeof props.schedule === "string" && props.schedule.trim().split(/\s+/).length >= 5) {
    out.push({ type: "cron", expression: props.schedule.trim() });
  }

  return out;
}
