import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Prisma mock ─────────────────────────────────────────────────────────────

const mockEntityFindMany = vi.fn();
const mockEntityFindUnique = vi.fn();
const mockPropertyValueFindMany = vi.fn();
const mockPropertyValueCreate = vi.fn();
const mockRelationshipFindMany = vi.fn();
const mockRelationshipDelete = vi.fn();
const mockRelationshipFindFirst = vi.fn();
const mockRelationshipUpdate = vi.fn();
const mockContentChunkUpdateMany = vi.fn();
const mockActivitySignalFindMany = vi.fn();
const mockActivitySignalUpdateMany = vi.fn();
const mockEntityUpdate = vi.fn();
const mockSituationUpdateMany = vi.fn();
const mockEntityMergeLogCreate = vi.fn();
const mockEntityMergeLogFindFirst = vi.fn();
const mockSituationCount = vi.fn();
const mockNotificationCreate = vi.fn();
const mockExecuteRawUnsafe = vi.fn();
const mockQueryRawUnsafe = vi.fn();

function makeTx() {
  return {
    propertyValue: {
      findMany: mockPropertyValueFindMany,
      create: mockPropertyValueCreate,
    },
    relationship: {
      findMany: mockRelationshipFindMany,
      delete: mockRelationshipDelete,
      findFirst: mockRelationshipFindFirst,
      update: mockRelationshipUpdate,
    },
    contentChunk: { updateMany: mockContentChunkUpdateMany },
    activitySignal: {
      updateMany: mockActivitySignalUpdateMany,
      findMany: mockActivitySignalFindMany,
      update: vi.fn(),
    },
    situation: { updateMany: mockSituationUpdateMany },
    entity: { update: mockEntityUpdate },
    entityMergeLog: { create: mockEntityMergeLogCreate },
  };
}

vi.mock("@/lib/db", () => ({
  prisma: {
    entity: {
      findMany: (...a: unknown[]) => mockEntityFindMany(...a),
      findUnique: (...a: unknown[]) => mockEntityFindUnique(...a),
    },
    propertyValue: { findMany: (...a: unknown[]) => mockPropertyValueFindMany(...a) },
    relationship: { findMany: (...a: unknown[]) => mockRelationshipFindMany(...a) },
    contentChunk: { updateMany: (...a: unknown[]) => mockContentChunkUpdateMany(...a) },
    activitySignal: {
      updateMany: (...a: unknown[]) => mockActivitySignalUpdateMany(...a),
      findMany: (...a: unknown[]) => mockActivitySignalFindMany(...a),
    },
    entityMergeLog: {
      create: (...a: unknown[]) => mockEntityMergeLogCreate(...a),
      findFirst: (...a: unknown[]) => mockEntityMergeLogFindFirst(...a),
    },
    situation: {
      count: (...a: unknown[]) => mockSituationCount(...a),
      updateMany: (...a: unknown[]) => mockSituationUpdateMany(...a),
    },
    notification: { create: (...a: unknown[]) => mockNotificationCreate(...a) },
    $transaction: (fn: (tx: ReturnType<typeof makeTx>) => Promise<void>) => fn(makeTx()),
    $executeRawUnsafe: (...a: unknown[]) => mockExecuteRawUnsafe(...a),
    $queryRawUnsafe: (...a: unknown[]) => mockQueryRawUnsafe(...a),
  },
}));

vi.mock("@/lib/rag/embedder", () => ({
  embedChunks: vi.fn().mockResolvedValue([null]),
}));

import { runDeterministicMerges } from "@/lib/identity-resolution";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeEntity(overrides: {
  id: string;
  displayName?: string;
  category?: string;
  sourceSystem?: string | null;
  email?: string;
  propertyCount?: number;
  createdAt?: Date;
}) {
  return {
    id: overrides.id,
    displayName: overrides.displayName ?? overrides.id,
    category: overrides.category ?? "digital",
    sourceSystem: overrides.sourceSystem ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-01-01"),
    propertyValues: [{ value: overrides.email ?? "test@example.com" }],
    _count: { propertyValues: overrides.propertyCount ?? 3 },
  };
}

