import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

const FORTNOX_API = "https://api.fortnox.se/3";
const FORTNOX_TOKEN_URL = "https://apps.fortnox.se/oauth-v1/token";

// ── Helpers ──────────────────────────────────────────────

/**
 * Refresh the Fortnox OAuth access token using the refresh token.
 * Returns the updated config with new access_token, refresh_token, and token_expiry.
 */
export async function refreshFortnoxToken(
  config: ConnectorConfig
): Promise<ConnectorConfig> {
  const clientId = process.env.FORTNOX_CLIENT_ID;
  const clientSecret = process.env.FORTNOX_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("FORTNOX_CLIENT_ID and FORTNOX_CLIENT_SECRET must be configured");
  }

  const refreshToken = config.refresh_token as string;
  if (!refreshToken) {
    throw new Error("No refresh_token in Fortnox config");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const resp = await fetch(FORTNOX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Fortnox token refresh failed (${resp.status}): ${errText}`);
  }

  const tokens = await resp.json();

  return {
    ...config,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? refreshToken,
    token_expiry: Date.now() + (tokens.expires_in as number) * 1000,
  };
}

async function getValidConfig(config: ConnectorConfig): Promise<ConnectorConfig> {
  const expiry = config.token_expiry as number | undefined;
  if (expiry && Date.now() > expiry - 5 * 60 * 1000) {
    return refreshFortnoxToken(config);
  }
  return config;
}

async function fortnoxFetch(
  config: ConnectorConfig,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const validConfig = await getValidConfig(config);
  const accessToken = validConfig.access_token as string;
  if (!accessToken) throw new Error("No access_token in Fortnox config");

  return fetch(`${FORTNOX_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function* paginateFortnox<T>(
  config: ConnectorConfig,
  basePath: string,
  collectionKey: string,
): AsyncGenerator<T> {
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const separator = basePath.includes("?") ? "&" : "?";
    const url = `${basePath}${separator}page=${page}&limit=500`;
    const resp = await fortnoxFetch(config, url);
    if (!resp.ok) break;
    const data = await resp.json();

    totalPages = data.MetaInformation?.["@TotalPages"] ?? 1;

    const items = data[collectionKey] || [];
    for (const item of items) {
      yield item as T;
    }

    page++;
  }
}

// ── Provider Implementation ──────────────────────────────

export const fortnoxProvider: ConnectorProvider = {
  id: "fortnox",
  name: "Fortnox",

  configSchema: [
    { key: "oauth", label: "Fortnox Account", type: "oauth" as const, required: true },
  ],

  writeCapabilities: [
    {
      slug: "create_invoice",
      name: "Create Invoice",
      description: "Create an invoice in Fortnox for a customer with line items",
      inputSchema: {
        customerNumber: "string",
        invoiceRows: "array<{ articleNumber: string, deliveredQuantity: number, price?: number }>",
      },
    },
    {
      slug: "create_customer",
      name: "Create Customer",
      description: "Create a new customer in Fortnox",
      inputSchema: {
        name: "string",
        email: "string?",
        phone: "string?",
        organisationNumber: "string?",
      },
    },
  ],

  async testConnection(config) {
    try {
      const resp = await fortnoxFetch(config, "/companyinformation");
      if (!resp.ok) {
        return {
          ok: false,
          error: `Fortnox API ${resp.status}: ${resp.statusText}`,
        };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    const today = new Date();

    // ── Sync customers ────────────────────────────────────
    let customerPath = "/customers";
    if (since) {
      const sinceDate = since.toISOString().slice(0, 10);
      customerPath += `?lastmodified=${sinceDate}`;
    }

    for await (const cust of paginateFortnox<any>(config, customerPath, "Customers")) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: cust.CustomerNumber,
            name: cust.Name,
            email: cust.Email,
            phone: cust.Phone,
          },
        },
      };
    }

    // ── Sync invoices ─────────────────────────────────────
    let invoicePath = "/invoices";
    if (since) {
      const sinceDate = since.toISOString().slice(0, 10);
      invoicePath += `?lastmodified=${sinceDate}`;
    }

    for await (const inv of paginateFortnox<any>(config, invoicePath, "Invoices")) {
      const balance = inv.Balance ?? 0;
      const total = inv.Total ?? 0;
      const dueDate = inv.DueDate;
      const finalPayDate = inv.FinalPayDate;
      const documentNumber = inv.DocumentNumber;

      let status: string;
      if (balance === 0) {
        status = "paid";
      } else if (finalPayDate && new Date(finalPayDate) < today) {
        status = "overdue";
      } else {
        status = "open";
      }

      yield {
        kind: "event" as const,
        data: {
          eventType: "invoice.created",
          payload: {
            id: documentNumber,
            number: documentNumber,
            amount_due: balance,
            total,
            status,
            due_date: dueDate,
            currency: inv.Currency,
          },
        },
      };

      // Paid invoice
      if (balance === 0) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "invoice.paid",
            payload: {
              id: documentNumber,
              number: documentNumber,
              amount_paid: total,
              status: "paid",
            },
          },
        };
      }

      // Overdue invoice
      if (balance > 0 && finalPayDate && new Date(finalPayDate) < today) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "invoice.overdue",
            payload: {
              id: documentNumber,
              number: documentNumber,
              amount_due: balance,
              status: "overdue",
              due_date: dueDate,
            },
          },
        };
      }
    }

    // ── Sync articles (products) ──────────────────────────
    for await (const article of paginateFortnox<any>(config, "/articles", "Articles")) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "product.synced",
          payload: {
            id: article.ArticleNumber,
            name: article.Description,
            sku: article.ArticleNumber,
            price: article.SalesPrice,
            status: article.Discontinued ? "discontinued" : "active",
          },
        },
      };
    }
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [
      {
        name: "create_invoice",
        description: "Create an invoice in Fortnox for a customer with line items",
        inputSchema: {
          customerNumber: "string",
          invoiceRows: "array<{ articleNumber: string, deliveredQuantity: number, price?: number }>",
        },
        sideEffects: ["Invoice created in Fortnox"],
      },
      {
        name: "create_customer",
        description: "Create a new customer in Fortnox",
        inputSchema: {
          name: "string",
          email: "string?",
          phone: "string?",
          organisationNumber: "string?",
        },
        sideEffects: ["New customer record created in Fortnox"],
      },
    ];
  },

  async executeAction(config, action, params) {
    try {
      switch (action) {
        // ── 1. Create invoice ──────────────────────────────────
        case "create_invoice": {
          if (!params.customerNumber) return { success: false, error: "customerNumber is required" };
          if (!params.invoiceRows || !Array.isArray(params.invoiceRows)) {
            return { success: false, error: "invoiceRows is required" };
          }

          const invoiceRows = (params.invoiceRows as Array<{
            articleNumber: string;
            deliveredQuantity: number;
            price?: number;
          }>).map((row) => {
            const r: Record<string, unknown> = {
              ArticleNumber: row.articleNumber,
              DeliveredQuantity: row.deliveredQuantity,
            };
            if (row.price !== undefined) r.Price = row.price;
            return r;
          });

          const body = {
            Invoice: {
              CustomerNumber: params.customerNumber,
              InvoiceRows: invoiceRows,
            },
          };

          const resp = await fortnoxFetch(config, "/invoices", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create invoice failed (${resp.status}): ${err}` };
          }
          return { success: true, result: await resp.json() };
        }

        // ── 2. Create customer ─────────────────────────────────
        case "create_customer": {
          if (!params.name) return { success: false, error: "name is required" };

          const customer: Record<string, unknown> = {
            Name: params.name as string,
          };
          if (params.email) customer.Email = params.email;
          if (params.phone) customer.Phone = params.phone;
          if (params.organisationNumber) customer.OrganisationNumber = params.organisationNumber;

          const resp = await fortnoxFetch(config, "/customers", {
            method: "POST",
            body: JSON.stringify({ Customer: customer }),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create customer failed (${resp.status}): ${err}` };
          }
          return { success: true, result: await resp.json() };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
