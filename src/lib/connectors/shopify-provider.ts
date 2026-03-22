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

  async executeAction(config, actionId, params) {
    switch (actionId) {
      case "update_product": {
        const { productId, title, description, status } = params as {
          productId: string;
          title?: string;
          description?: string;
          status?: "active" | "draft" | "archived";
        };
        if (!productId) return { success: false, error: "productId is required" };
        const product: Record<string, unknown> = {};
        if (title !== undefined) product.title = title;
        if (description !== undefined) product.body_html = description;
        if (status !== undefined) product.status = status;
        const resp = await shopifyFetch(config, `products/${productId}`, {
          method: "PUT",
          body: JSON.stringify({ product }),
        });
        if (!resp.ok) {
          const err = await resp.text();
          return { success: false, error: `Shopify ${resp.status}: ${err}` };
        }
        const data = await resp.json();
        return { success: true, result: data.product };
      }

      case "update_product_price": {
        const { variantId, price } = params as {
          variantId: string;
          price: string;
        };
        if (!variantId) return { success: false, error: "variantId is required" };
        if (price === undefined) return { success: false, error: "price is required" };
        const resp = await shopifyFetch(config, `variants/${variantId}`, {
          method: "PUT",
          body: JSON.stringify({ variant: { price } }),
        });
        if (!resp.ok) {
          const err = await resp.text();
          return { success: false, error: `Shopify ${resp.status}: ${err}` };
        }
        const data = await resp.json();
        return { success: true, result: data.variant };
      }

      case "update_inventory": {
        const { inventoryItemId, locationId, available } = params as {
          inventoryItemId: string;
          locationId: string;
          available: number;
        };
        if (!inventoryItemId) return { success: false, error: "inventoryItemId is required" };
        if (!locationId) return { success: false, error: "locationId is required" };
        if (available === undefined) return { success: false, error: "available is required" };
        const resp = await shopifyFetch(config, "inventory_levels/set", {
          method: "POST",
          body: JSON.stringify({
            inventory_item_id: inventoryItemId,
            location_id: locationId,
            available,
          }),
        });
        if (!resp.ok) {
          const err = await resp.text();
          return { success: false, error: `Shopify ${resp.status}: ${err}` };
        }
        const data = await resp.json();
        return { success: true, result: data.inventory_level };
      }

      case "create_fulfillment": {
        const { orderId, trackingNumber, trackingCompany, trackingUrl } = params as {
          orderId: string;
          trackingNumber?: string;
          trackingCompany?: string;
          trackingUrl?: string;
        };
        if (!orderId) return { success: false, error: "orderId is required" };
        const fulfillment: Record<string, unknown> = { notify_customer: true };
        if (trackingNumber !== undefined) fulfillment.tracking_number = trackingNumber;
        if (trackingCompany !== undefined) fulfillment.tracking_company = trackingCompany;
        if (trackingUrl !== undefined) fulfillment.tracking_url = trackingUrl;
        const resp = await shopifyFetch(config, `orders/${orderId}/fulfillments`, {
          method: "POST",
          body: JSON.stringify({ fulfillment }),
        });
        if (!resp.ok) {
          const err = await resp.text();
          return { success: false, error: `Shopify ${resp.status}: ${err}` };
        }
        const data = await resp.json();
        return { success: true, result: data.fulfillment };
      }

      case "cancel_order": {
        const { orderId, reason } = params as {
          orderId: string;
          reason?: "customer" | "fraud" | "inventory" | "declined" | "other";
        };
        if (!orderId) return { success: false, error: "orderId is required" };
        const body: Record<string, unknown> = {};
        if (reason !== undefined) body.reason = reason;
        const resp = await shopifyFetch(config, `orders/${orderId}/cancel`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const err = await resp.text();
          return { success: false, error: `Shopify ${resp.status}: ${err}` };
        }
        const data = await resp.json();
        return { success: true, result: data.order };
      }

      case "create_discount": {
        const { code, type, value, startsAt, endsAt, usageLimit } = params as {
          code: string;
          type: "percentage" | "fixed_amount";
          value: number;
          startsAt?: string;
          endsAt?: string;
          usageLimit?: number;
        };
        if (!code) return { success: false, error: "code is required" };
        if (!type) return { success: false, error: "type is required" };
        if (value === undefined) return { success: false, error: "value is required" };

        const priceRule: Record<string, unknown> = {
          title: code,
          target_type: "line_item",
          target_selection: "all",
          allocation_method: "across",
          value_type: type,
          value: -Math.abs(value),
          customer_selection: "all",
        };
        if (startsAt !== undefined) priceRule.starts_at = startsAt;
        if (endsAt !== undefined) priceRule.ends_at = endsAt;
        if (usageLimit !== undefined) priceRule.usage_limit = usageLimit;

        const ruleResp = await shopifyFetch(config, "price_rules", {
          method: "POST",
          body: JSON.stringify({ price_rule: priceRule }),
        });
        if (!ruleResp.ok) {
          const err = await ruleResp.text();
          return { success: false, error: `Shopify price_rule ${ruleResp.status}: ${err}` };
        }
        const ruleData = await ruleResp.json();
        const priceRuleId = ruleData.price_rule?.id;

        const codeResp = await shopifyFetch(config, `price_rules/${priceRuleId}/discount_codes`, {
          method: "POST",
          body: JSON.stringify({ discount_code: { code } }),
        });
        if (!codeResp.ok) {
          const err = await codeResp.text();
          return { success: false, error: `Shopify discount_code ${codeResp.status}: ${err}` };
        }
        const codeData = await codeResp.json();
        return {
          success: true,
          result: { price_rule: ruleData.price_rule, discount_code: codeData.discount_code },
        };
      }

      case "add_order_note": {
        const { orderId, note } = params as { orderId: string; note: string };
        if (!orderId) return { success: false, error: "orderId is required" };
        if (!note) return { success: false, error: "note is required" };
        const resp = await shopifyFetch(config, `orders/${orderId}`, {
          method: "PUT",
          body: JSON.stringify({ order: { id: orderId, note } }),
        });
        if (!resp.ok) {
          const err = await resp.text();
          return { success: false, error: `Shopify ${resp.status}: ${err}` };
        }
        const data = await resp.json();
        return { success: true, result: data.order };
      }

      default:
        return { success: false, error: `Unknown action: ${actionId}` };
    }
  },

  writeCapabilities: [
    {
      slug: "update_product",
      name: "Update Product",
      description: "Update a Shopify product's title, description, or status",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: ["active", "draft", "archived"] },
        },
        required: ["productId"],
      },
    },
    {
      slug: "update_product_price",
      name: "Update Product Price",
      description: "Update the price of a Shopify product variant",
      inputSchema: {
        type: "object",
        properties: {
          variantId: { type: "string" },
          price: { type: "string" },
        },
        required: ["variantId", "price"],
      },
    },
    {
      slug: "update_inventory",
      name: "Update Inventory",
      description: "Set the available inventory level for an item at a location",
      inputSchema: {
        type: "object",
        properties: {
          inventoryItemId: { type: "string" },
          locationId: { type: "string" },
          available: { type: "number" },
        },
        required: ["inventoryItemId", "locationId", "available"],
      },
    },
    {
      slug: "create_fulfillment",
      name: "Create Fulfillment",
      description: "Create a fulfillment for an order with optional tracking info",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string" },
          trackingNumber: { type: "string" },
          trackingCompany: { type: "string" },
          trackingUrl: { type: "string" },
        },
        required: ["orderId"],
      },
    },
    {
      slug: "cancel_order",
      name: "Cancel Order",
      description: "Cancel a Shopify order with an optional reason",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string" },
          reason: { type: "string", enum: ["customer", "fraud", "inventory", "declined", "other"] },
        },
        required: ["orderId"],
      },
    },
    {
      slug: "create_discount",
      name: "Create Discount Code",
      description: "Create a price rule and discount code for percentage or fixed-amount discounts",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string" },
          type: { type: "string", enum: ["percentage", "fixed_amount"] },
          value: { type: "number" },
          startsAt: { type: "string" },
          endsAt: { type: "string" },
          usageLimit: { type: "number" },
        },
        required: ["code", "type", "value"],
      },
    },
    {
      slug: "add_order_note",
      name: "Add Order Note",
      description: "Add or update the note on a Shopify order",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string" },
          note: { type: "string" },
        },
        required: ["orderId", "note"],
      },
    },
  ],

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [
      { name: "update_product", description: "Update a Shopify product's title, description, or status", inputSchema: { productId: { type: "string", required: true }, title: { type: "string", required: false }, description: { type: "string", required: false }, status: { type: "string", required: false } }, sideEffects: ["Modifies a product in the Shopify store"] },
      { name: "update_product_price", description: "Update the price of a Shopify product variant", inputSchema: { variantId: { type: "string", required: true }, price: { type: "string", required: true } }, sideEffects: ["Changes the price of a product variant"] },
      { name: "update_inventory", description: "Set the available inventory level for an item at a location", inputSchema: { inventoryItemId: { type: "string", required: true }, locationId: { type: "string", required: true }, available: { type: "number", required: true } }, sideEffects: ["Updates inventory count for the item at the specified location"] },
      { name: "create_fulfillment", description: "Create a fulfillment for an order with optional tracking info", inputSchema: { orderId: { type: "string", required: true }, trackingNumber: { type: "string", required: false }, trackingCompany: { type: "string", required: false }, trackingUrl: { type: "string", required: false } }, sideEffects: ["Creates a fulfillment record and notifies the customer"] },
      { name: "cancel_order", description: "Cancel a Shopify order with an optional reason", inputSchema: { orderId: { type: "string", required: true }, reason: { type: "string", required: false } }, sideEffects: ["Cancels the order in Shopify"] },
      { name: "create_discount", description: "Create a price rule and discount code", inputSchema: { code: { type: "string", required: true }, type: { type: "string", required: true }, value: { type: "number", required: true }, startsAt: { type: "string", required: false }, endsAt: { type: "string", required: false }, usageLimit: { type: "number", required: false } }, sideEffects: ["Creates a price rule and discount code in Shopify"] },
      { name: "add_order_note", description: "Add or update the note on a Shopify order", inputSchema: { orderId: { type: "string", required: true }, note: { type: "string", required: true } }, sideEffects: ["Modifies the order note in Shopify"] },
    ];
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
