import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

const ECONOMIC_API = "https://restapi.e-conomic.com";

// ── Helpers ──────────────────────────────────────────────

async function economicFetch(
  config: ConnectorConfig,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const grantToken = config.grant_token as string;
  const appSecret = process.env.ECONOMIC_APP_SECRET_TOKEN;
  if (!appSecret) throw new Error("ECONOMIC_APP_SECRET_TOKEN not configured");

  return fetch(`${ECONOMIC_API}${path}`, {
    ...init,
    headers: {
      "X-AppSecretToken": appSecret,
      "X-AgreementGrantToken": grantToken,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function* paginateEconomic<T>(
  config: ConnectorConfig,
  basePath: string,
): AsyncGenerator<T> {
  let page = 0;
  let lastPage = false;

  while (!lastPage) {
    const separator = basePath.includes("?") ? "&" : "?";
    const url = `${basePath}${separator}skipPages=${page}&pageSize=100`;
    const resp = await economicFetch(config, url);
    if (!resp.ok) break;
    const data = await resp.json();

    const items = data.collection || [];
    for (const item of items) {
      yield item as T;
    }

    lastPage = data.pagination?.lastPage !== false;
    page++;
  }
}

// ── Provider Implementation ──────────────────────────────

export const economicProvider: ConnectorProvider = {
  id: "economic",
  name: "e-conomic",

  configSchema: [
    {
      key: "grant_token",
      label: "Agreement Grant Token",
      type: "password",
      required: true,
      placeholder: "Paste your grant token from e-conomic Settings → Apps",
    },
  ],

  writeCapabilities: [
    {
      slug: "create_invoice_draft",
      name: "Create Invoice Draft",
      description: "Create a draft invoice in e-conomic for a customer with line items",
      inputSchema: {
        customerId: "number",
        lines: "array<{ productId: string, quantity: number, unitPrice: number, description?: string }>",
        dueDate: "string (ISO date)",
      },
    },
    {
      slug: "book_invoice",
      name: "Book Invoice",
      description: "Book (finalize) a draft invoice in e-conomic — this is irreversible",
      inputSchema: { draftInvoiceNumber: "number" },
    },
    {
      slug: "create_credit_note",
      name: "Create Credit Note",
      description: "Create a credit note (draft with negative amounts) referencing a booked invoice",
      inputSchema: {
        bookedInvoiceNumber: "number",
        lines: "array<{ productId: string, quantity: number, unitPrice: number }>",
      },
    },
    {
      slug: "create_customer",
      name: "Create Customer",
      description: "Create a new customer in e-conomic",
      inputSchema: {
        name: "string",
        email: "string?",
        vatNumber: "string?",
        paymentTermsNumber: "number?",
        customerGroupNumber: "number?",
      },
    },
    {
      slug: "update_customer",
      name: "Update Customer",
      description: "Update an existing customer in e-conomic (fetches current record, merges fields, full PUT)",
      inputSchema: { customerNumber: "number", fields: "object" },
    },
    {
      slug: "record_manual_payment",
      name: "Record Manual Payment",
      description:
        "Record a manual payment against an invoice via a journal entry in e-conomic",
      inputSchema: {
        invoiceNumber: "number",
        amount: "number",
        paymentDate: "string (ISO date)",
        accountNumber: "number (optional, default 5820)",
        contraAccountNumber: "number (optional, default 1000)",
      },
    },
  ],

  async testConnection(config) {
    try {
      const resp = await economicFetch(config, "/self");
      if (!resp.ok) {
        return {
          ok: false,
          error: `e-conomic API ${resp.status}: ${resp.statusText}`,
        };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    // ── Sync customers ────────────────────────────────────
    for await (const cust of paginateEconomic<any>(config, "/customers")) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "customer.synced",
          payload: {
            id: cust.customerNumber,
            name: cust.name,
            email: cust.email,
            phone: cust.telephoneAndFaxNumber,
            currency: cust.currency,
            balance: cust.balance,
            corporateIdentificationNumber: cust.corporateIdentificationNumber,
          },
        },
      };

      yield {
        kind: "activity" as const,
        data: {
          signalType: "erp_customer_synced",
          occurredAt: new Date(),
        },
      };
    }

    // ── Sync invoices (booked) ────────────────────────────
    let invoicePath = "/invoices/booked";
    if (since) {
      const sinceDate = since.toISOString().slice(0, 10);
      invoicePath += `?filter=date$gte:${sinceDate}`;
    }

    const today = new Date();

    for await (const inv of paginateEconomic<any>(config, invoicePath)) {
      const remainder = inv.remainder ?? 0;
      const grossAmount = inv.grossAmount ?? 0;
      const bookedInvoiceNumber = inv.bookedInvoiceNumber;
      const dueDate = inv.dueDate;

      yield {
        kind: "event" as const,
        data: {
          eventType: "invoice.created",
          payload: {
            id: bookedInvoiceNumber,
            number: bookedInvoiceNumber,
            amount_due: remainder,
            total: grossAmount,
            status: remainder === 0 ? "paid" : "open",
            due_date: dueDate,
            currency: inv.currency,
          },
        },
      };

      // Paid invoice
      if (remainder === 0) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "invoice.paid",
            payload: {
              id: bookedInvoiceNumber,
              number: bookedInvoiceNumber,
              amount_paid: grossAmount,
              status: "paid",
            },
          },
        };
      }

      // Overdue invoice
      if (remainder > 0 && dueDate && new Date(dueDate) < today) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "invoice.overdue",
            payload: {
              id: bookedInvoiceNumber,
              number: bookedInvoiceNumber,
              amount_due: remainder,
              status: "overdue",
              due_date: dueDate,
            },
          },
        };
      }

      // Invoice → Customer association
      if (inv.customer?.customerNumber) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "association.found",
            payload: {
              fromSourceSystem: "economic",
              fromExternalId: String(inv.customer.customerNumber),
              toSourceSystem: "economic",
              toExternalId: String(bookedInvoiceNumber),
              relationshipType: "invoiced",
            },
          },
        };
      }
    }

    // ── Sync products ─────────────────────────────────────
    for await (const prod of paginateEconomic<any>(config, "/products")) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "product.synced",
          payload: {
            id: prod.productNumber,
            name: prod.name,
            sku: prod.productNumber,
            price: prod.salesPrice,
            currency: "DKK",
            status: prod.barred ? "barred" : "active",
            category: prod.productGroup?.name,
          },
        },
      };
    }

    // ── Sync accounts (chart of accounts) — content only ──
    const accounts: Array<{ accountNumber: number; name: string; accountType: string }> = [];
    for await (const acct of paginateEconomic<any>(config, "/accounts")) {
      accounts.push({
        accountNumber: acct.accountNumber,
        name: acct.name,
        accountType: acct.accountType,
      });
    }

    if (accounts.length > 0) {
      yield {
        kind: "content" as const,
        data: {
          sourceType: "erp_chart_of_accounts",
          sourceId: "economic-accounts",
          content: JSON.stringify(accounts),
          metadata: { accountCount: accounts.length },
        },
      };
    }
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [
      {
        name: "create_invoice_draft",
        description: "Create a draft invoice in e-conomic for a customer with line items",
        inputSchema: {
          customerId: "number",
          lines: "array<{ productId: string, quantity: number, unitPrice: number, description?: string }>",
          dueDate: "string (ISO date)",
        },
        sideEffects: ["Draft invoice created in e-conomic"],
      },
      {
        name: "book_invoice",
        description: "Book (finalize) a draft invoice in e-conomic — this is irreversible",
        inputSchema: { draftInvoiceNumber: "number" },
        sideEffects: ["Draft invoice booked (finalized) in e-conomic — cannot be undone"],
      },
      {
        name: "create_credit_note",
        description: "Create a credit note (draft with negative amounts) referencing a booked invoice",
        inputSchema: {
          bookedInvoiceNumber: "number",
          lines: "array<{ productId: string, quantity: number, unitPrice: number }>",
        },
        sideEffects: ["Credit note draft created in e-conomic"],
      },
      {
        name: "create_customer",
        description: "Create a new customer in e-conomic",
        inputSchema: {
          name: "string",
          email: "string?",
          vatNumber: "string?",
          paymentTermsNumber: "number?",
          customerGroupNumber: "number?",
        },
        sideEffects: ["New customer record created in e-conomic"],
      },
      {
        name: "update_customer",
        description: "Update an existing customer in e-conomic (fetches current record, merges fields, full PUT)",
        inputSchema: { customerNumber: "number", fields: "object" },
        sideEffects: ["Customer record updated in e-conomic"],
      },
      {
        name: "record_manual_payment",
        description:
          "Record a manual payment against an invoice via a journal entry in e-conomic",
        inputSchema: {
          invoiceNumber: "number",
          amount: "number",
          paymentDate: "string (ISO date)",
        },
        sideEffects: [
          "Journal entry created in e-conomic",
          "Payment recorded against invoice",
        ],
      },
    ];
  },

  async executeAction(config, action, params) {
    try {
      switch (action) {
        // ── 1. Create invoice draft ────────────────────────────
        case "create_invoice_draft": {
          if (!params.customerId) return { success: false, error: "customerId is required" };
          if (!params.lines || !Array.isArray(params.lines)) return { success: false, error: "lines is required" };
          if (!params.dueDate) return { success: false, error: "dueDate is required" };
          const customerId = params.customerId as number;
          const lines = params.lines as Array<{
            productId: string;
            quantity: number;
            unitPrice: number;
            description?: string;
          }>;
          const dueDate = params.dueDate as string;

          const body = {
            date: new Date().toISOString().slice(0, 10),
            currency: "DKK",
            customer: { customerNumber: customerId },
            paymentTerms: { paymentTermsNumber: 1 },
            layout: { layoutNumber: 1 },
            lines: lines.map((line) => ({
              product: { productNumber: line.productId },
              quantity: line.quantity,
              unitNetPrice: line.unitPrice,
              ...(line.description ? { description: line.description } : {}),
            })),
            dueDate,
          };

          const resp = await economicFetch(config, "/invoices/drafts", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create invoice draft failed (${resp.status}): ${err}` };
          }
          return { success: true, result: await resp.json() };
        }

        // ── 2. Book invoice ────────────────────────────────────
        case "book_invoice": {
          if (!params.draftInvoiceNumber) return { success: false, error: "draftInvoiceNumber is required" };
          const draftInvoiceNumber = params.draftInvoiceNumber as number;

          const resp = await economicFetch(config, "/invoices/booked", {
            method: "POST",
            body: JSON.stringify({
              draftInvoice: { draftInvoiceNumber },
            }),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Book invoice failed (${resp.status}): ${err}` };
          }
          return { success: true, result: await resp.json() };
        }

        // ── 3. Create credit note ──────────────────────────────
        case "create_credit_note": {
          if (!params.bookedInvoiceNumber) return { success: false, error: "bookedInvoiceNumber is required" };
          if (!params.lines || !Array.isArray(params.lines)) return { success: false, error: "lines is required" };
          const bookedInvoiceNumber = params.bookedInvoiceNumber as number;
          const creditLines = params.lines as Array<{
            productId: string;
            quantity: number;
            unitPrice: number;
          }>;

          // Fetch the original booked invoice to get customer info
          const invResp = await economicFetch(
            config,
            `/invoices/booked/${bookedInvoiceNumber}`
          );
          if (!invResp.ok) {
            const err = await invResp.text();
            return {
              success: false,
              error: `Fetch booked invoice ${bookedInvoiceNumber} failed (${invResp.status}): ${err}`,
            };
          }
          const bookedInv = await invResp.json();

          const creditBody = {
            date: new Date().toISOString().slice(0, 10),
            currency: bookedInv.currency || "DKK",
            customer: { customerNumber: bookedInv.customer?.customerNumber },
            paymentTerms: { paymentTermsNumber: 1 },
            layout: { layoutNumber: 1 },
            lines: creditLines.map((line) => ({
              product: { productNumber: line.productId },
              quantity: line.quantity,
              unitNetPrice: -Math.abs(line.unitPrice),
            })),
            references: {
              other: `Credit for invoice #${bookedInvoiceNumber}`,
            },
          };

          const resp = await economicFetch(config, "/invoices/drafts", {
            method: "POST",
            body: JSON.stringify(creditBody),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create credit note failed (${resp.status}): ${err}` };
          }
          return { success: true, result: await resp.json() };
        }

        // ── 4. Create customer ─────────────────────────────────
        case "create_customer": {
          if (!params.name) return { success: false, error: "name is required" };
          const name = params.name as string;
          const email = params.email as string | undefined;
          const vatNumber = params.vatNumber as string | undefined;
          const customerGroupNumber =
            (params.customerGroupNumber as number) || 1;
          const paymentTermsNumber =
            (params.paymentTermsNumber as number) || 1;

          const custBody: Record<string, unknown> = {
            name,
            customerGroup: { customerGroupNumber },
            paymentTerms: { paymentTermsNumber },
            currency: "DKK",
          };
          if (email) custBody.email = email;
          if (vatNumber) custBody.vatNumber = vatNumber;

          const resp = await economicFetch(config, "/customers", {
            method: "POST",
            body: JSON.stringify(custBody),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create customer failed (${resp.status}): ${err}` };
          }
          return { success: true, result: await resp.json() };
        }

        // ── 5. Update customer ─────────────────────────────────
        case "update_customer": {
          if (!params.customerNumber) return { success: false, error: "customerNumber is required" };
          if (!params.fields) return { success: false, error: "fields is required" };
          const customerNumber = params.customerNumber as number;
          const fields = params.fields as Record<string, unknown>;

          // Fetch current customer (e-conomic uses full PUT)
          const getResp = await economicFetch(
            config,
            `/customers/${customerNumber}`
          );
          if (!getResp.ok) {
            const err = await getResp.text();
            return {
              success: false,
              error: `Fetch customer ${customerNumber} failed (${getResp.status}): ${err}`,
            };
          }
          const current = await getResp.json();

          // Merge caller-provided fields on top of the existing record
          const merged = { ...current, ...fields };

          const putResp = await economicFetch(
            config,
            `/customers/${customerNumber}`,
            {
              method: "PUT",
              body: JSON.stringify(merged),
            }
          );
          if (!putResp.ok) {
            const err = await putResp.text();
            return { success: false, error: `Update customer failed (${putResp.status}): ${err}` };
          }
          return { success: true, result: await putResp.json() };
        }

        // ── 6. Record manual payment ───────────────────────────
        case "record_manual_payment": {
          if (!params.invoiceNumber) return { success: false, error: "invoiceNumber is required" };
          if (!params.amount) return { success: false, error: "amount is required" };
          if (!params.paymentDate) return { success: false, error: "paymentDate is required" };
          const invoiceNumber = params.invoiceNumber as number;
          const amount = params.amount as number;
          const paymentDate = params.paymentDate as string;
          const accountNumber = (params.accountNumber as number) || 5820;
          const contraAccountNumber = (params.contraAccountNumber as number) || 1000;

          const entryBody = {
            accountNumber,
            amount: -amount,
            currency: "DKK",
            date: paymentDate,
            text: `Payment for invoice #${invoiceNumber}`,
            contraAccountNumber,
          };

          const resp = await economicFetch(
            config,
            "/journals-experimental/1/entries",
            {
              method: "POST",
              body: JSON.stringify(entryBody),
            }
          );
          if (!resp.ok) {
            const err = await resp.text();
            return {
              success: false,
              error: `Record payment failed (${resp.status}): ${err}`,
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
    const schemas: InferredSchema[] = [];

    // Customers
    const custResp = await economicFetch(config, "/customers?pageSize=5");
    if (custResp.ok) {
      const custData = await custResp.json();
      const records = custData.collection || [];
      schemas.push({
        suggestedTypeName: "Contact",
        suggestedProperties: [
          { name: "email", dataType: "STRING", possibleRole: "email", sampleValues: records.map((r: any) => r.email).filter(Boolean).slice(0, 5) },
          { name: "phone", dataType: "STRING", possibleRole: "phone", sampleValues: records.map((r: any) => r.telephoneAndFaxNumber).filter(Boolean).slice(0, 5) },
          { name: "currency", dataType: "STRING", sampleValues: records.map((r: any) => r.currency).filter(Boolean).slice(0, 5) },
          { name: "balance", dataType: "CURRENCY", sampleValues: records.map((r: any) => String(r.balance ?? "")).filter((v: string) => v !== "").slice(0, 5) },
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
    const invResp = await economicFetch(config, "/invoices/booked?pageSize=5");
    if (invResp.ok) {
      const invData = await invResp.json();
      const records = invData.collection || [];
      schemas.push({
        suggestedTypeName: "Invoice",
        suggestedProperties: [
          { name: "number", dataType: "STRING", sampleValues: records.map((r: any) => String(r.bookedInvoiceNumber ?? "")).filter((v: string) => v !== "").slice(0, 5) },
          { name: "amount", dataType: "CURRENCY", sampleValues: records.map((r: any) => String(r.grossAmount ?? "")).filter((v: string) => v !== "").slice(0, 5) },
          { name: "status", dataType: "STRING", sampleValues: records.map((r: any) => r.remainder === 0 ? "paid" : "open").slice(0, 5) },
          { name: "due-date", dataType: "DATE", sampleValues: records.map((r: any) => r.dueDate || "").filter((v: string) => v !== "").slice(0, 5) },
          { name: "currency", dataType: "STRING", sampleValues: records.map((r: any) => r.currency).filter(Boolean).slice(0, 5) },
        ],
        sampleEntities: records.map((r: any) => ({
          number: String(r.bookedInvoiceNumber ?? ""),
          amount: String(r.grossAmount ?? ""),
          status: r.remainder === 0 ? "paid" : "open",
          currency: r.currency || "",
        })),
        recordCount: records.length,
      });
    }

    // Products
    const prodResp = await economicFetch(config, "/products?pageSize=5");
    if (prodResp.ok) {
      const prodData = await prodResp.json();
      const records = prodData.collection || [];
      schemas.push({
        suggestedTypeName: "Product",
        suggestedProperties: [
          { name: "sku", dataType: "STRING", sampleValues: records.map((r: any) => String(r.productNumber ?? "")).filter((v: string) => v !== "").slice(0, 5) },
          { name: "price", dataType: "CURRENCY", sampleValues: records.map((r: any) => String(r.salesPrice ?? "")).filter((v: string) => v !== "").slice(0, 5) },
          { name: "status", dataType: "STRING", sampleValues: records.map((r: any) => r.barred ? "barred" : "active").slice(0, 5) },
          { name: "category", dataType: "STRING", sampleValues: records.map((r: any) => r.productGroup?.name).filter(Boolean).slice(0, 5) },
        ],
        sampleEntities: records.map((r: any) => ({
          name: r.name || "",
          sku: String(r.productNumber ?? ""),
          price: String(r.salesPrice ?? ""),
          status: r.barred ? "barred" : "active",
        })),
        recordCount: records.length,
      });
    }

    return schemas;
  },
};
