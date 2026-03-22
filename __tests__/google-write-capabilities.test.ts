import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({ prisma: {} }));

vi.mock("@/lib/connectors/google-auth", () => ({
  getValidAccessToken: vi.fn().mockResolvedValue("mock-token"),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Imports ──────────────────────────────────────────────────────────────────

import { googleProvider } from "@/lib/connectors/google-provider";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── writeCapabilities slugs ──────────────────────────────────────────────────

describe("writeCapabilities registry", () => {
  const slugs = (googleProvider.writeCapabilities || []).map((c) => c.slug);

  // Drive
  it.each([
    "create_document",
    "create_spreadsheet",
    "create_presentation",
    "upload_file",
    "create_folder",
    "move_file",
    "share_file",
    "copy_file",
  ])("includes Drive capability %s", (slug) => {
    expect(slugs).toContain(slug);
  });

  // Sheets
  it.each(["write_cells", "append_rows", "create_sheet_tab"])(
    "includes Sheets capability %s",
    (slug) => {
      expect(slugs).toContain(slug);
    }
  );

  // Gmail
  it.each([
    "reply_email",
    "forward_email",
    "create_draft",
    "send_with_attachment",
    "add_label",
    "archive",
    "mark_read",
  ])("includes Gmail capability %s", (slug) => {
    expect(slugs).toContain(slug);
  });

  // Calendar
  it.each(["create_calendar_event", "update_calendar_event", "delete_event", "rsvp_event"])(
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
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/presentations",
      "https://www.googleapis.com/auth/calendar",
    ],
  };

  it("routes unknown action to error", async () => {
    const result = await googleProvider.executeAction!(config, "nonexistent_action", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown action");
  });

  // Verify each slug has a route (doesn't throw "Unknown action")
  it.each([
    "create_document",
    "create_presentation",
    "upload_file",
    "create_folder",
    "move_file",
    "share_file",
    "copy_file",
    "write_cells",
    "append_rows",
    "create_sheet_tab",
    "reply_email",
    "forward_email",
    "create_draft",
    "send_with_attachment",
    "add_label",
    "archive",
    "mark_read",
    "delete_event",
    "rsvp_event",
  ])("routes %s to a handler (not unknown)", async (slug) => {
    // Set up a generic mock that returns an error (so we hit the API call, not "Unknown action")
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "mock api error",
      json: async () => ({}),
      headers: new Headers(),
    });

    const result = await googleProvider.executeAction!(config, slug, {});
    // The error should NOT be "Unknown action"
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
    scopes: ["https://www.googleapis.com/auth/drive"],
  };

  it("create_presentation rejects missing title", async () => {
    const result = await googleProvider.executeAction!(config, "create_presentation", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("title is required");
  });

  it("upload_file rejects missing name", async () => {
    const result = await googleProvider.executeAction!(config, "upload_file", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("name is required");
  });

  it("upload_file rejects missing mimeType", async () => {
    const result = await googleProvider.executeAction!(config, "upload_file", { name: "test.txt" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("mimeType is required");
  });

  it("upload_file rejects missing content", async () => {
    const result = await googleProvider.executeAction!(config, "upload_file", { name: "test.txt", mimeType: "text/plain" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("content is required");
  });

  it("upload_file rejects files over 5MB", async () => {
    const bigContent = Buffer.alloc(6 * 1024 * 1024).toString("base64");
    const result = await googleProvider.executeAction!(config, "upload_file", {
      name: "big.bin",
      mimeType: "application/octet-stream",
      content: bigContent,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("5MB");
  });

  it("create_folder rejects missing name", async () => {
    const result = await googleProvider.executeAction!(config, "create_folder", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("name is required");
  });

  it("move_file rejects missing fileId", async () => {
    const result = await googleProvider.executeAction!(config, "move_file", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("fileId is required");
  });

  it("move_file rejects missing targetFolderId", async () => {
    const result = await googleProvider.executeAction!(config, "move_file", { fileId: "f1" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("targetFolderId is required");
  });

  it("share_file rejects invalid role", async () => {
    const result = await googleProvider.executeAction!(config, "share_file", { fileId: "f1", email: "a@b.com", role: "owner" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("role must be");
  });

  it("copy_file rejects missing fileId", async () => {
    const result = await googleProvider.executeAction!(config, "copy_file", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("fileId is required");
  });

  it("copy_file rejects missing newName", async () => {
    const result = await googleProvider.executeAction!(config, "copy_file", { fileId: "f1" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("newName is required");
  });

  it("write_cells rejects missing spreadsheetId", async () => {
    const result = await googleProvider.executeAction!(config, "write_cells", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("spreadsheetId is required");
  });

  it("append_rows rejects missing sheetName", async () => {
    const result = await googleProvider.executeAction!(config, "append_rows", { spreadsheetId: "s1" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("sheetName is required");
  });

  it("create_sheet_tab rejects missing tabName", async () => {
    const result = await googleProvider.executeAction!(config, "create_sheet_tab", { spreadsheetId: "s1" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("tabName is required");
  });

  it("reply_email rejects missing threadId", async () => {
    const result = await googleProvider.executeAction!(config, "reply_email", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("threadId is required");
  });

  it("reply_email rejects missing messageId", async () => {
    const result = await googleProvider.executeAction!(config, "reply_email", { threadId: "t1" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("messageId is required");
  });

  it("forward_email rejects missing messageId", async () => {
    const result = await googleProvider.executeAction!(config, "forward_email", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("messageId is required");
  });

  it("create_draft rejects missing to", async () => {
    const result = await googleProvider.executeAction!(config, "create_draft", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("to is required");
  });

  it("send_with_attachment rejects missing attachments", async () => {
    const result = await googleProvider.executeAction!(config, "send_with_attachment", { to: "a@b.com", subject: "Test", body: "Hi" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("attachments is required");
  });

  it("add_label rejects missing messageId", async () => {
    const result = await googleProvider.executeAction!(config, "add_label", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("messageId is required");
  });

  it("archive rejects missing messageId", async () => {
    const result = await googleProvider.executeAction!(config, "archive", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("messageId is required");
  });

  it("mark_read rejects missing messageId", async () => {
    const result = await googleProvider.executeAction!(config, "mark_read", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("messageId is required");
  });

  it("delete_event rejects missing eventId", async () => {
    const result = await googleProvider.executeAction!(config, "delete_event", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("eventId is required");
  });

  it("rsvp_event rejects invalid response", async () => {
    const result = await googleProvider.executeAction!(config, "rsvp_event", { eventId: "e1", response: "maybe" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("response must be");
  });
});

// ── AI disclosure footer ─────────────────────────────────────────────────────

describe("AI disclosure footer", () => {
  const config = {
    access_token: "test",
    refresh_token: "test",
    token_expiry: new Date(Date.now() + 3600000).toISOString(),
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
  };

  it("reply_email includes AI disclosure when isAiGenerated is true", async () => {
    // Mock fetch for getting message headers, then sending
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          payload: {
            headers: [
              { name: "Subject", value: "Test" },
              { name: "From", value: "sender@example.com" },
              { name: "Message-ID", value: "<msg1@example.com>" },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "sent1", threadId: "t1" }),
      });

    await googleProvider.executeAction!(config, "reply_email", {
      threadId: "t1",
      messageId: "m1",
      body: "Hello",
      isAiGenerated: true,
      _operatorName: "Acme Corp",
    });

    // The second fetch call should contain the encoded message
    const sendCall = mockFetch.mock.calls[1];
    const sentBody = JSON.parse(sendCall[1].body);
    const decoded = Buffer.from(sentBody.raw, "base64url").toString("utf-8");
    expect(decoded).toContain("AI assistance");
    expect(decoded).toContain("Acme Corp");
    expect(decoded).toContain("Qorpera");
  });

  it("forward_email includes AI disclosure when isAiGenerated is true", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          payload: {
            headers: [
              { name: "Subject", value: "Orig" },
              { name: "From", value: "orig@example.com" },
              { name: "Date", value: "Mon, 1 Jan 2026" },
            ],
            body: { data: Buffer.from("Original body").toString("base64url") },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "fwd1", threadId: "t2" }),
      });

    await googleProvider.executeAction!(config, "forward_email", {
      messageId: "m1",
      to: "fwd@example.com",
      isAiGenerated: true,
    });

    const sendCall = mockFetch.mock.calls[1];
    const sentBody = JSON.parse(sendCall[1].body);
    const decoded = Buffer.from(sentBody.raw, "base64url").toString("utf-8");
    expect(decoded).toContain("AI assistance");
    expect(decoded).toContain("Qorpera");
  });

  it("send_with_attachment includes AI disclosure when isAiGenerated is true", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "att1", threadId: "t3" }),
    });

    await googleProvider.executeAction!(config, "send_with_attachment", {
      to: "recipient@example.com",
      subject: "Report",
      body: "See attached",
      attachments: [{ name: "report.txt", mimeType: "text/plain", content: Buffer.from("data").toString("base64") }],
      isAiGenerated: true,
      _operatorName: "TestCo",
    });

    const sendCall = mockFetch.mock.calls[0];
    const sentBody = JSON.parse(sendCall[1].body);
    const decoded = Buffer.from(sentBody.raw, "base64url").toString("utf-8");
    expect(decoded).toContain("AI assistance");
    expect(decoded).toContain("TestCo");
  });

  it("create_draft does NOT include AI disclosure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "draft1", message: { id: "dm1" } }),
    });

    await googleProvider.executeAction!(config, "create_draft", {
      to: "test@example.com",
      subject: "Draft",
      body: "Draft content",
      isAiGenerated: true, // Even if passed, create_draft should not add footer
    });

    const sendCall = mockFetch.mock.calls[0];
    const sentBody = JSON.parse(sendCall[1].body);
    const decoded = Buffer.from(sentBody.message.raw, "base64url").toString("utf-8");
    expect(decoded).not.toContain("AI assistance");
    expect(decoded).not.toContain("Qorpera");
  });
});

// ── OAuth scope constants ────────────────────────────────────────────────────

describe("OAuth scope constants", () => {
  it("auth route includes gmail.modify scope", async () => {
    // Read the auth route file content to verify the scope is present
    const fs = await import("fs");
    const authContent = fs.readFileSync(
      "src/app/api/connectors/google/auth/route.ts",
      "utf-8"
    );
    expect(authContent).toContain("gmail.modify");
    expect(authContent).toContain("presentations");
  });

  it("callback route includes gmail.modify scope", async () => {
    const fs = await import("fs");
    const callbackContent = fs.readFileSync(
      "src/app/api/connectors/google/callback/route.ts",
      "utf-8"
    );
    expect(callbackContent).toContain("gmail.modify");
    expect(callbackContent).toContain("presentations");
  });
});