function setupMergeEntityMocks() {
  mockEntityFindUnique.mockImplementation(async (args: { where: { id: string } }) => {
    return {
      id: args.where.id,
      displayName: args.where.id,
      status: "active",
      category: "digital",
      sourceSystem: null,
      externalId: null,
      mergedIntoId: null,
      createdAt: new Date("2026-01-01"),
      _count: { propertyValues: 3 },
    };
  });
  mockPropertyValueFindMany.mockResolvedValue([]);
  mockRelationshipFindMany.mockResolvedValue([]);
  mockContentChunkUpdateMany.mockResolvedValue({ count: 0 });
  mockActivitySignalUpdateMany.mockResolvedValue({ count: 0 });
  mockActivitySignalFindMany.mockResolvedValue([]);
  mockSituationUpdateMany.mockResolvedValue({ count: 0 });
  mockEntityUpdate.mockResolvedValue({});
  mockEntityMergeLogCreate.mockResolvedValue({ id: "log1" });
  mockEntityMergeLogFindFirst.mockResolvedValue({ id: "log1" });
  mockSituationCount.mockResolvedValue(0);
  mockExecuteRawUnsafe.mockResolvedValue(undefined);
  mockQueryRawUnsafe.mockResolvedValue([]);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("runDeterministicMerges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMergeEntityMocks();
  });

  it("auto-merges entities with matching email from different sources", async () => {
    const entityA = makeEntity({ id: "a", sourceSystem: "hubspot", email: "alice@co.com" });
    const entityB = makeEntity({ id: "b", sourceSystem: "gmail", email: "alice@co.com" });

    mockEntityFindMany.mockResolvedValue([entityA, entityB]);

    const result = await runDeterministicMerges("op1");

    expect(result.mergesExecuted).toBe(1);
    expect(result.mergeLogIds).toHaveLength(1);

    expect(mockEntityMergeLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mergeType: "auto_identity",
          confidence: 1.0,
          signals: expect.stringContaining("email_exact_match"),
        }),
      }),
    );
  });

  it("does NOT merge entities with matching email from the same source", async () => {
    const entityA = makeEntity({ id: "a", sourceSystem: "hubspot", email: "alice@co.com" });
    const entityB = makeEntity({ id: "b", sourceSystem: "hubspot", email: "alice@co.com" });

    mockEntityFindMany.mockResolvedValue([entityA, entityB]);

    const result = await runDeterministicMerges("op1");

    expect(result.mergesExecuted).toBe(0);
    expect(mockEntityMergeLogCreate).not.toHaveBeenCalled();
  });

  it("three entities from three sources merge into highest-category survivor", async () => {
    const entityA = makeEntity({ id: "a", category: "base", sourceSystem: "hubspot", email: "bob@co.com" });
    const entityB = makeEntity({ id: "b", category: "external", sourceSystem: "gmail", email: "bob@co.com" });
    const entityC = makeEntity({ id: "c", category: "external", sourceSystem: "slack", email: "bob@co.com" });

    mockEntityFindMany.mockResolvedValue([entityA, entityB, entityC]);

    const result = await runDeterministicMerges("op1");

    expect(result.mergesExecuted).toBe(2);

    const updateCalls = mockEntityUpdate.mock.calls;
    const absorbedIds = updateCalls
      .filter((c: unknown[]) => {
        const arg = c[0] as { data?: { status?: string } };
        return arg.data?.status === "merged";
      })
      .map((c: unknown[]) => (c[0] as { where: { id: string } }).where.id);

    expect(absorbedIds).toContain("b");
    expect(absorbedIds).toContain("c");
    expect(absorbedIds).not.toContain("a");
  });

  it("skips entities with no email property", async () => {
    mockEntityFindMany.mockResolvedValue([]);

    const result = await runDeterministicMerges("op1");

    expect(result.mergesExecuted).toBe(0);
  });

  it("skips already-merged entities (status filter in query)", async () => {
    mockEntityFindMany.mockResolvedValue([]);

    const result = await runDeterministicMerges("op1", ["merged-entity-id"]);

    expect(result.mergesExecuted).toBe(0);
  });

  it("creates Notification when absorbed entity had active situations", async () => {
    const entityA = makeEntity({ id: "a", displayName: "Alice HubSpot", sourceSystem: "hubspot", email: "alice@co.com" });
    const entityB = makeEntity({ id: "b", displayName: "Alice Gmail", sourceSystem: "gmail", email: "alice@co.com" });

    mockEntityFindMany.mockResolvedValue([entityA, entityB]);
    mockSituationCount.mockResolvedValue(2);

    await runDeterministicMerges("op1");

    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operatorId: "op1",
          body: expect.stringContaining("2 active situation(s)"),
        }),
      }),
    );
  });

  it("does NOT create Notification when absorbed entity had no active situations", async () => {
    const entityA = makeEntity({ id: "a", sourceSystem: "hubspot", email: "alice@co.com" });
    const entityB = makeEntity({ id: "b", sourceSystem: "gmail", email: "alice@co.com" });

    mockEntityFindMany.mockResolvedValue([entityA, entityB]);
    mockSituationCount.mockResolvedValue(0);

    await runDeterministicMerges("op1");

    expect(mockNotificationCreate).not.toHaveBeenCalled();
    expect(mockEntityMergeLogCreate).toHaveBeenCalled();
  });

  // Fix 1: null sourceSystem should merge with non-null
  it("merges entity with null sourceSystem and entity with non-null sourceSystem", async () => {
    const entityA = makeEntity({ id: "a", sourceSystem: "hubspot", email: "alice@co.com" });
    const entityB = makeEntity({ id: "b", sourceSystem: null, email: "alice@co.com" });

    mockEntityFindMany.mockResolvedValue([entityA, entityB]);

    const result = await runDeterministicMerges("op1");

    expect(result.mergesExecuted).toBe(1);
    expect(mockEntityMergeLogCreate).toHaveBeenCalled();
  });

  // Fix 4: scoped entityIds finds merge partners from previous syncs
  it("finds merge partners from previous syncs when scoped by entityIds", async () => {
    const entityA = makeEntity({ id: "a", sourceSystem: "hubspot", email: "alice@co.com" });
    const entityB = makeEntity({ id: "b", sourceSystem: "gmail", email: "alice@co.com" });

    // Step 1: scoped email query returns the email from entity B
    mockPropertyValueFindMany.mockResolvedValueOnce([{ value: "alice@co.com" }]);
    // Step 2: operator-wide query returns both A and B
    mockEntityFindMany.mockResolvedValue([entityA, entityB]);

    const result = await runDeterministicMerges("op1", ["b"]);

    expect(result.mergesExecuted).toBe(1);
    // propertyValue.findMany called first for scoped email lookup
    expect(mockPropertyValueFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityId: { in: ["b"] },
          property: { identityRole: "email" },
        }),
      }),
    );
  });
});

