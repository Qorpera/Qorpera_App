import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    executionPlan: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    situation: { findFirst: vi.fn(), findUnique: vi.fn() },
    initiative: { findFirst: vi.fn(), findUnique: vi.fn() },
    propertyValue: { findMany: vi.fn() },
    workStreamItem: { findMany: vi.fn() },
    priorityOverride: { delete: vi.fn() },
    followUp: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/ai-provider", () => ({
  callLLM: vi.fn(),
}));

import { prisma } from "@/lib/db";
import {
  computePriorityScores,
  computeSinglePlanPriority,
  computePlanPriorityWithBreakdown,
} from "@/lib/prioritization-engine";

const mockPrisma = prisma as unknown as {
  executionPlan: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  situation: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  initiative: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  propertyValue: { findMany: ReturnType<typeof vi.fn> };
  workStreamItem: { findMany: ReturnType<typeof vi.fn> };
  priorityOverride: { delete: ReturnType<typeof vi.fn> };
  followUp: { findMany: ReturnType<typeof vi.fn> };
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan1",
    operatorId: "op1",
    sourceType: "situation",
    sourceId: "sit1",
    status: "pending",
    currentStepOrder: 1,
    createdAt: new Date(),
    priorityOverride: null,
    steps: [{ id: "step1" }],
    ...overrides,
  };
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default mocks: empty / neutral values so each test only overrides what it needs
  mockPrisma.executionPlan.update.mockResolvedValue({});
  mockPrisma.situation.findFirst.mockResolvedValue(null);
  mockPrisma.initiative.findFirst.mockResolvedValue(null);
  mockPrisma.propertyValue.findMany.mockResolvedValue([]);
  mockPrisma.workStreamItem.findMany.mockResolvedValue([]);
  mockPrisma.followUp.findMany.mockResolvedValue([]);
  mockPrisma.priorityOverride.delete.mockResolvedValue({});
});

// ── 1. Basic scoring with urgency ────────────────────────────────────────────

describe("basic scoring", () => {
  it("computes score > 0 and applies urgency from SituationType detectionLogic", async () => {
    mockPrisma.executionPlan.findUnique.mockResolvedValue(makePlan());
    mockPrisma.situation.findFirst.mockResolvedValue({
      triggerEntityId: null,
      situationType: {
        detectionLogic: JSON.stringify({ urgency: "high" }),
      },
    });

    const result = await computePlanPriorityWithBreakdown("plan1");

    expect(result.score).toBeGreaterThan(0);
    // urgency "high" maps to 60
    expect(result.breakdown.urgency).toBe(60);
  });
});

// ── 2. Impact from monetary value ────────────────────────────────────────────

describe("impact from monetary value", () => {
  it("uses log scale for monetary property values", async () => {
    mockPrisma.executionPlan.findUnique.mockResolvedValue(makePlan());
    mockPrisma.situation.findFirst.mockResolvedValue({
      triggerEntityId: "entity1",
      situationType: {
        detectionLogic: JSON.stringify({ urgency: "medium" }),
      },
    });
    mockPrisma.propertyValue.findMany.mockResolvedValue([
      {
        value: "50000",
        property: { slug: "amount", name: "Amount" },
      },
    ]);

    const result = await computePlanPriorityWithBreakdown("plan1");

    // impact = min(100, 20 * log10(50001)) ≈ 20 * 4.699 ≈ 93.98
    const expectedImpact = Math.min(100, 20 * Math.log10(50001));
    expect(result.breakdown.impact).toBeCloseTo(expectedImpact, 1);
  });
});

// ── 3. Impact from goal priority ─────────────────────────────────────────────

describe("impact from goal priority", () => {
  it("computes impact = priority * 20 for initiative plans", async () => {
    mockPrisma.executionPlan.findUnique.mockResolvedValue(
      makePlan({ sourceType: "initiative", sourceId: "init1" }),
    );
    mockPrisma.initiative.findFirst.mockResolvedValue({
      goal: { priority: 5 },
    });

    const result = await computePlanPriorityWithBreakdown("plan1");

    // priority 5 * 20 = 100
    expect(result.breakdown.impact).toBe(100);
  });
});

// ── 4. Staleness ─────────────────────────────────────────────────────────────

describe("staleness", () => {
  it("computes staleness based on days since creation", async () => {
    mockPrisma.executionPlan.findUnique.mockResolvedValue(
      makePlan({ createdAt: daysAgo(10), status: "approved" }),
    );

    const result = await computePlanPriorityWithBreakdown("plan1");

    // staleness = min(100, 10 * 5) = 50
    expect(result.breakdown.staleness).toBe(50);
  });
});

// ── 5. Staleness boost for pending > 3 days ──────────────────────────────────

describe("staleness boost for pending > 3 days", () => {
  it("adds 20-point boost when plan is pending and older than 3 days", async () => {
    mockPrisma.executionPlan.findUnique.mockResolvedValue(
      makePlan({ createdAt: daysAgo(4), status: "pending" }),
    );

    const result = await computePlanPriorityWithBreakdown("plan1");

    // base staleness = 4 * 5 = 20, + 20 boost = 40
    expect(result.breakdown.staleness).toBe(40);
  });
});

// ── 6. Dependencies — WorkStream ─────────────────────────────────────────────

