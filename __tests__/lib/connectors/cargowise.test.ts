import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { cargowiseProvider, parseXmlValue, parseXmlArray, isErrorResponse } from "@/lib/connectors/cargowise-provider";

beforeEach(() => {
  mockFetch.mockReset();
});

const validConfig = {
  endpoint_url: "https://test.wisegrid.net/eadaptor",
  username: "cwuser",
  password: "cwpass",
};

const expectedAuth = "Basic " + Buffer.from("cwuser:cwpass").toString("base64");

function cwShipmentResponse(shipments: Array<{ number: string; origin: string; dest: string; status: string; milestones?: Array<{ desc: string; date: string }> }>) {
  const shipmentXml = shipments.map(s => {
    const msXml = (s.milestones || []).map(m =>
      `<Milestone><Description>${m.desc}</Description><Date>${m.date}</Date></Milestone>`
    ).join("");
    return `<UniversalShipment>
      <ShipmentNumber>${s.number}</ShipmentNumber>
      <OriginPort>${s.origin}</OriginPort>
      <DestinationPort>${s.dest}</DestinationPort>
      <Status>${s.status}</Status>
      <TransportMode>SEA</TransportMode>
      <Carrier>Maersk</Carrier>
      ${msXml}
    </UniversalShipment>`;
  }).join("");
  return {
    ok: true,
    text: async () => `<UniversalResponse>${shipmentXml}</UniversalResponse>`,
  };
}

function cwErrorResponse(message: string) {
  return {
    ok: true,
    text: async () => `<UniversalResponse><IsError>true</IsError><ErrorMessage>${message}</ErrorMessage></UniversalResponse>`,
  };
}

function cwEmptyResponse() {
  return {
    ok: true,
    text: async () => `<UniversalResponse></UniversalResponse>`,
  };
}

// ── 1. Config ──────────────────────────────────────────────────────────────

describe("CargoWise config", () => {
  test("configSchema has endpoint_url, username, password fields", () => {
    const keys = cargowiseProvider.configSchema.map(f => f.key);
    expect(keys).toContain("endpoint_url");
    expect(keys).toContain("username");
    expect(keys).toContain("password");
    expect(cargowiseProvider.configSchema.find(f => f.key === "password")!.type).toBe("password");
  });
});

// ── 2. Test connection ─────────────────────────────────────────────────────

