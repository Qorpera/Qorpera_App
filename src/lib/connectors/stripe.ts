import type {
  ConnectorProvider,
  ConnectorConfig,
  SyncEvent,
  ConnectorCapability,
  InferredSchema,
} from "./types";
import { getValidStripeToken } from "./stripe-auth";

const STRIPE_API = "https://api.stripe.com";

// ── Helpers ──────────────────────────────────────────────

async function stripeFetch(
  token: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${STRIPE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...init?.headers,
    },
  });
}

// ── Provider Implementation ──────────────────────────────

export const stripeProvider: ConnectorProvider = {
  id: "stripe",
  name: "Stripe",

  configSchema: [
    { key: "oauth", label: "Stripe Account", type: "oauth", required: true },
  ],

  async testConnection(config) {
    try {
      const token = await getValidStripeToken(config);
      const resp = await stripeFetch(token, "/v1/customers?limit=1");
      if (!resp.ok)
        return {
          ok: false,
          error: `Stripe API ${resp.status}: ${resp.statusText}`,
        };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    const token = await getValidStripeToken(config);
    const sinceTs = since ? Math.floor(since.getTime() / 1000) : undefined;

    const customerIds: string[] = [];
    const invoiceIds: string[] = [];

    // ── Sync customers ────────────────────────────────────
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params = new URLSearchParams({ limit: "100" });
      if (sinceTs) params.set("created[gte]", String(sinceTs));
      if (startingAfter) params.set("starting_after", startingAfter);

      const resp = await stripeFetch(token, `/v1/customers?${params.toString()}`);
      if (!resp.ok) break;
      const data = await resp.json();

      for (const cust of data.data || []) {
        customerIds.push(cust.id);
        yield {
          eventType: "customer.synced",
          payload: {
            id: cust.id,
            name: cust.name,
            email: cust.email,
            phone: cust.phone,
            currency: cust.currency,
            created: cust.created,
            balance: cust.balance,
            delinquent: cust.delinquent,
          },
        };
      }

      hasMore = data.has_more === true;
      if (hasMore && data.data?.length > 0) {
        startingAfter = data.data[data.data.length - 1].id;
      }
    }

    // ── Sync invoices ─────────────────────────────────────
    hasMore = true;
    startingAfter = undefined;

    while (hasMore) {
      const params = new URLSearchParams({ limit: "100" });
      if (sinceTs) params.set("created[gte]", String(sinceTs));
      if (startingAfter) params.set("starting_after", startingAfter);

      const resp = await stripeFetch(token, `/v1/invoices?${params.toString()}`);
      if (!resp.ok) break;
      const data = await resp.json();

      for (const inv of data.data || []) {
        invoiceIds.push(inv.id);

        yield {
          eventType: "invoice.created",
          payload: {
            id: inv.id,
            number: inv.number,
            amount_due: inv.amount_due,
            total: inv.total,
            status: inv.status,
            due_date: inv.due_date,
            currency: inv.currency,
            customer: inv.customer,
            paid: inv.paid,
            created: inv.created,
          },
        };

        if (inv.status === "paid") {
          yield {
            eventType: "invoice.paid",
            payload: {
              id: inv.id,
              number: inv.number,
              amount_paid: inv.amount_paid,
              status: "paid",
              paid_at: inv.status_transitions?.paid_at,
              customer: inv.customer,
            },
          };
        }

        if (
          inv.status === "open" &&
          inv.due_date &&
          inv.due_date < Math.floor(Date.now() / 1000)
        ) {
          yield {
            eventType: "invoice.overdue",
            payload: {
              id: inv.id,
              number: inv.number,
              amount_due: inv.amount_due,
              status: "overdue",
              due_date: inv.due_date,
              customer: inv.customer,
            },
          };
        }

        // Customer → Invoice association
        if (inv.customer) {
          yield {
            eventType: "association.found",
            payload: {
              fromSourceSystem: "stripe",
              fromExternalId: inv.customer,
              toSourceSystem: "stripe",
              toExternalId: inv.id,
              relationshipType: "invoiced",
            },
          };
        }
      }

      hasMore = data.has_more === true;
      if (hasMore && data.data?.length > 0) {
        startingAfter = data.data[data.data.length - 1].id;
      }
    }

    // ── Sync charges (payments) ───────────────────────────
    hasMore = true;
    startingAfter = undefined;

    while (hasMore) {
      const params = new URLSearchParams({ limit: "100" });
      if (sinceTs) params.set("created[gte]", String(sinceTs));
      if (startingAfter) params.set("starting_after", startingAfter);

      const resp = await stripeFetch(token, `/v1/charges?${params.toString()}`);
      if (!resp.ok) break;
      const data = await resp.json();

      for (const charge of data.data || []) {
        yield {
          eventType: "payment.received",
          payload: {
            id: charge.id,
            amount: charge.amount,
            currency: charge.currency,
            status: charge.status,
            customer: charge.customer,
            invoice: charge.invoice,
            created: charge.created,
          },
        };

        // Payment → Invoice association
        if (charge.invoice) {
          yield {
            eventType: "association.found",
            payload: {
              fromSourceSystem: "stripe",
              fromExternalId: charge.id,
              toSourceSystem: "stripe",
              toExternalId: charge.invoice,
              relationshipType: "payment-for",
            },
          };
        }

        // Payment → Customer association
        if (charge.customer) {
          yield {
            eventType: "association.found",
            payload: {
              fromSourceSystem: "stripe",
              fromExternalId: charge.id,
              toSourceSystem: "stripe",
              toExternalId: charge.customer,
              relationshipType: "paid-by",
            },
          };
        }
      }

      hasMore = data.has_more === true;
      if (hasMore && data.data?.length > 0) {
        startingAfter = data.data[data.data.length - 1].id;
      }
    }
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [
      {
        name: "send_invoice",
        description: "Send/finalize a draft invoice in Stripe",
        inputSchema: { invoiceId: "string" },
        sideEffects: ["Customer receives invoice email"],
      },
      {
        name: "void_invoice",
        description: "Void an open invoice in Stripe",
        inputSchema: { invoiceId: "string" },
        sideEffects: [
          "Invoice marked void in Stripe, customer no longer owes payment",
        ],
      },
    ];
  },

  async executeAction(config, action, params) {
    try {
      const token = await getValidStripeToken(config);

      switch (action) {
        case "send_invoice": {
          const resp = await stripeFetch(
            token,
            `/v1/invoices/${params.invoiceId}/send`,
            { method: "POST" }
          );
          if (!resp.ok) {
            const err = await resp.text();
            return {
              success: false,
              error: `Send invoice failed (${resp.status}): ${err}`,
            };
          }
          return { success: true, result: await resp.json() };
        }

        case "void_invoice": {
          const resp = await stripeFetch(
            token,
            `/v1/invoices/${params.invoiceId}/void`,
            { method: "POST" }
          );
          if (!resp.ok) {
            const err = await resp.text();
            return {
              success: false,
              error: `Void invoice failed (${resp.status}): ${err}`,
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

  async inferSchema(config): Promise<InferredSchema[]> {
    const token = await getValidStripeToken(config);
    const schemas: InferredSchema[] = [];

    // Customers
    const custResp = await stripeFetch(token, "/v1/customers?limit=5");
    if (custResp.ok) {
      const custData = await custResp.json();
      const records = custData.data || [];
      schemas.push({
        suggestedTypeName: "Contact",
        suggestedProperties: [
          { name: "email", dataType: "STRING", possibleRole: "email", sampleValues: records.map((r: any) => r.email).filter(Boolean).slice(0, 5) },
          { name: "phone", dataType: "STRING", possibleRole: "phone", sampleValues: records.map((r: any) => r.phone).filter(Boolean).slice(0, 5) },
          { name: "currency", dataType: "STRING", sampleValues: records.map((r: any) => r.currency).filter(Boolean).slice(0, 5) },
          { name: "stripe-customer-id", dataType: "STRING", sampleValues: records.map((r: any) => r.id).filter(Boolean).slice(0, 5) },
          { name: "balance", dataType: "CURRENCY", sampleValues: records.map((r: any) => String(r.balance ?? "")).filter((v: string) => v !== "").slice(0, 5) },
          { name: "delinquent", dataType: "BOOLEAN", sampleValues: records.map((r: any) => String(r.delinquent)).slice(0, 5) },
        ],
        sampleEntities: records.map((r: any) => ({
          name: r.name || "",
          email: r.email || "",
          currency: r.currency || "",
          balance: String(r.balance ?? ""),
        })),
        recordCount: records.length,
      });
    }

    // Invoices
    const invResp = await stripeFetch(token, "/v1/invoices?limit=5");
    if (invResp.ok) {
      const invData = await invResp.json();
      const records = invData.data || [];
      schemas.push({
        suggestedTypeName: "Invoice",
        suggestedProperties: [
          { name: "number", dataType: "STRING", sampleValues: records.map((r: any) => r.number).filter(Boolean).slice(0, 5) },
          { name: "amount", dataType: "CURRENCY", sampleValues: records.map((r: any) => String(r.amount_due ?? "")).filter((v: string) => v !== "").slice(0, 5) },
          { name: "status", dataType: "STRING", sampleValues: records.map((r: any) => r.status).filter(Boolean).slice(0, 5) },
          { name: "due-date", dataType: "DATE", sampleValues: records.map((r: any) => r.due_date ? String(r.due_date) : "").filter((v: string) => v !== "").slice(0, 5) },
          { name: "currency", dataType: "STRING", sampleValues: records.map((r: any) => r.currency).filter(Boolean).slice(0, 5) },
        ],
        sampleEntities: records.map((r: any) => ({
          number: r.number || "",
          amount_due: String(r.amount_due ?? ""),
          status: r.status || "",
          currency: r.currency || "",
        })),
        recordCount: records.length,
      });
    }

    return schemas;
  },
};
