import { describe, test, expect, vi, beforeEach } from "vitest";
import { dineroProvider } from "@/lib/connectors/dinero-provider";
import { pleoProvider } from "@/lib/connectors/pleo-provider";

// ── Dinero Tests ─────────────────────────────────────────

describe("Dinero connector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("configSchema has api_key and organization_id", () => {
    const keys = dineroProvider.configSchema.map((f) => f.key);
    expect(keys).toContain("api_key");
    expect(keys).toContain("organization_id");
    expect(
      dineroProvider.configSchema.find((f) => f.key === "api_key")?.type,
    ).toBe("password");
    expect(
      dineroProvider.configSchema.find((f) => f.key === "organization_id")
        ?.type,
    ).toBe("text");
  });

  test("testConnection calls correct endpoint with Bearer auth", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const config = { api_key: "test-key", organization_id: "org-123" };
    const result = await dineroProvider.testConnection(config);

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      "https://api.dinero.dk/v1/org-123/contacts?page=0&pageSize=1",
    );
    expect((init as any).headers.Authorization).toBe("Bearer test-key");
  });

  test("sync yields contact.synced", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          Collection: [
            {
              ContactGuid: "c1",
              Name: "Acme ApS",
              Email: "info@acme.dk",
              Phone: "12345678",
              VatNumber: "DK12345678",
            },
          ],
          Pagination: { PageCount: 1 },
        }),
        { status: 200 },
      ),
    );

    const config = { api_key: "k", organization_id: "org" };
    const events: any[] = [];
    for await (const ev of dineroProvider.sync(config)) {
      events.push(ev);
      break; // only first page of contacts
    }

    expect(events.length).toBeGreaterThanOrEqual(1);
    const contact = events.find(
      (e) => e.kind === "event" && e.data.eventType === "contact.synced",
    );
    expect(contact).toBeDefined();
    expect(contact.data.payload.name).toBe("Acme ApS");
    expect(contact.data.payload.email).toBe("info@acme.dk");
  });

  test("sync yields invoice.created + invoice.paid for zero-balance", async () => {
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();

      // First call: contacts (empty)
      if (urlStr.includes("/contacts")) {
        return new Response(
          JSON.stringify({
            Collection: [],
            Pagination: { PageCount: 1 },
          }),
          { status: 200 },
        );
      }
      // Second call: invoices
      if (urlStr.includes("/invoices")) {
        callCount++;
        if (callCount === 1) {
          return new Response(
            JSON.stringify({
              Collection: [
                {
                  Id: "inv-1",
                  Number: "1001",
                  TotalInclVat: 5000,
                  Balance: 0,
                  DueDate: "2026-02-01",
                },
              ],
              Pagination: { PageCount: 1 },
            }),
            { status: 200 },
          );
        }
      }
      // Products (empty)
      return new Response(
        JSON.stringify({
          Collection: [],
          Pagination: { PageCount: 1 },
        }),
        { status: 200 },
      );
    });

    const config = { api_key: "k", organization_id: "org" };
    const events: any[] = [];
    for await (const ev of dineroProvider.sync(config)) {
      events.push(ev);
    }

    const invoiceCreated = events.find(
      (e) => e.kind === "event" && e.data.eventType === "invoice.created",
    );
    expect(invoiceCreated).toBeDefined();
    expect(invoiceCreated.data.payload.status).toBe("paid");

    const invoicePaid = events.find(
      (e) => e.kind === "event" && e.data.eventType === "invoice.paid",
    );
    expect(invoicePaid).toBeDefined();
    expect(invoicePaid.data.payload.amount_paid).toBe(5000);
  });

  test("writeCapabilities declared", () => {
    expect(dineroProvider.writeCapabilities).toBeDefined();
    const slugs = dineroProvider.writeCapabilities!.map((c) => c.slug);
    expect(slugs).toContain("create_invoice_draft");
    expect(slugs).toContain("create_contact");
  });

  test("pagination follows PageCount", async () => {
    let page = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/contacts")) {
        const currentPage = page++;
        return new Response(
          JSON.stringify({
            Collection:
              currentPage < 2
                ? [{ ContactGuid: `c-${currentPage}`, Name: `Contact ${currentPage}` }]
                : [],
            Pagination: { PageCount: 2 },
          }),
          { status: 200 },
        );
      }
      // invoices + products empty
      return new Response(
        JSON.stringify({ Collection: [], Pagination: { PageCount: 1 } }),
        { status: 200 },
      );
    });

    const config = { api_key: "k", organization_id: "org" };
    const events: any[] = [];
    for await (const ev of dineroProvider.sync(config)) {
      events.push(ev);
    }

    const contacts = events.filter(
      (e) => e.kind === "event" && e.data.eventType === "contact.synced",
    );
    expect(contacts).toHaveLength(2);
  });
});

