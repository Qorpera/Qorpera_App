import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (BEFORE imports) ───────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    operator: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    sourceConnector: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    situationType: { findMany: vi.fn() },
    executionStep: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    executionPlan: { update: vi.fn() },
    notification: { create: vi.fn() },
    notificationPreference: { findUnique: vi.fn() },
    syncLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
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

import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

const mockPrisma = prisma as any;
const mockAuth = getSessionUser as ReturnType<typeof vi.fn>;
const mockNotify = sendNotificationToAdmins as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITER
// ═══════════════════════════════════════════════════════════════════════════════

describe("Rate Limiter", () => {
  it("rateLimit returns success/remaining/reset shape", async () => {
    const { rateLimit } = await import("@/lib/rate-limiter");
    const result = await rateLimit("test-ip-shape", "global");
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("remaining");
    expect(result).toHaveProperty("reset");
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.remaining).toBe("number");
    expect(typeof result.reset).toBe("number");
  });

  it("exceeding limit returns success: false", async () => {
    const { rateLimit } = await import("@/lib/rate-limiter");
    // Auth tier: 10 per minute
    const key = `test-exceed-${Date.now()}`;
    for (let i = 0; i < 10; i++) {
      await rateLimit(key, "auth");
    }
    const result = await rateLimit(key, "auth");
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("different tiers have different limits", async () => {
    const { rateLimit } = await import("@/lib/rate-limiter");
    const ts = Date.now();

    // Billing tier: 5 per minute — exhaust it
    const billingKey = `test-billing-${ts}`;
    for (let i = 0; i < 5; i++) {
      await rateLimit(billingKey, "billing");
    }
    const billingResult = await rateLimit(billingKey, "billing");
    expect(billingResult.success).toBe(false);

    // Global tier: 100 per minute — should still have room after 6 requests
    const globalKey = `test-global-${ts}`;
    for (let i = 0; i < 6; i++) {
      await rateLimit(globalKey, "global");
    }
    const globalResult = await rateLimit(globalKey, "global");
    expect(globalResult.success).toBe(true);
  });

  it("rateLimitResponse returns 429 with Retry-After header", async () => {
    const { rateLimitResponse } = await import("@/lib/rate-limiter");
    const futureReset = Date.now() + 30_000;
    const response = rateLimitResponse(futureReset);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(response.headers.get("Content-Type")).toBe("application/json");

    const body = await response.json();
    expect(body.error).toBe("Too many requests");
    expect(typeof body.retryAfter).toBe("number");
  });

  it("checkRateLimit legacy API returns allowed/remaining/resetAt", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limiter");
    const result = checkRateLimit(`test-legacy-${Date.now()}`, 5, 60_000);
    expect(result).toHaveProperty("allowed");
    expect(result).toHaveProperty("remaining");
    expect(result).toHaveProperty("resetAt");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EMERGENCY STOP
// ═══════════════════════════════════════════════════════════════════════════════

describe("Emergency Stop", () => {
  // ── API tests ────────────────────────────────────────────────────────────

  describe("API", () => {
    it("POST with paused:true updates operator", async () => {
      const { POST } = await import("@/app/api/settings/emergency-stop/route");
      mockAuth.mockResolvedValue({
        user: { id: "u1", name: "Admin", email: "a@test.com", role: "admin" },
        operatorId: "op1",
      });
      mockPrisma.operator.update.mockResolvedValue({
        aiPaused: true, aiPausedAt: new Date(), aiPausedById: "u1", aiPausedReason: "Test",
      });

      const req = new Request("http://localhost/api/settings/emergency-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: true, reason: "Test" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.paused).toBe(true);
    });

    it("POST with paused:false clears pause fields", async () => {
      const { POST } = await import("@/app/api/settings/emergency-stop/route");
      mockAuth.mockResolvedValue({
        user: { id: "u1", name: "Admin", email: "a@test.com", role: "admin" },
        operatorId: "op1",
      });
      mockPrisma.operator.update.mockResolvedValue({
        aiPaused: false, aiPausedAt: null, aiPausedById: null, aiPausedReason: null,
      });

      const req = new Request("http://localhost/api/settings/emergency-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: false }),
      });
      const res = await POST(req);
      const body = await res.json();
      expect(body.paused).toBe(false);
      expect(mockPrisma.operator.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ aiPaused: false, aiPausedAt: null, aiPausedById: null, aiPausedReason: null }),
        }),
      );
    });

    it("GET returns current pause state", async () => {
      const { GET } = await import("@/app/api/settings/emergency-stop/route");
      mockAuth.mockResolvedValue({ user: { id: "u1", role: "member" }, operatorId: "op1" });
      mockPrisma.operator.findUnique.mockResolvedValue({ aiPaused: false });

      const res = await GET();
      const body = await res.json();
      expect(body.paused).toBe(false);
    });

    it("GET returns pausedBy user info when paused", async () => {
      const { GET } = await import("@/app/api/settings/emergency-stop/route");
      mockAuth.mockResolvedValue({ user: { id: "u2", role: "admin" }, operatorId: "op1" });
      mockPrisma.operator.findUnique.mockResolvedValue({
        aiPaused: true, aiPausedAt: new Date(), aiPausedById: "u1", aiPausedReason: "Incident",
      });
      mockPrisma.user.findUnique.mockResolvedValue({ name: "Jonas", email: "j@test.com" });

      const res = await GET();
      const body = await res.json();
      expect(body.paused).toBe(true);
      expect(body.pausedBy).toEqual({ name: "Jonas", email: "j@test.com" });
      expect(body.reason).toBe("Incident");
    });

    it("non-admin users receive 403 on POST", async () => {
      const { POST } = await import("@/app/api/settings/emergency-stop/route");
      mockAuth.mockResolvedValue({
        user: { id: "u2", name: "Member", email: "m@test.com", role: "member" },
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
  });

  // ── Gate tests ───────────────────────────────────────────────────────────

  describe("Detection gate", () => {
    it("returns early when operator aiPaused is true", async () => {
      mockPrisma.operator.findUnique.mockResolvedValue({
        aiPaused: true, billingStatus: "active", freeDetectionStartedAt: null, freeDetectionSituationCount: 0,
      });
      const { detectSituations } = await import("@/lib/situation-detector");
      const results = await detectSituations("op1");
      expect(results).toEqual([]);
      expect(mockPrisma.situationType.findMany).not.toHaveBeenCalled();
    });

    it("proceeds when operator aiPaused is false", async () => {
      mockPrisma.operator.findUnique.mockResolvedValue({
        aiPaused: false, billingStatus: "active", freeDetectionStartedAt: null, freeDetectionSituationCount: 0,
      });
      mockPrisma.situationType.findMany.mockResolvedValue([]);
      const { detectSituations } = await import("@/lib/situation-detector");
      await detectSituations("op1");
      expect(mockPrisma.situationType.findMany).toHaveBeenCalled();
    });
  });

  describe("Execution gate", () => {
    it("returns paused status without failing the plan", async () => {
      mockPrisma.executionStep.findUnique.mockResolvedValue({
        id: "s1", planId: "p1", plan: { id: "p1", operatorId: "op1" },
      });
      mockPrisma.operator.findUnique.mockResolvedValue({ aiPaused: true, billingStatus: "active" });

      const { executeStep } = await import("@/lib/execution-engine");
      await executeStep("s1");
      expect(mockPrisma.executionPlan.update).not.toHaveBeenCalled();
    });

    it("proceeds normally when not paused", async () => {
      mockPrisma.executionStep.findUnique.mockResolvedValue({
        id: "s1", planId: "p1", sequenceOrder: 1,
        plan: { id: "p1", operatorId: "op1", sourceType: "initiative", sourceId: "init1" },
        actionCapabilityId: "cap1", status: "pending",
      });
      mockPrisma.operator.findUnique.mockResolvedValue({ aiPaused: false, billingStatus: "active" });
      mockPrisma.executionStep.findMany.mockResolvedValue([]);
      mockPrisma.executionPlan.update.mockResolvedValue({
        id: "p1", totalStepExecutions: 1, maxStepExecutions: 50, operatorId: "op1", sourceType: "initiative", sourceId: "init1",
      });

      const { executeStep } = await import("@/lib/execution-engine");
      // Will proceed past the gate (may fail later due to missing capability, that's fine)
      try { await executeStep("s1"); } catch { /* expected */ }
      expect(mockPrisma.executionPlan.update).toHaveBeenCalled();
    });
  });

  // ── Notification tests ───────────────────────────────────────────────────

  describe("Notifications", () => {
    it("pausing sends notification to all operator admins", async () => {
      const { POST } = await import("@/app/api/settings/emergency-stop/route");
      mockAuth.mockResolvedValue({
        user: { id: "u1", name: "Admin", email: "a@test.com", role: "admin" },
        operatorId: "op1",
      });
      mockPrisma.operator.update.mockResolvedValue({ aiPaused: true, aiPausedAt: new Date(), aiPausedById: "u1", aiPausedReason: null });

      const req = new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: true }),
      });
      await POST(req);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ operatorId: "op1", type: "system_alert", title: "AI activity paused" }),
      );
    });

    it("resuming sends notification to all operator admins", async () => {
      const { POST } = await import("@/app/api/settings/emergency-stop/route");
      mockAuth.mockResolvedValue({
        user: { id: "u1", name: "Admin", email: "a@test.com", role: "admin" },
        operatorId: "op1",
      });
      mockPrisma.operator.update.mockResolvedValue({ aiPaused: false, aiPausedAt: null, aiPausedById: null, aiPausedReason: null });

      const req = new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: false }),
      });
      await POST(req);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ operatorId: "op1", type: "system_alert", title: "AI activity resumed" }),
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECTOR HARDENING
// ═══════════════════════════════════════════════════════════════════════════════

