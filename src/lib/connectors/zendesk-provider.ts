import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

// ── Helpers ──────────────────────────────────────────────

function getBaseUrl(config: ConnectorConfig): string {
  return `https://${config.subdomain as string}.zendesk.com`;
}

async function getValidToken(config: ConnectorConfig): Promise<string> {
  const expiry = new Date(config.token_expiry as string);

  if (expiry.getTime() > Date.now() + 5 * 60 * 1000) {
    return config.access_token as string;
  }

  const subdomain = config.subdomain as string;
  const resp = await fetch(`https://${subdomain}.zendesk.com/oauth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: process.env.ZENDESK_CLIENT_ID!,
      client_secret: process.env.ZENDESK_CLIENT_SECRET!,
      refresh_token: config.refresh_token as string,
    }),
  });

  if (!resp.ok) throw new Error(`Zendesk token refresh failed: ${resp.status}`);
  const data = await resp.json();

  config.access_token = data.access_token;
  if (data.refresh_token) config.refresh_token = data.refresh_token;
  config.token_expiry = new Date(Date.now() + (data.expires_in || 7200) * 1000).toISOString();

  return data.access_token;
}

async function zendeskRequest(
  config: ConnectorConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const token = await getValidToken(config);
  const baseUrl = getBaseUrl(config);

  const resp = await fetch(`${baseUrl}${path}`, {
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

  const data = await resp.json();
  return { ok: true, status: resp.status, data };
}

// ── Provider Implementation ──────────────────────────────

export const zendeskProvider: ConnectorProvider = {
  id: "zendesk",
  name: "Zendesk",

  configSchema: [
    { key: "subdomain", label: "Zendesk Subdomain", type: "text", required: true, placeholder: "yourcompany" },
    { key: "oauth", label: "Zendesk Account", type: "oauth", required: true },
  ],

  writeCapabilities: [
    {
      slug: "reply_to_ticket",
      name: "Reply to Ticket",
      description: "Adds a public reply to a Zendesk ticket",
      inputSchema: { type: "object", properties: { ticketId: { type: "string" }, body: { type: "string" } }, required: ["ticketId", "body"] },
    },
    {
      slug: "update_ticket_status",
      name: "Update Ticket Status",
      description: "Changes a Zendesk ticket's status",
      inputSchema: { type: "object", properties: { ticketId: { type: "string" }, status: { type: "string", enum: ["open", "pending", "hold", "solved"] } }, required: ["ticketId", "status"] },
    },
    {
      slug: "add_internal_note",
      name: "Add Internal Note",
      description: "Adds a private internal note to a Zendesk ticket",
      inputSchema: { type: "object", properties: { ticketId: { type: "string" }, body: { type: "string" } }, required: ["ticketId", "body"] },
    },
  ],

  async testConnection(config) {
    try {
      const result = await zendeskRequest(config, "GET", "/api/v2/users/me.json");
      if (!result.ok) return { ok: false, error: `Zendesk API ${result.status}: ${result.error}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, _since?) {
    const token = await getValidToken(config);
    const baseUrl = getBaseUrl(config);

    // ── Tickets ─────────────────────────────────────────
    let ticketUrl: string | null = `${baseUrl}/api/v2/tickets.json?per_page=100`;
    while (ticketUrl) {
      const resp: Response = await fetch(ticketUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) break;
      const data: any = await resp.json();

      for (const ticket of data.tickets || []) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "ticket.synced",
            payload: {
              id: ticket.id,
              number: String(ticket.id),
              subject: ticket.subject,
              status: ticket.status,
              priority: ticket.priority,
              channel: ticket.via?.channel,
              created_date: ticket.created_at,
            },
          },
        };

        // Ticket description as content for RAG
        if (ticket.description) {
          yield {
            kind: "content" as const,
            data: {
              sourceType: "email" as const,
              sourceId: `zendesk-ticket-${ticket.id}`,
              content: ticket.description,
              metadata: {
                subject: ticket.subject,
                status: ticket.status,
                priority: ticket.priority,
                channel: ticket.via?.channel,
                created_at: ticket.created_at,
              },
            },
          };
        }
      }

      ticketUrl = data.next_page || null;
    }

    // ── Users (end-users only) ──────────────────────────
    let userUrl: string | null = `${baseUrl}/api/v2/users.json?role=end-user&per_page=100`;
    while (userUrl) {
      const resp: Response = await fetch(userUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) break;
      const data: any = await resp.json();

      for (const user of data.users || []) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "contact.synced",
            payload: {
              id: user.id,
              name: user.name,
              email: user.email,
              phone: user.phone,
            },
          },
        };
      }

      userUrl = data.next_page || null;
    }

    // ── Organizations ───────────────────────────────────
    let orgUrl: string | null = `${baseUrl}/api/v2/organizations.json?per_page=100`;
    while (orgUrl) {
      const resp: Response = await fetch(orgUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) break;
      const data: any = await resp.json();

      for (const org of data.organizations || []) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "contact.synced",
            payload: {
              id: `org-${org.id}`,
              name: org.name,
              domain: Array.isArray(org.domain_names) ? org.domain_names[0] : undefined,
              isCompany: true,
            },
          },
        };
      }

      orgUrl = data.next_page || null;
    }
  },

  async executeAction(config, action, params) {
    try {
      switch (action) {
        case "reply_to_ticket": {
          const result = await zendeskRequest(config, "PUT", `/api/v2/tickets/${params.ticketId}.json`, {
            ticket: { comment: { body: params.body, public: true } },
          });
          if (!result.ok) return { success: false, error: `Reply failed (${result.status}): ${result.error}` };
          return { success: true, result: result.data };
        }

        case "update_ticket_status": {
          const result = await zendeskRequest(config, "PUT", `/api/v2/tickets/${params.ticketId}.json`, {
            ticket: { status: params.status },
          });
          if (!result.ok) return { success: false, error: `Update status failed (${result.status}): ${result.error}` };
          return { success: true, result: result.data };
        }

        case "add_internal_note": {
          const result = await zendeskRequest(config, "PUT", `/api/v2/tickets/${params.ticketId}.json`, {
            ticket: { comment: { body: params.body, public: false } },
          });
          if (!result.ok) return { success: false, error: `Add note failed (${result.status}): ${result.error}` };
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
        name: "reply_to_ticket",
        description: "Add a public reply to a Zendesk ticket",
        inputSchema: { ticketId: "string", body: "string" },
        sideEffects: ["Reply sent to ticket requester"],
      },
      {
        name: "update_ticket_status",
        description: "Change a Zendesk ticket's status",
        inputSchema: { ticketId: "string", status: "string" },
        sideEffects: ["Ticket status changed in Zendesk"],
      },
      {
        name: "add_internal_note",
        description: "Add a private note to a Zendesk ticket",
        inputSchema: { ticketId: "string", body: "string" },
        sideEffects: ["Internal note added to ticket"],
      },
    ];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
