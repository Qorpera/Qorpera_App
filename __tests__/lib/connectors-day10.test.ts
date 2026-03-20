import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock db before imports
vi.mock("@/lib/db", () => ({ prisma: {} }));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Set env vars for providers
process.env.ECONOMIC_APP_SECRET_TOKEN = "test-app-secret";
process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "test-dev-token";
process.env.GOOGLE_ADS_MANAGER_ACCOUNT_ID = "1234567890";

import { economicProvider } from "@/lib/connectors/economic-provider";
import { googleAdsProvider } from "@/lib/connectors/google-ads-provider";
import { shopifyProvider } from "@/lib/connectors/shopify-provider";
import { linkedinProvider } from "@/lib/connectors/linkedin-provider";
import { metaAdsProvider } from "@/lib/connectors/meta-ads-provider";
import { HARDCODED_TYPE_DEFS } from "@/lib/hardcoded-type-defs";

beforeEach(() => {
  mockFetch.mockReset();
});

// ── e-conomic provider ─────────────────────────────────────────────────────

describe("e-conomic provider", () => {
  const config = { grant_token: "test-grant-token" };

  test("configSchema has grant_token field", () => {
    const field = economicProvider.configSchema.find((f) => f.key === "grant_token");
    expect(field).toBeDefined();
    expect(field!.type).toBe("password");
    expect(field!.required).toBe(true);
  });

  test("testConnection calls /self with correct headers", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ agreementNumber: 12345, companyName: "Test Co" }),
    });

    const result = await economicProvider.testConnection(config);
    expect(result.ok).toBe(true);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://restapi.e-conomic.com/self",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-AppSecretToken": "test-app-secret",
          "X-AgreementGrantToken": "test-grant-token",
          "Content-Type": "application/json",
        }),
      })
    );
  });

  test("sync yields customer events with contact entity mapping", async () => {
    mockFetch
      // Customers page
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          collection: [
            {
              customerNumber: 101,
              name: "Acme Corp",
              email: "info@acme.com",
              telephoneAndFaxNumber: "+4512345678",
              currency: "DKK",
              balance: 5000,
              corporateIdentificationNumber: "DK12345678",
            },
          ],
          pagination: { lastPage: true },
        }),
      })
      // Invoices page
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      })
      // Products page
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      })
      // Accounts page
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      });

    const yields: any[] = [];
    for await (const item of economicProvider.sync(config)) {
      yields.push(item);
    }

    // Should yield customer.synced event + activity signal
    const customerEvent = yields.find(
      (y) => y.kind === "event" && y.data.eventType === "customer.synced"
    );
    expect(customerEvent).toBeDefined();
    expect(customerEvent.data.payload.id).toBe(101);
    expect(customerEvent.data.payload.name).toBe("Acme Corp");
    expect(customerEvent.data.payload.email).toBe("info@acme.com");

    const activitySignal = yields.find(
      (y) => y.kind === "activity" && y.data.signalType === "erp_customer_synced"
    );
    expect(activitySignal).toBeDefined();
  });

  test("sync yields booked invoice events", async () => {
    mockFetch
      // Customers
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      })
      // Invoices
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          collection: [
            {
              bookedInvoiceNumber: 1001,
              grossAmount: 15000,
              remainder: 15000,
              dueDate: "2027-01-15",
              currency: "DKK",
              customer: { customerNumber: 101 },
            },
          ],
          pagination: { lastPage: true },
        }),
      })
      // Products
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      })
      // Accounts
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      });

    const yields: any[] = [];
    for await (const item of economicProvider.sync(config)) {
      yields.push(item);
    }

    const invoiceEvent = yields.find(
      (y) => y.kind === "event" && y.data.eventType === "invoice.created"
    );
    expect(invoiceEvent).toBeDefined();
    expect(invoiceEvent.data.payload.id).toBe(1001);
    expect(invoiceEvent.data.payload.total).toBe(15000);
    expect(invoiceEvent.data.payload.status).toBe("open");

    // Should also yield association
    const assocEvent = yields.find(
      (y) => y.kind === "event" && y.data.eventType === "association.found"
    );
    expect(assocEvent).toBeDefined();
    expect(assocEvent.data.payload.fromExternalId).toBe("101");
  });

  test("sync yields overdue invoice events for past-due invoices", async () => {
    const pastDate = "2020-01-01";

    mockFetch
      // Customers
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      })
      // Invoices — one overdue
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          collection: [
            {
              bookedInvoiceNumber: 1002,
              grossAmount: 8000,
              remainder: 8000,
              dueDate: pastDate,
              currency: "DKK",
              customer: { customerNumber: 102 },
            },
          ],
          pagination: { lastPage: true },
        }),
      })
      // Products
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      })
      // Accounts
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      });

    const yields: any[] = [];
    for await (const item of economicProvider.sync(config)) {
      yields.push(item);
    }

    const overdueEvent = yields.find(
      (y) => y.kind === "event" && y.data.eventType === "invoice.overdue"
    );
    expect(overdueEvent).toBeDefined();
    expect(overdueEvent.data.payload.id).toBe(1002);
    expect(overdueEvent.data.payload.status).toBe("overdue");
  });

  test("sync yields product events", async () => {
    mockFetch
      // Customers
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      })
      // Invoices
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      })
      // Products
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          collection: [
            {
              productNumber: "P001",
              name: "Widget A",
              salesPrice: 299.95,
              barred: false,
              productGroup: { name: "Widgets" },
            },
          ],
          pagination: { lastPage: true },
        }),
      })
      // Accounts
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      });

    const yields: any[] = [];
    for await (const item of economicProvider.sync(config)) {
      yields.push(item);
    }

    const productEvent = yields.find(
      (y) => y.kind === "event" && y.data.eventType === "product.synced"
    );
    expect(productEvent).toBeDefined();
    expect(productEvent.data.payload.id).toBe("P001");
    expect(productEvent.data.payload.name).toBe("Widget A");
    expect(productEvent.data.payload.price).toBe(299.95);
    expect(productEvent.data.payload.status).toBe("active");
    expect(productEvent.data.payload.category).toBe("Widgets");
  });

  test("sync yields chart of accounts as content", async () => {
    mockFetch
      // Customers
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      })
      // Invoices
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      })
      // Products
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      })
      // Accounts
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          collection: [
            { accountNumber: 1000, name: "Cash", accountType: "status" },
            { accountNumber: 2000, name: "Revenue", accountType: "profitAndLoss" },
          ],
          pagination: { lastPage: true },
        }),
      });

    const yields: any[] = [];
    for await (const item of economicProvider.sync(config)) {
      yields.push(item);
    }

    const contentYield = yields.find((y) => y.kind === "content");
    expect(contentYield).toBeDefined();
    expect(contentYield.data.sourceType).toBe("erp_chart_of_accounts");
    expect(contentYield.data.sourceId).toBe("economic-accounts");
    expect(contentYield.data.metadata.accountCount).toBe(2);

    const parsed = JSON.parse(contentYield.data.content);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe("Cash");
  });

  test("sync uses since filter on invoices when provided", async () => {
    const since = new Date("2025-06-15T00:00:00Z");

    mockFetch
      // Customers
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      })
      // Invoices — check URL includes filter
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      })
      // Products
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      })
      // Accounts
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      });

    const yields: any[] = [];
    for await (const item of economicProvider.sync(config, since)) {
      yields.push(item);
    }

    // Check that the invoice fetch URL included the since filter
    const invoiceCall = mockFetch.mock.calls.find((call: any) =>
      call[0].includes("/invoices/booked")
    );
    expect(invoiceCall).toBeDefined();
    expect(invoiceCall![0]).toContain("filter=date$gte:2025-06-15");
  });

  test("sync paginates correctly", async () => {
    mockFetch
      // Customers page 1
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          collection: [{ customerNumber: 1, name: "C1", email: "c1@test.com" }],
          pagination: { lastPage: false },
        }),
      })
      // Customers page 2
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          collection: [{ customerNumber: 2, name: "C2", email: "c2@test.com" }],
          pagination: { lastPage: true },
        }),
      })
      // Invoices
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      })
      // Products
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      })
      // Accounts
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ collection: [], pagination: { lastPage: true } }),
      });

    const yields: any[] = [];
    for await (const item of economicProvider.sync(config)) {
      yields.push(item);
    }

    const customerEvents = yields.filter(
      (y) => y.kind === "event" && y.data.eventType === "customer.synced"
    );
    expect(customerEvents).toHaveLength(2);
    expect(customerEvents[0].data.payload.id).toBe(1);
    expect(customerEvents[1].data.payload.id).toBe(2);

    // Check pagination URL params
    const firstCall = mockFetch.mock.calls[0][0];
    expect(firstCall).toContain("skipPages=0");
    const secondCall = mockFetch.mock.calls[1][0];
    expect(secondCall).toContain("skipPages=1");
  });
});

