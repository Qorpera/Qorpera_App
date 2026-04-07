// ── Web Search via Brave Search API ─────────────────────────────────
// Provides web search capability for agentic reasoning loops.
// Used by system jobs for competitive monitoring, legal tracking,
// market intelligence, and any external information gathering.

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY;
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

interface SearchResult {
  title: string;
  url: string;
  description: string;
  age?: string;
}

export async function webSearch(
  query: string,
  options?: { count?: number; freshness?: "day" | "week" | "month" },
): Promise<{ results: SearchResult[]; query: string }> {
  if (!BRAVE_API_KEY) {
    return { results: [], query };
  }

  const params = new URLSearchParams({
    q: query,
    count: String(options?.count ?? 5),
    text_decorations: "false",
    search_lang: "en",
  });
  if (options?.freshness) {
    params.set("freshness", options.freshness);
  }

  try {
    const response = await fetch(`${BRAVE_SEARCH_URL}?${params}`, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": BRAVE_API_KEY,
      },
    });

    if (!response.ok) {
      console.warn(`[web-search] Brave API returned ${response.status}`);
      return { results: [], query };
    }

    const data = await response.json();
    const webResults = data?.web?.results ?? [];

    return {
      query,
      results: webResults.slice(0, options?.count ?? 5).map((r: Record<string, unknown>) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        description: r.description ?? "",
        age: r.age ?? undefined,
      })),
    };
  } catch (err) {
    console.error("[web-search] Search failed:", err);
    return { results: [], query };
  }
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return "No results found.";
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.description}${r.age ? ` (${r.age})` : ""}`)
    .join("\n\n");
}
