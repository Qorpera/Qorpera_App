"use client";

import Link from "next/link";
import { memo } from "react";

interface WikiTextProps {
  text: string;
  crossReferences?: Record<string, { title: string; slug?: string }>;
  className?: string;
  style?: React.CSSProperties;
  /**
   * If true, splits text on newlines and renders each line as a separate
   * paragraph. Defaults to false — use for prose sections like trigger,
   * investigation, and context.
   */
  asParagraphs?: boolean;
}

const WIKI_LINK_REGEX = /\[\[([a-z0-9-]+)\]\]|\[page:([a-z0-9-]+)\]/g;

/**
 * Render markdown-ish text with [[slug]] and [page:slug] wiki references
 * converted to actual anchor tags pointing to /wiki/{slug}.
 *
 * Resolved anchors use the title from crossReferences when available,
 * falling back to a humanized slug.
 *
 * Links render in blue with an underline and pass through Next.js <Link>
 * for client-side navigation.
 */
function WikiTextInner({ text, crossReferences, className, style, asParagraphs }: WikiTextProps) {
  if (!text) return null;

  const renderLine = (line: string, keyPrefix: string) => {
    const out: Array<string | React.ReactElement> = [];
    let lastIndex = 0;
    let matchIndex = 0;

    for (const match of line.matchAll(WIKI_LINK_REGEX)) {
      const fullMatch = match[0];
      const slug = (match[1] ?? match[2] ?? "").trim();
      const start = match.index ?? 0;
      if (start > lastIndex) {
        out.push(line.slice(lastIndex, start));
      }
      if (slug) {
        const ref = crossReferences?.[slug];
        const label = ref?.title
          ?? slug.split("-").map(w => w ? w[0].toUpperCase() + w.slice(1) : "").join(" ");
        out.push(
          <Link
            key={`${keyPrefix}-${matchIndex}`}
            href={`/wiki/${slug}`}
            style={{ color: "var(--link, #3B82F6)", textDecoration: "underline" }}
          >
            {label}
          </Link>
        );
      }
      lastIndex = start + fullMatch.length;
      matchIndex += 1;
    }
    if (lastIndex < line.length) {
      out.push(line.slice(lastIndex));
    }
    return out.length > 0 ? out : [line];
  };

  if (asParagraphs) {
    const lines = text.split("\n").filter(l => l.trim().length > 0);
    return (
      <div className={className} style={style}>
        {lines.map((line, i) => (
          <p key={i} style={{ marginBottom: 6 }}>
            {renderLine(line, `l${i}`)}
          </p>
        ))}
      </div>
    );
  }

  return (
    <span className={className} style={style}>
      {renderLine(text, "l0")}
    </span>
  );
}

export const WikiText = memo(WikiTextInner);
