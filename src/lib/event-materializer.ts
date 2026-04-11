/** @deprecated v0.3.13 — entity materialization will be replaced with wiki page updates */
import { prisma } from "@/lib/db";
import { upsertEntity, resolveEntity, relateEntities } from "@/lib/entity-resolution";
import { getEntityType } from "@/lib/entity-model-store";
import { notifySituationDetectors } from "@/lib/situation-detector";
import { checkForSituationResolution } from "@/lib/situation-resolver";
import { HARDCODED_TYPE_DEFS } from "@/lib/hardcoded-type-defs";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

// ── Types ────────────────────────────────────────────────────────────────────

type MaterializeResult = {
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
  "order.synced": {
    entityTypeSlug: "order",
    extractDisplayName: (p) => p.name || `Order #${p.order_number || p.id}`,
    extractProperties: (p) => ({
      "order-number": p.order_number ? String(p.order_number) : p.name,
      total: p.total != null ? String(p.total) : undefined,
      currency: p.currency,
      status: p.status,
      "fulfillment-status": p.fulfillment_status,
      "item-count": p.item_count != null ? String(p.item_count) : undefined,
      "order-date": p.order_date,
    }),
    extractIdentity: () => ({}),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.id),
    }),
  },
  "campaign.synced": {
    entityTypeSlug: "campaign",
    extractDisplayName: (p) => p.name || `Campaign ${p.id}`,
    extractProperties: (p) => ({
      platform: p.platform,
      status: p.status,
      budget: p.budget != null ? String(p.budget) : undefined,
      spend: p.spend != null ? String(p.spend) : undefined,
      currency: p.currency,
      impressions: p.impressions != null ? String(p.impressions) : undefined,
      clicks: p.clicks != null ? String(p.clicks) : undefined,
      conversions: p.conversions != null ? String(p.conversions) : undefined,
      ctr: p.ctr != null ? String(p.ctr) : undefined,
      "start-date": p.startDate,
      "end-date": p.endDate,
    }),
    extractIdentity: () => ({}),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.id),
    }),
  },
  "product.synced": {
    entityTypeSlug: "product",
    extractDisplayName: (p) => p.name || p.sku || `Product ${p.id}`,
    extractProperties: (p) => ({
      sku: p.sku,
      price: p.price != null ? String(p.price) : undefined,
      currency: p.currency,
      status: p.status,
      category: p.category,
      "inventory-count": p.inventory_count != null ? String(p.inventory_count) : undefined,
    }),
    extractIdentity: (p) => ({}),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.id),
    }),
  },
  "ticket.synced": {
    entityTypeSlug: "ticket",
    extractDisplayName: (p) => p.subject || `Ticket #${p.number || p.id}`,
    extractProperties: (p) => ({
      number: p.number ? String(p.number) : undefined,
      subject: p.subject,
      status: p.status,
      priority: p.priority,
      channel: p.channel,
      assignee: p.assignee,
      "created-date": p.created_date || p.createdDate,
    }),
    extractIdentity: () => ({}),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.id),
    }),
  },
  "conversation.synced": {
    entityTypeSlug: "conversation",
    extractDisplayName: (p) => p.subject || `Conversation ${p.id}`,
    extractProperties: (p) => ({
      subject: p.subject,
      status: p.status,
      channel: p.channel,
      assignee: p.assignee,
      "message-count": p.message_count != null ? String(p.message_count) : undefined,
      "created-date": p.created_date || p.createdDate,
    }),
    extractIdentity: () => ({}),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.id),
    }),
  },
  "sales-order.synced": {
    entityTypeSlug: "sales-order",
    extractDisplayName: (p) => p.orderNumber ? `SO-${p.orderNumber}` : `Sales Order ${p.id || ""}`,
    extractProperties: (p) => ({
      "order-number": p.orderNumber,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      "order-date": p.orderDate,
      "delivery-date": p.deliveryDate,
      "customer-name": p.customerName,
    }),
    extractIdentity: () => ({}),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.id),
    }),
  },
  "purchase-order.synced": {
    entityTypeSlug: "purchase-order",
    extractDisplayName: (p) => p.orderNumber ? `PO-${p.orderNumber}` : `Purchase Order ${p.id || ""}`,
    extractProperties: (p) => ({
      "order-number": p.orderNumber,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      "order-date": p.orderDate,
      "expected-delivery": p.expectedDelivery,
      supplier: p.supplier,
    }),
    extractIdentity: () => ({}),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.id),
    }),
  },
  "shipment.synced": {
    entityTypeSlug: "shipment",
    extractDisplayName: (p) => p.trackingNumber || p.bookingNumber || `Shipment ${p.id || ""}`,
    extractProperties: (p) => ({
      "tracking-number": p.trackingNumber,
      status: p.status,
      origin: p.origin,
      destination: p.destination,
      carrier: p.carrier,
      mode: p.mode,
      eta: p.eta,
      "departure-date": p.departureDate,
    }),
    extractIdentity: () => ({}),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.id),
    }),
  },
  "container.synced": {
    entityTypeSlug: "container",
    extractDisplayName: (p) => p.number || `Container ${p.id || ""}`,
    extractProperties: (p) => ({
      number: p.number,
      status: p.status,
      "seal-number": p.sealNumber,
      size: p.size,
      weight: p.weight,
      carrier: p.carrier,
    }),
    extractIdentity: () => ({}),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.id),
    }),
  },
  "expense.synced": {
    entityTypeSlug: "expense",
    extractDisplayName: (p) => p.merchant ? `${p.merchant} — ${p.amount || ""}` : `Expense ${p.id || ""}`,
    extractProperties: (p) => ({
      amount: p.amount != null ? String(p.amount) : undefined,
      currency: p.currency,
      merchant: p.merchant,
      category: p.category,
      status: p.status,
      date: p.date,
      employee: p.employee,
      "receipt-url": p.receiptUrl,
    }),
    extractIdentity: () => ({}),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.id),
    }),
  },
  "task.synced": {
    entityTypeSlug: "task",
    extractDisplayName: (p) => p.name || p.title || p.subject || `Task ${p.id || ""}`,
    extractProperties: (p) => ({
      status: p.status,
      assignee: p.assignee,
      priority: p.priority,
      "due-date": p.dueDate,
      "project-name": p.projectName,
      labels: p.labels,
      "created-date": p.createdDate,
    }),
    extractIdentity: () => ({}),
    extractExternalRef: (p, source) => ({
      sourceSystem: source,
      externalId: String(p.id),
    }),
  },
  "project.synced": {
    entityTypeSlug: "project",
    extractDisplayName: (p) => p.name || `Project ${p.id || ""}`,
    extractProperties: (p) => ({
      status: p.status,
      owner: p.owner,
      "due-date": p.dueDate,
      "task-count": p.taskCount != null ? String(p.taskCount) : undefined,
      "completed-count": p.completedCount != null ? String(p.completedCount) : undefined,
      "created-date": p.createdDate,
    }),
    extractIdentity: () => ({}),
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

  const connector = await prisma.sourceConnector.findFirst({
    where: { id: connectorId, deletedAt: null },
    select: { materializerConfig: true },
  });

  const rules: MaterializerMapping[] = connector?.materializerConfig
    ? JSON.parse(connector.materializerConfig)
    : [];

  dynRuleCache.set(connectorId, { rules, expiresAt: now + DYN_CACHE_TTL });
  return rules;
}

