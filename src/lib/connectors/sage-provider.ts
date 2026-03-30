import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

const SAGE_API = "https://api.accounting.sage.com/v3.1";

// -- Helpers ------------------------------------------------------------------

async function refreshSageToken(config: ConnectorConfig): Promise<string> {
  const clientId = process.env.SAGE_CLIENT_ID;
  const clientSecret = process.env.SAGE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("SAGE_CLIENT_ID and SAGE_CLIENT_SECRET must be configured");
  }

  const resp = await fetch("https://oauth.accounting.sage.com/token", {
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
    throw new Error(`Sage token refresh failed: ${resp.status} ${await resp.text()}`);
  }

  const data = await resp.json();
  config.access_token = data.access_token;
  if (data.refresh_token) config.refresh_token = data.refresh_token;
  config.token_expiry = Date.now() + (data.expires_in || 3600) * 1000;

  return data.access_token;
}

async function sageFetch(
  config: ConnectorConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const expiry = config.token_expiry as number;
  if (!expiry || expiry < Date.now() + 5 * 60 * 1000) {
    await refreshSageToken(config);
  }

  return fetch(`${SAGE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.access_token as string}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function* paginateSage<T>(
  config: ConnectorConfig,
  path: string,
): AsyncGenerator<T> {
  let url: string | null = `${SAGE_API}${path}`;

  while (url) {
    const expiry = config.token_expiry as number;
    if (!expiry || expiry < Date.now() + 5 * 60 * 1000) {
      await refreshSageToken(config);
    }

    const resp: Response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.access_token as string}`,
        "Content-Type": "application/json",
      },
    });

    if (!resp.ok) break;
    const data: any = await resp.json();

    for (const item of data.$items || []) {
      yield item as T;
    }

    url = data.$next || null;
  }
}

// -- Provider Implementation --------------------------------------------------

export const sageProvider: ConnectorProvider = {
  id: "sage",
  name: "Sage Business Cloud",

  configSchema: [
    { key: "oauth", label: "Sage Account", type: "oauth" as const, required: true },
  ],

  writeCapabilities: [
    {
      slug: "create_sales_invoice",
      name: "Create Sales Invoice",
      description: "Creates a new sales invoice in Sage Business Cloud",
      inputSchema: {
        type: "object",
        properties: {
          contactId: { type: "string" },
          invoiceLines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                quantity: { type: "number" },
                unitPrice: { type: "number" },
                ledgerAccountId: { type: "string" },
              },
              required: ["description", "quantity", "unitPrice", "ledgerAccountId"],
            },
          },
        },
        required: ["contactId", "invoiceLines"],
      },
    },
    {
      slug: "create_contact",
      name: "Create Contact",
      description: "Creates a new contact in Sage Business Cloud",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          telephone: { type: "string" },
          contactTypes: { type: "array", items: { type: "string" } },
        },
        required: ["name", "contactTypes"],
      },
    },
  ],

  async testConnection(config) {
    try {
      const resp = await sageFetch(config, "/user");
      if (!resp.ok) {
        return { ok: false, error: `Sage API ${resp.status}: ${await resp.text()}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    const sinceParam = since ? `&updated_from=${since.toISOString()}` : "";

    // -- Contacts -------------------------------------------------------------
    for await (const c of paginateSage<any>(
      config,
      `/contacts?page=1&items_per_page=200${sinceParam}`,
    )) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: c.id,
            name: c.displayed_as,
            email: c.email,
            phone: c.telephone,
          },
        },
      };
    }

    // -- Sales Invoices -------------------------------------------------------
    for await (const inv of paginateSage<any>(
      config,
      `/sales_invoices?page=1&items_per_page=200${sinceParam}`,
    )) {
      const outstandingAmount = inv.outstanding_amount ?? 0;
      const isPaid = outstandingAmount === 0;

      yield {
        kind: "event" as const,
        data: {
          eventType: "invoice.created",
          payload: {
            id: inv.id,
            number: inv.displayed_as,
            total: inv.total_amount,
            amount_due: outstandingAmount,
            status: isPaid ? "paid" : "open",
            currency: inv.currency?.symbol,
            due_date: inv.due_date,
          },
        },
      };

      if (isPaid) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "invoice.paid",
            payload: {
              id: inv.id,
              number: inv.displayed_as,
              amount_paid: inv.total_amount,
              status: "paid",
            },
          },
        };
      }
    }

    // -- Products -------------------------------------------------------------
    for await (const prod of paginateSage<any>(
      config,
      `/products?page=1&items_per_page=200${sinceParam}`,
    )) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "product.synced",
          payload: {
            id: prod.id,
            name: prod.displayed_as,
            sku: prod.item_code,
            price: prod.sales_ledger_account?.nominal_code,
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
          if (!params.contactId) return { success: false, error: "contactId is required" };
          if (!params.invoiceLines || !Array.isArray(params.invoiceLines)) {
            return { success: false, error: "invoiceLines is required" };
          }

          const lines = params.invoiceLines as Array<{
            description: string;
            quantity: number;
            unitPrice: number;
            ledgerAccountId: string;
          }>;

          const body = {
            contact_id: params.contactId,
            date: new Date().toISOString().slice(0, 10),
            invoice_lines: lines.map((line) => ({
              description: line.description,
              quantity: line.quantity,
              unit_price: line.unitPrice,
              ledger_account_id: line.ledgerAccountId,
            })),
          };

          const resp = await sageFetch(config, "/sales_invoices", {
            method: "POST",
            body: JSON.stringify({ sales_invoice: body }),
          });

          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create sales invoice failed (${resp.status}): ${err}` };
          }
          return { success: true, result: await resp.json() };
        }

        case "create_contact": {
          if (!params.name) return { success: false, error: "name is required" };
          if (!params.contactTypes || !Array.isArray(params.contactTypes)) {
            return { success: false, error: "contactTypes is required" };
          }

          const contactBody: Record<string, unknown> = {
            name: params.name,
            contact_types: params.contactTypes,
          };
          if (params.email) contactBody.email = params.email;
          if (params.telephone) contactBody.telephone = params.telephone;

          const resp = await sageFetch(config, "/contacts", {
            method: "POST",
            body: JSON.stringify({ contact: contactBody }),
          });

          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create contact failed (${resp.status}): ${err}` };
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
        description: "Create a new sales invoice in Sage Business Cloud",
        inputSchema: {
          contactId: "string",
          invoiceLines: "array<{ description: string, quantity: number, unitPrice: number, ledgerAccountId: string }>",
        },
        sideEffects: ["Sales invoice created in Sage Business Cloud"],
      },
      {
        name: "create_contact",
        description: "Create a new contact in Sage Business Cloud",
        inputSchema: {
          name: "string",
          email: "string?",
          telephone: "string?",
          contactTypes: "array<string>",
        },
        sideEffects: ["Contact created in Sage Business Cloud"],
      },
    ];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
