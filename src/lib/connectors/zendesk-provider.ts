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
    {
      slug: "create_ticket",
      name: "Create Ticket",
      description: "Creates a new Zendesk support ticket",
      inputSchema: { type: "object", properties: { subject: { type: "string" }, description: { type: "string" }, priority: { type: "string", enum: ["low", "normal", "high", "urgent"] }, type: { type: "string", enum: ["problem", "incident", "question", "task"] }, requesterId: { type: "string" }, assigneeId: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["subject", "description"] },
    },
    {
      slug: "assign_ticket",
      name: "Assign Ticket",
      description: "Assigns a Zendesk ticket to an agent",
      inputSchema: { type: "object", properties: { ticketId: { type: "string" }, assigneeId: { type: "string" } }, required: ["ticketId", "assigneeId"] },
    },
    {
      slug: "close_ticket",
      name: "Close Ticket",
      description: "Closes a solved Zendesk ticket",
      inputSchema: { type: "object", properties: { ticketId: { type: "string" } }, required: ["ticketId"] },
    },
    {
      slug: "set_ticket_priority",
      name: "Set Ticket Priority",
      description: "Sets the priority level of a Zendesk ticket",
      inputSchema: { type: "object", properties: { ticketId: { type: "string" }, priority: { type: "string", enum: ["low", "normal", "high", "urgent"] } }, required: ["ticketId", "priority"] },
    },
    {
      slug: "add_tags",
      name: "Add Tags",
      description: "Adds tags to a Zendesk ticket",
      inputSchema: { type: "object", properties: { ticketId: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["ticketId", "tags"] },
    },
    {
      slug: "remove_tags",
      name: "Remove Tags",
      description: "Removes tags from a Zendesk ticket",
      inputSchema: { type: "object", properties: { ticketId: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["ticketId", "tags"] },
    },
    {
      slug: "merge_tickets",
      name: "Merge Tickets",
      description: "Merges one or more source tickets into a target ticket",
      inputSchema: { type: "object", properties: { targetTicketId: { type: "string" }, sourceTicketIds: { type: "array", items: { type: "string" } }, targetComment: { type: "string" }, sourceComment: { type: "string" } }, required: ["targetTicketId", "sourceTicketIds"] },
    },
    {
      slug: "update_ticket_type",
      name: "Update Ticket Type",
      description: "Changes the type of a Zendesk ticket",
      inputSchema: { type: "object", properties: { ticketId: { type: "string" }, type: { type: "string", enum: ["problem", "incident", "question", "task"] } }, required: ["ticketId", "type"] },
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

        case "create_ticket": {
          if (!params.subject) return { success: false, error: "subject is required" };
          if (!params.description) return { success: false, error: "description is required" };
          const ticket: Record<string, unknown> = {
            subject: params.subject,
            comment: { body: params.description },
          };
          if (params.priority) ticket.priority = params.priority;
          if (params.type) ticket.type = params.type;
          if (params.requesterId) ticket.requester_id = params.requesterId;
          if (params.assigneeId) ticket.assignee_id = params.assigneeId;
          if (params.tags) ticket.tags = params.tags;
          const result = await zendeskRequest(config, "POST", "/api/v2/tickets.json", { ticket });
          if (!result.ok) return { success: false, error: `Create ticket failed (${result.status}): ${result.error}` };
          return { success: true, result: result.data };
        }

        case "assign_ticket": {
          if (!params.ticketId) return { success: false, error: "ticketId is required" };
          if (!params.assigneeId) return { success: false, error: "assigneeId is required" };
          const result = await zendeskRequest(config, "PUT", `/api/v2/tickets/${params.ticketId}.json`, {
            ticket: { assignee_id: params.assigneeId },
          });
          if (!result.ok) return { success: false, error: `Assign ticket failed (${result.status}): ${result.error}` };
          return { success: true, result: result.data };
        }

        case "close_ticket": {
          if (!params.ticketId) return { success: false, error: "ticketId is required" };
          // Zendesk only allows closing solved tickets — fetch current status first
          const check = await zendeskRequest(config, "GET", `/api/v2/tickets/${params.ticketId}.json`);
          if (!check.ok) return { success: false, error: `Failed to fetch ticket (${check.status}): ${check.error}` };
          const currentStatus = check.data?.ticket?.status;
          if (currentStatus !== "solved") {
            return { success: false, error: `Cannot close ticket — current status is "${currentStatus}". Only solved tickets can be closed.` };
          }
          const result = await zendeskRequest(config, "PUT", `/api/v2/tickets/${params.ticketId}.json`, {
            ticket: { status: "closed" },
          });
          if (!result.ok) return { success: false, error: `Close ticket failed (${result.status}): ${result.error}` };
          return { success: true, result: result.data };
        }

        case "set_ticket_priority": {
          if (!params.ticketId) return { success: false, error: "ticketId is required" };
          const validPriorities = ["low", "normal", "high", "urgent"];
          if (!validPriorities.includes(String(params.priority))) {
            return { success: false, error: `Invalid priority "${params.priority}". Must be one of: ${validPriorities.join(", ")}` };
          }
          const result = await zendeskRequest(config, "PUT", `/api/v2/tickets/${params.ticketId}.json`, {
            ticket: { priority: params.priority },
          });
          if (!result.ok) return { success: false, error: `Set priority failed (${result.status}): ${result.error}` };
          return { success: true, result: result.data };
        }

        case "add_tags": {
          if (!params.ticketId) return { success: false, error: "ticketId is required" };
          if (!params.tags) return { success: false, error: "tags is required" };
          const result = await zendeskRequest(config, "PUT", `/api/v2/tickets/${params.ticketId}/tags.json`, {
            tags: params.tags,
          });
          if (!result.ok) return { success: false, error: `Add tags failed (${result.status}): ${result.error}` };
          return { success: true, result: result.data };
        }

        case "remove_tags": {
          if (!params.ticketId) return { success: false, error: "ticketId is required" };
          if (!params.tags) return { success: false, error: "tags is required" };
          const result = await zendeskRequest(config, "DELETE", `/api/v2/tickets/${params.ticketId}/tags.json`, {
            tags: params.tags,
          });
          if (!result.ok) return { success: false, error: `Remove tags failed (${result.status}): ${result.error}` };
          return { success: true, result: result.data };
        }

        case "merge_tickets": {
          if (!params.targetTicketId) return { success: false, error: "targetTicketId is required" };
          if (!params.sourceTicketIds) return { success: false, error: "sourceTicketIds is required" };
          const body: Record<string, unknown> = {
            ids: params.sourceTicketIds,
          };
          if (params.targetComment) body.target_comment = params.targetComment;
          if (params.sourceComment) body.source_comment = params.sourceComment;
          const result = await zendeskRequest(config, "POST", `/api/v2/tickets/${params.targetTicketId}/merge.json`, body);
          if (!result.ok) return { success: false, error: `Merge tickets failed (${result.status}): ${result.error}` };
          return { success: true, result: result.data };
        }

        case "update_ticket_type": {
          if (!params.ticketId) return { success: false, error: "ticketId is required" };
          const validTypes = ["problem", "incident", "question", "task"];
          if (!validTypes.includes(String(params.type))) {
            return { success: false, error: `Invalid type "${params.type}". Must be one of: ${validTypes.join(", ")}` };
          }
          const result = await zendeskRequest(config, "PUT", `/api/v2/tickets/${params.ticketId}.json`, {
            ticket: { type: params.type },
          });
          if (!result.ok) return { success: false, error: `Update ticket type failed (${result.status}): ${result.error}` };
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
      {
        name: "create_ticket",
        description: "Create a new Zendesk support ticket",
        inputSchema: { subject: "string", description: "string", priority: "string?", type: "string?", requesterId: "string?", assigneeId: "string?", tags: "string[]?" },
        sideEffects: ["New ticket created in Zendesk"],
      },
      {
        name: "assign_ticket",
        description: "Assign a Zendesk ticket to an agent",
        inputSchema: { ticketId: "string", assigneeId: "string" },
        sideEffects: ["Ticket assignee changed in Zendesk"],
      },
      {
        name: "close_ticket",
        description: "Close a solved Zendesk ticket",
        inputSchema: { ticketId: "string" },
        sideEffects: ["Ticket closed in Zendesk"],
      },
      {
        name: "set_ticket_priority",
        description: "Set the priority of a Zendesk ticket",
        inputSchema: { ticketId: "string", priority: "string" },
        sideEffects: ["Ticket priority changed in Zendesk"],
      },
      {
        name: "add_tags",
        description: "Add tags to a Zendesk ticket",
        inputSchema: { ticketId: "string", tags: "string[]" },
        sideEffects: ["Tags added to ticket in Zendesk"],
      },
      {
        name: "remove_tags",
        description: "Remove tags from a Zendesk ticket",
        inputSchema: { ticketId: "string", tags: "string[]" },
        sideEffects: ["Tags removed from ticket in Zendesk"],
      },
      {
        name: "merge_tickets",
        description: "Merge source tickets into a target ticket",
        inputSchema: { targetTicketId: "string", sourceTicketIds: "string[]", targetComment: "string?", sourceComment: "string?" },
        sideEffects: ["Source tickets merged into target ticket in Zendesk"],
      },
      {
        name: "update_ticket_type",
        description: "Change the type of a Zendesk ticket",
        inputSchema: { ticketId: "string", type: "string" },
        sideEffects: ["Ticket type changed in Zendesk"],
      },
    ];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