describe("mergeEntities redirects Situation.triggerEntityId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMergeEntityMocks();
  });

  it("updates triggerEntityId from absorbed to survivor during merge", async () => {
    const entityA = makeEntity({ id: "survivor", sourceSystem: "hubspot", email: "test@co.com" });
    const entityB = makeEntity({ id: "absorbed", sourceSystem: "gmail", email: "test@co.com" });

    mockEntityFindMany.mockResolvedValue([entityA, entityB]);

    await runDeterministicMerges("op1");

    // situation.updateMany should redirect triggerEntityId
    expect(mockSituationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { triggerEntityId: "absorbed" },
        data: { triggerEntityId: "survivor" },
      }),
    );
  });
});

describe("ML scoring skips merged entities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMergeEntityMocks();
  });

  it("runIdentityResolution filters status: merged in entity query", async () => {
    const { runIdentityResolution } = await import("@/lib/identity-resolution");

    mockEntityFindUnique.mockResolvedValue({ id: "merged1", status: "merged" });
    mockQueryRawUnsafe.mockResolvedValue([]);

    const result = await runIdentityResolution("op1", ["merged1"]);

    expect(result.autoMerged).toBe(0);
    expect(result.suggested).toBe(0);
  });
});

describe("connector-sync integration order", () => {
  it("runDeterministicMerges is called before runIdentityResolution in connector-sync", async () => {
    const mod = await import("@/lib/identity-resolution");

    expect(typeof mod.runDeterministicMerges).toBe("function");
    expect(typeof mod.runIdentityResolution).toBe("function");

    mockEntityFindMany.mockResolvedValue([]);
    const result = await mod.runDeterministicMerges("op1");
    expect(result).toHaveProperty("mergesExecuted");
    expect(result).toHaveProperty("mergeLogIds");
  });
});
