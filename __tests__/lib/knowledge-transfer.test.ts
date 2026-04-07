import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock prisma ─────────────────────────────────────────────────────────────

const mockPrisma = vi.hoisted(() => ({
  operationalInsight: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  entity: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  userScope: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

const mockSendNotificationToAdmins = vi.hoisted(() => vi.fn());
vi.mock("@/lib/notification-dispatch", () => ({
  sendNotificationToAdmins: mockSendNotificationToAdmins,
}));

import {
  evaluateInsightPromotion,
  promoteInsight,
  invalidateInsight,
} from "@/lib/knowledge-transfer";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeInsight(overrides: Record<string, unknown> = {}) {
  return {
    id: "insight-1",
    operatorId: "op-1",
    aiEntityId: "ai-a",
    insightType: "pattern",
    description: "Customers churn after 3 missed calls",
    status: "active",
    shareScope: "personal",
    confidence: 0.75,
    evidence: JSON.stringify({
      situationTypeId: "st-1",
      actionCapabilityId: "ac-1",
      sampleSize: 5,
    }),
    ...overrides,
  };
}

function makeAiEntity(overrides: Record<string, unknown> = {}) {
  return {
    ownerUserId: null,
    ownerDomainId: "dept-1",
    primaryDomainId: "dept-1",
    entityType: { slug: "domain-ai" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendNotificationToAdmins.mockResolvedValue(undefined);
  mockPrisma.operationalInsight.update.mockResolvedValue({});
  mockPrisma.operationalInsight.updateMany.mockResolvedValue({ count: 1 });
});

// ── Test 1: Auto-promotion with 2 corroborating AIs ────────────────────────

describe("evaluateInsightPromotion", () => {
  it("auto-promotes when 2 peers corroborate", async () => {
    const insight = makeInsight();
    mockPrisma.operationalInsight.findUnique.mockResolvedValue(insight);
    mockPrisma.entity.findUnique.mockResolvedValue(makeAiEntity());

    // Two peer AIs in the same department
    mockPrisma.entity.findMany.mockResolvedValue([
      { id: "ai-b" },
      { id: "ai-c" },
    ]);

    // Each peer has a matching insight (same insightType, same situationTypeId)
    mockPrisma.operationalInsight.findMany
      .mockResolvedValueOnce([
        {
          id: "peer-insight-b",
          insightType: "pattern",
          status: "active",
          confidence: 0.7,
          evidence: JSON.stringify({
            situationTypeId: "st-1",
            actionCapabilityId: "ac-1",
          }),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "peer-insight-c",
          insightType: "pattern",
          status: "active",
          confidence: 0.6,
          evidence: JSON.stringify({
            situationTypeId: "st-1",
            actionCapabilityId: "ac-1",
          }),
        },
      ]);

    const result = await evaluateInsightPromotion("insight-1");

    expect(result.promoted).toBe(true);
    expect(result.reason).toBe("auto_corroborated");
    expect(result.corroboratingAiEntityIds).toEqual(["ai-b", "ai-c"]);

    // Primary insight promoted to department
    expect(mockPrisma.operationalInsight.update).toHaveBeenCalledWith({
      where: { id: "insight-1" },
      data: { shareScope: "department" },
    });

    // Both peer insights promoted too
    expect(mockPrisma.operationalInsight.updateMany).toHaveBeenCalledTimes(2);
    expect(mockPrisma.operationalInsight.updateMany).toHaveBeenCalledWith({
      where: {
        aiEntityId: "ai-b",
        insightType: "pattern",
        status: "active",
        shareScope: "personal",
      },
      data: { shareScope: "department" },
    });
    expect(mockPrisma.operationalInsight.updateMany).toHaveBeenCalledWith({
      where: {
        aiEntityId: "ai-c",
        insightType: "pattern",
        status: "active",
        shareScope: "personal",
      },
      data: { shareScope: "department" },
    });

    // Notification sent
    expect(mockSendNotificationToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: "op-1",
        type: "insight_discovered",
        title: "Insight auto-promoted to department",
        sourceType: "insight",
        sourceId: "insight-1",
      }),
    );
  });

  // ── Test 2: No promotion when no corroboration ──────────────────────────

  it("stays personal with no corroborating peers", async () => {
    const insight = makeInsight();
    mockPrisma.operationalInsight.findUnique.mockResolvedValue(insight);
    mockPrisma.entity.findUnique.mockResolvedValue(makeAiEntity());

    // No peer AIs found
    mockPrisma.entity.findMany.mockResolvedValue([]);

    const result = await evaluateInsightPromotion("insight-1");

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe("no_promotion");
    expect(mockPrisma.operationalInsight.update).not.toHaveBeenCalled();
    expect(mockSendNotificationToAdmins).not.toHaveBeenCalled();
  });

  // ── Test 3: Flagged for review — high confidence, no corroboration ──────

  it("flags for review when confidence >= 0.85 and sampleSize >= 10 without corroboration", async () => {
    const insight = makeInsight({
      confidence: 0.90,
      evidence: JSON.stringify({
        situationTypeId: "st-1",
        actionCapabilityId: "ac-1",
        sampleSize: 12,
      }),
    });
    mockPrisma.operationalInsight.findUnique
      .mockResolvedValueOnce(insight) // for evaluateInsightPromotion
      .mockResolvedValueOnce({ displayName: "Sales Bot" }); // for aiEntityName lookup

    mockPrisma.entity.findUnique
      .mockResolvedValueOnce(makeAiEntity()) // AI entity lookup
      .mockResolvedValueOnce({ displayName: "Sales Bot" }); // name lookup for notification

    // No peers
    mockPrisma.entity.findMany.mockResolvedValue([]);

    const result = await evaluateInsightPromotion("insight-1");

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe("flagged_for_review");
    expect(mockSendNotificationToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: "op-1",
        type: "insight_discovered",
        sourceType: "insight",
        sourceId: "insight-1",
      }),
    );
  });

  // ── Test 8: HQ AI skips promotion ───────────────────────────────────────

  it("skips promotion for hq-ai entity type", async () => {
    const insight = makeInsight();
    mockPrisma.operationalInsight.findUnique.mockResolvedValue(insight);
    mockPrisma.entity.findUnique.mockResolvedValue(
      makeAiEntity({ entityType: { slug: "hq-ai" } }),
    );

    const result = await evaluateInsightPromotion("insight-1");

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe("no_promotion");
    // Should NOT look for peers at all
    expect(mockPrisma.entity.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.operationalInsight.update).not.toHaveBeenCalled();
    expect(mockSendNotificationToAdmins).not.toHaveBeenCalled();
  });
});

