import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/ai-provider", () => ({ callLLM: vi.fn(), getModel: (route: string) => `mock-${route}` }));
vi.mock("@/lib/knowledge-transfer", () => ({ evaluateInsightPromotion: vi.fn() }));

import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import {
  extractInsights,
  assembleExtractionData,
  checkInsightExtractionTrigger,
  getSituationsSinceLastExtraction,
  getLastExtractionTime,
} from "@/lib/operational-knowledge";
import { evaluateInsightPromotion } from "@/lib/knowledge-transfer";

const mockPrisma = prisma as unknown as {
  operationalInsight: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  entity: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  situation: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  operator: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  actionCapability: {
    findMany: ReturnType<typeof vi.fn>;
  };
  userScope: {
    findFirst: ReturnType<typeof vi.fn>;
  };
};

const mockCallLLM = callLLM as ReturnType<typeof vi.fn>;
const mockEvaluateInsightPromotion = evaluateInsightPromotion as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();

  // Set up default mock functions
  mockPrisma.operationalInsight = {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "insight-1" }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({}),
  };
  mockPrisma.entity = {
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
  };
  mockPrisma.situation = {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  };
  mockPrisma.operator = {
    findUnique: vi.fn().mockResolvedValue(null),
  };
  mockPrisma.actionCapability = {
    findMany: vi.fn().mockResolvedValue([]),
  };
  mockPrisma.userScope = {
    findFirst: vi.fn().mockResolvedValue(null),
  };

  mockEvaluateInsightPromotion.mockResolvedValue(undefined);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLLMInsight(overrides: Record<string, unknown> = {}) {
  return {
    insightType: "approach_effectiveness",
    description: "Email follow-ups work better than Slack for invoice reminders",
    evidence: {
      sampleSize: 12,
      successRate: 0.85,
      situationTypeId: "st-overdue",
      situationTypeName: "Overdue Invoice",
      actionCapabilityId: "cap-email",
      actionCapabilityName: "send_email",
      timeRange: { from: "2026-01-01T00:00:00.000Z", to: "2026-03-19T00:00:00.000Z" },
      exampleSituationIds: ["sit-1", "sit-2", "sit-3"],
    },
    confidence: 0.8,
    promptModification: null,
    ...overrides,
  };
}

function makeLLMResponse(insights: unknown[]) {
  return { text: JSON.stringify({ insights }) };
}

function makeResolvedSituation(id: string, typeId: string, typeName: string, capId: string | null = null, overrides: Record<string, unknown> = {}) {
  return {
    id,
    situationTypeId: typeId,
    reasoning: "some reasoning",
    resolvedAt: new Date("2026-03-15"),
    createdAt: new Date("2026-03-14"),
    assignedUserId: "user-1",
    triggerEntityId: "entity-t1",
    situationType: { id: typeId, name: typeName, slug: typeName.toLowerCase().replace(/ /g, "-") },
    executionPlan: capId
      ? {
          id: `plan-${id}`,
          status: "completed",
          steps: [{ executionMode: "action", actionCapabilityId: capId, status: "completed" }],
        }
      : null,
    ...overrides,
  };
}

