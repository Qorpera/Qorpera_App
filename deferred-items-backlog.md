# Deferred items backlog

Small issues logged from reviews. Not blocking, not scoped to the current work — revisit when next in the area.

---

## Unauth deep-link loses context after /login

**Logged:** 2026-04-19 (from v0.3.57 review)
**Severity:** UX polish. Not wiki-specific — applies to every protected route.

Hitting `/wiki/mikkel-toft` (or any authed page) while logged out causes `src/middleware.ts:114-116` to redirect to `/login` without a `?next=/wiki/mikkel-toft` param. After login, the user lands on the default page instead of the one they bookmarked.

**Fix:** 2-3 line change in the session-cookie-missing branch — append `url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search)` before `redirect(url)`, and have `/login` honor `?next=` on successful auth.

---

## 308 stickiness of the legacy /wiki?page= redirect

**Logged:** 2026-04-19 (from v0.3.57 review)
**Severity:** Documentation — no action needed unless the wiki URL shape is revisited.

`src/middleware.ts` issues a 308 (permanent) for `/wiki?page=X → /wiki/X`. Browsers and CDNs may cache the redirect aggressively. Chosen deliberately over 301 to preserve HTTP method and because 308's caching is less universal than 301's. If the wiki URL scheme ever changes again, flip to 302/307 for a grace period before committing to the new permanent mapping.

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
