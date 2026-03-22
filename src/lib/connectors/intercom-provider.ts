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
    {
      slug: "assign_conversation",
      name: "Assign Conversation",
      description: "Assigns an Intercom conversation to another admin or team",
      inputSchema: { type: "object", properties: { conversationId: { type: "string" }, assigneeId: { type: "string" }, assigneeType: { type: "string", enum: ["admin", "team"] } }, required: ["conversationId", "assigneeId"] },
    },
    {
      slug: "close_conversation",
      name: "Close Conversation",
      description: "Closes an Intercom conversation",
      inputSchema: { type: "object", properties: { conversationId: { type: "string" }, body: { type: "string" } }, required: ["conversationId"] },
    },
    {
      slug: "snooze_conversation",
      name: "Snooze Conversation",
      description: "Snoozes an Intercom conversation until a specified time",
      inputSchema: { type: "object", properties: { conversationId: { type: "string" }, snoozedUntil: { type: "string" } }, required: ["conversationId", "snoozedUntil"] },
    },
    {
      slug: "open_conversation",
      name: "Open Conversation",
      description: "Re-opens a closed or snoozed Intercom conversation",
      inputSchema: { type: "object", properties: { conversationId: { type: "string" } }, required: ["conversationId"] },
    },
    {
      slug: "create_contact",
      name: "Create Contact",
      description: "Creates a new contact in Intercom, or returns existing if email matches",
      inputSchema: { type: "object", properties: { email: { type: "string" }, name: { type: "string" }, role: { type: "string", enum: ["user", "lead"] } }, required: ["email"] },
    },
    {
      slug: "update_contact",
      name: "Update Contact",
      description: "Updates fields on an existing Intercom contact",
      inputSchema: { type: "object", properties: { contactId: { type: "string" }, fields: { type: "object" } }, required: ["contactId", "fields"] },
    },
    {
      slug: "create_note_on_contact",
      name: "Create Note on Contact",
      description: "Adds a note to an Intercom contact",
      inputSchema: { type: "object", properties: { contactId: { type: "string" }, body: { type: "string" } }, required: ["contactId", "body"] },
    },
    {
      slug: "tag_contact",
      name: "Tag Contact",
      description: "Tags an Intercom contact, creating the tag if it does not exist",
      inputSchema: { type: "object", properties: { contactId: { type: "string" }, tagName: { type: "string" } }, required: ["contactId", "tagName"] },
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

        case "assign_conversation": {
          if (!params.conversationId) return { success: false, error: "conversationId is required" };
          if (!params.assigneeId) return { success: false, error: "assigneeId is required" };
          const resp = await intercomRequest(config, "POST", `/conversations/${params.conversationId}/parts`, {
            message_type: "assignment",
            type: (params.assigneeType as string) || "admin",
            admin_id: adminId,
            assignee_id: params.assigneeId,
            body: "",
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Assign failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          return { success: true, result: data };
        }

        case "close_conversation": {
          if (!params.conversationId) return { success: false, error: "conversationId is required" };
          const resp = await intercomRequest(config, "POST", `/conversations/${params.conversationId}/parts`, {
            message_type: "close",
            type: "admin",
            admin_id: adminId,
            body: (params.body as string) || "",
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Close failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          return { success: true, result: data };
        }

        case "snooze_conversation": {
          if (!params.conversationId) return { success: false, error: "conversationId is required" };
          if (!params.snoozedUntil) return { success: false, error: "snoozedUntil is required" };
          const snoozedUntil = Math.floor(new Date(params.snoozedUntil as string).getTime() / 1000);
          const resp = await intercomRequest(config, "POST", `/conversations/${params.conversationId}/parts`, {
            message_type: "snoze",
            type: "admin",
            admin_id: adminId,
            snoozed_until: snoozedUntil,
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Snooze failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          return { success: true, result: data };
        }

        case "open_conversation": {
          if (!params.conversationId) return { success: false, error: "conversationId is required" };
          const resp = await intercomRequest(config, "POST", `/conversations/${params.conversationId}/parts`, {
            message_type: "open",
            type: "admin",
            admin_id: adminId,
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Open failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          return { success: true, result: data };
        }

        case "create_contact": {
          if (!params.email) return { success: false, error: "email is required" };
          // Check for existing contact by email
          const searchResp = await intercomRequest(config, "POST", "/contacts/search", {
            query: { field: "email", operator: "=", value: params.email },
          });
          if (searchResp.ok) {
            const searchData: any = await searchResp.json();
            if (searchData.data?.length > 0) {
              return { success: true, result: searchData.data[0] };
            }
          }
          // Create new contact
          const createBody: Record<string, unknown> = {
            email: params.email,
            role: (params.role as string) || "user",
          };
          if (params.name) createBody.name = params.name;
          const resp = await intercomRequest(config, "POST", "/contacts", createBody);
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create contact failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          return { success: true, result: data };
        }

        case "update_contact": {
          if (!params.contactId) return { success: false, error: "contactId is required" };
          if (!params.fields) return { success: false, error: "fields is required" };
          const fields = params.fields as Record<string, unknown> | undefined;
          if (!fields || typeof fields !== "object") {
            return { success: false, error: "fields must be an object" };
          }
          const allowed = ["name", "email", "phone", "custom_attributes"];
          const updateBody: Record<string, unknown> = {};
          for (const key of allowed) {
            if (key in fields) updateBody[key] = fields[key];
          }
          const resp = await intercomRequest(config, "PUT", `/contacts/${params.contactId}`, updateBody);
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Update contact failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          return { success: true, result: data };
        }

        case "create_note_on_contact": {
          if (!params.contactId) return { success: false, error: "contactId is required" };
          if (!params.body) return { success: false, error: "body is required" };
          const resp = await intercomRequest(config, "POST", `/contacts/${params.contactId}/notes`, {
            body: params.body,
            admin_id: adminId,
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create note failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          return { success: true, result: data };
        }

        case "tag_contact": {
          if (!params.contactId) return { success: false, error: "contactId is required" };
          if (!params.tagName) return { success: false, error: "tagName is required" };
          const resp = await intercomRequest(config, "POST", "/tags", {
            name: params.tagName,
            users: [{ id: params.contactId }],
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Tag contact failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          return { success: true, result: data };
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
      {
        name: "assign_conversation",
        description: "Assign an Intercom conversation to another admin or team",
        inputSchema: { conversationId: "string", assigneeId: "string", assigneeType: "string" },
        sideEffects: ["Conversation reassigned in Intercom"],
      },
      {
        name: "close_conversation",
        description: "Close an Intercom conversation",
        inputSchema: { conversationId: "string", body: "string" },
        sideEffects: ["Conversation closed in Intercom"],
      },
      {
        name: "snooze_conversation",
        description: "Snooze an Intercom conversation until a specified time",
        inputSchema: { conversationId: "string", snoozedUntil: "string" },
        sideEffects: ["Conversation snoozed in Intercom"],
      },
      {
        name: "open_conversation",
        description: "Re-open a closed or snoozed Intercom conversation",
        inputSchema: { conversationId: "string" },
        sideEffects: ["Conversation re-opened in Intercom"],
      },
      {
        name: "create_contact",
        description: "Create a new contact in Intercom or return existing if email matches",
        inputSchema: { email: "string", name: "string", role: "string" },
        sideEffects: ["Contact created in Intercom"],
      },
      {
        name: "update_contact",
        description: "Update fields on an existing Intercom contact",
        inputSchema: { contactId: "string", fields: "object" },
        sideEffects: ["Contact updated in Intercom"],
      },
      {
        name: "create_note_on_contact",
        description: "Add a note to an Intercom contact",
        inputSchema: { contactId: "string", body: "string" },
        sideEffects: ["Note added to contact in Intercom"],
      },
      {
        name: "tag_contact",
        description: "Tag an Intercom contact, creating the tag if needed",
        inputSchema: { contactId: "string", tagName: "string" },
        sideEffects: ["Tag applied to contact in Intercom"],
      },
    ];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
