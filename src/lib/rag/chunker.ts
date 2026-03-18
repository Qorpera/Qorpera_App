/**
 * Document chunker: splits text into overlapping chunks respecting paragraph boundaries.
 * Structure-aware: detects headings/sections and prefers splitting at section boundaries.
 *
 * Default: ~500 tokens per chunk, 50 token overlap.
 * Token estimation: characters / 4 (rough, sufficient for pilot scale).
 */

export interface Chunk {
  content: string;
  chunkIndex: number;
  tokenCount: number;
  sectionTitle?: string;
}

interface ChunkOptions {
  chunkSize?: number; // target tokens per chunk, default 500
  overlap?: number; // overlap tokens, default 50
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// --- Section detection ---

const HEADING_PATTERNS = [
  /^#{1,4}\s+.+/,                                    // Markdown: # Heading
  /^\d+\.\s+[A-Z]/,                                  // Numbered: 1. Section
  /^\d+\.\d+\.?\s+/,                                 // Sub-numbered: 1.1 or 1.1.
  /^(?:Section|SECTION|Article|ARTICLE)\s+\d/i,      // Explicit section labels
  /^[A-Z][A-Z\s]{2,50}$/,                            // ALL CAPS short lines (likely headers)
];

function isHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 100) return false;
  return HEADING_PATTERNS.some((p) => p.test(trimmed));
}

function extractHeadingTitle(line: string): string {
  return line.trim().replace(/^#{1,4}\s+/, "").trim();
}

interface Section {
  title?: string;
  content: string;
}

function parseSections(text: string): Section[] {
  const lines = text.split("\n");
  const sections: Section[] = [];
  let currentTitle: string | undefined;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (isHeading(line) && currentLines.some((l) => l.trim().length > 0)) {
      // Flush current section
      const content = currentLines.join("\n").trim();
      if (content) sections.push({ title: currentTitle, content });
      currentTitle = extractHeadingTitle(line);
      currentLines = [];
    } else if (isHeading(line) && currentLines.every((l) => l.trim().length === 0)) {
      // First heading or consecutive headings — update title
      currentTitle = extractHeadingTitle(line);
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Flush final section
  const remaining = currentLines.join("\n").trim();
  if (remaining) sections.push({ title: currentTitle, content: remaining });

  // If no sections detected (no headings), return whole text as single section
  if (sections.length === 0) {
    sections.push({ content: text.trim() });
  }

  return sections;
}

// --- Paragraph-based chunking (core algorithm, unchanged) ---

function chunkParagraphs(
  text: string,
  chunkSize: number,
  overlapChars: number,
  sectionTitle: string | undefined,
  startIndex: number,
): Chunk[] {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  const chunks: Chunk[] = [];
  let currentChunk = "";
  let chunkIndex = startIndex;

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();

    // If a single paragraph exceeds chunk size, split it by sentences
    if (estimateTokens(trimmed) > chunkSize * 1.5) {
      // Flush current chunk first
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          chunkIndex: chunkIndex++,
          tokenCount: estimateTokens(currentChunk.trim()),
          sectionTitle,
        });
        const words = currentChunk.trim().split(/\s+/);
        const overlapWords = Math.ceil(overlapChars / 5);
        currentChunk = words.slice(-overlapWords).join(" ") + "\n\n";
      }

      // Split long paragraph by sentences
      const sentences = trimmed.match(/[^.!?]+[.!?]+\s*/g) || [trimmed];
      for (const sentence of sentences) {
        if (estimateTokens(currentChunk + sentence) > chunkSize) {
          if (currentChunk.trim()) {
            chunks.push({
              content: currentChunk.trim(),
              chunkIndex: chunkIndex++,
              tokenCount: estimateTokens(currentChunk.trim()),
              sectionTitle,
            });
            const words = currentChunk.trim().split(/\s+/);
            const overlapWords = Math.ceil(overlapChars / 5);
            currentChunk = words.slice(-overlapWords).join(" ") + " ";
          }
        }
        currentChunk += sentence;
      }
      continue;
    }

    // Would adding this paragraph exceed the chunk size?
    if (estimateTokens(currentChunk + "\n\n" + trimmed) > chunkSize) {
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          chunkIndex: chunkIndex++,
          tokenCount: estimateTokens(currentChunk.trim()),
          sectionTitle,
        });
        const words = currentChunk.trim().split(/\s+/);
        const overlapWords = Math.ceil(overlapChars / 5);
        currentChunk = words.slice(-overlapWords).join(" ") + "\n\n";
      }
    }

    currentChunk += (currentChunk ? "\n\n" : "") + trimmed;
  }

  // Flush remaining
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      chunkIndex: chunkIndex,
      tokenCount: estimateTokens(currentChunk.trim()),
      sectionTitle,
    });
  }

  return chunks;
}

// --- Public API ---

export function chunkDocument(text: string, options?: ChunkOptions): Chunk[] {
  const chunkSize = options?.chunkSize ?? 500;
  const overlap = options?.overlap ?? 50;
  const overlapChars = overlap * 4;

  if (!text || text.trim().length === 0) return [];

  // Parse into sections
  const sections = parseSections(text);

  // If the whole document fits in one chunk AND has no multi-section structure, return as-is
  if (estimateTokens(text) <= chunkSize * 1.2 && sections.length <= 1) {
    return [{ content: text.trim(), chunkIndex: 0, tokenCount: estimateTokens(text), sectionTitle: sections[0]?.title }];
  }
  const allChunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const sectionChunks = chunkParagraphs(
      section.content,
      chunkSize,
      overlapChars,
      section.title,
      chunkIndex,
    );
    allChunks.push(...sectionChunks);
    chunkIndex = allChunks.length;
  }

  return allChunks;
}
