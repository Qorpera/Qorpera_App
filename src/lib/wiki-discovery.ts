import { prisma } from "@/lib/db";
import { embedChunks } from "@/lib/rag/embedder";

export interface WikiDiscoveryEntry {
  slug: string;
  title: string;
  pageType: string;
  confidence: number;
  contentPreview: string; // first ~150 chars only
}

/**
 * Discover available system wiki pages relevant to a query.
 * Returns metadata only (no full content) — the model reads pages
 * on-demand via read_wiki_page during investigation.
 *
 * Hub pages (those with many cross-references) are boosted in ranking
 * because they provide better entry points into the knowledge graph.
 *
 * Gated by operator.intelligenceAccess.
 */
export async function discoverSystemExpertise(
  operatorId: string,
  query: string,
  maxResults: number = 15,
): Promise<WikiDiscoveryEntry[]> {
  // Gate check
  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { intelligenceAccess: true },
  });
  if (!operator?.intelligenceAccess) return [];

  const embeddings = await embedChunks([query]).catch(() => [null]);
  if (!embeddings[0]) return [];

  const embeddingStr = `[${embeddings[0].join(",")}]`;

  // Query with cross-reference count for hub detection
  const results = await prisma.$queryRawUnsafe<Array<{
    slug: string;
    title: string;
    pageType: string;
    confidence: number;
    content: string;
    crossRefCount: number;
    similarity: number;
  }>>(
    `SELECT slug, title, "pageType", confidence, LEFT(content, 200) as content,
            array_length("crossReferences", 1) as "crossRefCount",
            1 - (embedding <=> $1::vector) as similarity
     FROM "KnowledgePage"
     WHERE scope = 'system'
       AND status IN ('verified', 'draft')
       AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    embeddingStr,
    maxResults * 2, // Fetch more, then re-rank
  );

  // Re-rank: boost pages with many cross-references (hub pages)
  // A page with 10+ cross-references is likely a hub/overview page
  const scored = results.map(r => ({
    ...r,
    crossRefCount: r.crossRefCount ?? 0,
    // Hub boost: pages with many outgoing links are better entry points
    score: r.similarity + Math.min((r.crossRefCount ?? 0) * 0.02, 0.15),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResults).map(r => ({
    slug: r.slug,
    title: r.title,
    pageType: r.pageType,
    confidence: r.confidence,
    contentPreview: r.content.slice(0, 150) + (r.content.length > 150 ? "..." : ""),
  }));
}
