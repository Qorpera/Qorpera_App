/**
 * Render helpers for [[slug]] / [page:slug] wiki link markers.
 *
 * The wiki stores cross-references inline as [[slug]] / [page:slug] patterns.
 * When displaying prose (situation investigation, trigger/context text,
 * step descriptions, etc.) we resolve those markers to the referenced page
 * title, falling back to a humanized slug when we don't have a lookup entry.
 */

export interface WikiLinkTarget {
  title: string;
}

export type WikiLinkLookup = Record<string, WikiLinkTarget>;

const LINK_REGEX = /\[\[([a-z0-9-]+)\]\]|\[page:([a-z0-9-]+)\]/g;

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

/**
 * Replace [[slug]] / [page:slug] markers with the referenced page's title
 * (from `lookup`), falling back to a humanized slug. Returns plain text.
 */
export function resolveWikiLinks(text: string, lookup?: WikiLinkLookup): string {
  if (!text) return text;
  return text.replace(LINK_REGEX, (_, s1: string | undefined, s2: string | undefined) => {
    const slug = (s1 ?? s2 ?? "").trim();
    if (!slug) return "";
    const ref = lookup?.[slug];
    return ref?.title ?? humanizeSlug(slug);
  });
}

/**
 * Replace [[slug]] / [page:slug] markers with a Markdown wiki link
 * (`[Title](wiki:slug)`) so a Markdown renderer can turn them into clickable
 * cross-page navigation.
 */
export function replaceWikiLinksWithMarkdown(text: string, lookup?: WikiLinkLookup): string {
  if (!text) return text;
  return text.replace(LINK_REGEX, (_, s1: string | undefined, s2: string | undefined) => {
    const slug = (s1 ?? s2 ?? "").trim();
    if (!slug) return "";
    const label = lookup?.[slug]?.title ?? humanizeSlug(slug);
    return `[${label}](wiki:${slug})`;
  });
}
