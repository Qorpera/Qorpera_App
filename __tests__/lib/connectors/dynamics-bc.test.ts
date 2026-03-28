import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

process.env.DYNAMICS_BC_CLIENT_ID = "bc-client-id";
process.env.DYNAMICS_BC_CLIENT_SECRET = "bc-client-secret";

import { dynamicsBcProvider } from "@/lib/connectors/dynamics-bc-provider";

beforeEach(() => {
  mockFetch.mockReset();
});

const validConfig = {
  access_token: "bc-token",
  refresh_token: "bc-refresh",
  token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
  tenant_id: "tenant-123",
  environment: "Production",
  company_id: "company-456",
  company_name: "Test Company",
};

function bcResponse(value: any[], nextLink?: string) {
  return {
    ok: true,
    json: async () => ({
      value,
      ...(nextLink ? { "@odata.nextLink": nextLink } : {}),
    }),
  };
}

const BC_BASE = `https://api.businesscentral.dynamics.com/v2.0/tenant-123/Production/api/v2.0/companies(company-456)`;

// ── 1. Config ──────────────────────────────────────────────────────────────

describe("Dynamics BC config", () => {
  test("configSchema is OAuth-only", () => {
    expect(dynamicsBcProvider.configSchema).toEqual([
      { key: "oauth", label: "Microsoft Business Central", type: "oauth", required: true },
    ]);
  });
});

// ── 2. Test connection ─────────────────────────────────────────────────────

describe("Dynamics BC testConnection", () => {
  test("calls /customers?$top=1 with Bearer token", async () => {
    mockFetch.mockResolvedValueOnce(bcResponse([{ id: "cust-1" }]));

    const result = await dynamicsBcProvider.testConnection(validConfig);
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      `${BC_BASE}/customers?$top=1`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer bc-token" }),
      }),
    );
  });
});

// ── 3. Sync: customers → contact.synced ────────────────────────────────────

describe("Dynamics BC sync: customers", () => {
  test("yields contact.synced for customers", async () => {
    mockFetch
      // Customers
      .mockResolvedValueOnce(bcResponse([
        { id: "cust-1", displayName: "Jane Smith", email: "jane@corp.com", phoneNumber: "+1555", currencyCode: "USD", lastModifiedDateTime: "2026-03-20T10:00:00Z" },
      ]))
      // Vendors (empty)
      .mockResolvedValueOnce(bcResponse([]))
      // Sales Orders (empty)
      .mockResolvedValueOnce(bcResponse([]))
      // Purchase Orders (empty)
      .mockResolvedValueOnce(bcResponse([]))
      // Sales Invoices (empty)
      .mockResolvedValueOnce(bcResponse([]))
      // Items (empty)
      .mockResolvedValueOnce(bcResponse([]));

    const items = [];
    for await (const item of dynamicsBcProvider.sync(validConfig)) {
      items.push(item);
    }

    const contacts = items.filter(i => i.kind === "event" && i.data.eventType === "contact.synced");
    expect(contacts.length).toBe(1);
    expect(contacts[0].data.payload).toMatchObject({
      id: "cust-1",
      name: "Jane Smith",
      email: "jane@corp.com",
      currency: "USD",
    });

    // Also yields activity signal
    const activities = items.filter(i => i.kind === "activity" && i.data.signalType === "erp_customer_synced");
    expect(activities.length).toBe(1);
  });
});

// ── 4. Sync: sales orders → sales-order.synced ────────────────────────────

