import { describe, test, expect, vi, beforeEach } from "vitest";
import { netsuiteProvider } from "@/lib/connectors/netsuite-provider";
import { sapB1Provider } from "@/lib/connectors/sap-b1-provider";

async function collectEvents(gen: AsyncGenerator<any>, max = 100): Promise<any[]> {
  const events: any[] = [];
  for await (const ev of gen) {
    events.push(ev);
    if (events.length >= max) break;
  }
  return events;
}

// ── NetSuite ──────────────────────────────────────────────

describe("Oracle NetSuite connector", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("configSchema has all 5 credential fields", () => {
    const keys = netsuiteProvider.configSchema.map((f) => f.key);
    expect(keys).toContain("account_id");
    expect(keys).toContain("consumer_key");
    expect(keys).toContain("consumer_secret");
    expect(keys).toContain("token_id");
    expect(keys).toContain("token_secret");
    expect(keys).toHaveLength(5);
  });

  test("sync yields sales-order.synced, purchase-order.synced, invoice.created, contact.synced", async () => {
    let callNum = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      callNum++;
      const urlStr = typeof url === "string" ? url : url.toString();

      if (urlStr.includes("/customer")) {
        return new Response(
          JSON.stringify({
            items: [{ id: "c1", firstName: "Alice", lastName: "Smith", email: "a@test.com" }],
            hasMore: false,
          }),
          { status: 200 },
        );
      }
      if (urlStr.includes("/vendor")) {
        return new Response(
          JSON.stringify({
            items: [{ id: "v1", companyName: "Vendor Corp", email: "v@test.com" }],
            hasMore: false,
          }),
          { status: 200 },
        );
      }
      if (urlStr.includes("/salesOrder")) {
        return new Response(
          JSON.stringify({
            items: [{ id: "so1", tranId: "SO-001", total: 5000, status: "open", tranDate: "2026-03-01", entity: { refName: "Alice Smith" }, currency: { refName: "USD" } }],
            hasMore: false,
          }),
          { status: 200 },
        );
      }
      if (urlStr.includes("/purchaseOrder")) {
        return new Response(
          JSON.stringify({
            items: [{ id: "po1", tranId: "PO-001", total: 3000, status: "open", tranDate: "2026-03-01", entity: { refName: "Vendor Corp" }, currency: { refName: "USD" } }],
            hasMore: false,
          }),
          { status: 200 },
        );
      }
      if (urlStr.includes("/invoice")) {
        return new Response(
          JSON.stringify({
            items: [{ id: "inv1", tranId: "INV-001", total: 2000, amountRemaining: 0, dueDate: "2026-04-01", currency: { refName: "USD" } }],
            hasMore: false,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ items: [], hasMore: false }), { status: 200 });
    });

    const config = {
      account_id: "123",
      consumer_key: "ck",
      consumer_secret: "cs",
      token_id: "ti",
      token_secret: "ts",
    };
    const events = await collectEvents(netsuiteProvider.sync(config));

    const types = events
      .filter((e) => e.kind === "event")
      .map((e) => e.data.eventType);

    expect(types).toContain("contact.synced");
    expect(types).toContain("sales-order.synced");
    expect(types).toContain("purchase-order.synced");
    expect(types).toContain("invoice.created");
    expect(types).toContain("invoice.paid");
  });

  test("OAuth 1.0a signature includes correct Authorization header format", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ items: [], hasMore: false }), { status: 200 }),
    );

    const config = {
      account_id: "12345",
      consumer_key: "test_consumer_key",
      consumer_secret: "test_consumer_secret",
      token_id: "test_token_id",
      token_secret: "test_token_secret",
    };

    await netsuiteProvider.testConnection(config);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0];
    const authHeader = (init as any).headers.Authorization as string;
    expect(authHeader).toMatch(/^OAuth /);
    expect(authHeader).toContain("oauth_consumer_key=");
    expect(authHeader).toContain("oauth_signature_method=\"HMAC-SHA256\"");
    expect(authHeader).toContain("oauth_token=");
    expect(authHeader).toContain("oauth_signature=");
  });

  test("writeCapabilities declared", () => {
    expect(netsuiteProvider.writeCapabilities).toBeDefined();
    const slugs = netsuiteProvider.writeCapabilities!.map((c) => c.slug);
    expect(slugs).toContain("create_sales_order");
    expect(slugs).toContain("create_purchase_order");
    expect(slugs).toContain("create_invoice");
  });
});

