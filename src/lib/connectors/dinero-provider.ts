import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

const DINERO_API = "https://api.dinero.dk/v1";

// ── Helpers ──────────────────────────────────────────────

function getOrg(config: ConnectorConfig): string {
  return config.organization_id as string;
}

async function dineroFetch(
  config: ConnectorConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const apiKey = config.api_key as string;
  const org = getOrg(config);

  return fetch(`${DINERO_API}/${org}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function* paginateDinero<T>(
  config: ConnectorConfig,
  basePath: string,
  since?: Date,
): AsyncGenerator<T> {
  let page = 0;

  while (true) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "100");
    if (since) params.set("changesSince", since.toISOString());

    const separator = basePath.includes("?") ? "&" : "?";
    const url = `${basePath}${separator}${params.toString()}`;
    const resp = await dineroFetch(config, url);
    if (!resp.ok) break;

    const data = await resp.json();
    const items: T[] = data.Collection || [];
    for (const item of items) {
      yield item;
    }

    const pageCount = data.Pagination?.PageCount ?? 1;
    page++;
    if (page >= pageCount) break;
  }
}

// ── Provider Implementation ──────────────────────────────

export const dineroProvider: ConnectorProvider = {
  id: "dinero",
  name: "Dinero",

  configSchema: [
    {
      key: "api_key",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "From Dinero → Settings → Integrations",
    },
    {
      key: "organization_id",
      label: "Organization ID",
      type: "text",
      required: true,
      placeholder: "From Dinero → Settings → Integrations",
    },
  ],

  writeCapabilities: [
    {
      slug: "create_invoice_draft",
      name: "Create Invoice Draft",
      description: "Create a draft invoice in Dinero for a contact with product lines",
      inputSchema: {
        contactGuid: "string",
        productLines:
          "array<{ productGuid: string, quantity: number, unitPrice?: number }>",
        paymentConditionType: "string?",
      },
    },
    {
      slug: "create_contact",
      name: "Create Contact",
      description: "Create a new contact in Dinero",
      inputSchema: {
        name: "string",
        email: "string?",
        phone: "string?",
        vatNumber: "string?",
      },
    },
  ],

  async testConnection(config) {
    try {
      const resp = await dineroFetch(config, "/contacts?page=0&pageSize=1");
      if (!resp.ok) {
        return {
          ok: false,
          error: `Dinero API ${resp.status}: ${resp.statusText}`,
        };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    const today = new Date();

    // ── Contacts ──────────────────────────────────────────
    for await (const c of paginateDinero<any>(config, "/contacts", since)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: c.ContactGuid,
            name: c.Name,
            email: c.Email,
            phone: c.Phone,
            vatNumber: c.VatNumber,
          },
        },
      };
    }

    // ── Invoices ──────────────────────────────────────────
    for await (const inv of paginateDinero<any>(config, "/invoices", since)) {
      const balance = inv.Balance ?? 0;
      const totalInclVat = inv.TotalInclVat ?? 0;
      const dueDate = inv.DueDate;
      const isPaid = balance === 0;
      const isOverdue =
        !isPaid && dueDate && new Date(dueDate) < today;

      const status = isPaid ? "paid" : isOverdue ? "overdue" : "open";

      yield {
        kind: "event" as const,
        data: {
          eventType: "invoice.created",
          payload: {
            id: inv.Id,
            number: inv.Number,
            total: totalInclVat,
            amount_due: balance,
            status,
            due_date: dueDate,
            currency: "DKK",
          },
        },
      };

      if (isPaid) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "invoice.paid",
            payload: {
              id: inv.Id,
              number: inv.Number,
              amount_paid: totalInclVat,
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
              id: inv.Id,
              number: inv.Number,
              amount_due: balance,
              status: "overdue",
              due_date: dueDate,
            },
          },
        };
      }
    }

    // ── Products ──────────────────────────────────────────
    for await (const prod of paginateDinero<any>(config, "/products", since)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "product.synced",
          payload: {
            id: prod.ProductGuid,
            name: prod.Name,
            sku: prod.ProductNumber,
            price: prod.BaseAmountValue,
            currency: "DKK",
            status: "active",
          },
        },
      };
    }
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [
      {
        name: "create_invoice_draft",
        description:
          "Create a draft invoice in Dinero for a contact with product lines",
        inputSchema: {
          contactGuid: "string",
          productLines:
            "array<{ productGuid: string, quantity: number, unitPrice?: number }>",
          paymentConditionType: "string?",
        },
        sideEffects: ["Draft invoice created in Dinero"],
      },
      {
        name: "create_contact",
        description: "Create a new contact in Dinero",
        inputSchema: {
          name: "string",
          email: "string?",
          phone: "string?",
          vatNumber: "string?",
        },
        sideEffects: ["New contact created in Dinero"],
      },
    ];
  },

  async executeAction(config, action, params) {
    try {
      switch (action) {
        case "create_invoice_draft": {
          if (!params.contactGuid)
            return { success: false, error: "contactGuid is required" };
          if (!params.productLines || !Array.isArray(params.productLines))
            return { success: false, error: "productLines is required" };

          const body = {
            ContactGuid: params.contactGuid,
            ProductLines: (
              params.productLines as Array<{
                productGuid: string;
                quantity: number;
                unitPrice?: number;
              }>
            ).map((l) => ({
              ProductGuid: l.productGuid,
              Quantity: l.quantity,
              ...(l.unitPrice != null ? { UnitPrice: l.unitPrice } : {}),
            })),
            ...(params.paymentConditionType
              ? { PaymentConditionType: params.paymentConditionType }
              : {}),
          };

          const resp = await dineroFetch(config, "/invoices", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return {
              success: false,
              error: `Create invoice draft failed (${resp.status}): ${err}`,
            };
          }
          return { success: true, result: await resp.json() };
        }

        case "create_contact": {
          if (!params.name)
            return { success: false, error: "name is required" };

          const body: Record<string, unknown> = { Name: params.name };
          if (params.email) body.Email = params.email;
          if (params.phone) body.Phone = params.phone;
          if (params.vatNumber) body.VatNumber = params.vatNumber;

          const resp = await dineroFetch(config, "/contacts", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return {
              success: false,
              error: `Create contact failed (${resp.status}): ${err}`,
            };
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
