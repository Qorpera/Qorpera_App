import { prisma } from "@/lib/db";
import { upsertEntity, resolveEntity, relateEntities } from "@/lib/entity-resolution";
import { getEntityType } from "@/lib/entity-model-store";
import { notifySituationDetectors } from "@/lib/situation-detector";
import { checkForSituationResolution } from "@/lib/situation-resolver";

// ── Types ────────────────────────────────────────────────────────────────────

export type MaterializeResult = {
  status: "materialized" | "unrecognized" | "awaiting_type" | "skipped" | "error";
  entityIds?: string[];
  eventType: string;
  entityTypeSlug?: string;
  error?: string;
};

type EventMaterializerRule = {
  entityTypeSlug: string;
  extractDisplayName: (payload: any) => string;
  extractProperties: (payload: any) => Record<string, string | undefined>;
  extractIdentity: (payload: any) => Record<string, string | undefined>;
  extractExternalRef: (payload: any, source: string) => {
    sourceSystem: string;
    externalId: string;
  };
};

// ── Rule Registry ────────────────────────────────────────────────────────────

const EVENT_MATERIALIZERS: Record<string, EventMaterializerRule> = {
  "contact.synced": {
    entityTypeSlug: "contact",
    extractDisplayName: (p) =>
      `${p.firstname || ""} ${p.lastname || ""}`.trim() || p.email || "Unknown Contact",
    extractProperties: (p) => ({
      email: p.email,
      phone: p.phone,
      "job-title": p.jobtitle,
    }),
    extractIdentity: (p) => ({ email: p.email, phone: p.phone }),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.id || p.vid),
    }),
  },
  "company.synced": {
    entityTypeSlug: "company",
    extractDisplayName: (p) => p.name || p.domain || "Unknown Company",
    extractProperties: (p) => ({
      domain: p.domain,
      industry: p.industry,
      revenue: p.revenue ? String(p.revenue) : undefined,
      "employee-count": p.employees ? String(p.employees) : undefined,
    }),
    extractIdentity: (p) => ({ domain: p.domain }),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.id || p.companyId),
    }),
  },
  "deal.synced": {
    entityTypeSlug: "deal",
    extractDisplayName: (p) => p.dealname || p.name || "Unnamed Deal",
    extractProperties: (p) => ({
      amount: p.amount ? String(p.amount) : undefined,
      stage: p.dealstage || p.stage,
      "close-date": p.closedate,
      pipeline: p.pipeline,
    }),
    extractIdentity: (p) => ({}),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.id || p.dealId),
    }),
  },
  "invoice.created": {
    entityTypeSlug: "invoice",
    extractDisplayName: (p) => p.number || p.invoice_number || `INV-${p.id}`,
    extractProperties: (p) => ({
      amount:
        p.amount_due != null
          ? String(p.amount_due)
          : p.total
            ? String(p.total)
            : undefined,
      status: p.status || "created",
      "due-date": p.due_date,
      currency: p.currency,
    }),
    extractIdentity: (p) => ({}),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.id),
    }),
  },
  "invoice.paid": {
    entityTypeSlug: "invoice",
    extractDisplayName: (p) => p.number || p.invoice_number || `INV-${p.id}`,
    extractProperties: (p) => ({
      status: "paid",
      "paid-date": p.paid_at || p.status_transitions?.paid_at,
      "amount-paid": p.amount_paid ? String(p.amount_paid) : undefined,
    }),
    extractIdentity: (p) => ({}),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.id),
    }),
  },
  "customer.synced": {
    entityTypeSlug: "contact",
    extractDisplayName: (p) => p.name || p.email || "Unknown Customer",
    extractProperties: (p) => ({
      email: p.email,
      phone: p.phone,
      currency: p.currency,
      "stripe-customer-id": p.id ? String(p.id) : undefined,
      balance: p.balance != null ? String(p.balance) : undefined,
      delinquent: p.delinquent != null ? String(p.delinquent) : undefined,
    }),
    extractIdentity: (p) => ({ email: p.email }),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.id),
    }),
  },
  "invoice.overdue": {
    entityTypeSlug: "invoice",
    extractDisplayName: (p) => p.number || `INV-${p.id}`,
    extractProperties: (p) => ({
      status: "overdue",
      amount: p.amount_due != null ? String(p.amount_due) : undefined,
      "due-date": p.due_date ? String(p.due_date) : undefined,
      currency: p.currency,
    }),
    extractIdentity: (p) => ({}),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.id),
    }),
  },
  "payment.received": {
    entityTypeSlug: "payment",
    extractDisplayName: (p) => `Payment ${p.id ? String(p.id).slice(-8) : ""}` + (p.amount ? ` ($${(Number(p.amount) / 100).toFixed(2)})` : ""),
    extractProperties: (p) => ({
      amount: p.amount != null ? String(p.amount) : undefined,
      currency: p.currency,
      status: p.status,
      "payment-date": p.created ? new Date(Number(p.created) * 1000).toISOString() : undefined,
    }),
    extractIdentity: (p) => ({}),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.id),
    }),
  },
  "row.synced": {
    entityTypeSlug: "record",
    extractDisplayName: (p) =>
      p.name || p.title || p.label || (Object.values(p)[0] as string) || "Untitled Row",
    extractProperties: (p) => {
      const props: Record<string, string | undefined> = {};
      for (const [key, value] of Object.entries(p)) {
        if (key !== "__rowIndex" && key !== "__sheetId" && value != null) {
          props[key.toLowerCase().replace(/\s+/g, "-")] = String(value);
        }
      }
      return props;
    },
    extractIdentity: (p) => ({ email: p.email }),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.__rowIndex ?? p.id ?? ""),
    }),
  },
};