// ── Manual promotion tests ──────────────────────────────────────────────────

describe("promoteInsight", () => {
  // ── Test 4: personal to department ────────────────────────────────────────

  it("promotes personal to department", async () => {
    mockPrisma.operationalInsight.findUnique.mockResolvedValue(
      makeInsight({ shareScope: "personal" }),
    );

    await promoteInsight("insight-1", "department", "user-1");

    expect(mockPrisma.operationalInsight.update).toHaveBeenCalledWith({
      where: { id: "insight-1" },
      data: { shareScope: "department" },
    });
    expect(mockSendNotificationToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: "op-1",
        type: "insight_discovered",
        title: "Insight promoted to department",
        sourceType: "insight",
        sourceId: "insight-1",
      }),
    );
  });

  // ── Test 5: department to operator ────────────────────────────────────────

  it("promotes department to operator", async () => {
    mockPrisma.operationalInsight.findUnique.mockResolvedValue(
      makeInsight({ shareScope: "department" }),
    );

    await promoteInsight("insight-1", "operator", "user-1");

    expect(mockPrisma.operationalInsight.update).toHaveBeenCalledWith({
      where: { id: "insight-1" },
      data: { shareScope: "operator" },
    });
    expect(mockSendNotificationToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Insight promoted to operator",
      }),
    );
  });

  // ── Test 6: invalid personal to operator ──────────────────────────────────

  it("throws error when promoting personal directly to operator", async () => {
    mockPrisma.operationalInsight.findUnique.mockResolvedValue(
      makeInsight({ shareScope: "personal" }),
    );

    await expect(
      promoteInsight("insight-1", "operator", "user-1"),
    ).rejects.toThrow(
      "Cannot promote directly from personal to operator. Must go personal → department → operator.",
    );

    expect(mockPrisma.operationalInsight.update).not.toHaveBeenCalled();
  });
});

// ── Invalidation ────────────────────────────────────────────────────────────

describe("invalidateInsight", () => {
  // ── Test 7: sets status to invalidated ────────────────────────────────────

  it("sets status to invalidated", async () => {
    mockPrisma.operationalInsight.findUnique.mockResolvedValue(
      makeInsight(),
    );

    await invalidateInsight("insight-1", "user-1");

    expect(mockPrisma.operationalInsight.update).toHaveBeenCalledWith({
      where: { id: "insight-1" },
      data: { status: "invalidated" },
    });
    expect(mockSendNotificationToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: "op-1",
        type: "insight_discovered",
        title: "Insight invalidated",
        sourceType: "insight",
        sourceId: "insight-1",
      }),
    );
  });
});
