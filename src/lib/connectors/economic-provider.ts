import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

const ECONOMIC_API = "https://restapi.e-conomic.com";

// ── Helpers ──────────────────────────────────────────────

async function economicFetch(
  config: ConnectorConfig,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const grantToken = config.grant_token as string;
  const appSecret = process.env.ECONOMIC_APP_SECRET_TOKEN;
  if (!appSecret) throw new Error("ECONOMIC_APP_SECRET_TOKEN not configured");

  return fetch(`${ECONOMIC_API}${path}`, {
    ...init,
    headers: {
      "X-AppSecretToken": appSecret,
      "X-AgreementGrantToken": grantToken,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function* paginateEconomic<T>(
  config: ConnectorConfig,
  basePath: string,
): AsyncGenerator<T> {
  let page = 0;
  let lastPage = false;

  while (!lastPage) {
    const separator = basePath.includes("?") ? "&" : "?";
    const url = `${basePath}${separator}skipPages=${page}&pageSize=100`;
    const resp = await economicFetch(config, url);
    if (!resp.ok) break;
    const data = await resp.json();

    const items = data.collection || [];
    for (const item of items) {
      yield item as T;
    }

    lastPage = data.pagination?.lastPage !== false;
    page++;
  }
}

// ── Provider Implementation ──────────────────────────────

export const economicProvider: ConnectorProvider = {
  id: "economic",
  name: "e-conomic",

  configSchema: [
    {
      key: "grant_token",
      label: "Agreement Grant Token",
      type: "password",
      required: true,
      placeholder: "Paste your grant token from e-conomic Settings → Apps",
    },
  ],

  async testConnection(config) {
    try {
      const resp = await economicFetch(config, "/self");
      if (!resp.ok) {
        return {
          ok: false,
          error: `e-conomic API ${resp.status}: ${resp.statusText}`,
        };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    // ── Sync customers ────────────────────────────────────
    for await (const cust of paginateEconomic<any>(config, "/customers")) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "customer.synced",
          payload: {
            id: cust.customerNumber,
            name: cust.name,
            email: cust.email,
            phone: cust.telephoneAndFaxNumber,
            currency: cust.currency,
            balance: cust.balance,
            corporateIdentificationNumber: cust.corporateIdentificationNumber,
          },
        },
      };

      yield {
        kind: "activity" as const,
        data: {
          signalType: "erp_customer_synced",
          occurredAt: new Date(),
        },
      };
    }

    // ── Sync invoices (booked) ────────────────────────────
    let invoicePath = "/invoices/booked";
    if (since) {
      const sinceDate = since.toISOString().slice(0, 10);
      invoicePath += `?filter=date$gte:${sinceDate}`;
    }

    const today = new Date();

    for await (const inv of paginateEconomic<any>(config, invoicePath)) {
      const remainder = inv.remainder ?? 0;
      const grossAmount = inv.grossAmount ?? 0;
      const bookedInvoiceNumber = inv.bookedInvoiceNumber;
      const dueDate = inv.dueDate;

      yield {
        kind: "event" as const,
        data: {
          eventType: "invoice.created",
          payload: {
            id: bookedInvoiceNumber,
            number: bookedInvoiceNumber,
            amount_due: remainder,
            total: grossAmount,
            status: remainder === 0 ? "paid" : "open",
            due_date: dueDate,
            currency: inv.currency,
          },
        },
      };

      // Paid invoice
      if (remainder === 0) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "invoice.paid",
            payload: {
              id: bookedInvoiceNumber,
              number: bookedInvoiceNumber,
              amount_paid: grossAmount,
              status: "paid",
            },
          },
        };
      }

      // Overdue invoice
      if (remainder > 0 && dueDate && new Date(dueDate) < today) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "invoice.overdue",
            payload: {
              id: bookedInvoiceNumber,
              number: bookedInvoiceNumber,
              amount_due: remainder,
              status: "overdue",
              due_date: dueDate,
            },
          },
        };
      }

      // Invoice → Customer association
      if (inv.customer?.customerNumber) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "association.found",
            payload: {
              fromSourceSystem: "economic",
              fromExternalId: String(inv.customer.customerNumber),
              toSourceSystem: "economic",
              toExternalId: String(bookedInvoiceNumber),
              relationshipType: "invoiced",
            },
          },
        };
      }
    }

    // ── Sync products ─────────────────────────────────────
    for await (const prod of paginateEconomic<any>(config, "/products")) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "product.synced",
          payload: {
            id: prod.productNumber,
            name: prod.name,
            sku: prod.productNumber,
            price: prod.salesPrice,
            currency: "DKK",
            status: prod.barred ? "barred" : "active",
            category: prod.productGroup?.name,
          },
        },
      };
    }

    // ── Sync accounts (chart of accounts) — content only ──
    const accounts: Array<{ accountNumber: number; name: string; accountType: string }> = [];
    for await (const acct of paginateEconomic<any>(config, "/accounts")) {
      accounts.push({
        accountNumber: acct.accountNumber,
        name: acct.name,
        accountType: acct.accountType,
      });
    }

    if (accounts.length > 0) {
      yield {
        kind: "content" as const,
        data: {
          sourceType: "erp_chart_of_accounts",
          sourceId: "economic-accounts",
          content: JSON.stringify(accounts),
          metadata: { accountCount: accounts.length },
        },
      };
    }
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [];
  },

  async inferSchema(config): Promise<InferredSchema[]> {
    const schemas: InferredSchema[] = [];

    // Customers
    const custResp = await economicFetch(config, "/customers?pageSize=5");
    if (custResp.ok) {
      const custData = await custResp.json();
      const records = custData.collection || [];
      schemas.push({
        suggestedTypeName: "Contact",
        suggestedProperties: [
          { name: "email", dataType: "STRING", possibleRole: "email", sampleValues: records.map((r: any) => r.email).filter(Boolean).slice(0, 5) },
          { name: "phone", dataType: "STRING", possibleRole: "phone", sampleValues: records.map((r: any) => r.telephoneAndFaxNumber).filter(Boolean).slice(0, 5) },
          { name: "currency", dataType: "STRING", sampleValues: records.map((r: any) => r.currency).filter(Boolean).slice(0, 5) },
          { name: "balance", dataType: "CURRENCY", sampleValues: records.map((r: any) => String(r.balance ?? "")).filter((v: string) => v !== "").slice(0, 5) },
        ],
        sampleEntities: records.map((r: any) => ({
          name: r.name || "",
          email: r.email || "",
          currency: r.currency || "",
          balance: String(r.balance ?? ""),
        })),
        recordCount: records.length,
      });
    }

    // Invoices
    const invResp = await economicFetch(config, "/invoices/booked?pageSize=5");
    if (invResp.ok) {
      const invData = await invResp.json();
      const records = invData.collection || [];
      schemas.push({
        suggestedTypeName: "Invoice",
        suggestedProperties: [
          { name: "number", dataType: "STRING", sampleValues: records.map((r: any) => String(r.bookedInvoiceNumber ?? "")).filter((v: string) => v !== "").slice(0, 5) },
          { name: "amount", dataType: "CURRENCY", sampleValues: records.map((r: any) => String(r.grossAmount ?? "")).filter((v: string) => v !== "").slice(0, 5) },
          { name: "status", dataType: "STRING", sampleValues: records.map((r: any) => r.remainder === 0 ? "paid" : "open").slice(0, 5) },
          { name: "due-date", dataType: "DATE", sampleValues: records.map((r: any) => r.dueDate || "").filter((v: string) => v !== "").slice(0, 5) },
          { name: "currency", dataType: "STRING", sampleValues: records.map((r: any) => r.currency).filter(Boolean).slice(0, 5) },
        ],
        sampleEntities: records.map((r: any) => ({
          number: String(r.bookedInvoiceNumber ?? ""),
          amount: String(r.grossAmount ?? ""),
          status: r.remainder === 0 ? "paid" : "open",
          currency: r.currency || "",
        })),
        recordCount: records.length,
      });
    }

    // Products
    const prodResp = await economicFetch(config, "/products?pageSize=5");
    if (prodResp.ok) {
      const prodData = await prodResp.json();
      const records = prodData.collection || [];
      schemas.push({
        suggestedTypeName: "Product",
        suggestedProperties: [
          { name: "sku", dataType: "STRING", sampleValues: records.map((r: any) => String(r.productNumber ?? "")).filter((v: string) => v !== "").slice(0, 5) },
          { name: "price", dataType: "CURRENCY", sampleValues: records.map((r: any) => String(r.salesPrice ?? "")).filter((v: string) => v !== "").slice(0, 5) },
          { name: "status", dataType: "STRING", sampleValues: records.map((r: any) => r.barred ? "barred" : "active").slice(0, 5) },
          { name: "category", dataType: "STRING", sampleValues: records.map((r: any) => r.productGroup?.name).filter(Boolean).slice(0, 5) },
        ],
        sampleEntities: records.map((r: any) => ({
          name: r.name || "",
          sku: String(r.productNumber ?? ""),
          price: String(r.salesPrice ?? ""),
          status: r.barred ? "barred" : "active",
        })),
        recordCount: records.length,
      });
    }

    return schemas;
  },
};
