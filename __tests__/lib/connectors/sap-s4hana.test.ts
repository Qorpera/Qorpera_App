import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { sapProvider } from "@/lib/connectors/sap-provider";

beforeEach(() => {
  mockFetch.mockReset();
});

const validConfig = {
  host_url: "https://test.s4hana.ondemand.com",
  username: "COMM_USER",
  password: "secret123",
};

const expectedAuth = "Basic " + Buffer.from("COMM_USER:secret123").toString("base64");

function sapResponse(results: any[]) {
  return {
    ok: true,
    headers: new Map([["x-csrf-token", "csrf-abc"], ["set-cookie", "sap-session=xyz"]]),
    json: async () => ({ d: { results } }),
  };
}

const SAP_BASE = "https://test.s4hana.ondemand.com/sap/opu/odata/sap";

// ── 1. Config ──────────────────────────────────────────────────────────────

describe("SAP S/4HANA config", () => {
  test("configSchema has host_url, username, password fields", () => {
    expect(sapProvider.configSchema.length).toBe(3);
    const keys = sapProvider.configSchema.map(f => f.key);
    expect(keys).toContain("host_url");
    expect(keys).toContain("username");
    expect(keys).toContain("password");
    expect(sapProvider.configSchema.find(f => f.key === "password")!.type).toBe("password");
  });
});

// ── 2. Test connection ─────────────────────────────────────────────────────

describe("SAP S/4HANA testConnection", () => {
  test("calls Business Partner endpoint with Basic Auth", async () => {
    mockFetch.mockResolvedValueOnce(sapResponse([{ BusinessPartner: "BP001" }]));

    const result = await sapProvider.testConnection(validConfig);
    expect(result.ok).toBe(true);

    const callUrl = decodeURIComponent(mockFetch.mock.calls[0][0] as string);
    expect(callUrl).toContain(`${SAP_BASE}/API_BUSINESS_PARTNER/A_BusinessPartner`);
    expect(callUrl).toContain("$top=1");

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe(expectedAuth);
  });
});

// ── 3. Sync: person business partners → contact.synced ─────────────────────

describe("SAP S/4HANA sync: business partners", () => {
  test("yields contact.synced for person-type BPs", async () => {
    mockFetch
      // Business Partners
      .mockResolvedValueOnce(sapResponse([
        {
          BusinessPartner: "BP001",
          BusinessPartnerCategory: "1",
          FirstName: "Hans",
          LastName: "Mueller",
          PhoneNumber: "+49555",
          to_BusinessPartnerAddress: { results: [{ EmailAddress: "hans@corp.de" }] },
        },
      ]))
      // Sales Orders (empty)
      .mockResolvedValueOnce(sapResponse([]))
      // Purchase Orders (empty)
      .mockResolvedValueOnce(sapResponse([]))
      // Accounting (404 — not available)
      .mockResolvedValueOnce({ ok: false, status: 404, headers: new Map(), json: async () => ({}) });

    const items = [];
    for await (const item of sapProvider.sync(validConfig)) {
      items.push(item);
    }

    const contacts = items.filter(i => i.kind === "event" && i.data.eventType === "contact.synced");
    expect(contacts.length).toBe(1);
    expect(contacts[0].data.payload).toMatchObject({
      id: "BP001",
      firstname: "Hans",
      lastname: "Mueller",
      email: "hans@corp.de",
    });
  });

  // ── 4. Sync: org business partners → company.synced ───────────────────────

  test("yields company.synced for organization-type BPs", async () => {
    mockFetch
      // Business Partners
      .mockResolvedValueOnce(sapResponse([
        {
          BusinessPartner: "BP002",
          BusinessPartnerCategory: "2",
          OrganizationBPName1: "SAP SE",
        },
      ]))
      .mockResolvedValueOnce(sapResponse([]))
      .mockResolvedValueOnce(sapResponse([]))
      .mockResolvedValueOnce({ ok: false, status: 404, headers: new Map(), json: async () => ({}) });

    const items = [];
    for await (const item of sapProvider.sync(validConfig)) {
      items.push(item);
    }

    const companies = items.filter(i => i.kind === "event" && i.data.eventType === "company.synced");
    expect(companies.length).toBe(1);
    expect(companies[0].data.payload).toMatchObject({
      id: "BP002",
      name: "SAP SE",
    });
  });
});

