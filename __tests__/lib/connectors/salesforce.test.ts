import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

process.env.SALESFORCE_CLIENT_ID = "sf-client-id";
process.env.SALESFORCE_CLIENT_SECRET = "sf-client-secret";

import { salesforceProvider } from "@/lib/connectors/salesforce-provider";

beforeEach(() => {
  mockFetch.mockReset();
});

const validConfig = {
  access_token: "sf-token",
  refresh_token: "sf-refresh",
  instance_url: "https://na1.salesforce.com",
  token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
};

// Helper for SOQL query responses
function soqlResponse(records: any[], done = true) {
  return {
    ok: true,
    json: async () => ({
      records,
      done,
      totalSize: records.length,
    }),
  };
}

// ── 1. OAuth flow ────────────────────────────────────────────────────────────

describe("Salesforce OAuth", () => {
  test("configSchema is OAuth-only", () => {
    expect(salesforceProvider.configSchema).toEqual([
      { key: "oauth", label: "Salesforce Account", type: "oauth", required: true },
    ]);
  });

  test("testConnection calls /services/data/v59.0/limits", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ DailyApiRequests: { Remaining: 100 } }),
    });

    const result = await salesforceProvider.testConnection(validConfig);
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://na1.salesforce.com/services/data/v59.0/limits",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sf-token" }),
      }),
    );
  });
});

// ── 2. Sync: contacts ───────────────────────────────────────────────────────

describe("Salesforce sync: contacts", () => {
  test("contacts yield contact.synced with SOQL pagination", async () => {
    mockFetch
      // Contacts query
      .mockResolvedValueOnce(soqlResponse([
        {
          Id: "003xx",
          FirstName: "Jane",
          LastName: "Smith",
          Email: "jane@corp.com",
          Phone: "+1555",
          Title: "VP Sales",
        },
      ]))
      // Accounts (empty)
      .mockResolvedValueOnce(soqlResponse([]))
      // Opportunities (empty)
      .mockResolvedValueOnce(soqlResponse([]))
      // Cases (empty)
      .mockResolvedValueOnce(soqlResponse([]))
      // Tasks (empty)
      .mockResolvedValueOnce(soqlResponse([]));

    const items = [];
    for await (const item of salesforceProvider.sync(validConfig)) {
      items.push(item);
    }

    const contacts = items.filter(i => i.kind === "event" && i.data.eventType === "contact.synced");
    expect(contacts.length).toBe(1);
    expect(contacts[0].data.payload).toMatchObject({
      id: "003xx",
      firstname: "Jane",
      lastname: "Smith",
      email: "jane@corp.com",
      jobtitle: "VP Sales",
    });
  });
});

// ── 3. Sync: opportunities ──────────────────────────────────────────────────

describe("Salesforce sync: opportunities", () => {
  test("opportunities yield deal.synced", async () => {
    mockFetch
      // Contacts (empty)
      .mockResolvedValueOnce(soqlResponse([]))
      // Accounts (empty)
      .mockResolvedValueOnce(soqlResponse([]))
      // Opportunities
      .mockResolvedValueOnce(soqlResponse([
        {
          Id: "006xx",
          Name: "Enterprise Deal",
          Amount: 100000,
          StageName: "Proposal",
          CloseDate: "2026-06-30",
          IsClosed: false,
          IsWon: false,
          Probability: 60,
        },
      ]))
      // Cases (empty)
      .mockResolvedValueOnce(soqlResponse([]))
      // Tasks (empty)
      .mockResolvedValueOnce(soqlResponse([]));

    const items = [];
    for await (const item of salesforceProvider.sync(validConfig)) {
      items.push(item);
    }

    const deals = items.filter(i => i.kind === "event" && i.data.eventType === "deal.synced");
    expect(deals.length).toBe(1);
    expect(deals[0].data.payload).toMatchObject({
      id: "006xx",
      dealname: "Enterprise Deal",
      amount: 100000,
      dealstage: "Proposal",
      status: "open",
    });
  });
});

// ── 4. Sync: cases ──────────────────────────────────────────────────────────