describe("Dynamics BC sync: sales orders", () => {
  test("yields sales-order.synced", async () => {
    mockFetch
      // Customers (empty)
      .mockResolvedValueOnce(bcResponse([]))
      // Vendors (empty)
      .mockResolvedValueOnce(bcResponse([]))
      // Sales Orders
      .mockResolvedValueOnce(bcResponse([
        { id: "so-1", number: "SO-1001", totalAmountIncludingTax: 5000, currencyCode: "EUR", status: "Open", orderDate: "2026-03-15", requestedDeliveryDate: "2026-04-01", customerName: "Acme Corp" },
      ]))
      // Purchase Orders (empty)
      .mockResolvedValueOnce(bcResponse([]))
      // Sales Invoices (empty)
      .mockResolvedValueOnce(bcResponse([]))
      // Items (empty)
      .mockResolvedValueOnce(bcResponse([]));

    const items = [];
    for await (const item of dynamicsBcProvider.sync(validConfig)) {
      items.push(item);
    }

    const orders = items.filter(i => i.kind === "event" && i.data.eventType === "sales-order.synced");
    expect(orders.length).toBe(1);
    expect(orders[0].data.payload).toMatchObject({
      id: "so-1",
      orderNumber: "SO-1001",
      amount: 5000,
      currency: "EUR",
      status: "Open",
      customerName: "Acme Corp",
    });
  });
});

// ── 5. Sync: purchase orders → purchase-order.synced ──────────────────────

describe("Dynamics BC sync: purchase orders", () => {
  test("yields purchase-order.synced", async () => {
    mockFetch
      // Customers (empty)
      .mockResolvedValueOnce(bcResponse([]))
      // Vendors (empty)
      .mockResolvedValueOnce(bcResponse([]))
      // Sales Orders (empty)
      .mockResolvedValueOnce(bcResponse([]))
      // Purchase Orders
      .mockResolvedValueOnce(bcResponse([
        { id: "po-1", number: "PO-2001", totalAmountIncludingTax: 3000, currencyCode: "USD", status: "Released", orderDate: "2026-03-10", expectedReceiptDate: "2026-03-25", buyFromVendorName: "Supplier Inc" },
      ]))
      // Sales Invoices (empty)
      .mockResolvedValueOnce(bcResponse([]))
      // Items (empty)
      .mockResolvedValueOnce(bcResponse([]));

    const items = [];
    for await (const item of dynamicsBcProvider.sync(validConfig)) {
      items.push(item);
    }

    const orders = items.filter(i => i.kind === "event" && i.data.eventType === "purchase-order.synced");
    expect(orders.length).toBe(1);
    expect(orders[0].data.payload).toMatchObject({
      id: "po-1",
      orderNumber: "PO-2001",
      amount: 3000,
      supplier: "Supplier Inc",
    });
  });
});

// ── 6. Sync: sales invoices → invoice.created ─────────────────────────────

describe("Dynamics BC sync: invoices", () => {
  test("yields invoice.created for sales invoices", async () => {
    mockFetch
      .mockResolvedValueOnce(bcResponse([]))  // Customers
      .mockResolvedValueOnce(bcResponse([]))  // Vendors
      .mockResolvedValueOnce(bcResponse([]))  // Sales Orders
      .mockResolvedValueOnce(bcResponse([]))  // Purchase Orders
      // Sales Invoices
      .mockResolvedValueOnce(bcResponse([
        { id: "inv-1", number: "INV-3001", remainingAmount: 1500, totalAmountIncludingTax: 1500, dueDate: "2026-04-15", currencyCode: "EUR" },
      ]))
      .mockResolvedValueOnce(bcResponse([]));  // Items

    const items = [];
    for await (const item of dynamicsBcProvider.sync(validConfig)) {
      items.push(item);
    }

    const invoices = items.filter(i => i.kind === "event" && i.data.eventType === "invoice.created");
    expect(invoices.length).toBe(1);
    expect(invoices[0].data.payload).toMatchObject({
      id: "inv-1",
      number: "INV-3001",
      amount_due: 1500,
      status: "open",
    });
  });

  test("marks invoice as paid when remainingAmount is 0", async () => {
    mockFetch
      .mockResolvedValueOnce(bcResponse([]))
      .mockResolvedValueOnce(bcResponse([]))
      .mockResolvedValueOnce(bcResponse([]))
      .mockResolvedValueOnce(bcResponse([]))
      .mockResolvedValueOnce(bcResponse([
        { id: "inv-2", number: "INV-3002", remainingAmount: 0, totalAmountIncludingTax: 2000, dueDate: "2026-04-01", currencyCode: "USD" },
      ]))
      .mockResolvedValueOnce(bcResponse([]));

    const items = [];
    for await (const item of dynamicsBcProvider.sync(validConfig)) {
      items.push(item);
    }

    const invoices = items.filter(i => i.kind === "event" && i.data.eventType === "invoice.created");
    expect(invoices[0].data.payload.status).toBe("paid");
  });
});

