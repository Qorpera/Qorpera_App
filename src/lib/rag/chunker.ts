/**
 * Document chunker: splits text into overlapping chunks respecting paragraph boundaries.
 *
 * Default: ~500 tokens per chunk, 50 token overlap.
 * Token estimation: characters / 4 (rough, sufficient for pilot scale).
 */

export interface Chunk {
  content: string;
  chunkIndex: number;
  tokenCount: number;
}

interface ChunkOptions {
  chunkSize?: number; // target tokens per chunk, default 500
  overlap?: number; // overlap tokens, default 50
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkDocument(text: string, options?: ChunkOptions): Chunk[] {
  const chunkSize = options?.chunkSize ?? 500;
  const overlap = options?.overlap ?? 50;
  const overlapChars = overlap * 4;

  if (!text || text.trim().length === 0) return [];

  // If the whole document fits in one chunk, return it
  if (estimateTokens(text) <= chunkSize * 1.2) {
    return [{ content: text.trim(), chunkIndex: 0, tokenCount: estimateTokens(text) }];
  }

  // Split into paragraphs first
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  const chunks: Chunk[] = [];
  let currentChunk = "";
  let chunkIndex = 0;

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
        });
        // Keep overlap from end of current chunk
        const words = currentChunk.trim().split(/\s+/);
        const overlapWords = Math.ceil(overlapChars / 5); // ~5 chars per word
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
        });
        // Keep overlap from end of current chunk
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
    });
  }

  return chunks;
}