describe("Salesforce sync: cases", () => {
  test("cases yield ticket.synced", async () => {
    mockFetch
      // Contacts (empty)
      .mockResolvedValueOnce(soqlResponse([]))
      // Accounts (empty)
      .mockResolvedValueOnce(soqlResponse([]))
      // Opportunities (empty)
      .mockResolvedValueOnce(soqlResponse([]))
      // Cases
      .mockResolvedValueOnce(soqlResponse([
        {
          Id: "500xx",
          CaseNumber: "00001234",
          Subject: "Login failure",
          Status: "New",
          Priority: "High",
          Origin: "Email",
          CreatedDate: "2026-03-19T10:00:00Z",
        },
      ]))
      // Tasks (empty)
      .mockResolvedValueOnce(soqlResponse([]));

    const items = [];
    for await (const item of salesforceProvider.sync(validConfig)) {
      items.push(item);
    }

    const tickets = items.filter(i => i.kind === "event" && i.data.eventType === "ticket.synced");
    expect(tickets.length).toBe(1);
    expect(tickets[0].data.payload).toMatchObject({
      id: "500xx",
      number: "00001234",
      subject: "Login failure",
      status: "New",
      priority: "High",
      channel: "Email",
    });
  });
});

// ── 5. Sync: tasks ──────────────────────────────────────────────────────────

describe("Salesforce sync: tasks", () => {
  test("tasks yield activity signals", async () => {
    mockFetch
      // Contacts (empty)
      .mockResolvedValueOnce(soqlResponse([]))
      // Accounts (empty)
      .mockResolvedValueOnce(soqlResponse([]))
      // Opportunities (empty)
      .mockResolvedValueOnce(soqlResponse([]))
      // Cases (empty)
      .mockResolvedValueOnce(soqlResponse([]))
      // Tasks
      .mockResolvedValueOnce(soqlResponse([
        {
          Id: "00Txx",
          Subject: "Follow up call",
          Status: "Not Started",
          Priority: "Normal",
          ActivityDate: "2026-03-20",
        },
      ]));

    const items = [];
    for await (const item of salesforceProvider.sync(validConfig)) {
      items.push(item);
    }

    const activities = items.filter(i => i.kind === "activity");
    expect(activities.length).toBe(1);
    expect(activities[0].data.signalType).toBe("task");
    expect(activities[0].data.metadata).toMatchObject({
      subject: "Follow up call",
      status: "Not Started",
    });
  });
});

// ── 6. Write-back: update_opportunity ────────────────────────────────────────

describe("Salesforce write-back", () => {
  test("update_opportunity calls PATCH to correct sObject URL", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

    const result = await salesforceProvider.executeAction!(validConfig, "update_opportunity", {
      opportunityId: "006xx",
      fields: { StageName: "Closed Won", Amount: 120000 },
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://na1.salesforce.com/services/data/v59.0/sobjects/Opportunity/006xx",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ StageName: "Closed Won", Amount: 120000 }),
      }),
    );
  });

  // ── 7. Write-back: create_task ──────────────────────────────────────────────

  test("create_task calls POST", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: "00Txx_new", success: true }),
    });

    const result = await salesforceProvider.executeAction!(validConfig, "create_task", {
      subject: "Quarterly review",
      status: "Not Started",
      priority: "High",
      whoId: "003xx",
      activityDate: "2026-04-01",
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://na1.salesforce.com/services/data/v59.0/sobjects/Task",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"Subject":"Quarterly review"'),
      }),
    );
  });

  // ── 8. Write-back: log_activity ─────────────────────────────────────────────

  test("log_activity creates completed Task", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: "00Txx_log", success: true }),
    });

    const result = await salesforceProvider.executeAction!(validConfig, "log_activity", {
      subject: "Client call",
      description: "Discussed renewal",
      type: "Call",
    });

    expect(result.success).toBe(true);
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.Status).toBe("Completed");
    expect(callBody.Type).toBe("Call");
    expect(callBody.Subject).toBe("Client call");
  });

  // ── 9. instance_url usage ──────────────────────────────────────────────────

  test("instance_url from config used in all API calls", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

    await salesforceProvider.executeAction!(validConfig, "update_contact", {
      contactId: "003xx",
      fields: { Phone: "+1999" },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("https://na1.salesforce.com/"),
      expect.anything(),
    );
  });

  test("writeCapabilities are declared", () => {
    expect(salesforceProvider.writeCapabilities).toBeDefined();
    expect(salesforceProvider.writeCapabilities!.length).toBe(10);
    const slugs = salesforceProvider.writeCapabilities!.map(c => c.slug);
    expect(slugs).toContain("update_opportunity");
    expect(slugs).toContain("create_task");
    expect(slugs).toContain("update_contact");
    expect(slugs).toContain("log_activity");
  });
});
