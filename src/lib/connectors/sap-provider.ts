import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

// ── Helpers ──────────────────────────────────────────────

function basicAuthHeader(config: ConnectorConfig): string {
  return "Basic " + Buffer.from(`${config.username}:${config.password}`).toString("base64");
}

async function sapFetch(
  config: ConnectorConfig,
  servicePath: string,
  queryParams?: Record<string, string>,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const host = (config.host_url as string).replace(/\/+$/, "");
  const params = new URLSearchParams({ $format: "json", ...queryParams });
  const url = `${host}/sap/opu/odata/sap/${servicePath}${servicePath.includes("?") ? "&" : "?"}${params.toString()}`;

  return fetch(url, {
    headers: {
      Authorization: basicAuthHeader(config),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

async function* sapPaginate<T>(
  config: ConnectorConfig,
  servicePath: string,
  entitySet: string,
  filter?: string,
): AsyncGenerator<T> {
  let skip = 0;
  const top = 500;

  while (true) {
    const params: Record<string, string> = {
      $top: String(top),
      $skip: String(skip),
    };
    if (filter) params.$filter = filter;

    const resp = await sapFetch(config, `${servicePath}/${entitySet}`, params);
    if (!resp.ok) break;
    const data: any = await resp.json();
    const results = data?.d?.results || [];

    for (const item of results) {
      yield item as T;
    }

    if (results.length < top) break;
    skip += top;
  }
}

async function getCsrfToken(config: ConnectorConfig, servicePath: string): Promise<{ token: string; cookies: string }> {
  const resp = await sapFetch(config, servicePath, { $top: "0" }, { "x-csrf-token": "Fetch" });
  const token = resp.headers.get("x-csrf-token") || "";
  const cookies = resp.headers.get("set-cookie") || "";
  return { token, cookies };
}

async function sapWrite(
  config: ConnectorConfig,
  servicePath: string,
  method: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const { token, cookies } = await getCsrfToken(config, servicePath.split("/")[0]);
  const host = (config.host_url as string).replace(/\/+$/, "");
  const url = `${host}/sap/opu/odata/sap/${servicePath}?$format=json`;

  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: basicAuthHeader(config),
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-csrf-token": token,
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: JSON.stringify(body),
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

// ── Provider Implementation ──────────────────────────────

export const sapProvider: ConnectorProvider = {
  id: "sap-s4hana",
  name: "SAP S/4HANA Cloud",

  configSchema: [
    { key: "host_url", label: "S/4HANA Host URL", type: "url", required: true, placeholder: "https://your-company.s4hana.ondemand.com" },
    { key: "username", label: "Communication User", type: "text", required: true, placeholder: "QORPERA_COMM_USER" },
    { key: "password", label: "Password", type: "password", required: true },
  ],

  writeCapabilities: [
    {
      slug: "create_sales_order",
      name: "Create Sales Order",
      description: "Creates a sales order in SAP S/4HANA",
      inputSchema: { type: "object", properties: { salesOrderType: { type: "string" }, soldToParty: { type: "string" }, purchaseOrderByCustomer: { type: "string" }, items: { type: "array" } }, required: ["salesOrderType", "soldToParty"] },
    },
    {
      slug: "update_sales_order",
      name: "Update Sales Order",
      description: "Updates a sales order header in SAP S/4HANA",
      inputSchema: { type: "object", properties: { salesOrderId: { type: "string" }, fields: { type: "object" } }, required: ["salesOrderId", "fields"] },
    },
    {
      slug: "create_purchase_order",
      name: "Create Purchase Order",
      description: "Creates a purchase order in SAP S/4HANA",
      inputSchema: { type: "object", properties: { companyCode: { type: "string" }, purchasingOrganization: { type: "string" }, purchasingGroup: { type: "string" }, supplier: { type: "string" }, items: { type: "array" } }, required: ["companyCode", "purchasingOrganization", "purchasingGroup", "supplier"] },
    },
  ],

  async testConnection(config) {
    try {
      const resp = await sapFetch(config, "API_BUSINESS_PARTNER/A_BusinessPartner", { $top: "1" });
      if (!resp.ok) return { ok: false, error: `SAP API ${resp.status}: ${resp.statusText}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    const sinceFilter = since
      ? `LastChangeDate gt datetime'${since.toISOString()}'`
      : undefined;

    // ── Business Partners ─────────────────────────────────
    for await (const bp of sapPaginate<any>(
      config,
      "API_BUSINESS_PARTNER",
      "A_BusinessPartner",
      sinceFilter,
    )) {
      if (bp.BusinessPartnerCategory === "1") {
        // Person
        const address = bp.to_BusinessPartnerAddress?.results?.[0];
        yield {
          kind: "event" as const,
          data: {
            eventType: "contact.synced",
            payload: {
              id: bp.BusinessPartner,
              firstname: bp.FirstName,
              lastname: bp.LastName,
              email: address?.EmailAddress || undefined,
              phone: bp.PhoneNumber || address?.PhoneNumber || undefined,
            },
          },
        };
      } else if (bp.BusinessPartnerCategory === "2") {
        // Organization
        yield {
          kind: "event" as const,
          data: {
            eventType: "company.synced",
            payload: {
              id: bp.BusinessPartner,
              name: bp.OrganizationBPName1,
            },
          },
        };
      }
    }

    // ── Sales Orders ──────────────────────────────────────
    const soFilter = since
      ? `CreationDate gt datetime'${since.toISOString()}'`
      : undefined;

    for await (const so of sapPaginate<any>(
      config,
      "API_SALES_ORDER_SRV",
      "A_SalesOrder",
      soFilter,
    )) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "sales-order.synced",
          payload: {
            id: so.SalesOrder,
            orderNumber: so.SalesOrder,
            amount: so.TotalNetAmount,
            currency: so.TransactionCurrency,
            status: so.OverallSDProcessStatus,
            orderDate: so.CreationDate,
            deliveryDate: so.RequestedDeliveryDate,
            customerName: so.SoldToParty,
          },
        },
      };
    }

    // ── Purchase Orders ───────────────────────────────────
    const poFilter = since
      ? `CreationDate gt datetime'${since.toISOString()}'`
      : undefined;

    for await (const po of sapPaginate<any>(
      config,
      "API_PURCHASEORDER_PROCESS_SRV",
      "A_PurchaseOrder",
      poFilter,
    )) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "purchase-order.synced",
          payload: {
            id: po.PurchaseOrder,
            orderNumber: po.PurchaseOrder,
            amount: null,
            currency: po.DocumentCurrency,
            status: po.PurchasingDocumentDeletionCode === "" ? "active" : "deleted",
            orderDate: po.CreationDate,
            expectedDelivery: null,
            supplier: po.Supplier,
          },
        },
      };
    }

    // ── Accounting Documents (optional, may not be exposed) ──
    try {
      const entries: string[] = [];
      let count = 0;
      for await (const doc of sapPaginate<any>(
        config,
        "API_OPLACCTGDOCITEMCUBE_SRV",
        "A_OperationalAcctgDocItemCube",
        since ? `PostingDate gt datetime'${since.toISOString()}'` : undefined,
      )) {
        entries.push(
          `${doc.CompanyCode} | ${doc.FiscalYear}-${doc.AccountingDocument} | ${doc.GLAccount} | ${doc.AmountInCompanyCodeCurrency} ${doc.CompanyCodeCurrency}`,
        );
        count++;
        if (count >= 1000) break; // Cap for content size
      }

      if (entries.length > 0) {
        yield {
          kind: "content" as const,
          data: {
            sourceType: "erp_gl_postings",
            sourceId: `sap-gl-${new Date().toISOString().slice(0, 10)}`,
            content: `Recent GL Postings (${entries.length} entries):\n${entries.join("\n")}`,
            metadata: { entryCount: entries.length },
          },
        };
      }
    } catch {
      // Service not available on this SAP instance — skip silently
    }
  },

  async executeAction(config, action, params) {
    try {
      switch (action) {
        case "create_sales_order": {
          if (!params.salesOrderType) return { success: false, error: "salesOrderType is required" };
          if (!params.soldToParty) return { success: false, error: "soldToParty is required" };

          const body: Record<string, unknown> = {
            d: {
              SalesOrderType: params.salesOrderType,
              SoldToParty: params.soldToParty,
              ...(params.purchaseOrderByCustomer ? { PurchaseOrderByCustomer: params.purchaseOrderByCustomer } : {}),
              ...(params.items && Array.isArray(params.items) ? {
                to_Item: {
                  results: (params.items as any[]).map((item) => ({
                    Material: item.material,
                    RequestedQuantity: String(item.quantity),
                    ...(item.plant ? { Plant: item.plant } : {}),
                  })),
                },
              } : {}),
            },
          };

          const result = await sapWrite(config, "API_SALES_ORDER_SRV/A_SalesOrder", "POST", body);
          if (!result.ok) return { success: false, error: `Create sales order failed (${result.status}): ${result.error}` };
          return { success: true, result: result.data };
        }

        case "update_sales_order": {
          if (!params.salesOrderId) return { success: false, error: "salesOrderId is required" };
          if (!params.fields) return { success: false, error: "fields is required" };

          const body = { d: params.fields };
          const result = await sapWrite(
            config,
            `API_SALES_ORDER_SRV/A_SalesOrder('${params.salesOrderId}')`,
            "PATCH",
            body,
          );
          if (!result.ok) return { success: false, error: `Update sales order failed (${result.status}): ${result.error}` };
          return { success: true, result: { salesOrderId: params.salesOrderId } };
        }

        case "create_purchase_order": {
          if (!params.companyCode) return { success: false, error: "companyCode is required" };
          if (!params.purchasingOrganization) return { success: false, error: "purchasingOrganization is required" };
          if (!params.purchasingGroup) return { success: false, error: "purchasingGroup is required" };
          if (!params.supplier) return { success: false, error: "supplier is required" };

          const body: Record<string, unknown> = {
            d: {
              CompanyCode: params.companyCode,
              PurchasingOrganization: params.purchasingOrganization,
              PurchasingGroup: params.purchasingGroup,
              Supplier: params.supplier,
              ...(params.items && Array.isArray(params.items) ? {
                to_PurchaseOrderItem: {
                  results: (params.items as any[]).map((item) => ({
                    Material: item.material,
                    OrderQuantity: String(item.quantity),
                    Plant: item.plant,
                    ...(item.netPriceAmount != null ? { NetPriceAmount: String(item.netPriceAmount) } : {}),
                  })),
                },
              } : {}),
            },
          };

          const result = await sapWrite(config, "API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder", "POST", body);
          if (!result.ok) return { success: false, error: `Create purchase order failed (${result.status}): ${result.error}` };
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
        description: "Create a sales order in SAP S/4HANA",
        inputSchema: { salesOrderType: "string", soldToParty: "string", purchaseOrderByCustomer: "string?", items: "array?" },
        sideEffects: ["Sales order created in SAP S/4HANA"],
      },
      {
        name: "update_sales_order",
        description: "Update a sales order header in SAP S/4HANA",
        inputSchema: { salesOrderId: "string", fields: "object" },
        sideEffects: ["Sales order modified in SAP S/4HANA"],
      },
      {
        name: "create_purchase_order",
        description: "Create a purchase order in SAP S/4HANA",
        inputSchema: { companyCode: "string", purchasingOrganization: "string", purchasingGroup: "string", supplier: "string", items: "array?" },
        sideEffects: ["Purchase order created in SAP S/4HANA"],
      },
    ];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
