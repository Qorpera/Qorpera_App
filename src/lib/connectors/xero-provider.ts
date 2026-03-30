import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

const XERO_API = "https://api.xero.com/api.xro/2.0";

// ── Token Refresh ───────────────────────────────────────

async function refreshXeroToken(
  config: ConnectorConfig
): Promise<ConnectorConfig> {
  const expiry = config.token_expiry as number | undefined;
  if (expiry && Date.now() < expiry - 60_000) {
    return config; // still valid (with 1-min buffer)
  }

  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("XERO_CLIENT_ID / XERO_CLIENT_SECRET not configured");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const resp = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: config.refresh_token as string,
    }).toString(),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Xero token refresh failed (${resp.status}): ${err}`);
  }

  const tokens = await resp.json();
  return {
    ...config,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expiry: Date.now() + tokens.expires_in * 1000,
  };
}

// ── Helpers ──────────────────────────────────────────────

async function xeroFetch(
  config: ConnectorConfig,
  path: string,
  init?: RequestInit
): Promise<{ resp: Response; config: ConnectorConfig }> {
  const freshConfig = await refreshXeroToken(config);
  const tenantId = freshConfig.tenant_id as string;
  const accessToken = freshConfig.access_token as string;

  const resp = await fetch(`${XERO_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": tenantId,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  return { resp, config: freshConfig };
}

async function* paginateXero<T>(
  config: ConnectorConfig,
  basePath: string,
  itemsKey: string,
): AsyncGenerator<T, ConnectorConfig> {
  let page = 1;
  let latestConfig = config;

  while (true) {
    const separator = basePath.includes("?") ? "&" : "?";
    const url = `${basePath}${separator}page=${page}`;
    const { resp, config: freshConfig } = await xeroFetch(latestConfig, url);
    latestConfig = freshConfig;

    if (!resp.ok) break;
    const data = await resp.json();

    const items = data[itemsKey] || [];
    if (items.length === 0) break;

    for (const item of items) {
      yield item as T;
    }

    page++;
  }

  return latestConfig;
}

// ── Provider Implementation ──────────────────────────────

