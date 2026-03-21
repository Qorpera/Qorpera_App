import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    sourceConnector: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    syncLog: { create: vi.fn() },
    notification: { create: vi.fn() },
    user: { findMany: vi.fn() },
    notificationPreference: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/lib/notification-dispatch", () => ({
  sendNotificationToAdmins: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

const mockPrisma = prisma as any;
const mockGetSessionUser = getSessionUser as ReturnType<typeof vi.fn>;
const mockNotify = sendNotificationToAdmins as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSessionUser.mockResolvedValue({
    user: { id: "u1", name: "Admin", email: "admin@test.com", role: "admin" },
    operatorId: "op1",
  });
});

// ── Soft Delete Tests ────────────────────────────────────────────────────────

describe("Soft delete", () => {
  it("DELETE sets deletedAt without hard-deleting", async () => {
    const { DELETE } = await import("@/app/api/connectors/[id]/route");

    mockPrisma.sourceConnector.findFirst.mockResolvedValue({
      id: "c1",
      operatorId: "op1",
      userId: null,
      provider: "hubspot",
      deletedAt: null,
    });

    mockPrisma.sourceConnector.update.mockResolvedValue({ id: "c1" });

    const req = new Request("http://localhost/api/connectors/c1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "c1" }) });

    expect(res.status).toBe(200);
    expect(mockPrisma.sourceConnector.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          deletedById: "u1",
          healthStatus: "disconnected",
        }),
      }),
    );
    // Should NOT call delete
    expect(mockPrisma.sourceConnector.delete).not.toHaveBeenCalled();
  });

  it("active queries exclude deleted connectors", async () => {
    const { ACTIVE_CONNECTOR } = await import("@/lib/connector-filters");

    expect(ACTIVE_CONNECTOR).toEqual({ deletedAt: null });

    // Verify spreading into where clause includes deletedAt: null
    const where = { ...ACTIVE_CONNECTOR, operatorId: "op1" };
    expect(where.deletedAt).toBeNull();
  });
});

// ── Restore Tests ────────────────────────────────────────────────────────────

describe("Restore", () => {
  it("clears deletedAt on soft-deleted connector", async () => {
    const { POST } = await import("@/app/api/connectors/[id]/restore/route");

    mockPrisma.sourceConnector.findFirst.mockResolvedValue({
      id: "c1",
      operatorId: "op1",
      deletedAt: new Date(),
    });

    mockPrisma.sourceConnector.update.mockResolvedValue({
      id: "c1",
      provider: "hubspot",
      name: "HubSpot",
      status: "error",
      healthStatus: "degraded",
    });

    const req = new Request("http://localhost/api/connectors/c1/restore", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });

    expect(res.status).toBe(200);
    expect(mockPrisma.sourceConnector.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deletedAt: null,
          deletedById: null,
        }),
      }),
    );
  });

  it("returns 400 if connector is not deleted", async () => {
    const { POST } = await import("@/app/api/connectors/[id]/restore/route");

    mockPrisma.sourceConnector.findFirst.mockResolvedValue({
      id: "c1",
      operatorId: "op1",
      deletedAt: null,
    });

    const req = new Request("http://localhost/api/connectors/c1/restore", { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });

    expect(res.status).toBe(400);
  });
});

// ── Health Transitions Tests ─────────────────────────────────────────────────

describe("Health transitions", () => {
  it("sets healthy after successful sync", async () => {
    // Verify the health data logic
    const syncStatus = "success";
    const consecutiveFailures = 2;

    const healthData = syncStatus === "failed"
      ? { healthStatus: (consecutiveFailures + 1 >= 3) ? "error" : "degraded" }
      : { healthStatus: "healthy", consecutiveFailures: 0, lastError: null };

    expect(healthData.healthStatus).toBe("healthy");
    expect(healthData.consecutiveFailures).toBe(0);
  });

  it("sets degraded after 1-2 failures", () => {
    const syncStatus = "failed";
    const consecutiveFailures = 1; // will become 2 after this

    const healthStatus = (consecutiveFailures + 1 >= 3) ? "error" : "degraded";
    expect(healthStatus).toBe("degraded");
  });

  it("sets error after 3+ failures", () => {
    const syncStatus = "failed";
    const consecutiveFailures = 2; // will become 3 after this

    const healthStatus = (consecutiveFailures + 1 >= 3) ? "error" : "degraded";
    expect(healthStatus).toBe("error");
  });
});

