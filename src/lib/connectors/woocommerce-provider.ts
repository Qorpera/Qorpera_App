import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

// ── Helpers ──────────────────────────────────────────────

function getBaseUrl(config: ConnectorConfig): string {
  return (config.store_url as string).replace(/\/+$/, "") + "/wp-json/wc/v3";
}

function basicAuth(config: ConnectorConfig): string {
  return "Basic " + Buffer.from(`${config.consumer_key}:${config.consumer_secret}`).toString("base64");
}

async function wooFetch(
  config: ConnectorConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const baseUrl = getBaseUrl(config);

  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: basicAuth(config),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init?.headers,
    },
  });
}

async function* paginateWoo<T>(
  config: ConnectorConfig,
  path: string,
  since?: Date,
): AsyncGenerator<T> {
  let page = 1;

  while (true) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: "100",
    });
    if (since) params.set("modified_after", since.toISOString());

    const sep = path.includes("?") ? "&" : "?";
    const resp = await wooFetch(config, `${path}${sep}${params.toString()}`);
    if (!resp.ok) break;

    const totalPages = parseInt(resp.headers.get("x-wp-totalpages") || "1", 10);
    const items: T[] = await resp.json();

    for (const item of items) {
      yield item;
    }

    if (page >= totalPages) break;
    page++;
  }
}

// ── Provider Implementation ──────────────────────────────

export const woocommerceProvider: ConnectorProvider = {
  id: "woocommerce",
  name: "WooCommerce",

  configSchema: [
    { key: "store_url", label: "Store URL", type: "url", required: true, placeholder: "https://yourstore.com" },
    { key: "consumer_key", label: "Consumer Key", type: "text", required: true, placeholder: "ck_..." },
    { key: "consumer_secret", label: "Consumer Secret", type: "password", required: true, placeholder: "cs_..." },
  ],

  writeCapabilities: [
    {
      slug: "create_order",
      name: "Create Order",
      description: "Create a new order in WooCommerce",
      inputSchema: {
        customerId: "number?",
        billing: "object (first_name, last_name, email, address_1?, city?, country?)",
        line_items: "array<{ product_id: number, quantity: number }>",
        status: "string? (processing, completed, on-hold, etc.)",
      },
    },
    {
      slug: "update_order_status",
      name: "Update Order Status",
      description: "Update an existing order's status in WooCommerce",
      inputSchema: {
        orderId: "number",
        status: "string (processing, completed, on-hold, cancelled)",
      },
    },
    {
      slug: "create_product",
      name: "Create Product",
      description: "Create a new product in WooCommerce",
      inputSchema: {
        name: "string",
        regular_price: "string",
        sku: "string?",
        description: "string?",
        type: "string? (simple | variable)",
      },
    },
  ],

  async testConnection(config) {
    try {
      const resp = await wooFetch(config, "/products?per_page=1");
      if (!resp.ok) {
        return { ok: false, error: `WooCommerce API ${resp.status}: ${resp.statusText}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    // ── Customers ─────────────────────────────────────────
    for await (const c of paginateWoo<any>(config, "/customers", since)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: c.id,
            firstname: c.first_name,
            lastname: c.last_name,
            email: c.email,
            phone: c.billing?.phone,
          },
        },
      };
    }

    // ── Orders ────────────────────────────────────────────
    const recentOrderIds: number[] = [];

    for await (const o of paginateWoo<any>(config, "/orders", since)) {
      recentOrderIds.push(o.id);

      yield {
        kind: "event" as const,
        data: {
          eventType: "order.synced",
          payload: {
            id: o.id,
            order_number: o.number,
            total: o.total,
            currency: o.currency,
            status: o.status,
            fulfillment_status: o.status,
            item_count: o.line_items?.length ?? 0,
            order_date: o.date_created,
          },
        },
      };

      // Derive invoice from order
      const isPaid = o.status === "completed";
      yield {
        kind: "event" as const,
        data: {
          eventType: "invoice.created",
          payload: {
            id: `woo-inv-${o.id}`,
            number: o.number,
            total: o.total,
            amount_due: isPaid ? 0 : o.total,
            status: isPaid ? "paid" : "open",
            currency: o.currency,
            due_date: null,
          },
        },
      };

      if (isPaid) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "invoice.paid",
            payload: {
              id: `woo-inv-${o.id}`,
              number: o.number,
              amount_paid: o.total,
              status: "paid",
            },
          },
        };
      }
    }

    // ── Products ──────────────────────────────────────────
    for await (const p of paginateWoo<any>(config, "/products", since)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "product.synced",
          payload: {
            id: p.id,
            name: p.name,
            sku: p.sku,
            price: p.regular_price,
            status: p.status,
            category: p.categories?.[0]?.name,
          },
        },
      };
    }

    // ── Order notes (content) ─────────────────────────────
    for (const orderId of recentOrderIds.slice(0, 20)) {
      try {
        const resp = await wooFetch(config, `/orders/${orderId}/notes`);
        if (!resp.ok) continue;

        const notes: any[] = await resp.json();
        for (const note of notes) {
          if (!note.note) continue;
          yield {
            kind: "content" as const,
            data: {
              sourceType: "ecommerce_order_note",
              sourceId: `woo-note-${note.id}`,
              content: `Order #${orderId} note: ${note.note}`,
              metadata: { orderId, noteId: note.id, author: note.author },
            },
          };
        }
      } catch {
        // Skip note fetch errors
      }
    }
  },

  async executeAction(config, action, params) {
    try {
      switch (action) {
        case "create_order": {
          const body: Record<string, unknown> = {};
          if (params.customerId) body.customer_id = params.customerId;
          if (params.billing) body.billing = params.billing;
          if (params.line_items) body.line_items = params.line_items;
          if (params.status) body.status = params.status;

          const resp = await wooFetch(config, "/orders", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create order failed (${resp.status}): ${err}` };
          }
          return { success: true, result: await resp.json() };
        }

        case "update_order_status": {
          if (!params.orderId) return { success: false, error: "orderId is required" };
          if (!params.status) return { success: false, error: "status is required" };

          const resp = await wooFetch(config, `/orders/${params.orderId}`, {
            method: "PUT",
            body: JSON.stringify({ status: params.status }),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Update order status failed (${resp.status}): ${err}` };
          }
          return { success: true, result: await resp.json() };
        }

        case "create_product": {
          if (!params.name) return { success: false, error: "name is required" };

          const body: Record<string, unknown> = { name: params.name };
          if (params.regular_price) body.regular_price = params.regular_price;
          if (params.sku) body.sku = params.sku;
          if (params.description) body.description = params.description;
          if (params.type) body.type = params.type;

          const resp = await wooFetch(config, "/products", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create product failed (${resp.status}): ${err}` };
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
        name: "create_order",
        description: "Create a new order in WooCommerce",
        inputSchema: { billing: "object", line_items: "array", status: "string?" },
        sideEffects: ["Order created in WooCommerce"],
      },
      {
        name: "update_order_status",
        description: "Update an order's status in WooCommerce",
        inputSchema: { orderId: "number", status: "string" },
        sideEffects: ["Order status updated in WooCommerce"],
      },
      {
        name: "create_product",
        description: "Create a new product in WooCommerce",
        inputSchema: { name: "string", regular_price: "string", sku: "string?", type: "string?" },
        sideEffects: ["Product created in WooCommerce"],
      },
    ];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
