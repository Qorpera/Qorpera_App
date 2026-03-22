import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({ prisma: {} }));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Imports ──────────────────────────────────────────────────────────────────

import { slackProvider } from "@/lib/connectors/slack-provider";
import { intercomProvider } from "@/lib/connectors/intercom-provider";
import { zendeskProvider } from "@/lib/connectors/zendesk-provider";
import { pipedriveProvider } from "@/lib/connectors/pipedrive-provider";
import { salesforceProvider } from "@/lib/connectors/salesforce-provider";

beforeEach(() => {
  vi.clearAllMocks();
});

// Helper: mock Slack API response
function mockSlackOk(data: Record<string, unknown> = {}) {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, ...data }) });
}
function mockSlackErr(error = "test_error") {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: false, error }) });
}

// ═══════════════════════════════════════════════════════════════════
// SLACK
// ═══════════════════════════════════════════════════════════════════

describe("Slack writeCapabilities", () => {
  const slugs = (slackProvider.writeCapabilities || []).map((c) => c.slug);
  it.each([
    "reply_in_thread", "pin_message", "unpin_message", "set_channel_topic",
    "set_channel_purpose", "create_channel", "invite_to_channel",
    "add_reaction", "remove_reaction", "upload_file", "set_reminder",
  ])("includes %s", (slug) => expect(slugs).toContain(slug));
});

describe("Slack executeAction routing", () => {
  const config = { bot_token: "xoxb-test" };

  it("routes unknown to error", async () => {
    const r = await slackProvider.executeAction!(config, "nope", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("Unknown");
  });

  it.each([
    "reply_in_thread", "pin_message", "unpin_message", "set_channel_topic",
    "set_channel_purpose", "create_channel", "invite_to_channel",
    "add_reaction", "remove_reaction", "set_reminder",
  ])("routes %s (not unknown)", async (slug) => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: false, error: "mock" }) });
    const r = await slackProvider.executeAction!(config, slug, {});
    if (!r.success) expect(r.error).not.toContain("Unknown");
  });
});

