import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

// ── Helpers ──────────────────────────────────────────────

function tracezillaBaseUrl(config: ConnectorConfig): string {
  const slug = config.company_slug as string;
  return `https://${slug}.tracezilla.com/api/v1`;
}

async function tracezillaFetch(
  config: ConnectorConfig,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const apiToken = config.api_token as string;
  if (!apiToken) throw new Error("Tracezilla API token not configured");

  const slug = config.company_slug as string;
  if (!slug) throw new Error("Tracezilla company slug not configured");

  return fetch(`${tracezillaBaseUrl(config)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function* paginateTracezilla<T>(
  config: ConnectorConfig,
  basePath: string
): AsyncGenerator<T> {
  let page = 1;

  while (true) {
    const separator = basePath.includes("?") ? "&" : "?";
    const url = `${basePath}${separator}page=${page}&per_page=100`;
    const resp = await tracezillaFetch(config, url);
    if (!resp.ok) break;
    const data = await resp.json();

    const items = data.data || data.items || [];
    if (items.length === 0) break;

    for (const item of items) {
      yield item as T;
    }

    const pagination = data.pagination || data.meta;
    if (!pagination || page >= (pagination.last_page || pagination.total_pages || 1)) break;
    page++;
  }
}

// ── Provider Implementation ──────────────────────────────

export const tracezillaProvider: ConnectorProvider = {
  id: "tracezilla",
  name: "Tracezilla",

  configSchema: [
    {
      key: "company_slug",
      label: "Company Slug",
      type: "text",
      required: true,
      placeholder: "Your company URL prefix (e.g. 'hansens' from hansens.tracezilla.com)",
    },
    {
      key: "api_token",
      label: "API Token",
      type: "password",
      required: true,
      placeholder: "From Tracezilla → Company Settings → REST API",
    },
  ],

  writeCapabilities: [
    {
      slug: "create_sales_order",
      name: "Create Sales Order",
      description: "Create a sales order in Tracezilla for a customer with line items",
      inputSchema: {
        customerId: "number",
        lines: "array<{ skuId: number, quantity: number, unitPrice: number }>",
        deliveryDate: "string (ISO date)",
        reference: "string? (optional external reference)",
      },
    },
    {
      slug: "update_order_status",
      name: "Update Order Status",
      description: "Update the status of an order in Tracezilla",
      inputSchema: {
        orderId: "number",
        status: "string (confirmed | delivered)",
      },
    },
    {
      slug: "adjust_lot_quantity",
      name: "Adjust Lot Quantity",
      description: "Adjust the quantity of a lot/batch in Tracezilla (positive or negative)",
      inputSchema: {
        lotId: "number",
        quantityChange: "number (positive to add, negative to subtract)",
        reason: "string",
      },
    },
  ],

  async testConnection(config) {
    try {
      const resp = await tracezillaFetch(config, "/skus?per_page=1");
      if (!resp.ok) {
        return {
          ok: false,
          error: `Tracezilla API ${resp.status}: ${resp.statusText}`,
        };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    // ── Sync sales orders ─────────────────────────────────
    let salesPath = "/orders/sales";
    if (since) {
      const sinceDate = since.toISOString().slice(0, 10);
      salesPath += `?updated_after=${sinceDate}`;
    }

    for await (const order of paginateTracezilla<any>(config, salesPath)) {
      const totalAmount =
        order.total_amount ?? order.totalAmount ?? order.total ?? 0;
      const currency = order.currency || "DKK";
      const customerName =
        order.customer?.name || order.customer_name || "Ukendt kunde";
      const customerEmail = order.customer?.email || order.customer_email || "";
      const orderNumber =
        order.order_number || order.orderNumber || String(order.id);
      const status = order.status || "unknown";
      const deliveryDate =
        order.delivery_date || order.deliveryDate || order.expected_delivery;
      const createdAt = order.created_at || order.createdAt;

      yield {
        kind: "event" as const,
        data: {
          eventType: "order.synced",
          payload: {
            id: order.id,
            orderNumber,
            customerName,
            customerEmail,
            status,
            totalAmount,
            currency,
            deliveryDate,
            createdAt,
          },
        },
      };

      // Content yield: human-readable order summary
      const lines = order.lines || order.order_lines || [];
      const linesSummary = lines
        .map(
          (l: any) =>
            `  - ${l.sku_name || l.skuName || l.product_name || "Vare"}: ${l.quantity} stk. á ${l.unit_price || l.unitPrice || "?"} ${currency}`
        )
        .join("\n");

      const contentSummary = [
        `Salgsordre ${orderNumber} — ${customerName}`,
        `Status: ${status} | Total: ${totalAmount} ${currency}`,
        deliveryDate ? `Leveringsdato: ${deliveryDate}` : null,
        linesSummary ? `Ordrelinjer:\n${linesSummary}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      yield {
        kind: "content" as const,
        data: {
          sourceType: "erp_order",
          sourceId: `tracezilla-sales-order-${order.id}`,
          content: contentSummary,
          metadata: {
            orderNumber,
            customerName,
            customerEmail,
            status,
            totalAmount,
            currency,
            deliveryDate,
          },
        },
      };
    }

    // ── Sync purchase orders ──────────────────────────────
    let purchasePath = "/orders/purchase";
    if (since) {
      const sinceDate = since.toISOString().slice(0, 10);
      purchasePath += `?updated_after=${sinceDate}`;
    }

    for await (const po of paginateTracezilla<any>(config, purchasePath)) {
      const totalAmount =
        po.total_amount ?? po.totalAmount ?? po.total ?? 0;
      const orderNumber =
        po.order_number || po.orderNumber || String(po.id);
      const supplierName =
        po.supplier?.name || po.supplier_name || "Ukendt leverandør";
      const status = po.status || "unknown";
      const expectedDeliveryDate =
        po.expected_delivery_date ||
        po.expectedDeliveryDate ||
        po.delivery_date;

      yield {
        kind: "event" as const,
        data: {
          eventType: "purchase_order.synced",
          payload: {
            id: po.id,
            orderNumber,
            supplierName,
            status,
            totalAmount,
            expectedDeliveryDate,
          },
        },
      };
    }

    // ── Sync lots / batches ───────────────────────────────
    let lotsPath = "/lots";
    if (since) {
      const sinceDate = since.toISOString().slice(0, 10);
      lotsPath += `?updated_after=${sinceDate}`;
    }

    for await (const lot of paginateTracezilla<any>(config, lotsPath)) {
      const lotNumber = lot.lot_number || lot.lotNumber || String(lot.id);
      const skuName = lot.sku?.name || lot.sku_name || "";
      const skuNumber = lot.sku?.number || lot.sku_number || "";
      const quantity = lot.quantity ?? 0;
      const unit = lot.unit || lot.sku?.unit || "stk";
      const expiryDate = lot.expiry_date || lot.expiryDate;
      const organicStatus = lot.organic_status || lot.organicStatus || lot.organic;
      const locationName =
        lot.location?.name || lot.location_name || "";
      const status = lot.status || "available";

      yield {
        kind: "event" as const,
        data: {
          eventType: "lot.synced",
          payload: {
            id: lot.id,
            lotNumber,
            skuName,
            skuNumber,
            quantity,
            unit,
            expiryDate,
            organicStatus,
            locationName,
            status,
          },
        },
      };
    }

    // ── Sync inventory ────────────────────────────────────
    for await (const inv of paginateTracezilla<any>(config, "/inventory")) {
      const skuId = inv.sku_id || inv.skuId || inv.sku?.id;
      const skuName = inv.sku?.name || inv.sku_name || "";
      const skuNumber = inv.sku?.number || inv.sku_number || "";
      const locationName =
        inv.location?.name || inv.location_name || "";
      const quantityAvailable =
        inv.quantity_available ?? inv.quantityAvailable ?? inv.available ?? 0;
      const quantityReserved =
        inv.quantity_reserved ?? inv.quantityReserved ?? inv.reserved ?? 0;
      const unit = inv.unit || inv.sku?.unit || "stk";

      yield {
        kind: "event" as const,
        data: {
          eventType: "inventory.synced",
          payload: {
            skuId,
            skuName,
            skuNumber,
            locationName,
            quantityAvailable,
            quantityReserved,
            unit,
          },
        },
      };
    }

    // ── Sync deliveries ───────────────────────────────────
    let deliveriesPath = "/deliveries";
    if (since) {
      const sinceDate = since.toISOString().slice(0, 10);
      deliveriesPath += `?updated_after=${sinceDate}`;
    }

    for await (const del of paginateTracezilla<any>(config, deliveriesPath)) {
      const orderNumber =
        del.order_number || del.orderNumber || "";
      const customerName =
        del.customer?.name || del.customer_name || "";
      const status = del.status || "unknown";
      const deliveryDate = del.delivery_date || del.deliveryDate;
      const carrierName =
        del.carrier?.name || del.carrier_name || "";
      const trackingNumber =
        del.tracking_number || del.trackingNumber || "";

      yield {
        kind: "event" as const,
        data: {
          eventType: "delivery.synced",
          payload: {
            id: del.id,
            orderNumber,
            customerName,
            status,
            deliveryDate,
            carrierName,
            trackingNumber,
          },
        },
      };
    }

    // ── Sync SKUs / products ──────────────────────────────
    for await (const sku of paginateTracezilla<any>(config, "/skus")) {
      const name = sku.name || "";
      const number = sku.number || sku.sku_number || String(sku.id);
      const category = sku.category?.name || sku.category || "";
      const unit = sku.unit || "stk";
      const organic = sku.organic ?? sku.is_organic ?? false;
      const allergens = sku.allergens || [];
      const shelfLifeDays =
        sku.shelf_life_days ?? sku.shelfLifeDays ?? null;

      yield {
        kind: "event" as const,
        data: {
          eventType: "product.synced",
          payload: {
            id: sku.id,
            name,
            number,
            category,
            unit,
            organic,
            allergens,
            shelfLifeDays,
          },
        },
      };
    }
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [
      {
        name: "create_sales_order",
        description: "Create a sales order in Tracezilla for a customer with line items",
        inputSchema: {
          customerId: "number",
          lines: "array<{ skuId: number, quantity: number, unitPrice: number }>",
          deliveryDate: "string (ISO date)",
          reference: "string? (optional external reference)",
        },
        sideEffects: ["Sales order created in Tracezilla"],
      },
      {
        name: "update_order_status",
        description: "Update the status of an order in Tracezilla",
        inputSchema: {
          orderId: "number",
          status: "string (confirmed | delivered)",
        },
        sideEffects: ["Order status updated in Tracezilla"],
      },
      {
        name: "adjust_lot_quantity",
        description: "Adjust the quantity of a lot/batch in Tracezilla",
        inputSchema: {
          lotId: "number",
          quantityChange: "number",
          reason: "string",
        },
        sideEffects: [
          "Lot quantity adjusted in Tracezilla",
          "Inventory levels updated accordingly",
        ],
      },
    ];
  },

  async executeAction(config, action, params) {
    try {
      switch (action) {
        // ── 1. Create sales order ─────────────────────────────
        case "create_sales_order": {
          if (!params.customerId) return { success: false, error: "customerId is required" };
          if (!params.lines || !Array.isArray(params.lines)) return { success: false, error: "lines is required" };
          if (!params.deliveryDate) return { success: false, error: "deliveryDate is required" };
          const customerId = params.customerId as number;
          const lines = params.lines as Array<{
            skuId: number;
            quantity: number;
            unitPrice: number;
          }>;
          const deliveryDate = params.deliveryDate as string;
          const reference = params.reference as string | undefined;

          const body: Record<string, unknown> = {
            customer_id: customerId,
            delivery_date: deliveryDate,
            lines: lines.map((line) => ({
              sku_id: line.skuId,
              quantity: line.quantity,
              unit_price: line.unitPrice,
            })),
          };
          if (reference) body.reference = reference;

          const resp = await tracezillaFetch(config, "/orders/sales", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create sales order failed (${resp.status}): ${err}` };
          }
          return { success: true, result: await resp.json() };
        }

        // ── 2. Update order status ────────────────────────────
        case "update_order_status": {
          if (!params.orderId) return { success: false, error: "orderId is required" };
          if (!params.status) return { success: false, error: "status is required" };
          const orderId = params.orderId as number;
          const status = params.status as string;

          if (!["confirmed", "delivered"].includes(status)) {
            return { success: false, error: "status must be 'confirmed' or 'delivered'" };
          }

          const resp = await tracezillaFetch(config, `/orders/${orderId}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Update order status failed (${resp.status}): ${err}` };
          }
          return { success: true, result: await resp.json() };
        }

        // ── 3. Adjust lot quantity ────────────────────────────
        case "adjust_lot_quantity": {
          if (!params.lotId) return { success: false, error: "lotId is required" };
          if (params.quantityChange === undefined || params.quantityChange === null)
            return { success: false, error: "quantityChange is required" };
          if (!params.reason) return { success: false, error: "reason is required" };
          const lotId = params.lotId as number;
          const quantityChange = params.quantityChange as number;
          const reason = params.reason as string;

          const resp = await tracezillaFetch(config, `/lots/${lotId}/adjust`, {
            method: "POST",
            body: JSON.stringify({
              quantity_change: quantityChange,
              reason,
            }),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Adjust lot quantity failed (${resp.status}): ${err}` };
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

  async inferSchema(config): Promise<InferredSchema[]> {
    const schemas: InferredSchema[] = [];

    // Sales Orders
    const orderResp = await tracezillaFetch(config, "/orders/sales?per_page=5");
    if (orderResp.ok) {
      const orderData = await orderResp.json();
      const records = orderData.data || orderData.items || [];
      schemas.push({
        suggestedTypeName: "Sales Order",
        suggestedProperties: [
          { name: "orderNumber", dataType: "STRING", sampleValues: records.map((r: any) => String(r.order_number || r.orderNumber || r.id || "")).filter((v: string) => v !== "").slice(0, 5) },
          { name: "customerName", dataType: "STRING", sampleValues: records.map((r: any) => r.customer?.name || r.customer_name || "").filter(Boolean).slice(0, 5) },
          { name: "status", dataType: "STRING", sampleValues: records.map((r: any) => r.status || "").filter(Boolean).slice(0, 5) },
          { name: "totalAmount", dataType: "CURRENCY", sampleValues: records.map((r: any) => String(r.total_amount ?? r.totalAmount ?? r.total ?? "")).filter((v: string) => v !== "").slice(0, 5) },
          { name: "deliveryDate", dataType: "DATE", sampleValues: records.map((r: any) => r.delivery_date || r.deliveryDate || "").filter(Boolean).slice(0, 5) },
        ],
        sampleEntities: records.map((r: any) => ({
          orderNumber: String(r.order_number || r.orderNumber || r.id || ""),
          customerName: r.customer?.name || r.customer_name || "",
          status: r.status || "",
          totalAmount: String(r.total_amount ?? r.totalAmount ?? r.total ?? ""),
        })),
        recordCount: records.length,
      });
    }

    // Lots / Batches
    const lotResp = await tracezillaFetch(config, "/lots?per_page=5");
    if (lotResp.ok) {
      const lotData = await lotResp.json();
      const records = lotData.data || lotData.items || [];
      schemas.push({
        suggestedTypeName: "Lot/Batch",
        suggestedProperties: [
          { name: "lotNumber", dataType: "STRING", sampleValues: records.map((r: any) => String(r.lot_number || r.lotNumber || r.id || "")).filter((v: string) => v !== "").slice(0, 5) },
          { name: "skuName", dataType: "STRING", sampleValues: records.map((r: any) => r.sku?.name || r.sku_name || "").filter(Boolean).slice(0, 5) },
          { name: "quantity", dataType: "NUMBER", sampleValues: records.map((r: any) => String(r.quantity ?? "")).filter((v: string) => v !== "").slice(0, 5) },
          { name: "expiryDate", dataType: "DATE", sampleValues: records.map((r: any) => r.expiry_date || r.expiryDate || "").filter(Boolean).slice(0, 5) },
          { name: "organicStatus", dataType: "STRING", sampleValues: records.map((r: any) => String(r.organic_status || r.organicStatus || r.organic || "")).filter(Boolean).slice(0, 5) },
          { name: "status", dataType: "STRING", sampleValues: records.map((r: any) => r.status || "").filter(Boolean).slice(0, 5) },
        ],
        sampleEntities: records.map((r: any) => ({
          lotNumber: String(r.lot_number || r.lotNumber || r.id || ""),
          skuName: r.sku?.name || r.sku_name || "",
          quantity: String(r.quantity ?? ""),
          expiryDate: r.expiry_date || r.expiryDate || "",
          status: r.status || "",
        })),
        recordCount: records.length,
      });
    }

    // SKUs / Products
    const skuResp = await tracezillaFetch(config, "/skus?per_page=5");
    if (skuResp.ok) {
      const skuData = await skuResp.json();
      const records = skuData.data || skuData.items || [];
      schemas.push({
        suggestedTypeName: "SKU/Product",
        suggestedProperties: [
          { name: "number", dataType: "STRING", sampleValues: records.map((r: any) => String(r.number || r.sku_number || r.id || "")).filter((v: string) => v !== "").slice(0, 5) },
          { name: "name", dataType: "STRING", sampleValues: records.map((r: any) => r.name || "").filter(Boolean).slice(0, 5) },
          { name: "category", dataType: "STRING", sampleValues: records.map((r: any) => r.category?.name || r.category || "").filter(Boolean).slice(0, 5) },
          { name: "unit", dataType: "STRING", sampleValues: records.map((r: any) => r.unit || "").filter(Boolean).slice(0, 5) },
          { name: "organic", dataType: "BOOLEAN", sampleValues: records.map((r: any) => String(r.organic ?? r.is_organic ?? "")).filter((v: string) => v !== "").slice(0, 5) },
          { name: "shelfLifeDays", dataType: "NUMBER", sampleValues: records.map((r: any) => String(r.shelf_life_days ?? r.shelfLifeDays ?? "")).filter((v: string) => v !== "").slice(0, 5) },
        ],
        sampleEntities: records.map((r: any) => ({
          number: String(r.number || r.sku_number || r.id || ""),
          name: r.name || "",
          category: r.category?.name || r.category || "",
          unit: r.unit || "",
          organic: String(r.organic ?? r.is_organic ?? ""),
        })),
        recordCount: records.length,
      });
    }

    // Inventory
    const invResp = await tracezillaFetch(config, "/inventory?per_page=5");
    if (invResp.ok) {
      const invData = await invResp.json();
      const records = invData.data || invData.items || [];
      schemas.push({
        suggestedTypeName: "Inventory",
        suggestedProperties: [
          { name: "skuName", dataType: "STRING", sampleValues: records.map((r: any) => r.sku?.name || r.sku_name || "").filter(Boolean).slice(0, 5) },
          { name: "skuNumber", dataType: "STRING", sampleValues: records.map((r: any) => r.sku?.number || r.sku_number || "").filter(Boolean).slice(0, 5) },
          { name: "locationName", dataType: "STRING", sampleValues: records.map((r: any) => r.location?.name || r.location_name || "").filter(Boolean).slice(0, 5) },
          { name: "quantityAvailable", dataType: "NUMBER", sampleValues: records.map((r: any) => String(r.quantity_available ?? r.quantityAvailable ?? r.available ?? "")).filter((v: string) => v !== "").slice(0, 5) },
          { name: "quantityReserved", dataType: "NUMBER", sampleValues: records.map((r: any) => String(r.quantity_reserved ?? r.quantityReserved ?? r.reserved ?? "")).filter((v: string) => v !== "").slice(0, 5) },
          { name: "unit", dataType: "STRING", sampleValues: records.map((r: any) => r.unit || r.sku?.unit || "").filter(Boolean).slice(0, 5) },
        ],
        sampleEntities: records.map((r: any) => ({
          skuName: r.sku?.name || r.sku_name || "",
          skuNumber: r.sku?.number || r.sku_number || "",
          locationName: r.location?.name || r.location_name || "",
          quantityAvailable: String(r.quantity_available ?? r.quantityAvailable ?? r.available ?? ""),
          quantityReserved: String(r.quantity_reserved ?? r.quantityReserved ?? r.reserved ?? ""),
        })),
        recordCount: records.length,
      });
    }

    return schemas;
  },
};
