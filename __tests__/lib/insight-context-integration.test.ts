import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { prisma } from "@/lib/db";
import { loadOperationalInsights } from "@/lib/context-assembly";

const mockPrisma = prisma as unknown as {
  operationalInsight: { findMany: ReturnType<typeof vi.fn> };
};

function setupMock() {
  mockPrisma.operationalInsight = { findMany: vi.fn() };
}

describe("loadOperationalInsights", () => {
  beforeEach(() => {
    setupMock();
    vi.clearAllMocks();
  });

  it("loads personal insight for reasoning context", async () => {
    mockPrisma.operationalInsight.findMany.mockResolvedValue([
      {
        id: "ins-1",
        insightType: "approach_effectiveness",
        description: "Email works better than Slack for invoice disputes",
        confidence: 0.85,
        promptModification: null,
        shareScope: "personal",
        evidence: JSON.stringify({ sampleSize: 12 }),
      },
    ]);

    const result = await loadOperationalInsights("op-1", "ai-1", "dept-1");

    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Email works better than Slack for invoice disputes");
    expect(result[0].sampleSize).toBe(12);
  });

  it("returns department-scoped insights for department members", async () => {
    mockPrisma.operationalInsight.findMany.mockResolvedValue([
      {
        id: "ins-dept",
        insightType: "resolution_pattern",
        description: "Escalation works for overdue invoices",
        confidence: 0.78,
        promptModification: "When handling overdue invoices, escalate after 3 days",
        shareScope: "department",
        evidence: JSON.stringify({ sampleSize: 20 }),
      },
    ]);

    const result = await loadOperationalInsights("op-1", "ai-1", "dept-1");

    expect(result).toHaveLength(1);
    expect(result[0].shareScope).toBe("department");
    expect(result[0].promptModification).toBe("When handling overdue invoices, escalate after 3 days");
  });

  it("returns operator-scoped insights for all AIs", async () => {
    mockPrisma.operationalInsight.findMany.mockResolvedValue([
      {
        id: "ins-op",
        insightType: "timing_pattern",
        description: "Tuesday emails get faster response",
        confidence: 0.72,
        promptModification: null,
        shareScope: "operator",
        evidence: JSON.stringify({ sampleSize: 18 }),
      },
    ]);

    const result = await loadOperationalInsights("op-1", "ai-other", "dept-other");

    expect(result).toHaveLength(1);
    expect(result[0].shareScope).toBe("operator");
  });

  it("excludes invalidated insights", async () => {
    // The function queries with status: "active", so invalidated won't appear
    mockPrisma.operationalInsight.findMany.mockResolvedValue([]);

    const result = await loadOperationalInsights("op-1", "ai-1", "dept-1");

    expect(result).toHaveLength(0);
    // Verify the query includes status: "active"
    const callArgs = mockPrisma.operationalInsight.findMany.mock.calls[0][0];
    expect(callArgs.where.status).toBe("active");
  });

  it("caps at 20 insights ordered by confidence", async () => {
    mockPrisma.operationalInsight.findMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({
        id: `ins-${i}`,
        insightType: "approach_effectiveness",
        description: `Insight ${i}`,
        confidence: 1 - i * 0.04,
        promptModification: null,
        shareScope: "department",
        evidence: JSON.stringify({ sampleSize: 10 }),
      })),
    );

    const result = await loadOperationalInsights("op-1", "ai-1", "dept-1");

    expect(result).toHaveLength(20);
    // Verify take: 50 (pre-filter) and orderBy confidence desc
    const callArgs = mockPrisma.operationalInsight.findMany.mock.calls[0][0];
    expect(callArgs.take).toBe(50);
    expect(callArgs.orderBy).toEqual({ confidence: "desc" });
  });

  it("includes promptModification in context for behavioral directives", async () => {
    mockPrisma.operationalInsight.findMany.mockResolvedValue([
      {
        id: "ins-mod",
        insightType: "approach_effectiveness",
        description: "Discount with deadline beats plain discount",
        confidence: 0.87,
        promptModification: "When handling invoice disputes over 10K, prefer discount with deadline over discount alone.",
        shareScope: "department",
        evidence: JSON.stringify({ sampleSize: 36 }),
      },
    ]);

    const result = await loadOperationalInsights("op-1", "ai-1", "dept-1");

    expect(result[0].promptModification).toContain("discount with deadline");
  });

  it("queries with correct OR conditions for department + operator scope", async () => {
    mockPrisma.operationalInsight.findMany.mockResolvedValue([]);

    await loadOperationalInsights("op-1", "ai-1", "dept-1");

    const callArgs = mockPrisma.operationalInsight.findMany.mock.calls[0][0];
    expect(callArgs.where.operatorId).toBe("op-1");
    expect(callArgs.where.status).toBe("active");
    expect(callArgs.where.OR).toEqual(
      expect.arrayContaining([
        { shareScope: "operator" },
        { aiEntityId: "ai-1", shareScope: "personal" },
        { departmentId: "dept-1", shareScope: "department" },
      ]),
    );
  });

  it("handles null aiEntityId and departmentId by only including operator scope", async () => {
    mockPrisma.operationalInsight.findMany.mockResolvedValue([]);

    await loadOperationalInsights("op-1", null, null);

    const callArgs = mockPrisma.operationalInsight.findMany.mock.calls[0][0];
    expect(callArgs.where.OR).toEqual([{ shareScope: "operator" }]);
  });
});
