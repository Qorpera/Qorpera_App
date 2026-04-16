import { prisma } from "@/lib/db";

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

  // Full-text search with cross-reference count for hub detection
  const results = await prisma.$queryRawUnsafe<Array<{
    slug: string;
    title: string;
    pageType: string;
    confidence: number;
    content: string;
    crossRefCount: number;
    rank: number;
  }>>(
    `SELECT slug, title, "pageType", confidence, LEFT(content, 200) as content,
            array_length("crossReferences", 1) as "crossRefCount",
            ts_rank("searchVector", websearch_to_tsquery('english', $1)) as rank
     FROM "KnowledgePage"
     WHERE scope = 'system'
       AND status IN ('verified', 'draft')
       AND "searchVector" @@ websearch_to_tsquery('english', $1)
       AND ("stagingStatus" IS NULL OR "stagingStatus" = 'approved')
     ORDER BY rank DESC
     LIMIT $2`,
    query,
    maxResults * 2, // Fetch more, then re-rank
  );

  if (results.length === 0) return [];

  // Re-rank: boost pages with many cross-references (hub pages)
  const scored = results.map(r => ({
    ...r,
    crossRefCount: r.crossRefCount ?? 0,
    // Hub boost: pages with many outgoing links are better entry points
    score: r.rank + Math.min((r.crossRefCount ?? 0) * 0.002, 0.015),
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
