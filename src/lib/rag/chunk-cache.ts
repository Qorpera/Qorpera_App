/**
 * LRU cache for parsed document chunk embeddings.
 * Keyed by departmentId, stores pre-parsed embedding arrays.
 * Max 1000 chunks across all departments.
 * Auto-invalidates on document upload/delete/reprocess.
 */

interface CachedChunk {
  entityId: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  documentName: string;
  departmentName: string;
}

interface DepartmentCache {
  chunks: CachedChunk[];
  loadedAt: number;
}

const cache = new Map<string, DepartmentCache>();
const MAX_TOTAL_CHUNKS = 1000;
const TTL_MS = 5 * 60 * 1000; // 5 minutes

export type { CachedChunk };

export function getCachedChunks(departmentId: string): CachedChunk[] | null {
  const entry = cache.get(departmentId);
  if (!entry) return null;
  if (Date.now() - entry.loadedAt > TTL_MS) {
    cache.delete(departmentId);
    return null;
  }
  return entry.chunks;
}

export function setCachedChunks(departmentId: string, chunks: CachedChunk[]): void {
  // Evict if over limit
  let totalChunks = 0;
  for (const [, entry] of cache) totalChunks += entry.chunks.length;

  while (totalChunks + chunks.length > MAX_TOTAL_CHUNKS && cache.size > 0) {
    // Evict oldest entry
    let oldestKey = "";
    let oldestTime = Infinity;
    for (const [key, entry] of cache) {
      if (entry.loadedAt < oldestTime) {
        oldestTime = entry.loadedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      totalChunks -= cache.get(oldestKey)!.chunks.length;
      cache.delete(oldestKey);
    }
  }

  cache.set(departmentId, { chunks, loadedAt: Date.now() });
}

export function invalidateCache(departmentId?: string): void {
  if (departmentId) {
    cache.delete(departmentId);
  } else {
    cache.clear();
  }
}

export function getCacheStats(): { departments: number; totalChunks: number } {
  let totalChunks = 0;
  for (const [, entry] of cache) totalChunks += entry.chunks.length;
  return { departments: cache.size, totalChunks };
}
