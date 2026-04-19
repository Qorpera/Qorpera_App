"use client";

import Link from "next/link";
import { memo } from "react";
import { tokenize, humanizeSlug } from "@/lib/wiki-links";

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

/**
 * Render markdown-ish text with [[slug]] and [page:slug] wiki references
 * converted to actual anchor tags pointing to /wiki/{slug}.
 *
 * Parsing is delegated to `tokenize` in @/lib/wiki-links so that the regex
 * and humanize fallback stay in one place. This component is the JSX mapper
 * over the token stream.
 */
function WikiTextInner({ text, crossReferences, className, style, asParagraphs }: WikiTextProps) {
  if (!text) return null;

  const renderLine = (line: string, keyPrefix: string) => {
    return tokenize(line).map((t, i) => {
      if (t.kind === "text") return t.value;
      const label = crossReferences?.[t.slug]?.title ?? humanizeSlug(t.slug);
      return (
        <Link
          key={`${keyPrefix}-${i}`}
          href={`/wiki/${t.slug}`}
          prefetch={false}
          style={{ color: "var(--link, #3B82F6)", textDecoration: "underline" }}
        >
          {label}
        </Link>
      );
    });
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
