import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    entity: {
      findFirst: vi.fn(),
    },
    goal: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/notification-dispatch", () => ({
  sendNotificationToAdmins: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/db";
import {
  normalizeCompanyModel,
  createGoalsFromModel,
  type CompanyModel,
} from "@/lib/onboarding-intelligence/synthesis";

const mockPrisma = prisma as unknown as {
  entity: { findFirst: ReturnType<typeof vi.fn> };
  goal: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};

function makeBaseModel(overrides: Partial<CompanyModel> = {}): CompanyModel {
  return {
    departments: [{ name: "Sales", description: "Sales team", confidence: "high" }],
    people: [],
    crossFunctionalPeople: [],
    processes: [],
    keyRelationships: [],
    financialSnapshot: { currency: "DKK", revenueTrend: "up", overdueInvoiceCount: 0, dataCompleteness: "high" },
    situationTypeRecommendations: [],
    strategicGoals: [],
    uncertaintyLog: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── normalizeCompanyModel ────────────────────────────────────────────────────

describe("normalizeCompanyModel — strategicGoals", () => {
  it("normalizes strategicGoals when present", () => {
    const raw = {
      departments: [],
      strategicGoals: [
        {
          title: "Grow revenue 30%",
          description: "Increase annual revenue by 30%",
          scope: "company",
          priority: 1,
          source: "Annual Plan 2026",
          confidence: "high",
          measurableTarget: "30% YoY growth",
        },
      ],
    };
    const result = normalizeCompanyModel(raw as Record<string, unknown>);
    expect(result.strategicGoals).toHaveLength(1);
    expect(result.strategicGoals[0].title).toBe("Grow revenue 30%");
    expect(result.strategicGoals[0].priority).toBe(1);
    expect(result.strategicGoals[0].confidence).toBe("high");
    expect(result.strategicGoals[0].scope).toBe("company");
  });

  it("returns empty array when strategicGoals is missing", () => {
    const raw = { departments: [] };
    const result = normalizeCompanyModel(raw as Record<string, unknown>);
    expect(result.strategicGoals).toEqual([]);
  });

  it("returns empty array when strategicGoals is not an array", () => {
    const raw = { departments: [], strategicGoals: "invalid" };
    const result = normalizeCompanyModel(raw as Record<string, unknown>);
    expect(result.strategicGoals).toEqual([]);
  });

  it("clamps invalid priority to 3", () => {
    const raw = {
      departments: [],
      strategicGoals: [
        { title: "A", description: "B", scope: "company", priority: 99, source: "x", confidence: "high" },
      ],
    };
    const result = normalizeCompanyModel(raw as Record<string, unknown>);
    expect(result.strategicGoals[0].priority).toBe(3);
  });

  it("defaults unknown confidence to medium", () => {
    const raw = {
      departments: [],
      strategicGoals: [
        { title: "A", description: "B", scope: "company", priority: 2, source: "x", confidence: "very_high" },
      ],
    };
    const result = normalizeCompanyModel(raw as Record<string, unknown>);
    expect(result.strategicGoals[0].confidence).toBe("medium");
  });
});

// ── createGoalsFromModel ─────────────────────────────────────────────────────

describe("createGoalsFromModel", () => {
  it("creates goals with correct department linkage", async () => {
    mockPrisma.entity.findFirst.mockResolvedValue({ id: "dept-sales-001" });
    mockPrisma.goal.findFirst.mockResolvedValue(null); // no dedup hit
    mockPrisma.goal.create.mockResolvedValue({ id: "goal-001" });

    const model = makeBaseModel({
      strategicGoals: [
        {
          title: "Close 10 enterprise deals",
          description: "Sign 10 enterprise-tier contracts in H2",
          scope: "department",
          department: "Sales",
          measurableTarget: "10 enterprise deals",
          deadline: "2026-12-31",
          priority: 2,
          source: "Board Deck Q1 2026",
          confidence: "high",
        },
      ],
    });

    await createGoalsFromModel("op-1", model);

    expect(mockPrisma.goal.create).toHaveBeenCalledOnce();
    const data = mockPrisma.goal.create.mock.calls[0][0].data;
    expect(data.operatorId).toBe("op-1");
    expect(data.departmentId).toBe("dept-sales-001");
    expect(data.title).toBe("Close 10 enterprise deals");
    expect(data.measurableTarget).toBe("10 enterprise deals");
    expect(data.priority).toBe(2);
    expect(data.source).toBe("synthesis");
    expect(data.sourceReference).toBe("Board Deck Q1 2026");
    expect(data.deadline).toEqual(new Date("2026-12-31"));
  });

  it("skips goals referencing non-existent departments", async () => {
    mockPrisma.entity.findFirst.mockResolvedValue(null); // department not found
    mockPrisma.goal.findFirst.mockResolvedValue(null);

    const model = makeBaseModel({
      strategicGoals: [
        {
          title: "Reduce support tickets",
          description: "Cut average response time",
          scope: "department",
          department: "NonExistent Dept",
          priority: 2,
          source: "Strategy Doc",
          confidence: "medium",
        },
      ],
    });

    await createGoalsFromModel("op-1", model);

    expect(mockPrisma.goal.create).not.toHaveBeenCalled();
  });

  it("deduplicates goals with same title and department", async () => {
    mockPrisma.entity.findFirst.mockResolvedValue(null); // company-level, no dept lookup needed
    // First goal: dedup check returns existing goal
    mockPrisma.goal.findFirst.mockResolvedValue({ id: "existing-goal-001" });

    const model = makeBaseModel({
      strategicGoals: [
        {
          title: "Grow revenue 30%",
          description: "Increase annual revenue",
          scope: "company",
          priority: 1,
          source: "Annual Plan",
          confidence: "high",
        },
      ],
    });

    await createGoalsFromModel("op-1", model);

    expect(mockPrisma.goal.create).not.toHaveBeenCalled();
  });

  it("maps confidence correctly (high → 0.9, medium → 0.7, low → 0.5)", async () => {
    mockPrisma.goal.findFirst.mockResolvedValue(null);
    mockPrisma.goal.create.mockResolvedValue({ id: "goal-x" });

    const model = makeBaseModel({
      strategicGoals: [
        { title: "High conf", description: "test", scope: "company", priority: 1, source: "s", confidence: "high" },
        { title: "Med conf", description: "test", scope: "company", priority: 2, source: "s", confidence: "medium" },
        { title: "Low conf", description: "test", scope: "company", priority: 3, source: "s", confidence: "low" },
      ],
    });

    await createGoalsFromModel("op-1", model);

    expect(mockPrisma.goal.create).toHaveBeenCalledTimes(3);
    expect(mockPrisma.goal.create.mock.calls[0][0].data.extractionConfidence).toBe(0.9);
    expect(mockPrisma.goal.create.mock.calls[1][0].data.extractionConfidence).toBe(0.7);
    expect(mockPrisma.goal.create.mock.calls[2][0].data.extractionConfidence).toBe(0.5);
  });

  it("creates company-level goals with null departmentId", async () => {
    mockPrisma.goal.findFirst.mockResolvedValue(null);
    mockPrisma.goal.create.mockResolvedValue({ id: "goal-hq" });

    const model = makeBaseModel({
      strategicGoals: [
        { title: "Expand to Germany", description: "Open Berlin office", scope: "company", priority: 1, source: "CEO memo", confidence: "high" },
      ],
    });

    await createGoalsFromModel("op-1", model);

    expect(mockPrisma.goal.create).toHaveBeenCalledOnce();
    expect(mockPrisma.goal.create.mock.calls[0][0].data.departmentId).toBeNull();
  });

  it("skips goals with empty title or description", async () => {
    mockPrisma.goal.findFirst.mockResolvedValue(null);

    const model = makeBaseModel({
      strategicGoals: [
        { title: "", description: "test", scope: "company", priority: 1, source: "s", confidence: "high" },
        { title: "test", description: "", scope: "company", priority: 1, source: "s", confidence: "high" },
      ],
    });

    await createGoalsFromModel("op-1", model);

    expect(mockPrisma.goal.create).not.toHaveBeenCalled();
  });
});
