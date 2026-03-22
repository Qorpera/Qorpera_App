import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

const PIPEDRIVE_API = "https://api.pipedrive.com/v1";

// ── Helpers ──────────────────────────────────────────────

async function getValidToken(config: ConnectorConfig): Promise<string> {
  const expiry = new Date(config.token_expiry as string);

  if (expiry.getTime() > Date.now() + 5 * 60 * 1000) {
    return config.access_token as string;
  }

  const resp = await fetch("https://oauth.pipedrive.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.PIPEDRIVE_CLIENT_ID!,
      client_secret: process.env.PIPEDRIVE_CLIENT_SECRET!,
      refresh_token: config.refresh_token as string,
    }),
  });

  if (!resp.ok) throw new Error(`Pipedrive token refresh failed: ${resp.status}`);
  const data = await resp.json();

  config.access_token = data.access_token;
  config.refresh_token = data.refresh_token;
  config.token_expiry = new Date(Date.now() + data.expires_in * 1000).toISOString();

  return data.access_token;
}

async function pipedriveFetch(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${PIPEDRIVE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function* paginate(
  token: string,
  path: string,
): AsyncGenerator<Record<string, any>> {
  let start = 0;
  const limit = 100;

  while (true) {
    const sep = path.includes("?") ? "&" : "?";
    const resp = await pipedriveFetch(token, `${path}${sep}start=${start}&limit=${limit}`);
    if (!resp.ok) break;
    const data = await resp.json();
    if (!data.success || !data.data) break;

    for (const item of data.data) {
      yield item;
    }

    if (!data.additional_data?.pagination?.more_items_in_collection) break;
    start += limit;
  }
}

// ── Provider Implementation ──────────────────────────────

export const pipedriveProvider: ConnectorProvider = {
  id: "pipedrive",
  name: "Pipedrive",

  configSchema: [
    { key: "oauth", label: "Pipedrive Account", type: "oauth", required: true },
  ],

  writeCapabilities: [
    {
      slug: "update_deal_stage",
      name: "Update Deal Stage",
      description: "Updates a deal's stage in the Pipedrive pipeline",
      inputSchema: { type: "object", properties: { dealId: { type: "string" }, stageId: { type: "string" } }, required: ["dealId", "stageId"] },
    },
    {
      slug: "create_note",
      name: "Create Note",
      description: "Creates a note on a deal, person, or organization in Pipedrive",
      inputSchema: { type: "object", properties: { content: { type: "string" }, dealId: { type: "string" }, personId: { type: "string" }, orgId: { type: "string" } }, required: ["content"] },
    },
    {
      slug: "update_contact",
      name: "Update Contact",
      description: "Updates a person's fields in Pipedrive",
      inputSchema: { type: "object", properties: { personId: { type: "string" }, fields: { type: "object" } }, required: ["personId", "fields"] },
    },
    {
      slug: "create_deal",
      name: "Create Deal",
      description: "Creates a new deal in Pipedrive",
      inputSchema: { type: "object", properties: { title: { type: "string" }, personId: { type: "string" }, orgId: { type: "string" }, stageId: { type: "string" }, value: { type: "number" }, currency: { type: "string" } }, required: ["title"] },
    },
    {
      slug: "update_deal",
      name: "Update Deal",
      description: "Updates a deal's fields in Pipedrive",
      inputSchema: { type: "object", properties: { dealId: { type: "string" }, fields: { type: "object" } }, required: ["dealId", "fields"] },
    },
    {
      slug: "delete_deal",
      name: "Delete Deal",
      description: "Deletes a deal in Pipedrive",
      inputSchema: { type: "object", properties: { dealId: { type: "string" } }, required: ["dealId"] },
    },
    {
      slug: "create_activity",
      name: "Create Activity",
      description: "Creates a new activity in Pipedrive",
      inputSchema: { type: "object", properties: { subject: { type: "string" }, type: { type: "string" }, dueDate: { type: "string" }, duration: { type: "string" }, dealId: { type: "string" }, personId: { type: "string" }, orgId: { type: "string" }, note: { type: "string" } }, required: ["subject", "type"] },
    },
    {
      slug: "mark_activity_done",
      name: "Mark Activity Done",
      description: "Marks an activity as done in Pipedrive",
      inputSchema: { type: "object", properties: { activityId: { type: "string" } }, required: ["activityId"] },
    },
    {
      slug: "create_person",
      name: "Create Person",
      description: "Creates a new person (contact) in Pipedrive",
      inputSchema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, orgId: { type: "string" } }, required: ["name"] },
    },
    {
      slug: "create_organization",
      name: "Create Organization",
      description: "Creates a new organization in Pipedrive",
      inputSchema: { type: "object", properties: { name: { type: "string" }, address: { type: "string" } }, required: ["name"] },
    },
    {
      slug: "create_lead",
      name: "Create Lead",
      description: "Creates a new lead in Pipedrive",
      inputSchema: { type: "object", properties: { title: { type: "string" }, personId: { type: "string" }, orgId: { type: "string" }, value: { type: "number" }, currency: { type: "string" } }, required: ["title"] },
    },
  ],

  async testConnection(config) {
    try {
      const token = await getValidToken(config);
      const resp = await pipedriveFetch(token, "/users/me");
      if (!resp.ok) return { ok: false, error: `Pipedrive API ${resp.status}: ${resp.statusText}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    const token = await getValidToken(config);

    // ── Persons ─────────────────────────────────────────
    for await (const person of paginate(token, "/persons")) {
      const emails = person.email || [];
      const primaryEmail = Array.isArray(emails)
        ? emails.find((e: any) => e.primary)?.value || emails[0]?.value
        : undefined;
      const phones = person.phone || [];
      const primaryPhone = Array.isArray(phones)
        ? phones.find((p: any) => p.primary)?.value || phones[0]?.value
        : undefined;

      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: person.id,
            firstname: person.first_name,
            lastname: person.last_name,
            email: primaryEmail,
            phone: primaryPhone,
            company: person.org_name,
          },
        },
      };
    }

    // ── Organizations ───────────────────────────────────
    for await (const org of paginate(token, "/organizations")) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: `org-${org.id}`,
            name: org.name,
            address: org.address,
            isCompany: true,
          },
        },
      };
    }

    // ── Deals ───────────────────────────────────────────
    for await (const deal of paginate(token, "/deals")) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "deal.synced",
          payload: {
            id: deal.id,
            dealname: deal.title,
            amount: deal.value,
            currency: deal.currency,
            dealstage: deal.stage_id ? String(deal.stage_id) : undefined,
            pipeline: deal.pipeline_id ? String(deal.pipeline_id) : undefined,
            closedate: deal.expected_close_date,
            status: deal.status, // open, won, lost, deleted
            owner_name: deal.owner_name,
          },
        },
      };
    }

    // ── Activities (last 30 days) ────────────────────────
    const thirtyDaysAgo = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sinceStr = thirtyDaysAgo.toISOString().slice(0, 10);
    for await (const activity of paginate(token, `/activities?start_date=${sinceStr}`)) {
      yield {
        kind: "activity" as const,
        data: {
          signalType: activity.type || "task",
          metadata: {
            subject: activity.subject,
            done: activity.done,
            due_date: activity.due_date,
            deal_id: activity.deal_id,
            person_id: activity.person_id,
            org_id: activity.org_id,
            type: activity.type,
          },
          occurredAt: new Date(activity.due_date || activity.add_time),
        },
      };
    }

    // ── Notes (as content for RAG) ──────────────────────
    for await (const note of paginate(token, "/notes")) {
      if (!note.content) continue;
      yield {
        kind: "content" as const,
        data: {
          sourceType: "calendar_note" as const,
          sourceId: `pipedrive-note-${note.id}`,
          content: note.content,
          metadata: {
            deal_id: note.deal_id,
            person_id: note.person_id,
            org_id: note.org_id,
            created_at: note.add_time,
          },
        },
      };
    }
  },

  async executeAction(config, action, params) {
    try {
      const token = await getValidToken(config);

      switch (action) {
        case "update_deal_stage": {
          const resp = await pipedriveFetch(token, `/deals/${params.dealId}`, {
            method: "PUT",
            body: JSON.stringify({ stage_id: Number(params.stageId) }),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Update deal stage failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          return { success: true, result: data.data };
        }

        case "create_note": {
          const body: Record<string, unknown> = { content: params.content };
          if (params.dealId) body.deal_id = Number(params.dealId);
          if (params.personId) body.person_id = Number(params.personId);
          if (params.orgId) body.org_id = Number(params.orgId);

          const resp = await pipedriveFetch(token, "/notes", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create note failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          return { success: true, result: data.data };
        }

        case "update_contact": {
          const resp = await pipedriveFetch(token, `/persons/${params.personId}`, {
            method: "PUT",
            body: JSON.stringify(params.fields),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Update contact failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          return { success: true, result: data.data };
        }

        case "create_deal": {
          if (!params.title) return { success: false, error: "title is required" };
          const body: Record<string, unknown> = { title: params.title };
          if (params.personId) body.person_id = Number(params.personId);
          if (params.orgId) body.org_id = Number(params.orgId);
          if (params.stageId) body.stage_id = Number(params.stageId);
          if (params.value != null) body.value = Number(params.value);
          if (params.currency) body.currency = params.currency;

          const resp = await pipedriveFetch(token, "/deals", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create deal failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          if (!data.success) return { success: false, error: "Create deal failed: API returned success=false" };
          return { success: true, result: data.data };
        }

        case "update_deal": {
          if (!params.dealId) return { success: false, error: "dealId is required" };
          if (!params.fields) return { success: false, error: "fields is required" };
          const resp = await pipedriveFetch(token, `/deals/${params.dealId}`, {
            method: "PUT",
            body: JSON.stringify(params.fields),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Update deal failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          if (!data.success) return { success: false, error: "Update deal failed: API returned success=false" };
          return { success: true, result: data.data };
        }

        case "delete_deal": {
          if (!params.dealId) return { success: false, error: "dealId is required" };
          const resp = await pipedriveFetch(token, `/deals/${params.dealId}`, {
            method: "DELETE",
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Delete deal failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          if (!data.success) return { success: false, error: "Delete deal failed: API returned success=false" };
          return { success: true, result: data.data };
        }

        case "create_activity": {
          if (!params.subject) return { success: false, error: "subject is required" };
          if (!params.type) return { success: false, error: "type is required" };
          const body: Record<string, unknown> = {
            subject: params.subject,
            type: params.type,
          };
          if (params.dueDate) body.due_date = params.dueDate;
          if (params.duration) body.duration = params.duration;
          if (params.dealId) body.deal_id = Number(params.dealId);
          if (params.personId) body.person_id = Number(params.personId);
          if (params.orgId) body.org_id = Number(params.orgId);
          if (params.note) body.note = params.note;

          const resp = await pipedriveFetch(token, "/activities", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create activity failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          if (!data.success) return { success: false, error: "Create activity failed: API returned success=false" };
          return { success: true, result: data.data };
        }

        case "mark_activity_done": {
          if (!params.activityId) return { success: false, error: "activityId is required" };
          const resp = await pipedriveFetch(token, `/activities/${params.activityId}`, {
            method: "PUT",
            body: JSON.stringify({ done: 1 }),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Mark activity done failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          if (!data.success) return { success: false, error: "Mark activity done failed: API returned success=false" };
          return { success: true, result: data.data };
        }

        case "create_person": {
          if (!params.name) return { success: false, error: "name is required" };
          const body: Record<string, unknown> = { name: params.name };
          if (params.email) body.email = [{ value: params.email, primary: true }];
          if (params.phone) body.phone = [{ value: params.phone, primary: true }];
          if (params.orgId) body.org_id = Number(params.orgId);

          const resp = await pipedriveFetch(token, "/persons", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create person failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          if (!data.success) return { success: false, error: "Create person failed: API returned success=false" };
          return { success: true, result: data.data };
        }

        case "create_organization": {
          if (!params.name) return { success: false, error: "name is required" };
          const body: Record<string, unknown> = { name: params.name };
          if (params.address) body.address = params.address;

          const resp = await pipedriveFetch(token, "/organizations", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create organization failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          if (!data.success) return { success: false, error: "Create organization failed: API returned success=false" };
          return { success: true, result: data.data };
        }

        case "create_lead": {
          if (!params.title) return { success: false, error: "title is required" };
          const body: Record<string, unknown> = { title: params.title };
          if (params.personId) body.person_id = Number(params.personId);
          if (params.orgId) body.organization_id = Number(params.orgId);
          if (params.value != null || params.currency) {
            body.value = {
              amount: params.value != null ? Number(params.value) : 0,
              currency: params.currency || "USD",
            };
          }

          const resp = await pipedriveFetch(token, "/leads", {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Create lead failed (${resp.status}): ${err}` };
          }
          const data = await resp.json();
          if (!data.success) return { success: false, error: "Create lead failed: API returned success=false" };
          return { success: true, result: data.data };
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
        name: "update_deal_stage",
        description: "Update a deal's stage in Pipedrive",
        inputSchema: { dealId: "string", stageId: "string" },
        sideEffects: ["Deal stage changes in Pipedrive pipeline view"],
      },
      {
        name: "create_note",
        description: "Create a note on a deal, person, or organization",
        inputSchema: { content: "string", dealId: "string", personId: "string", orgId: "string" },
        sideEffects: ["Note appears on record in Pipedrive"],
      },
      {
        name: "update_contact",
        description: "Update a person's fields in Pipedrive",
        inputSchema: { personId: "string", fields: "object" },
        sideEffects: ["Person record modified in Pipedrive"],
      },
      {
        name: "create_deal",
        description: "Create a new deal in Pipedrive",
        inputSchema: { title: "string", personId: "string", orgId: "string", stageId: "string", value: "number", currency: "string" },
        sideEffects: ["New deal created in Pipedrive"],
      },
      {
        name: "update_deal",
        description: "Update a deal's fields in Pipedrive",
        inputSchema: { dealId: "string", fields: "object" },
        sideEffects: ["Deal record modified in Pipedrive"],
      },
      {
        name: "delete_deal",
        description: "Delete a deal in Pipedrive",
        inputSchema: { dealId: "string" },
        sideEffects: ["Deal permanently deleted from Pipedrive"],
      },
      {
        name: "create_activity",
        description: "Create a new activity in Pipedrive",
        inputSchema: { subject: "string", type: "string", dueDate: "string", duration: "string", dealId: "string", personId: "string", orgId: "string", note: "string" },
        sideEffects: ["New activity created in Pipedrive"],
      },
      {
        name: "mark_activity_done",
        description: "Mark an activity as done in Pipedrive",
        inputSchema: { activityId: "string" },
        sideEffects: ["Activity marked as completed in Pipedrive"],
      },
      {
        name: "create_person",
        description: "Create a new person (contact) in Pipedrive",
        inputSchema: { name: "string", email: "string", phone: "string", orgId: "string" },
        sideEffects: ["New person created in Pipedrive"],
      },
      {
        name: "create_organization",
        description: "Create a new organization in Pipedrive",
        inputSchema: { name: "string", address: "string" },
        sideEffects: ["New organization created in Pipedrive"],
      },
      {
        name: "create_lead",
        description: "Create a new lead in Pipedrive",
        inputSchema: { title: "string", personId: "string", orgId: "string", value: "number", currency: "string" },
        sideEffects: ["New lead created in Pipedrive"],
      },
    ];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
