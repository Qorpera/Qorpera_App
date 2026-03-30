import { describe, test, expect, vi, beforeEach } from "vitest";
import { hapagLloydProvider } from "@/lib/connectors/hapag-lloyd-provider";
import { project44Provider } from "@/lib/connectors/project44-provider";
import { xenetaProvider } from "@/lib/connectors/xeneta-provider";

async function collectEvents(gen: AsyncGenerator<any>, max = 50): Promise<any[]> {
  const events: any[] = [];
  for await (const ev of gen) {
    events.push(ev);
    if (events.length >= max) break;
  }
  return events;
}

// ── Hapag-Lloyd ───────────────────────────────────────────

describe("Hapag-Lloyd connector", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("configSchema has client_id, client_secret, tracking_references", () => {
    const keys = hapagLloydProvider.configSchema.map((f) => f.key);
    expect(keys).toContain("client_id");
    expect(keys).toContain("client_secret");
    expect(keys).toContain("tracking_references");
  });

  test("sync yields shipment.synced and container.synced", async () => {
    let callNum = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callNum++;
      if (callNum === 1) {
        // Token request
        return new Response(
          JSON.stringify({ access_token: "tok", expires_in: 3600 }),
          { status: 200 },
        );
      }
      // Tracking response
      return new Response(
        JSON.stringify({
          transports: [
            {
              events: [
                { description: "Departed from port", status: "departed", timestamp: "2026-03-20T10:00:00Z", location: { city: "Shanghai" } },
              ],
              origin: { city: "Shanghai", country: "CN" },
              destination: { city: "Rotterdam", country: "NL" },
              estimatedArrival: "2026-04-15T08:00:00Z",
              departureDate: "2026-03-20T10:00:00Z",
            },
          ],
        }),
        { status: 200 },
      );
    });

    const config = {
      client_id: "cid",
      client_secret: "cs",
      tracking_references: "HLCU1234567",
    };

    const events = await collectEvents(hapagLloydProvider.sync(config));

    const shipment = events.find(
      (e) => e.kind === "event" && e.data.eventType === "shipment.synced",
    );
    expect(shipment).toBeDefined();
    expect(shipment.data.payload.carrier).toBe("Hapag-Lloyd");
    expect(shipment.data.payload.mode).toBe("ocean");

    const container = events.find(
      (e) => e.kind === "event" && e.data.eventType === "container.synced",
    );
    expect(container).toBeDefined();
    expect(container.data.payload.number).toBe("HLCU1234567");
  });

  test("reference type detection works", async () => {
    const calls: string[] = [];
    let tokenDone = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (!tokenDone) {
        tokenDone = true;
        return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
      }
      calls.push(urlStr);
      return new Response(
        JSON.stringify({ transports: [{ events: [], origin: {}, destination: {} }] }),
        { status: 200 },
      );
    });

    const config = {
      client_id: "c",
      client_secret: "s",
      tracking_references: "ABCU1234567, 123456789012, BK-REF-001",
    };

    await collectEvents(hapagLloydProvider.sync(config));

    // Container pattern
    expect(calls.some((u) => u.includes("containerNumber=ABCU1234567"))).toBe(true);
    // BL pattern (numeric)
    expect(calls.some((u) => u.includes("billOfLadingNumber=123456789012"))).toBe(true);
    // Booking (fallback)
    expect(calls.some((u) => u.includes("bookingNumber=BK-REF-001"))).toBe(true);
  });
});

// ── project44 ─────────────────────────────────────────────

