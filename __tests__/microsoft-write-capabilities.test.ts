import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({ prisma: {} }));

vi.mock("@/lib/connectors/microsoft-auth", () => ({
  getValidAccessToken: vi.fn().mockResolvedValue("mock-token"),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Imports ──────────────────────────────────────────────────────────────────

import { microsoftProvider } from "@/lib/connectors/microsoft-provider";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── writeCapabilities slugs ──────────────────────────────────────────────────

describe("writeCapabilities registry", () => {
  const slugs = (microsoftProvider.writeCapabilities || []).map((c) => c.slug);

  // OneDrive
  it.each([
    "create_document",
    "create_spreadsheet",
    "upload_file",
    "create_folder",
    "share_file",
    "move_file",
    "copy_file",
  ])("includes OneDrive capability %s", (slug) => {
    expect(slugs).toContain(slug);
  });

  // Outlook
  it.each([
    "reply_email",
    "forward_email",
    "create_draft",
    "send_with_attachment",
    "archive",
    "flag_message",
    "mark_read",
  ])("includes Outlook capability %s", (slug) => {
    expect(slugs).toContain(slug);
  });

  // Teams
  it.each(["send_channel_message", "reply_to_teams_thread"])(
    "includes Teams capability %s",
    (slug) => {
      expect(slugs).toContain(slug);
    }
  );

  // Excel
  it.each(["write_cells", "append_rows", "create_worksheet"])(
    "includes Excel capability %s",
    (slug) => {
      expect(slugs).toContain(slug);
    }
  );

  // Calendar (existing)
  it.each(["create_calendar_event", "update_calendar_event"])(
    "includes Calendar capability %s",
    (slug) => {
      expect(slugs).toContain(slug);
    }
  );
});

// ── executeAction routing ────────────────────────────────────────────────────

describe("executeAction routing", () => {
  const config = {
    access_token: "test",
    refresh_token: "test",
    token_expiry: new Date(Date.now() + 3600000).toISOString(),
    scopes: [
      "Mail.Read",
      "Mail.Send",
      "Mail.ReadWrite",
      "Files.ReadWrite.All",
      "Calendars.Read",
      "ChannelMessage.Read.All",
      "ChannelMessage.Send",
      "Channel.ReadBasic.All",
      "User.Read",
      "offline_access",
    ],
  };

  it("routes unknown action to error", async () => {
    const result = await microsoftProvider.executeAction!(config, "nonexistent_action", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown action");
  });

  it.each([
    "reply_email",
    "forward_email",
    "create_draft",
    "send_with_attachment",
    "archive",
    "flag_message",
    "mark_read",
    "upload_file",
    "create_folder",
    "share_file",
    "move_file",
    "copy_file",
    "send_channel_message",
    "reply_to_teams_thread",
    "write_cells",
    "append_rows",
    "create_worksheet",
  ])("routes %s to a handler (not unknown)", async (slug) => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "mock api error",
      json: async () => ({}),
      headers: new Headers(),
    });

    const result = await microsoftProvider.executeAction!(config, slug, {});
    if (!result.success) {
      expect(result.error).not.toContain("Unknown action");
    }
  });
});

// ── Parameter validation ─────────────────────────────────────────────────────

describe("parameter validation", () => {
  const config = {
    access_token: "test",
    refresh_token: "test",
    token_expiry: new Date(Date.now() + 3600000).toISOString(),
    scopes: ["Files.ReadWrite.All"],
  };

  it("upload_file rejects missing name", async () => {
    const result = await microsoftProvider.executeAction!(config, "upload_file", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("name is required");
  });

  it("upload_file rejects missing content", async () => {
    const result = await microsoftProvider.executeAction!(config, "upload_file", { name: "test.txt" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("content is required");
  });

  it("upload_file rejects files over 10MB", async () => {
    const bigContent = Buffer.alloc(11 * 1024 * 1024).toString("base64");
    const result = await microsoftProvider.executeAction!(config, "upload_file", {
      name: "big.bin",
      content: bigContent,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("10MB");
  });

  it("create_folder rejects missing name", async () => {
    const result = await microsoftProvider.executeAction!(config, "create_folder", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("name is required");
  });

  it("share_file rejects invalid role", async () => {
    const result = await microsoftProvider.executeAction!(config, "share_file", { fileId: "f1", email: "a@b.com", role: "owner" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("role must be");
  });

  it("move_file rejects missing fileId", async () => {
    const result = await microsoftProvider.executeAction!(config, "move_file", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("fileId is required");
  });

  it("move_file rejects missing targetFolderId", async () => {
    const result = await microsoftProvider.executeAction!(config, "move_file", { fileId: "f1" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("targetFolderId is required");
  });

  it("copy_file rejects missing fileId", async () => {
    const result = await microsoftProvider.executeAction!(config, "copy_file", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("fileId is required");
  });

  it("copy_file rejects missing newName", async () => {
    const result = await microsoftProvider.executeAction!(config, "copy_file", { fileId: "f1" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("newName is required");
  });

  it("reply_email rejects missing messageId", async () => {
    const result = await microsoftProvider.executeAction!(config, "reply_email", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("messageId is required");
  });

  it("reply_email rejects missing body", async () => {
    const result = await microsoftProvider.executeAction!(config, "reply_email", { messageId: "m1" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("body is required");
  });

  it("forward_email rejects missing messageId", async () => {
    const result = await microsoftProvider.executeAction!(config, "forward_email", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("messageId is required");
  });

  it("forward_email rejects missing to", async () => {
    const result = await microsoftProvider.executeAction!(config, "forward_email", { messageId: "m1" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("to is required");
  });

  it("create_draft rejects missing to", async () => {
    const result = await microsoftProvider.executeAction!(config, "create_draft", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("to is required");
  });

  it("send_with_attachment rejects missing attachments", async () => {
    const result = await microsoftProvider.executeAction!(config, "send_with_attachment", { to: "a@b.com", subject: "Test", body: "Hi" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("attachments is required");
  });

  it("archive rejects missing messageId", async () => {
    const result = await microsoftProvider.executeAction!(config, "archive", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("messageId is required");
  });

  it("flag_message rejects invalid flagStatus", async () => {
    const result = await microsoftProvider.executeAction!(config, "flag_message", { messageId: "m1", flagStatus: "maybe" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("flagStatus must be");
  });

  it("mark_read rejects missing messageId", async () => {
    const result = await microsoftProvider.executeAction!(config, "mark_read", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("messageId is required");
  });

  it("send_channel_message rejects missing teamId", async () => {
    const result = await microsoftProvider.executeAction!(config, "send_channel_message", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("teamId is required");
  });

  it("send_channel_message rejects missing channelId", async () => {
    const result = await microsoftProvider.executeAction!(config, "send_channel_message", { teamId: "t1" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("channelId is required");
  });

  it("reply_to_teams_thread rejects missing messageId", async () => {
    const result = await microsoftProvider.executeAction!(config, "reply_to_teams_thread", { teamId: "t1", channelId: "c1" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("messageId is required");
  });

  it("write_cells rejects missing workbookId", async () => {
    const result = await microsoftProvider.executeAction!(config, "write_cells", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("workbookId is required");
  });

  it("append_rows rejects missing sheetName", async () => {
    const result = await microsoftProvider.executeAction!(config, "append_rows", { workbookId: "w1" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("sheetName is required");
  });

  it("create_worksheet rejects missing workbookId", async () => {
    const result = await microsoftProvider.executeAction!(config, "create_worksheet", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("workbookId is required");
  });

  it("create_worksheet rejects missing name", async () => {
    const result = await microsoftProvider.executeAction!(config, "create_worksheet", { workbookId: "w1" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("name is required");
  });
});

// ── AI disclosure ────────────────────────────────────────────────────────────

describe("AI disclosure", () => {
  const config = {
    access_token: "test",
    refresh_token: "test",
    token_expiry: new Date(Date.now() + 3600000).toISOString(),
    scopes: ["Mail.Send", "ChannelMessage.Send"],
  };

  it("reply_email includes AI disclosure when isAiGenerated", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
      text: async () => "",
    });

    await microsoftProvider.executeAction!(config, "reply_email", {
      messageId: "m1",
      body: "Hello",
      isAiGenerated: true,
      _operatorName: "Acme Corp",
    });

    const call = mockFetch.mock.calls[0];
    const sentBody = JSON.parse(call[1].body);
    expect(sentBody.comment).toContain("AI assistance");
    expect(sentBody.comment).toContain("Acme Corp");
    expect(sentBody.comment).toContain("Qorpera");
  });

  it("forward_email includes AI disclosure when isAiGenerated", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
      text: async () => "",
    });

    await microsoftProvider.executeAction!(config, "forward_email", {
      messageId: "m1",
      to: "fwd@example.com",
      comment: "FYI",
      isAiGenerated: true,
      _operatorName: "TestCo",
    });

    const call = mockFetch.mock.calls[0];
    const sentBody = JSON.parse(call[1].body);
    expect(sentBody.comment).toContain("AI assistance");
    expect(sentBody.comment).toContain("TestCo");
  });

  it("send_with_attachment includes AI disclosure when isAiGenerated", async () => {
    // Step 1: create draft, Step 2: attach, Step 3: send
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "draft1" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, text: async () => "" });

    await microsoftProvider.executeAction!(config, "send_with_attachment", {
      to: "test@example.com",
      subject: "Report",
      body: "See attached",
      attachments: [{ name: "f.txt", mimeType: "text/plain", content: Buffer.from("data").toString("base64") }],
      isAiGenerated: true,
      _operatorName: "TestCo",
    });

    // First call creates draft — check body content
    const draftCall = mockFetch.mock.calls[0];
    const draftBody = JSON.parse(draftCall[1].body);
    expect(draftBody.body.content).toContain("AI assistance");
    expect(draftBody.body.content).toContain("TestCo");
  });

  it("create_draft does NOT include AI disclosure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "draft1", webLink: "https://outlook.com/draft1" }),
    });

    await microsoftProvider.executeAction!(config, "create_draft", {
      to: "test@example.com",
      subject: "Draft",
      body: "Draft content",
      isAiGenerated: true,
    });

    const call = mockFetch.mock.calls[0];
    const sentBody = JSON.parse(call[1].body);
    expect(sentBody.body.content).not.toContain("AI assistance");
    expect(sentBody.body.content).not.toContain("Qorpera");
  });

  it("send_channel_message includes AI prefix when isAiGenerated", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "msg1" }),
    });

    await microsoftProvider.executeAction!(config, "send_channel_message", {
      teamId: "t1",
      channelId: "c1",
      body: "Hello team",
      isAiGenerated: true,
    });

    const call = mockFetch.mock.calls[0];
    const sentBody = JSON.parse(call[1].body);
    expect(sentBody.body.content).toMatch(/^🤖 \[AI\]/);
  });

  it("reply_to_teams_thread includes AI prefix when isAiGenerated", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "reply1" }),
    });

    await microsoftProvider.executeAction!(config, "reply_to_teams_thread", {
      teamId: "t1",
      channelId: "c1",
      messageId: "m1",
      body: "Noted",
      isAiGenerated: true,
    });

    const call = mockFetch.mock.calls[0];
    const sentBody = JSON.parse(call[1].body);
    expect(sentBody.body.content).toMatch(/^🤖 \[AI\]/);
  });
});

// ── OAuth scope constants ────────────────────────────────────────────────────

describe("OAuth scope constants", () => {
  it("auth route includes new scopes", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      "src/app/api/connectors/microsoft/auth/route.ts",
      "utf-8"
    );
    expect(content).toContain("Mail.ReadWrite");
    expect(content).toContain("Files.ReadWrite.All");
    expect(content).toContain("ChannelMessage.Send");
    expect(content).toContain("Channel.ReadBasic.All");
  });

  it("callback route includes new scopes", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      "src/app/api/connectors/microsoft/callback/route.ts",
      "utf-8"
    );
    expect(content).toContain("Mail.ReadWrite");
    expect(content).toContain("Files.ReadWrite.All");
    expect(content).toContain("ChannelMessage.Send");
    expect(content).toContain("Channel.ReadBasic.All");
  });
});