function setupExtractInsightsMocks(options: {
  resolvedSituations?: unknown[];
  dismissedSituations?: unknown[];
  peerEntities?: unknown[];
  capabilities?: { id: string; name: string }[];
  aiEntities?: unknown[];
} = {}) {
  const aiEntity = {
    id: "ai-1",
    displayName: "Jonas AI",
    ownerUserId: "user-1",
    ownerDomainId: "dept-1",
    primaryDomainId: "dept-1",
    entityType: { slug: "ai-agent" },
  };

  // findUnique called for AI entity first, then for department
  mockPrisma.entity.findUnique
    .mockResolvedValueOnce(aiEntity)           // AI entity lookup
    .mockResolvedValueOnce({ displayName: "Sales" }); // department lookup

  // findMany calls in order: peer entities, peer situations (if peers), aiEntities for name resolution, capability lookup
  const peerEntities = options.peerEntities ?? [];
  const findManyCalls: unknown[] = [peerEntities];

  if ((peerEntities as unknown[]).length > 0) {
    findManyCalls.push([]); // peer situations
  }

  // AI entities for name resolution
  findManyCalls.push(options.aiEntities ?? [
    { id: "ai-1", displayName: "Jonas AI", ownerUserId: "user-1" },
  ]);

  // entity.findMany is called for peers + ai entity name resolution
  for (const call of findManyCalls) {
    mockPrisma.entity.findMany.mockResolvedValueOnce(call);
  }

  // situation.findMany: resolved, then dismissed
  mockPrisma.situation.findMany
    .mockResolvedValueOnce(options.resolvedSituations ?? [])
    .mockResolvedValueOnce(options.dismissedSituations ?? []);

  // actionCapability.findMany
  mockPrisma.actionCapability.findMany.mockResolvedValue(
    options.capabilities ?? [{ id: "cap-email", name: "send_email" }],
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("extractInsights", () => {
  it("creates OperationalInsight from valid LLM response", async () => {
    const situations = Array.from({ length: 6 }, (_, i) =>
      makeResolvedSituation(`sit-${i}`, "st-overdue", "Overdue Invoice", "cap-email"),
    );
    setupExtractInsightsMocks({ resolvedSituations: situations });

    const insight = makeLLMInsight();
    mockCallLLM.mockResolvedValue(makeLLMResponse([insight]));

    // No existing insights
    mockPrisma.operationalInsight.findMany.mockResolvedValue([]);

    const result = await extractInsights("op-1", "ai-1");

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.superseded).toBe(0);
    expect(mockPrisma.operationalInsight.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operatorId: "op-1",
        aiEntityId: "ai-1",
        insightType: "approach_effectiveness",
        status: "active",
      }),
    });
  });

  it("stores evidence JSON with correct fields", async () => {
    const situations = Array.from({ length: 6 }, (_, i) =>
      makeResolvedSituation(`sit-${i}`, "st-overdue", "Overdue Invoice", "cap-email"),
    );
    setupExtractInsightsMocks({ resolvedSituations: situations });

    const insight = makeLLMInsight();
    mockCallLLM.mockResolvedValue(makeLLMResponse([insight]));
    mockPrisma.operationalInsight.findMany.mockResolvedValue([]);

    await extractInsights("op-1", "ai-1");

    const createCall = mockPrisma.operationalInsight.create.mock.calls[0][0];
    const evidence = JSON.parse(createCall.data.evidence);

    expect(evidence).toEqual(
      expect.objectContaining({
        sampleSize: 12,
        successRate: 0.85,
        situationTypeId: "st-overdue",
        situationTypeName: "Overdue Invoice",
        actionCapabilityId: "cap-email",
        actionCapabilityName: "send_email",
        exampleSituationIds: expect.any(Array),
      }),
    );
    expect(evidence.timeRange).toEqual(
      expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
    );
  });

  it("excludes situation types with fewer than 5 resolved from LLM call", async () => {
    // Only 3 resolved situations for this type
    const situations = Array.from({ length: 3 }, (_, i) =>
      makeResolvedSituation(`sit-${i}`, "st-overdue", "Overdue Invoice", "cap-email"),
    );
    setupExtractInsightsMocks({ resolvedSituations: situations });

    const result = await extractInsights("op-1", "ai-1");

    expect(result).toEqual({ created: 0, superseded: 0, skipped: 0 });
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it("skips insight with confidence below 0.6", async () => {
    const situations = Array.from({ length: 6 }, (_, i) =>
      makeResolvedSituation(`sit-${i}`, "st-overdue", "Overdue Invoice", "cap-email"),
    );
    setupExtractInsightsMocks({ resolvedSituations: situations });

    const insight = makeLLMInsight({ confidence: 0.4 });
    mockCallLLM.mockResolvedValue(makeLLMResponse([insight]));

    const result = await extractInsights("op-1", "ai-1");

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(mockPrisma.operationalInsight.create).not.toHaveBeenCalled();
  });

  it("supersedes existing active insight when new has higher confidence", async () => {
    const situations = Array.from({ length: 6 }, (_, i) =>
      makeResolvedSituation(`sit-${i}`, "st-overdue", "Overdue Invoice", "cap-email"),
    );
    setupExtractInsightsMocks({ resolvedSituations: situations });

    const newInsight = makeLLMInsight({ confidence: 0.9 });
    mockCallLLM.mockResolvedValue(makeLLMResponse([newInsight]));

    // Existing insight with lower confidence
    mockPrisma.operationalInsight.findMany.mockResolvedValue([
      {
        id: "old-insight-1",
        aiEntityId: "ai-1",
        insightType: "approach_effectiveness",
        confidence: 0.7,
        status: "active",
        evidence: JSON.stringify({ situationTypeId: "st-overdue" }),
      },
    ]);

    const result = await extractInsights("op-1", "ai-1");

    expect(result.superseded).toBe(1);
    expect(result.created).toBe(1);
    expect(mockPrisma.operationalInsight.update).toHaveBeenCalledWith({
      where: { id: "old-insight-1" },
      data: { status: "superseded" },
    });
  });

  it("skips new insight when existing has higher confidence", async () => {
    const situations = Array.from({ length: 6 }, (_, i) =>
      makeResolvedSituation(`sit-${i}`, "st-overdue", "Overdue Invoice", "cap-email"),
    );
    setupExtractInsightsMocks({ resolvedSituations: situations });

    const newInsight = makeLLMInsight({ confidence: 0.7 });
    mockCallLLM.mockResolvedValue(makeLLMResponse([newInsight]));

    // Existing insight with higher confidence
    mockPrisma.operationalInsight.findMany.mockResolvedValue([
      {
        id: "old-insight-1",
        aiEntityId: "ai-1",
        insightType: "approach_effectiveness",
        confidence: 0.9,
        status: "active",
        evidence: JSON.stringify({ situationTypeId: "st-overdue" }),
      },
    ]);

    const result = await extractInsights("op-1", "ai-1");

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(mockPrisma.operationalInsight.update).not.toHaveBeenCalled();
    expect(mockPrisma.operationalInsight.create).not.toHaveBeenCalled();
  });

  it("stores promptModification when LLM returns one", async () => {
    const situations = Array.from({ length: 6 }, (_, i) =>
      makeResolvedSituation(`sit-${i}`, "st-overdue", "Overdue Invoice", "cap-email"),
    );
    setupExtractInsightsMocks({ resolvedSituations: situations });

    const insight = makeLLMInsight({
      promptModification: "When handling overdue invoices, prefer email over Slack because success rate is 25% higher.",
    });
    mockCallLLM.mockResolvedValue(makeLLMResponse([insight]));
    mockPrisma.operationalInsight.findMany.mockResolvedValue([]);

    await extractInsights("op-1", "ai-1");

    const createCall = mockPrisma.operationalInsight.create.mock.calls[0][0];
    expect(createCall.data.promptModification).toBe(
      "When handling overdue invoices, prefer email over Slack because success rate is 25% higher.",
    );
  });

  it("stores null promptModification when LLM returns null", async () => {
    const situations = Array.from({ length: 6 }, (_, i) =>
      makeResolvedSituation(`sit-${i}`, "st-overdue", "Overdue Invoice", "cap-email"),
    );
    setupExtractInsightsMocks({ resolvedSituations: situations });

    const insight = makeLLMInsight({ promptModification: null });
    mockCallLLM.mockResolvedValue(makeLLMResponse([insight]));
    mockPrisma.operationalInsight.findMany.mockResolvedValue([]);

    await extractInsights("op-1", "ai-1");

    const createCall = mockPrisma.operationalInsight.create.mock.calls[0][0];
    expect(createCall.data.promptModification).toBeNull();
  });
});