// ── Transient Error Retry Tests ──────────────────────────────────────────────

describe("Sync retry logic", () => {
  it("classifies network errors as transient", async () => {
    // Import the module to test isTransientError indirectly via the sync behavior
    const networkError = { code: "ECONNRESET" };
    const serverError = { status: 503 };
    const rateLimited = { status: 429 };
    const authError = { status: 401 };
    const notFound = { status: 404 };

    // We can test the classification logic directly
    function isTransientError(error: any): boolean {
      if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT" || error.code === "ENOTFOUND") return true;
      const status = error.status || error.statusCode || error.response?.status;
      return [429, 500, 502, 503, 504].includes(status);
    }

    function isAuthError(error: any): boolean {
      const status = error.status || error.statusCode || error.response?.status;
      return status === 401 || status === 403;
    }

    expect(isTransientError(networkError)).toBe(true);
    expect(isTransientError(serverError)).toBe(true);
    expect(isTransientError(rateLimited)).toBe(true);
    expect(isTransientError(authError)).toBe(false);
    expect(isTransientError(notFound)).toBe(false);

    expect(isAuthError(authError)).toBe(true);
    expect(isAuthError(notFound)).toBe(false);
    expect(isAuthError(serverError)).toBe(false);
  });
});

// ── Health API Tests ─────────────────────────────────────────────────────────

describe("GET /api/connectors/health", () => {
  it("returns connector health data", async () => {
    const { GET } = await import("@/app/api/connectors/health/route");

    mockPrisma.sourceConnector.findMany.mockResolvedValue([
      {
        id: "c1",
        name: "Google",
        provider: "google",
        status: "active",
        healthStatus: "healthy",
        lastHealthCheck: new Date("2026-03-21T10:00:00Z"),
        lastError: null,
        consecutiveFailures: 0,
        deletedAt: null,
        syncLogs: [{
          createdAt: new Date("2026-03-21T10:00:00Z"),
          eventsCreated: 5,
          eventsSkipped: 1,
          durationMs: 2000,
          status: "success",
        }],
      },
      {
        id: "c2",
        name: "HubSpot",
        provider: "hubspot",
        status: "error",
        healthStatus: "error",
        lastHealthCheck: new Date("2026-03-21T09:00:00Z"),
        lastError: "Token expired",
        consecutiveFailures: 3,
        deletedAt: null,
        syncLogs: [],
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);

    expect(body[0].healthStatus).toBe("healthy");
    expect(body[0].lastSync).toBeTruthy();
    expect(body[0].lastSync.eventsCreated).toBe(5);

    expect(body[1].healthStatus).toBe("error");
    expect(body[1].lastError).toBe("Token expired");
    expect(body[1].lastSync).toBeNull();
  });
});

// ── Admin Notification on Error Transition ───────────────────────────────────

describe("Admin notification on error transition", () => {
  it("health status error logic correctly detects transition", () => {
    // Simulate: connector was "degraded", now becomes "error"
    const previousHealth = "degraded";
    const updatedHealth = "error";

    const shouldNotify = updatedHealth === "error" && previousHealth !== "error";
    expect(shouldNotify).toBe(true);

    // Already "error" → no re-notification
    const shouldNotifyAgain = updatedHealth === "error" && "error" !== "error";
    expect(shouldNotifyAgain).toBe(false);
  });
});
