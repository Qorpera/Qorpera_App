import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

// ── Helpers ──────────────────────────────────────────────

async function getValidToken(config: ConnectorConfig): Promise<string> {
  const expiry = new Date(config.token_expiry as string);

  if (expiry.getTime() > Date.now() + 5 * 60 * 1000) {
    return config.access_token as string;
  }

  const resp = await fetch(
    `https://login.microsoftonline.com/${config.tenant_id}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.DYNAMICS_BC_CLIENT_ID!,
        client_secret: process.env.DYNAMICS_BC_CLIENT_SECRET!,
        refresh_token: config.refresh_token as string,
        scope: "https://api.businesscentral.dynamics.com/.default offline_access",
      }),
    },
  );

  if (!resp.ok) throw new Error(`Dynamics BC token refresh failed: ${resp.status}`);
  const data = await resp.json();

  config.access_token = data.access_token;
  if (data.refresh_token) config.refresh_token = data.refresh_token;
  config.token_expiry = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();

  return data.access_token;
}

function bcBaseUrl(config: ConnectorConfig): string {
  return `https://api.businesscentral.dynamics.com/v2.0/${config.tenant_id}/${config.environment}/api/v2.0/companies(${config.company_id})`;
}

async function bcRequest(
  config: ConnectorConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const token = await getValidToken(config);

  const resp = await fetch(`${bcBaseUrl(config)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return { ok: false, status: resp.status, error: errText };
  }

  if (resp.status === 204) {
    return { ok: true, status: 204 };
  }

  const data = await resp.json();
  return { ok: true, status: resp.status, data };
}

async function* bcPaginate<T>(
  config: ConnectorConfig,
  path: string,
): AsyncGenerator<T> {
  const token = await getValidToken(config);
  let url: string | null = `${bcBaseUrl(config)}${path}`;

  while (url) {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) break;
    const data: any = await resp.json();

    for (const item of data.value || []) {
      yield item;
    }

    url = data["@odata.nextLink"] || null;
  }
}

// ── Provider Implementation ──────────────────────────────

export const dynamicsBcProvider: ConnectorProvider = {
  id: "dynamics-bc",
  name: "Dynamics 365 Business Central",

  configSchema: [
    { key: "oauth", label: "Microsoft Business Central", type: "oauth", required: true },
  ],

  writeCapabilities: [
    {
      slug: "create_sales_order",
      name: "Create Sales Order",
      description: "Creates a new sales order in Business Central",
      inputSchema: { type: "object", properties: { customerNumber: { type: "string" }, orderDate: { type: "string" }, lines: { type: "array" } }, required: ["customerNumber"] },
    },
    {
      slug: "update_sales_order",
      name: "Update Sales Order",
      description: "Updates an existing sales order in Business Central",
      inputSchema: { type: "object", properties: { salesOrderId: { type: "string" }, fields: { type: "object" } }, required: ["salesOrderId", "fields"] },
    },
    {
      slug: "create_purchase_order",
      name: "Create Purchase Order",
      description: "Creates a new purchase order in Business Central",
      inputSchema: { type: "object", properties: { vendorNumber: { type: "string" }, orderDate: { type: "string" }, lines: { type: "array" } }, required: ["vendorNumber"] },
    },
    {
      slug: "create_customer",
      name: "Create Customer",
      description: "Creates a new customer in Business Central",
      inputSchema: { type: "object", properties: { displayName: { type: "string" }, email: { type: "string" }, phoneNumber: { type: "string" }, address: { type: "string" } }, required: ["displayName"] },
    },
    {
      slug: "create_sales_invoice",
      name: "Create Sales Invoice",
      description: "Creates a sales invoice in Business Central",
      inputSchema: { type: "object", properties: { customerNumber: { type: "string" }, lines: { type: "array" } }, required: ["customerNumber", "lines"] },
    },
  ],

  async testConnection(config) {
    try {
      const token = await getValidToken(config);
      const resp = await fetch(`${bcBaseUrl(config)}/customers?$top=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return { ok: false, error: `BC API ${resp.status}: ${await resp.text()}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    const sinceFilter = since
      ? `$filter=lastModifiedDateTime gt ${since.toISOString()}&`
      : "";
    const pageSize = "$top=500";

    // ── Customers ─────────────────────────────────────────
    for await (const c of bcPaginate<any>(config, `/customers?${sinceFilter}${pageSize}`)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: c.id,
            firstname: c.displayName?.split(" ")[0] || c.displayName,
            lastname: c.displayName?.split(" ").slice(1).join(" ") || "",
            name: c.displayName,
            email: c.email,
            phone: c.phoneNumber,
            currency: c.currencyCode,
          },
        },
      };
      yield {
        kind: "activity" as const,
        data: {
          signalType: "erp_customer_synced",
          metadata: { customerId: c.id, displayName: c.displayName },
          occurredAt: new Date(c.lastModifiedDateTime || Date.now()),
        },
      };
    }

    // ── Vendors ───────────────────────────────────────────
    for await (const v of bcPaginate<any>(config, `/vendors?${sinceFilter}${pageSize}`)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: v.id,
            name: v.displayName,
            email: v.email,
            phone: v.phoneNumber,
            currency: v.currencyCode,
          },
        },
      };
    }

    // ── Sales Orders ──────────────────────────────────────
    for await (const so of bcPaginate<any>(config, `/salesOrders?${sinceFilter}${pageSize}`)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "sales-order.synced",
          payload: {
            id: so.id,
            orderNumber: so.number,
            amount: so.totalAmountIncludingTax,
            currency: so.currencyCode,
            status: so.status,
            orderDate: so.orderDate,
            deliveryDate: so.requestedDeliveryDate,
            customerName: so.customerName,
          },
        },
      };
    }

    // ── Purchase Orders ───────────────────────────────────
    for await (const po of bcPaginate<any>(config, `/purchaseOrders?${sinceFilter}${pageSize}`)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "purchase-order.synced",
          payload: {
            id: po.id,
            orderNumber: po.number,
            amount: po.totalAmountIncludingTax,
            currency: po.currencyCode,
            status: po.status,
            orderDate: po.orderDate,
            expectedDelivery: po.expectedReceiptDate,
            supplier: po.buyFromVendorName,
          },
        },
      };
    }

    // ── Sales Invoices ────────────────────────────────────
    for await (const inv of bcPaginate<any>(config, `/salesInvoices?${sinceFilter}${pageSize}`)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "invoice.created",
          payload: {
            id: inv.id,
            number: inv.number,
            amount_due: inv.remainingAmount,
            total: inv.totalAmountIncludingTax,
            status: inv.remainingAmount === 0 ? "paid" : "open",
            due_date: inv.dueDate,
            currency: inv.currencyCode,
          },
        },
      };
    }

    // ── Items ─────────────────────────────────────────────
    for await (const item of bcPaginate<any>(config, `/items?${sinceFilter}${pageSize}`)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "product.synced",
          payload: {
            id: item.id,
            name: item.displayName,
            sku: item.number,
            price: item.unitPrice,
            status: item.blocked ? "blocked" : "active",
          },
        },
      };
    }
  },

  async executeAction(config, action, params) {
    try {
      switch (action) {
        case "create_sales_order": {
          if (!params.customerNumber) return { success: false, error: "customerNumber is required" };
          const body: Record<string, unknown> = {
            customerNumber: params.customerNumber,
          };
          if (params.orderDate) body.orderDate = params.orderDate;

          const result = await bcRequest(config, "POST", "/salesOrders", body);
          if (!result.ok) return { success: false, error: `Create sales order failed (${result.status}): ${result.error}` };

          // Add lines if provided
          if (params.lines && Array.isArray(params.lines) && result.data?.id) {
            for (const line of params.lines as any[]) {
              await bcRequest(config, "POST", `/salesOrders(${result.data.id})/salesOrderLines`, {
                itemId: line.itemId,
                quantity: line.quantity,
                ...(line.unitPrice != null ? { unitPrice: line.unitPrice } : {}),
              });
            }
          }

          return { success: true, result: result.data };
        }

        case "update_sales_order": {
          if (!params.salesOrderId) return { success: false, error: "salesOrderId is required" };
          // Fetch current record for @odata.etag
          const current = await bcRequest(config, "GET", `/salesOrders(${params.salesOrderId})`);
          if (!current.ok) return { success: false, error: `Fetch sales order failed: ${current.error}` };
          const etag = current.data?.["@odata.etag"];

          const token = await getValidToken(config);
          const resp = await fetch(`${bcBaseUrl(config)}/salesOrders(${params.salesOrderId})`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              "If-Match": etag || "*",
            },
            body: JSON.stringify(params.fields),
          });

          if (!resp.ok) return { success: false, error: `Update sales order failed (${resp.status}): ${await resp.text()}` };
          return { success: true, result: { salesOrderId: params.salesOrderId } };
        }

        case "create_purchase_order": {
          if (!params.vendorNumber) return { success: false, error: "vendorNumber is required" };
          const body: Record<string, unknown> = {
            vendorNumber: params.vendorNumber,
          };
          if (params.orderDate) body.orderDate = params.orderDate;

          const result = await bcRequest(config, "POST", "/purchaseOrders", body);
          if (!result.ok) return { success: false, error: `Create purchase order failed (${result.status}): ${result.error}` };

          if (params.lines && Array.isArray(params.lines) && result.data?.id) {
            for (const line of params.lines as any[]) {
              await bcRequest(config, "POST", `/purchaseOrders(${result.data.id})/purchaseOrderLines`, {
                itemId: line.itemId,
                quantity: line.quantity,
                ...(line.directUnitCost != null ? { directUnitCost: line.directUnitCost } : {}),
              });
            }
          }

          return { success: true, result: result.data };
        }

        case "create_customer": {
          if (!params.displayName) return { success: false, error: "displayName is required" };
          const body: Record<string, unknown> = {
            displayName: params.displayName,
          };
          if (params.email) body.email = params.email;
          if (params.phoneNumber) body.phoneNumber = params.phoneNumber;
          if (params.address) body.address = params.address;

          const result = await bcRequest(config, "POST", "/customers", body);
          if (!result.ok) return { success: false, error: `Create customer failed (${result.status}): ${result.error}` };
          return { success: true, result: result.data };
        }

        case "create_sales_invoice": {
          if (!params.customerNumber) return { success: false, error: "customerNumber is required" };
          if (!params.lines) return { success: false, error: "lines is required" };

          const result = await bcRequest(config, "POST", "/salesInvoices", {
            customerNumber: params.customerNumber,
          });
          if (!result.ok) return { success: false, error: `Create sales invoice failed (${result.status}): ${result.error}` };

          if (Array.isArray(params.lines) && result.data?.id) {
            for (const line of params.lines as any[]) {
              await bcRequest(config, "POST", `/salesInvoices(${result.data.id})/salesInvoiceLines`, {
                itemId: line.itemId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
              });
            }
          }

          return { success: true, result: result.data };
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
        description: "Create a new sales order in Business Central",
        inputSchema: { customerNumber: "string", orderDate: "string?", lines: "array?" },
        sideEffects: ["Sales order created in Business Central"],
      },
      {
        name: "update_sales_order",
        description: "Update an existing sales order in Business Central",
        inputSchema: { salesOrderId: "string", fields: "object" },
        sideEffects: ["Sales order modified in Business Central"],
      },
      {
        name: "create_purchase_order",
        description: "Create a new purchase order in Business Central",
        inputSchema: { vendorNumber: "string", orderDate: "string?", lines: "array?" },
        sideEffects: ["Purchase order created in Business Central"],
      },
      {
        name: "create_customer",
        description: "Create a new customer in Business Central",
        inputSchema: { displayName: "string", email: "string?", phoneNumber: "string?", address: "string?" },
        sideEffects: ["Customer created in Business Central"],
      },
      {
        name: "create_sales_invoice",
        description: "Create a sales invoice in Business Central",
        inputSchema: { customerNumber: "string", lines: "array" },
        sideEffects: ["Sales invoice created in Business Central"],
      },
    ];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