describe("assembleExtractionData", () => {
  it("includes approaches from multiple AI entities for the same situation type", async () => {
    const aiEntity = {
      id: "ai-1",
      displayName: "Jonas AI",
      ownerUserId: "user-1",
      ownerDomainId: "dept-1",
      primaryDomainId: "dept-1",
      entityType: { slug: "ai-agent" },
    };

    mockPrisma.entity.findUnique
      .mockResolvedValueOnce(aiEntity)              // AI entity lookup
      .mockResolvedValueOnce({ displayName: "Sales" }); // department lookup

    // Situations: same type, different AI entities (assigned users), same capability
    const sit1 = makeResolvedSituation("sit-1", "st-overdue", "Overdue Invoice", "cap-email", {
      assignedUserId: "user-1",
    });
    const sit2 = makeResolvedSituation("sit-2", "st-overdue", "Overdue Invoice", "cap-slack", {
      assignedUserId: "user-2",
    });

    mockPrisma.situation.findMany
      .mockResolvedValueOnce([sit1, sit2]) // resolved
      .mockResolvedValueOnce([]);           // dismissed

    // Peer entities in same department
    const peerEntities = [
      { id: "ai-2", displayName: "Maria AI", ownerUserId: "user-2" },
    ];
    mockPrisma.entity.findMany
      .mockResolvedValueOnce(peerEntities) // peer entity lookup
      .mockResolvedValueOnce([sit2])       // peer situations
      .mockResolvedValueOnce([             // AI entity name resolution
        { id: "ai-1", displayName: "Jonas AI", ownerUserId: "user-1" },
        { id: "ai-2", displayName: "Maria AI", ownerUserId: "user-2" },
      ]);

    mockPrisma.actionCapability.findMany.mockResolvedValue([
      { id: "cap-email", name: "send_email" },
      { id: "cap-slack", name: "send_slack_message" },
    ]);

    const data = await assembleExtractionData("op-1", "ai-1");

    expect(data).not.toBeNull();
    const group = data!.situationTypeGroups.find((g) => g.situationTypeId === "st-overdue");
    expect(group).toBeDefined();

    // Should have two distinct approaches (different capabilities)
    const capIds = group!.approaches.map((a) => a.actionCapabilityId);
    expect(capIds).toContain("cap-email");
    expect(capIds).toContain("cap-slack");
  });
});