describe("CargoWise testConnection", () => {
  test("sends XML POST with Basic Auth", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<Response>OK</Response>`,
    });

    const result = await cargowiseProvider.testConnection(validConfig);
    expect(result.ok).toBe(true);

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe("https://test.wisegrid.net/eadaptor");
    expect(call[1].method).toBe("POST");
    expect(call[1].headers.Authorization).toBe(expectedAuth);
    expect(call[1].headers["Content-Type"]).toBe("application/xml");
    expect(call[1].body).toContain("UniversalInterchange");
  });
});

// ── 3. Sync: shipment.synced ───────────────────────────────────────────────

describe("CargoWise sync: shipments", () => {
  test("yields shipment.synced events from parsed XML", async () => {
    // Shipment query
    mockFetch.mockResolvedValueOnce(cwShipmentResponse([
      { number: "SHP-001", origin: "Shanghai", dest: "Rotterdam", status: "In Transit" },
    ]));
    // Financial query
    mockFetch.mockResolvedValueOnce(cwEmptyResponse());

    const items = [];
    for await (const item of cargowiseProvider.sync(validConfig)) {
      items.push(item);
    }

    const shipments = items.filter(i => i.kind === "event" && i.data.eventType === "shipment.synced");
    expect(shipments.length).toBe(1);
    expect(shipments[0].data.payload).toMatchObject({
      id: "SHP-001",
      origin: "Shanghai",
      destination: "Rotterdam",
      status: "In Transit",
      carrier: "Maersk",
      mode: "SEA",
    });
  });
});

// ── 4. Sync: activity signals for milestones ───────────────────────────────

describe("CargoWise sync: milestones", () => {
  test("yields activity signals for milestones", async () => {
    mockFetch.mockResolvedValueOnce(cwShipmentResponse([
      {
        number: "SHP-002", origin: "Shenzhen", dest: "Hamburg", status: "Departed",
        milestones: [
          { desc: "Gate in at origin", date: "2026-03-18T10:00:00Z" },
          { desc: "Vessel departure", date: "2026-03-20T08:00:00Z" },
        ],
      },
    ]));
    mockFetch.mockResolvedValueOnce(cwEmptyResponse());

    const items = [];
    for await (const item of cargowiseProvider.sync(validConfig)) {
      items.push(item);
    }

    const activities = items.filter(i => i.kind === "activity");
    expect(activities.length).toBe(2);
    expect(activities[0].data.signalType).toBe("shipment_milestone");
    expect(activities[0].data.metadata).toMatchObject({
      shipmentNumber: "SHP-002",
      milestone: "Gate in at origin",
    });
  });
});

// ── 5. Sync: content with shipment summary ─────────────────────────────────

describe("CargoWise sync: content", () => {
  test("yields content with shipment summary text", async () => {
    mockFetch.mockResolvedValueOnce(cwShipmentResponse([
      { number: "SHP-003", origin: "Busan", dest: "LA", status: "Booked" },
    ]));
    mockFetch.mockResolvedValueOnce(cwEmptyResponse());

    const items = [];
    for await (const item of cargowiseProvider.sync(validConfig)) {
      items.push(item);
    }

    const content = items.filter(i => i.kind === "content");
    expect(content.length).toBe(1);
    expect(content[0].data.sourceId).toBe("cargowise-SHP-003");
    expect(content[0].data.content).toContain("SHP-003");
    expect(content[0].data.content).toContain("Busan");
    expect(content[0].data.content).toContain("LA");
  });
});

// ── 6. XML parsing helpers ─────────────────────────────────────────────────

describe("CargoWise XML helpers", () => {
  test("parseXmlValue extracts tag values", () => {
    expect(parseXmlValue("<Root><Name>Test</Name></Root>", "Name")).toBe("Test");
    expect(parseXmlValue("<Root><Empty/></Root>", "Empty")).toBe(null);
    expect(parseXmlValue("<Root><Other>X</Other></Root>", "Missing")).toBe(null);
  });

  test("parseXmlArray extracts repeated elements", () => {
    const xml = "<Root><Item>A</Item><Item>B</Item><Item>C</Item></Root>";
    const items = parseXmlArray(xml, "Item");
    expect(items.length).toBe(3);
    expect(items[0]).toBe("A");
    expect(items[2]).toBe("C");
  });

  test("isErrorResponse detects error XML", () => {
    expect(isErrorResponse("<R><IsError>true</IsError><ErrorMessage>Bad</ErrorMessage></R>")).toBe("Bad");
    expect(isErrorResponse("<R><ProcessingStatus>Error</ProcessingStatus></R>")).toContain("error");
    expect(isErrorResponse("<R><Status>OK</Status></R>")).toBe(null);
  });
});

// ── 7. Error XML handling ──────────────────────────────────────────────────

describe("CargoWise sync: error handling", () => {
  test("handles error XML gracefully and continues", async () => {
    // Shipment query returns error
    mockFetch.mockResolvedValueOnce(cwErrorResponse("Invalid query"));
    // Financial query works but empty
    mockFetch.mockResolvedValueOnce(cwEmptyResponse());

    const items = [];
    for await (const item of cargowiseProvider.sync(validConfig)) {
      items.push(item);
    }

    // Should not yield any events but should not throw
    expect(items.length).toBe(0);
  });
});

// ── 8. Write capabilities ──────────────────────────────────────────────────

describe("CargoWise write capabilities", () => {
  test("writeCapabilities declared with correct slugs", () => {
    expect(cargowiseProvider.writeCapabilities).toBeDefined();
    expect(cargowiseProvider.writeCapabilities!.length).toBe(3);
    const slugs = cargowiseProvider.writeCapabilities!.map(c => c.slug);
    expect(slugs).toContain("create_shipment");
    expect(slugs).toContain("update_shipment_milestone");
    expect(slugs).toContain("update_shipment_routing");
  });
});

// ── 9. Execute action: create_shipment ─────────────────────────────────────

describe("CargoWise executeAction", () => {
  test("create_shipment builds correct XML and POSTs", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => `<UniversalResponse><ShipmentNumber>SHP-NEW</ShipmentNumber></UniversalResponse>`,
    });

    const result = await cargowiseProvider.executeAction!(validConfig, "create_shipment", {
      consignor: "Shipper Co",
      consignee: "Receiver Inc",
      origin: "CNSHA",
      destination: "NLRTM",
      transportMode: "SEA",
    });

    expect(result.success).toBe(true);
    expect(result.result).toMatchObject({ shipmentNumber: "SHP-NEW" });

    const body = mockFetch.mock.calls[0][1].body as string;
    expect(body).toContain("<Consignor>Shipper Co</Consignor>");
    expect(body).toContain("<DestinationPort>NLRTM</DestinationPort>");
    expect(body).toContain("<TransportMode>SEA</TransportMode>");
  });

  // ── 10. Error detection in response XML ────────────────────────────────────

  test("detects error in response XML and returns failure", async () => {
    mockFetch.mockResolvedValueOnce(cwErrorResponse("Duplicate shipment"));

    const result = await cargowiseProvider.executeAction!(validConfig, "create_shipment", {
      consignor: "A",
      consignee: "B",
      origin: "X",
      destination: "Y",
      transportMode: "AIR",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Duplicate shipment");
  });
});
