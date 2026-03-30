import { describe, test, expect, vi, beforeEach } from "vitest";
import { xeroProvider } from "@/lib/connectors/xero-provider";
import { fortnoxProvider } from "@/lib/connectors/fortnox-provider";
import { vismanetProvider } from "@/lib/connectors/vismanet-provider";
import { exactOnlineProvider } from "@/lib/connectors/exact-online-provider";
import { sageProvider } from "@/lib/connectors/sage-provider";

// Helper: collect all events from a sync generator
async function collectEvents(
  gen: AsyncGenerator<any>,
  max = 50,
): Promise<any[]> {
  const events: any[] = [];
  for await (const ev of gen) {
    events.push(ev);
    if (events.length >= max) break;
  }
  return events;
}

// ── Xero ──────────────────────────────────────────────────

describe("Xero connector", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("configSchema is OAuth-only", () => {
    expect(xeroProvider.configSchema).toHaveLength(1);
    expect(xeroProvider.configSchema[0].type).toBe("oauth");
  });

  test("sync yields contact.synced", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          Contacts: [
            {
              ContactID: "c1",
              FirstName: "Alice",
              LastName: "Smith",
              EmailAddress: "alice@example.com",
              Phones: [{ PhoneType: "DEFAULT", PhoneNumber: "1234" }],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const config = {
      access_token: "tok",
      refresh_token: "ref",
      token_expiry: Date.now() + 3600000,
      tenant_id: "t1",
    };
    const events = await collectEvents(xeroProvider.sync(config));
    const contact = events.find(
      (e) => e.kind === "event" && e.data.eventType === "contact.synced",
    );
    expect(contact).toBeDefined();
    expect(contact.data.payload.email).toBe("alice@example.com");
  });

  test("sync yields invoice.created with paid status", async () => {
    let callNum = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callNum++;
      if (callNum === 1) {
        // Contacts empty
        return new Response(JSON.stringify({ Contacts: [] }), { status: 200 });
      }
      if (callNum === 2) {
        // Invoices
        return new Response(
          JSON.stringify({
            Invoices: [
              {
                InvoiceID: "i1",
                InvoiceNumber: "INV-001",
                AmountDue: 0,
                Total: 1000,
                Status: "PAID",
                DueDateString: "2026-04-01",
                CurrencyCode: "USD",
              },
            ],
          }),
          { status: 200 },
        );
      }
      // Items empty
      return new Response(JSON.stringify({ Items: [] }), { status: 200 });
    });

    const config = {
      access_token: "tok",
      refresh_token: "ref",
      token_expiry: Date.now() + 3600000,
      tenant_id: "t1",
    };
    const events = await collectEvents(xeroProvider.sync(config));
    const invoice = events.find(
      (e) => e.kind === "event" && e.data.eventType === "invoice.created",
    );
    expect(invoice).toBeDefined();
    expect(invoice.data.payload.status).toBe("paid");
  });

  test("writeCapabilities declared", () => {
    expect(xeroProvider.writeCapabilities).toBeDefined();
    const slugs = xeroProvider.writeCapabilities!.map((c) => c.slug);
    expect(slugs).toContain("create_invoice");
    expect(slugs).toContain("create_contact");
  });
});

// ── Fortnox ───────────────────────────────────────────────