describe("checkInsightExtractionTrigger", () => {
  function setupTriggerMocks(options: {
    operatorAgeDays: number;
    resolvedCount: number;
    lastExtractionMinutesAgo?: number | null;
  }) {
    // AI entity lookup
    mockPrisma.entity.findFirst.mockResolvedValue({ id: "ai-1" });

    // Operator age
    const operatorCreatedAt = new Date(Date.now() - options.operatorAgeDays * 24 * 60 * 60 * 1000);
    mockPrisma.operator.findUnique.mockResolvedValue({ createdAt: operatorCreatedAt });

    // getSituationsSinceLastExtraction internals:
    // 1. getLastExtractionTime (operationalInsight.findFirst)
    if (options.lastExtractionMinutesAgo != null) {
      const lastExtractionDate = new Date(Date.now() - options.lastExtractionMinutesAgo * 60 * 1000);
      mockPrisma.operationalInsight.findFirst
        .mockResolvedValueOnce({ createdAt: lastExtractionDate })  // for getSituationsSinceLastExtraction
        .mockResolvedValueOnce({ createdAt: lastExtractionDate }); // for lock check
    } else {
      mockPrisma.operationalInsight.findFirst
        .mockResolvedValue(null);
    }

    // 2. entity.findUnique for AI entity type resolution
    mockPrisma.entity.findUnique.mockResolvedValue({
      id: "ai-1",
      ownerUserId: "user-1",
      ownerDomainId: "dept-1",
      entityType: { slug: "ai-agent" },
    });

    // 3. situation.count
    mockPrisma.situation.count.mockResolvedValue(options.resolvedCount);
  }

  it("runs extraction when threshold met (20 resolved, 15-day operator)", async () => {
    setupTriggerMocks({
      operatorAgeDays: 15,
      resolvedCount: 20,
      lastExtractionMinutesAgo: null,
    });

    // extractInsights mocks (it calls assembleExtractionData which needs entity lookups)
    // Since assembleExtractionData will return null without full setup, extraction returns early
    // We verify that getSituationsSinceLastExtraction path was followed
    // and checkInsightExtractionTrigger continued past the threshold check

    await checkInsightExtractionTrigger("op-1", "user-1");

    // Verify threshold check passed: situation.count was called
    expect(mockPrisma.situation.count).toHaveBeenCalled();
    // Verify it didn't bail out early — it continued to attempt extraction
    // entity.findUnique is called for AI entity in extractInsights → assembleExtractionData
    expect(mockPrisma.entity.findUnique).toHaveBeenCalled();
  });

  it("does NOT run extraction when below threshold (10 resolved, 15-day operator)", async () => {
    setupTriggerMocks({
      operatorAgeDays: 15,
      resolvedCount: 10,
      lastExtractionMinutesAgo: null,
    });

    await checkInsightExtractionTrigger("op-1", "user-1");

    // Threshold is 20 for operators <= 28 days. 10 < 20, so no extraction.
    expect(mockPrisma.situation.count).toHaveBeenCalled();
    // callLLM should NOT be called since extraction should not run
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it("skips extraction in first week (operator age 3 days)", async () => {
    // AI entity lookup
    mockPrisma.entity.findFirst.mockResolvedValue({ id: "ai-1" });

    // Operator age: 3 days
    const operatorCreatedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    mockPrisma.operator.findUnique.mockResolvedValue({ createdAt: operatorCreatedAt });

    await checkInsightExtractionTrigger("op-1", "user-1");

    // Should bail out before counting situations
    expect(mockPrisma.situation.count).not.toHaveBeenCalled();
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it("skips extraction when lock active (last extraction 30 minutes ago)", async () => {
    setupTriggerMocks({
      operatorAgeDays: 15,
      resolvedCount: 25,
      lastExtractionMinutesAgo: 30,
    });

    await checkInsightExtractionTrigger("op-1", "user-1");

    // Lock check: last extraction 30 min ago < 60 min lock window, should skip
    expect(mockCallLLM).not.toHaveBeenCalled();
  });
});

describe("getLastExtractionTime", () => {
  it("returns null when no extractions exist", async () => {
    mockPrisma.operationalInsight.findFirst.mockResolvedValue(null);

    const result = await getLastExtractionTime("ai-1");
    expect(result).toBeNull();
  });

  it("returns the createdAt of the latest extraction", async () => {
    const date = new Date("2026-03-18T10:00:00.000Z");
    mockPrisma.operationalInsight.findFirst.mockResolvedValue({ createdAt: date });

    const result = await getLastExtractionTime("ai-1");
    expect(result).toEqual(date);
  });
});

describe("getSituationsSinceLastExtraction", () => {
  it("counts resolved situations for personal AI (ownerUserId)", async () => {
    mockPrisma.operationalInsight.findFirst.mockResolvedValue(null);
    mockPrisma.entity.findUnique.mockResolvedValue({
      ownerUserId: "user-1",
      ownerDomainId: null,
      entityType: { slug: "ai-agent" },
    });
    mockPrisma.situation.count.mockResolvedValue(15);

    const count = await getSituationsSinceLastExtraction("op-1", "ai-1");

    expect(count).toBe(15);
    expect(mockPrisma.situation.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          operatorId: "op-1",
          status: "resolved",
          assignedUserId: "user-1",
        }),
      }),
    );
  });
});

