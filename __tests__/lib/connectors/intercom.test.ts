import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

process.env.INTERCOM_CLIENT_ID = "test-intercom-id";
process.env.INTERCOM_CLIENT_SECRET = "test-intercom-secret";

import { intercomProvider } from "@/lib/connectors/intercom-provider";

beforeEach(() => {
  mockFetch.mockReset();
});

const validConfig = {
  access_token: "ic-token",
  intercomAdminId: "admin-123",
};

// ── 1. OAuth flow ────────────────────────────────────────────────────────────

describe("Intercom OAuth", () => {
  test("configSchema is OAuth-only", () => {
    expect(intercomProvider.configSchema).toEqual([
      { key: "oauth", label: "Intercom Account", type: "oauth", required: true },
    ]);
  });

  test("testConnection calls /me with Intercom-Version header", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ type: "admin" }) });

    const result = await intercomProvider.testConnection(validConfig);
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.intercom.com/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer ic-token",
          "Intercom-Version": "2.11",
        }),
      }),
    );
  });
});

// ── 2. Sync: conversations ──────────────────────────────────────────────────

describe("Intercom sync: conversations", () => {
  test("conversations yield conversation.synced with correct properties", async () => {
    mockFetch
      // conversations page
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          conversations: [
            {
              id: "conv-1",
              source: { subject: "Help needed", type: "email", body: "<p>I need help</p>" },
              state: "open",
              assignee: { name: "Agent Smith" },
              statistics: { count_conversation_parts: 5 },
              created_at: 1710000000,
            },
          ],
          pages: {},
        }),
      })
      // contacts (empty)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [], pages: {} }) })
      // companies (empty)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [], pages: {} }) });

    const items = [];
    for await (const item of intercomProvider.sync(validConfig)) {
      items.push(item);
    }

    const conversations = items.filter(i => i.kind === "event" && i.data.eventType === "conversation.synced");
    expect(conversations.length).toBe(1);
    expect(conversations[0].data.payload).toMatchObject({
      id: "conv-1",
      subject: "Help needed",
      status: "open",
      channel: "email",
      assignee: "Agent Smith",
      message_count: 5,
    });

    // Content for RAG
    const content = items.filter(i => i.kind === "content");
    expect(content.length).toBe(1);
    expect(content[0].data.content).toContain("I need help");
  });
});

// ── 3. Sync: contacts ───────────────────────────────────────────────────────

describe("Intercom sync: contacts", () => {
  test("contacts yield contact.synced", async () => {
    mockFetch
      // conversations (empty)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ conversations: [], pages: {} }) })
      // contacts
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: "c-1", name: "Jane Doe", email: "jane@test.com", phone: "+1555", role: "user" },
          ],
          pages: {},
        }),
      })
      // companies (empty)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [], pages: {} }) });

    const items = [];
    for await (const item of intercomProvider.sync(validConfig)) {
      items.push(item);
    }

    const contacts = items.filter(i => i.kind === "event" && i.data.eventType === "contact.synced");
    expect(contacts.length).toBe(1);
    expect(contacts[0].data.payload).toMatchObject({
      name: "Jane Doe",
      email: "jane@test.com",
    });
  });
});

// ── 4. Sync: companies ──────────────────────────────────────────────────────

describe("Intercom sync: companies", () => {
  test("companies yield contact.synced with isCompany", async () => {
    mockFetch
      // conversations (empty)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ conversations: [], pages: {} }) })
      // contacts (empty)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [], pages: {} }) })
      // companies
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: "co-1", name: "Acme Corp", website: "acme.com", industry: "Tech" },
          ],
          pages: {},
        }),
      });

    const items = [];
    for await (const item of intercomProvider.sync(validConfig)) {
      items.push(item);
    }

    const companies = items.filter(
      i => i.kind === "event" && i.data.eventType === "contact.synced" && (i.data.payload as any).isCompany,
    );
    expect(companies.length).toBe(1);
    expect(companies[0].data.payload).toMatchObject({
      name: "Acme Corp",
      isCompany: true,
    });
  });
});

// ── 5. Write-back: reply_to_conversation ────────────────────────────────────

describe("Intercom write-back", () => {
  test("reply_to_conversation uses stored adminId", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ type: "conversation" }),
    });

    const result = await intercomProvider.executeAction!(validConfig, "reply_to_conversation", {
      conversationId: "conv-1",
      body: "Thanks for reaching out!",
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.intercom.com/conversations/conv-1/reply",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          type: "admin",
          admin_id: "admin-123",
          message_type: "comment",
          body: "Thanks for reaching out!",
        }),
      }),
    );
  });

  // ── 6. Write-back: add_note ─────────────────────────────────────────────────

  test("add_note uses message_type note", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ type: "conversation" }),
    });

    const result = await intercomProvider.executeAction!(validConfig, "add_note", {
      conversationId: "conv-1",
      body: "Internal observation",
    });

    expect(result.success).toBe(true);
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.message_type).toBe("note");
    expect(callBody.admin_id).toBe("admin-123");
  });

  // ── 7. Write-back: tag_conversation ─────────────────────────────────────────

  test("tag_conversation creates tag then attaches", async () => {
    // Create tag
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "tag-99", name: "vip" }),
    });
    // Attach tag
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ type: "tag" }),
    });

    const result = await intercomProvider.executeAction!(validConfig, "tag_conversation", {
      conversationId: "conv-1",
      tagName: "vip",
    });

    expect(result.success).toBe(true);
    // First call: create tag
    expect(mockFetch.mock.calls[0][0]).toBe("https://api.intercom.com/tags");
    // Second call: attach tag to conversation
    expect(mockFetch.mock.calls[1][0]).toBe("https://api.intercom.com/conversations/conv-1/tags");
    const attachBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(attachBody.id).toBe("tag-99");
  });
});
