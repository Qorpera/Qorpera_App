import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

// ── Session Management ──────────────────────────────────

async function ensureSession(config: ConnectorConfig): Promise<string> {
  const sessionId = config.session_id as string | undefined;
  const sessionExpiry = config.session_expiry as number | undefined;

  // Reuse valid session (>5 min remaining)
  if (sessionId && sessionExpiry && sessionExpiry > Date.now() + 5 * 60 * 1000) {
    return sessionId;
  }

  const host = (config.host_url as string).replace(/\/+$/, "");
  const resp = await fetch(`${host}/b1s/v1/Login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      CompanyDB: config.company_db,
      UserName: config.username,
      Password: config.password,
    }),
  });

  if (!resp.ok) {
    throw new Error(`SAP B1 login failed: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  const newSessionId = data.SessionId as string;

  // Session timeout is 30 min by default
  config.session_id = newSessionId;
  config.session_expiry = Date.now() + 25 * 60 * 1000; // 25 min to be safe

  return newSessionId;
}

// ── Helpers ──────────────────────────────────────────────

async function sapB1Fetch(
  config: ConnectorConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const sessionId = await ensureSession(config);
  const host = (config.host_url as string).replace(/\/+$/, "");

  return fetch(`${host}/b1s/v1${path}`, {
    ...init,
    headers: {
      Cookie: `B1SESSION=${sessionId}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init?.headers,
    },
  });
}

async function* paginateSapB1<T>(
  config: ConnectorConfig,
  path: string,
  filter?: string,
): AsyncGenerator<T> {
  let skip = 0;
  const top = 500;

  while (true) {
    const params = new URLSearchParams({
      $top: String(top),
      $skip: String(skip),
    });
    if (filter) params.set("$filter", filter);

    const sep = path.includes("?") ? "&" : "?";
    const resp = await sapB1Fetch(config, `${path}${sep}${params.toString()}`);
    if (!resp.ok) break;

    const data = await resp.json();
    const items: T[] = data.value || [];
    for (const item of items) {
      yield item;
    }

    if (items.length < top) break;
    skip += top;
  }
}

// ── Provider Implementation ──────────────────────────────

export const sapB1Provider: ConnectorProvider = {
  id: "sap-b1",
  name: "SAP Business One",

  configSchema: [
    { key: "host_url", label: "Service Layer URL", type: "url", required: true, placeholder: "https://your-server:50000" },
    { key: "company_db", label: "Company Database", type: "text", required: true, placeholder: "Company database name" },
    { key: "username", label: "Username", type: "text", required: true },
    { key: "password", label: "Password", type: "password", required: true },
  ],

  writeCapabilities: [
    {
      slug: "create_order",
      name: "Create Sales Order",
      description: "Create a sales order in SAP Business One",
      inputSchema: {
        cardCode: "string (customer code)",
        docDate: "string? (ISO date)",
        documentLines: "array<{ itemCode: string, quantity: number, price?: number }>",
      },
    },
    {
      slug: "create_purchase_order",
      name: "Create Purchase Order",
      description: "Create a purchase order in SAP Business One",
      inputSchema: {
        cardCode: "string (vendor code)",
        documentLines: "array<{ itemCode: string, quantity: number, price?: number }>",
      },
    },
  ],

  async testConnection(config) {
    try {
      const host = (config.host_url as string).replace(/\/+$/, "");
      const resp = await fetch(`${host}/b1s/v1/Login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          CompanyDB: config.company_db,
          UserName: config.username,
          Password: config.password,
        }),
      });

      if (!resp.ok) {
        return { ok: false, error: `SAP B1 login failed: ${resp.status} ${resp.statusText}` };
      }

      const data = await resp.json();
      config.session_id = data.SessionId;
      config.session_expiry = Date.now() + 25 * 60 * 1000;

      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    const sinceFilter = since
      ? `UpdateDate ge '${since.toISOString().slice(0, 10)}'`
      : undefined;
    const today = new Date();

    // ── Business Partners (Customers) ─────────────────────
    const customerFilter = sinceFilter
      ? `CardType eq 'cCustomer' and ${sinceFilter}`
      : "CardType eq 'cCustomer'";

    for await (const bp of paginateSapB1<any>(config, "/BusinessPartners", customerFilter)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: bp.CardCode,
            name: bp.CardName,
            email: bp.EmailAddress,
            phone: bp.Phone1,
          },
        },
      };
    }

    // ── Business Partners (Suppliers) ─────────────────────
    const supplierFilter = sinceFilter
      ? `CardType eq 'cSupplier' and ${sinceFilter}`
      : "CardType eq 'cSupplier'";

    for await (const bp of paginateSapB1<any>(config, "/BusinessPartners", supplierFilter)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: bp.CardCode,
            name: bp.CardName,
            email: bp.EmailAddress,
            phone: bp.Phone1,
          },
        },
      };
    }

    // ── Sales Orders ──────────────────────────────────────
    for await (const so of paginateSapB1<any>(config, "/Orders", sinceFilter)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "sales-order.synced",
          payload: {
            id: so.DocEntry,
            orderNumber: so.DocNum,
            amount: so.DocTotal,
            currency: so.DocCurrency,
            status: so.DocumentStatus,
            orderDate: so.DocDate,
            customerName: so.CardName,
          },
        },
      };
    }

    // ── Purchase Orders ───────────────────────────────────
    for await (const po of paginateSapB1<any>(config, "/PurchaseOrders", sinceFilter)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "purchase-order.synced",
          payload: {
            id: po.DocEntry,
            orderNumber: po.DocNum,
            amount: po.DocTotal,
            currency: po.DocCurrency,
            status: po.DocumentStatus,
            orderDate: po.DocDate,
            supplier: po.CardName,
          },
        },
      };
    }

    // ── Invoices ──────────────────────────────────────────
    for await (const inv of paginateSapB1<any>(config, "/Invoices", sinceFilter)) {
      const paidToDate = inv.PaidToDate ?? 0;
      const docTotal = inv.DocTotal ?? 0;
      const amountDue = docTotal - paidToDate;
      const isPaid = amountDue <= 0;
      const dueDate = inv.DocDueDate;
      const isOverdue = !isPaid && dueDate && new Date(dueDate) < today;
      const status = isPaid ? "paid" : isOverdue ? "overdue" : "open";

      yield {
        kind: "event" as const,
        data: {
          eventType: "invoice.created",
          payload: {
            id: inv.DocEntry,
            number: inv.DocNum,
            total: docTotal,
            amount_due: amountDue,
            status,
            due_date: dueDate,
            currency: inv.DocCurrency,
          },
        },
      };

      if (isPaid) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "invoice.paid",
            payload: {
              id: inv.DocEntry,
              number: inv.DocNum,
              amount_paid: docTotal,
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
              id: inv.DocEntry,
              number: inv.DocNum,
              amount_due: amountDue,
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
        case "create_order": {
          if (!params.cardCode) return { success: false, error: "cardCode is required" };
          if (!params.documentLines || !Array.isArray(params.documentLines))
            return { success: false, error: "documentLines is required" };

          const body: Record<string, unknown> = {
            CardCode: params.cardCode,
            DocumentLines: (params.documentLines as any[]).map((l) => ({
              ItemCode: l.itemCode,
              Quantity: l.quantity,
              ...(l.price != null ? { UnitPrice: l.price } : {}),
            })),
          };
          if (params.docDate) body.DocDate = params.docDate;

          const resp = await sapB1Fetch(config, "/Orders", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create order failed (${resp.status}): ${err}` };
          }
          return { success: true, result: await resp.json() };
        }

        case "create_purchase_order": {
          if (!params.cardCode) return { success: false, error: "cardCode is required" };
          if (!params.documentLines || !Array.isArray(params.documentLines))
            return { success: false, error: "documentLines is required" };

          const body: Record<string, unknown> = {
            CardCode: params.cardCode,
            DocumentLines: (params.documentLines as any[]).map((l) => ({
              ItemCode: l.itemCode,
              Quantity: l.quantity,
              ...(l.price != null ? { UnitPrice: l.price } : {}),
            })),
          };

          const resp = await sapB1Fetch(config, "/PurchaseOrders", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create purchase order failed (${resp.status}): ${err}` };
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
        description: "Create a sales order in SAP Business One",
        inputSchema: { cardCode: "string", docDate: "string?", documentLines: "array" },
        sideEffects: ["Sales order created in SAP Business One"],
      },
      {
        name: "create_purchase_order",
        description: "Create a purchase order in SAP Business One",
        inputSchema: { cardCode: "string", documentLines: "array" },
        sideEffects: ["Purchase order created in SAP Business One"],
      },
    ];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
