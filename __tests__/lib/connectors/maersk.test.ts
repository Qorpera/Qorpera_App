import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { maerskProvider } from "@/lib/connectors/maersk-provider";

beforeEach(() => {
  mockFetch.mockReset();
});

const validConfig = {
  consumer_key: "maersk-key",
  consumer_secret: "maersk-secret",
  access_token: "maersk-token",
  token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
  tracking_references: "MSKU1234567, 123456789",
};

function tokenResponse() {
  return {
    ok: true,
    json: async () => ({ access_token: "new-maersk-token", expires_in: 3600 }),
  };
}

function trackingResponse(events: any[], containerNum?: string) {
  return {
    ok: true,
    json: async () => ({
      containers: [{
        container_num: containerNum || "MSKU1234567",
        container_size: "40HC",
        events,
      }],
      origin: { city: "Shanghai", country: "CN" },
      destination: { city: "Rotterdam", country: "NL" },
      estimatedArrival: "2026-04-15T10:00:00Z",
      departureDate: "2026-03-20T08:00:00Z",
    }),
  };
}

const sampleEvents = [
  { description: "Vessel departure", status: "departed", timestamp: "2026-03-20T08:00:00Z", location: { city: "Shanghai" }, vesselName: "Maersk Elba" },
  { description: "Gate in", status: "gate_in", timestamp: "2026-03-19T14:00:00Z", location: { city: "Shanghai" } },
];

// ── 1. Config ──────────────────────────────────────────────────────────────

describe("Maersk config", () => {
  test("configSchema has consumer_key, consumer_secret, tracking_references", () => {
    const keys = maerskProvider.configSchema.map(f => f.key);
    expect(keys).toContain("consumer_key");
    expect(keys).toContain("consumer_secret");
    expect(keys).toContain("tracking_references");
    expect(maerskProvider.configSchema.find(f => f.key === "consumer_secret")!.type).toBe("password");
  });
});

// ── 2. Test connection ─────────────────────────────────────────────────────

describe("Maersk testConnection", () => {
  test("exchanges credentials for token", async () => {
    const noTokenConfig = {
      consumer_key: "maersk-key",
      consumer_secret: "maersk-secret",
      tracking_references: "MSKU1234567",
    };

    mockFetch.mockResolvedValueOnce(tokenResponse());

    const result = await maerskProvider.testConnection(noTokenConfig);
    expect(result.ok).toBe(true);

    const tokenCall = mockFetch.mock.calls[0];
    expect(tokenCall[0]).toContain("oauth2/access_token");
    expect(tokenCall[1].body.toString()).toContain("grant_type=client_credentials");
  });
});

// ── 3. Container number detection ──────────────────────────────────────────

describe("Maersk sync: reference detection", () => {
  test("detects container number format and calls correct endpoint", async () => {
    const containerOnlyConfig = {
      ...validConfig,
      tracking_references: "MSKU1234567",
    };

    mockFetch.mockResolvedValueOnce(trackingResponse(sampleEvents));

    const items = [];
    for await (const item of maerskProvider.sync(containerOnlyConfig)) {
      items.push(item);
    }

    const callUrl = mockFetch.mock.calls[0][0] as string;
    expect(callUrl).toContain("containerNumber=MSKU1234567");
  });
});

// ── 4. Yields shipment.synced ──────────────────────────────────────────────

describe("Maersk sync: shipment events", () => {
  test("yields shipment.synced for each tracking reference", async () => {
    // First ref (container)
    mockFetch.mockResolvedValueOnce(trackingResponse(sampleEvents));
    // Second ref (BL)
    mockFetch.mockResolvedValueOnce(trackingResponse([
      { description: "In Transit", status: "in_transit", timestamp: "2026-03-22T10:00:00Z", location: { city: "Mid-ocean" } },
    ]));

    const items = [];
    for await (const item of maerskProvider.sync(validConfig)) {
      items.push(item);
    }

    const shipments = items.filter(i => i.kind === "event" && i.data.eventType === "shipment.synced");
    expect(shipments.length).toBe(2);

    expect(shipments[0].data.payload).toMatchObject({
      id: "MSKU1234567",
      trackingNumber: "MSKU1234567",
      carrier: "Maersk",
      mode: "ocean",
      origin: "Shanghai, CN",
      destination: "Rotterdam, NL",
    });
  });
});