export const xeroProvider: ConnectorProvider = {
  id: "xero",
  name: "Xero",

  configSchema: [
    { key: "oauth", label: "Xero Account", type: "oauth" as const, required: true },
  ],

  writeCapabilities: [
    {
      slug: "create_invoice",
      name: "Create Invoice",
      description: "Create an accounts-receivable invoice in Xero for a contact with line items",
      inputSchema: {
        contactId: "string",
        lineItems: "array<{ description: string, quantity: number, unitAmount: number, accountCode: string }>",
        dueDate: "string (ISO date, optional)",
      },
    },
    {
      slug: "create_contact",
      name: "Create Contact",
      description: "Create a new contact in Xero",
      inputSchema: {
        name: "string",
        firstName: "string?",
        lastName: "string?",
        emailAddress: "string?",
        phone: "string?",
      },
    },
  ],

  async testConnection(config) {
    try {
      const { resp } = await xeroFetch(config, "/Organisation");
      if (!resp.ok) {
        return {
          ok: false,
          error: `Xero API ${resp.status}: ${resp.statusText}`,
        };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    // ── Sync contacts ─────────────────────────────────────
    const contactsPath = since
      ? `/Contacts?modifiedAfter=${since.toISOString()}`
      : "/Contacts";

    for await (const contact of paginateXero<any>(config, contactsPath, "Contacts")) {
      const defaultPhone = (contact.Phones || []).find(
        (p: any) => p.PhoneType === "DEFAULT"
      );

      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: contact.ContactID,
            firstname: contact.FirstName,
            lastname: contact.LastName,
            email: contact.EmailAddress,
            phone: defaultPhone
              ? `${defaultPhone.PhoneCountryCode || ""}${defaultPhone.PhoneAreaCode || ""}${defaultPhone.PhoneNumber || ""}`.trim() || undefined
              : undefined,
          },
        },
      };
    }

    // ── Sync invoices ─────────────────────────────────────
    const invoicesPath = since
      ? `/Invoices?modifiedAfter=${since.toISOString()}`
      : "/Invoices";

    for await (const inv of paginateXero<any>(config, invoicesPath, "Invoices")) {
      const status: string =
        inv.Status === "PAID"
          ? "paid"
          : inv.Status === "OVERDUE"
            ? "overdue"
            : "open";

      yield {
        kind: "event" as const,
        data: {
          eventType: "invoice.created",
          payload: {
            id: inv.InvoiceID,
            number: inv.InvoiceNumber,
            amount_due: inv.AmountDue,
            total: inv.Total,
            status,
            due_date: inv.DueDateString,
            currency: inv.CurrencyCode,
          },
        },
      };

      if (inv.AmountDue === 0) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "invoice.paid",
            payload: {
              id: inv.InvoiceID,
              number: inv.InvoiceNumber,
              amount_paid: inv.Total,
              status: "paid",
            },
          },
        };
      }

      if (inv.Status === "OVERDUE") {
        yield {
          kind: "event" as const,
          data: {
            eventType: "invoice.overdue",
            payload: {
              id: inv.InvoiceID,
              number: inv.InvoiceNumber,
              amount_due: inv.AmountDue,
              status: "overdue",
              due_date: inv.DueDateString,
            },
          },
        };
      }
    }

    // ── Sync items (products) ─────────────────────────────
    for await (const item of paginateXero<any>(config, "/Items", "Items")) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "product.synced",
          payload: {
            id: item.ItemID,
            name: item.Name,
            sku: item.Code,
            price: item.SalesDetails?.UnitPrice,
            status: "active",
          },
        },
      };
    }
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [
      {
        name: "create_invoice",
        description:
          "Create an accounts-receivable invoice in Xero for a contact with line items",
        inputSchema: {
          contactId: { type: "string", required: true },
          lineItems: {
            type: "array",
            required: true,
            items: {
              description: { type: "string", required: true },
              quantity: { type: "number", required: true },
              unitAmount: { type: "number", required: true },
              accountCode: { type: "string", required: true },
            },
          },
          dueDate: { type: "string", required: false },
        },
        sideEffects: ["Invoice created in Xero"],
      },
      {
        name: "create_contact",
        description: "Create a new contact in Xero",
        inputSchema: {
          name: { type: "string", required: true },
          firstName: { type: "string", required: false },
          lastName: { type: "string", required: false },
          emailAddress: { type: "string", required: false },
          phone: { type: "string", required: false },
        },
        sideEffects: ["New contact record created in Xero"],
      },
    ];
  },

  async executeAction(config, action, params) {
    try {
      switch (action) {
        // ── 1. Create invoice ──────────────────────────────────
        case "create_invoice": {
          if (!params.contactId)
            return { success: false, error: "contactId is required" };
          if (!params.lineItems || !Array.isArray(params.lineItems))
            return { success: false, error: "lineItems is required" };

          const contactId = params.contactId as string;
          const lineItems = params.lineItems as Array<{
            description: string;
            quantity: number;
            unitAmount: number;
            accountCode: string;
          }>;
          const dueDate = params.dueDate as string | undefined;

          const body: Record<string, unknown> = {
            Type: "ACCREC",
            Contact: { ContactID: contactId },
            LineItems: lineItems.map((li) => ({
              Description: li.description,
              Quantity: li.quantity,
              UnitAmount: li.unitAmount,
              AccountCode: li.accountCode,
            })),
          };
          if (dueDate) body.DueDate = dueDate;

          const { resp } = await xeroFetch(config, "/Invoices", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return {
              success: false,
              error: `Create invoice failed (${resp.status}): ${err}`,
            };
          }
          return { success: true, result: await resp.json() };
        }

        // ── 2. Create contact ──────────────────────────────────
        case "create_contact": {
          if (!params.name)
            return { success: false, error: "name is required" };

          const name = params.name as string;
          const firstName = params.firstName as string | undefined;
          const lastName = params.lastName as string | undefined;
          const emailAddress = params.emailAddress as string | undefined;
          const phone = params.phone as string | undefined;

          const contactBody: Record<string, unknown> = { Name: name };
          if (firstName) contactBody.FirstName = firstName;
          if (lastName) contactBody.LastName = lastName;
          if (emailAddress) contactBody.EmailAddress = emailAddress;
          if (phone) {
            contactBody.Phones = [
              { PhoneType: "DEFAULT", PhoneNumber: phone },
            ];
          }

          const { resp } = await xeroFetch(config, "/Contacts", {
            method: "POST",
            body: JSON.stringify(contactBody),
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