// ── New entity type definitions ─────────────────────────────────────────────

describe("new entity type definitions", () => {
  test("product entity type has correct properties", () => {
    const product = HARDCODED_TYPE_DEFS["product"];
    expect(product).toBeDefined();
    expect(product.slug).toBe("product");
    expect(product.defaultCategory).toBe("digital");
    const slugs = product.properties.map((p) => p.slug);
    expect(slugs).toContain("sku");
    expect(slugs).toContain("price");
    expect(slugs).toContain("currency");
    expect(slugs).toContain("status");
    expect(slugs).toContain("category");
    expect(slugs).toContain("inventory-count");
  });

  test("order entity type has correct properties", () => {
    const order = HARDCODED_TYPE_DEFS["order"];
    expect(order).toBeDefined();
    expect(order.slug).toBe("order");
    expect(order.defaultCategory).toBe("digital");
    const slugs = order.properties.map((p) => p.slug);
    expect(slugs).toContain("order-number");
    expect(slugs).toContain("total");
    expect(slugs).toContain("currency");
    expect(slugs).toContain("status");
    expect(slugs).toContain("fulfillment-status");
    expect(slugs).toContain("item-count");
    expect(slugs).toContain("order-date");
  });

  test("campaign entity type has correct properties", () => {
    const campaign = HARDCODED_TYPE_DEFS["campaign"];
    expect(campaign).toBeDefined();
    expect(campaign.slug).toBe("campaign");
    expect(campaign.defaultCategory).toBe("digital");
    const slugs = campaign.properties.map((p) => p.slug);
    expect(slugs).toContain("platform");
    expect(slugs).toContain("status");
    expect(slugs).toContain("budget");
    expect(slugs).toContain("spend");
    expect(slugs).toContain("impressions");
    expect(slugs).toContain("clicks");
    expect(slugs).toContain("conversions");
    expect(slugs).toContain("ctr");
    expect(slugs).toContain("start-date");
    expect(slugs).toContain("end-date");
  });
});