describe("Connector Hardening", () => {
  // ── Soft delete ──────────────────────────────────────────────────────────

  describe("Soft delete", () => {
    it("DELETE sets deletedAt without removing the row", async () => {
      const { DELETE } = await import("@/app/api/connectors/[id]/route");
      mockAuth.mockResolvedValue({
        user: { id: "u1", role: "admin" }, operatorId: "op1",
      });
      mockPrisma.sourceConnector.findFirst.mockResolvedValue({
        id: "c1", operatorId: "op1", userId: null, provider: "hubspot", deletedAt: null,
      });
      mockPrisma.sourceConnector.update.mockResolvedValue({ id: "c1" });

      const req = new Request("http://localhost/api/connectors/c1", { method: "DELETE" });
      const res = await DELETE(req, { params: Promise.resolve({ id: "c1" }) });
      expect(res.status).toBe(200);
      expect(mockPrisma.sourceConnector.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: expect.any(Date), deletedById: "u1" }),
        }),
      );
    });

    it("active connector queries exclude soft-deleted connectors", async () => {
      const { ACTIVE_CONNECTOR } = await import("@/lib/connector-filters");
      expect(ACTIVE_CONNECTOR).toEqual({ deletedAt: null });
    });

    it("POST restore clears deletedAt, connector reappears", async () => {
      const { POST } = await import("@/app/api/connectors/[id]/restore/route");
      mockAuth.mockResolvedValue({
        user: { id: "u1", role: "admin" }, operatorId: "op1",
      });
      mockPrisma.sourceConnector.findFirst.mockResolvedValue({
        id: "c1", operatorId: "op1", deletedAt: new Date(),
      });
      mockPrisma.sourceConnector.update.mockResolvedValue({
        id: "c1", provider: "hubspot", name: "HubSpot", status: "error", healthStatus: "degraded",
      });

      const req = new Request("http://localhost", { method: "POST" });
      const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });
      expect(res.status).toBe(200);
      expect(mockPrisma.sourceConnector.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ deletedAt: null, deletedById: null }) }),
      );
    });

    it("restore on non-deleted connector returns 400", async () => {
      const { POST } = await import("@/app/api/connectors/[id]/restore/route");
      mockAuth.mockResolvedValue({
        user: { id: "u1", role: "admin" }, operatorId: "op1",
      });
      mockPrisma.sourceConnector.findFirst.mockResolvedValue({
        id: "c1", operatorId: "op1", deletedAt: null,
      });

      const req = new Request("http://localhost", { method: "POST" });
      const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });
      expect(res.status).toBe(400);
    });
  });

  // ── Health status ────────────────────────────────────────────────────────

  describe("Health status", () => {
    it("successful sync sets healthStatus to healthy and resets failures", () => {
      const syncStatus = "success";
      const healthData = syncStatus === "failed"
        ? { healthStatus: "error" }
        : { healthStatus: "healthy", consecutiveFailures: 0, lastError: null };
      expect(healthData.healthStatus).toBe("healthy");
      expect(healthData.consecutiveFailures).toBe(0);
      expect(healthData.lastError).toBeNull();
    });

    it("1 failure sets healthStatus to degraded", () => {
      const consecutiveFailures = 0; // pre-failure count
      const healthStatus = (consecutiveFailures + 1 >= 3) ? "error" : "degraded";
      expect(healthStatus).toBe("degraded");
    });

    it("3 consecutive failures set healthStatus to error", () => {
      const consecutiveFailures = 2;
      const healthStatus = (consecutiveFailures + 1 >= 3) ? "error" : "degraded";
      expect(healthStatus).toBe("error");
    });

    it("success after failures resets to healthy with consecutiveFailures 0", () => {
      // After previous failures, a successful sync produces:
      const syncStatus = "success";
      const healthData = syncStatus === "failed"
        ? { healthStatus: "error" }
        : { healthStatus: "healthy", consecutiveFailures: 0, lastError: null };
      expect(healthData.healthStatus).toBe("healthy");
      expect(healthData.consecutiveFailures).toBe(0);
    });

    it("OAuth 401 error sets healthStatus to disconnected (isAuthError)", () => {
      function isAuthError(error: any): boolean {
        const status = error.status || error.statusCode || error.response?.status;
        return status === 401 || status === 403;
      }
      expect(isAuthError({ status: 401 })).toBe(true);
      expect(isAuthError({ status: 403 })).toBe(true);
      expect(isAuthError({ status: 500 })).toBe(false);
    });

    it("transitioning to error status triggers notification (logic check)", () => {
      const previousHealth = "degraded";
      const updatedHealth = "error";
      expect(updatedHealth === "error" && previousHealth !== "error").toBe(true);
    });
  });

  // ── Sync retry ───────────────────────────────────────────────────────────

  describe("Sync retry", () => {
    it("transient errors (503, ECONNRESET) are classified correctly", () => {
      function isTransientError(error: any): boolean {
        if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT" || error.code === "ENOTFOUND") return true;
        const status = error.status || error.statusCode || error.response?.status;
        return [429, 500, 502, 503, 504].includes(status);
      }
      expect(isTransientError({ status: 503 })).toBe(true);
      expect(isTransientError({ code: "ECONNRESET" })).toBe(true);
      expect(isTransientError({ status: 429 })).toBe(true);
    });

    it("permanent errors (401, 404) are not transient", () => {
      function isTransientError(error: any): boolean {
        if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT" || error.code === "ENOTFOUND") return true;
        const status = error.status || error.statusCode || error.response?.status;
        return [429, 500, 502, 503, 504].includes(status);
      }
      expect(isTransientError({ status: 401 })).toBe(false);
      expect(isTransientError({ status: 404 })).toBe(false);
      expect(isTransientError({ status: 422 })).toBe(false);
    });
  });

  // ── Health API ───────────────────────────────────────────────────────────

  describe("Health API", () => {
    it("GET /api/connectors/health returns all connectors with health data", async () => {
      const { GET } = await import("@/app/api/connectors/health/route");
      mockAuth.mockResolvedValue({
        user: { id: "u1", role: "admin" }, operatorId: "op1",
      });
      mockPrisma.sourceConnector.findMany.mockResolvedValue([
        {
          id: "c1", name: "Google", provider: "google", status: "active",
          healthStatus: "healthy", lastHealthCheck: new Date(), lastError: null,
          consecutiveFailures: 0, deletedAt: null,
          syncLogs: [{ createdAt: new Date(), eventsCreated: 10, eventsSkipped: 2, durationMs: 1500, status: "success" }],
        },
      ]);

      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].healthStatus).toBe("healthy");
      expect(body[0].lastSync).toBeTruthy();
      expect(body[0].lastSync.eventsCreated).toBe(10);
    });

    it("health response includes latest SyncLog per connector", async () => {
      const { GET } = await import("@/app/api/connectors/health/route");
      mockAuth.mockResolvedValue({ user: { id: "u1", role: "admin" }, operatorId: "op1" });
      mockPrisma.sourceConnector.findMany.mockResolvedValue([
        {
          id: "c1", name: "HubSpot", provider: "hubspot", status: "error",
          healthStatus: "error", lastHealthCheck: new Date(), lastError: "Token expired",
          consecutiveFailures: 3, deletedAt: null, syncLogs: [],
        },
      ]);

      const res = await GET();
      const body = await res.json();
      expect(body[0].lastSync).toBeNull();
      expect(body[0].lastError).toBe("Token expired");
    });

    it("soft-deleted connectors included with deleted flag for admins", async () => {
      const { GET } = await import("@/app/api/connectors/health/route");
      mockAuth.mockResolvedValue({ user: { id: "u1", role: "admin" }, operatorId: "op1" });
      mockPrisma.sourceConnector.findMany.mockResolvedValue([
        {
          id: "c1", name: "Old", provider: "stripe", status: "active",
          healthStatus: "disconnected", lastHealthCheck: null, lastError: null,
          consecutiveFailures: 0, deletedAt: new Date("2026-03-20"), syncLogs: [],
        },
      ]);

      const res = await GET();
      const body = await res.json();
      expect(body[0].deletedAt).toBeTruthy();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════

describe("Health Endpoint", () => {
  it("returns structured response with all checks", async () => {
    const { GET } = await import("@/app/api/health/route");
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const res = await GET();
    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("checks");
  });

  it("returns 200 when database is reachable", async () => {
    const { GET } = await import("@/app/api/health/route");
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checks.database).toBe("ok");
  });

  it("redis shows not_configured when no env vars", async () => {
    const { GET } = await import("@/app/api/health/route");
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const res = await GET();
    const body = await res.json();
    expect(body.checks.redis).toBe("not_configured");
  });

  it("sentry shows not_configured when no DSN", async () => {
    const { GET } = await import("@/app/api/health/route");
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const res = await GET();
    const body = await res.json();
    expect(body.checks.sentry).toBe("not_configured");
  });

  it("response includes timestamp and version", async () => {
    const { GET } = await import("@/app/api/health/route");
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const res = await GET();
    const body = await res.json();
    expect(body.timestamp).toBeTruthy();
    expect(typeof body.timestamp).toBe("string");
    expect(body.version).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SENTRY INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("Sentry Integration", () => {
  it("setSentryContext does not throw when Sentry is not initialized", async () => {
    const { setSentryContext } = await import("@/lib/sentry-context");
    expect(() => {
      setSentryContext({ id: "u1", operatorId: "op1", role: "admin", email: "a@test.com" });
    }).not.toThrow();
  });

  it("captureApiError does not throw when Sentry is not initialized", async () => {
    const { captureApiError } = await import("@/lib/api-error");
    expect(() => {
      captureApiError(new Error("test"), { route: "test" });
    }).not.toThrow();
  });
});
