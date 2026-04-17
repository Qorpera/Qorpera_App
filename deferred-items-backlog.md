# Deferred items backlog

Small issues logged from reviews. Not blocking, not scoped to the current work — revisit when next in the area.

---

## WikiText slice cuts wiki-link tokens

**Logged:** 2026-04-17 (v0.3.42 review)
**Severity:** Cosmetic bug, near-zero risk for promo (seed content is controlled).

`src/app/situations/page.tsx:1290, 1303` truncate prose with `resumeText.slice(0, 500)` and `triggerText.slice(0, 200)` before passing to `<WikiText>`. If the slice boundary lands inside a `[[slug]]` or `[page:slug]` token, the fragment (`[[long-slug-he`) has no closing `]]` and falls through the regex — renders as raw bracket text in the UI.

**Fix options:**
1. Slice first, then parse-and-close any dangling `[[` / `[page:` at the seam (strip or close it).
2. Parse the full text into a token stream first, then truncate at a token boundary (never mid-link).

Either works. (2) is cleaner if we later unify parsing into a shared tokenizer (see "WikiText / wiki-links.ts duplicated parsing" below).

---

## proposedContent preview: `<pre>` → `<WikiText asParagraphs>`

**Logged:** 2026-04-17 (v0.3.42 review)
**Severity:** Cosmetic.

`src/app/initiatives/page.tsx:1480, 1733` render `primary.proposedContent` / `state.proposedContent` inside a `<pre>` block. Any `[[slug]]` tokens in proposedContent render as raw text rather than clickable links.

**Decide based on promo:** if the promo video shows the deliverable preview tab, convert to `<WikiText asParagraphs>` (or a markdown renderer that composes WikiText). If the video doesn't surface this tab, ignore — the `<pre>` is fine for a code-like preview.

---

## `extractCrossReferences` in wiki-engine.ts re-parses the same grammar

**Logged:** 2026-04-17
**Severity:** Maintenance debt (not a bug).

`src/lib/wiki-engine.ts:695` defines a local regex to pull unique slugs out of page content for storage in `KnowledgePage.crossReferences`. Same grammar as the tokenizer in `src/lib/wiki-links.ts`, but storage-layer rather than render-layer.

**Fix:** replace the local regex with `tokenize(content).filter(t => t.kind === "link").map(t => t.slug)` (dedupe with Set). Small, easy — do it next time wiki-engine is open for edits.