// ── Dynamic Materializer Cache ───────────────────────────────────────────────

type MaterializerMapping = {
  sourceFilter: { sheet?: string; eventType?: string };
  entityTypeSlug: string;
  propertyMap: Record<string, string>;
  displayNameTemplate: string;
  identityFields: string[];
};

type DynCacheEntry = { rules: MaterializerMapping[]; expiresAt: number };
const dynRuleCache = new Map<string, DynCacheEntry>();
const DYN_CACHE_TTL = 5 * 60 * 1000;

async function getDynamicRules(connectorId: string): Promise<MaterializerMapping[]> {
  const now = Date.now();
  const cached = dynRuleCache.get(connectorId);
  if (cached && cached.expiresAt > now) return cached.rules;

  const connector = await prisma.sourceConnector.findUnique({
    where: { id: connectorId },
    select: { materializerConfig: true },
  });

  const rules: MaterializerMapping[] = connector?.materializerConfig
    ? JSON.parse(connector.materializerConfig)
    : [];

  dynRuleCache.set(connectorId, { rules, expiresAt: now + DYN_CACHE_TTL });
  return rules;
}

export function invalidateMaterializerCache(connectorId: string): void {
  dynRuleCache.delete(connectorId);
}

// ── Stripe Property Bootstrapping ────────────────────────────────────────────

const stripePropertyCache = new Set<string>();

async function ensureStripePropertiesOnContactType(operatorId: string): Promise<void> {
  if (stripePropertyCache.has(operatorId)) return;

  const contactType = await prisma.entityType.findFirst({
    where: { operatorId, slug: "contact" },
    include: { properties: { select: { slug: true } } },
  });
  if (!contactType) return;

  const existing = new Set(contactType.properties.map((p) => p.slug));
  const needed: Array<{ slug: string; name: string; dataType: string }> = [
    { slug: "currency", name: "Currency", dataType: "STRING" },
    { slug: "stripe-customer-id", name: "Stripe Customer ID", dataType: "STRING" },
    { slug: "balance", name: "Balance", dataType: "CURRENCY" },
    { slug: "delinquent", name: "Delinquent", dataType: "BOOLEAN" },
  ];

  for (const prop of needed) {
    if (!existing.has(prop.slug)) {
      await prisma.entityProperty.create({
        data: {
          entityTypeId: contactType.id,
          slug: prop.slug,
          name: prop.name,
          dataType: prop.dataType,
        },
      });
    }
  }

  stripePropertyCache.add(operatorId);
}

async function ensurePaymentEntityType(operatorId: string): Promise<void> {
  const cacheKey = `${operatorId}:payment`;
  if (stripePropertyCache.has(cacheKey)) return;

  const paymentType = await prisma.entityType.findFirst({
    where: { operatorId, slug: "payment" },
  });

  if (!paymentType) {
    await prisma.entityType.create({
      data: {
        operatorId,
        slug: "payment",
        name: "Payment",
        properties: {
          create: [
            { slug: "amount", name: "Amount", dataType: "CURRENCY" },
            { slug: "currency", name: "Currency", dataType: "STRING" },
            { slug: "status", name: "Status", dataType: "STRING" },
            { slug: "payment-date", name: "Payment Date", dataType: "DATE" },
          ],
        },
      },
    });
  }

  stripePropertyCache.add(cacheKey);
}

// ── Core Materializer ────────────────────────────────────────────────────────

