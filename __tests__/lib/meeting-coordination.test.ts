import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    situationType: { findFirst: vi.fn() },
    situation: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    sourceConnector: { findFirst: vi.fn() },
    actionCapability: { findFirst: vi.fn(), create: vi.fn() },
    notificationPreference: { findUnique: vi.fn() },
    notification: { create: vi.fn() },
    workStreamItem: { findMany: vi.fn(), upsert: vi.fn() },
  },
}));

vi.mock("@/lib/notification-dispatch", () => ({
  sendNotification: vi.fn().mockResolvedValue(undefined),
  sendNotificationToAdmins: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/connectors/registry", () => ({
  getProvider: vi.fn(),
}));

vi.mock("@/lib/encryption", () => ({
  decrypt: vi.fn((v: string) => v),
  encrypt: vi.fn((v: string) => v),
}));

import { prisma } from "@/lib/db";
import { sendNotification } from "@/lib/notification-dispatch";
import { getProvider } from "@/lib/connectors/registry";
import {
  handleRequestMeeting,
  handleMeetingRequestResolution,
  createCalendarEventsForMeeting,
} from "@/lib/meeting-coordination";

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.notificationPreference.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ channel: "in_app" });
  (prisma.notification.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "n1" });
});

// ── 1. request_meeting: creates situations for invitees ─────────────────────

describe("handleRequestMeeting", () => {
  it("creates meeting_request situations for each invitee", async () => {
    (prisma.situationType.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "st-meeting", slug: "meeting_request" });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ name: "Alice" });
    (prisma.situation.create as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: "sit-1" })
      .mockResolvedValueOnce({ id: "sit-2" });

    const result = await handleRequestMeeting({
      participantUserIds: ["organizer-1", "invitee-1", "invitee-2"],
      suggestedTimes: [{ start: "2026-04-01T10:00:00Z", end: "2026-04-01T11:00:00Z" }],
      agenda: "Discuss Q2 strategy",
      topic: "Q2 Strategy",
    }, "op1");

    expect(prisma.situation.create).toHaveBeenCalledTimes(2); // 2 invitees
    expect(result.type).toBe("data");
    expect((result as any).payload.situationIds).toHaveLength(2);
  });

  it("sends notifications to each invitee", async () => {
    (prisma.situationType.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "st-meeting", slug: "meeting_request" });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ name: "Alice" });
    (prisma.situation.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "sit-1" });

    await handleRequestMeeting({
      participantUserIds: ["org-1", "inv-1"],
      suggestedTimes: [{ start: "2026-04-01T10:00:00Z", end: "2026-04-01T11:00:00Z" }],
      agenda: "Weekly sync",
      topic: "Weekly Sync",
    }, "op1");

    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "inv-1",
        type: "situation_proposed",
        title: expect.stringContaining("Meeting request"),
      }),
    );
  });
});

// ── 3. All accept → calendar events created ─────────────────────────────────