// ── 7. Sync: incremental with $filter ─────────────────────────────────────

describe("Dynamics BC sync: incremental", () => {
  test("uses $filter=lastModifiedDateTime when since is provided", async () => {
    const since = new Date("2026-03-20T00:00:00Z");

    // Mock all 6 entity endpoints
    for (let i = 0; i < 6; i++) {
      mockFetch.mockResolvedValueOnce(bcResponse([]));
    }

    const items = [];
    for await (const item of dynamicsBcProvider.sync(validConfig, since)) {
      items.push(item);
    }

    // Check the first fetch call (customers) includes the filter
    const firstCallUrl = mockFetch.mock.calls[0][0] as string;
    expect(firstCallUrl).toContain("$filter=lastModifiedDateTime");
    expect(firstCallUrl).toContain("2026-03-20");
  });
});

// ── 8. Write capabilities declared ────────────────────────────────────────

describe("Dynamics BC write capabilities", () => {
  test("writeCapabilities are declared with correct slugs", () => {
    expect(dynamicsBcProvider.writeCapabilities).toBeDefined();
    expect(dynamicsBcProvider.writeCapabilities!.length).toBe(5);
    const slugs = dynamicsBcProvider.writeCapabilities!.map(c => c.slug);
    expect(slugs).toContain("create_sales_order");
    expect(slugs).toContain("update_sales_order");
    expect(slugs).toContain("create_purchase_order");
    expect(slugs).toContain("create_customer");
    expect(slugs).toContain("create_sales_invoice");
  });
});

// ── 9. Execute action: create_sales_order ─────────────────────────────────

describe("Dynamics BC executeAction", () => {
  test("create_sales_order calls POST to /salesOrders", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: "new-so-1", number: "SO-5001" }),
    });

    const result = await dynamicsBcProvider.executeAction!(validConfig, "create_sales_order", {
      customerNumber: "CUST-001",
      orderDate: "2026-04-01",
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      `${BC_BASE}/salesOrders`,
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"customerNumber":"CUST-001"'),
      }),
    );
  });
});

// ── 10. Token refresh ─────────────────────────────────────────────────────

describe("Dynamics BC token refresh", () => {
  test("refreshes token when expiry is in the past", async () => {
    const expiredConfig = {
      ...validConfig,
      token_expiry: new Date(Date.now() - 60000).toISOString(), // expired
    };

    // Token refresh response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "new-bc-token",
        refresh_token: "new-bc-refresh",
        expires_in: 3600,
      }),
    });

    // testConnection call after refresh
    mockFetch.mockResolvedValueOnce(bcResponse([{ id: "cust-1" }]));

    const result = await dynamicsBcProvider.testConnection(expiredConfig);
    expect(result.ok).toBe(true);

    // First call should be token refresh
    const refreshCall = mockFetch.mock.calls[0];
    expect(refreshCall[0]).toContain("login.microsoftonline.com");
    expect(refreshCall[0]).toContain("tenant-123");
    expect(refreshCall[1].body.toString()).toContain("grant_type=refresh_token");

    // Second call uses the new token
    const apiCall = mockFetch.mock.calls[1];
    expect(apiCall[1].headers.Authorization).toBe("Bearer new-bc-token");

    // Config should be updated in place
    expect(expiredConfig.access_token).toBe("new-bc-token");
    expect(expiredConfig.refresh_token).toBe("new-bc-refresh");
  });
});
