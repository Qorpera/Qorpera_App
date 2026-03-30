import { describe, test, expect, vi, beforeEach } from "vitest";
import { woocommerceProvider } from "@/lib/connectors/woocommerce-provider";

function wooResponse(items: any[], totalPages = 1): Response {
  const resp = new Response(JSON.stringify(items), { status: 200 });
  // Headers must be set via the Response constructor's headers option
  return new Response(JSON.stringify(items), {
    status: 200,
    headers: { "x-wp-totalpages": String(totalPages) },
  });
}

async function collectEvents(gen: AsyncGenerator<any>, max = 50): Promise<any[]> {
  const events: any[] = [];
  for await (const ev of gen) {
    events.push(ev);
    if (events.length >= max) break;
  }
  return events;
}

const CONFIG = {
  store_url: "https://mystore.com",
  consumer_key: "ck_test123",
  consumer_secret: "cs_secret456",
};

describe("WooCommerce connector", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("configSchema has store_url, consumer_key, consumer_secret", () => {
    const keys = woocommerceProvider.configSchema.map((f) => f.key);
    expect(keys).toContain("store_url");
    expect(keys).toContain("consumer_key");
    expect(keys).toContain("consumer_secret");
    expect(keys).toHaveLength(3);
  });

  test("testConnection calls /products with Basic Auth", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      wooResponse([]),
    );

    const result = await woocommerceProvider.testConnection(CONFIG);
    expect(result.ok).toBe(true);

    const [url, init] = fetchSpy.mock.calls[0];
    const urlStr = typeof url === "string" ? url : url.toString();
    expect(urlStr).toContain("mystore.com/wp-json/wc/v3/products");

    const authHeader = (init as any).headers.Authorization as string;
    expect(authHeader).toMatch(/^Basic /);
  });

  test("sync yields contact.synced for customers", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/customers")) {
        return wooResponse([
          { id: 1, first_name: "Alice", last_name: "Smith", email: "alice@test.com", billing: { phone: "123" } },
        ]);
      }
      return wooResponse([]);
    });

    const events = await collectEvents(woocommerceProvider.sync(CONFIG));
    const contact = events.find(
      (e) => e.kind === "event" && e.data.eventType === "contact.synced",
    );
    expect(contact).toBeDefined();
    expect(contact.data.payload.firstname).toBe("Alice");
    expect(contact.data.payload.email).toBe("alice@test.com");
  });

  test("sync yields order.synced for orders", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/orders") && !urlStr.includes("/notes")) {
        return wooResponse([
          { id: 101, number: "1001", total: "99.50", currency: "USD", status: "processing", line_items: [{}], date_created: "2026-03-20", billing: { first_name: "Bob", last_name: "Jones" } },
        ]);
      }
      return wooResponse([]);
    });

    const events = await collectEvents(woocommerceProvider.sync(CONFIG));
    const order = events.find(
      (e) => e.kind === "event" && e.data.eventType === "order.synced",
    );
    expect(order).toBeDefined();
    expect(order.data.payload.order_number).toBe("1001");
    expect(order.data.payload.total).toBe("99.50");
  });

  test("sync yields invoice.created derived from orders (paid when completed)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/orders") && !urlStr.includes("/notes")) {
        return wooResponse([
          { id: 201, number: "2001", total: "150.00", currency: "EUR", status: "completed", line_items: [], date_created: "2026-03-20" },
        ]);
      }
      return wooResponse([]);
    });

    const events = await collectEvents(woocommerceProvider.sync(CONFIG));

    const invoice = events.find(
      (e) => e.kind === "event" && e.data.eventType === "invoice.created",
    );
    expect(invoice).toBeDefined();
    expect(invoice.data.payload.status).toBe("paid");
    expect(invoice.data.payload.amount_due).toBe(0);

    const invoicePaid = events.find(
      (e) => e.kind === "event" && e.data.eventType === "invoice.paid",
    );
    expect(invoicePaid).toBeDefined();
  });

  test("sync yields product.synced", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/products") && urlStr.includes("per_page=100")) {
        return wooResponse([
          { id: 301, name: "Widget", sku: "WDG-001", regular_price: "29.99", status: "publish", categories: [{ name: "Gadgets" }] },
        ]);
      }
      return wooResponse([]);
    });

    const events = await collectEvents(woocommerceProvider.sync(CONFIG));
    const product = events.find(
      (e) => e.kind === "event" && e.data.eventType === "product.synced",
    );
    expect(product).toBeDefined();
    expect(product.data.payload.name).toBe("Widget");
    expect(product.data.payload.sku).toBe("WDG-001");
    expect(product.data.payload.category).toBe("Gadgets");
  });

  test("writeCapabilities declared with correct slugs", () => {
    expect(woocommerceProvider.writeCapabilities).toBeDefined();
    const slugs = woocommerceProvider.writeCapabilities!.map((c) => c.slug);
    expect(slugs).toContain("create_order");
    expect(slugs).toContain("update_order_status");
    expect(slugs).toContain("create_product");
  });

  test("executeAction update_order_status calls PUT to correct URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ id: 101, status: "completed" }), { status: 200 }),
    );

    const result = await woocommerceProvider.executeAction!(CONFIG, "update_order_status", {
      orderId: 101,
      status: "completed",
    });

    expect(result.success).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0];
    const urlStr = typeof url === "string" ? url : url.toString();
    expect(urlStr).toContain("/orders/101");
    expect((init as any).method).toBe("PUT");
    const body = JSON.parse((init as any).body as string);
    expect(body.status).toBe("completed");
  });

  test("pagination respects X-WP-TotalPages header", async () => {
    let page = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/customers")) {
        page++;
        if (page <= 2) {
          return wooResponse(
            [{ id: page, first_name: `C${page}`, last_name: "Test", email: `c${page}@test.com` }],
            2,
          );
        }
        return wooResponse([], 2);
      }
      return wooResponse([]);
    });

    const events = await collectEvents(woocommerceProvider.sync(CONFIG));
    const contacts = events.filter(
      (e) => e.kind === "event" && e.data.eventType === "contact.synced",
    );
    expect(contacts).toHaveLength(2);
  });

  test("Basic Auth header correctly constructed", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      wooResponse([]),
    );

    await woocommerceProvider.testConnection(CONFIG);

    const [, init] = fetchSpy.mock.calls[0];
    const authHeader = (init as any).headers.Authorization as string;
    const expected = "Basic " + Buffer.from("ck_test123:cs_secret456").toString("base64");
    expect(authHeader).toBe(expected);
  });
});
