import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

const PLEO_API = "https://external.pleo.io/v1";

// ── Helpers ──────────────────────────────────────────────

async function pleoFetch(
  config: ConnectorConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const apiKey = config.api_key as string;

  return fetch(`${PLEO_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function* paginatePleo<T>(
  config: ConnectorConfig,
  basePath: string,
  since?: Date,
): AsyncGenerator<T> {
  let cursor: string | undefined;

  while (true) {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (cursor) params.set("after", cursor);
    if (since) params.set("created_after", since.toISOString());

    const separator = basePath.includes("?") ? "&" : "?";
    const url = `${basePath}${separator}${params.toString()}`;
    const resp = await pleoFetch(config, url);
    if (!resp.ok) break;

    const data = await resp.json();
    const items: T[] = data.data || [];
    for (const item of items) {
      yield item;
    }

    if (!data.pagination?.has_more) break;
    cursor = data.pagination.after;
  }
}

// ── Provider Implementation ──────────────────────────────

export const pleoProvider: ConnectorProvider = {
  id: "pleo",
  name: "Pleo",

  configSchema: [
    {
      key: "api_key",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "From Pleo → Settings → API keys",
    },
  ],

  async testConnection(config) {
    try {
      const resp = await pleoFetch(config, "/members?limit=1");
      if (!resp.ok) {
        return {
          ok: false,
          error: `Pleo API ${resp.status}: ${resp.statusText}`,
        };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    // ── Expenses ──────────────────────────────────────────
    for await (const exp of paginatePleo<any>(
      config,
      "/export/expenses",
      since,
    )) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "expense.synced",
          payload: {
            id: exp.id,
            amount: exp.amount,
            currency: exp.currency,
            merchant: exp.merchantName,
            category: exp.category,
            status: exp.status,
            date: exp.date,
            employee: exp.memberName,
            receiptUrl: exp.receiptImageUrl,
          },
        },
      };
    }

    // ── Team members ──────────────────────────────────────
    for await (const member of paginatePleo<any>(config, "/members", since)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: member.id,
            firstname: member.firstName,
            lastname: member.lastName,
            email: member.email,
            phone: member.phone,
          },
        },
      };
    }
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [];
  },

  async executeAction(_config, _action, _params) {
    return { success: false, error: "Pleo connector is read-only" };
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