// ── Event materializer rules ────────────────────────────────────────────────

describe("event materializer rules", () => {
  test("product.synced maps to product entity type", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const content = readFileSync(
      resolve(__dirname, "../../src/lib/event-materializer.ts"),
      "utf8"
    );
    expect(content).toContain('"product.synced"');
    expect(content).toContain('entityTypeSlug: "product"');
  });
});

// ── Google Ads provider ─────────────────────────────────────────────────────

describe("google-ads provider", () => {
  const config = {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
    customer_id: "1234567890",
  };

  test("configSchema has oauth field", () => {
    const field = googleAdsProvider.configSchema.find((f) => f.key === "oauth");
    expect(field).toBeDefined();
    expect(field!.type).toBe("oauth");
    expect(field!.required).toBe(true);
  });

  test("sync yields campaign events with campaign entity mapping", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([
        {
          results: [
            {
              campaign: {
                id: "111",
                name: "Spring Sale",
                status: "ENABLED",
                startDate: "2025-03-01",
                endDate: "2025-04-01",
                campaignBudget: "campaigns/111/budgets/222",
              },
              metrics: {
                impressions: 50000,
                clicks: 2500,
                conversions: 150,
                costMicros: 75000000,
                ctr: 0.05,
              },
            },
          ],
        },
      ]),
    });

    const yields: any[] = [];
    for await (const item of googleAdsProvider.sync(config)) {
      yields.push(item);
    }

    const campaignEvent = yields.find(
      (y) => y.kind === "event" && y.data.eventType === "campaign.synced"
    );
    expect(campaignEvent).toBeDefined();
    expect(campaignEvent.data.payload.id).toBe("111");
    expect(campaignEvent.data.payload.name).toBe("Spring Sale");
    expect(campaignEvent.data.payload.platform).toBe("google_ads");
    expect(campaignEvent.data.payload.spend).toBe(75);
    expect(campaignEvent.data.payload.impressions).toBe(50000);
    expect(campaignEvent.data.payload.clicks).toBe(2500);
    expect(campaignEvent.data.payload.conversions).toBe(150);
  });

  test("sync yields performance summary as content", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([
        {
          results: [
            {
              campaign: { id: "111", name: "Campaign A", status: "ENABLED" },
              metrics: { impressions: 10000, clicks: 500, conversions: 50, costMicros: 25000000, ctr: 0.05 },
            },
            {
              campaign: { id: "222", name: "Campaign B", status: "ENABLED" },
              metrics: { impressions: 20000, clicks: 1000, conversions: 100, costMicros: 50000000, ctr: 0.05 },
            },
          ],
        },
      ]),
    });

    const yields: any[] = [];
    for await (const item of googleAdsProvider.sync(config)) {
      yields.push(item);
    }

    const contentYield = yields.find((y) => y.kind === "content");
    expect(contentYield).toBeDefined();
    expect(contentYield.data.sourceType).toBe("ads_performance_summary");
    expect(contentYield.data.sourceId).toBe("google-ads-summary");
    expect(contentYield.data.content).toContain("2 active campaigns");
    expect(contentYield.data.content).toContain("75.00 total spend");
    expect(contentYield.data.content).toContain("1500 clicks");
    expect(contentYield.data.metadata.platform).toBe("google_ads");
  });

  test("sync yields activity signals per campaign", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([
        {
          results: [
            {
              campaign: { id: "111", name: "C1", status: "ENABLED" },
              metrics: { impressions: 1000, clicks: 50, conversions: 5, costMicros: 5000000, ctr: 0.05 },
            },
            {
              campaign: { id: "222", name: "C2", status: "ENABLED" },
              metrics: { impressions: 2000, clicks: 100, conversions: 10, costMicros: 10000000, ctr: 0.05 },
            },
          ],
        },
      ]),
    });

    const yields: any[] = [];
    for await (const item of googleAdsProvider.sync(config)) {
      yields.push(item);
    }

    const activitySignals = yields.filter(
      (y) => y.kind === "activity" && y.data.signalType === "campaign_synced"
    );
    expect(activitySignals).toHaveLength(2);
    expect(activitySignals[0].data.metadata.platform).toBe("google_ads");
    expect(activitySignals[1].data.metadata.platform).toBe("google_ads");
  });

  test("campaign.synced materializer maps to campaign entity type", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const content = readFileSync(
      resolve(__dirname, "../../src/lib/event-materializer.ts"),
      "utf8"
    );
    expect(content).toContain('"campaign.synced"');
    expect(content).toContain('entityTypeSlug: "campaign"');
  });
});

