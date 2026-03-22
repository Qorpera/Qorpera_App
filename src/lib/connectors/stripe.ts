import type {
  ConnectorProvider,
  ConnectorConfig,
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
        yield { kind: "event" as const, data: {
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
        } };
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

        yield { kind: "event" as const, data: {
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
        } };

        if (inv.status === "paid") {
          yield { kind: "event" as const, data: {
            eventType: "invoice.paid",
            payload: {
              id: inv.id,
              number: inv.number,
              amount_paid: inv.amount_paid,
              status: "paid",
              paid_at: inv.status_transitions?.paid_at,
              customer: inv.customer,
            },
          } };
        }

        if (
          inv.status === "open" &&
          inv.due_date &&
          inv.due_date < Math.floor(Date.now() / 1000)
        ) {
          yield { kind: "event" as const, data: {
            eventType: "invoice.overdue",
            payload: {
              id: inv.id,
              number: inv.number,
              amount_due: inv.amount_due,
              status: "overdue",
              due_date: inv.due_date,
              customer: inv.customer,
            },
          } };
        }

        // Customer → Invoice association
        if (inv.customer) {
          yield { kind: "event" as const, data: {
            eventType: "association.found",
            payload: {
              fromSourceSystem: "stripe",
              fromExternalId: inv.customer,
              toSourceSystem: "stripe",
              toExternalId: inv.id,
              relationshipType: "invoiced",
            },
          } };
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
        yield { kind: "event" as const, data: {
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
        } };

        // Payment → Invoice association
        if (charge.invoice) {
          yield { kind: "event" as const, data: {
            eventType: "association.found",
            payload: {
              fromSourceSystem: "stripe",
              fromExternalId: charge.id,
              toSourceSystem: "stripe",
              toExternalId: charge.invoice,
              relationshipType: "payment-for",
            },
          } };
        }

        // Payment → Customer association
        if (charge.customer) {
          yield { kind: "event" as const, data: {
            eventType: "association.found",
            payload: {
              fromSourceSystem: "stripe",
              fromExternalId: charge.id,
              toSourceSystem: "stripe",
              toExternalId: charge.customer,
              relationshipType: "paid-by",
            },
          } };
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
      {
        name: "create_invoice",
        description:
          "Create a new invoice with line items, finalize it, and optionally send it",
        inputSchema: {
          customerId: "string",
          items: "array of {description: string, amount: number, currency?: string}",
          dueDate: "string (ISO date, optional)",
          autoSend: "boolean (optional)",
        },
        sideEffects: [
          "Invoice created and finalized in Stripe",
          "Customer receives invoice email if autoSend is true",
        ],
      },
      {
        name: "issue_refund",
        description: "Issue a full or partial refund for a payment",
        inputSchema: {
          paymentIntentId: "string",
          amount: "number (smallest currency unit, optional for full refund)",
          reason:
            "string (duplicate | fraudulent | requested_by_customer, optional)",
        },
        sideEffects: [
          "Refund issued to customer's payment method",
        ],
      },
      {
        name: "update_subscription",
        description:
          "Update a Stripe subscription (e.g. cancel at period end)",
        inputSchema: {
          subscriptionId: "string",
          cancelAtPeriodEnd: "boolean (optional)",
        },
        sideEffects: [
          "Subscription updated in Stripe",
        ],
      },
      {
        name: "create_customer",
        description:
          "Create a new Stripe customer (returns existing customer if email already exists)",
        inputSchema: {
          email: "string",
          name: "string (optional)",
          metadata: "Record<string, string> (optional)",
        },
        sideEffects: [
          "New customer record created in Stripe (unless already exists)",
        ],
      },
      {
        name: "update_customer",
        description: "Update an existing Stripe customer's details",
        inputSchema: {
          customerId: "string",
          fields:
            "object with optional keys: name, email, phone, description, metadata",
        },
        sideEffects: [
          "Customer record updated in Stripe",
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

        case "create_invoice": {
          const items = params.items as Array<{
            description: string;
            amount: number;
            currency?: string;
          }>;
          if (!params.customerId || !items?.length) {
            return {
              success: false,
              error: "customerId and items are required",
            };
          }

          // 1. Create the invoice
          const invoiceBody = new URLSearchParams();
          invoiceBody.set("customer", String(params.customerId));
          invoiceBody.set("collection_method", "send_invoice");
          if (params.dueDate) {
            const epoch = Math.floor(
              new Date(String(params.dueDate)).getTime() / 1000
            );
            invoiceBody.set("due_date", String(epoch));
          } else {
            // Default: due in 30 days
            const due30 = Math.floor(Date.now() / 1000) + 30 * 86400;
            invoiceBody.set("due_date", String(due30));
          }

          const invResp = await stripeFetch(token, "/v1/invoices", {
            method: "POST",
            body: invoiceBody.toString(),
          });
          if (!invResp.ok) {
            const err = await invResp.text();
            return {
              success: false,
              error: `Create invoice failed (${invResp.status}): ${err}`,
            };
          }
          const invoice = await invResp.json();

          // 2. Add line items
          for (const item of items) {
            const itemBody = new URLSearchParams();
            itemBody.set("invoice", invoice.id);
            itemBody.set("description", item.description);
            itemBody.set("amount", String(item.amount));
            itemBody.set("currency", item.currency || "dkk");

            const itemResp = await stripeFetch(token, "/v1/invoiceitems", {
              method: "POST",
              body: itemBody.toString(),
            });
            if (!itemResp.ok) {
              const err = await itemResp.text();
              return {
                success: false,
                error: `Add invoice item failed (${itemResp.status}): ${err}`,
              };
            }
          }

          // 3. Finalize the invoice
          const finalizeResp = await stripeFetch(
            token,
            `/v1/invoices/${invoice.id}/finalize`,
            { method: "POST" }
          );
          if (!finalizeResp.ok) {
            const err = await finalizeResp.text();
            return {
              success: false,
              error: `Finalize invoice failed (${finalizeResp.status}): ${err}`,
              result: { invoiceId: invoice.id, status: "draft", step: "finalize_failed" },
            };
          }
          const finalizedInvoice = await finalizeResp.json();

          // 4. Optionally send the invoice
          if (params.autoSend) {
            const sendResp = await stripeFetch(
              token,
              `/v1/invoices/${invoice.id}/send`,
              { method: "POST" }
            );
            if (!sendResp.ok) {
              const err = await sendResp.text();
              return {
                success: false,
                error: `Send invoice failed (${sendResp.status}): ${err}`,
                result: { invoiceId: invoice.id, status: "open", step: "send_failed" },
              };
            }
            return { success: true, result: await sendResp.json() };
          }

          return { success: true, result: finalizedInvoice };
        }

        case "issue_refund": {
          if (!params.paymentIntentId) {
            return {
              success: false,
              error: "paymentIntentId is required",
            };
          }

          const refundBody = new URLSearchParams();
          refundBody.set("payment_intent", String(params.paymentIntentId));
          if (params.amount != null) {
            refundBody.set("amount", String(params.amount));
          }
          if (params.reason) {
            refundBody.set("reason", String(params.reason));
          }

          const refundResp = await stripeFetch(token, "/v1/refunds", {
            method: "POST",
            body: refundBody.toString(),
          });
          if (!refundResp.ok) {
            const err = await refundResp.text();
            return {
              success: false,
              error: `Issue refund failed (${refundResp.status}): ${err}`,
            };
          }
          return { success: true, result: await refundResp.json() };
        }

        case "update_subscription": {
          if (!params.subscriptionId) {
            return {
              success: false,
              error: "subscriptionId is required",
            };
          }

          const subBody = new URLSearchParams();
          if (params.cancelAtPeriodEnd != null) {
            subBody.set(
              "cancel_at_period_end",
              String(params.cancelAtPeriodEnd)
            );
          }

          const subResp = await stripeFetch(
            token,
            `/v1/subscriptions/${params.subscriptionId}`,
            { method: "POST", body: subBody.toString() }
          );
          if (!subResp.ok) {
            const err = await subResp.text();
            return {
              success: false,
              error: `Update subscription failed (${subResp.status}): ${err}`,
            };
          }
          return { success: true, result: await subResp.json() };
        }

        case "create_customer": {
          if (!params.email) {
            return { success: false, error: "email is required" };
          }

          // Check for existing customer by email
          const searchParams = new URLSearchParams();
          searchParams.set("email", String(params.email));
          searchParams.set("limit", "1");

          const searchResp = await stripeFetch(
            token,
            `/v1/customers?${searchParams.toString()}`
          );
          if (searchResp.ok) {
            const searchData = await searchResp.json();
            if (searchData.data?.length > 0) {
              return {
                success: true,
                result: {
                  ...searchData.data[0],
                  _existing: true,
                },
              };
            }
          }

          // Create new customer
          const custBody = new URLSearchParams();
          custBody.set("email", String(params.email));
          if (params.name) {
            custBody.set("name", String(params.name));
          }
          if (params.metadata && typeof params.metadata === "object") {
            const meta = params.metadata as Record<string, string>;
            for (const [key, value] of Object.entries(meta)) {
              custBody.set(`metadata[${key}]`, String(value));
            }
          }

          const custResp = await stripeFetch(token, "/v1/customers", {
            method: "POST",
            body: custBody.toString(),
          });
          if (!custResp.ok) {
            const err = await custResp.text();
            return {
              success: false,
              error: `Create customer failed (${custResp.status}): ${err}`,
            };
          }
          return { success: true, result: await custResp.json() };
        }

        case "update_customer": {
          if (!params.customerId) {
            return { success: false, error: "customerId is required" };
          }
          const fields = params.fields as Record<string, unknown> | undefined;
          if (!fields || typeof fields !== "object") {
            return { success: false, error: "fields object is required" };
          }

          const updateBody = new URLSearchParams();
          const allowedFields = ["name", "email", "phone", "description"];
          for (const field of allowedFields) {
            if (fields[field] != null) {
              updateBody.set(field, String(fields[field]));
            }
          }
          if (fields.metadata && typeof fields.metadata === "object") {
            const meta = fields.metadata as Record<string, string>;
            for (const [key, value] of Object.entries(meta)) {
              updateBody.set(`metadata[${key}]`, String(value));
            }
          }

          const updateResp = await stripeFetch(
            token,
            `/v1/customers/${params.customerId}`,
            { method: "POST", body: updateBody.toString() }
          );
          if (!updateResp.ok) {
            const err = await updateResp.text();
            return {
              success: false,
              error: `Update customer failed (${updateResp.status}): ${err}`,
            };
          }
          return { success: true, result: await updateResp.json() };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  writeCapabilities: [
    {
      slug: "create_invoice",
      name: "Create Invoice",
      description: "Create a new invoice with line items, finalize it, and optionally send it",
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                amount: { type: "number" },
                currency: { type: "string" },
              },
              required: ["description", "amount"],
            },
          },
          dueDate: { type: "string" },
          autoSend: { type: "boolean" },
        },
        required: ["customerId", "items"],
      },
    },
    {
      slug: "issue_refund",
      name: "Issue Refund",
      description: "Issue a full or partial refund for a payment",
      inputSchema: {
        type: "object",
        properties: {
          paymentIntentId: { type: "string" },
          amount: { type: "number" },
          reason: { type: "string", enum: ["duplicate", "fraudulent", "requested_by_customer"] },
        },
        required: ["paymentIntentId"],
      },
    },
    {
      slug: "update_subscription",
      name: "Update Subscription",
      description: "Update a Stripe subscription (e.g. cancel at period end)",
      inputSchema: {
        type: "object",
        properties: {
          subscriptionId: { type: "string" },
          cancelAtPeriodEnd: { type: "boolean" },
        },
        required: ["subscriptionId"],
      },
    },
    {
      slug: "create_customer",
      name: "Create Customer",
      description: "Create a new Stripe customer (checks for existing by email first)",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string" },
          name: { type: "string" },
          metadata: { type: "object" },
        },
        required: ["email"],
      },
    },
    {
      slug: "update_customer",
      name: "Update Customer",
      description: "Update an existing Stripe customer's details",
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string" },
          fields: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" },
              description: { type: "string" },
              metadata: { type: "object" },
            },
          },
        },
        required: ["customerId", "fields"],
      },
    },
    // Existing capabilities
    { slug: "send_invoice", name: "Send Invoice", description: "Finalize and send a draft invoice", inputSchema: { type: "object", properties: { invoiceId: { type: "string" } }, required: ["invoiceId"] } },
    { slug: "void_invoice", name: "Void Invoice", description: "Void an open invoice", inputSchema: { type: "object", properties: { invoiceId: { type: "string" } }, required: ["invoiceId"] } },
  ],

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
