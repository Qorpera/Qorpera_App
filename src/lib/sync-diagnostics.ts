import { prisma } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────────────────────

type FieldStats = {
  field: string;
  populatedCount: number;
  totalCount: number;
  rate: number;
};

type EventTypeStats = {
  eventType: string;
  count: number;
  fields: FieldStats[];
};

type Anomaly = {
  severity: "warning" | "critical";
  anomaly: string;
  detail: Record<string, unknown>;
};

// Key fields to check per event type (based on materializer usage)
const KEY_FIELDS: Record<string, string[]> = {
  "contact.synced": ["email", "phone", "firstname", "lastname"],
  "company.synced": ["name", "domain"],
  "deal.synced": ["amount", "dealstage"],
  "invoice.created": ["amount_due", "total", "due_date", "currency"],
  "sales-order.synced": ["orderNumber", "amount", "status", "customerName"],
  "purchase-order.synced": ["orderNumber", "amount", "status", "supplier"],
  "shipment.synced": ["trackingNumber", "status", "origin", "destination", "carrier", "eta"],
  "container.synced": ["number", "status", "carrier"],
  "product.synced": ["name", "sku", "price"],
};

// ── Core ─────────────────────────────────────────────────────────────────────

export async function runSyncDiagnostics(
  operatorId: string,
  connectorId: string,
  syncLogId: string,
  provider: string,
  counters: {
    eventsCreated: number;
    contentIngested: number;
    activitiesIngested: number;
  },
): Promise<void> {
  // Step 1: Compute field population rates
  const events = await prisma.event.findMany({
    where: { connectorId, operatorId },
    orderBy: { createdAt: "desc" },
    take: counters.eventsCreated || 0,
    select: { eventType: true, payload: true },
  });

  const eventTypeMap = new Map<string, { payloads: Record<string, unknown>[] }>();

  for (const event of events) {
    let payload: Record<string, unknown>;
    try {
      payload = typeof event.payload === "string" ? JSON.parse(event.payload) : (event.payload as Record<string, unknown>) || {};
    } catch {
      continue; // Malformed payload — skip
    }

    const entry = eventTypeMap.get(event.eventType) || { payloads: [] };
    entry.payloads.push(payload);
    eventTypeMap.set(event.eventType, entry);
  }

  const eventTypeStats: EventTypeStats[] = [];

  for (const [eventType, { payloads }] of eventTypeMap) {
    const fieldsToCheck = KEY_FIELDS[eventType] || Object.keys(payloads[0] || {});
    const fieldStats: FieldStats[] = fieldsToCheck.map((field) => {
      const populatedCount = payloads.filter((p) => {
        const val = p[field];
        return val !== null && val !== undefined && val !== "";
      }).length;
      return {
        field,
        populatedCount,
        totalCount: payloads.length,
        rate: payloads.length > 0 ? populatedCount / payloads.length : 0,
      };
    });

    eventTypeStats.push({ eventType, count: payloads.length, fields: fieldStats });
  }

  // Step 2: Compare against historical baselines
  const anomalies: Anomaly[] = [];

  const historicalSyncs = await prisma.syncLog.findMany({
    where: { connectorId, diagnostics: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { diagnostics: true, eventsCreated: true },
  });

  const historicalCount = historicalSyncs.length;

  if (historicalCount > 0) {
    // Event count drop
    const avgEvents = historicalSyncs.reduce((sum, s) => sum + s.eventsCreated, 0) / historicalCount;
    if (avgEvents > 0 && counters.eventsCreated < avgEvents * 0.2) {
      anomalies.push({
        severity: "warning",
        anomaly: "event_count_drop",
        detail: {
          currentCount: counters.eventsCreated,
          historicalAverage: Math.round(avgEvents),
          threshold: "20%",
        },
      });
    }

    // Yield collapse
    if (
      counters.eventsCreated === 0 &&
      counters.contentIngested === 0 &&
      counters.activitiesIngested === 0 &&
      avgEvents > 0
    ) {
      anomalies.push({
        severity: "critical",
        anomaly: "yield_collapse",
        detail: {
          historicalAverage: Math.round(avgEvents),
        },
      });
    }

    // Field population drops
    for (const currentType of eventTypeStats) {
      // Find historical rates for this event type
      const historicalRates = new Map<string, number[]>();
      for (const sync of historicalSyncs) {
        try {
          const diag = JSON.parse(sync.diagnostics!);
          const histType = diag.eventTypes?.find((t: any) => t.eventType === currentType.eventType);
          if (histType) {
            for (const f of histType.fields) {
              const arr = historicalRates.get(f.field) || [];
              arr.push(f.rate);
              historicalRates.set(f.field, arr);
            }
          }
        } catch {
          continue;
        }
      }

      for (const field of currentType.fields) {
        const histRates = historicalRates.get(field.field);
        if (!histRates || histRates.length === 0) continue;
        const avgRate = histRates.reduce((a, b) => a + b, 0) / histRates.length;

        // Field population drop: was >50%, now <10%
        if (avgRate > 0.5 && field.rate < 0.1) {
          anomalies.push({
            severity: "warning",
            anomaly: "field_population_drop",
            detail: {
              eventType: currentType.eventType,
              field: field.field,
              currentRate: field.rate,
              historicalRate: Math.round(avgRate * 100) / 100,
            },
          });
        }

        // New empty field: was >80%, now 0%
        if (avgRate > 0.8 && field.rate === 0) {
          anomalies.push({
            severity: "warning",
            anomaly: "new_empty_field",
            detail: {
              eventType: currentType.eventType,
              field: field.field,
              historicalRate: Math.round(avgRate * 100) / 100,
            },
          });
        }
      }
    }
  }

  // Step 3: Emit warnings
  for (const anomaly of anomalies) {
    console.warn("[sync-diagnostics]", JSON.stringify({
      severity: anomaly.severity,
      operatorId,
      connectorId,
      provider,
      syncLogId,
      anomaly: anomaly.anomaly,
      detail: anomaly.detail,
    }));
  }

  // Step 4: Persist diagnostics to SyncLog
  const diagnostics = {
    computedAt: new Date().toISOString(),
    eventTypes: eventTypeStats,
    anomalies,
    baselineWindow: historicalCount,
  };

  await prisma.syncLog.update({
    where: { id: syncLogId },
    data: { diagnostics: JSON.stringify(diagnostics) },
  });
}
