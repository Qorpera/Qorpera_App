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
