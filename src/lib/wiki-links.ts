/**
 * Tokenizer + renderers for [[slug]] / [page:slug] wiki link markers.
 *
 * The wiki stores cross-references inline as [[slug]] / [page:slug] patterns.
 * This module parses them once into a token stream that the three renderers
 * (plain text, markdown, React) consume. Keep the regex in one place.
 */

export interface WikiLinkTarget {
  title: string;
}

export type WikiLinkLookup = Record<string, WikiLinkTarget>;

export type WikiToken =
  | { kind: "text"; value: string }
  | { kind: "link"; value: string; slug: string };

const LINK_REGEX = /\[\[([a-z0-9-]+)\]\]|\[page:([a-z0-9-]+)\]/g;

export function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

/**
 * Parse `text` into a stream of text and link tokens. Link tokens carry the
 * resolved slug; text tokens carry the raw run between (or around) links.
 * Returns an empty array for empty input.
 */
export function tokenize(text: string): WikiToken[] {
  if (!text) return [];
  const tokens: WikiToken[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(LINK_REGEX)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      tokens.push({ kind: "text", value: text.slice(lastIndex, start) });
    }
    const slug = (match[1] ?? match[2] ?? "").trim();
    if (slug) {
      tokens.push({ kind: "link", value: match[0], slug });
    }
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) {
    tokens.push({ kind: "text", value: text.slice(lastIndex) });
  }
  return tokens;
}

function resolveLabel(slug: string, lookup?: WikiLinkLookup): string {
  return lookup?.[slug]?.title ?? humanizeSlug(slug);
}

/**
 * Replace [[slug]] / [page:slug] markers with the referenced page's title
 * (from `lookup`), falling back to a humanized slug. Returns plain text.
 */
export function resolveWikiLinks(text: string, lookup?: WikiLinkLookup): string {
  if (!text) return text;
  return tokenize(text)
    .map((t) => (t.kind === "text" ? t.value : resolveLabel(t.slug, lookup)))
    .join("");
}

/**
 * Replace [[slug]] / [page:slug] markers with a Markdown wiki link
 * (`[Title](wiki:slug)`) so a Markdown renderer can turn them into clickable
 * cross-page navigation.
 */
export function replaceWikiLinksWithMarkdown(text: string, lookup?: WikiLinkLookup): string {
  if (!text) return text;
  return tokenize(text)
    .map((t) => {
      if (t.kind === "text") return t.value;
      return `[${resolveLabel(t.slug, lookup)}](wiki:${t.slug})`;
    })
    .join("");
}
