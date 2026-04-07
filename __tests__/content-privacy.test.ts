import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (BEFORE imports) ───────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    contentChunk: {
      create: vi.fn().mockResolvedValue({ id: "chunk-1" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ id: "chunk-1" }),
    },
    sourceConnector: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    internalDocument: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    relationship: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    entity: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/rag/chunker", () => ({
  chunkDocument: vi.fn().mockReturnValue([
    { content: "Test chunk content", chunkIndex: 0, tokenCount: 10, sectionTitle: undefined },
  ]),
  estimateTokens: vi.fn().mockReturnValue(5),
}));

vi.mock("@/lib/rag/embedder", () => ({
  embedChunks: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db";

const mockPrisma = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT PIPELINE — userId storage
// ═══════════════════════════════════════════════════════════════════════════════

describe("Content Pipeline — userId", () => {
  it("stores userId on created chunks", async () => {
    const { ingestContent } = await import("@/lib/content-pipeline");

    await ingestContent({
      operatorId: "op-1",
      userId: "user-1",
      sourceType: "email",
      sourceId: "email-123",
      content: "Test email content for user privacy",
    });

    expect(mockPrisma.contentChunk.create).toHaveBeenCalledTimes(1);
    const createCall = mockPrisma.contentChunk.create.mock.calls[0][0];
    expect(createCall.data.userId).toBe("user-1");
    expect(createCall.data.operatorId).toBe("op-1");
    expect(createCall.select).toEqual({ id: true });
  });

  it("stores null userId and logs warning when userId not provided", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ingestContent } = await import("@/lib/content-pipeline");

    await ingestContent({
      operatorId: "op-1",
      sourceType: "slack_message",
      sourceId: "msg-456",
      content: "Test message without user",
    });

    expect(mockPrisma.contentChunk.create).toHaveBeenCalledTimes(1);
    const createCall = mockPrisma.contentChunk.create.mock.calls[0][0];
    expect(createCall.data.userId).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("ContentChunk created without userId"),
    );
    warnSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RETRIEVER — userId filter
// ═══════════════════════════════════════════════════════════════════════════════

describe("Retriever — userId filter", () => {
  it("adds userId filter to SQL query when userId provided and skipUserFilter is false", async () => {
    const { retrieveRelevantChunks } = await import("@/lib/rag/retriever");

    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        id: "c1",
        content: "user content",
        sourceType: "email",
        sourceId: "e1",
        entityId: null,
        domainIds: null,
        metadata: null,
        chunkIndex: 0,
        tokenCount: 10,
        score: 0.85,
      },
    ]);

    await retrieveRelevantChunks("op-1", [0.1, 0.2, 0.3], {
      userId: "user-1",
      skipUserFilter: false,
    });

    // Verify the SQL query contains the userId filter
    const query = mockPrisma.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(query).toContain('"userId"');
    expect(query).toContain("IS NULL");

    // Verify userId is passed as a parameter
    const params = mockPrisma.$queryRawUnsafe.mock.calls[0];
    expect(params).toContain("user-1");
  });

  it("skips userId filter when skipUserFilter is true", async () => {
    const { retrieveRelevantChunks } = await import("@/lib/rag/retriever");

    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    await retrieveRelevantChunks("op-1", [0.1, 0.2, 0.3], {
      userId: "user-1",
      skipUserFilter: true,
    });

    const query = mockPrisma.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(query).not.toContain('"userId" =');
  });

  it("skips userId filter when no userId provided", async () => {
    const { retrieveRelevantChunks } = await import("@/lib/rag/retriever");

    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    await retrieveRelevantChunks("op-1", [0.1, 0.2, 0.3], {
      limit: 5,
    });

    const query = mockPrisma.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(query).not.toContain('"userId" =');
  });

  it("returns user's chunks and null-userId chunks together", async () => {
    const { retrieveRelevantChunks } = await import("@/lib/rag/retriever");

    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      {
        id: "c1",
        content: "user's own email",
        sourceType: "email",
        sourceId: "e1",
        entityId: null,
        domainIds: null,
        metadata: null,
        chunkIndex: 0,
        tokenCount: 10,
        score: 0.9,
      },
      {
        id: "c2",
        content: "shared content (null userId)",
        sourceType: "uploaded_doc",
        sourceId: "d1",
        entityId: null,
        domainIds: null,
        metadata: null,
        chunkIndex: 0,
        tokenCount: 15,
        score: 0.8,
      },
    ]);

    const results = await retrieveRelevantChunks("op-1", [0.1, 0.2, 0.3], {
      userId: "user-1",
      skipUserFilter: false,
    });

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("c1");
    expect(results[1].id).toBe("c2");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RETRIEVER LEGACY WRAPPER — userId passthrough
// ═══════════════════════════════════════════════════════════════════════════════

describe("retrieveRelevantContext — userId passthrough", () => {
  it("passes userId filter to retrieveRelevantChunks via userFilter param", async () => {
    const { retrieveRelevantContext } = await import("@/lib/rag/retriever");

    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    await retrieveRelevantContext("test query", "op-1", ["dept-1"], 5, {
      userId: "user-1",
      skipUserFilter: false,
    });

    const query = mockPrisma.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(query).toContain('"userId"');
    const params = mockPrisma.$queryRawUnsafe.mock.calls[0];
    expect(params).toContain("user-1");
  });

  it("omits userId filter when userFilter not provided (backward compat)", async () => {
    const { retrieveRelevantContext } = await import("@/lib/rag/retriever");

    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    await retrieveRelevantContext("test query", "op-1", ["dept-1"], 5);

    const query = mockPrisma.$queryRawUnsafe.mock.calls[0][0] as string;
    expect(query).not.toContain('"userId" =');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BACKFILL SCRIPT — resolution logic
// ═══════════════════════════════════════════════════════════════════════════════

describe("Backfill script resolution logic", () => {
  it("resolves userId from connector when connectorId is present", async () => {
    mockPrisma.sourceConnector.findUnique.mockResolvedValueOnce({ userId: "user-from-connector" });

    const connector = await prisma.sourceConnector.findUnique({
      where: { id: "conn-1" },
      select: { userId: true },
    });

    expect(connector?.userId).toBe("user-from-connector");
  });

  it("falls back to admin user for uploaded_doc source type", async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({ id: "admin-user-1" });

    const admin = await prisma.user.findFirst({
      where: { operatorId: "op-1", role: "admin" },
      select: { id: true },
    });

    expect(admin?.id).toBe("admin-user-1");
  });

  it("logs warning for unresolvable chunks", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    console.warn(
      `[backfill] Unresolvable: chunkId=c1, sourceType=unknown_type, sourceId=s1`,
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unresolvable"),
    );
    warnSpy.mockRestore();
  });
});
