import type {
  ConnectorProvider,
  ConnectorConfig,
  SyncEvent,
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

// ── Provider Implementation ──────────────────────────────

export const hubspotProvider: ConnectorProvider = {
  id: "hubspot",
  name: "HubSpot",

  configSchema: [
    { key: "oauth", label: "HubSpot Account", type: "oauth", required: true },
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
      yield {
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
      };
    }

    // ── Sync companies ───────────────────────────────────
    for await (const result of searchObjects(token, "companies", since)) {
      const p = result.properties;
      yield {
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
      };
    }

    // ── Sync deals ───────────────────────────────────────
    for await (const result of searchObjects(token, "deals", since)) {
      const p = result.properties;
      dealIds.push(result.id);
      yield {
        eventType: "deal.synced",
        payload: {
          id: result.id,
          dealname: p.dealname,
          amount: p.amount,
          dealstage: p.dealstage,
          pipeline: p.pipeline,
          closedate: p.closedate,
        },
      };
    }

    // ── Associations: contact → company ──────────────────
    for await (const assoc of batchAssociations(
      token, "contacts", "companies", contactIds
    )) {
      yield {
        eventType: "association.found",
        payload: {
          fromSourceSystem: "hubspot",
          fromExternalId: assoc.fromId,
          toSourceSystem: "hubspot",
          toExternalId: assoc.toId,
          relationshipType: "works-at",
        },
      };
    }

    // ── Associations: deal → company ─────────────────────
    for await (const assoc of batchAssociations(
      token, "deals", "companies", dealIds
    )) {
      yield {
        eventType: "association.found",
        payload: {
          fromSourceSystem: "hubspot",
          fromExternalId: assoc.fromId,
          toSourceSystem: "hubspot",
          toExternalId: assoc.toId,
          relationshipType: "deal-for",
        },
      };
    }

    // ── Associations: deal → contact ─────────────────────
    for await (const assoc of batchAssociations(
      token, "deals", "contacts", dealIds
    )) {
      yield {
        eventType: "association.found",
        payload: {
          fromSourceSystem: "hubspot",
          fromExternalId: assoc.fromId,
          toSourceSystem: "hubspot",
          toExternalId: assoc.toId,
          relationshipType: "deal-contact",
        },
      };
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
        yield {
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
        };
      }

      emailAfter = data.paging?.next?.after;
    } while (emailAfter);

    // ── Email → contact associations ─────────────────────
    for await (const assoc of batchAssociations(
      token, "emails", "contacts", emailIds
    )) {
      // Emit as additional context (not a KGE relationship)
      yield {
        eventType: "email.synced",
        payload: {
          id: assoc.fromId,
          contactId: assoc.toId,
        },
      };
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
      const fromId = result.from?.id;
      for (const to of result.to || []) {
        yield { fromId, toId: to.toObjectId };
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