// ── Shopify provider ────────────────────────────────────────────────────────

describe("shopify provider", () => {
  const config = {
    store_domain: "teststore.myshopify.com",
    access_token: "shpat_test123",
  };

  test("configSchema has store_domain text field and oauth field", () => {
    const domainField = shopifyProvider.configSchema.find((f) => f.key === "store_domain");
    expect(domainField).toBeDefined();
    expect(domainField!.type).toBe("text");
    expect(domainField!.required).toBe(true);

    const oauthField = shopifyProvider.configSchema.find((f) => f.key === "oauth");
    expect(oauthField).toBeDefined();
    expect(oauthField!.type).toBe("oauth");
  });

  test("sync yields order events with order entity mapping", async () => {
    // Orders page
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        orders: [
          {
            id: 1001,
            order_number: 1001,
            name: "#1001",
            total_price: "99.99",
            currency: "USD",
            financial_status: "paid",
            fulfillment_status: "fulfilled",
            line_items: [{ id: 1 }, { id: 2 }],
            created_at: "2025-01-15T10:00:00Z",
            customer: { id: 501 },
            refunds: [],
          },
        ],
      }),
      headers: new Headers(),
    })
    // Products
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ products: [] }),
      headers: new Headers(),
    })
    // Customers
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ customers: [] }),
      headers: new Headers(),
    });

    const yields: any[] = [];
    for await (const item of shopifyProvider.sync(config)) {
      yields.push(item);
    }

    const orderEvent = yields.find(
      (y) => y.kind === "event" && y.data.eventType === "order.synced"
    );
    expect(orderEvent).toBeDefined();
    expect(orderEvent.data.payload.id).toBe(1001);
    expect(orderEvent.data.payload.name).toBe("#1001");
    expect(orderEvent.data.payload.total).toBe("99.99");
    expect(orderEvent.data.payload.item_count).toBe(2);
  });

  test("sync yields product events reusing product entity type", async () => {
    mockFetch
      // Orders
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orders: [] }),
        headers: new Headers(),
      })
      // Products
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          products: [
            {
              id: 2001,
              title: "Widget",
              status: "active",
              product_type: "Gadgets",
              variants: [{ sku: "WID-001", price: "29.99", inventory_quantity: 50 }],
            },
          ],
        }),
        headers: new Headers(),
      })
      // Customers
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ customers: [] }),
        headers: new Headers(),
      });

    const yields: any[] = [];
    for await (const item of shopifyProvider.sync(config)) {
      yields.push(item);
    }

    const productEvent = yields.find(
      (y) => y.kind === "event" && y.data.eventType === "product.synced"
    );
    expect(productEvent).toBeDefined();
    expect(productEvent.data.payload.name).toBe("Widget");
    expect(productEvent.data.payload.sku).toBe("WID-001");
  });

  test("sync yields customer events reusing contact entity type", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orders: [] }),
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ products: [] }),
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          customers: [
            { id: 501, first_name: "Jane", last_name: "Doe", email: "jane@test.com", phone: "+1234" },
          ],
        }),
        headers: new Headers(),
      });

    const yields: any[] = [];
    for await (const item of shopifyProvider.sync(config)) {
      yields.push(item);
    }

    const customerEvent = yields.find(
      (y) => y.kind === "event" && y.data.eventType === "customer.synced"
    );
    expect(customerEvent).toBeDefined();
    expect(customerEvent.data.payload.name).toBe("Jane Doe");
    expect(customerEvent.data.payload.email).toBe("jane@test.com");
  });

  test("sync yields refund activity signals", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          orders: [
            {
              id: 1002,
              order_number: 1002,
              name: "#1002",
              total_price: "50.00",
              currency: "USD",
              financial_status: "refunded",
              fulfillment_status: null,
              line_items: [{ id: 1 }],
              created_at: "2025-01-10T10:00:00Z",
              refunds: [
                {
                  created_at: "2025-01-12T10:00:00Z",
                  note: "Customer changed mind",
                  transactions: [{ amount: "50.00" }],
                },
              ],
            },
          ],
        }),
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ products: [] }),
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ customers: [] }),
        headers: new Headers(),
      });

    const yields: any[] = [];
    for await (const item of shopifyProvider.sync(config)) {
      yields.push(item);
    }

    const refundSignal = yields.find(
      (y) => y.kind === "activity" && y.data.signalType === "order_refunded"
    );
    expect(refundSignal).toBeDefined();
    expect(refundSignal.data.metadata.amount).toBe(50);
    expect(refundSignal.data.metadata.reason).toBe("Customer changed mind");
  });

  test("sync yields order-customer associations", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          orders: [
            {
              id: 1003,
              order_number: 1003,
              name: "#1003",
              total_price: "100.00",
              currency: "USD",
              financial_status: "paid",
              fulfillment_status: null,
              line_items: [{ id: 1 }],
              created_at: "2025-02-01T10:00:00Z",
              customer: { id: 601 },
              refunds: [],
            },
          ],
        }),
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ products: [] }),
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ customers: [] }),
        headers: new Headers(),
      });

    const yields: any[] = [];
    for await (const item of shopifyProvider.sync(config)) {
      yields.push(item);
    }

    const assocEvent = yields.find(
      (y) => y.kind === "event" && y.data.eventType === "association.found"
    );
    expect(assocEvent).toBeDefined();
    expect(assocEvent.data.payload.fromExternalId).toBe("601");
    expect(assocEvent.data.payload.toExternalId).toBe("1003");
    expect(assocEvent.data.payload.relationshipType).toBe("ordered");
  });

  test("order.synced materializer maps to order entity type", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const content = readFileSync(
      resolve(__dirname, "../../src/lib/event-materializer.ts"),
      "utf8"
    );
    expect(content).toContain('"order.synced"');
    expect(content).toContain('entityTypeSlug: "order"');
  });
});

