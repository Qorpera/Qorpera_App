import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (BEFORE imports) ───────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    operator: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    situationType: { findMany: vi.fn() },
    executionStep: { findUnique: vi.fn(), findMany: vi.fn() },
    executionPlan: { update: vi.fn() },
    notification: { create: vi.fn() },
    notificationPreference: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/notification-dispatch", () => ({
  sendNotificationToAdmins: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/billing-gate", () => ({
  checkDetectionCap: vi.fn().mockReturnValue({ allowed: true }),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { GET, POST } from "@/app/api/settings/emergency-stop/route";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

const mockPrisma = prisma as any;
const mockGetSessionUser = getSessionUser as ReturnType<typeof vi.fn>;
const mockSendNotificationToAdmins = sendNotificationToAdmins as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ── API Endpoint Tests ───────────────────────────────────────────────────────

describe("POST /api/settings/emergency-stop", () => {
  it("pauses AI and sets all fields correctly", async () => {
    mockGetSessionUser.mockResolvedValue({
      user: { id: "u1", name: "Jonas", email: "jonas@qorpera.com", role: "admin" },
      operatorId: "op1",
    });

    mockPrisma.operator.update.mockResolvedValue({
      aiPaused: true,
      aiPausedAt: new Date("2026-03-21T10:00:00Z"),
      aiPausedById: "u1",
      aiPausedReason: "Runaway agent",
    });

    const req = new Request("http://localhost/api/settings/emergency-stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: true, reason: "Runaway agent" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.paused).toBe(true);
    expect(body.reason).toBe("Runaway agent");

    // Verify operator update was called with correct data
    expect(mockPrisma.operator.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "op1" },
        data: expect.objectContaining({
          aiPaused: true,
          aiPausedById: "u1",
          aiPausedReason: "Runaway agent",
        }),
      }),
    );
  });

  it("resumes AI and clears all pause fields", async () => {
    mockGetSessionUser.mockResolvedValue({
      user: { id: "u1", name: "Jonas", email: "jonas@qorpera.com", role: "admin" },
      operatorId: "op1",
    });

    mockPrisma.operator.update.mockResolvedValue({
      aiPaused: false,
      aiPausedAt: null,
      aiPausedById: null,
      aiPausedReason: null,
    });

    const req = new Request("http://localhost/api/settings/emergency-stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: false }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.paused).toBe(false);

    expect(mockPrisma.operator.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiPaused: false,
          aiPausedAt: null,
          aiPausedById: null,
          aiPausedReason: null,
        }),
      }),
    );
  });

  it("returns 403 for non-admin users", async () => {
    mockGetSessionUser.mockResolvedValue({
      user: { id: "u2", name: "Member", email: "member@test.com", role: "member" },
      operatorId: "op1",
    });

    const req = new Request("http://localhost/api/settings/emergency-stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: true }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("notifies admins on pause", async () => {
    mockGetSessionUser.mockResolvedValue({
      user: { id: "u1", name: "Jonas", email: "jonas@qorpera.com", role: "admin" },
      operatorId: "op1",
    });

    mockPrisma.operator.update.mockResolvedValue({
      aiPaused: true,
      aiPausedAt: new Date(),
      aiPausedById: "u1",
      aiPausedReason: null,
    });

    const req = new Request("http://localhost/api/settings/emergency-stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: true }),
    });

    await POST(req);

    // Wait for fire-and-forget notification
    await new Promise((r) => setTimeout(r, 10));

    expect(mockSendNotificationToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: "op1",
        type: "system_alert",
        title: "AI activity paused",
      }),
    );
  });

  it("notifies admins on resume", async () => {
    mockGetSessionUser.mockResolvedValue({
      user: { id: "u1", name: "Jonas", email: "jonas@qorpera.com", role: "admin" },
      operatorId: "op1",
    });

    mockPrisma.operator.update.mockResolvedValue({
      aiPaused: false,
      aiPausedAt: null,
      aiPausedById: null,
      aiPausedReason: null,
    });

    const req = new Request("http://localhost/api/settings/emergency-stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: false }),
    });

    await POST(req);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockSendNotificationToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: "op1",
        type: "system_alert",
        title: "AI activity resumed",
      }),
    );
  });
});

describe("GET /api/settings/emergency-stop", () => {
  it("returns paused: false when not paused", async () => {
    mockGetSessionUser.mockResolvedValue({
      user: { id: "u1", role: "member" },
      operatorId: "op1",
    });

    mockPrisma.operator.findUnique.mockResolvedValue({
      aiPaused: false,
      aiPausedAt: null,
      aiPausedById: null,
      aiPausedReason: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paused).toBe(false);
  });

  it("returns full state when paused", async () => {
    mockGetSessionUser.mockResolvedValue({
      user: { id: "u2", role: "admin" },
      operatorId: "op1",
    });

    mockPrisma.operator.findUnique.mockResolvedValue({
      aiPaused: true,
      aiPausedAt: new Date("2026-03-21T10:00:00Z"),
      aiPausedById: "u1",
      aiPausedReason: "Testing",
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      name: "Jonas",
      email: "jonas@qorpera.com",
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paused).toBe(true);
    expect(body.pausedBy).toEqual({ name: "Jonas", email: "jonas@qorpera.com" });
    expect(body.reason).toBe("Testing");
  });
});

// ── Detection Gate Test ──────────────────────────────────────────────────────

describe("Detection gate", () => {
  it("skips detection when operator AI is paused", async () => {
    mockPrisma.operator.findUnique.mockResolvedValue({
      aiPaused: true,
      billingStatus: "active",
      freeDetectionStartedAt: null,
      freeDetectionSituationCount: 0,
    });

    const { detectSituations } = await import("@/lib/situation-detector");
    const results = await detectSituations("op1");

    expect(results).toEqual([]);
    // Should NOT have queried situation types (early return)
    expect(mockPrisma.situationType.findMany).not.toHaveBeenCalled();
  });

  it("proceeds with detection when AI is not paused", async () => {
    mockPrisma.operator.findUnique.mockResolvedValue({
      aiPaused: false,
      billingStatus: "active",
      freeDetectionStartedAt: null,
      freeDetectionSituationCount: 0,
    });

    mockPrisma.situationType.findMany.mockResolvedValue([]);

    const { detectSituations } = await import("@/lib/situation-detector");
    const results = await detectSituations("op1");

    expect(results).toEqual([]);
    // Should have proceeded to query situation types
    expect(mockPrisma.situationType.findMany).toHaveBeenCalled();
  });
});

// ── Execution Gate Test ──────────────────────────────────────────────────────

describe("Execution gate", () => {
  it("skips step execution when AI is paused without failing the plan", async () => {
    mockPrisma.executionStep.findUnique.mockResolvedValue({
      id: "step1",
      planId: "plan1",
      plan: { id: "plan1", operatorId: "op1" },
    });

    mockPrisma.operator.findUnique.mockResolvedValue({
      aiPaused: true,
      billingStatus: "active",
    });

    const { executeStep } = await import("@/lib/execution-engine");
    await executeStep("step1");

    // Should NOT have incremented step counter (early return)
    expect(mockPrisma.executionPlan.update).not.toHaveBeenCalled();
    // Plan should NOT be marked as failed
    expect(mockPrisma.executionStep.findMany).not.toHaveBeenCalled();
  });
});