// ── 5. Sync: sales orders → sales-order.synced ─────────────────────────────

describe("SAP S/4HANA sync: sales orders", () => {
  test("yields sales-order.synced", async () => {
    mockFetch
      // Business Partners (empty)
      .mockResolvedValueOnce(sapResponse([]))
      // Sales Orders
      .mockResolvedValueOnce(sapResponse([
        {
          SalesOrder: "0000001234",
          TotalNetAmount: "15000.00",
          TransactionCurrency: "EUR",
          OverallSDProcessStatus: "C",
          CreationDate: "/Date(1711238400000)/",
          RequestedDeliveryDate: "/Date(1712448000000)/",
          SoldToParty: "BP001",
        },
      ]))
      // Purchase Orders (empty)
      .mockResolvedValueOnce(sapResponse([]))
      // Accounting (404)
      .mockResolvedValueOnce({ ok: false, status: 404, headers: new Map(), json: async () => ({}) });

    const items = [];
    for await (const item of sapProvider.sync(validConfig)) {
      items.push(item);
    }

    const orders = items.filter(i => i.kind === "event" && i.data.eventType === "sales-order.synced");
    expect(orders.length).toBe(1);
    expect(orders[0].data.payload).toMatchObject({
      id: "0000001234",
      orderNumber: "0000001234",
      amount: "15000.00",
      currency: "EUR",
      customerName: "BP001",
    });
  });
});

// ── 6. Sync: purchase orders → purchase-order.synced ────────────────────────

describe("SAP S/4HANA sync: purchase orders", () => {
  test("yields purchase-order.synced", async () => {
    mockFetch
      .mockResolvedValueOnce(sapResponse([]))
      .mockResolvedValueOnce(sapResponse([]))
      // Purchase Orders
      .mockResolvedValueOnce(sapResponse([
        {
          PurchaseOrder: "4500001234",
          DocumentCurrency: "USD",
          PurchasingDocumentDeletionCode: "",
          CreationDate: "/Date(1711238400000)/",
          Supplier: "VENDOR001",
        },
      ]))
      .mockResolvedValueOnce({ ok: false, status: 404, headers: new Map(), json: async () => ({}) });

    const items = [];
    for await (const item of sapProvider.sync(validConfig)) {
      items.push(item);
    }

    const orders = items.filter(i => i.kind === "event" && i.data.eventType === "purchase-order.synced");
    expect(orders.length).toBe(1);
    expect(orders[0].data.payload).toMatchObject({
      id: "4500001234",
      orderNumber: "4500001234",
      status: "active",
      supplier: "VENDOR001",
    });
  });
});

// ── 7. Sync: incremental with $filter ───────────────────────────────────────

describe("SAP S/4HANA sync: incremental", () => {
  test("applies $filter when since is provided", async () => {
    const since = new Date("2026-03-20T00:00:00Z");

    // Mock all endpoints (BP, SO, PO, Accounting)
    mockFetch
      .mockResolvedValueOnce(sapResponse([]))
      .mockResolvedValueOnce(sapResponse([]))
      .mockResolvedValueOnce(sapResponse([]))
      .mockResolvedValueOnce({ ok: false, status: 404, headers: new Map(), json: async () => ({}) });

    const items = [];
    for await (const item of sapProvider.sync(validConfig, since)) {
      items.push(item);
    }

    // Check first call (Business Partners) has $filter (URL-encoded by URLSearchParams)
    const firstCallUrl = decodeURIComponent(mockFetch.mock.calls[0][0] as string);
    expect(firstCallUrl).toContain("$filter=LastChangeDate");
    expect(firstCallUrl).toContain("datetime");
  });
});

