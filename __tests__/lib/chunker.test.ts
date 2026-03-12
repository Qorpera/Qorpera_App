import { describe, it, expect } from "vitest";
import { chunkDocument } from "@/lib/rag/chunker";

describe("chunkDocument", () => {
  it("returns empty array for empty input", () => {
    expect(chunkDocument("")).toEqual([]);
    expect(chunkDocument("   ")).toEqual([]);
  });

  it("returns single chunk for short text", () => {
    const text = "This is a short document that fits in one chunk.";
    const chunks = chunkDocument(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].content).toBe(text);
    expect(chunks[0].tokenCount).toBeGreaterThan(0);
  });

  it("estimates tokens as characters / 4", () => {
    const text = "a".repeat(400); // 400 chars = 100 tokens
    const chunks = chunkDocument(text);
    expect(chunks[0].tokenCount).toBe(100);
  });

  it("splits long text into multiple chunks", () => {
    // Create text well over 500 tokens (2000+ chars = 500+ tokens)
    const paragraphs = Array.from({ length: 20 }, (_, i) =>
      `Paragraph ${i + 1}. This is enough text to fill a reasonable paragraph with some content that matters for testing the chunker.`
    );
    const text = paragraphs.join("\n\n");
    const chunks = chunkDocument(text);

    expect(chunks.length).toBeGreaterThan(1);
    // Chunk indices should be sequential
    chunks.forEach((chunk, i) => {
      expect(chunk.chunkIndex).toBe(i);
    });
  });

  it("respects paragraph boundaries when possible", () => {
    const paragraph1 = "First paragraph with some content here.";
    const paragraph2 = "Second paragraph with different content.";
    // Short enough to fit in one chunk
    const text = `${paragraph1}\n\n${paragraph2}`;
    const chunks = chunkDocument(text);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("First paragraph");
    expect(chunks[0].content).toContain("Second paragraph");
  });

  it("produces chunks with overlap", () => {
    // Generate enough text for multiple chunks
    const paragraphs = Array.from({ length: 30 }, (_, i) =>
      `This is paragraph number ${i + 1} and it has enough content to contribute meaningfully to the chunk size when combined with others.`
    );
    const text = paragraphs.join("\n\n");
    const chunks = chunkDocument(text);

    if (chunks.length >= 2) {
      // Second chunk should start with some overlap from the first
      // The overlap means some words at the end of chunk N appear at the start of chunk N+1
      const firstChunkWords = chunks[0].content.split(/\s+/);
      const lastWordsOfFirst = firstChunkWords.slice(-10).join(" ");
      // Overlap should appear in second chunk
      expect(chunks[1].content).toContain(
        lastWordsOfFirst.split(" ").slice(0, 3).join(" ")
      );
    }
  });

  it("handles custom chunk size and overlap", () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) =>
      `Paragraph ${i + 1} with enough text to fill reasonable space for testing custom parameters.`
    );
    const text = paragraphs.join("\n\n");

    const smallChunks = chunkDocument(text, { chunkSize: 100, overlap: 20 });
    const largeChunks = chunkDocument(text, { chunkSize: 1000, overlap: 50 });

    // Smaller chunk size should produce more chunks
    expect(smallChunks.length).toBeGreaterThan(largeChunks.length);
  });

  it("handles single very long paragraph by splitting on sentences", () => {
    // One massive paragraph — no double newlines
    const sentences = Array.from({ length: 50 }, (_, i) =>
      `This is sentence number ${i + 1} in a very long paragraph.`
    );
    const text = sentences.join(" ");
    const chunks = chunkDocument(text, { chunkSize: 100, overlap: 10 });

    expect(chunks.length).toBeGreaterThan(1);
    // All chunks should have content
    chunks.forEach((chunk) => {
      expect(chunk.content.trim().length).toBeGreaterThan(0);
    });
  });

  it("never produces empty chunks", () => {
    const texts = [
      "Short.",
      "\n\n\n\nSome text\n\n\n\n",
      "A".repeat(10000),
      Array.from({ length: 100 }, (_, i) => `Line ${i}.`).join("\n\n"),
    ];

    for (const text of texts) {
      const chunks = chunkDocument(text);
      for (const chunk of chunks) {
        expect(chunk.content.trim().length).toBeGreaterThan(0);
        expect(chunk.tokenCount).toBeGreaterThan(0);
      }
    }
  });
});
