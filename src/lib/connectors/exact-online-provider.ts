import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

// ── Helpers ──────────────────────────────────────────────

const EXACT_API_BASE = "https://start.exactonline.nl/api/v1";

async function refreshExactToken(config: ConnectorConfig): Promise<string> {
  const clientId = process.env.EXACT_CLIENT_ID;
  const clientSecret = process.env.EXACT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("EXACT_CLIENT_ID and EXACT_CLIENT_SECRET must be configured");
  }

  const resp = await fetch("https://start.exactonline.nl/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: config.refresh_token as string,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Exact Online token refresh failed: ${resp.status}`);
  }

  const data = await resp.json();
  config.access_token = data.access_token;
  if (data.refresh_token) config.refresh_token = data.refresh_token;
  config.token_expiry = Date.now() + (data.expires_in || 3600) * 1000;

  return data.access_token;
}

async function getValidToken(config: ConnectorConfig): Promise<string> {
  const expiry = config.token_expiry as number;
  if (expiry > Date.now() + 5 * 60 * 1000) {
    return config.access_token as string;
  }
  return refreshExactToken(config);
}

async function exactFetch(
  config: ConnectorConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await getValidToken(config);
  const division = config.division as string;
  const url = `${EXACT_API_BASE}/${division}${path}`;

  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...init?.headers,
    },
  });
}

async function* paginateExact<T>(
  config: ConnectorConfig,
  path: string,
  since?: Date,
): AsyncGenerator<T> {
  const token = await getValidToken(config);
  const division = config.division as string;

  // Build initial URL with $top and optional $filter
  const separator = path.includes("?") ? "&" : "?";
  let filterPart = "";
  if (since) {
    filterPart = `$filter=Modified gt datetime'${since.toISOString()}'`;
  }

  let url: string | null = `${EXACT_API_BASE}/${division}${path}${separator}$top=100${filterPart ? `&${filterPart}` : ""}`;

  while (url) {
    const resp: Response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!resp.ok) break;

    const data: any = await resp.json();
    const results = data?.d?.results || [];

    for (const item of results) {
      yield item as T;
    }

    // Follow OData __next link or stop
    url = data?.d?.__next || null;
  }
}

// ── Provider Implementation ──────────────────────────────

export const exactOnlineProvider: ConnectorProvider = {
  id: "exact-online",
  name: "Exact Online",

  configSchema: [
    { key: "oauth", label: "Exact Online Account", type: "oauth" as const, required: true },
  ],

  writeCapabilities: [
    {
      slug: "create_sales_invoice",
      name: "Create Sales Invoice",
      description: "Create a new sales invoice in Exact Online",
      inputSchema: {
        type: "object",
        properties: {
          orderedBy: { type: "string", description: "Account GUID of the customer" },
          invoiceLines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                item: { type: "string" },
                quantity: { type: "number" },
                unitPrice: { type: "number" },
              },
            },
          },
        },
        required: ["orderedBy", "invoiceLines"],
      },
    },
  ],

  async testConnection(config) {
    try {
      const token = await getValidToken(config);
      const resp = await fetch(`${EXACT_API_BASE}/current/Me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      if (!resp.ok) {
        return { ok: false, error: `Exact Online API ${resp.status}: ${await resp.text()}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    // ── Accounts (contacts) ──────────────────────────────
    for await (const a of paginateExact<any>(config, "/crm/Accounts", since)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: a.ID,
            name: a.Name,
            email: a.Email,
            phone: a.Phone,
          },
        },
      };
    }

    // ── Sales Invoices ───────────────────────────────────
    for await (const inv of paginateExact<any>(config, "/salesinvoice/SalesInvoices", since)) {
      const statusRaw = inv.StatusDescription as string | undefined;
      const status = statusRaw === "Paid" ? "paid" : "open";

      yield {
        kind: "event" as const,
        data: {
          eventType: "invoice.created",
          payload: {
            id: inv.InvoiceID,
            number: inv.InvoiceNumber,
            total: inv.AmountDC,
            status,
            currency: inv.Currency,
            due_date: inv.DueDate,
          },
        },
      };

      if (status === "paid") {
        yield {
          kind: "event" as const,
          data: {
            eventType: "invoice.paid",
            payload: {
              id: inv.InvoiceID,
              number: inv.InvoiceNumber,
              amount_paid: inv.AmountDC,
              status: "paid",
            },
          },
        };
      }
    }

    // ── Items (products) ─────────────────────────────────
    for await (const item of paginateExact<any>(config, "/logistics/Items", since)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "product.synced",
          payload: {
            id: item.ID,
            name: item.Description,
            sku: item.Code,
            price: item.SalesPrice,
            status: "active",
          },
        },
      };
    }
  },

  async executeAction(config, action, params) {
    try {
      switch (action) {
        case "create_sales_invoice": {
          if (!params.orderedBy) return { success: false, error: "orderedBy is required" };
          if (!params.invoiceLines || !Array.isArray(params.invoiceLines)) {
            return { success: false, error: "invoiceLines is required" };
          }

          const body = {
            OrderedBy: params.orderedBy,
            SalesInvoiceLines: (params.invoiceLines as any[]).map((line) => ({
              Item: line.item,
              Quantity: line.quantity,
              UnitPrice: line.unitPrice,
            })),
          };

          const resp = await exactFetch(config, "/salesinvoice/SalesInvoices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create sales invoice failed (${resp.status}): ${err}` };
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

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [
      {
        name: "create_sales_invoice",
        description: "Create a new sales invoice in Exact Online",
        inputSchema: {
          orderedBy: "string (account GUID)",
          invoiceLines: "array<{ item: string, quantity: number, unitPrice: number }>",
        },
        sideEffects: ["Sales invoice created in Exact Online"],
      },
    ];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