// ── Entity Type Auto-Seeding ─────────────────────────────────────────────────

// Cache: operatorId:slug → true (already ensured)
const ensuredTypeCache = new Set<string>();

export async function ensureHardcodedEntityType(operatorId: string, slug: string): Promise<void> {
  const cacheKey = `${operatorId}:${slug}`;
  if (ensuredTypeCache.has(cacheKey)) return;

  const def = HARDCODED_TYPE_DEFS[slug];
  if (!def) return; // Not a hardcoded type, nothing to ensure

  const existing = await prisma.entityType.findFirst({
    where: { operatorId, slug },
    include: { properties: { select: { slug: true } } },
  });

  if (!existing) {
    // Create the entity type with all properties
    await prisma.entityType.create({
      data: {
        operatorId,
        slug: def.slug,
        name: def.name,
        description: def.description,
        icon: def.icon,
        color: def.color,
        defaultCategory: def.defaultCategory,
        properties: {
          create: def.properties.map((p, i) => ({
            slug: p.slug,
            name: p.name,
            dataType: p.dataType,
            identityRole: p.identityRole ?? null,
            displayOrder: i,
          })),
        },
      },
    });
  } else {
    // Entity type exists — ensure all properties exist (additive only)
    const existingSlugs = new Set(existing.properties.map((p) => p.slug));
    for (const prop of def.properties) {
      if (!existingSlugs.has(prop.slug)) {
        await prisma.entityProperty.create({
          data: {
            entityTypeId: existing.id,
            slug: prop.slug,
            name: prop.name,
            dataType: prop.dataType,
            identityRole: prop.identityRole ?? null,
          },
        });
      }
    }
    // Ensure defaultCategory is set correctly
    if ((existing as any).defaultCategory === "digital") {
      await prisma.entityType.update({
        where: { id: existing.id },
        data: { defaultCategory: def.defaultCategory },
      });
    }
  }

  ensuredTypeCache.add(cacheKey);
}