// ── LinkedIn provider ───────────────────────────────────────────────────────

describe("linkedin provider", () => {
  const config = {
    access_token: "test-linkedin-token",
    organization_id: "12345",
  };

  test("configSchema has oauth field", () => {
    const field = linkedinProvider.configSchema.find((f) => f.key === "oauth");
    expect(field).toBeDefined();
    expect(field!.type).toBe("oauth");
  });

  test("sync yields page posts as content (no entity events)", async () => {
    // Posts
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        elements: [
          {
            id: "post-1",
            created: { time: Date.now(), actor: "urn:li:person:abc" },
            specificContent: {
              "com.linkedin.ugc.ShareContent": {
                shareCommentary: { text: "Excited to announce our new product!" },
              },
            },
          },
        ],
      }),
    })
    // Follower stats
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        elements: [
          { followerCounts: { organicFollowerCount: 5000, paidFollowerCount: 200 } },
        ],
      }),
    });

    const yields: any[] = [];
    for await (const item of linkedinProvider.sync(config)) {
      yields.push(item);
    }

    const contentYield = yields.find((y) => y.kind === "content");
    expect(contentYield).toBeDefined();
    expect(contentYield.data.sourceType).toBe("linkedin_post");
    expect(contentYield.data.content).toContain("new product");
  });

  test("sync yields follower stats as activity", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ elements: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          elements: [
            { followerCounts: { organicFollowerCount: 3000, paidFollowerCount: 500 } },
          ],
        }),
      });

    const yields: any[] = [];
    for await (const item of linkedinProvider.sync(config)) {
      yields.push(item);
    }

    const followerSignal = yields.find(
      (y) => y.kind === "activity" && y.data.signalType === "linkedin_follower_count"
    );
    expect(followerSignal).toBeDefined();
    expect(followerSignal.data.metadata.totalFollowers).toBe(3500);
  });

  test("no event yields (content + activity only)", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          elements: [
            {
              id: "post-2",
              created: { time: Date.now(), actor: "urn:li:person:xyz" },
              specificContent: {
                "com.linkedin.ugc.ShareContent": {
                  shareCommentary: { text: "Test post" },
                },
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ elements: [] }),
      });

    const yields: any[] = [];
    for await (const item of linkedinProvider.sync(config)) {
      yields.push(item);
    }

    const eventYields = yields.filter((y) => y.kind === "event");
    expect(eventYields).toHaveLength(0);
  });
});