describe("project44 connector", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("configSchema has client_id, client_secret", () => {
    const keys = project44Provider.configSchema.map((f) => f.key);
    expect(keys).toContain("client_id");
    expect(keys).toContain("client_secret");
    expect(keys).toHaveLength(2);
  });

  test("sync yields shipment.synced for active shipments", async () => {
    let callNum = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callNum++;
      if (callNum === 1) {
        // Token
        return new Response(
          JSON.stringify({ access_token: "tok", expires_in: 3600 }),
          { status: 200 },
        );
      }
      // Shipments
      return new Response(
        JSON.stringify({
          results: [
            {
              shipmentId: "ship-1",
              identifiers: [{ value: "CONT1234567" }],
              statusDescription: "In Transit",
              originLocation: { city: "Shenzhen" },
              destinationLocation: { city: "Hamburg" },
              carrierName: "COSCO",
              modeOfTransport: "ocean",
              predictedArrival: "2026-04-20",
              containers: [
                { containerNumber: "CONT1234567", status: "In Transit", containerSize: "40HC" },
              ],
              milestones: [],
            },
          ],
        }),
        { status: 200 },
      );
    });

    const config = { client_id: "c", client_secret: "s" };
    const events = await collectEvents(project44Provider.sync(config));

    const shipment = events.find(
      (e) => e.kind === "event" && e.data.eventType === "shipment.synced",
    );
    expect(shipment).toBeDefined();
    expect(shipment.data.payload.carrier).toBe("COSCO");
    expect(shipment.data.payload.origin).toBe("Shenzhen");

    const container = events.find(
      (e) => e.kind === "event" && e.data.eventType === "container.synced",
    );
    expect(container).toBeDefined();
    expect(container.data.payload.number).toBe("CONT1234567");
  });

  test("pagination follows offset/limit", async () => {
    let callNum = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      callNum++;
      if (callNum === 1) {
        return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
      }
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("offset=0")) {
        // Return full page to trigger next page
        const items = Array.from({ length: 100 }, (_, i) => ({
          shipmentId: `s-${i}`,
          identifiers: [],
          status: "IN_TRANSIT",
          containers: [],
          milestones: [],
        }));
        return new Response(JSON.stringify({ results: items }), { status: 200 });
      }
      // Second page empty
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });

    const config = { client_id: "c", client_secret: "s" };
    const events = await collectEvents(project44Provider.sync(config), 150);

    const shipments = events.filter(
      (e) => e.kind === "event" && e.data.eventType === "shipment.synced",
    );
    // First page had 100 items, second page 0 — should have fetched both pages
    expect(shipments.length).toBe(100);
    expect(callNum).toBeGreaterThanOrEqual(3); // token + page1 + page2
  });
});

// ── Xeneta ────────────────────────────────────────────────

describe("Xeneta connector", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("configSchema has api_key and trade_lanes", () => {
    const keys = xenetaProvider.configSchema.map((f) => f.key);
    expect(keys).toContain("api_key");
    expect(keys).toContain("trade_lanes");
    expect(keys).toHaveLength(2);
  });

  test("sync yields content (not events)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          low: 1200,
          mean: 1800,
          high: 2500,
        }),
        { status: 200 },
      ),
    );

    const config = { api_key: "k", trade_lanes: "CNSHA-NLRTM" };
    const events = await collectEvents(xenetaProvider.sync(config));

    // Should yield content, not event
    const content = events.find((e) => e.kind === "content");
    expect(content).toBeDefined();

    const entityEvents = events.filter((e) => e.kind === "event");
    expect(entityEvents).toHaveLength(0);
  });

  test("content sourceType is rate_benchmark", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({ low: 900, mean: 1400, high: 2000 }),
        { status: 200 },
      ),
    );

    const config = { api_key: "k", trade_lanes: "CNSHA-DEHAM" };
    const events = await collectEvents(xenetaProvider.sync(config));

    const content = events.find((e) => e.kind === "content");
    expect(content).toBeDefined();
    expect(content.data.sourceType).toBe("rate_benchmark");
    expect(content.data.sourceId).toContain("xeneta-CNSHA-DEHAM");
    expect(content.data.content).toContain("Market low: $900");
    expect(content.data.content).toContain("Market avg: $1400");
  });
});