describe("Slack param validation", () => {
  const config = { bot_token: "xoxb-test" };

  it("reply_in_thread rejects missing channelId", async () => {
    const r = await slackProvider.executeAction!(config, "reply_in_thread", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("channelId");
  });

  it("create_channel rejects missing name", async () => {
    const r = await slackProvider.executeAction!(config, "create_channel", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("name");
  });

  it("invite_to_channel rejects missing channelId", async () => {
    const r = await slackProvider.executeAction!(config, "invite_to_channel", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("channelId");
  });

  it("set_reminder rejects missing text", async () => {
    const r = await slackProvider.executeAction!(config, "set_reminder", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("text");
  });
});

describe("Slack AI disclosure", () => {
  const config = { bot_token: "xoxb-test" };

  it("reply_in_thread prepends AI prefix when isAiGenerated", async () => {
    mockSlackOk({ ts: "123", channel: "C1" });
    await slackProvider.executeAction!(config, "reply_in_thread", {
      channelId: "C1", threadTs: "111", text: "Hello", isAiGenerated: true,
    });
    const call = mockFetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.text).toMatch(/^🤖 \[AI\]/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// INTERCOM
// ═══════════════════════════════════════════════════════════════════

describe("Intercom writeCapabilities", () => {
  const slugs = (intercomProvider.writeCapabilities || []).map((c) => c.slug);
  it.each([
    "reply_to_conversation", "add_note", "tag_conversation",
    "assign_conversation", "close_conversation", "snooze_conversation",
    "open_conversation", "create_contact", "update_contact",
    "create_note_on_contact", "tag_contact",
  ])("includes %s", (slug) => expect(slugs).toContain(slug));
});

describe("Intercom executeAction routing", () => {
  const config = { access_token: "t", intercomAdminId: "admin1" };

  it("routes unknown to error", async () => {
    const r = await intercomProvider.executeAction!(config, "nope", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("Unknown");
  });

  it.each([
    "assign_conversation", "close_conversation", "snooze_conversation",
    "open_conversation", "create_contact", "update_contact",
    "create_note_on_contact", "tag_contact",
  ])("routes %s (not unknown)", async (slug) => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "err", json: async () => ({}) });
    const r = await intercomProvider.executeAction!(config, slug, {});
    if (!r.success) expect(r.error).not.toContain("Unknown");
  });
});

describe("Intercom param validation", () => {
  const config = { access_token: "t", intercomAdminId: "admin1" };

  it("assign_conversation rejects missing conversationId", async () => {
    const r = await intercomProvider.executeAction!(config, "assign_conversation", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("conversationId");
  });

  it("create_contact rejects missing email", async () => {
    const r = await intercomProvider.executeAction!(config, "create_contact", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("email");
  });

  it("update_contact rejects missing contactId", async () => {
    const r = await intercomProvider.executeAction!(config, "update_contact", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("contactId");
  });

  it("create_note_on_contact rejects missing contactId", async () => {
    const r = await intercomProvider.executeAction!(config, "create_note_on_contact", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("contactId");
  });

  it("tag_contact rejects missing contactId", async () => {
    const r = await intercomProvider.executeAction!(config, "tag_contact", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("contactId");
  });
});

describe("Intercom adminId requirement", () => {
  it("rejects all actions when intercomAdminId is missing", async () => {
    const config = { access_token: "t" }; // No intercomAdminId
    const r = await intercomProvider.executeAction!(config, "close_conversation", { conversationId: "c1" });
    expect(r.success).toBe(false);
    expect(r.error).toContain("admin");
  });
});

describe("Intercom duplicate contact check", () => {
  const config = { access_token: "t", intercomAdminId: "admin1" };

  it("returns existing contact when email found", async () => {
    // Search returns match
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: "existing-1", email: "dup@test.com" }], total_count: 1 }),
    });

    const r = await intercomProvider.executeAction!(config, "create_contact", { email: "dup@test.com" });
    expect(r.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// ZENDESK
// ═══════════════════════════════════════════════════════════════════

describe("Zendesk writeCapabilities", () => {
  const slugs = (zendeskProvider.writeCapabilities || []).map((c) => c.slug);
  it.each([
    "reply_to_ticket", "update_ticket_status", "add_internal_note",
    "create_ticket", "assign_ticket", "close_ticket", "set_ticket_priority",
    "add_tags", "remove_tags", "merge_tickets", "update_ticket_type",
  ])("includes %s", (slug) => expect(slugs).toContain(slug));
});

describe("Zendesk executeAction routing", () => {
  const config = { access_token: "t", refresh_token: "r", token_expiry: new Date(Date.now() + 3600000).toISOString(), subdomain: "test" };

  it("routes unknown to error", async () => {
    const r = await zendeskProvider.executeAction!(config, "nope", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("Unknown");
  });

  it.each([
    "create_ticket", "assign_ticket", "close_ticket", "set_ticket_priority",
    "add_tags", "remove_tags", "merge_tickets", "update_ticket_type",
  ])("routes %s (not unknown)", async (slug) => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "err", json: async () => ({}) });
    const r = await zendeskProvider.executeAction!(config, slug, {});
    if (!r.success) expect(r.error).not.toContain("Unknown");
  });
});

describe("Zendesk param validation", () => {
  const config = { access_token: "t", refresh_token: "r", token_expiry: new Date(Date.now() + 3600000).toISOString(), subdomain: "test" };

  it("create_ticket rejects missing subject", async () => {
    const r = await zendeskProvider.executeAction!(config, "create_ticket", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("subject");
  });

  it("assign_ticket rejects missing ticketId", async () => {
    const r = await zendeskProvider.executeAction!(config, "assign_ticket", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("ticketId");
  });

  it("close_ticket rejects missing ticketId", async () => {
    const r = await zendeskProvider.executeAction!(config, "close_ticket", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("ticketId");
  });

  it("set_ticket_priority rejects invalid priority", async () => {
    const r = await zendeskProvider.executeAction!(config, "set_ticket_priority", { ticketId: "1", priority: "critical" });
    expect(r.success).toBe(false);
    expect(r.error).toContain("priority");
  });

  it("merge_tickets rejects missing targetTicketId", async () => {
    const r = await zendeskProvider.executeAction!(config, "merge_tickets", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("targetTicketId");
  });

  it("update_ticket_type rejects invalid type", async () => {
    const r = await zendeskProvider.executeAction!(config, "update_ticket_type", { ticketId: "1", type: "bug" });
    expect(r.success).toBe(false);
    expect(r.error).toContain("type");
  });
});

// ═══════════════════════════════════════════════════════════════════
// PIPEDRIVE
// ═══════════════════════════════════════════════════════════════════

describe("Pipedrive writeCapabilities", () => {
  const slugs = (pipedriveProvider.writeCapabilities || []).map((c) => c.slug);
  it.each([
    "update_deal_stage", "create_note", "update_contact",
    "create_deal", "update_deal", "delete_deal", "create_activity",
    "mark_activity_done", "create_person", "create_organization", "create_lead",
  ])("includes %s", (slug) => expect(slugs).toContain(slug));
});

describe("Pipedrive executeAction routing", () => {
  const config = { access_token: "t", refresh_token: "r", token_expiry: new Date(Date.now() + 3600000).toISOString() };

  it("routes unknown to error", async () => {
    const r = await pipedriveProvider.executeAction!(config, "nope", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("Unknown");
  });

  it.each([
    "create_deal", "update_deal", "delete_deal", "create_activity",
    "mark_activity_done", "create_person", "create_organization", "create_lead",
  ])("routes %s (not unknown)", async (slug) => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "err", json: async () => ({}) });
    const r = await pipedriveProvider.executeAction!(config, slug, {});
    if (!r.success) expect(r.error).not.toContain("Unknown");
  });
});

describe("Pipedrive param validation", () => {
  const config = { access_token: "t", refresh_token: "r", token_expiry: new Date(Date.now() + 3600000).toISOString() };

  it("create_deal rejects missing title", async () => {
    const r = await pipedriveProvider.executeAction!(config, "create_deal", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("title");
  });

  it("update_deal rejects missing dealId", async () => {
    const r = await pipedriveProvider.executeAction!(config, "update_deal", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("dealId");
  });

  it("delete_deal rejects missing dealId", async () => {
    const r = await pipedriveProvider.executeAction!(config, "delete_deal", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("dealId");
  });

  it("create_activity rejects missing subject", async () => {
    const r = await pipedriveProvider.executeAction!(config, "create_activity", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("subject");
  });

  it("mark_activity_done rejects missing activityId", async () => {
    const r = await pipedriveProvider.executeAction!(config, "mark_activity_done", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("activityId");
  });

  it("create_person rejects missing name", async () => {
    const r = await pipedriveProvider.executeAction!(config, "create_person", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("name");
  });

  it("create_organization rejects missing name", async () => {
    const r = await pipedriveProvider.executeAction!(config, "create_organization", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("name");
  });

  it("create_lead rejects missing title", async () => {
    const r = await pipedriveProvider.executeAction!(config, "create_lead", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("title");
  });
});

// ═══════════════════════════════════════════════════════════════════
// SALESFORCE
// ═══════════════════════════════════════════════════════════════════

describe("Salesforce writeCapabilities", () => {
  const slugs = (salesforceProvider.writeCapabilities || []).map((c) => c.slug);
  it.each([
    "update_opportunity", "create_task", "update_contact", "log_activity",
    "create_contact", "create_opportunity", "create_case", "close_case",
    "complete_task", "send_email_via_salesforce",
  ])("includes %s", (slug) => expect(slugs).toContain(slug));
});

describe("Salesforce executeAction routing", () => {
  const config = { access_token: "t", refresh_token: "r", token_expiry: new Date(Date.now() + 3600000).toISOString(), instance_url: "https://test.salesforce.com" };

  it("routes unknown to error", async () => {
    const r = await salesforceProvider.executeAction!(config, "nope", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("Unknown");
  });

  it.each([
    "create_contact", "create_opportunity", "create_case", "close_case",
    "complete_task", "send_email_via_salesforce",
  ])("routes %s (not unknown)", async (slug) => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "err", json: async () => ({}) });
    const r = await salesforceProvider.executeAction!(config, slug, {});
    if (!r.success) expect(r.error).not.toContain("Unknown");
  });
});

describe("Salesforce param validation", () => {
  const config = { access_token: "t", refresh_token: "r", token_expiry: new Date(Date.now() + 3600000).toISOString(), instance_url: "https://test.salesforce.com" };

  it("create_contact rejects missing firstName", async () => {
    const r = await salesforceProvider.executeAction!(config, "create_contact", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("firstName");
  });

  it("create_opportunity rejects missing name", async () => {
    const r = await salesforceProvider.executeAction!(config, "create_opportunity", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("name");
  });

  it("create_case rejects missing subject", async () => {
    const r = await salesforceProvider.executeAction!(config, "create_case", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("subject");
  });

  it("close_case rejects missing caseId", async () => {
    const r = await salesforceProvider.executeAction!(config, "close_case", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("caseId");
  });

  it("complete_task rejects missing taskId", async () => {
    const r = await salesforceProvider.executeAction!(config, "complete_task", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("taskId");
  });

  it("send_email_via_salesforce rejects missing targetObjectId", async () => {
    const r = await salesforceProvider.executeAction!(config, "send_email_via_salesforce", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("targetObjectId");
  });
});

describe("Salesforce AI disclosure", () => {
  const config = { access_token: "t", refresh_token: "r", token_expiry: new Date(Date.now() + 3600000).toISOString(), instance_url: "https://test.salesforce.com" };

  it("send_email_via_salesforce includes AI disclosure when isAiGenerated", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "e1" }), text: async () => "" });

    await salesforceProvider.executeAction!(config, "send_email_via_salesforce", {
      targetObjectId: "003xx",
      subject: "Test",
      body: "Hello",
      isAiGenerated: true,
      _operatorName: "Acme Corp",
    });

    const call = mockFetch.mock.calls[0];
    const sentBody = JSON.parse(call[1].body);
    const emailBody = sentBody.inputs?.[0]?.emailBody || "";
    expect(emailBody).toContain("AI assistance");
    expect(emailBody).toContain("Qorpera");
  });
});
