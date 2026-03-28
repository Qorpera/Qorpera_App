import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

// ── Helpers ──────────────────────────────────────────────

async function getValidToken(config: ConnectorConfig): Promise<string> {
  if (
    config.access_token &&
    config.token_expiry &&
    new Date(config.token_expiry as string).getTime() > Date.now() + 5 * 60 * 1000
  ) {
    return config.access_token as string;
  }

  const host = (config.host_url as string).replace(/\/+$/, "");
  const resp = await fetch(`${host}/oauth2/v1/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${config.client_id}:${config.client_secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "urn:opc:resource:consumer::all",
    }),
  });

  if (!resp.ok) throw new Error(`Oracle token exchange failed: ${resp.status}`);
  const data = await resp.json();

  config.access_token = data.access_token;
  config.token_expiry = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();

  return data.access_token;
}

async function oracleRequest(
  config: ConnectorConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const token = await getValidToken(config);
  const host = (config.host_url as string).replace(/\/+$/, "");

  const resp = await fetch(`${host}/fscmRestApi/resources/latest${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "REST-Framework-Version": "4",
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

async function* oraclePaginate<T>(
  config: ConnectorConfig,
  path: string,
  filter?: string,
): AsyncGenerator<T> {
  let offset = 0;
  const limit = 500;

  while (true) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (filter) params.set("q", filter);
    const sep = path.includes("?") ? "&" : "?";
    const result = await oracleRequest(config, "GET", `${path}${sep}${params.toString()}`);
    if (!result.ok) break;

    const items = result.data?.items || [];
    for (const item of items) {
      yield item as T;
    }

    if (!result.data?.hasMore) break;
    offset += limit;
  }
}

// ── Provider Implementation ──────────────────────────────

export const oracleErpProvider: ConnectorProvider = {
  id: "oracle-erp",
  name: "Oracle ERP Cloud",

  configSchema: [
    { key: "host_url", label: "Oracle Cloud Host URL", type: "url", required: true, placeholder: "https://your-company.oraclecloud.com" },
    { key: "client_id", label: "OAuth Client ID", type: "text", required: true },
    { key: "client_secret", label: "OAuth Client Secret", type: "password", required: true },
  ],

  writeCapabilities: [
    {
      slug: "create_purchase_order",
      name: "Create Purchase Order",
      description: "Creates a purchase order in Oracle ERP Cloud",
      inputSchema: { type: "object", properties: { orderNumber: { type: "string" }, supplier: { type: "string" }, lines: { type: "array" } }, required: ["supplier", "lines"] },
    },
    {
      slug: "create_ap_invoice",
      name: "Create AP Invoice",
      description: "Creates an accounts payable invoice in Oracle ERP Cloud",
      inputSchema: { type: "object", properties: { invoiceNumber: { type: "string" }, supplier: { type: "string" }, invoiceAmount: { type: "number" }, invoiceDate: { type: "string" }, paymentTerms: { type: "string" } }, required: ["invoiceNumber", "supplier", "invoiceAmount", "invoiceDate"] },
    },
    {
      slug: "approve_purchase_order",
      name: "Approve Purchase Order",
      description: "Approves an existing purchase order in Oracle ERP Cloud",
      inputSchema: { type: "object", properties: { poHeaderId: { type: "string" } }, required: ["poHeaderId"] },
    },
  ],

  async testConnection(config) {
    try {
      const result = await oracleRequest(config, "GET", "/suppliers?limit=1");
      if (!result.ok) return { ok: false, error: `Oracle API ${result.status}: ${result.error}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    const sinceFilter = since
      ? `LastUpdateDate > '${since.toISOString()}'`
      : undefined;
    const today = new Date();

    // ── Purchase Orders ───────────────────────────────────
    for await (const po of oraclePaginate<any>(config, "/purchaseOrders", sinceFilter)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "purchase-order.synced",
          payload: {
            id: po.POHeaderId,
            orderNumber: po.OrderNumber,
            amount: po.Total || null,
            currency: po.CurrencyCode,
            status: po.Status,
            orderDate: po.CreationDate,
            expectedDelivery: null,
            supplier: po.Supplier,
          },
        },
      };
    }

    // ── Suppliers ──────────────────────────────────────────
    for await (const s of oraclePaginate<any>(config, "/suppliers", sinceFilter)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: s.SupplierId,
            firstname: "",
            lastname: s.Supplier,
            name: s.Supplier,
            email: s.SupplierSites?.[0]?.Email || undefined,
            phone: "",
          },
        },
      };
    }

    // ── AP Invoices ───────────────────────────────────────
    for await (const inv of oraclePaginate<any>(config, "/invoices", sinceFilter)) {
      const amountRemaining = inv.AmountRemaining ?? inv.InvoiceAmount;
      const dueDate = inv.PaymentDueDate;
      const isPaid = amountRemaining === 0;
      const isOverdue = !isPaid && dueDate && new Date(dueDate) < today;

      yield {
        kind: "event" as const,
        data: {
          eventType: "invoice.created",
          payload: {
            id: inv.InvoiceId,
            number: inv.InvoiceNumber,
            amount_due: amountRemaining,
            total: inv.InvoiceAmount,
            status: isPaid ? "paid" : isOverdue ? "overdue" : "open",
            due_date: dueDate,
            currency: inv.InvoiceCurrency,
          },
        },
      };

      if (isPaid) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "invoice.paid",
            payload: {
              id: inv.InvoiceId,
              number: inv.InvoiceNumber,
              amount_paid: inv.InvoiceAmount,
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
              id: inv.InvoiceId,
              number: inv.InvoiceNumber,
              amount_due: amountRemaining,
              status: "overdue",
              due_date: dueDate,
            },
          },
        };
      }
    }

    // ── AR Invoices (Receivables) ─────────────────────────
    for await (const inv of oraclePaginate<any>(config, "/receivablesInvoices", sinceFilter)) {
      const amountRemaining = inv.AmountRemaining ?? inv.InvoiceAmount ?? inv.TransactionAmount;
      const dueDate = inv.PaymentDueDate || inv.DueDate;
      const isPaid = amountRemaining === 0;
      const isOverdue = !isPaid && dueDate && new Date(dueDate) < today;

      yield {
        kind: "event" as const,
        data: {
          eventType: "invoice.created",
          payload: {
            id: inv.ReceivablesInvoiceId || inv.CustomerTransactionId,
            number: inv.TransactionNumber,
            amount_due: amountRemaining,
            total: inv.InvoiceAmount || inv.TransactionAmount,
            status: isPaid ? "paid" : isOverdue ? "overdue" : "open",
            due_date: dueDate,
            currency: inv.InvoiceCurrency || inv.CurrencyCode,
          },
        },
      };

      if (isPaid) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "invoice.paid",
            payload: {
              id: inv.ReceivablesInvoiceId || inv.CustomerTransactionId,
              number: inv.TransactionNumber,
              amount_paid: inv.InvoiceAmount || inv.TransactionAmount,
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
              id: inv.ReceivablesInvoiceId || inv.CustomerTransactionId,
              number: inv.TransactionNumber,
              amount_due: amountRemaining,
              status: "overdue",
              due_date: dueDate,
            },
          },
        };
      }
    }

    // ── GL Journals (optional) ────────────────────────────
    try {
      const entries: string[] = [];
      let count = 0;
      for await (const j of oraclePaginate<any>(config, "/generalLedgerJournals", sinceFilter)) {
        entries.push(
          `${j.LedgerName || ""} | ${j.JournalBatchName || ""} | ${j.HeaderDescription || ""} | ${j.AccountedDr || 0} DR / ${j.AccountedCr || 0} CR ${j.CurrencyCode || ""}`,
        );
        count++;
        if (count >= 100) break;
      }

      if (entries.length > 0) {
        yield {
          kind: "content" as const,
          data: {
            sourceType: "erp_journal_summary",
            sourceId: `oracle-gl-journals-${new Date().toISOString().slice(0, 10)}`,
            content: `Recent GL Journal Entries (${entries.length} entries):\n${entries.join("\n")}`,
            metadata: { entryCount: entries.length },
          },
        };
      }
    } catch {
      // GL endpoint not accessible — skip silently
    }
  },

  async executeAction(config, action, params) {
    try {
      switch (action) {
        case "create_purchase_order": {
          if (!params.supplier) return { success: false, error: "supplier is required" };
          if (!params.lines) return { success: false, error: "lines is required" };

          const body: Record<string, unknown> = {
            Supplier: params.supplier,
            ...(params.orderNumber ? { OrderNumber: params.orderNumber } : {}),
            lines: (params.lines as any[]).map((line) => ({
              ItemDescription: line.itemDescription,
              Quantity: line.quantity,
              Price: line.unitPrice,
              ...(line.categoryName ? { CategoryName: line.categoryName } : {}),
            })),
          };

          const result = await oracleRequest(config, "POST", "/purchaseOrders", body);
          if (!result.ok) return { success: false, error: `Create PO failed (${result.status}): ${result.error}` };
          return { success: true, result: result.data };
        }

        case "create_ap_invoice": {
          if (!params.invoiceNumber) return { success: false, error: "invoiceNumber is required" };
          if (!params.supplier) return { success: false, error: "supplier is required" };
          if (params.invoiceAmount == null) return { success: false, error: "invoiceAmount is required" };
          if (!params.invoiceDate) return { success: false, error: "invoiceDate is required" };

          const body: Record<string, unknown> = {
            InvoiceNumber: params.invoiceNumber,
            Supplier: params.supplier,
            InvoiceAmount: params.invoiceAmount,
            InvoiceDate: params.invoiceDate,
          };
          if (params.paymentTerms) body.PaymentTerms = params.paymentTerms;

          const result = await oracleRequest(config, "POST", "/invoices", body);
          if (!result.ok) return { success: false, error: `Create AP invoice failed (${result.status}): ${result.error}` };
          return { success: true, result: result.data };
        }

        case "approve_purchase_order": {
          if (!params.poHeaderId) return { success: false, error: "poHeaderId is required" };

          const result = await oracleRequest(
            config,
            "POST",
            `/purchaseOrders/${params.poHeaderId}/action/approve`,
          );
          if (!result.ok) return { success: false, error: `Approve PO failed (${result.status}): ${result.error}` };
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
        name: "create_purchase_order",
        description: "Create a purchase order in Oracle ERP Cloud",
        inputSchema: { supplier: "string", orderNumber: "string?", lines: "array" },
        sideEffects: ["Purchase order created in Oracle ERP Cloud"],
      },
      {
        name: "create_ap_invoice",
        description: "Create an accounts payable invoice in Oracle ERP Cloud",
        inputSchema: { invoiceNumber: "string", supplier: "string", invoiceAmount: "number", invoiceDate: "string", paymentTerms: "string?" },
        sideEffects: ["AP invoice created in Oracle ERP Cloud"],
      },
      {
        name: "approve_purchase_order",
        description: "Approve a purchase order in Oracle ERP Cloud",
        inputSchema: { poHeaderId: "string" },
        sideEffects: ["Purchase order approved in Oracle ERP Cloud"],
      },
    ];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
