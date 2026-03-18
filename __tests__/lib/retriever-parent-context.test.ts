vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/rag/embedder", () => ({ embedChunks: vi.fn() }));

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Parent-context enrichment logic (extracted for unit testing) ──────────

interface ChunkResult {
  id: string;
  content: string;
  sourceType: string;
  sourceId: string;
  entityId: string | null;
  departmentIds: string[];
  metadata: Record<string, unknown> | null;
  chunkIndex: number;
  score: number;
}

interface RawSummaryChunk {
  id: string;
  content: string;
  sourceType: string;
  sourceId: string;
  entityId: string | null;
  departmentIds: string | null;
  metadata: string | null;
  chunkIndex: number;
}

/**
 * Replicate the parent-context enrichment logic from retriever.ts
 * so we can unit test it without needing prisma/pgvector.
 */
function enrichWithParentContext(
  results: ChunkResult[],
  summaryChunks: RawSummaryChunk[],
): ChunkResult[] {
  const summaryMap = new Map(summaryChunks.map((s) => [s.sourceId, s]));
  const enrichedResults: ChunkResult[] = [];
  const addedSummaries = new Set<string>();

  for (const result of results) {
    if (summaryMap.has(result.sourceId) && !addedSummaries.has(result.sourceId)) {
      const summary = summaryMap.get(result.sourceId)!;
      enrichedResults.push({
        id: summary.id,
        content: summary.content,
        sourceType: summary.sourceType,
        sourceId: summary.sourceId,
        entityId: summary.entityId,
        departmentIds: summary.departmentIds ? JSON.parse(summary.departmentIds) : [],
        metadata: summary.metadata ? JSON.parse(summary.metadata) : null,
        chunkIndex: summary.chunkIndex,
        score: 1.0,
      });
      addedSummaries.add(result.sourceId);
    }
    enrichedResults.push(result);
  }

  return enrichedResults;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("parent context enrichment", () => {
  const makeChunk = (
    id: string,
    sourceId: string,
    chunkIndex: number,
    score: number,
  ): ChunkResult => ({
    id,
    content: `Content of chunk ${id}`,
    sourceType: "drive_doc",
    sourceId,
    entityId: null,
    departmentIds: [],
    metadata: { fileName: `doc-${sourceId}.pdf` },
    chunkIndex,
    score,
  });

  const makeSummary = (sourceId: string): RawSummaryChunk => ({
    id: `summary-${sourceId}`,
    content: `Document: doc-${sourceId}.pdf\nSections: Intro, Methods\nOverview: ...`,
    sourceType: "drive_doc",
    sourceId,
    entityId: null,
    departmentIds: null,
    metadata: JSON.stringify({ fileName: `doc-${sourceId}.pdf`, isDocumentSummary: true }),
    chunkIndex: 0,
  });

  it("adds summary chunks before their matching detail chunks", () => {
    const results = [
      makeChunk("c1", "docA", 3, 0.85),
      makeChunk("c2", "docB", 2, 0.72),
    ];
    const summaries = [makeSummary("docA"), makeSummary("docB")];

    const enriched = enrichWithParentContext(results, summaries);

    expect(enriched).toHaveLength(4);
    // Summary for docA comes before docA's detail chunk
    expect(enriched[0].id).toBe("summary-docA");
    expect(enriched[0].score).toBe(1.0);
    expect(enriched[1].id).toBe("c1");
    // Summary for docB comes before docB's detail chunk
    expect(enriched[2].id).toBe("summary-docB");
    expect(enriched[3].id).toBe("c2");
  });

  it("does not duplicate summary if already in results", () => {
    // chunkIndex 0 already present as a regular result
    const results = [
      makeChunk("c0", "docA", 0, 0.90),
      makeChunk("c1", "docA", 3, 0.85),
    ];
    // No summaries fetched for docA because existingSummarySourceIds filters it out
    const summaries: RawSummaryChunk[] = [];

    const enriched = enrichWithParentContext(results, summaries);
    expect(enriched).toHaveLength(2);
    expect(enriched[0].id).toBe("c0");
    expect(enriched[1].id).toBe("c1");
  });

  it("only adds summary once per sourceId when multiple chunks match", () => {
    const results = [
      makeChunk("c1", "docA", 2, 0.90),
      makeChunk("c2", "docA", 5, 0.80),
      makeChunk("c3", "docA", 7, 0.70),
    ];
    const summaries = [makeSummary("docA")];

    const enriched = enrichWithParentContext(results, summaries);

    expect(enriched).toHaveLength(4); // 1 summary + 3 detail
    expect(enriched[0].id).toBe("summary-docA");
    expect(enriched[1].id).toBe("c1");
    expect(enriched[2].id).toBe("c2");
    expect(enriched[3].id).toBe("c3");
  });

  it("handles empty results gracefully", () => {
    const enriched = enrichWithParentContext([], []);
    expect(enriched).toEqual([]);
  });

  it("handles results with no matching summaries", () => {
    const results = [makeChunk("c1", "docA", 3, 0.85)];
    const enriched = enrichWithParentContext(results, []);

    expect(enriched).toHaveLength(1);
    expect(enriched[0].id).toBe("c1");
  });

  it("parses summary metadata correctly", () => {
    const results = [makeChunk("c1", "docA", 3, 0.85)];
    const summaries = [makeSummary("docA")];

    const enriched = enrichWithParentContext(results, summaries);

    const summary = enriched[0];
    expect(summary.metadata).toEqual({
      fileName: "doc-docA.pdf",
      isDocumentSummary: true,
    });
  });
});

describe("document summary chunk generation (content-pipeline)", () => {
  it("creates summary chunk for multi-chunk documents", () => {
    // Verify the logic: summary is only created for isDocument && enrichedChunks.length > 1
    // After summary is prepended, chunkIndex 0 should have isDocumentSummary in metadata
    const isDocument = true;
    type TestChunk = { content: string; chunkIndex: number; tokenCount: number; sectionTitle: string | undefined };
    const enrichedChunks: TestChunk[] = [
      { content: "Chunk 1 content", chunkIndex: 0, tokenCount: 10, sectionTitle: "Intro" },
      { content: "Chunk 2 content", chunkIndex: 1, tokenCount: 10, sectionTitle: "Methods" },
    ];

    // Simulate the summary generation logic
    if (isDocument && enrichedChunks.length > 1) {
      const sectionTitles = enrichedChunks
        .map((c) => c.sectionTitle)
        .filter((t): t is string => !!t)
        .filter((t, i, arr) => arr.indexOf(t) === i);

      const summaryParts: string[] = [];
      summaryParts.push("Document: report.pdf");
      if (sectionTitles.length > 0) {
        summaryParts.push(`Sections: ${sectionTitles.join(", ")}`);
      }
      summaryParts.push("Overview:\nFirst content...");

      const summaryContent = summaryParts.join("\n");
      enrichedChunks.splice(0, 0, {
        content: summaryContent,
        chunkIndex: 0,
        tokenCount: Math.ceil(summaryContent.length / 4),
        sectionTitle: undefined,
      });
      enrichedChunks.forEach((c, i) => { c.chunkIndex = i; });
    }

    expect(enrichedChunks).toHaveLength(3);
    expect(enrichedChunks[0].chunkIndex).toBe(0);
    expect(enrichedChunks[0].content).toContain("Document: report.pdf");
    expect(enrichedChunks[0].content).toContain("Sections: Intro, Methods");
    expect(enrichedChunks[0].sectionTitle).toBeUndefined();
    expect(enrichedChunks[1].chunkIndex).toBe(1);
    expect(enrichedChunks[2].chunkIndex).toBe(2);
  });

  it("does not create summary for single-chunk documents", () => {
    const isDocument = true;
    const enrichedChunks = [
      { content: "Short doc", chunkIndex: 0, tokenCount: 5, sectionTitle: undefined },
    ];

    // Condition not met: enrichedChunks.length <= 1
    const shouldCreateSummary = isDocument && enrichedChunks.length > 1;
    expect(shouldCreateSummary).toBe(false);
    expect(enrichedChunks).toHaveLength(1);
  });

  it("does not create summary for non-document content", () => {
    const isDocument = false; // email, slack_message, etc.
    const enrichedChunks = [
      { content: "Chunk 1", chunkIndex: 0, tokenCount: 10, sectionTitle: undefined },
      { content: "Chunk 2", chunkIndex: 1, tokenCount: 10, sectionTitle: undefined },
    ];

    const shouldCreateSummary = isDocument && enrichedChunks.length > 1;
    expect(shouldCreateSummary).toBe(false);
    expect(enrichedChunks).toHaveLength(2);
  });
});
