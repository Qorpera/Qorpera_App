import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

const INTERCOM_API = "https://api.intercom.com";

// ── Helpers ──────────────────────────────────────────────

function intercomRequest(
  config: ConnectorConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${INTERCOM_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.access_token as string}`,
      "Content-Type": "application/json",
      "Intercom-Version": "2.11",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── Provider Implementation ──────────────────────────────

export const intercomProvider: ConnectorProvider = {
  id: "intercom",
  name: "Intercom",

  configSchema: [
    { key: "oauth", label: "Intercom Account", type: "oauth", required: true },
  ],

  writeCapabilities: [
    {
      slug: "reply_to_conversation",
      name: "Reply to Conversation",
      description: "Replies to an Intercom conversation as the connected admin",
      inputSchema: { type: "object", properties: { conversationId: { type: "string" }, body: { type: "string" }, messageType: { type: "string", enum: ["comment", "note"] } }, required: ["conversationId", "body"] },
    },
    {
      slug: "add_note",
      name: "Add Note",
      description: "Adds an internal note to an Intercom conversation",
      inputSchema: { type: "object", properties: { conversationId: { type: "string" }, body: { type: "string" } }, required: ["conversationId", "body"] },
    },
    {
      slug: "tag_conversation",
      name: "Tag Conversation",
      description: "Tags an Intercom conversation",
      inputSchema: { type: "object", properties: { conversationId: { type: "string" }, tagName: { type: "string" } }, required: ["conversationId", "tagName"] },
    },
  ],

  async testConnection(config) {
    try {
      const resp = await intercomRequest(config, "GET", "/me");
      if (!resp.ok) return { ok: false, error: `Intercom API ${resp.status}: ${resp.statusText}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, _since?) {
    // ── Conversations ───────────────────────────────────
    let startingAfter: string | undefined;
    do {
      const params = new URLSearchParams({ per_page: "50" });
      if (startingAfter) params.set("starting_after", startingAfter);

      const resp = await intercomRequest(config, "GET", `/conversations?${params.toString()}`);
      if (!resp.ok) break;
      const data: any = await resp.json();

      for (const conv of data.conversations || []) {
        const subject = conv.source?.subject || conv.title || `Conversation ${conv.id}`;
        const channel = conv.source?.type || "unknown";
        const assigneeName = conv.assignee?.name || conv.assignee?.email;

        yield {
          kind: "event" as const,
          data: {
            eventType: "conversation.synced",
            payload: {
              id: conv.id,
              subject,
              status: conv.state || conv.open ? "open" : "closed",
              channel,
              assignee: assigneeName,
              message_count: conv.statistics?.count_conversation_parts,
              created_date: conv.created_at ? new Date(conv.created_at * 1000).toISOString() : undefined,
            },
          },
        };

        // Content for RAG from first message body
        const body = conv.source?.body || conv.conversation_message?.body;
        if (body) {
          yield {
            kind: "content" as const,
            data: {
              sourceType: "email" as const,
              sourceId: `intercom-conv-${conv.id}`,
              content: body.replace(/<[^>]+>/g, " ").trim(),
              metadata: {
                subject,
                channel,
                created_at: conv.created_at,
              },
            },
          };
        }
      }

      startingAfter = data.pages?.next?.starting_after;
    } while (startingAfter);

    // ── Contacts ────────────────────────────────────────
    let contactCursor: string | undefined;
    do {
      const params = new URLSearchParams({ per_page: "50" });
      if (contactCursor) params.set("starting_after", contactCursor);

      const resp = await intercomRequest(config, "GET", `/contacts?${params.toString()}`);
      if (!resp.ok) break;
      const data: any = await resp.json();

      for (const contact of data.data || []) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "contact.synced",
            payload: {
              id: contact.id,
              name: contact.name,
              email: contact.email,
              phone: contact.phone,
              role: contact.role,
            },
          },
        };
      }

      contactCursor = data.pages?.next?.starting_after;
    } while (contactCursor);

    // ── Companies ───────────────────────────────────────
    let companyCursor: string | undefined;
    do {
      const params = new URLSearchParams({ per_page: "50" });
      if (companyCursor) params.set("starting_after", companyCursor);

      const resp = await intercomRequest(config, "GET", `/companies?${params.toString()}`);
      if (!resp.ok) break;
      const data: any = await resp.json();

      for (const company of data.data || []) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "contact.synced",
            payload: {
              id: `company-${company.id}`,
              name: company.name,
              domain: company.website,
              industry: company.industry,
              isCompany: true,
            },
          },
        };
      }

      companyCursor = data.pages?.next?.starting_after;
    } while (companyCursor);
  },

  async executeAction(config, action, params) {
    try {
      const adminId = config.intercomAdminId as string;
      if (!adminId) {
        return { success: false, error: "Intercom admin ID not configured. Reconnect the integration." };
      }

      switch (action) {
        case "reply_to_conversation": {
          const messageType = (params.messageType as string) || "comment";
          const resp = await intercomRequest(config, "POST", `/conversations/${params.conversationId}/reply`, {
            type: "admin",
            admin_id: adminId,
            message_type: messageType,
            body: params.body,
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Reply failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          return { success: true, result: data };
        }

        case "add_note": {
          const resp = await intercomRequest(config, "POST", `/conversations/${params.conversationId}/reply`, {
            type: "admin",
            admin_id: adminId,
            message_type: "note",
            body: params.body,
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Add note failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          return { success: true, result: data };
        }

        case "tag_conversation": {
          // Ensure tag exists
          const tagResp = await intercomRequest(config, "POST", "/tags", {
            name: params.tagName,
          });
          if (!tagResp.ok) {
            const err = await tagResp.text();
            return { success: false, error: `Create tag failed (${tagResp.status}): ${err}` };
          }
          const tag = await tagResp.json();

          // Attach tag to conversation
          const attachResp = await intercomRequest(config, "POST", `/conversations/${params.conversationId}/tags`, {
            id: tag.id,
          });
          if (!attachResp.ok) {
            const err = await attachResp.text();
            return { success: false, error: `Tag conversation failed (${attachResp.status}): ${err}` };
          }
          return { success: true, result: { tagId: tag.id, tagName: params.tagName } };
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
        name: "reply_to_conversation",
        description: "Reply to an Intercom conversation",
        inputSchema: { conversationId: "string", body: "string", messageType: "string" },
        sideEffects: ["Message sent in Intercom conversation"],
      },
      {
        name: "add_note",
        description: "Add an internal note to an Intercom conversation",
        inputSchema: { conversationId: "string", body: "string" },
        sideEffects: ["Note added to conversation in Intercom"],
      },
      {
        name: "tag_conversation",
        description: "Tag a conversation in Intercom",
        inputSchema: { conversationId: "string", tagName: "string" },
        sideEffects: ["Tag applied to conversation in Intercom"],
      },
    ];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