// ── Pleo Tests ───────────────────────────────────────────

describe("Pleo connector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("configSchema has api_key", () => {
    const keys = pleoProvider.configSchema.map((f) => f.key);
    expect(keys).toContain("api_key");
    expect(keys).toHaveLength(1);
    expect(
      pleoProvider.configSchema.find((f) => f.key === "api_key")?.type,
    ).toBe("password");
  });

  test("sync yields expense.synced with correct fields", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/export/expenses")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "exp-1",
                amount: 299.5,
                currency: "DKK",
                merchantName: "Joe & The Juice",
                category: "meals",
                status: "approved",
                date: "2026-03-15",
                memberName: "Jonas K",
                receiptImageUrl: "https://pleo.io/receipts/exp-1.png",
              },
            ],
            pagination: { has_more: false },
          }),
          { status: 200 },
        );
      }
      // members empty
      return new Response(
        JSON.stringify({ data: [], pagination: { has_more: false } }),
        { status: 200 },
      );
    });

    const config = { api_key: "k" };
    const events: any[] = [];
    for await (const ev of pleoProvider.sync(config)) {
      events.push(ev);
    }

    const expense = events.find(
      (e) => e.kind === "event" && e.data.eventType === "expense.synced",
    );
    expect(expense).toBeDefined();
    expect(expense.data.payload.merchant).toBe("Joe & The Juice");
    expect(expense.data.payload.amount).toBe(299.5);
    expect(expense.data.payload.employee).toBe("Jonas K");
    expect(expense.data.payload.receiptUrl).toBe(
      "https://pleo.io/receipts/exp-1.png",
    );
  });

  test("sync yields contact.synced for team members", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/export/expenses")) {
        return new Response(
          JSON.stringify({ data: [], pagination: { has_more: false } }),
          { status: 200 },
        );
      }
      if (urlStr.includes("/members")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "m-1",
                firstName: "Jonas",
                lastName: "Krüger",
                email: "jonas@example.com",
                phone: "+4512345678",
              },
            ],
            pagination: { has_more: false },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ data: [], pagination: { has_more: false } }),
        { status: 200 },
      );
    });

    const config = { api_key: "k" };
    const events: any[] = [];
    for await (const ev of pleoProvider.sync(config)) {
      events.push(ev);
    }

    const contact = events.find(
      (e) => e.kind === "event" && e.data.eventType === "contact.synced",
    );
    expect(contact).toBeDefined();
    expect(contact.data.payload.firstname).toBe("Jonas");
    expect(contact.data.payload.email).toBe("jonas@example.com");
  });

  test("executeAction returns read-only error", async () => {
    const config = { api_key: "k" };
    const result = await pleoProvider.executeAction!(config, "anything", {});
    expect(result.success).toBe(false);
    expect(result.error).toBe("Pleo connector is read-only");
  });

  test("cursor pagination follows has_more", async () => {
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/export/expenses")) {
        callCount++;
        if (callCount === 1) {
          return new Response(
            JSON.stringify({
              data: [{ id: "exp-1", amount: 100, merchantName: "Store A" }],
              pagination: { has_more: true, after: "cursor-1" },
            }),
            { status: 200 },
          );
        }
        // Verify cursor is passed
        expect(urlStr).toContain("after=cursor-1");
        return new Response(
          JSON.stringify({
            data: [{ id: "exp-2", amount: 200, merchantName: "Store B" }],
            pagination: { has_more: false },
          }),
          { status: 200 },
        );
      }
      // members empty
      return new Response(
        JSON.stringify({ data: [], pagination: { has_more: false } }),
        { status: 200 },
      );
    });

    const config = { api_key: "k" };
    const events: any[] = [];
    for await (const ev of pleoProvider.sync(config)) {
      events.push(ev);
    }

    const expenses = events.filter(
      (e) => e.kind === "event" && e.data.eventType === "expense.synced",
    );
    expect(expenses).toHaveLength(2);
  });
});