// ── Department Routing ───────────────────────────────────────────────────────

async function routeEntityToDepartments(
  _operatorId: string,
  _entityId: string,
  _entityTypeSlug: string,
  _connectorId: string | null,
): Promise<void> {
  // Department routing for company connectors flows through entity resolution.
  // Personal connectors route via the user's entity -> department membership.
  // ConnectorDepartmentBinding has been removed.
}

// ── Core Materializer ────────────────────────────────────────────────────────

export async function materializeEvent(
  operatorId: string,
  event: {
    id: string;
    connectorId?: string | null;
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

        routeEntityToDepartments(operatorId, entityId, matchingRule.entityTypeSlug, event.connectorId ?? null).catch(err =>
          console.error("[materializer] Department routing error:", err)
        );

        notifySituationDetectors(operatorId, [entityId], event.id).catch((err) =>
          console.error("[materializer] Background detection error:", err)
        );

        return { status: "materialized", entityIds: [entityId], eventType };
      }
    }

    if (!rule) {
      // Unrecognized event type — mark processed and log (no user notification)
      await prisma.event.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });

      console.warn(`[materializer] Unrecognized event type "${eventType}" from source "${event.source}" — no rule exists, skipping`);

      return { status: "unrecognized", eventType };
    }

    // ── Auto-seed entity type + properties if a hardcoded def exists ───
    await ensureHardcodedEntityType(operatorId, rule.entityTypeSlug);

    // ── Check if target entity type exists ────────────────────────────────
    const entityType = await getEntityType(operatorId, rule.entityTypeSlug);

    if (!entityType) {
      // Mode 2: Awaiting entity type creation
      // Do NOT set processedAt -- event will be retried

      // Only notify if the operator already has entity types defined.
      // During initial onboarding, entity types haven't been set up yet —
      // the system will create them automatically. Notifying the user
      // to "create entity types" at this stage is misleading.
      const operatorHasAnyTypes = await prisma.entityType.count({ where: { operatorId } });

      if (operatorHasAnyTypes > 0) {
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

          await sendNotificationToAdmins({
            operatorId,
            type: "system_alert",
            title: notificationTitle,
            body: `There are ${pendingCount} event(s) of type "${eventType}" waiting to be processed, but the entity type "${rule.entityTypeSlug}" does not exist yet. Create it in entity type settings or re-sync the connector.`,
            sourceType: "system",
            sourceId: event.id,
          });
        }
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

    routeEntityToDepartments(operatorId, entityId, rule.entityTypeSlug, event.connectorId ?? null).catch(err =>
      console.error("[materializer] Department routing error:", err)
    );

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