describe("Fortnox connector", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("configSchema is OAuth-only", () => {
    expect(fortnoxProvider.configSchema).toHaveLength(1);
    expect(fortnoxProvider.configSchema[0].type).toBe("oauth");
  });

  test("sync yields contact.synced", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          Customers: [
            { CustomerNumber: "1001", Name: "Acme AB", Email: "info@acme.se", Phone: "08-123456" },
          ],
          MetaInformation: { "@TotalPages": 1 },
        }),
        { status: 200 },
      ),
    );

    const config = {
      access_token: "tok",
      refresh_token: "ref",
      token_expiry: Date.now() + 3600000,
    };
    const events = await collectEvents(fortnoxProvider.sync(config));
    const contact = events.find(
      (e) => e.kind === "event" && e.data.eventType === "contact.synced",
    );
    expect(contact).toBeDefined();
    expect(contact.data.payload.name).toBe("Acme AB");
  });

  test("sync yields invoice.created with open status", async () => {
    let callNum = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callNum++;
      if (callNum === 1) {
        return new Response(
          JSON.stringify({
            Customers: [],
            MetaInformation: { "@TotalPages": 1 },
          }),
          { status: 200 },
        );
      }
      if (callNum === 2) {
        return new Response(
          JSON.stringify({
            Invoices: [
              {
                DocumentNumber: "2001",
                Balance: 5000,
                Total: 5000,
                DueDate: "2026-12-31",
                Currency: "SEK",
                FinalPayDate: null,
              },
            ],
            MetaInformation: { "@TotalPages": 1 },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ Articles: [], MetaInformation: { "@TotalPages": 1 } }),
        { status: 200 },
      );
    });

    const config = {
      access_token: "tok",
      refresh_token: "ref",
      token_expiry: Date.now() + 3600000,
    };
    const events = await collectEvents(fortnoxProvider.sync(config));
    const invoice = events.find(
      (e) => e.kind === "event" && e.data.eventType === "invoice.created",
    );
    expect(invoice).toBeDefined();
    expect(invoice.data.payload.status).toBe("open");
  });

  test("writeCapabilities declared", () => {
    expect(fortnoxProvider.writeCapabilities).toBeDefined();
    const slugs = fortnoxProvider.writeCapabilities!.map((c) => c.slug);
    expect(slugs).toContain("create_invoice");
    expect(slugs).toContain("create_customer");
  });
});

// ── Visma.net ─────────────────────────────────────────────

describe("Visma.net connector", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("configSchema is OAuth-only", () => {
    expect(vismanetProvider.configSchema).toHaveLength(1);
    expect(vismanetProvider.configSchema[0].type).toBe("oauth");
  });

  test("sync yields contact.synced", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify([
          { number: 1001, name: "Nordic AS", email: "hq@nordic.no", phone: "+4712345678" },
        ]),
        { status: 200 },
      ),
    );

    const config = {
      access_token: "tok",
      refresh_token: "ref",
      token_expiry: Date.now() + 3600000,
    };
    const events = await collectEvents(vismanetProvider.sync(config));
    const contact = events.find(
      (e) => e.kind === "event" && e.data.eventType === "contact.synced",
    );
    expect(contact).toBeDefined();
    expect(contact.data.payload.name).toBe("Nordic AS");
  });

  test("sync yields invoice.created", async () => {
    let callNum = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callNum++;
      if (callNum === 1) {
        // Customers empty
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (callNum === 2) {
        // Invoices
        return new Response(
          JSON.stringify([
            {
              invoiceNumber: "3001",
              balance: 0,
              amount: 8000,
              dueDate: "2026-05-01",
              currencyId: "NOK",
            },
          ]),
          { status: 200 },
        );
      }
      // Suppliers empty
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const config = {
      access_token: "tok",
      refresh_token: "ref",
      token_expiry: Date.now() + 3600000,
    };
    const events = await collectEvents(vismanetProvider.sync(config));
    const invoice = events.find(
      (e) => e.kind === "event" && e.data.eventType === "invoice.created",
    );
    expect(invoice).toBeDefined();
    expect(invoice.data.payload.status).toBe("paid");
  });

  test("writeCapabilities declared", () => {
    expect(vismanetProvider.writeCapabilities).toBeDefined();
    const slugs = vismanetProvider.writeCapabilities!.map((c) => c.slug);
    expect(slugs).toContain("create_invoice");
  });
});

// ── Exact Online ──────────────────────────────────────────

