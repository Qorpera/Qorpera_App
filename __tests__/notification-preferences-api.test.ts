import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    notificationPreference: { findMany: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn().mockResolvedValue({
    user: { id: "user1", role: "admin" },
    operatorId: "op1",
  }),
}));

import { GET, PATCH } from "@/app/api/notification-preferences/route";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

const mockPrisma = prisma as any;
const mockGetSessionUser = getSessionUser as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSessionUser.mockResolvedValue({
    user: { id: "user1", role: "admin" },
    operatorId: "op1",
  });
});

describe("GET /api/notification-preferences", () => {
  it("returns merged preferences with defaults", async () => {
    mockPrisma.notificationPreference.findMany.mockResolvedValue([
      { notificationType: "situation_proposed", channel: "email" },
      { notificationType: "plan_failed", channel: "none" },
    ]);
    mockPrisma.user.findUnique.mockResolvedValue({ digestEnabled: false });

    const req = new Request("http://localhost/api/notification-preferences");
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();

    // Should contain all notification types (current: 17)
    expect(body.preferences).toHaveLength(17);

    // Explicit prefs should not be marked as default
    const situationPref = body.preferences.find(
      (p: any) => p.type === "situation_proposed"
    );
    expect(situationPref.channel).toBe("email");
    expect(situationPref.isDefault).toBe(false);

    const planFailedPref = body.preferences.find(
      (p: any) => p.type === "plan_failed"
    );
    expect(planFailedPref.channel).toBe("none");
    expect(planFailedPref.isDefault).toBe(false);

    // Non-explicit prefs should be marked as default
    const resolvedPref = body.preferences.find(
      (p: any) => p.type === "situation_resolved"
    );
    expect(resolvedPref.isDefault).toBe(true);

    // digestEnabled from user record
    expect(body.digestEnabled).toBe(false);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSessionUser.mockResolvedValue(null);

    const req = new Request("http://localhost/api/notification-preferences");
    const res = await GET();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });
});

describe("PATCH /api/notification-preferences", () => {
  it("upserts preferences correctly", async () => {
    mockPrisma.notificationPreference.upsert.mockResolvedValue({});
    mockPrisma.notificationPreference.findMany.mockResolvedValue([
      { notificationType: "situation_proposed", channel: "none" },
    ]);
    mockPrisma.user.findUnique.mockResolvedValue({ digestEnabled: true });

    const req = new Request("http://localhost/api/notification-preferences", {
      method: "PATCH",
      body: JSON.stringify({
        preferences: [{ type: "situation_proposed", channel: "none" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req as any);

    expect(res.status).toBe(200);
    expect(mockPrisma.notificationPreference.upsert).toHaveBeenCalledWith({
      where: {
        userId_notificationType: {
          userId: "user1",
          notificationType: "situation_proposed",
        },
      },
      create: {
        userId: "user1",
        notificationType: "situation_proposed",
        channel: "none",
      },
      update: { channel: "none" },
    });
  });

  it("updates digestEnabled on user", async () => {
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.notificationPreference.findMany.mockResolvedValue([]);
    mockPrisma.user.findUnique.mockResolvedValue({ digestEnabled: true });

    const req = new Request("http://localhost/api/notification-preferences", {
      method: "PATCH",
      body: JSON.stringify({ digestEnabled: true }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req as any);

    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user1" },
      data: { digestEnabled: true },
    });
  });
});
