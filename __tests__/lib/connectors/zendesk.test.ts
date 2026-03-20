import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

process.env.ZENDESK_CLIENT_ID = "zd-client-id";
process.env.ZENDESK_CLIENT_SECRET = "zd-client-secret";

import { zendeskProvider } from "@/lib/connectors/zendesk-provider";

beforeEach(() => {
  mockFetch.mockReset();
});

const validConfig = {
  access_token: "zd-token",
  refresh_token: "zd-refresh",
  subdomain: "testco",
  token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
};

// ── 1. OAuth flow ────────────────────────────────────────────────────────────

describe("Zendesk OAuth", () => {
  test("configSchema has subdomain + OAuth", () => {
    expect(zendeskProvider.configSchema.length).toBe(2);
    expect(zendeskProvider.configSchema[0].key).toBe("subdomain");
    expect(zendeskProvider.configSchema[1].type).toBe("oauth");
  });

  test("testConnection calls /api/v2/users/me.json with subdomain", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { id: 1, name: "Agent" } }),
    });

    const result = await zendeskProvider.testConnection(validConfig);
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://testco.zendesk.com/api/v2/users/me.json",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer zd-token" }),
      }),
    );
  });
});

// ── 2. Sync: tickets ────────────────────────────────────────────────────────

describe("Zendesk sync: tickets", () => {
  test("tickets yield ticket.synced events", async () => {
    mockFetch
      // tickets page
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tickets: [
            {
              id: 101,
              subject: "Cannot login",
              status: "open",
              priority: "high",
              via: { channel: "email" },
              description: "I cannot login to my account",
              created_at: "2026-03-19T10:00:00Z",
            },
          ],
          next_page: null,
        }),
      })
      // users (empty)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ users: [], next_page: null }) })
      // organizations (empty)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ organizations: [], next_page: null }) });

    const items = [];
    for await (const item of zendeskProvider.sync(validConfig)) {
      items.push(item);
    }

    const tickets = items.filter(i => i.kind === "event" && i.data.eventType === "ticket.synced");
    expect(tickets.length).toBe(1);
    expect(tickets[0].data.payload).toMatchObject({
      id: 101,
      subject: "Cannot login",
      status: "open",
      priority: "high",
      channel: "email",
    });

    // Content for RAG
    const content = items.filter(i => i.kind === "content");
    expect(content.length).toBe(1);
    expect(content[0].data.content).toContain("cannot login");
  });
});

// ── 3. Sync: users ──────────────────────────────────────────────────────────

describe("Zendesk sync: users", () => {
  test("end-users yield contact.synced", async () => {
    mockFetch
      // tickets (empty)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tickets: [], next_page: null }) })
      // users (end-users)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          users: [
            { id: 201, name: "Customer A", email: "a@customer.com", phone: "+1555" },
          ],
          next_page: null,
        }),
      })
      // organizations (empty)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ organizations: [], next_page: null }) });

    const items = [];
    for await (const item of zendeskProvider.sync(validConfig)) {
      items.push(item);
    }

    const contacts = items.filter(i => i.kind === "event" && i.data.eventType === "contact.synced");
    expect(contacts.length).toBe(1);
    expect(contacts[0].data.payload).toMatchObject({
      name: "Customer A",
      email: "a@customer.com",
    });
  });
});

// ── 4. Sync: organizations ──────────────────────────────────────────────────

describe("Zendesk sync: organizations", () => {
  test("organizations yield contact.synced with isCompany", async () => {
    mockFetch
      // tickets (empty)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tickets: [], next_page: null }) })
      // users (empty)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ users: [], next_page: null }) })
      // organizations
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          organizations: [
            { id: 301, name: "BigCorp", domain_names: ["bigcorp.com", "bigcorp.org"] },
          ],
          next_page: null,
        }),
      });

    const items = [];
    for await (const item of zendeskProvider.sync(validConfig)) {
      items.push(item);
    }

    const companies = items.filter(
      i => i.kind === "event" && i.data.eventType === "contact.synced" && (i.data.payload as any).isCompany,
    );
    expect(companies.length).toBe(1);
    expect(companies[0].data.payload).toMatchObject({
      name: "BigCorp",
      domain: "bigcorp.com",
      isCompany: true,
    });
  });
});

// ── 5. Write-back: reply_to_ticket ──────────────────────────────────────────

describe("Zendesk write-back", () => {
  test("reply_to_ticket sends public comment", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ticket: { id: 101 } }),
    });

    const result = await zendeskProvider.executeAction!(validConfig, "reply_to_ticket", {
      ticketId: "101",
      body: "We're looking into this.",
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://testco.zendesk.com/api/v2/tickets/101.json",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          ticket: { comment: { body: "We're looking into this.", public: true } },
        }),
      }),
    );
  });

  // ── 6. Write-back: update_ticket_status ─────────────────────────────────────

  test("update_ticket_status changes status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ticket: { id: 101, status: "solved" } }),
    });

    const result = await zendeskProvider.executeAction!(validConfig, "update_ticket_status", {
      ticketId: "101",
      status: "solved",
    });

    expect(result.success).toBe(true);
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.ticket.status).toBe("solved");
  });

  // ── 7. Write-back: add_internal_note ────────────────────────────────────────

  test("add_internal_note sends private comment", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ticket: { id: 101 } }),
    });

    const result = await zendeskProvider.executeAction!(validConfig, "add_internal_note", {
      ticketId: "101",
      body: "Customer escalated via phone",
    });

    expect(result.success).toBe(true);
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.ticket.comment.public).toBe(false);
    expect(callBody.ticket.comment.body).toBe("Customer escalated via phone");
  });

  // ── 8. Subdomain resolution ─────────────────────────────────────────────────

  test("all API calls use correct base URL from subdomain", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ticket: { id: 999 } }),
    });

    await zendeskProvider.executeAction!(validConfig, "reply_to_ticket", {
      ticketId: "999",
      body: "test",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("https://testco.zendesk.com/"),
      expect.anything(),
    );
  });
});
