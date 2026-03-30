import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";
import crypto from "crypto";

// ── OAuth 1.0a Signing ──────────────────────────────────

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildOAuthHeader(
  config: ConnectorConfig,
  method: string,
  url: string,
): string {
  const consumerKey = config.consumer_key as string;
  const consumerSecret = config.consumer_secret as string;
  const tokenId = config.token_id as string;
  const tokenSecret = config.token_secret as string;

  const nonce = crypto.randomBytes(16).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA256",
    oauth_timestamp: timestamp,
    oauth_token: tokenId,
    oauth_version: "1.0",
  };

  // Parse URL to separate base URL and query params
  const urlObj = new URL(url);
  const allParams: Record<string, string> = { ...oauthParams };
  urlObj.searchParams.forEach((v, k) => {
    allParams[k] = v;
  });

  // Sort and encode params
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join("&");

  const baseUrl = `${urlObj.origin}${urlObj.pathname}`;
  const signatureBase = `${method.toUpperCase()}&${percentEncode(baseUrl)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;

  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(signatureBase)
    .digest("base64");

  oauthParams.oauth_signature = signature;

  const header = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");

  return `OAuth ${header}`;
}

// ── Helpers ──────────────────────────────────────────────

function getBaseUrl(config: ConnectorConfig): string {
  const accountId = (config.account_id as string).replace(/_/g, "-");
  return `https://${accountId}.suitetalk.api.netsuite.com/services/rest/record/v1`;
}

