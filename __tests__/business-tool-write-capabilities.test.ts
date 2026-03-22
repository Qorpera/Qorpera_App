import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({ prisma: {} }));

vi.mock("@/lib/connectors/hubspot-auth", () => ({
  getValidHubSpotToken: vi.fn().mockResolvedValue("mock-hubspot-token"),
}));

vi.mock("@/lib/connectors/stripe-auth", () => ({
  getValidStripeToken: vi.fn().mockResolvedValue("mock-stripe-token"),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Imports ──────────────────────────────────────────────────────────────────

import { hubspotProvider } from "@/lib/connectors/hubspot";
import { stripeProvider } from "@/lib/connectors/stripe";
import { economicProvider } from "@/lib/connectors/economic-provider";
import { shopifyProvider } from "@/lib/connectors/shopify-provider";

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════
// HubSpot
// ═══════════════════════════════════════════════════════════════════

describe("HubSpot writeCapabilities", () => {
  const slugs = (hubspotProvider.writeCapabilities || []).map((c) => c.slug);

  it.each([
    "update_contact", "create_note", "update_deal_stage", "send_email",
    "create_contact", "create_deal", "create_task", "complete_task",
    "log_activity", "add_note", "create_ticket",
  ])("includes %s", (slug) => {
    expect(slugs).toContain(slug);
  });
});

describe("HubSpot executeAction routing", () => {
  const config = { access_token: "t", refresh_token: "r", token_expiry: new Date(Date.now() + 3600000).toISOString() };

  it("routes unknown action to error", async () => {
    const result = await hubspotProvider.executeAction!(config, "nonexistent", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown action");
  });

  it.each([
    "create_contact", "create_deal", "create_task", "complete_task",
    "log_activity", "add_note", "create_ticket",
  ])("routes %s (not unknown)", async (slug) => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "error", json: async () => ({}) });
    const result = await hubspotProvider.executeAction!(config, slug, {});
    if (!result.success) expect(result.error).not.toContain("Unknown action");
  });
});

describe("HubSpot parameter validation", () => {
  const config = { access_token: "t", refresh_token: "r", token_expiry: new Date(Date.now() + 3600000).toISOString() };

  it("create_contact rejects missing email", async () => {
    const r = await hubspotProvider.executeAction!(config, "create_contact", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("email");
  });

  it("create_deal rejects missing name", async () => {
    const r = await hubspotProvider.executeAction!(config, "create_deal", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("name");
  });

  it("create_task rejects missing subject", async () => {
    const r = await hubspotProvider.executeAction!(config, "create_task", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("subject");
  });

  it("complete_task rejects missing taskId", async () => {
    const r = await hubspotProvider.executeAction!(config, "complete_task", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("taskId");
  });

  it("log_activity rejects missing type", async () => {
    const r = await hubspotProvider.executeAction!(config, "log_activity", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("type");
  });

  it("add_note rejects missing body", async () => {
    const r = await hubspotProvider.executeAction!(config, "add_note", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("body");
  });

  it("create_ticket rejects missing subject", async () => {
    const r = await hubspotProvider.executeAction!(config, "create_ticket", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("subject");
  });
});

describe("HubSpot duplicate contact check", () => {
  const config = { access_token: "t", refresh_token: "r", token_expiry: new Date(Date.now() + 3600000).toISOString() };

  it("rejects creation when email already exists", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ total: 1, results: [{ id: "existing-123", properties: { email: "dup@example.com" } }] }),
    });

    const r = await hubspotProvider.executeAction!(config, "create_contact", { email: "dup@example.com" });
    expect(r.success).toBe(false);
    expect(r.error).toContain("already exists");
    expect(r.error).toContain("existing-123");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Stripe
// ═══════════════════════════════════════════════════════════════════

describe("Stripe writeCapabilities", () => {
  const slugs = (stripeProvider.writeCapabilities || []).map((c) => c.slug);

  it.each([
    "send_invoice", "void_invoice",
    "create_invoice", "issue_refund", "update_subscription",
    "create_customer", "update_customer",
  ])("includes %s", (slug) => {
    expect(slugs).toContain(slug);
  });
});

describe("Stripe executeAction routing", () => {
  const config = { access_token: "t", refresh_token: "r", token_expiry: new Date(Date.now() + 3600000).toISOString() };

  it("routes unknown action to error", async () => {
    const r = await stripeProvider.executeAction!(config, "nonexistent", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("Unknown action");
  });

  it.each([
    "create_invoice", "issue_refund", "update_subscription",
    "create_customer", "update_customer",
  ])("routes %s (not unknown)", async (slug) => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "error", json: async () => ({}) });
    const r = await stripeProvider.executeAction!(config, slug, {});
    if (!r.success) expect(r.error).not.toContain("Unknown action");
  });
});

describe("Stripe parameter validation", () => {
  const config = { access_token: "t", refresh_token: "r", token_expiry: new Date(Date.now() + 3600000).toISOString() };

  it("create_invoice rejects missing customerId", async () => {
    const r = await stripeProvider.executeAction!(config, "create_invoice", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("customerId");
  });

  it("create_invoice rejects missing items", async () => {
    const r = await stripeProvider.executeAction!(config, "create_invoice", { customerId: "c1" });
    expect(r.success).toBe(false);
    expect(r.error).toContain("items");
  });

  it("issue_refund rejects missing paymentIntentId", async () => {
    const r = await stripeProvider.executeAction!(config, "issue_refund", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("paymentIntentId");
  });

  it("update_subscription rejects missing subscriptionId", async () => {
    const r = await stripeProvider.executeAction!(config, "update_subscription", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("subscriptionId");
  });

  it("create_customer rejects missing email", async () => {
    const r = await stripeProvider.executeAction!(config, "create_customer", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("email");
  });

  it("update_customer rejects missing customerId", async () => {
    const r = await stripeProvider.executeAction!(config, "update_customer", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("customerId");
  });
});

describe("Stripe duplicate customer check", () => {
  const config = { access_token: "t", refresh_token: "r", token_expiry: new Date(Date.now() + 3600000).toISOString() };

  it("returns existing customer when email already exists", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: "cus_existing", email: "dup@test.com" }] }),
    });

    const r = await stripeProvider.executeAction!(config, "create_customer", { email: "dup@test.com" });
    expect(r.success).toBe(true);
    expect((r.result as any)?.id || (r.result as any)?.customerId).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════
// e-conomic
// ═══════════════════════════════════════════════════════════════════

describe("e-conomic writeCapabilities", () => {
  const slugs = (economicProvider.writeCapabilities || []).map((c) => c.slug);

  it.each([
    "create_invoice_draft", "book_invoice", "create_credit_note",
    "create_customer", "update_customer", "record_manual_payment",
  ])("includes %s", (slug) => {
    expect(slugs).toContain(slug);
  });
});

describe("e-conomic executeAction routing", () => {
  const config = { grant_token: "test-grant" };

  // Set env var for e-conomic
  beforeEach(() => {
    process.env.ECONOMIC_APP_SECRET_TOKEN = "test-secret";
  });

  it("routes unknown action to error", async () => {
    const r = await economicProvider.executeAction!(config, "nonexistent", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("Unknown action");
  });

  it.each([
    "create_invoice_draft", "book_invoice", "create_credit_note",
    "create_customer", "update_customer", "record_manual_payment",
  ])("routes %s (not unknown)", async (slug) => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "error", json: async () => ({}) });
    const r = await economicProvider.executeAction!(config, slug, {});
    if (!r.success) expect(r.error).not.toContain("Unknown action");
  });
});

describe("e-conomic parameter validation", () => {
  const config = { grant_token: "test-grant" };

  beforeEach(() => {
    process.env.ECONOMIC_APP_SECRET_TOKEN = "test-secret";
  });

  it("create_invoice_draft rejects missing customerId", async () => {
    const r = await economicProvider.executeAction!(config, "create_invoice_draft", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("customerId");
  });

  it("book_invoice rejects missing draftInvoiceNumber", async () => {
    const r = await economicProvider.executeAction!(config, "book_invoice", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("draftInvoiceNumber");
  });

  it("create_customer rejects missing name", async () => {
    const r = await economicProvider.executeAction!(config, "create_customer", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("name");
  });

  it("update_customer rejects missing customerNumber", async () => {
    const r = await economicProvider.executeAction!(config, "update_customer", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("customerNumber");
  });

  it("record_manual_payment rejects missing invoiceNumber", async () => {
    const r = await economicProvider.executeAction!(config, "record_manual_payment", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("invoiceNumber");
  });
});

describe("e-conomic book_invoice is irreversible", () => {
  const config = { grant_token: "test-grant" };

  beforeEach(() => {
    process.env.ECONOMIC_APP_SECRET_TOKEN = "test-secret";
  });

  it("requires explicit draftInvoiceNumber to book", async () => {
    // Without number, it should fail validation
    const r = await economicProvider.executeAction!(config, "book_invoice", {});
    expect(r.success).toBe(false);

    // With number, it makes the API call (which we mock as success)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ bookedInvoiceNumber: 1001 }),
    });
    const r2 = await economicProvider.executeAction!(config, "book_invoice", { draftInvoiceNumber: 42 });
    expect(r2.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Shopify
// ═══════════════════════════════════════════════════════════════════

describe("Shopify writeCapabilities", () => {
  const slugs = (shopifyProvider.writeCapabilities || []).map((c) => c.slug);

  it.each([
    "update_product", "update_product_price", "update_inventory",
    "create_fulfillment", "cancel_order", "create_discount", "add_order_note",
  ])("includes %s", (slug) => {
    expect(slugs).toContain(slug);
  });
});

describe("Shopify executeAction routing", () => {
  const config = { store_domain: "test.myshopify.com", access_token: "shpat_test" };

  it("routes unknown action to error", async () => {
    const r = await shopifyProvider.executeAction!(config, "nonexistent", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("Unknown action");
  });

  it.each([
    "update_product", "update_product_price", "update_inventory",
    "create_fulfillment", "cancel_order", "create_discount", "add_order_note",
  ])("routes %s (not unknown)", async (slug) => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "error", json: async () => ({}) });
    const r = await shopifyProvider.executeAction!(config, slug, {});
    if (!r.success) expect(r.error).not.toContain("Unknown action");
  });
});

describe("Shopify parameter validation", () => {
  const config = { store_domain: "test.myshopify.com", access_token: "shpat_test" };

  it("update_product rejects missing productId", async () => {
    const r = await shopifyProvider.executeAction!(config, "update_product", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("productId");
  });

  it("update_product_price rejects missing variantId", async () => {
    const r = await shopifyProvider.executeAction!(config, "update_product_price", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("variantId");
  });

  it("update_product_price rejects missing price", async () => {
    const r = await shopifyProvider.executeAction!(config, "update_product_price", { variantId: "v1" });
    expect(r.success).toBe(false);
    expect(r.error).toContain("price");
  });

  it("update_inventory rejects missing inventoryItemId", async () => {
    const r = await shopifyProvider.executeAction!(config, "update_inventory", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("inventoryItemId");
  });

  it("create_fulfillment rejects missing orderId", async () => {
    const r = await shopifyProvider.executeAction!(config, "create_fulfillment", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("orderId");
  });

  it("cancel_order rejects missing orderId", async () => {
    const r = await shopifyProvider.executeAction!(config, "cancel_order", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("orderId");
  });

  it("create_discount rejects missing code", async () => {
    const r = await shopifyProvider.executeAction!(config, "create_discount", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("code");
  });

  it("add_order_note rejects missing orderId", async () => {
    const r = await shopifyProvider.executeAction!(config, "add_order_note", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("orderId");
  });
});
