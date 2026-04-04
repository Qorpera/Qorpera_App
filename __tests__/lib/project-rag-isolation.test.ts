vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/rag/embedder", () => ({
  embedChunks: vi.fn(),
}));

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";

const mockPrisma = prisma as unknown as {
  $queryRawUnsafe: ReturnType<typeof vi.fn>;
};

// Capture SQL queries passed to $queryRawUnsafe
let capturedQueries: { sql: string; params: unknown[] }[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  capturedQueries = [];
  mockPrisma.$queryRawUnsafe = vi.fn((...args: unknown[]) => {
    capturedQueries.push({ sql: args[0] as string, params: args.slice(1) });
    return Promise.resolve([]);
  });
});

// Helper: dummy embedding vector
const dummyEmbedding = Array(1536).fill(0.1);

describe("Project RAG isolation", () => {
  it("operator queries exclude project content by default", async () => {
    const { retrieveRelevantChunks } = await import("@/lib/rag/retriever");

    await retrieveRelevantChunks("op1", dummyEmbedding, {});

    expect(capturedQueries.length).toBeGreaterThan(0);
    const mainQuery = capturedQueries[0].sql;
    expect(mainQuery).toContain('"projectId" IS NULL');
    // Must NOT contain a parameterized projectId
    expect(mainQuery).not.toMatch(/"projectId" = \$\d/);
  });

  it("project queries scope to specific project", async () => {
    const { retrieveRelevantChunks } = await import("@/lib/rag/retriever");

    await retrieveRelevantChunks("op1", dummyEmbedding, {
      projectId: "proj123",
    });

    expect(capturedQueries.length).toBeGreaterThan(0);
    const mainQuery = capturedQueries[0].sql;
    expect(mainQuery).toMatch(/"projectId" = \$\d/);
    // projectId should be in params
    expect(capturedQueries[0].params).toContain("proj123");
    // Must NOT contain IS NULL for projectId
    expect(mainQuery).not.toContain('"projectId" IS NULL');
  });

  it("ContentChunkResult type includes projectId field", async () => {
    mockPrisma.$queryRawUnsafe = vi.fn().mockResolvedValue([
      {
        id: "c1",
        content: "test",
        sourceType: "uploaded_doc",
        sourceId: "doc1",
        entityId: null,
        projectId: "proj1",
        departmentIds: null,
        metadata: null,
        chunkIndex: 0,
        tokenCount: 10,
        score: 0.9,
      },
    ]);

    const { retrieveRelevantChunks } = await import("@/lib/rag/retriever");
    const results = await retrieveRelevantChunks("op1", dummyEmbedding, {
      projectId: "proj1",
    });

    expect(results.length).toBe(1);
    expect(results[0].projectId).toBe("proj1");
  });

  it("legacy retrieveRelevantContext passes projectId through", async () => {
    const { embedChunks } = await import("@/lib/rag/embedder");
    (embedChunks as ReturnType<typeof vi.fn>).mockResolvedValue([dummyEmbedding]);

    const { retrieveRelevantContext } = await import("@/lib/rag/retriever");

    await retrieveRelevantContext("test query", "op1", [], 5, undefined, "proj456");

    expect(capturedQueries.length).toBeGreaterThan(0);
    const mainQuery = capturedQueries[0].sql;
    expect(mainQuery).toMatch(/"projectId" = \$\d/);
    expect(capturedQueries[0].params).toContain("proj456");
  });
});
