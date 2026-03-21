import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    personalAutonomy: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    notification: {
      create: vi.fn().mockResolvedValue({}),
    },
    notificationPreference: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    operator: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/notification-dispatch", () => ({
  sendNotification: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sendNotification } from "@/lib/notification-dispatch";

const mockPrisma = prisma as any;
const mockGetSession = getSessionUser as any;

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════

describe("Promote autonomy endpoint", () => {
  const adminSession = {
    user: { id: "admin-1", role: "admin" },
    operatorId: "op-1",
    isSuperadmin: false,
  };

  const memberSession = {
    user: { id: "member-1", role: "member" },
    operatorId: "op-1",
    isSuperadmin: false,
  };

  it("promotes supervised → notify for admin", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    mockPrisma.personalAutonomy.findFirst.mockResolvedValueOnce({
      id: "pa-1",
      operatorId: "op-1",
      autonomyLevel: "supervised",
      aiEntity: { id: "ent-1", ownerUserId: "user-1" },
      situationType: { name: "Invoice Overdue" },
    });
    mockPrisma.personalAutonomy.update.mockResolvedValueOnce({
      id: "pa-1",
      autonomyLevel: "notify",
    });

    // Import the route handler dynamically
    const { POST } = await import(
      "@/app/api/personal-autonomy/[id]/promote/route"
    );

    const req = new Request("http://localhost/api/personal-autonomy/pa-1/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: "notify" }),
    });

    const res = await POST(req as any, { params: Promise.resolve({ id: "pa-1" }) });
    expect(res.status).toBe(200);
    expect(mockPrisma.personalAutonomy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          autonomyLevel: "notify",
          promotedById: "admin-1",
        }),
      }),
    );
  });

  it("promotes notify → autonomous for admin", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    mockPrisma.personalAutonomy.findFirst.mockResolvedValueOnce({
      id: "pa-1",
      operatorId: "op-1",
      autonomyLevel: "notify",
      aiEntity: { id: "ent-1", ownerUserId: "user-1" },
      situationType: { name: "Invoice Overdue" },
    });
    mockPrisma.personalAutonomy.update.mockResolvedValueOnce({
      id: "pa-1",
      autonomyLevel: "autonomous",
    });

    const { POST } = await import(
      "@/app/api/personal-autonomy/[id]/promote/route"
    );

    const req = new Request("http://localhost/api/personal-autonomy/pa-1/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: "autonomous" }),
    });

    const res = await POST(req as any, { params: Promise.resolve({ id: "pa-1" }) });
    expect(res.status).toBe(200);
  });

  it("rejects promoting autonomous to anything (already at max)", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    mockPrisma.personalAutonomy.findFirst.mockResolvedValueOnce({
      id: "pa-1",
      operatorId: "op-1",
      autonomyLevel: "autonomous",
      aiEntity: { id: "ent-1", ownerUserId: null },
      situationType: { name: "Test" },
    });

    const { POST } = await import(
      "@/app/api/personal-autonomy/[id]/promote/route"
    );

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: "autonomous" }),
    });

    const res = await POST(req as any, { params: Promise.resolve({ id: "pa-1" }) });
    expect(res.status).toBe(400);
  });

  it("rejects promotion by non-admin (403)", async () => {
    mockGetSession.mockResolvedValue(memberSession);

    const { POST } = await import(
      "@/app/api/personal-autonomy/[id]/promote/route"
    );

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: "notify" }),
    });

    const res = await POST(req as any, { params: Promise.resolve({ id: "pa-1" }) });
    expect(res.status).toBe(403);
  });

  it("rejects cross-operator promotion (404)", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    // findFirst returns null because operatorId doesn't match
    mockPrisma.personalAutonomy.findFirst.mockResolvedValueOnce(null);

    const { POST } = await import(
      "@/app/api/personal-autonomy/[id]/promote/route"
    );

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: "notify" }),
    });

    const res = await POST(req as any, { params: Promise.resolve({ id: "pa-other" }) });
    expect(res.status).toBe(404);
  });

  it("sends notification to the user whose AI was promoted", async () => {
    mockGetSession.mockResolvedValue(adminSession);
    mockPrisma.personalAutonomy.findFirst.mockResolvedValueOnce({
      id: "pa-1",
      operatorId: "op-1",
      autonomyLevel: "supervised",
      aiEntity: { id: "ent-1", ownerUserId: "user-1" },
      situationType: { name: "Invoice Overdue" },
    });
    mockPrisma.personalAutonomy.update.mockResolvedValueOnce({
      id: "pa-1",
      autonomyLevel: "notify",
    });

    const { POST } = await import(
      "@/app/api/personal-autonomy/[id]/promote/route"
    );

    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: "notify" }),
    });

    await POST(req as any, { params: Promise.resolve({ id: "pa-1" }) });

    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        type: "system_alert",
        title: expect.stringContaining("notify"),
      }),
    );
  });
});
