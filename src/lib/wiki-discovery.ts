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

  // Semantic search on system wiki — embeddings only, light projection
  const embeddings = await embedChunks([query]).catch(() => [null]);
  if (!embeddings[0]) return [];

  const embeddingStr = `[${embeddings[0].join(",")}]`;

  const results = await prisma.$queryRawUnsafe<Array<{
    slug: string;
    title: string;
    pageType: string;
    confidence: number;
    content: string;
  }>>(
    `SELECT slug, title, "pageType", confidence, LEFT(content, 200) as content
     FROM "KnowledgePage"
     WHERE scope = 'system'
       AND status = 'verified'
       AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    embeddingStr,
    maxResults,
  );

  return results.map(r => ({
    slug: r.slug,
    title: r.title,
    pageType: r.pageType,
    confidence: r.confidence,
    contentPreview: r.content.slice(0, 150) + (r.content.length > 150 ? "..." : ""),
  }));
}
