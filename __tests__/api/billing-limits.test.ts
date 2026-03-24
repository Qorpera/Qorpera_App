vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));
vi.mock("@/lib/notification-dispatch", () => ({
  sendNotificationToAdmins: vi.fn().mockResolvedValue(undefined),
}));

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { GET, PATCH } from "@/app/api/billing/limits/route";
import { NextRequest } from "next/server";

const mockAuth = getSessionUser as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  operator: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  situation: { aggregate: ReturnType<typeof vi.fn> };
  copilotMessage: { aggregate: ReturnType<typeof vi.fn> };
  appSetting: { findMany: ReturnType<typeof vi.fn> };
};

const baseOperator = {
  id: "op1",
  billingStatus: "active",
  monthlyBudgetCents: 50000,
  budgetAlertThresholds: [80, 100],
  budgetHardStop: false,
  budgetPeriodStart: new Date("2026-03-01"),
  budgetAlertsSentThisPeriod: [],
  freeCopilotBudgetCents: 500,
  freeCopilotUsedCents: 0,
  freeDetectionStartedAt: null,
  freeDetectionSituationCount: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({
    user: { id: "u1", role: "admin" },
    operatorId: "op1",
  });
  mockPrisma.operator = {
    findUnique: vi.fn().mockResolvedValue(baseOperator),
    update: vi.fn().mockResolvedValue({}),
  };
  mockPrisma.situation = {
    aggregate: vi.fn().mockResolvedValue({ _sum: { billedCents: 12340 } }),
  };
  mockPrisma.copilotMessage = {
    aggregate: vi.fn().mockResolvedValue({ _sum: { apiCostCents: 0 } }),
  };
  mockPrisma.appSetting = {
    findMany: vi.fn().mockResolvedValue([]),
  };
});

// ── GET /api/billing/limits ─────────────────────────────────────────────────

describe("GET /api/billing/limits", () => {
  it("returns correct budget structure", async () => {
    const res = await GET();
    const data = await res.json();

    expect(data.budget).toBeDefined();
    expect(data.budget.monthlyBudgetCents).toBe(50000);
    expect(data.budget.budgetAlertThresholds).toEqual([80, 100]);
    expect(data.budget.budgetHardStop).toBe(false);
    expect(data.budget.currentSpendCents).toBe(12340);
    expect(typeof data.budget.percentUsed).toBe("number");
  });

  it("returns rateLimits with defaults", async () => {
    const res = await GET();
    const data = await res.json();

    expect(data.rateLimits).toEqual({
      copilotPerMinute: 30,
      concurrentExecutionPlans: 10,
      detectionSweepIntervalMinutes: 60,
    });
  });

  it("freeTier is null for active operator", async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.freeTier).toBeNull();
  });

  it("includes freeTier for free operator", async () => {
    mockPrisma.operator.findUnique.mockResolvedValue({
      ...baseOperator,
      billingStatus: "free",
      freeCopilotUsedCents: 100,
      freeDetectionSituationCount: 5,
    });

    const res = await GET();
    const data = await res.json();

    expect(data.freeTier).toBeDefined();
    expect(data.freeTier.copilotBudgetCents).toBe(500);
    expect(data.freeTier.copilotUsedCents).toBe(100);
    expect(data.freeTier.detectionSituationCount).toBe(5);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

// ── PATCH /api/billing/limits ───────────────────────────────────────────────

describe("PATCH /api/billing/limits", () => {
  function makePatchReq(body: unknown) {
    return new NextRequest("http://localhost/api/billing/limits", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  it("updates budget fields and resets alerts", async () => {
    const req = makePatchReq({
      monthlyBudgetCents: 80000,
      budgetAlertThresholds: [50, 90],
      budgetHardStop: true,
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);

    expect(mockPrisma.operator.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "op1" },
        data: expect.objectContaining({
          monthlyBudgetCents: 80000,
          budgetAlertThresholds: [50, 90],
          budgetHardStop: true,
          budgetAlertsSentThisPeriod: [],
        }),
      }),
    );
  });

  it("rejects negative monthlyBudgetCents", async () => {
    const req = makePatchReq({ monthlyBudgetCents: -100 });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("rejects non-integer monthlyBudgetCents", async () => {
    const req = makePatchReq({ monthlyBudgetCents: 99.5 });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("allows null monthlyBudgetCents (removes budget)", async () => {
    const req = makePatchReq({ monthlyBudgetCents: null });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
  });

  it("rejects thresholds outside 1-100", async () => {
    const req = makePatchReq({ budgetAlertThresholds: [0, 50] });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("rejects unsorted thresholds", async () => {
    const req = makePatchReq({ budgetAlertThresholds: [90, 50] });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("rejects more than 5 thresholds", async () => {
    const req = makePatchReq({ budgetAlertThresholds: [10, 20, 30, 40, 50, 60] });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("accepts empty thresholds array", async () => {
    const req = makePatchReq({ budgetAlertThresholds: [] });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
  });

  it("sets budgetPeriodStart on first budget setup", async () => {
    mockPrisma.operator.findUnique
      .mockResolvedValueOnce({ budgetPeriodStart: null }) // period check in PATCH
      .mockResolvedValueOnce(baseOperator);               // GET after update

    const req = makePatchReq({ monthlyBudgetCents: 50000 });
    await PATCH(req);

    expect(mockPrisma.operator.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          budgetPeriodStart: expect.any(Date),
        }),
      }),
    );
  });

  it("rejects non-admin users", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", role: "member" },
      operatorId: "op1",
    });
    const req = makePatchReq({ monthlyBudgetCents: 50000 });
    const res = await PATCH(req);
    expect(res.status).toBe(403);
  });
});
