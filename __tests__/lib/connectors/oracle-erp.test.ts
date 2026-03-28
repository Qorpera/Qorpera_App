import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { oracleErpProvider } from "@/lib/connectors/oracle-erp-provider";

beforeEach(() => {
  mockFetch.mockReset();
});

const validConfig = {
  host_url: "https://test.oraclecloud.com",
  client_id: "oracle-client",
  client_secret: "oracle-secret",
  access_token: "oracle-token",
  token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
};

function oracleResponse(items: any[], hasMore = false) {
  return {
    ok: true,
    json: async () => ({ items, count: items.length, hasMore }),
  };
}

function tokenResponse() {
  return {
    ok: true,
    json: async () => ({ access_token: "new-oracle-token", expires_in: 3600 }),
  };
}

const ORACLE_BASE = "https://test.oraclecloud.com/fscmRestApi/resources/latest";

// ── 1. Config ──────────────────────────────────────────────────────────────

describe("Oracle ERP config", () => {
  test("configSchema has host_url, client_id, client_secret fields", () => {
    expect(oracleErpProvider.configSchema.length).toBe(3);
    const keys = oracleErpProvider.configSchema.map(f => f.key);
    expect(keys).toContain("host_url");
    expect(keys).toContain("client_id");
    expect(keys).toContain("client_secret");
    expect(oracleErpProvider.configSchema.find(f => f.key === "client_secret")!.type).toBe("password");
  });
});

// ── 2. Test connection ─────────────────────────────────────────────────────

describe("Oracle ERP testConnection", () => {
  test("calls suppliers endpoint with Bearer token", async () => {
    mockFetch.mockResolvedValueOnce(oracleResponse([{ SupplierId: 1 }]));

    const result = await oracleErpProvider.testConnection(validConfig);
    expect(result.ok).toBe(true);

    const callUrl = mockFetch.mock.calls[0][0] as string;
    expect(callUrl).toContain(`${ORACLE_BASE}/suppliers`);

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer oracle-token");
    expect(headers["REST-Framework-Version"]).toBe("4");
  });
});

// ── 3. Sync: purchase orders ───────────────────────────────────────────────

describe("Oracle ERP sync: purchase orders", () => {
  test("yields purchase-order.synced events", async () => {
    mockFetch
      // Purchase Orders
      .mockResolvedValueOnce(oracleResponse([
        { POHeaderId: "PO-100", OrderNumber: "4500100", CurrencyCode: "USD", Status: "APPROVED", CreationDate: "2026-03-15", Supplier: "Acme Corp", Total: 25000 },
      ]))
      // Suppliers (empty)
      .mockResolvedValueOnce(oracleResponse([]))
      // AP Invoices (empty)
      .mockResolvedValueOnce(oracleResponse([]))
      // AR Invoices (empty)
      .mockResolvedValueOnce(oracleResponse([]))
      // GL Journals (404)
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });

    const items = [];
    for await (const item of oracleErpProvider.sync(validConfig)) {
      items.push(item);
    }

    const pos = items.filter(i => i.kind === "event" && i.data.eventType === "purchase-order.synced");
    expect(pos.length).toBe(1);
    expect(pos[0].data.payload).toMatchObject({
      id: "PO-100",
      orderNumber: "4500100",
      amount: 25000,
      currency: "USD",
      status: "APPROVED",
      supplier: "Acme Corp",
    });
  });
});

// ── 4. Sync: invoices + invoice.paid ───────────────────────────────────────

describe("Oracle ERP sync: invoices", () => {
  test("yields invoice.created and invoice.paid for zero-remainder", async () => {
    mockFetch
      // Purchase Orders (empty)
      .mockResolvedValueOnce(oracleResponse([]))
      // Suppliers (empty)
      .mockResolvedValueOnce(oracleResponse([]))
      // AP Invoices
      .mockResolvedValueOnce(oracleResponse([
        { InvoiceId: "INV-200", InvoiceNumber: "INV-2001", AmountRemaining: 0, InvoiceAmount: 5000, PaymentDueDate: "2026-04-01", InvoiceCurrency: "EUR" },
        { InvoiceId: "INV-201", InvoiceNumber: "INV-2002", AmountRemaining: 3000, InvoiceAmount: 3000, PaymentDueDate: "2026-04-15", InvoiceCurrency: "USD" },
      ]))
      // AR Invoices (empty)
      .mockResolvedValueOnce(oracleResponse([]))
      // GL Journals (404)
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });

    const items = [];
    for await (const item of oracleErpProvider.sync(validConfig)) {
      items.push(item);
    }

    const created = items.filter(i => i.kind === "event" && i.data.eventType === "invoice.created");
    expect(created.length).toBe(2);

    const paid = items.filter(i => i.kind === "event" && i.data.eventType === "invoice.paid");
    expect(paid.length).toBe(1);
    expect(paid[0].data.payload.id).toBe("INV-200");

    // Open invoice should not have invoice.paid
    const openInv = created.find(i => i.data.payload.id === "INV-201");
    expect(openInv!.data.payload.status).toBe("open");
  });
});

// ── 5. Sync: suppliers → contact.synced ────────────────────────────────────