describe("Exact Online connector", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("configSchema is OAuth-only", () => {
    expect(exactOnlineProvider.configSchema).toHaveLength(1);
    expect(exactOnlineProvider.configSchema[0].type).toBe("oauth");
  });

  test("sync yields contact.synced", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          d: {
            results: [
              { ID: "a1", Name: "Dutch BV", Email: "info@dutch.nl", Phone: "+3112345" },
            ],
            __next: null,
          },
        }),
        { status: 200 },
      ),
    );

    const config = {
      access_token: "tok",
      refresh_token: "ref",
      token_expiry: Date.now() + 3600000,
      division: 12345,
    };
    const events = await collectEvents(exactOnlineProvider.sync(config));
    const contact = events.find(
      (e) => e.kind === "event" && e.data.eventType === "contact.synced",
    );
    expect(contact).toBeDefined();
    expect(contact.data.payload.name).toBe("Dutch BV");
  });

  test("sync yields invoice.created", async () => {
    let callNum = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callNum++;
      if (callNum === 1) {
        // Accounts empty
        return new Response(
          JSON.stringify({ d: { results: [], __next: null } }),
          { status: 200 },
        );
      }
      if (callNum === 2) {
        // Invoices
        return new Response(
          JSON.stringify({
            d: {
              results: [
                {
                  InvoiceID: "i1",
                  InvoiceNumber: 4001,
                  AmountDC: 12000,
                  StatusDescription: "Open",
                  Currency: "EUR",
                  DueDate: "/Date(1777660800000)/",
                },
              ],
              __next: null,
            },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ d: { results: [], __next: null } }),
        { status: 200 },
      );
    });

    const config = {
      access_token: "tok",
      refresh_token: "ref",
      token_expiry: Date.now() + 3600000,
      division: 12345,
    };
    const events = await collectEvents(exactOnlineProvider.sync(config));
    const invoice = events.find(
      (e) => e.kind === "event" && e.data.eventType === "invoice.created",
    );
    expect(invoice).toBeDefined();
    expect(invoice.data.payload.status).toBe("open");
  });

  test("writeCapabilities declared", () => {
    expect(exactOnlineProvider.writeCapabilities).toBeDefined();
    const slugs = exactOnlineProvider.writeCapabilities!.map((c) => c.slug);
    expect(slugs).toContain("create_sales_invoice");
  });
});

// ── Sage ──────────────────────────────────────────────────

describe("Sage connector", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("configSchema is OAuth-only", () => {
    expect(sageProvider.configSchema).toHaveLength(1);
    expect(sageProvider.configSchema[0].type).toBe("oauth");
  });

  test("sync yields contact.synced", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          $items: [
            { id: "c1", displayed_as: "Sage Ltd", email: "hi@sage.co.uk", telephone: "+44123" },
          ],
          $next: null,
        }),
        { status: 200 },
      ),
    );

    const config = {
      access_token: "tok",
      refresh_token: "ref",
      token_expiry: Date.now() + 3600000,
    };
    const events = await collectEvents(sageProvider.sync(config));
    const contact = events.find(
      (e) => e.kind === "event" && e.data.eventType === "contact.synced",
    );
    expect(contact).toBeDefined();
    expect(contact.data.payload.name).toBe("Sage Ltd");
  });

  test("sync yields invoice.created with paid status", async () => {
    let callNum = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callNum++;
      if (callNum === 1) {
        // Contacts empty
        return new Response(
          JSON.stringify({ $items: [], $next: null }),
          { status: 200 },
        );
      }
      if (callNum === 2) {
        // Invoices
        return new Response(
          JSON.stringify({
            $items: [
              {
                id: "i1",
                displayed_as: "INV-5001",
                total_amount: 2500,
                outstanding_amount: 0,
                due_date: "2026-03-01",
                currency: { symbol: "GBP" },
              },
            ],
            $next: null,
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ $items: [], $next: null }),
        { status: 200 },
      );
    });

    const config = {
      access_token: "tok",
      refresh_token: "ref",
      token_expiry: Date.now() + 3600000,
    };
    const events = await collectEvents(sageProvider.sync(config));
    const invoice = events.find(
      (e) => e.kind === "event" && e.data.eventType === "invoice.created",
    );
    expect(invoice).toBeDefined();
    expect(invoice.data.payload.status).toBe("paid");
  });

  test("writeCapabilities declared", () => {
    expect(sageProvider.writeCapabilities).toBeDefined();
    const slugs = sageProvider.writeCapabilities!.map((c) => c.slug);
    expect(slugs).toContain("create_sales_invoice");
    expect(slugs).toContain("create_contact");
  });
});
