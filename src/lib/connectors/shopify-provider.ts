import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

// ── Helpers ──────────────────────────────────────────────

function shopifyFetch(
  config: ConnectorConfig,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const storeDomain = config.store_domain as string;
  const accessToken = config.access_token as string;

  return fetch(`https://${storeDomain}/admin/api/2024-01/${path}.json`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function shopifyPaginate<T>(
  config: ConnectorConfig,
  path: string,
  key: string,
): Promise<T[]> {
  const all: T[] = [];
  let nextUrl: string | null = `https://${config.store_domain as string}/admin/api/2024-01/${path}.json`;

  while (nextUrl) {
    const resp: Response = await fetch(nextUrl, {
      headers: {
        "X-Shopify-Access-Token": config.access_token as string,
        "Content-Type": "application/json",
      },
    });
    if (!resp.ok) break;
    const data = await resp.json();
    const items = data[key] || [];
    all.push(...items);

    // Parse Link header for next page
    const linkHeader = resp.headers.get("Link") || "";
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = nextMatch ? nextMatch[1] : null;
  }

  return all;
}

// ── Provider Implementation ──────────────────────────────

export const shopifyProvider: ConnectorProvider = {
  id: "shopify",
  name: "Shopify",

  configSchema: [
    { key: "store_domain", label: "Store Domain", type: "text", required: true, placeholder: "mystore.myshopify.com" },
    { key: "oauth", label: "Shopify Account", type: "oauth", required: true },
  ],

  async testConnection(config) {
    try {
      const resp = await shopifyFetch(config, "shop");
      if (!resp.ok) {
        return {
          ok: false,
          error: `Shopify API ${resp.status}: ${resp.statusText}`,
        };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    const sinceParam = since ? `&created_at_min=${since.toISOString()}` : "";

    // ── Sync orders ───────────────────────────────────────
    const ordersPath = `orders?status=any&limit=250${sinceParam}`;
    const orders = await shopifyPaginate<any>(config, ordersPath, "orders");

    for (const order of orders) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "order.synced",
          payload: {
            id: order.id,
            order_number: order.order_number,
            name: order.name,
            total: order.total_price,
            currency: order.currency,
            status: order.financial_status,
            fulfillment_status: order.fulfillment_status,
            item_count: order.line_items?.length ?? 0,
            order_date: order.created_at,
          },
        },
      };

      yield {
        kind: "activity" as const,
        data: {
          signalType: "order_created",
          metadata: {
            total: order.total_price,
            currency: order.currency,
            fulfillment_status: order.fulfillment_status,
          },
          occurredAt: new Date(order.created_at),
        },
      };

      // Order → Customer association
      if (order.customer?.id) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "association.found",
            payload: {
              fromSourceSystem: "shopify",
              fromExternalId: String(order.customer.id),
              toSourceSystem: "shopify",
              toExternalId: String(order.id),
              relationshipType: "ordered",
            },
          },
        };
      }

      // Refunds → activity signals
      if (order.refunds && order.refunds.length > 0) {
        for (const refund of order.refunds) {
          const refundAmount = refund.transactions?.reduce(
            (sum: number, t: any) => sum + parseFloat(t.amount || "0"),
            0,
          ) ?? 0;

          yield {
            kind: "activity" as const,
            data: {
              signalType: "order_refunded",
              metadata: {
                orderId: order.id,
                amount: refundAmount,
                reason: refund.note,
              },
              occurredAt: new Date(refund.created_at),
            },
          };
        }
      }
    }

    // ── Sync products ─────────────────────────────────────
    const products = await shopifyPaginate<any>(config, "products?limit=250", "products");

    for (const prod of products) {
      const firstVariant = prod.variants?.[0];
      const inventoryCount = (prod.variants || []).reduce(
        (sum: number, v: any) => sum + (v.inventory_quantity ?? 0),
        0,
      );

      yield {
        kind: "event" as const,
        data: {
          eventType: "product.synced",
          payload: {
            id: prod.id,
            name: prod.title,
            sku: firstVariant?.sku,
            price: firstVariant?.price,
            currency: (config as any).shop_currency || "USD",
            status: prod.status,
            category: prod.product_type,
            inventory_count: inventoryCount,
          },
        },
      };
    }

    // ── Sync customers ────────────────────────────────────
    const customers = await shopifyPaginate<any>(config, "customers?limit=250", "customers");

    for (const cust of customers) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "customer.synced",
          payload: {
            id: cust.id,
            name: `${cust.first_name || ""} ${cust.last_name || ""}`.trim(),
            email: cust.email,
            phone: cust.phone,
          },
        },
      };
    }
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [];
  },

  async inferSchema(config): Promise<InferredSchema[]> {
    const schemas: InferredSchema[] = [];

    const ordResp = await shopifyFetch(config, "orders?limit=5&status=any");
    if (ordResp.ok) {
      const data = await ordResp.json();
      const records = data.orders || [];
      schemas.push({
        suggestedTypeName: "Order",
        suggestedProperties: [
          { name: "order-number", dataType: "STRING", sampleValues: records.map((r: any) => String(r.order_number)).slice(0, 5) },
          { name: "total", dataType: "CURRENCY", sampleValues: records.map((r: any) => r.total_price).filter(Boolean).slice(0, 5) },
          { name: "status", dataType: "STRING", sampleValues: records.map((r: any) => r.financial_status).filter(Boolean).slice(0, 5) },
        ],
        sampleEntities: records.map((r: any) => ({
          name: r.name || "",
          total: r.total_price || "",
          status: r.financial_status || "",
        })),
        recordCount: records.length,
      });
    }

    const prodResp = await shopifyFetch(config, "products?limit=5");
    if (prodResp.ok) {
      const data = await prodResp.json();
      const records = data.products || [];
      schemas.push({
        suggestedTypeName: "Product",
        suggestedProperties: [
          { name: "title", dataType: "STRING", sampleValues: records.map((r: any) => r.title).filter(Boolean).slice(0, 5) },
          { name: "status", dataType: "STRING", sampleValues: records.map((r: any) => r.status).filter(Boolean).slice(0, 5) },
          { name: "product_type", dataType: "STRING", sampleValues: records.map((r: any) => r.product_type).filter(Boolean).slice(0, 5) },
        ],
        sampleEntities: records.map((r: any) => ({
          title: r.title || "",
          status: r.status || "",
          type: r.product_type || "",
        })),
        recordCount: records.length,
      });
    }

    return schemas;
  },
};