async function netsuiteFetch(
  config: ConnectorConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}${path}`;
  const method = init?.method || "GET";
  const authHeader = buildOAuthHeader(config, method, url);

  return fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init?.headers,
    },
  });
}

async function* paginateNetsuite<T>(
  config: ConnectorConfig,
  path: string,
  since?: Date,
): AsyncGenerator<T> {
  let offset = 0;
  const limit = 1000;

  while (true) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (since) params.set("q", `lastModifiedDate AFTER "${since.toISOString()}"`);

    const sep = path.includes("?") ? "&" : "?";
    const resp = await netsuiteFetch(config, `${path}${sep}${params.toString()}`);
    if (!resp.ok) break;

    const data = await resp.json();
    const items: T[] = data.items || [];
    for (const item of items) {
      yield item;
    }

    if (!data.hasMore) break;
    offset += limit;
  }
}

// ── Provider Implementation ──────────────────────────────

export const netsuiteProvider: ConnectorProvider = {
  id: "netsuite",
  name: "Oracle NetSuite",

  configSchema: [
    { key: "account_id", label: "Account ID", type: "text", required: true, placeholder: "e.g. 1234567" },
    { key: "consumer_key", label: "Consumer Key", type: "text", required: true },
    { key: "consumer_secret", label: "Consumer Secret", type: "password", required: true },
    { key: "token_id", label: "Token ID", type: "text", required: true },
    { key: "token_secret", label: "Token Secret", type: "password", required: true },
  ],

  writeCapabilities: [
    {
      slug: "create_sales_order",
      name: "Create Sales Order",
      description: "Create a sales order in NetSuite",
      inputSchema: {
        entity: "string (customer internal ID)",
        item: "array<{ item: string, quantity: number, rate: number }>",
        tranDate: "string? (ISO date)",
      },
    },
    {
      slug: "create_purchase_order",
      name: "Create Purchase Order",
      description: "Create a purchase order in NetSuite",
      inputSchema: {
        entity: "string (vendor internal ID)",
        item: "array<{ item: string, quantity: number, rate: number }>",
        tranDate: "string? (ISO date)",
      },
    },
    {
      slug: "create_invoice",
      name: "Create Invoice",
      description: "Create an invoice in NetSuite",
      inputSchema: {
        entity: "string (customer internal ID)",
        item: "array<{ item: string, quantity: number, rate: number }>",
      },
    },
  ],

  async testConnection(config) {
    try {
      const resp = await netsuiteFetch(config, "/customer?limit=1");
      if (!resp.ok) {
        return { ok: false, error: `NetSuite API ${resp.status}: ${resp.statusText}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    const today = new Date();

    // ── Customers ─────────────────────────────────────────
    for await (const c of paginateNetsuite<any>(config, "/customer", since)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: c.id,
            firstname: c.firstName,
            lastname: c.lastName,
            email: c.email,
            phone: c.phone,
            companyName: c.companyName,
          },
        },
      };
    }

    // ── Vendors ───────────────────────────────────────────
    for await (const v of paginateNetsuite<any>(config, "/vendor", since)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: v.id,
            name: v.companyName,
            email: v.email,
            phone: v.phone,
          },
        },
      };
    }

    // ── Sales Orders ──────────────────────────────────────
    for await (const so of paginateNetsuite<any>(config, "/salesOrder", since)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "sales-order.synced",
          payload: {
            id: so.id,
            orderNumber: so.tranId,
            amount: so.total,
            currency: so.currency?.refName,
            status: so.status,
            orderDate: so.tranDate,
            customerName: so.entity?.refName,
          },
        },
      };
    }

    // ── Purchase Orders ───────────────────────────────────
    for await (const po of paginateNetsuite<any>(config, "/purchaseOrder", since)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "purchase-order.synced",
          payload: {
            id: po.id,
            orderNumber: po.tranId,
            amount: po.total,
            currency: po.currency?.refName,
            status: po.status,
            orderDate: po.tranDate,
            supplier: po.entity?.refName,
          },
        },
      };
    }

    // ── Invoices ──────────────────────────────────────────
    for await (const inv of paginateNetsuite<any>(config, "/invoice", since)) {
      const amountRemaining = inv.amountRemaining ?? 0;
      const isPaid = amountRemaining === 0;
      const dueDate = inv.dueDate;
      const isOverdue = !isPaid && dueDate && new Date(dueDate) < today;
      const status = isPaid ? "paid" : isOverdue ? "overdue" : "open";

      yield {
        kind: "event" as const,
        data: {
          eventType: "invoice.created",
          payload: {
            id: inv.id,
            number: inv.tranId,
            total: inv.total,
            amount_due: amountRemaining,
            status,
            due_date: dueDate,
            currency: inv.currency?.refName,
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
              number: inv.tranId,
              amount_paid: inv.total,
              status: "paid",
            },
          },
        };
      }

      if (isOverdue) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "invoice.overdue",
            payload: {
              id: inv.id,
              number: inv.tranId,
              amount_due: amountRemaining,
              status: "overdue",
              due_date: dueDate,
            },
          },
        };
      }
    }
  },

  async executeAction(config, action, params) {
    try {
      switch (action) {
        case "create_sales_order": {
          if (!params.entity) return { success: false, error: "entity (customer ID) is required" };
          if (!params.item || !Array.isArray(params.item)) return { success: false, error: "item array is required" };

          const body: Record<string, unknown> = {
            entity: { id: params.entity },
            item: { items: (params.item as any[]).map((i) => ({
              item: { id: i.item },
              quantity: i.quantity,
              rate: i.rate,
            })) },
          };
          if (params.tranDate) body.tranDate = params.tranDate;

          const resp = await netsuiteFetch(config, "/salesOrder", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create sales order failed (${resp.status}): ${err}` };
          }
          return { success: true, result: { id: resp.headers.get("Location") } };
        }

        case "create_purchase_order": {
          if (!params.entity) return { success: false, error: "entity (vendor ID) is required" };
          if (!params.item || !Array.isArray(params.item)) return { success: false, error: "item array is required" };

          const body: Record<string, unknown> = {
            entity: { id: params.entity },
            item: { items: (params.item as any[]).map((i) => ({
              item: { id: i.item },
              quantity: i.quantity,
              rate: i.rate,
            })) },
          };
          if (params.tranDate) body.tranDate = params.tranDate;

          const resp = await netsuiteFetch(config, "/purchaseOrder", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create purchase order failed (${resp.status}): ${err}` };
          }
          return { success: true, result: { id: resp.headers.get("Location") } };
        }

        case "create_invoice": {
          if (!params.entity) return { success: false, error: "entity (customer ID) is required" };
          if (!params.item || !Array.isArray(params.item)) return { success: false, error: "item array is required" };

          const body: Record<string, unknown> = {
            entity: { id: params.entity },
            item: { items: (params.item as any[]).map((i) => ({
              item: { id: i.item },
              quantity: i.quantity,
              rate: i.rate,
            })) },
          };

          const resp = await netsuiteFetch(config, "/invoice", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create invoice failed (${resp.status}): ${err}` };
          }
          return { success: true, result: { id: resp.headers.get("Location") } };
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
        name: "create_sales_order",
        description: "Create a sales order in NetSuite",
        inputSchema: { entity: "string", item: "array", tranDate: "string?" },
        sideEffects: ["Sales order created in NetSuite"],
      },
      {
        name: "create_purchase_order",
        description: "Create a purchase order in NetSuite",
        inputSchema: { entity: "string", item: "array", tranDate: "string?" },
        sideEffects: ["Purchase order created in NetSuite"],
      },
      {
        name: "create_invoice",
        description: "Create an invoice in NetSuite",
        inputSchema: { entity: "string", item: "array" },
        sideEffects: ["Invoice created in NetSuite"],
      },
    ];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
