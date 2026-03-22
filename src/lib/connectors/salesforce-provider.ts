import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

// ── Helpers ──────────────────────────────────────────────

async function getValidToken(config: ConnectorConfig): Promise<string> {
  const expiry = new Date(config.token_expiry as string);

  if (expiry.getTime() > Date.now() + 5 * 60 * 1000) {
    return config.access_token as string;
  }

  const resp = await fetch("https://login.salesforce.com/services/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.SALESFORCE_CLIENT_ID!,
      client_secret: process.env.SALESFORCE_CLIENT_SECRET!,
      refresh_token: config.refresh_token as string,
    }),
  });

  if (!resp.ok) throw new Error(`Salesforce token refresh failed: ${resp.status}`);
  const data = await resp.json();

  config.access_token = data.access_token;
  config.token_expiry = new Date(Date.now() + 7200 * 1000).toISOString(); // Salesforce tokens last ~2h

  return data.access_token;
}

async function salesforceRequest(
  config: ConnectorConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const token = await getValidToken(config);
  const instanceUrl = config.instance_url as string;

  const resp = await fetch(`${instanceUrl}${path}`, {
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

  // Some Salesforce responses (204 No Content on PATCH) have no body
  if (resp.status === 204) {
    return { ok: true, status: 204 };
  }

  const data = await resp.json();
  return { ok: true, status: resp.status, data };
}

async function* soqlQuery(
  config: ConnectorConfig,
  query: string,
): AsyncGenerator<Record<string, any>> {
  const token = await getValidToken(config);
  const instanceUrl = config.instance_url as string;

  let url: string | null = `${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(query)}`;

  while (url) {
    const resp: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) break;
    const data: any = await resp.json();

    for (const record of data.records || []) {
      yield record;
    }

    url = data.nextRecordsUrl ? `${instanceUrl}${data.nextRecordsUrl}` : null;
  }
}

// ── Provider Implementation ──────────────────────────────

export const salesforceProvider: ConnectorProvider = {
  id: "salesforce",
  name: "Salesforce",

  configSchema: [
    { key: "oauth", label: "Salesforce Account", type: "oauth", required: true },
  ],

  writeCapabilities: [
    {
      slug: "update_opportunity",
      name: "Update Opportunity",
      description: "Updates an opportunity's stage, amount, or close date in Salesforce",
      inputSchema: { type: "object", properties: { opportunityId: { type: "string" }, fields: { type: "object" } }, required: ["opportunityId", "fields"] },
    },
    {
      slug: "create_task",
      name: "Create Task",
      description: "Creates a task in Salesforce",
      inputSchema: { type: "object", properties: { subject: { type: "string" }, status: { type: "string" }, priority: { type: "string" }, whoId: { type: "string" }, whatId: { type: "string" }, activityDate: { type: "string" }, description: { type: "string" } }, required: ["subject", "status", "priority"] },
    },
    {
      slug: "update_contact",
      name: "Update Contact",
      description: "Updates a contact's fields in Salesforce",
      inputSchema: { type: "object", properties: { contactId: { type: "string" }, fields: { type: "object" } }, required: ["contactId", "fields"] },
    },
    {
      slug: "log_activity",
      name: "Log Activity",
      description: "Logs a completed activity (call, email, meeting) in Salesforce",
      inputSchema: { type: "object", properties: { subject: { type: "string" }, description: { type: "string" }, type: { type: "string" }, whoId: { type: "string" }, whatId: { type: "string" } }, required: ["subject", "description", "type"] },
    },
    {
      slug: "create_contact",
      name: "Create Contact",
      description: "Creates a new contact in Salesforce",
      inputSchema: { type: "object", properties: { firstName: { type: "string" }, lastName: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, accountId: { type: "string" } }, required: ["firstName", "lastName"] },
    },
    {
      slug: "create_opportunity",
      name: "Create Opportunity",
      description: "Creates a new opportunity in Salesforce",
      inputSchema: { type: "object", properties: { name: { type: "string" }, stageName: { type: "string" }, closeDate: { type: "string" }, amount: { type: "number" }, accountId: { type: "string" } }, required: ["name", "stageName", "closeDate"] },
    },
    {
      slug: "create_case",
      name: "Create Case",
      description: "Creates a new support case in Salesforce",
      inputSchema: { type: "object", properties: { subject: { type: "string" }, description: { type: "string" }, contactId: { type: "string" }, accountId: { type: "string" }, priority: { type: "string" }, origin: { type: "string" } }, required: ["subject"] },
    },
    {
      slug: "close_case",
      name: "Close Case",
      description: "Closes an existing case in Salesforce",
      inputSchema: { type: "object", properties: { caseId: { type: "string" }, status: { type: "string" }, resolution: { type: "string" } }, required: ["caseId"] },
    },
    {
      slug: "complete_task",
      name: "Complete Task",
      description: "Marks a task as completed in Salesforce",
      inputSchema: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"] },
    },
    {
      slug: "send_email_via_salesforce",
      name: "Send Email via Salesforce",
      description: "Sends an email through Salesforce to a contact or lead",
      inputSchema: { type: "object", properties: { targetObjectId: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, isAiGenerated: { type: "boolean" } }, required: ["targetObjectId", "subject", "body"] },
    },
  ],

  async testConnection(config) {
    try {
      const result = await salesforceRequest(config, "GET", "/services/data/v59.0/limits");
      if (!result.ok) return { ok: false, error: `Salesforce API ${result.status}: ${result.error}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    const sinceFilter = since
      ? ` WHERE LastModifiedDate >= ${since.toISOString()}`
      : "";
    const sinceFilterAnd = since
      ? ` AND LastModifiedDate >= ${since.toISOString()}`
      : "";

    // ── Contacts ────────────────────────────────────────
    const contactQuery = `SELECT Id, FirstName, LastName, Email, Phone, AccountId, Title, Department, MailingCity, LastModifiedDate FROM Contact${sinceFilter}`;
    for await (const c of soqlQuery(config, contactQuery)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: c.Id,
            firstname: c.FirstName,
            lastname: c.LastName,
            email: c.Email,
            phone: c.Phone,
            jobtitle: c.Title,
            department: c.Department,
            city: c.MailingCity,
          },
        },
      };
    }

    // ── Accounts ────────────────────────────────────────
    const accountQuery = `SELECT Id, Name, Industry, Website, Phone, BillingCity, Type, LastModifiedDate FROM Account${sinceFilter}`;
    for await (const a of soqlQuery(config, accountQuery)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "contact.synced",
          payload: {
            id: a.Id,
            name: a.Name,
            industry: a.Industry,
            domain: a.Website,
            phone: a.Phone,
            city: a.BillingCity,
            isCompany: true,
          },
        },
      };
    }

    // ── Opportunities ───────────────────────────────────
    const oppQuery = `SELECT Id, Name, Amount, StageName, Probability, CloseDate, AccountId, OwnerId, IsClosed, IsWon, LastModifiedDate FROM Opportunity${sinceFilter}`;
    for await (const o of soqlQuery(config, oppQuery)) {
      let status = "open";
      if (o.IsClosed && o.IsWon) status = "won";
      else if (o.IsClosed) status = "lost";

      yield {
        kind: "event" as const,
        data: {
          eventType: "deal.synced",
          payload: {
            id: o.Id,
            dealname: o.Name,
            amount: o.Amount,
            dealstage: o.StageName,
            closedate: o.CloseDate,
            status,
            probability: o.Probability,
          },
        },
      };
    }

    // ── Cases ────────────────────────────────────────────
    const caseQuery = `SELECT Id, CaseNumber, Subject, Status, Priority, Origin, ContactId, AccountId, OwnerId, CreatedDate, LastModifiedDate FROM Case${sinceFilter}`;
    for await (const cs of soqlQuery(config, caseQuery)) {
      yield {
        kind: "event" as const,
        data: {
          eventType: "ticket.synced",
          payload: {
            id: cs.Id,
            number: cs.CaseNumber,
            subject: cs.Subject,
            status: cs.Status,
            priority: cs.Priority,
            channel: cs.Origin,
            created_date: cs.CreatedDate,
          },
        },
      };
    }

    // ── Tasks (last 30 days) ────────────────────────────
    const taskQuery = `SELECT Id, Subject, Status, Priority, WhoId, WhatId, ActivityDate, Description FROM Task WHERE ActivityDate >= LAST_N_DAYS:30${sinceFilterAnd}`;
    for await (const t of soqlQuery(config, taskQuery)) {
      yield {
        kind: "activity" as const,
        data: {
          signalType: "task",
          metadata: {
            subject: t.Subject,
            status: t.Status,
            priority: t.Priority,
            whoId: t.WhoId,
            whatId: t.WhatId,
            description: t.Description,
          },
          occurredAt: new Date(t.ActivityDate),
        },
      };
    }
  },

  async executeAction(config, action, params) {
    try {
      switch (action) {
        case "update_opportunity": {
          const result = await salesforceRequest(
            config, "PATCH",
            `/services/data/v59.0/sobjects/Opportunity/${params.opportunityId}`,
            params.fields,
          );
          if (!result.ok) return { success: false, error: `Update opportunity failed (${result.status}): ${result.error}` };
          return { success: true, result: { opportunityId: params.opportunityId } };
        }

        case "create_task": {
          const taskBody: Record<string, unknown> = {
            Subject: params.subject,
            Status: params.status,
            Priority: params.priority,
          };
          if (params.whoId) taskBody.WhoId = params.whoId;
          if (params.whatId) taskBody.WhatId = params.whatId;
          if (params.activityDate) taskBody.ActivityDate = params.activityDate;
          if (params.description) taskBody.Description = params.description;

          const result = await salesforceRequest(
            config, "POST",
            "/services/data/v59.0/sobjects/Task",
            taskBody,
          );
          if (!result.ok) return { success: false, error: `Create task failed (${result.status}): ${result.error}` };
          return { success: true, result: result.data };
        }

        case "update_contact": {
          const result = await salesforceRequest(
            config, "PATCH",
            `/services/data/v59.0/sobjects/Contact/${params.contactId}`,
            params.fields,
          );
          if (!result.ok) return { success: false, error: `Update contact failed (${result.status}): ${result.error}` };
          return { success: true, result: { contactId: params.contactId } };
        }

        case "log_activity": {
          const actBody: Record<string, unknown> = {
            Subject: params.subject,
            Description: params.description,
            Type: params.type,
            Status: "Completed",
          };
          if (params.whoId) actBody.WhoId = params.whoId;
          if (params.whatId) actBody.WhatId = params.whatId;

          const result = await salesforceRequest(
            config, "POST",
            "/services/data/v59.0/sobjects/Task",
            actBody,
          );
          if (!result.ok) return { success: false, error: `Log activity failed (${result.status}): ${result.error}` };
          return { success: true, result: result.data };
        }

        case "create_contact": {
          if (!params.firstName) return { success: false, error: "firstName is required" };
          if (!params.lastName) return { success: false, error: "lastName is required" };
          const contactBody: Record<string, unknown> = {
            FirstName: params.firstName,
            LastName: params.lastName,
          };
          if (params.email) contactBody.Email = params.email;
          if (params.phone) contactBody.Phone = params.phone;
          if (params.accountId) contactBody.AccountId = params.accountId;

          const result = await salesforceRequest(
            config, "POST",
            "/services/data/v59.0/sobjects/Contact",
            contactBody,
          );
          if (!result.ok) return { success: false, error: `Create contact failed (${result.status}): ${result.error}` };
          return { success: true, result: result.data };
        }

        case "create_opportunity": {
          if (!params.name) return { success: false, error: "name is required" };
          if (!params.stageName) return { success: false, error: "stageName is required" };
          if (!params.closeDate) return { success: false, error: "closeDate is required" };
          const oppBody: Record<string, unknown> = {
            Name: params.name,
            StageName: params.stageName,
            CloseDate: params.closeDate,
          };
          if (params.amount != null) oppBody.Amount = params.amount;
          if (params.accountId) oppBody.AccountId = params.accountId;

          const result = await salesforceRequest(
            config, "POST",
            "/services/data/v59.0/sobjects/Opportunity",
            oppBody,
          );
          if (!result.ok) return { success: false, error: `Create opportunity failed (${result.status}): ${result.error}` };
          return { success: true, result: result.data };
        }

        case "create_case": {
          if (!params.subject) return { success: false, error: "subject is required" };
          const caseBody: Record<string, unknown> = {
            Subject: params.subject,
          };
          if (params.description) caseBody.Description = params.description;
          if (params.contactId) caseBody.ContactId = params.contactId;
          if (params.accountId) caseBody.AccountId = params.accountId;
          if (params.priority) caseBody.Priority = params.priority;
          if (params.origin) caseBody.Origin = params.origin;

          const result = await salesforceRequest(
            config, "POST",
            "/services/data/v59.0/sobjects/Case",
            caseBody,
          );
          if (!result.ok) return { success: false, error: `Create case failed (${result.status}): ${result.error}` };
          return { success: true, result: result.data };
        }

        case "close_case": {
          if (!params.caseId) return { success: false, error: "caseId is required" };
          const closeBody: Record<string, unknown> = {
            Status: params.status || "Closed",
          };
          if (params.resolution) closeBody.Description = params.resolution;

          const result = await salesforceRequest(
            config, "PATCH",
            `/services/data/v59.0/sobjects/Case/${params.caseId}`,
            closeBody,
          );
          if (!result.ok) return { success: false, error: `Close case failed (${result.status}): ${result.error}` };
          return { success: true, result: { caseId: params.caseId } };
        }

        case "complete_task": {
          if (!params.taskId) return { success: false, error: "taskId is required" };
          const result = await salesforceRequest(
            config, "PATCH",
            `/services/data/v59.0/sobjects/Task/${params.taskId}`,
            { Status: "Completed" },
          );
          if (!result.ok) return { success: false, error: `Complete task failed (${result.status}): ${result.error}` };
          return { success: true, result: { taskId: params.taskId } };
        }

        case "send_email_via_salesforce": {
          if (!params.targetObjectId) return { success: false, error: "targetObjectId is required" };
          if (!params.subject) return { success: false, error: "subject is required" };
          if (!params.body) return { success: false, error: "body is required" };
          let emailBody = params.body as string;
          if (params.isAiGenerated) {
            const org = (params._operatorName as string) || "the organization";
            emailBody += `\n\n---\nThis message was drafted with AI assistance by ${org}'s operational AI (Qorpera).`;
          }

          const result = await salesforceRequest(
            config, "POST",
            "/services/data/v59.0/actions/standard/emailSimple",
            {
              inputs: [{
                emailSubject: params.subject,
                emailBody,
                targetObjectId: params.targetObjectId,
              }],
            },
          );
          if (!result.ok) return { success: false, error: `Send email failed (${result.status}): ${result.error}` };
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
        name: "update_opportunity",
        description: "Update a Salesforce opportunity's stage, amount, or close date",
        inputSchema: { opportunityId: "string", fields: "object" },
        sideEffects: ["Opportunity modified in Salesforce"],
      },
      {
        name: "create_task",
        description: "Create a task in Salesforce",
        inputSchema: { subject: "string", status: "string", priority: "string" },
        sideEffects: ["Task created in Salesforce"],
      },
      {
        name: "update_contact",
        description: "Update a Salesforce contact's fields",
        inputSchema: { contactId: "string", fields: "object" },
        sideEffects: ["Contact record modified in Salesforce"],
      },
      {
        name: "log_activity",
        description: "Log a completed activity in Salesforce",
        inputSchema: { subject: "string", description: "string", type: "string" },
        sideEffects: ["Activity logged in Salesforce"],
      },
      {
        name: "create_contact",
        description: "Create a new contact in Salesforce",
        inputSchema: { firstName: "string", lastName: "string", email: "string?", phone: "string?", accountId: "string?" },
        sideEffects: ["Contact created in Salesforce"],
      },
      {
        name: "create_opportunity",
        description: "Create a new opportunity in Salesforce",
        inputSchema: { name: "string", stageName: "string", closeDate: "string", amount: "number?", accountId: "string?" },
        sideEffects: ["Opportunity created in Salesforce"],
      },
      {
        name: "create_case",
        description: "Create a new support case in Salesforce",
        inputSchema: { subject: "string", description: "string?", contactId: "string?", accountId: "string?", priority: "string?", origin: "string?" },
        sideEffects: ["Case created in Salesforce"],
      },
      {
        name: "close_case",
        description: "Close an existing case in Salesforce",
        inputSchema: { caseId: "string", status: "string?", resolution: "string?" },
        sideEffects: ["Case closed in Salesforce"],
      },
      {
        name: "complete_task",
        description: "Mark a task as completed in Salesforce",
        inputSchema: { taskId: "string" },
        sideEffects: ["Task marked as completed in Salesforce"],
      },
      {
        name: "send_email_via_salesforce",
        description: "Send an email through Salesforce to a contact or lead",
        inputSchema: { targetObjectId: "string", subject: "string", body: "string", isAiGenerated: "boolean?" },
        sideEffects: ["Email sent via Salesforce"],
      },
    ];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
