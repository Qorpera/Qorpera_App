import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

process.env.PIPEDRIVE_CLIENT_ID = "test-client-id";
process.env.PIPEDRIVE_CLIENT_SECRET = "test-client-secret";

import { pipedriveProvider } from "@/lib/connectors/pipedrive-provider";

beforeEach(() => {
  mockFetch.mockReset();
});

const validConfig = {
  access_token: "pd-token",
  refresh_token: "pd-refresh",
  token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
};

// Helper to create paginated Pipedrive responses
function pipedriveResponse(data: any[], moreItems = false) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      data,
      additional_data: {
        pagination: { more_items_in_collection: moreItems },
      },
    }),
  };
}

// ── 1. OAuth flow ────────────────────────────────────────────────────────────

describe("Pipedrive OAuth", () => {
  test("configSchema is OAuth-only", () => {
    expect(pipedriveProvider.configSchema).toEqual([
      { key: "oauth", label: "Pipedrive Account", type: "oauth", required: true },
    ]);
  });

  test("testConnection calls /users/me", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 1 } }) });

    const result = await pipedriveProvider.testConnection(validConfig);
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.pipedrive.com/v1/users/me",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer pd-token" }),
      }),
    );
  });
});

// ── 2. Sync: persons ────────────────────────────────────────────────────────

describe("Pipedrive sync: persons", () => {
  test("persons yield contact.synced events with correct properties", async () => {
    mockFetch
      // persons page
      .mockResolvedValueOnce(pipedriveResponse([
        {
          id: 1,
          first_name: "John",
          last_name: "Doe",
          email: [{ value: "john@test.com", primary: true }],
          phone: [{ value: "+1234", primary: true }],
          org_name: "Acme",
        },
      ]))
      // organizations page (empty)
      .mockResolvedValueOnce(pipedriveResponse([]))
      // deals page (empty)
      .mockResolvedValueOnce(pipedriveResponse([]))
      // activities page (empty)
      .mockResolvedValueOnce(pipedriveResponse([]))
      // notes page (empty)
      .mockResolvedValueOnce(pipedriveResponse([]));

    const items = [];
    for await (const item of pipedriveProvider.sync(validConfig)) {
      items.push(item);
    }

    const contacts = items.filter(i => i.kind === "event" && i.data.eventType === "contact.synced");
    expect(contacts.length).toBe(1);
    expect(contacts[0].data.payload).toMatchObject({
      id: 1,
      firstname: "John",
      lastname: "Doe",
      email: "john@test.com",
      phone: "+1234",
    });
  });
});

// ── 3. Sync: deals ──────────────────────────────────────────────────────────

describe("Pipedrive sync: deals", () => {
  test("deals yield deal.synced events", async () => {
    mockFetch
      // persons (empty)
      .mockResolvedValueOnce(pipedriveResponse([]))
      // organizations (empty)
      .mockResolvedValueOnce(pipedriveResponse([]))
      // deals
      .mockResolvedValueOnce(pipedriveResponse([
        {
          id: 100,
          title: "Big Deal",
          value: 50000,
          currency: "USD",
          stage_id: 3,
          pipeline_id: 1,
          expected_close_date: "2026-04-01",
          status: "open",
        },
      ]))
      // activities (empty)
      .mockResolvedValueOnce(pipedriveResponse([]))
      // notes (empty)
      .mockResolvedValueOnce(pipedriveResponse([]));

    const items = [];
    for await (const item of pipedriveProvider.sync(validConfig)) {
      items.push(item);
    }

    const deals = items.filter(i => i.kind === "event" && i.data.eventType === "deal.synced");
    expect(deals.length).toBe(1);
    expect(deals[0].data.payload).toMatchObject({
      id: 100,
      dealname: "Big Deal",
      amount: 50000,
      status: "open",
    });
  });
});

// ── 4. Sync: activities ─────────────────────────────────────────────────────

describe("Pipedrive sync: activities", () => {
  test("activities yield activity signals", async () => {
    mockFetch
      // persons (empty)
      .mockResolvedValueOnce(pipedriveResponse([]))
      // organizations (empty)
      .mockResolvedValueOnce(pipedriveResponse([]))
      // deals (empty)
      .mockResolvedValueOnce(pipedriveResponse([]))
      // activities
      .mockResolvedValueOnce(pipedriveResponse([
        {
          id: 500,
          type: "call",
          subject: "Follow-up call",
          done: true,
          due_date: "2026-03-15",
          deal_id: 100,
          person_id: 1,
        },
      ]))
      // notes (empty)
      .mockResolvedValueOnce(pipedriveResponse([]));

    const items = [];
    for await (const item of pipedriveProvider.sync(validConfig)) {
      items.push(item);
    }

    const activities = items.filter(i => i.kind === "activity");
    expect(activities.length).toBe(1);
    expect(activities[0].data.signalType).toBe("call");
    expect(activities[0].data.metadata).toMatchObject({
      subject: "Follow-up call",
      done: true,
    });
  });
});

// ── 5. Sync: pagination ─────────────────────────────────────────────────────

describe("Pipedrive sync: pagination", () => {
  test("paginates through multiple pages", async () => {
    mockFetch
      // persons page 1 (has more)
      .mockResolvedValueOnce(pipedriveResponse(
        [{ id: 1, first_name: "A", last_name: "B", email: [], phone: [] }],
        true, // more items
      ))
      // persons page 2 (final)
      .mockResolvedValueOnce(pipedriveResponse(
        [{ id: 2, first_name: "C", last_name: "D", email: [], phone: [] }],
        false,
      ))
      // organizations (empty)
      .mockResolvedValueOnce(pipedriveResponse([]))
      // deals (empty)
      .mockResolvedValueOnce(pipedriveResponse([]))
      // activities (empty)
      .mockResolvedValueOnce(pipedriveResponse([]))
      // notes (empty)
      .mockResolvedValueOnce(pipedriveResponse([]));

    const items = [];
    for await (const item of pipedriveProvider.sync(validConfig)) {
      items.push(item);
    }

    const contacts = items.filter(i => i.kind === "event" && i.data.eventType === "contact.synced");
    expect(contacts.length).toBe(2);
  });
});

// ── 6-7. Write-back ─────────────────────────────────────────────────────────

describe("Pipedrive write-back", () => {
  test("update_deal_stage calls PUT with correct params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { id: 100, stage_id: 5 } }),
    });

    const result = await pipedriveProvider.executeAction!(validConfig, "update_deal_stage", {
      dealId: "100",
      stageId: "5",
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.pipedrive.com/v1/deals/100",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ stage_id: 5 }),
      }),
    );
  });

  test("create_note calls POST with correct body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { id: 999 } }),
    });

    const result = await pipedriveProvider.executeAction!(validConfig, "create_note", {
      content: "Meeting notes",
      dealId: "100",
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.pipedrive.com/v1/notes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ content: "Meeting notes", deal_id: 100 }),
      }),
    );
  });

  test("writeCapabilities are declared", () => {
    expect(pipedriveProvider.writeCapabilities).toBeDefined();
    expect(pipedriveProvider.writeCapabilities!.length).toBe(11);
    const slugs = pipedriveProvider.writeCapabilities!.map(c => c.slug);
    expect(slugs).toContain("update_deal_stage");
    expect(slugs).toContain("create_note");
    expect(slugs).toContain("update_contact");
  });
});