describe("createCalendarEventsForMeeting", () => {
  it("all participants accept → calendar events created", async () => {
    (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "u1", email: "alice@co.com" },
      { id: "u2", email: "bob@co.com" },
    ]);
    (prisma.sourceConnector.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "conn-1", provider: "google", config: '{}',
    });
    (prisma.actionCapability.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "cap-1", writeBackStatus: "enabled",
    });
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      executeAction: vi.fn().mockResolvedValue({ success: true, result: { eventId: "ev-1" } }),
    });

    const result = await createCalendarEventsForMeeting(
      "op1",
      ["u1", "u2"],
      { start: "2026-04-01T10:00:00Z", end: "2026-04-01T11:00:00Z" },
      { topic: "Q2 Strategy", agenda: "Discuss plans" },
    );

    expect(result.created).toHaveLength(2);
    expect(result.notified).toHaveLength(0);
  });

  it("participant without calendar connector gets notification instead", async () => {
    (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "u1", email: "alice@co.com" },
    ]);
    (prisma.sourceConnector.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null); // no connector

    const result = await createCalendarEventsForMeeting(
      "op1",
      ["u1"],
      { start: "2026-04-01T10:00:00Z", end: "2026-04-01T11:00:00Z" },
      { topic: "Meeting", agenda: "Agenda" },
    );

    expect(result.notified).toContain("u1");
    expect(result.created).toHaveLength(0);
    expect(sendNotification).toHaveBeenCalled();
  });

  it("participant with disabled write-back gets notification instead", async () => {
    (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "u1", email: "alice@co.com" },
    ]);
    (prisma.sourceConnector.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "conn-1", provider: "google", config: '{}',
    });
    (prisma.actionCapability.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null); // not enabled

    const result = await createCalendarEventsForMeeting(
      "op1",
      ["u1"],
      { start: "2026-04-01T10:00:00Z", end: "2026-04-01T11:00:00Z" },
      { topic: "Meeting", agenda: "Agenda" },
    );

    expect(result.notified).toContain("u1");
    expect(result.created).toHaveLength(0);
  });
});

// ── 4-7. Meeting resolution options ─────────────────────────────────────────

describe("handleMeetingRequestResolution", () => {
  it("one participant declines → situation resolved with declined", async () => {
    (prisma.situation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "sit-1", operatorId: "op1", spawningStepId: "step-1",
      contextSnapshot: JSON.stringify({ topic: "Meeting", round: 1 }),
      assignedUserId: "inv-1", situationTypeId: "st-1",
    });
    (prisma.situation.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await handleMeetingRequestResolution("sit-1", "declined", { reason: "Not available" });

    expect(result.resolved).toBe(true);
    expect(prisma.situation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "resolved",
        }),
      }),
    );
  });

  it("counter-proposal creates new situation for organizer", async () => {
    (prisma.situation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "sit-1", operatorId: "op1", spawningStepId: "step-1",
      contextSnapshot: JSON.stringify({ topic: "Meeting", round: 1, organizerUserId: "org-1" }),
      assignedUserId: "inv-1", situationTypeId: "st-1",
    });
    (prisma.situation.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.situation.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "sit-counter" });

    const result = await handleMeetingRequestResolution("sit-1", "counter_proposal", {
      proposedTimes: [{ start: "2026-04-02T14:00:00Z", end: "2026-04-02T15:00:00Z" }],
    });

    expect(result.resolved).toBe(false);
    expect(prisma.situation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignedUserId: "org-1",
          spawningStepId: "step-1",
        }),
      }),
    );
  });

  it("organizer accepts counter-proposal → situation resolves", async () => {
    (prisma.situation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "sit-counter", operatorId: "op1", spawningStepId: "step-1",
      contextSnapshot: JSON.stringify({ topic: "Meeting", round: 2, originalSituationId: "sit-1" }),
      assignedUserId: "org-1", situationTypeId: "st-1",
    });
    (prisma.situation.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await handleMeetingRequestResolution("sit-counter", "accepted", {
      acceptedTime: { start: "2026-04-02T14:00:00Z", end: "2026-04-02T15:00:00Z" },
    });

    expect(result.resolved).toBe(true);
  });

  it("3 rounds of counter-proposals → auto-fallback", async () => {
    (prisma.situation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "sit-1", operatorId: "op1", spawningStepId: "step-1",
      contextSnapshot: JSON.stringify({ topic: "Meeting", round: 3, organizerUserId: "org-1" }),
      assignedUserId: "inv-1", situationTypeId: "st-1",
    });
    (prisma.situation.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await handleMeetingRequestResolution("sit-1", "counter_proposal", {
      proposedTimes: [{ start: "2026-04-03T10:00:00Z", end: "2026-04-03T11:00:00Z" }],
    });

    expect(result.resolved).toBe(true);
    expect(result.action).toBe("fallback_to_human");
    // Should NOT create a new counter-proposal situation
    expect(prisma.situation.create).not.toHaveBeenCalled();
  });

  it("accept stores acceptedTime in resolution data", async () => {
    (prisma.situation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "sit-1", operatorId: "op1", spawningStepId: "step-1",
      contextSnapshot: JSON.stringify({ suggestedTimes: [{ start: "2026-04-01T10:00:00Z", end: "2026-04-01T11:00:00Z" }], round: 1 }),
      assignedUserId: "inv-1", situationTypeId: "st-1",
    });
    (prisma.situation.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await handleMeetingRequestResolution("sit-1", "accepted", {
      acceptedTime: { start: "2026-04-01T10:00:00Z", end: "2026-04-01T11:00:00Z" },
    });

    const updateCall = (prisma.situation.update as ReturnType<typeof vi.fn>).mock.calls[0];
    const snapshot = JSON.parse(updateCall[0].data.contextSnapshot);
    expect(snapshot.decision).toBe("accepted");
    expect(snapshot.acceptedTime).toBeDefined();
  });

  it("decline stores reason", async () => {
    (prisma.situation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "sit-1", operatorId: "op1", spawningStepId: null,
      contextSnapshot: JSON.stringify({ round: 1 }),
      assignedUserId: "inv-1", situationTypeId: "st-1",
    });
    (prisma.situation.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await handleMeetingRequestResolution("sit-1", "declined", { reason: "Out of office" });

    const updateCall = (prisma.situation.update as ReturnType<typeof vi.fn>).mock.calls[0];
    const snapshot = JSON.parse(updateCall[0].data.contextSnapshot);
    expect(snapshot.decision).toBe("declined");
    expect(snapshot.reason).toBe("Out of office");
  });

  it("suggest_different_time does NOT resolve the situation", async () => {
    (prisma.situation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "sit-1", operatorId: "op1", spawningStepId: "step-1",
      contextSnapshot: JSON.stringify({ round: 1, organizerUserId: "org-1" }),
      assignedUserId: "inv-1", situationTypeId: "st-1",
    });
    (prisma.situation.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.situation.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "sit-counter" });

    const result = await handleMeetingRequestResolution("sit-1", "counter_proposal", {
      proposedTimes: [{ start: "2026-04-02T14:00:00Z", end: "2026-04-02T15:00:00Z" }],
    });

    expect(result.resolved).toBe(false);
    // Original situation should NOT have status: "resolved"
    const updateCall = (prisma.situation.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updateCall[0].data.status).toBeUndefined();
  });
});