export async function materializeEvent(
  operatorId: string,
  event: {
    id: string;
    connectorId?: string;
    source: string;
    eventType: string;
    payload: string;
    processedAt: Date | null;
    materializationError: string | null;
  },
  options?: { force?: boolean }
): Promise<MaterializeResult> {
  const { eventType } = event;

  // Already processed and not forced
  if (event.processedAt && !options?.force) {
    return { status: "skipped", eventType };
  }

  try {
    const payload = JSON.parse(event.payload);

    // ── Association / Relationship events ──────────────────────────────────
    if (eventType.startsWith("association.") || eventType.startsWith("relationship.")) {
      const {
        fromSourceSystem,
        fromExternalId,
        toSourceSystem,
        toExternalId,
        relationshipType,
      } = payload;

      const fromId = await resolveEntity(operatorId, {
        sourceSystem: fromSourceSystem,
        externalId: fromExternalId,
      });
      const toId = await resolveEntity(operatorId, {
        sourceSystem: toSourceSystem,
        externalId: toExternalId,
      });

      if (!fromId || !toId) {
        // One or both entities not yet materialized -- will be retried
        return { status: "skipped", eventType };
      }

      await relateEntities(
        operatorId,
        fromId,
        toId,
        relationshipType || eventType.replace(/^(association|relationship)\./, ""),
      );

      await prisma.event.update({
        where: { id: event.id },
        data: {
          processedAt: new Date(),
          entityRefs: JSON.stringify([fromId, toId]),
        },
      });

      return { status: "materialized", entityIds: [fromId, toId], eventType };
    }

    // ── Email events — process as signals only, no entity ─────────────
    if (eventType === "email.synced") {
      // Emails are activity signals, not business objects.
      // They feed situation detection via the event stream, but don't create entities.
      // Resolve entity references so context assembly can find them.
      const entityRefs: string[] = [];
      if (payload.contactId) {
        const contactEntityId = await resolveEntity(operatorId, {
          sourceSystem: event.source || "hubspot",
          externalId: String(payload.contactId),
        });
        if (contactEntityId) entityRefs.push(contactEntityId);
      }
      // Also try resolving by sender/recipient email
      if (!entityRefs.length && payload.senderEmail) {
        const senderId = await resolveEntity(operatorId, {
          identityValues: { email: String(payload.senderEmail) },
        });
        if (senderId) entityRefs.push(senderId);
      }
      if (payload.recipientEmail) {
        const recipientId = await resolveEntity(operatorId, {
          identityValues: { email: String(payload.recipientEmail) },
        });
        if (recipientId && !entityRefs.includes(recipientId)) entityRefs.push(recipientId);
      }

      await prisma.event.update({
        where: { id: event.id },
        data: {
          processedAt: new Date(),
          entityRefs: entityRefs.length > 0 ? JSON.stringify(entityRefs) : null,
        },
      });

      // Still notify detectors — email activity is a detection signal
      if (entityRefs.length > 0) {
        notifySituationDetectors(operatorId, entityRefs, event.id).catch((err) =>
          console.error("[materializer] Background detection error:", err)
        );
      }

      return { status: "materialized", entityIds: entityRefs, eventType };
    }

    // ── Look up materializer rule ─────────────────────────────────────────
    const rule = EVENT_MATERIALIZERS[eventType];

    // ── Dynamic rule fallback (for user-connected sources) ────────────────
    if (!rule && event.connectorId) {
      const dynRules = await getDynamicRules(event.connectorId);
      const matchingRule = dynRules.find((r) => {
        if (r.sourceFilter.sheet && payload._sheet !== r.sourceFilter.sheet) return false;
        if (r.sourceFilter.eventType && eventType !== r.sourceFilter.eventType) return false;
        return true;
      });

      if (matchingRule) {
        const entityType = await getEntityType(operatorId, matchingRule.entityTypeSlug);
        if (!entityType) {
          return { status: "awaiting_type", entityTypeSlug: matchingRule.entityTypeSlug, eventType };
        }

        // Build display name from template
        const displayName = matchingRule.displayNameTemplate.replace(
          /\{([^}]+)\}/g,
          (_, col) => String(payload[col] ?? "")
        ).trim() || "Untitled";

        // Build properties from propertyMap
        const properties: Record<string, string> = {};
        for (const [sourceCol, propSlug] of Object.entries(matchingRule.propertyMap)) {
          const val = payload[sourceCol];
          if (val !== undefined && val !== null && val !== "") {
            properties[propSlug] = String(val);
          }
        }

        // Build external ref
        const compositeKey = [
          payload._spreadsheetId || "",
          payload._sheet || "",
          payload._row || "",
        ].join(":");
        const externalRef = {
          sourceSystem: event.source,
          externalId: compositeKey || String(event.id),
        };

        const entityId = await upsertEntity(
          operatorId,
          matchingRule.entityTypeSlug,
          { displayName, properties },
          externalRef
        );

        await prisma.event.update({
          where: { id: event.id },
          data: {
            processedAt: new Date(),
            entityRefs: JSON.stringify([entityId]),
          },
        });

        notifySituationDetectors(operatorId, [entityId], event.id).catch((err) =>
          console.error("[materializer] Background detection error:", err)
        );

        return { status: "materialized", entityIds: [entityId], eventType };
      }
    }

    if (!rule) {
      // Mode 3: Unrecognized event type
      await prisma.event.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });

      const notificationTitle = `Unrecognized event type: ${eventType}`;
      const existing = await prisma.notification.findFirst({
        where: { operatorId, title: notificationTitle, read: false },
      });

      if (!existing) {
        await prisma.notification.create({
          data: {
            operatorId,
            title: notificationTitle,
            body: `Received an event of type "${eventType}" from source "${event.source}" but no materializer rule exists for it. You may need to configure a mapping or this event type is not yet supported.`,
            sourceType: "system",
            sourceId: event.id,
          },
        });
      }

      return { status: "unrecognized", eventType };
    }

    // ── Stripe property bootstrapping ──────────────────────────────────
    if (eventType === "customer.synced") {
      await ensureStripePropertiesOnContactType(operatorId);
    }
    if (eventType === "payment.received") {
      await ensurePaymentEntityType(operatorId);
    }

    // ── Check if target entity type exists ────────────────────────────────
    const entityType = await getEntityType(operatorId, rule.entityTypeSlug);

    if (!entityType) {
      // Mode 2: Awaiting entity type creation
      // Do NOT set processedAt -- event will be retried
      const notificationTitle = `Entity type needed: ${rule.entityTypeSlug}`;
      const existing = await prisma.notification.findFirst({
        where: { operatorId, title: notificationTitle, read: false },
      });

      if (!existing) {
        const pendingCount = await prisma.event.count({
          where: {
            operatorId,
            processedAt: null,
            materializationError: null,
            eventType,
          },
        });

        await prisma.notification.create({
          data: {
            operatorId,
            title: notificationTitle,
            body: `There are ${pendingCount} event(s) of type "${eventType}" waiting to be materialized, but the entity type "${rule.entityTypeSlug}" does not exist yet. Create the entity type to allow these events to be processed.`,
            sourceType: "system",
            sourceId: event.id,
          },
        });
      }

      return { status: "awaiting_type", entityTypeSlug: rule.entityTypeSlug, eventType };
    }

    // ── Mode 1: Materialize ───────────────────────────────────────────────
    const displayName = rule.extractDisplayName(payload);
    const rawProperties = rule.extractProperties(payload);
    const externalRef = rule.extractExternalRef(payload, event.source);

    // Filter out undefined values
    const properties: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawProperties)) {
      if (value !== undefined) {
        properties[key] = value;
      }
    }

    const entityId = await upsertEntity(
      operatorId,
      rule.entityTypeSlug,
      {
        displayName,
        properties,
      },
      externalRef,
    );

    await prisma.event.update({
      where: { id: event.id },
      data: {
        processedAt: new Date(),
        entityRefs: JSON.stringify([entityId]),
      },
    });

    notifySituationDetectors(operatorId, [entityId], event.id).catch((err) =>
      console.error("[materializer] Background detection error:", err)
    );

    // Check for automatic situation resolution
    if (eventType === "invoice.paid" || eventType === "payment.received") {
      checkForSituationResolution(operatorId, eventType, [entityId], event.id).catch((err) =>
        console.error("[materializer] Background resolution error:", err)
      );
    }

    return { status: "materialized", entityIds: [entityId], eventType };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await prisma.event.update({
      where: { id: event.id },
      data: { materializationError: errorMessage },
    });

    return { status: "error", eventType, error: errorMessage };
  }
}

// ── Batch Processing ─────────────────────────────────────────────────────────

export async function materializeUnprocessed(
  operatorId: string,
  limit: number = 50
): Promise<MaterializeResult[]> {
  const events = await prisma.event.findMany({
    where: {
      operatorId,
      processedAt: null,
      materializationError: null,
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const results: MaterializeResult[] = [];
  // Process sequentially -- SQLite does not handle concurrent writes well
  for (const event of events) {
    const result = await materializeEvent(operatorId, event);
    results.push(result);
  }

  return results;
}

export async function retryFailedEvents(
  operatorId: string,
  limit: number = 50
): Promise<MaterializeResult[]> {
  const events = await prisma.event.findMany({
    where: {
      operatorId,
      materializationError: { not: null },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const results: MaterializeResult[] = [];
  for (const event of events) {
    // Clear the error before retrying
    await prisma.event.update({
      where: { id: event.id },
      data: { materializationError: null },
    });

    const result = await materializeEvent(operatorId, event, { force: true });
    results.push(result);
  }

  return results;
}
