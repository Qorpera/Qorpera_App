import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";
import { getValidHubSpotToken } from "./hubspot-auth";

const HUBSPOT_API = "https://api.hubapi.com";

// ── Helpers ──────────────────────────────────────────────

async function hubspotFetch(
  token: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${HUBSPOT_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

const OBJECT_PROPERTIES: Record<string, string[]> = {
  contacts: [
    "firstname", "lastname", "email", "phone", "jobtitle",
    "company", "lifecyclestage", "hs_lead_status",
    "lastmodifieddate", "createdate",
  ],
  companies: [
    "name", "domain", "industry", "annualrevenue",
    "numberofemployees", "city", "state", "country",
    "lastmodifieddate", "createdate",
  ],
  deals: [
    "dealname", "amount", "dealstage", "pipeline",
    "closedate", "hs_lastmodifieddate", "createdate",
  ],
};

async function associateObjects(
  token: string,
  fromType: string,
  fromId: string,
  toType: string,
  toIds: string[],
  typeId: number
): Promise<void> {
  for (const toId of toIds) {
    await hubspotFetch(
      token,
      `/crm/v4/objects/${fromType}/${fromId}/associations/${toType}/${toId}`,
      {
        method: "PUT",
        body: JSON.stringify([{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: typeId }]),
      }
    );
  }
}

// ── Provider Implementation ──────────────────────────────

export const hubspotProvider: ConnectorProvider = {
  id: "hubspot",
  name: "HubSpot",

  configSchema: [
    { key: "oauth", label: "HubSpot Account", type: "oauth", required: true },
  ],

  writeCapabilities: [
    {
      slug: "update_contact",
      name: "Update Contact",
      description: "Update properties on a HubSpot contact",
      inputSchema: { contactId: "string", properties: "object" },
    },
    {
      slug: "create_note",
      name: "Create Note",
      description: "Add a note to a HubSpot contact or company record",
      inputSchema: { objectType: "string", objectId: "string", body: "string" },
    },
    {
      slug: "update_deal_stage",
      name: "Update Deal Stage",
      description: "Change the pipeline stage of a HubSpot deal",
      inputSchema: { dealId: "string", stage: "string" },
    },
    {
      slug: "send_email",
      name: "Send Email",
      description: "Log or send an email through HubSpot",
      inputSchema: { to: "string", subject: "string", body: "string", contactId: "string" },
    },
    {
      slug: "create_contact",
      name: "Create Contact",
      description: "Create a new contact in HubSpot (checks for existing by email first)",
      inputSchema: { email: "string", firstName: "string?", lastName: "string?", properties: "object?" },
    },
    {
      slug: "create_deal",
      name: "Create Deal",
      description: "Create a new deal in HubSpot and optionally associate with contacts",
      inputSchema: { name: "string", stage: "string", amount: "string?", pipeline: "string?", associatedContactIds: "string[]?" },
    },
    {
      slug: "create_task",
      name: "Create Task",
      description: "Create a task in HubSpot and optionally associate with contacts or deals",
      inputSchema: { subject: "string", body: "string?", dueDate: "string?", ownerId: "string?", associatedContactIds: "string[]?", associatedDealIds: "string[]?" },
    },
    {
      slug: "complete_task",
      name: "Complete Task",
      description: "Mark a HubSpot task as completed",
      inputSchema: { taskId: "string" },
    },
    {
      slug: "log_activity",
      name: "Log Activity",
      description: "Log a call, email, meeting, or note activity in HubSpot",
      inputSchema: { type: "string", body: "string", associatedContactIds: "string[]?", associatedDealIds: "string[]?" },
    },
    {
      slug: "add_note",
      name: "Add Note",
      description: "Add a note to HubSpot and associate with contacts or deals",
      inputSchema: { body: "string", associatedContactIds: "string[]?", associatedDealIds: "string[]?" },
    },
    {
      slug: "create_ticket",
      name: "Create Ticket",
      description: "Create a support ticket in HubSpot",
      inputSchema: { subject: "string", description: "string?", priority: "string?", pipeline: "string?", stage: "string?" },
    },
  ],

  async testConnection(config) {
    try {
      const token = await getValidHubSpotToken(config);
      const resp = await hubspotFetch(
        token,
        "/crm/v3/objects/contacts?limit=1"
      );
      if (!resp.ok)
        return {
          ok: false,
          error: `HubSpot API ${resp.status}: ${resp.statusText}`,
        };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    const token = await getValidHubSpotToken(config);

    // Track IDs for association fetching
    const contactIds: string[] = [];
    const dealIds: string[] = [];

    // ── Sync contacts ────────────────────────────────────
    for await (const result of searchObjects(token, "contacts", since)) {
      const p = result.properties;
      contactIds.push(result.id);
      yield { kind: "event" as const, data: {
        eventType: "contact.synced",
        payload: {
          id: result.id,
          firstname: p.firstname,
          lastname: p.lastname,
          email: p.email,
          phone: p.phone,
          jobtitle: p.jobtitle,
          company: p.company,
          lifecyclestage: p.lifecyclestage,
          hs_lead_status: p.hs_lead_status,
        },
      } };
    }

    // ── Sync companies ───────────────────────────────────
    for await (const result of searchObjects(token, "companies", since)) {
      const p = result.properties;
      yield { kind: "event" as const, data: {
        eventType: "company.synced",
        payload: {
          id: result.id,
          name: p.name,
          domain: p.domain,
          industry: p.industry,
          revenue: p.annualrevenue,
          employees: p.numberofemployees,
          city: p.city,
          state: p.state,
          country: p.country,
        },
      } };
    }

    // ── Sync deals ───────────────────────────────────────
    for await (const result of searchObjects(token, "deals", since)) {
      const p = result.properties;
      dealIds.push(result.id);
      yield { kind: "event" as const, data: {
        eventType: "deal.synced",
        payload: {
          id: result.id,
          dealname: p.dealname,
          amount: p.amount,
          dealstage: p.dealstage,
          pipeline: p.pipeline,
          closedate: p.closedate,
        },
      } };
    }

    // ── Associations: contact → company ──────────────────
    for await (const assoc of batchAssociations(
      token, "contacts", "companies", contactIds
    )) {
      yield { kind: "event" as const, data: {
        eventType: "association.found",
        payload: {
          fromSourceSystem: "hubspot",
          fromExternalId: assoc.fromId,
          toSourceSystem: "hubspot",
          toExternalId: assoc.toId,
          relationshipType: "works-at",
        },
      } };
    }

    // ── Associations: deal → company ─────────────────────
    for await (const assoc of batchAssociations(
      token, "deals", "companies", dealIds
    )) {
      yield { kind: "event" as const, data: {
        eventType: "association.found",
        payload: {
          fromSourceSystem: "hubspot",
          fromExternalId: assoc.fromId,
          toSourceSystem: "hubspot",
          toExternalId: assoc.toId,
          relationshipType: "deal-for",
        },
      } };
    }

    // ── Associations: deal → contact ─────────────────────
    for await (const assoc of batchAssociations(
      token, "deals", "contacts", dealIds
    )) {
      yield { kind: "event" as const, data: {
        eventType: "association.found",
        payload: {
          fromSourceSystem: "hubspot",
          fromExternalId: assoc.fromId,
          toSourceSystem: "hubspot",
          toExternalId: assoc.toId,
          relationshipType: "deal-contact",
        },
      } };
    }

    // ── Engagement emails ────────────────────────────────
    const emailProperties = [
      "hs_email_subject", "hs_email_text", "hs_email_direction",
      "hs_email_status", "hs_timestamp",
      "hs_email_sender_email", "hs_email_to_email",
    ];
    const emailIds: string[] = [];

    let emailAfter: string | undefined;
    do {
      const params = new URLSearchParams({
        limit: "100",
        properties: emailProperties.join(","),
      });
      if (emailAfter) params.set("after", emailAfter);

      const resp = await hubspotFetch(
        token,
        `/crm/v3/objects/emails?${params.toString()}`
      );
      if (!resp.ok) break;
      const data = await resp.json();

      for (const result of data.results || []) {
        const p = result.properties;
        // Filter by timestamp for incremental sync
        if (since && p.hs_timestamp) {
          const ts = new Date(p.hs_timestamp).getTime();
          if (ts < since.getTime()) continue;
        }
        emailIds.push(result.id);
        yield { kind: "event" as const, data: {
          eventType: "email.synced",
          payload: {
            id: result.id,
            subject: p.hs_email_subject,
            direction: p.hs_email_direction,
            senderEmail: p.hs_email_sender_email,
            recipientEmail: p.hs_email_to_email,
            timestamp: p.hs_timestamp,
            status: p.hs_email_status,
          },
        } };
      }

      emailAfter = data.paging?.next?.after;
    } while (emailAfter);

    // ── Email → contact associations ─────────────────────
    for await (const assoc of batchAssociations(
      token, "emails", "contacts", emailIds
    )) {
      // Emit as additional context (not a KGE relationship)
      yield { kind: "event" as const, data: {
        eventType: "email.synced",
        payload: {
          id: assoc.fromId,
          contactId: assoc.toId,
        },
      } };
    }
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [
      {
        name: "update_contact",
        description: "Update properties on a HubSpot contact",
        inputSchema: { contactId: "string", properties: "object" },
        sideEffects: ["Contact record modified in HubSpot CRM"],
      },
      {
        name: "create_note",
        description: "Add a note to a HubSpot contact or company record",
        inputSchema: { objectType: "string", objectId: "string", body: "string" },
        sideEffects: ["Note appears on record timeline in HubSpot"],
      },
      {
        name: "update_deal_stage",
        description: "Change the pipeline stage of a HubSpot deal",
        inputSchema: { dealId: "string", stage: "string" },
        sideEffects: ["Deal stage changes in HubSpot pipeline view"],
      },
      {
        name: "send_email",
        description: "Log or send an email through HubSpot",
        inputSchema: { to: "string", subject: "string", body: "string", contactId: "string" },
        sideEffects: ["Email sent to recipient", "Email logged on contact timeline in HubSpot"],
      },
      {
        name: "create_contact",
        description: "Create a new contact in HubSpot (checks for existing by email first)",
        inputSchema: { email: "string", firstName: "string?", lastName: "string?", properties: "object?" },
        sideEffects: ["New contact record created in HubSpot CRM"],
      },
      {
        name: "create_deal",
        description: "Create a new deal in HubSpot and optionally associate with contacts",
        inputSchema: { name: "string", stage: "string", amount: "string?", pipeline: "string?", associatedContactIds: "string[]?" },
        sideEffects: ["New deal created in HubSpot pipeline", "Deal associated with contacts"],
      },
      {
        name: "create_task",
        description: "Create a task in HubSpot and optionally associate with contacts or deals",
        inputSchema: { subject: "string", body: "string?", dueDate: "string?", ownerId: "string?", associatedContactIds: "string[]?", associatedDealIds: "string[]?" },
        sideEffects: ["New task created in HubSpot", "Task associated with contacts/deals"],
      },
      {
        name: "complete_task",
        description: "Mark a HubSpot task as completed",
        inputSchema: { taskId: "string" },
        sideEffects: ["Task status changed to COMPLETED in HubSpot"],
      },
      {
        name: "log_activity",
        description: "Log a call, email, meeting, or note activity in HubSpot",
        inputSchema: { type: "string", body: "string", associatedContactIds: "string[]?", associatedDealIds: "string[]?" },
        sideEffects: ["Activity logged on timeline in HubSpot"],
      },
      {
        name: "add_note",
        description: "Add a note to HubSpot and associate with contacts or deals",
        inputSchema: { body: "string", associatedContactIds: "string[]?", associatedDealIds: "string[]?" },
        sideEffects: ["Note created and associated with records in HubSpot"],
      },
      {
        name: "create_ticket",
        description: "Create a support ticket in HubSpot",
        inputSchema: { subject: "string", description: "string?", priority: "string?", pipeline: "string?", stage: "string?" },
        sideEffects: ["New ticket created in HubSpot service pipeline"],
      },
    ];
  },

  async executeAction(config, action, params) {
    try {
      const token = await getValidHubSpotToken(config);

      switch (action) {
        case "update_contact": {
          const resp = await hubspotFetch(
            token,
            `/crm/v3/objects/contacts/${params.contactId}`,
            {
              method: "PATCH",
              body: JSON.stringify({ properties: params.properties }),
            }
          );
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Update contact failed (${resp.status}): ${err}` };
          }
          return { success: true, result: await resp.json() };
        }

        case "create_note": {
          // Create the note
          const noteResp = await hubspotFetch(token, "/crm/v3/objects/notes", {
            method: "POST",
            body: JSON.stringify({
              properties: {
                hs_note_body: params.body as string,
                hs_timestamp: Date.now().toString(),
              },
            }),
          });
          if (!noteResp.ok) {
            const err = await noteResp.text();
            return { success: false, error: `Create note failed (${noteResp.status}): ${err}` };
          }
          const note = await noteResp.json();

          // Associate the note with the object
          const assocTypeId = params.objectType === "companies" ? 190 : 202;
          const assocResp = await hubspotFetch(
            token,
            `/crm/v4/objects/notes/${note.id}/associations/${params.objectType}/${params.objectId}`,
            {
              method: "PUT",
              body: JSON.stringify([
                { associationCategory: "HUBSPOT_DEFINED", associationTypeId: assocTypeId },
              ]),
            }
          );
          if (!assocResp.ok) {
            const err = await assocResp.text();
            return { success: false, error: `Note association failed (${assocResp.status}): ${err}` };
          }
          return { success: true, result: note };
        }

        case "update_deal_stage": {
          const resp = await hubspotFetch(
            token,
            `/crm/v3/objects/deals/${params.dealId}`,
            {
              method: "PATCH",
              body: JSON.stringify({ properties: { dealstage: params.stage } }),
            }
          );
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Update deal failed (${resp.status}): ${err}` };
          }
          return { success: true, result: await resp.json() };
        }

        case "send_email": {
          const emailResp = await hubspotFetch(token, "/crm/v3/objects/emails", {
            method: "POST",
            body: JSON.stringify({
              properties: {
                hs_email_direction: "EMAIL",
                hs_email_subject: params.subject as string,
                hs_email_text: params.body as string,
                hs_email_to_email: params.to as string,
                hs_timestamp: Date.now().toString(),
              },
            }),
          });
          if (!emailResp.ok) {
            const err = await emailResp.text();
            return { success: false, error: `Send email failed (${emailResp.status}): ${err}` };
          }
          const email = await emailResp.json();

          // Associate with contact if provided
          if (params.contactId) {
            await hubspotFetch(
              token,
              `/crm/v4/objects/emails/${email.id}/associations/contacts/${params.contactId}`,
              {
                method: "PUT",
                body: JSON.stringify([
                  { associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 },
                ]),
              }
            );
          }
          return { success: true, result: email };
        }

        case "create_contact": {
          if (!params.email) {
            return { success: false, error: "Missing required field: email" };
          }

          // Check for existing contact by email
          const searchResp = await hubspotFetch(token, "/crm/v3/objects/contacts/search", {
            method: "POST",
            body: JSON.stringify({
              filterGroups: [{
                filters: [{
                  propertyName: "email",
                  operator: "EQ",
                  value: params.email as string,
                }],
              }],
            }),
          });
          if (searchResp.ok) {
            const searchData = await searchResp.json();
            if (searchData.total > 0) {
              return {
                success: false,
                error: `Contact with email ${params.email} already exists (ID: ${searchData.results[0].id})`,
              };
            }
          }

          const contactProps: Record<string, unknown> = {
            email: params.email,
            ...(params.firstName ? { firstname: params.firstName } : {}),
            ...(params.lastName ? { lastname: params.lastName } : {}),
            ...(params.properties && typeof params.properties === "object" ? params.properties as Record<string, unknown> : {}),
          };

          const createContactResp = await hubspotFetch(token, "/crm/v3/objects/contacts", {
            method: "POST",
            body: JSON.stringify({ properties: contactProps }),
          });
          if (!createContactResp.ok) {
            const err = await createContactResp.text();
            return { success: false, error: `Create contact failed (${createContactResp.status}): ${err}` };
          }
          return { success: true, result: await createContactResp.json() };
        }

        case "create_deal": {
          if (!params.name) {
            return { success: false, error: "Missing required field: name" };
          }
          if (!params.stage) {
            return { success: false, error: "Missing required field: stage" };
          }

          const dealProps: Record<string, unknown> = {
            dealname: params.name,
            dealstage: params.stage,
            ...(params.amount ? { amount: params.amount } : {}),
            ...(params.pipeline ? { pipeline: params.pipeline } : {}),
          };

          const createDealResp = await hubspotFetch(token, "/crm/v3/objects/deals", {
            method: "POST",
            body: JSON.stringify({ properties: dealProps }),
          });
          if (!createDealResp.ok) {
            const err = await createDealResp.text();
            return { success: false, error: `Create deal failed (${createDealResp.status}): ${err}` };
          }
          const deal = await createDealResp.json();

          // Associate with contacts
          const dealContactIds = params.associatedContactIds as string[] | undefined;
          if (dealContactIds?.length) {
            await associateObjects(token, "deals", deal.id, "contacts", dealContactIds, 3);
          }

          return { success: true, result: deal };
        }

        case "create_task": {
          if (!params.subject) {
            return { success: false, error: "Missing required field: subject" };
          }

          const taskProps: Record<string, unknown> = {
            hs_task_subject: params.subject,
            hs_task_status: "NOT_STARTED",
            hs_timestamp: Date.now().toString(),
            ...(params.body ? { hs_task_body: params.body } : {}),
            ...(params.dueDate ? { hs_task_due_date: params.dueDate } : {}),
            ...(params.ownerId ? { hubspot_owner_id: params.ownerId } : {}),
          };

          const createTaskResp = await hubspotFetch(token, "/crm/v3/objects/tasks", {
            method: "POST",
            body: JSON.stringify({ properties: taskProps }),
          });
          if (!createTaskResp.ok) {
            const err = await createTaskResp.text();
            return { success: false, error: `Create task failed (${createTaskResp.status}): ${err}` };
          }
          const task = await createTaskResp.json();

          // Associate with contacts
          const taskContactIds = params.associatedContactIds as string[] | undefined;
          if (taskContactIds?.length) {
            await associateObjects(token, "tasks", task.id, "contacts", taskContactIds, 204);
          }

          // Associate with deals
          const taskDealIds = params.associatedDealIds as string[] | undefined;
          if (taskDealIds?.length) {
            await associateObjects(token, "tasks", task.id, "deals", taskDealIds, 216);
          }

          return { success: true, result: task };
        }

        case "complete_task": {
          if (!params.taskId) {
            return { success: false, error: "Missing required field: taskId" };
          }

          const completeResp = await hubspotFetch(
            token,
            `/crm/v3/objects/tasks/${params.taskId}`,
            {
              method: "PATCH",
              body: JSON.stringify({ properties: { hs_task_status: "COMPLETED" } }),
            }
          );
          if (!completeResp.ok) {
            const err = await completeResp.text();
            return { success: false, error: `Complete task failed (${completeResp.status}): ${err}` };
          }
          return { success: true, result: await completeResp.json() };
        }

        case "log_activity": {
          if (!params.type) {
            return { success: false, error: "Missing required field: type" };
          }
          if (!params.body) {
            return { success: false, error: "Missing required field: body" };
          }

          const actType = params.type as string;
          const validTypes = ["call", "email", "meeting", "note"] as const;
          if (!validTypes.includes(actType as any)) {
            return { success: false, error: `Invalid activity type: ${actType}. Must be one of: call, email, meeting, note` };
          }

          const typeToEndpoint: Record<string, string> = {
            call: "calls",
            email: "emails",
            meeting: "meetings",
            note: "notes",
          };
          const typeToBodyProp: Record<string, string> = {
            call: "hs_call_body",
            email: "hs_email_text",
            meeting: "hs_meeting_body",
            note: "hs_note_body",
          };
          // Association type IDs: <type>_to_contact / <type>_to_deal
          const typeToContactAssoc: Record<string, number> = {
            call: 194,
            email: 198,
            meeting: 200,
            note: 202,
          };
          const typeToDealAssoc: Record<string, number> = {
            call: 206,
            email: 210,
            meeting: 212,
            note: 214,
          };

          const endpoint = typeToEndpoint[actType];
          const bodyProp = typeToBodyProp[actType];

          const activityResp = await hubspotFetch(token, `/crm/v3/objects/${endpoint}`, {
            method: "POST",
            body: JSON.stringify({
              properties: {
                [bodyProp]: params.body as string,
                hs_timestamp: Date.now().toString(),
              },
            }),
          });
          if (!activityResp.ok) {
            const err = await activityResp.text();
            return { success: false, error: `Log ${actType} failed (${activityResp.status}): ${err}` };
          }
          const activity = await activityResp.json();

          // Associate with contacts
          const actContactIds = params.associatedContactIds as string[] | undefined;
          if (actContactIds?.length) {
            await associateObjects(token, endpoint, activity.id, "contacts", actContactIds, typeToContactAssoc[actType]);
          }

          // Associate with deals
          const actDealIds = params.associatedDealIds as string[] | undefined;
          if (actDealIds?.length) {
            await associateObjects(token, endpoint, activity.id, "deals", actDealIds, typeToDealAssoc[actType]);
          }

          return { success: true, result: activity };
        }

        case "add_note": {
          if (!params.body) {
            return { success: false, error: "Missing required field: body" };
          }

          const addNoteResp = await hubspotFetch(token, "/crm/v3/objects/notes", {
            method: "POST",
            body: JSON.stringify({
              properties: {
                hs_note_body: params.body as string,
                hs_timestamp: Date.now().toString(),
              },
            }),
          });
          if (!addNoteResp.ok) {
            const err = await addNoteResp.text();
            return { success: false, error: `Add note failed (${addNoteResp.status}): ${err}` };
          }
          const addedNote = await addNoteResp.json();

          // Associate with contacts
          const noteContactIds = params.associatedContactIds as string[] | undefined;
          if (noteContactIds?.length) {
            await associateObjects(token, "notes", addedNote.id, "contacts", noteContactIds, 202);
          }

          // Associate with deals
          const noteDealIds = params.associatedDealIds as string[] | undefined;
          if (noteDealIds?.length) {
            await associateObjects(token, "notes", addedNote.id, "deals", noteDealIds, 214);
          }

          return { success: true, result: addedNote };
        }

        case "create_ticket": {
          if (!params.subject) {
            return { success: false, error: "Missing required field: subject" };
          }

          const ticketProps: Record<string, unknown> = {
            subject: params.subject,
            ...(params.description ? { hs_ticket_description: params.description } : {}),
            ...(params.priority ? { hs_ticket_priority: params.priority } : {}),
            ...(params.pipeline ? { hs_pipeline: params.pipeline } : {}),
            ...(params.stage ? { hs_pipeline_stage: params.stage } : {}),
          };

          const createTicketResp = await hubspotFetch(token, "/crm/v3/objects/tickets", {
            method: "POST",
            body: JSON.stringify({ properties: ticketProps }),
          });
          if (!createTicketResp.ok) {
            const err = await createTicketResp.text();
            return { success: false, error: `Create ticket failed (${createTicketResp.status}): ${err}` };
          }
          return { success: true, result: await createTicketResp.json() };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  async inferSchema(config): Promise<InferredSchema[]> {
    const token = await getValidHubSpotToken(config);
    const schemas: InferredSchema[] = [];

    for (const objectType of ["contacts", "companies", "deals"]) {
      // Fetch property definitions
      const propsResp = await hubspotFetch(
        token,
        `/crm/v3/properties/${objectType}`
      );
      if (!propsResp.ok) continue;
      const propsData = await propsResp.json();

      const suggestedProperties = (propsData.results || [])
        .filter((p: any) => !p.hidden)
        .map((p: any) => {
          const dataType = mapHubSpotType(p.type);
          const possibleRole = detectRole(p.name);
          return {
            name: p.name,
            dataType,
            ...(possibleRole ? { possibleRole } : {}),
            sampleValues: [] as string[],
          };
        });

      // Fetch sample records
      const sampleResp = await hubspotFetch(
        token,
        `/crm/v3/objects/${objectType}?limit=5`
      );
      let sampleEntities: Record<string, string>[] = [];
      let recordCount = 0;
      if (sampleResp.ok) {
        const sampleData = await sampleResp.json();
        recordCount = sampleData.total || sampleData.results?.length || 0;
        sampleEntities = (sampleData.results || []).map((r: any) => {
          const obj: Record<string, string> = {};
          for (const [k, v] of Object.entries(r.properties || {})) {
            obj[k] = String(v ?? "");
          }
          return obj;
        });

        // Fill sample values from sample entities
        for (const prop of suggestedProperties) {
          prop.sampleValues = sampleEntities
            .map((e) => e[prop.name])
            .filter((v) => v && v !== "")
            .slice(0, 5);
        }
      }

      // Capitalize object type for suggested name
      const suggestedTypeName =
        objectType.charAt(0).toUpperCase() + objectType.slice(1, -1);

      schemas.push({
        suggestedTypeName,
        suggestedProperties,
        sampleEntities,
        recordCount,
      });
    }

    return schemas;
  },
};

// ── Search with pagination ───────────────────────────────

async function* searchObjects(
  token: string,
  objectType: string,
  since?: Date
): AsyncGenerator<{ id: string; properties: Record<string, any> }> {
  let after: string | undefined;
  const properties = OBJECT_PROPERTIES[objectType] || [];

  do {
    const body: any = {
      properties,
      limit: 100,
    };

    if (since) {
      body.filterGroups = [
        {
          filters: [
            {
              propertyName: "lastmodifieddate",
              operator: "GTE",
              value: since.getTime().toString(),
            },
          ],
        },
      ];
    }

    if (after) {
      body.after = after;
    }

    const resp = await hubspotFetch(
      token,
      `/crm/v3/objects/${objectType}/search`,
      { method: "POST", body: JSON.stringify(body) }
    );

    if (!resp.ok) {
      console.error(
        `[hubspot] Search ${objectType} failed: ${resp.status}`
      );
      break;
    }

    const data = await resp.json();

    for (const result of data.results || []) {
      yield { id: result.id, properties: result.properties || {} };
    }

    after = data.paging?.next?.after;
  } while (after);
}

// ── Batch association fetching ───────────────────────────

async function* batchAssociations(
  token: string,
  fromType: string,
  toType: string,
  ids: string[]
): AsyncGenerator<{ fromId: string; toId: string }> {
  // Process in batches of 100
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const resp = await hubspotFetch(
      token,
      `/crm/v4/associations/${fromType}/${toType}/batch/read`,
      {
        method: "POST",
        body: JSON.stringify({
          inputs: batch.map((id) => ({ id })),
        }),
      }
    );

    if (!resp.ok) {
      console.error(
        `[hubspot] Batch associations ${fromType}→${toType} failed: ${resp.status}`
      );
      continue;
    }

    const data = await resp.json();
    for (const result of data.results || []) {
      const fromId = String(result.from?.id);
      for (const to of result.to || []) {
        yield { fromId, toId: String(to.toObjectId) };
      }
    }
  }
}

// ── Type mapping helpers ─────────────────────────────────

function mapHubSpotType(hsType: string): string {
  switch (hsType) {
    case "string":
      return "STRING";
    case "number":
      return "NUMBER";
    case "date":
    case "datetime":
      return "DATE";
    case "bool":
      return "BOOLEAN";
    case "enumeration":
      return "ENUM";
    default:
      return "STRING";
  }
}

function detectRole(propertyName: string): string | undefined {
  if (propertyName === "email") return "email";
  if (propertyName === "domain") return "domain";
  if (propertyName === "phone") return "phone";
  return undefined;
}