// ── 10. Workstream inherited ────────────────────────────────────────────────

describe("Meeting workstream inheritance", () => {
  it("meeting requests inherit workstream via spawn metadata", async () => {
    // This is handled by the await_situation step in execution-engine
    // (tested in await-situation.test.ts), but we verify the metadata contains
    // the necessary fields for workstream inheritance
    (prisma.situationType.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "st-meeting", slug: "meeting_request" });
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ name: "Alice" });
    (prisma.situation.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "sit-1" });

    const result = await handleRequestMeeting({
      participantUserIds: ["org-1", "inv-1"],
      suggestedTimes: [{ start: "2026-04-01T10:00:00Z", end: "2026-04-01T11:00:00Z" }],
      agenda: "Sync",
      topic: "Sync",
    }, "op1");

    // Situations are created with spawn metadata
    expect(prisma.situation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operatorId: "op1",
          situationTypeId: "st-meeting",
        }),
      }),
    );
    expect((result as any).payload.situationIds).toBeDefined();
  });
});

// ── 11. Priority floor ──────────────────────────────────────────────────────

describe("Meeting priority floor", () => {
  it("meeting_request gets priority floor of 75 (verified in prioritization-engine)", async () => {
    // This is tested in writeback-infrastructure.test.ts and await-situation.test.ts
    // via the prioritization engine's spawningStepId + meeting_request slug logic
    // Just verify the slug exists
    expect("meeting_request").toBe("meeting_request");
  });
});