// ── Meta Ads provider ───────────────────────────────────────────────────────

describe("meta-ads provider", () => {
  const config = {
    access_token: "test-meta-token",
    ad_account_id: "act_123456",
    ad_account_currency: "EUR",
  };

  test("configSchema has oauth field", () => {
    const field = metaAdsProvider.configSchema.find((f) => f.key === "oauth");
    expect(field).toBeDefined();
    expect(field!.type).toBe("oauth");
  });

  test("sync yields campaign events reusing campaign entity type", async () => {
    // Campaigns list
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "meta-c1",
            name: "Summer Promo",
            status: "ACTIVE",
            start_time: "2025-06-01",
            stop_time: "2025-08-31",
            daily_budget: "5000",
          },
        ],
      }),
    })
    // Insights for campaign
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { impressions: "80000", clicks: "3200", spend: "4500.50", conversions: "320", ctr: "0.04" },
        ],
      }),
    });

    const yields: any[] = [];
    for await (const item of metaAdsProvider.sync(config)) {
      yields.push(item);
    }

    const campaignEvent = yields.find(
      (y) => y.kind === "event" && y.data.eventType === "campaign.synced"
    );
    expect(campaignEvent).toBeDefined();
    expect(campaignEvent.data.payload.id).toBe("meta-c1");
    expect(campaignEvent.data.payload.name).toBe("Summer Promo");
    expect(campaignEvent.data.payload.spend).toBe(4500.50);
    expect(campaignEvent.data.payload.currency).toBe("EUR");
  });

  test("campaign platform property is meta_ads", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: "meta-c2", name: "Fall Sale", status: "ACTIVE", daily_budget: "3000" },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

    const yields: any[] = [];
    for await (const item of metaAdsProvider.sync(config)) {
      yields.push(item);
    }

    const campaignEvent = yields.find(
      (y) => y.kind === "event" && y.data.eventType === "campaign.synced"
    );
    expect(campaignEvent.data.payload.platform).toBe("meta_ads");
  });

  test("sync yields performance summary as content", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: "c1", name: "C1", status: "ACTIVE", daily_budget: "1000" },
            { id: "c2", name: "C2", status: "ACTIVE", daily_budget: "2000" },
          ],
        }),
      })
      // Insights for c1
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ impressions: "10000", clicks: "500", spend: "800", conversions: "50", ctr: "0.05" }],
        }),
      })
      // Insights for c2
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ impressions: "20000", clicks: "1000", spend: "1600", conversions: "100", ctr: "0.05" }],
        }),
      });

    const yields: any[] = [];
    for await (const item of metaAdsProvider.sync(config)) {
      yields.push(item);
    }

    const contentYield = yields.find((y) => y.kind === "content");
    expect(contentYield).toBeDefined();
    expect(contentYield.data.sourceType).toBe("ads_performance_summary");
    expect(contentYield.data.sourceId).toBe("meta-ads-summary");
    expect(contentYield.data.content).toContain("2 active campaigns");
    expect(contentYield.data.content).toContain("2400.00 total spend");
    expect(contentYield.data.metadata.platform).toBe("meta_ads");
  });
});