describe("Oracle ERP sync: suppliers", () => {
  test("yields contact.synced for suppliers", async () => {
    mockFetch
      // Purchase Orders (empty)
      .mockResolvedValueOnce(oracleResponse([]))
      // Suppliers
      .mockResolvedValueOnce(oracleResponse([
        { SupplierId: "SUP-001", Supplier: "Parts Unlimited" },
      ]))
      // AP Invoices (empty)
      .mockResolvedValueOnce(oracleResponse([]))
      // AR Invoices (empty)
      .mockResolvedValueOnce(oracleResponse([]))
      // GL Journals (404)
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });

    const items = [];
    for await (const item of oracleErpProvider.sync(validConfig)) {
      items.push(item);
    }

    const contacts = items.filter(i => i.kind === "event" && i.data.eventType === "contact.synced");
    expect(contacts.length).toBe(1);
    expect(contacts[0].data.payload).toMatchObject({
      id: "SUP-001",
      name: "Parts Unlimited",
    });
  });
});

// ── 6. Token caching ───────────────────────────────────────────────────────

describe("Oracle ERP token management", () => {
  test("reuses cached token when not expired", async () => {
    // Two testConnection calls — both should use cached token, no token fetch
    mockFetch
      .mockResolvedValueOnce(oracleResponse([]))
      .mockResolvedValueOnce(oracleResponse([]));

    await oracleErpProvider.testConnection(validConfig);
    await oracleErpProvider.testConnection(validConfig);

    // Both calls should go directly to suppliers endpoint (no token fetch)
    expect(mockFetch).toHaveBeenCalledTimes(2);
    for (const call of mockFetch.mock.calls) {
      expect(call[0]).toContain("/suppliers");
    }
  });

  // ── 7. Token refresh ───────────────────────────────────────────────────────

  test("fetches new token when expired", async () => {
    const expiredConfig = {
      ...validConfig,
      access_token: "expired-token",
      token_expiry: new Date(Date.now() - 60000).toISOString(),
    };

    // Token fetch
    mockFetch.mockResolvedValueOnce(tokenResponse());
    // API call
    mockFetch.mockResolvedValueOnce(oracleResponse([]));

    const result = await oracleErpProvider.testConnection(expiredConfig);
    expect(result.ok).toBe(true);

    // First call: token exchange
    const tokenCall = mockFetch.mock.calls[0];
    expect(tokenCall[0]).toContain("/oauth2/v1/token");
    expect(tokenCall[1].headers.Authorization).toContain("Basic");

    // Second call: API with new token
    const apiCall = mockFetch.mock.calls[1];
    expect(apiCall[1].headers.Authorization).toBe("Bearer new-oracle-token");

    // Config should be updated
    expect(expiredConfig.access_token).toBe("new-oracle-token");
  });
});

// ── 8. Write capabilities ──────────────────────────────────────────────────

describe("Oracle ERP write capabilities", () => {
  test("writeCapabilities declared with correct slugs", () => {
    expect(oracleErpProvider.writeCapabilities).toBeDefined();
    expect(oracleErpProvider.writeCapabilities!.length).toBe(3);
    const slugs = oracleErpProvider.writeCapabilities!.map(c => c.slug);
    expect(slugs).toContain("create_purchase_order");
    expect(slugs).toContain("create_ap_invoice");
    expect(slugs).toContain("approve_purchase_order");
  });
});

// ── 9. Execute action: create_purchase_order ───────────────────────────────

describe("Oracle ERP executeAction", () => {
  test("create_purchase_order POSTs to correct URL with Bearer token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ POHeaderId: "PO-NEW" }),
    });

    const result = await oracleErpProvider.executeAction!(validConfig, "create_purchase_order", {
      supplier: "Acme Corp",
      lines: [{ itemDescription: "Widget", quantity: 100, unitPrice: 10 }],
    });

    expect(result.success).toBe(true);

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toContain(`${ORACLE_BASE}/purchaseOrders`);
    expect(call[1].method).toBe("POST");
    expect(call[1].headers.Authorization).toBe("Bearer oracle-token");

    const body = JSON.parse(call[1].body);
    expect(body.Supplier).toBe("Acme Corp");
    expect(body.lines.length).toBe(1);
  });
});

// ── 10. Pagination ─────────────────────────────────────────────────────────

describe("Oracle ERP pagination", () => {
  test("follows hasMore across pages", async () => {
    const page1 = Array.from({ length: 3 }, (_, i) => ({
      POHeaderId: `PO-${i}`, OrderNumber: `ORD-${i}`, CurrencyCode: "USD", Status: "OPEN", CreationDate: "2026-03-15", Supplier: "S1",
    }));
    const page2 = [{ POHeaderId: "PO-3", OrderNumber: "ORD-3", CurrencyCode: "USD", Status: "OPEN", CreationDate: "2026-03-16", Supplier: "S1" }];

    mockFetch
      // PO page 1 (hasMore=true)
      .mockResolvedValueOnce(oracleResponse(page1, true))
      // PO page 2 (hasMore=false)
      .mockResolvedValueOnce(oracleResponse(page2, false))
      // Suppliers (empty)
      .mockResolvedValueOnce(oracleResponse([]))
      // AP Invoices (empty)
      .mockResolvedValueOnce(oracleResponse([]))
      // AR Invoices (empty)
      .mockResolvedValueOnce(oracleResponse([]))
      // GL Journals (404)
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });

    const items = [];
    for await (const item of oracleErpProvider.sync(validConfig)) {
      items.push(item);
    }

    const pos = items.filter(i => i.kind === "event" && i.data.eventType === "purchase-order.synced");
    expect(pos.length).toBe(4);

    // Second call should have offset=500
    const secondUrl = mockFetch.mock.calls[1][0] as string;
    expect(secondUrl).toContain("offset=500");
  });
});