// ── SAP Business One ──────────────────────────────────────

describe("SAP Business One connector", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("configSchema has host_url, company_db, username, password", () => {
    const keys = sapB1Provider.configSchema.map((f) => f.key);
    expect(keys).toContain("host_url");
    expect(keys).toContain("company_db");
    expect(keys).toContain("username");
    expect(keys).toContain("password");
    expect(keys).toHaveLength(4);
  });

  test("testConnection calls /Login with credentials", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ SessionId: "sess-123" }), { status: 200 }),
    );

    const config = {
      host_url: "https://sap-server:50000",
      company_db: "TestDB",
      username: "admin",
      password: "secret",
    };

    const result = await sapB1Provider.testConnection(config);
    expect(result.ok).toBe(true);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://sap-server:50000/b1s/v1/Login");
    expect((init as any).method).toBe("POST");

    const body = JSON.parse((init as any).body as string);
    expect(body.CompanyDB).toBe("TestDB");
    expect(body.UserName).toBe("admin");
    expect(body.Password).toBe("secret");
  });

  test("session refresh when expired", async () => {
    let loginCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/Login")) {
        loginCalls++;
        return new Response(
          JSON.stringify({ SessionId: `sess-${loginCalls}` }),
          { status: 200 },
        );
      }
      // Any data endpoint
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    });

    const config = {
      host_url: "https://sap-server:50000",
      company_db: "TestDB",
      username: "admin",
      password: "secret",
      // Expired session
      session_id: "old-session",
      session_expiry: Date.now() - 1000,
    };

    await collectEvents(sapB1Provider.sync(config), 5);

    // Should have logged in again since session was expired
    expect(loginCalls).toBeGreaterThanOrEqual(1);
    expect(config.session_id).toMatch(/^sess-/);
  });

  test("sync yields correct event types", async () => {
    let loginDone = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();

      if (urlStr.includes("/Login")) {
        loginDone = true;
        return new Response(JSON.stringify({ SessionId: "s1" }), { status: 200 });
      }
      if (urlStr.includes("/BusinessPartners") && urlStr.includes("cCustomer")) {
        return new Response(
          JSON.stringify({ value: [{ CardCode: "C001", CardName: "Customer A", EmailAddress: "c@test.com", Phone1: "123" }] }),
          { status: 200 },
        );
      }
      if (urlStr.includes("/BusinessPartners") && urlStr.includes("cSupplier")) {
        return new Response(
          JSON.stringify({ value: [{ CardCode: "S001", CardName: "Supplier A" }] }),
          { status: 200 },
        );
      }
      if (urlStr.includes("/Orders")) {
        return new Response(
          JSON.stringify({ value: [{ DocEntry: 1, DocNum: 100, DocTotal: 5000, DocCurrency: "EUR", DocumentStatus: "open", DocDate: "2026-03-01", CardName: "Customer A" }] }),
          { status: 200 },
        );
      }
      if (urlStr.includes("/PurchaseOrders")) {
        return new Response(
          JSON.stringify({ value: [{ DocEntry: 2, DocNum: 200, DocTotal: 3000, DocCurrency: "EUR", DocumentStatus: "open", DocDate: "2026-03-01", CardName: "Supplier A" }] }),
          { status: 200 },
        );
      }
      if (urlStr.includes("/Invoices")) {
        return new Response(
          JSON.stringify({ value: [{ DocEntry: 3, DocNum: 300, DocTotal: 2000, PaidToDate: 2000, DocCurrency: "EUR", DocumentStatus: "closed", DocDueDate: "2026-04-01" }] }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    });

    const config = {
      host_url: "https://sap-server:50000",
      company_db: "TestDB",
      username: "admin",
      password: "secret",
    };

    const events = await collectEvents(sapB1Provider.sync(config));
    const types = events
      .filter((e) => e.kind === "event")
      .map((e) => e.data.eventType);

    expect(types).toContain("contact.synced");
    expect(types).toContain("sales-order.synced");
    expect(types).toContain("purchase-order.synced");
    expect(types).toContain("invoice.created");
    expect(types).toContain("invoice.paid");
  });

  test("writeCapabilities declared", () => {
    expect(sapB1Provider.writeCapabilities).toBeDefined();
    const slugs = sapB1Provider.writeCapabilities!.map((c) => c.slug);
    expect(slugs).toContain("create_order");
    expect(slugs).toContain("create_purchase_order");
  });
});