// ── 5. Yields container.synced for container refs ──────────────────────────

describe("Maersk sync: container events", () => {
  test("yields container.synced for container-type references", async () => {
    mockFetch.mockResolvedValueOnce(trackingResponse(sampleEvents));
    // BL ref — no container event expected
    mockFetch.mockResolvedValueOnce(trackingResponse([
      { description: "In Transit", status: "in_transit", timestamp: "2026-03-22T10:00:00Z" },
    ]));

    const items = [];
    for await (const item of maerskProvider.sync(validConfig)) {
      items.push(item);
    }

    const containers = items.filter(i => i.kind === "event" && i.data.eventType === "container.synced");
    expect(containers.length).toBe(1);
    expect(containers[0].data.payload).toMatchObject({
      number: "MSKU1234567",
      size: "40HC",
      carrier: "Maersk",
    });
  });
});

// ── 6. Yields activity signals ─────────────────────────────────────────────

describe("Maersk sync: activity signals", () => {
  test("yields activity for significant tracking events", async () => {
    mockFetch.mockResolvedValueOnce(trackingResponse(sampleEvents));
    // BL ref
    mockFetch.mockResolvedValueOnce(trackingResponse([]));

    const items = [];
    for await (const item of maerskProvider.sync(validConfig)) {
      items.push(item);
    }

    const activities = items.filter(i => i.kind === "activity");
    expect(activities.length).toBe(2); // "Vessel departure" + "Gate in"
    expect(activities[0].data.signalType).toBe("shipment_tracking_update");
    expect(activities[0].data.metadata).toMatchObject({
      reference: "MSKU1234567",
      vessel: "Maersk Elba",
    });
  });
});

// ── 7. Yields content with tracking summary ────────────────────────────────

describe("Maersk sync: tracking content", () => {
  test("yields content with tracking summary text", async () => {
    mockFetch.mockResolvedValueOnce(trackingResponse(sampleEvents));
    mockFetch.mockResolvedValueOnce(trackingResponse([]));

    const items = [];
    for await (const item of maerskProvider.sync(validConfig)) {
      items.push(item);
    }

    const content = items.filter(i => i.kind === "content");
    expect(content.length).toBe(1);
    expect(content[0].data.sourceId).toBe("maersk-MSKU1234567");
    expect(content[0].data.content).toContain("Tracking for MSKU1234567");
    expect(content[0].data.content).toContain("Vessel departure");
  });
});

// ── 8. Per-reference error handling ────────────────────────────────────────

describe("Maersk sync: error handling", () => {
  test("handles 404 per-reference gracefully", async () => {
    // First ref: 404
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, headers: new Map() });
    // Second ref: success
    mockFetch.mockResolvedValueOnce(trackingResponse([
      { description: "Arrived", status: "arrived", timestamp: "2026-03-25T10:00:00Z", location: { city: "Rotterdam" } },
    ]));

    const items = [];
    for await (const item of maerskProvider.sync(validConfig)) {
      items.push(item);
    }

    // Should still get events from second reference
    const shipments = items.filter(i => i.kind === "event" && i.data.eventType === "shipment.synced");
    expect(shipments.length).toBe(1);
    expect(shipments[0].data.payload.id).toBe("123456789");
  });
});

// ── 9. Token caching ───────────────────────────────────────────────────────

describe("Maersk token management", () => {
  test("reuses cached token on second sync", async () => {
    const singleRefConfig = { ...validConfig, tracking_references: "MSKU1234567" };

    mockFetch.mockResolvedValueOnce(trackingResponse(sampleEvents));
    const items1 = [];
    for await (const item of maerskProvider.sync(singleRefConfig)) {
      items1.push(item);
    }

    mockFetch.mockResolvedValueOnce(trackingResponse(sampleEvents));
    const items2 = [];
    for await (const item of maerskProvider.sync(singleRefConfig)) {
      items2.push(item);
    }

    // No token fetch calls — both syncs used cached token
    for (const call of mockFetch.mock.calls) {
      expect(call[0]).not.toContain("oauth2");
    }
  });
});

// ── 10. Read-only executeAction ────────────────────────────────────────────

describe("Maersk executeAction", () => {
  test("returns read-only error for any action", async () => {
    const result = await maerskProvider.executeAction!(validConfig, "anything", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("read-only");
  });
});