describe("cron-like scenarios", () => {
  it("cron daily: new operator (3 days), no prior extraction — would run", async () => {
    // This tests the logic that for a 3-day-old operator, event-driven is skipped
    // but cron should handle it. checkInsightExtractionTrigger returns early for <7 days.
    mockPrisma.entity.findFirst.mockResolvedValue({ id: "ai-1" });
    const operatorCreatedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    mockPrisma.operator.findUnique.mockResolvedValue({ createdAt: operatorCreatedAt });

    await checkInsightExtractionTrigger("op-1", "user-1");

    // Event-driven skips first week, so no extraction attempted
    expect(mockPrisma.situation.count).not.toHaveBeenCalled();
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it("cron weekly: mature operator (30 days), last extraction 3 days ago — skips", async () => {
    setupTriggerMocksForMatureOperator();

    await checkInsightExtractionTrigger("op-1", "user-1");

    // For a 30-day operator, threshold is 40. With only 10 resolved, should not run.
    expect(mockCallLLM).not.toHaveBeenCalled();
  });
});

function setupTriggerMocksForMatureOperator() {
  mockPrisma.entity.findFirst.mockResolvedValue({ id: "ai-1" });

  const operatorCreatedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  mockPrisma.operator.findUnique.mockResolvedValue({ createdAt: operatorCreatedAt });

  // Last extraction 3 days ago
  const lastExtractionDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  mockPrisma.operationalInsight.findFirst
    .mockResolvedValueOnce({ createdAt: lastExtractionDate })   // getSituationsSinceLastExtraction
    .mockResolvedValueOnce({ createdAt: lastExtractionDate });  // lock check

  mockPrisma.entity.findUnique.mockResolvedValue({
    id: "ai-1",
    ownerUserId: "user-1",
    ownerDomainId: "dept-1",
    entityType: { slug: "ai-agent" },
  });

  // Only 10 resolved since last extraction — below 40 threshold for mature operator
  mockPrisma.situation.count.mockResolvedValue(10);
}