describe("dependencies via WorkStream", () => {
  it("calculates dependency score based on active sibling items", async () => {
    mockPrisma.executionPlan.findUnique.mockResolvedValue(
      makePlan({ currentStepOrder: 2 }),
    );

    // First call: find workstream items for this plan's source
    // Second call: find sibling items in same workstream
    mockPrisma.workStreamItem.findMany
      .mockResolvedValueOnce([{ workStreamId: "ws1" }]) // plan's workstream
      .mockResolvedValueOnce([
        { itemType: "situation", itemId: "sit-a" },
        { itemType: "situation", itemId: "sit-b" },
        { itemType: "initiative", itemId: "init-a" },
      ]); // siblings

    // 2 situations are pending (non-terminal), 1 initiative is completed (terminal)
    mockPrisma.situation.findUnique
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "pending" });
    mockPrisma.initiative.findUnique.mockResolvedValueOnce({
      status: "completed",
    });

    const result = await computePlanPriorityWithBreakdown("plan1");

    // blockedCount = 2 → dependencies = min(100, 30 + 2*15) = 60
    // No gateway bonus (currentStepOrder = 2)
    expect(result.breakdown.dependencies).toBe(60);
  });
});

// ── 7. Pin override ──────────────────────────────────────────────────────────

describe("pin override", () => {
  it("returns score = 100 for pinned plans", async () => {
    mockPrisma.executionPlan.findUnique.mockResolvedValue(
      makePlan({
        priorityOverride: { id: "ov1", overrideType: "pin", snoozeUntil: null },
      }),
    );

    const result = await computePlanPriorityWithBreakdown("plan1");

    expect(result.score).toBe(100);
    expect(result.breakdown).toEqual({
      urgency: 0,
      impact: 0,
      dependencies: 0,
      staleness: 0,
    });
  });
});

// ── 8. Snooze active ─────────────────────────────────────────────────────────

describe("snooze active", () => {
  it("returns score = 0 for snoozed plans with future snoozeUntil", async () => {
    const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    mockPrisma.executionPlan.findUnique.mockResolvedValue(
      makePlan({
        priorityOverride: {
          id: "ov1",
          overrideType: "snooze",
          snoozeUntil: futureDate,
        },
      }),
    );

    const result = await computePlanPriorityWithBreakdown("plan1");

    expect(result.score).toBe(0);
    expect(result.breakdown).toEqual({
      urgency: 0,
      impact: 0,
      dependencies: 0,
      staleness: 0,
    });
  });
});

// ── 9. Snooze expired ────────────────────────────────────────────────────────

describe("snooze expired", () => {
  it("deletes override and computes score normally when snooze has expired", async () => {
    const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    mockPrisma.executionPlan.findUnique.mockResolvedValue(
      makePlan({
        priorityOverride: {
          id: "ov-expired",
          overrideType: "snooze",
          snoozeUntil: pastDate,
        },
      }),
    );

    const result = await computePlanPriorityWithBreakdown("plan1");

    // Should have deleted the expired override
    expect(mockPrisma.priorityOverride.delete).toHaveBeenCalledWith({
      where: { id: "ov-expired" },
    });

    // Score should be computed normally (> 0)
    expect(result.score).toBeGreaterThan(0);
  });
});

// ── 10. Batch scoring ────────────────────────────────────────────────────────

describe("batch scoring", () => {
  it("computes and saves scores for all open plans", async () => {
    const planIds = ["p1", "p2", "p3", "p4", "p5"];
    mockPrisma.executionPlan.findMany.mockResolvedValue(
      planIds.map((id) => ({ id })),
    );

    // Each plan will trigger findUnique
    for (const id of planIds) {
      mockPrisma.executionPlan.findUnique.mockResolvedValueOnce(
        makePlan({ id }),
      );
    }

    const result = await computePriorityScores("op1");

    expect(result.updated).toBe(5);
    expect(mockPrisma.executionPlan.update).toHaveBeenCalledTimes(5);

    // Verify findMany filters by operatorId and non-terminal statuses
    expect(mockPrisma.executionPlan.findMany).toHaveBeenCalledWith({
      where: {
        operatorId: "op1",
        status: { in: ["pending", "approved", "executing"] },
      },
      select: { id: true },
    });
  });
});

// ── 11. Skips completed plans ────────────────────────────────────────────────

describe("skips completed plans", () => {
  it("does not include completed plans in batch scoring", async () => {
    // Only return non-terminal plans from the query
    mockPrisma.executionPlan.findMany.mockResolvedValue([
      { id: "p-active" },
    ]);

    mockPrisma.executionPlan.findUnique.mockResolvedValueOnce(
      makePlan({ id: "p-active" }),
    );

    const result = await computePriorityScores("op1");

    expect(result.updated).toBe(1);
    // Verify the where clause excludes completed/rejected
    expect(mockPrisma.executionPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["pending", "approved", "executing"] },
        }),
      }),
    );
  });
});

// ── 12. FollowUp urgency boost ───────────────────────────────────────────────

describe("FollowUp urgency boost", () => {
  it("boosts urgency when a FollowUp trigger is imminent", async () => {
    mockPrisma.executionPlan.findUnique.mockResolvedValue(
      makePlan({ steps: [{ id: "step1" }, { id: "step2" }] }),
    );
    mockPrisma.situation.findFirst.mockResolvedValue({
      triggerEntityId: null,
      situationType: {
        detectionLogic: JSON.stringify({ urgency: "low" }),
      },
    });

    // FollowUp triggering in 1 day
    const triggerAt = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
    mockPrisma.followUp.findMany.mockResolvedValue([
      { triggerAt },
    ]);

    const result = await computePlanPriorityWithBreakdown("plan1");

    // Base urgency for "low" = 10
    // Boost = min(40, 80 * exp(-1/2)) ≈ min(40, 80 * 0.6065) ≈ min(40, 48.52) = 40
    // Total urgency = min(100, 10 + 40) = 50
    // (approximate due to timing)
    expect(result.breakdown.urgency).toBeGreaterThan(10);
    expect(result.breakdown.urgency).toBeLessThanOrEqual(100);

    // The boost from a 1-day-out followup should push urgency close to 50
    expect(result.breakdown.urgency).toBeGreaterThanOrEqual(45);
  });
});
