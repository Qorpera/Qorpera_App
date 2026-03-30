import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

const VISMANET_API = "https://integration.visma.net/api/v1";

// ── Helpers ──────────────────────────────────────────────

/**
 * Refresh the Visma.net OAuth token if it expires within 5 minutes.
 * Mutates config in-place so downstream calls use the fresh token.
 */
async function refreshVismanetToken(config: ConnectorConfig): Promise<string> {
  const expiry = config.token_expiry as number;

  if (expiry > Date.now() + 5 * 60 * 1000) {
    return config.access_token as string;
  }

  const clientId = process.env.VISMANET_CLIENT_ID;
  const clientSecret = process.env.VISMANET_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("VISMANET_CLIENT_ID and VISMANET_CLIENT_SECRET must be configured");
  }

  const resp = await fetch("https://connect.visma.com/connect/token", {
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
    throw new Error(`Visma.net token refresh failed: ${resp.status}`);
  }

  const data = await resp.json();

  config.access_token = data.access_token;
  if (data.refresh_token) config.refresh_token = data.refresh_token;
  config.token_expiry = Date.now() + (data.expires_in || 3600) * 1000;

  return data.access_token;
}

async function vismanetFetch(
  config: ConnectorConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await refreshVismanetToken(config);

  return fetch(`${VISMANET_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function* paginateVismanet<T>(
  config: ConnectorConfig,
  basePath: string,
): AsyncGenerator<T> {
  let page = 1;

  while (true) {
    const separator = basePath.includes("?") ? "&" : "?";
    const url = `${basePath}${separator}pageNumber=${page}&pageSize=500`;
    const resp = await vismanetFetch(config, url);
    if (!resp.ok) break;

    const items: T[] = await resp.json();
    if (!Array.isArray(items) || items.length === 0) break;

    for (const item of items) {
      yield item;
    }

    page++;
  }
}

// ── Provider Implementation ──────────────────────────────

export const vismanetProvider: ConnectorProvider = {
  id: "vismanet",
  name: "Visma.net",

  configSchema: [
    {
      key: "oauth",
      label: "Visma.net Account",
      type: "oauth" as const,
      required: true,
    },
  ],

  writeCapabilities: [
    {
      slug: "create_invoice",
      name: "Create Invoice",
      description: "Create an invoice in Visma.net for a customer with line items",
      inputSchema: {
        customerId: "number",
        invoiceLines: "array<{ inventoryId: string, quantity: number, unitPrice: number }>",
      },
    },
  ],

  async testConnection(config) {
    try {
      const resp = await vismanetFetch(config, "/customer?pageNumber=1&pageSize=1");
      if (!resp.ok) {
        return {
          ok: false,
          error: `Visma.net API ${resp.status}: ${resp.statusText}`,
        };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    // ── Sync customers ────────────────────────────────────
    for await (const cust of paginateVismanet<any>(config, "/customer")) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: cust.number,
            name: cust.name,
            email: cust.email,
            phone: cust.phone,
          },
        },
      };
    }

    // ── Sync invoices ─────────────────────────────────────
    for await (const inv of paginateVismanet<any>(config, "/invoice")) {
      const balance = inv.balance ?? 0;
      const amount = inv.amount ?? 0;
      const status = balance === 0 ? "paid" : "open";

      yield {
        kind: "event" as const,
        data: {
          eventType: "invoice.created",
          payload: {
            id: inv.invoiceNumber,
            number: inv.invoiceNumber,
            amount_due: balance,
            total: amount,
            status,
            due_date: inv.dueDate,
            currency: inv.currencyId,
          },
        },
      };

      if (balance === 0) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "invoice.paid",
            payload: {
              id: inv.invoiceNumber,
              number: inv.invoiceNumber,
              amount_paid: amount,
              status: "paid",
            },
          },
        };
      }
    }

    // ── Sync suppliers ────────────────────────────────────
    for await (const sup of paginateVismanet<any>(config, "/supplier")) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: sup.number,
            name: sup.name,
            email: sup.email,
            phone: sup.phone,
          },
        },
      };
    }
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [
      {
        name: "create_invoice",
        description: "Create an invoice in Visma.net for a customer with line items",
        inputSchema: {
          customerId: "number",
          invoiceLines: "array<{ inventoryId: string, quantity: number, unitPrice: number }>",
        },
        sideEffects: ["Invoice created in Visma.net"],
      },
    ];
  },

  async executeAction(config, action, params) {
    try {
      switch (action) {
        case "create_invoice": {
          if (!params.customerId) return { success: false, error: "customerId is required" };
          if (!params.invoiceLines || !Array.isArray(params.invoiceLines)) {
            return { success: false, error: "invoiceLines is required" };
          }

          const body = {
            customerId: params.customerId,
            invoiceLines: (params.invoiceLines as Array<{
              inventoryId: string;
              quantity: number;
              unitPrice: number;
            }>).map((line) => ({
              inventoryId: line.inventoryId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
            })),
          };

          const resp = await vismanetFetch(config, "/invoice", {
            method: "POST",
            body: JSON.stringify(body),
          });

          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create invoice failed (${resp.status}): ${err}` };
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
