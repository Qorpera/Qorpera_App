/**
 * URL-building helper for the wiki's two-dimensional URL scheme:
 * - The active slug lives in the **path** (`/wiki/{slug}` or `/wiki` for the
 *   index).
 * - Filter state (`type`, `q`, `scope`, `domain`) lives in the query string
 *   and survives navigation between slugs.
 *
 * Extracted so it can be unit-tested without a React tree or router mock.
 */
export function buildWikiUrl(
  pathname: string,
  searchParams: URLSearchParams,
  key: string,
  value: string,
): string {
  const p = new URLSearchParams(searchParams.toString());
  if (key === "page") {
    // Page navigation is path-based. Never leave a stale ?page= behind.
    p.delete("page");
    const basePath = value ? `/wiki/${encodeURIComponent(value)}` : "/wiki";
    const qs = p.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }
  if (value) p.set(key, value);
  else p.delete(key);
  const qs = p.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
