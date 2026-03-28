import { describe, test, expect, vi, beforeEach } from "vitest";

const { mockEventFindMany, mockSyncLogUpdate, mockSyncLogFindMany } = vi.hoisted(() => ({
  mockEventFindMany: vi.fn(),
  mockSyncLogUpdate: vi.fn(),
  mockSyncLogFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    event: { findMany: mockEventFindMany },
    syncLog: { update: mockSyncLogUpdate, findMany: mockSyncLogFindMany },
  },
}));

import { runSyncDiagnostics } from "@/lib/sync-diagnostics";

beforeEach(() => {
  mockEventFindMany.mockReset();
  mockSyncLogUpdate.mockReset();
  mockSyncLogFindMany.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function makeEvents(eventType: string, payloads: Record<string, unknown>[]) {
  return payloads.map((p) => ({
    eventType,
    payload: JSON.stringify(p),
  }));
}

function makeHistoricalSync(diagnosticsJson: object, eventsCreated = 500) {
  return {
    diagnostics: JSON.stringify(diagnosticsJson),
    eventsCreated,
  };
}

// ── 1. Field population rates computed correctly ───────────────────────────

describe("sync-diagnostics: field population", () => {
  test("computes correct population rates", async () => {
    const events = makeEvents("contact.synced", [
      { email: "a@b.com", phone: "+1", firstname: "A", lastname: "B" },
      { email: "c@d.com", phone: "", firstname: "C", lastname: "D" },
      { email: null, phone: null, firstname: "E", lastname: "F" },
      { email: "g@h.com", phone: "+2", firstname: "G", lastname: "H" },
      { email: "i@j.com", phone: "+3", firstname: "I", lastname: "J" },
      { email: "k@l.com", phone: null, firstname: "K", lastname: "L" },
      { email: "m@n.com", phone: "+4", firstname: "M", lastname: "N" },
      { email: "o@p.com", phone: "+5", firstname: "O", lastname: "P" },
      { email: null, phone: null, firstname: "Q", lastname: "R" },
      { email: "s@t.com", phone: "+6", firstname: "S", lastname: "T" },
    ]);

    mockEventFindMany.mockResolvedValueOnce(events);
    mockSyncLogFindMany.mockResolvedValueOnce([]); // No history
    mockSyncLogUpdate.mockResolvedValueOnce({});

    await runSyncDiagnostics("op1", "conn1", "sl1", "test", {
      eventsCreated: 10, contentIngested: 0, activitiesIngested: 0,
    });

    const updateCall = mockSyncLogUpdate.mock.calls[0][0];
    const diagnostics = JSON.parse(updateCall.data.diagnostics);
    const contactStats = diagnostics.eventTypes.find((t: any) => t.eventType === "contact.synced");

    expect(contactStats.count).toBe(10);
    const emailField = contactStats.fields.find((f: any) => f.field === "email");
    expect(emailField.populatedCount).toBe(8);
    expect(emailField.rate).toBe(0.8);
  });
});

// ── 2. Zero-population field detected ──────────────────────────────────────

describe("sync-diagnostics: zero population", () => {
  test("detects fields that are always null", async () => {
    const events = makeEvents("shipment.synced", [
      { trackingNumber: "T1", status: "OK", origin: null, destination: null, carrier: "M", eta: null },
      { trackingNumber: "T2", status: "OK", origin: null, destination: null, carrier: "M", eta: null },
    ]);

    mockEventFindMany.mockResolvedValueOnce(events);
    mockSyncLogFindMany.mockResolvedValueOnce([]);
    mockSyncLogUpdate.mockResolvedValueOnce({});

    await runSyncDiagnostics("op1", "conn1", "sl1", "test", {
      eventsCreated: 2, contentIngested: 0, activitiesIngested: 0,
    });

    const diagnostics = JSON.parse(mockSyncLogUpdate.mock.calls[0][0].data.diagnostics);
    const shipmentStats = diagnostics.eventTypes[0];
    const originField = shipmentStats.fields.find((f: any) => f.field === "origin");
    expect(originField.rate).toBe(0);
  });
});

// ── 3. Event count drop detected ───────────────────────────────────────────

describe("sync-diagnostics: event count drop", () => {
  test("flags when current count is <20% of average", async () => {
    mockEventFindMany.mockResolvedValueOnce([]);
    mockSyncLogFindMany.mockResolvedValueOnce([
      makeHistoricalSync({ eventTypes: [], anomalies: [] }, 500),
      makeHistoricalSync({ eventTypes: [], anomalies: [] }, 480),
      makeHistoricalSync({ eventTypes: [], anomalies: [] }, 520),
    ]);
    mockSyncLogUpdate.mockResolvedValueOnce({});

    await runSyncDiagnostics("op1", "conn1", "sl1", "test", {
      eventsCreated: 50, contentIngested: 0, activitiesIngested: 0,
    });

    const diagnostics = JSON.parse(mockSyncLogUpdate.mock.calls[0][0].data.diagnostics);
    const countDrop = diagnostics.anomalies.find((a: any) => a.anomaly === "event_count_drop");
    expect(countDrop).toBeDefined();
    expect(countDrop.detail.currentCount).toBe(50);
  });
});

// ── 4. Yield collapse detected ─────────────────────────────────────────────

describe("sync-diagnostics: yield collapse", () => {
  test("flags critical when all counters are zero", async () => {
    mockEventFindMany.mockResolvedValueOnce([]);
    mockSyncLogFindMany.mockResolvedValueOnce([
      makeHistoricalSync({ eventTypes: [], anomalies: [] }, 300),
      makeHistoricalSync({ eventTypes: [], anomalies: [] }, 280),
    ]);
    mockSyncLogUpdate.mockResolvedValueOnce({});

    await runSyncDiagnostics("op1", "conn1", "sl1", "test", {
      eventsCreated: 0, contentIngested: 0, activitiesIngested: 0,
    });

    const diagnostics = JSON.parse(mockSyncLogUpdate.mock.calls[0][0].data.diagnostics);
    const collapse = diagnostics.anomalies.find((a: any) => a.anomaly === "yield_collapse");
    expect(collapse).toBeDefined();
    expect(collapse.severity).toBe("critical");
  });
});

// ── 5. Field population drop detected ──────────────────────────────────────

describe("sync-diagnostics: field population drop", () => {
  test("flags when field drops from >50% to <10%", async () => {
    const events = makeEvents("contact.synced", [
      { email: null, phone: null, firstname: "A", lastname: "B" },
      { email: null, phone: null, firstname: "C", lastname: "D" },
    ]);

    mockEventFindMany.mockResolvedValueOnce(events);
    mockSyncLogFindMany.mockResolvedValueOnce([
      makeHistoricalSync({
        eventTypes: [{
          eventType: "contact.synced",
          count: 100,
          fields: [
            { field: "email", populatedCount: 90, totalCount: 100, rate: 0.9 },
            { field: "phone", populatedCount: 85, totalCount: 100, rate: 0.85 },
            { field: "firstname", populatedCount: 100, totalCount: 100, rate: 1.0 },
            { field: "lastname", populatedCount: 100, totalCount: 100, rate: 1.0 },
          ],
        }],
        anomalies: [],
      }, 100),
    ]);
    mockSyncLogUpdate.mockResolvedValueOnce({});

    await runSyncDiagnostics("op1", "conn1", "sl1", "test", {
      eventsCreated: 2, contentIngested: 0, activitiesIngested: 0,
    });

    const diagnostics = JSON.parse(mockSyncLogUpdate.mock.calls[0][0].data.diagnostics);
    const fieldDrop = diagnostics.anomalies.find((a: any) => a.anomaly === "field_population_drop" && a.detail.field === "email");
    expect(fieldDrop).toBeDefined();
    expect(fieldDrop.detail.currentRate).toBe(0);
    expect(fieldDrop.detail.historicalRate).toBe(0.9);
  });
});

// ── 6. First sync — no anomalies ───────────────────────────────────────────

describe("sync-diagnostics: first sync", () => {
  test("no anomalies flagged when no history exists", async () => {
    const events = makeEvents("contact.synced", [
      { email: "a@b.com", firstname: "A", lastname: "B" },
    ]);

    mockEventFindMany.mockResolvedValueOnce(events);
    mockSyncLogFindMany.mockResolvedValueOnce([]); // No history
    mockSyncLogUpdate.mockResolvedValueOnce({});

    await runSyncDiagnostics("op1", "conn1", "sl1", "test", {
      eventsCreated: 1, contentIngested: 0, activitiesIngested: 0,
    });

    const diagnostics = JSON.parse(mockSyncLogUpdate.mock.calls[0][0].data.diagnostics);
    expect(diagnostics.anomalies).toEqual([]);
    expect(diagnostics.eventTypes.length).toBe(1);
  });
});

// ── 7. Diagnostics persisted to SyncLog ────────────────────────────────────

describe("sync-diagnostics: persistence", () => {
  test("calls syncLog.update with JSON diagnostics", async () => {
    mockEventFindMany.mockResolvedValueOnce([]);
    mockSyncLogFindMany.mockResolvedValueOnce([]);
    mockSyncLogUpdate.mockResolvedValueOnce({});

    await runSyncDiagnostics("op1", "conn1", "sl1", "test", {
      eventsCreated: 0, contentIngested: 0, activitiesIngested: 0,
    });

    expect(mockSyncLogUpdate).toHaveBeenCalledWith({
      where: { id: "sl1" },
      data: { diagnostics: expect.any(String) },
    });

    const diagnostics = JSON.parse(mockSyncLogUpdate.mock.calls[0][0].data.diagnostics);
    expect(diagnostics.computedAt).toBeDefined();
    expect(diagnostics.eventTypes).toEqual([]);
    expect(diagnostics.anomalies).toEqual([]);
    expect(diagnostics.baselineWindow).toBe(0);
  });
});

// ── 8. Handles empty event list ────────────────────────────────────────────

describe("sync-diagnostics: empty events", () => {
  test("handles 0 events gracefully", async () => {
    mockEventFindMany.mockResolvedValueOnce([]);
    mockSyncLogFindMany.mockResolvedValueOnce([]);
    mockSyncLogUpdate.mockResolvedValueOnce({});

    await runSyncDiagnostics("op1", "conn1", "sl1", "test", {
      eventsCreated: 0, contentIngested: 0, activitiesIngested: 0,
    });

    const diagnostics = JSON.parse(mockSyncLogUpdate.mock.calls[0][0].data.diagnostics);
    expect(diagnostics.eventTypes).toEqual([]);
  });
});

// ── 9. Handles malformed event payloads ────────────────────────────────────

describe("sync-diagnostics: malformed payloads", () => {
  test("skips events with non-JSON payload", async () => {
    mockEventFindMany.mockResolvedValueOnce([
      { eventType: "contact.synced", payload: "not valid json {{{" },
      { eventType: "contact.synced", payload: JSON.stringify({ email: "a@b.com", firstname: "A", lastname: "B" }) },
    ]);
    mockSyncLogFindMany.mockResolvedValueOnce([]);
    mockSyncLogUpdate.mockResolvedValueOnce({});

    await runSyncDiagnostics("op1", "conn1", "sl1", "test", {
      eventsCreated: 2, contentIngested: 0, activitiesIngested: 0,
    });

    const diagnostics = JSON.parse(mockSyncLogUpdate.mock.calls[0][0].data.diagnostics);
    const contactStats = diagnostics.eventTypes[0];
    expect(contactStats.count).toBe(1); // Only the valid one
  });
});

// ── 10. Console.warn emitted for anomalies ─────────────────────────────────

describe("sync-diagnostics: console warnings", () => {
  test("emits structured console.warn for detected anomalies", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnSpy.mockClear();

    mockEventFindMany.mockResolvedValueOnce([]);
    mockSyncLogFindMany.mockResolvedValueOnce([
      makeHistoricalSync({ eventTypes: [], anomalies: [] }, 500),
    ]);
    mockSyncLogUpdate.mockResolvedValueOnce({});

    await runSyncDiagnostics("op1", "conn1", "sl1", "hubspot", {
      eventsCreated: 0, contentIngested: 0, activitiesIngested: 0,
    });

    const warnCalls = warnSpy.mock.calls.filter(
      (c) => c[0] === "[sync-diagnostics]",
    );
    expect(warnCalls.length).toBeGreaterThan(0);

    const firstWarning = JSON.parse(warnCalls[0][1] as string);
    expect(firstWarning.operatorId).toBe("op1");
    expect(firstWarning.connectorId).toBe("conn1");
    expect(firstWarning.provider).toBe("hubspot");
    expect(firstWarning.anomaly).toBeDefined();
  });
});