// ── 8. Write capabilities declared ──────────────────────────────────────────

describe("SAP S/4HANA write capabilities", () => {
  test("writeCapabilities declared with correct slugs", () => {
    expect(sapProvider.writeCapabilities).toBeDefined();
    expect(sapProvider.writeCapabilities!.length).toBe(3);
    const slugs = sapProvider.writeCapabilities!.map(c => c.slug);
    expect(slugs).toContain("create_sales_order");
    expect(slugs).toContain("update_sales_order");
    expect(slugs).toContain("create_purchase_order");
  });
});

// ── 9. Execute action: CSRF token fetch then POST ───────────────────────────

describe("SAP S/4HANA executeAction", () => {
  test("create_sales_order fetches CSRF token then POSTs", async () => {
    // CSRF token fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Map([["x-csrf-token", "csrf-xyz"], ["set-cookie", "sap-session=abc"]]),
      json: async () => ({ d: { results: [] } }),
    });
    // Actual POST
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Map(),
      json: async () => ({ d: { SalesOrder: "0000005678" } }),
    });

    const result = await sapProvider.executeAction!(validConfig, "create_sales_order", {
      salesOrderType: "OR",
      soldToParty: "BP001",
    });

    expect(result.success).toBe(true);

    // First call: CSRF token fetch
    const csrfCall = mockFetch.mock.calls[0];
    expect(csrfCall[1].headers["x-csrf-token"]).toBe("Fetch");

    // Second call: actual POST with CSRF token
    const postCall = mockFetch.mock.calls[1];
    expect(postCall[0]).toContain("API_SALES_ORDER_SRV/A_SalesOrder");
    expect(postCall[1].method).toBe("POST");
    expect(postCall[1].headers["x-csrf-token"]).toBe("csrf-xyz");

    const postBody = JSON.parse(postCall[1].body);
    expect(postBody.d.SalesOrderType).toBe("OR");
    expect(postBody.d.SoldToParty).toBe("BP001");
  });
});

// ── 10. OData V2 pagination ─────────────────────────────────────────────────

describe("SAP S/4HANA pagination", () => {
  test("yields items across multiple pages", async () => {
    // Page 1: 500 items (full page, triggers next)
    const page1 = Array.from({ length: 500 }, (_, i) => ({
      BusinessPartner: `BP${String(i).padStart(4, "0")}`,
      BusinessPartnerCategory: "1",
      FirstName: `First${i}`,
      LastName: `Last${i}`,
    }));
    // Page 2: 3 items (partial, stops pagination)
    const page2 = Array.from({ length: 3 }, (_, i) => ({
      BusinessPartner: `BP${String(500 + i).padStart(4, "0")}`,
      BusinessPartnerCategory: "1",
      FirstName: `First${500 + i}`,
      LastName: `Last${500 + i}`,
    }));

    mockFetch
      // BP page 1
      .mockResolvedValueOnce(sapResponse(page1))
      // BP page 2
      .mockResolvedValueOnce(sapResponse(page2))
      // Sales Orders (empty)
      .mockResolvedValueOnce(sapResponse([]))
      // Purchase Orders (empty)
      .mockResolvedValueOnce(sapResponse([]))
      // Accounting (404)
      .mockResolvedValueOnce({ ok: false, status: 404, headers: new Map(), json: async () => ({}) });

    const items = [];
    for await (const item of sapProvider.sync(validConfig)) {
      items.push(item);
    }

    const contacts = items.filter(i => i.kind === "event" && i.data.eventType === "contact.synced");
    expect(contacts.length).toBe(503);

    // Check that page 2 used $skip=500 (URL-encoded by URLSearchParams)
    const page2Url = decodeURIComponent(mockFetch.mock.calls[1][0] as string);
    expect(page2Url).toContain("$skip=500");
  });
});
