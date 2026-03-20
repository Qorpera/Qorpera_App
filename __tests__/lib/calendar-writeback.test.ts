import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock Google auth
vi.mock("@/lib/connectors/google-auth", () => ({
  getValidAccessToken: vi.fn().mockResolvedValue("google-token"),
}));

// Mock Microsoft auth
vi.mock("@/lib/connectors/microsoft-auth", () => ({
  getValidAccessToken: vi.fn().mockResolvedValue("ms-token"),
}));

import { googleProvider } from "@/lib/connectors/google-provider";
import { microsoftProvider } from "@/lib/connectors/microsoft-provider";

beforeEach(() => {
  mockFetch.mockReset();
});

const googleConfig = {
  access_token: "google-token",
  refresh_token: "google-refresh",
  token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
  scopes: ["https://www.googleapis.com/auth/calendar"],
};

const msConfig = {
  access_token: "ms-token",
  refresh_token: "ms-refresh",
  token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
  scopes: ["Calendars.ReadWrite"],
};

// ── 1. Google Calendar: create event ────────────────────────────────────────

describe("Google Calendar write-back", () => {
  test("create_calendar_event calls correct API endpoint with formatted body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "gcal-event-1" }),
    });

    const result = await googleProvider.executeAction!(googleConfig, "create_calendar_event", {
      summary: "Quarterly Review",
      description: "Q1 results discussion",
      startDateTime: "2026-04-01T10:00:00Z",
      endDateTime: "2026-04-01T11:00:00Z",
      attendeeEmails: ["alice@co.com", "bob@co.com"],
      location: "Conference Room A",
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("googleapis.com/calendar/v3/calendars/primary/events"),
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.summary).toBe("Quarterly Review");
    expect(body.attendees).toEqual([{ email: "alice@co.com" }, { email: "bob@co.com" }]);
    expect(body.start.dateTime).toBe("2026-04-01T10:00:00Z");
  });

  // ── 2. Google Calendar: update event ────────────────────────────────────────

  test("update_calendar_event calls PATCH with correct fields", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "gcal-event-1" }),
    });

    const result = await googleProvider.executeAction!(googleConfig, "update_calendar_event", {
      eventId: "gcal-event-1",
      fields: { summary: "Updated Title", startDateTime: "2026-04-01T14:00:00Z" },
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("events/gcal-event-1"),
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  test("writeCapabilities declared with calendar events", () => {
    expect(googleProvider.writeCapabilities).toBeDefined();
    const slugs = googleProvider.writeCapabilities!.map(c => c.slug);
    expect(slugs).toContain("create_calendar_event");
    expect(slugs).toContain("update_calendar_event");
  });
});

// ── 3. Microsoft 365: create event ──────────────────────────────────────────

describe("Microsoft 365 Calendar write-back", () => {
  test("create_calendar_event calls Graph API with correct body format", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "ms-event-1" }),
    });

    const result = await microsoftProvider.executeAction!(msConfig, "create_calendar_event", {
      summary: "Team Sync",
      description: "Weekly sync meeting",
      startDateTime: "2026-04-01T15:00:00Z",
      endDateTime: "2026-04-01T16:00:00Z",
      attendeeEmails: ["carol@co.com"],
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/me/events",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.subject).toBe("Team Sync");
    expect(body.attendees[0].emailAddress.address).toBe("carol@co.com");
    expect(body.start.timeZone).toBe("UTC");
  });

  // ── 4. Microsoft 365: update event ────────────────────────────────────────

  test("update_calendar_event calls PATCH", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "ms-event-1" }),
    });

    const result = await microsoftProvider.executeAction!(msConfig, "update_calendar_event", {
      eventId: "ms-event-1",
      fields: { summary: "Updated Sync" },
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://graph.microsoft.com/v1.0/me/events/ms-event-1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  test("writeCapabilities declared", () => {
    expect(microsoftProvider.writeCapabilities).toBeDefined();
    const slugs = microsoftProvider.writeCapabilities!.map(c => c.slug);
    expect(slugs).toContain("create_calendar_event");
    expect(slugs).toContain("update_calendar_event");
  });
});

// ── 5. Backfill ─────────────────────────────────────────────────────────────

describe("Calendar capability backfill", () => {
  test("backfillCalendarWriteCapabilities creates capabilities for existing connectors", async () => {
    vi.mock("@/lib/connectors/registry", () => ({
      getProvider: vi.fn().mockReturnValue({
        writeCapabilities: [
          { slug: "create_calendar_event", name: "Create Calendar Event", description: "Creates event", inputSchema: {} },
          { slug: "update_calendar_event", name: "Update Calendar Event", description: "Updates event", inputSchema: {} },
        ],
      }),
    }));

    vi.mock("@/lib/encryption", () => ({
      decrypt: vi.fn((v: string) => v),
      encrypt: vi.fn((v: string) => v),
    }));

    const { prisma } = await import("@/lib/db");
    (prisma as any).sourceConnector = {
      findMany: vi.fn().mockResolvedValue([
        { id: "conn-1", provider: "google", operatorId: "op1" },
      ]),
    };
    (prisma as any).actionCapability = {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "cap-1" }),
    };

    const { backfillCalendarWriteCapabilities } = await import("@/lib/meeting-coordination");
    const count = await backfillCalendarWriteCapabilities("op1");

    expect(count).toBe(2);
    expect((prisma as any).actionCapability.create).toHaveBeenCalledTimes(2);
  });
});
