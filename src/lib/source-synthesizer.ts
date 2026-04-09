/**
 * Source synthesis — delta extraction pipeline.
 *
 * Reads source sections and extracts ONLY practitioner delta knowledge
 * that a frontier LLM wouldn't reliably produce on its own. Each page
 * is created as staged (invisible to reasoning) until human review.
 *
 * Many sections correctly produce 0 pages — that means the delta
 * filter is working.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSONArray } from "@/lib/json-helpers";
import { embedChunks } from "@/lib/rag/embedder";

// ── Types ──────────────────────────────────────────────

interface ExtractedPage {
  slug: string;
  title: string;
  pageType: string;
  content: string;
  sourceReference: string;
}

// ── Main ───────────────────────────────────────────────

export async function synthesizeSourceSection(params: {
  sourceId: string;
  sectionId: string;
}): Promise<{ pagesCreated: number; pagesSkipped: boolean }> {
  const { sourceId, sectionId } = params;

  // 1. Load context
  const [section, source] = await Promise.all([
    prisma.sourceSection.findUniqueOrThrow({
      where: { id: sectionId },
      select: { id: true, title: true, titleHierarchy: true, content: true, pageRange: true, tokenCount: true },
    }),
    prisma.sourceDocument.findUniqueOrThrow({
      where: { id: sourceId },
      select: { id: true, title: true, authors: true, domain: true, sourceType: true, sourceAuthority: true },
    }),
  ]);

  // Load existing system wiki page titles (all — list is small enough)
  const existingPages = await prisma.knowledgePage.findMany({
    where: { scope: "system", status: { not: "quarantined" } },
    select: { slug: true, title: true, pageType: true },
    orderBy: { title: "asc" },
  });

  // 2. Call Opus with delta extraction prompt
  const model = getModel("sourceSynthesis");

  const response = await callLLM({
    instructions: DELTA_EXTRACTION_PROMPT,
    messages: [{
      role: "user",
      content: `Source: ${source.title} by ${source.authors || "Unknown"}
Domain: ${source.domain || "General"}
Section: ${section.title} (${section.pageRange || "no page range"})

Existing system reference pages in this domain:
${existingPages.map(p => `- ${p.title} (${p.slug})`).join("\n") || "(none yet)"}

--- SECTION CONTENT ---
${section.content}`,
    }],
    model,
    maxTokens: 65_536,
    thinking: true,
    thinkingBudget: 10_000,
  });

  // 3. Parse response
  const pages = extractJSONArray(response.text) as ExtractedPage[] | null;

  if (!pages || pages.length === 0) {
    await prisma.sourceSection.update({
      where: { id: sectionId },
      data: { status: "complete", pagesProduced: 0 },
    });
    return { pagesCreated: 0, pagesSkipped: pages === null ? false : true };
  }

  // 4. Create wiki pages
  let created = 0;
  for (const item of pages) {
    if (!item.slug || !item.title || !item.content) continue;

    const slug = await resolveUniqueSlug(item.slug);
    const crossRefs = extractCrossRefs(item.content);
    const contentTokens = Math.ceil(item.content.length / 4);

    try {
      const page = await prisma.knowledgePage.create({
        data: {
          operatorId: null,
          scope: "system",
          slug,
          title: item.title,
          pageType: item.pageType || "tacit_knowledge",
          content: item.content,
          contentTokens,
          crossReferences: crossRefs,
          status: "draft",
          stagingStatus: "staged",
          sourceAuthority: source.sourceAuthority,
          sourceDocumentId: source.id,
          sourceDocumentIds: [source.id],
          sourceReference: item.sourceReference,
          sourceReferences: [{
            sourceDocumentId: source.id,
            sourceSectionId: section.id,
            reference: item.sourceReference,
            claimSummary: item.title,
            authority: source.sourceAuthority,
          }] as Prisma.InputJsonValue,
          synthesisPath: "education",
          synthesizedByModel: model,
          confidence: 0.70,
          sourceCount: 1,
          sourceTypes: [source.sourceType],
          sources: [{
            type: "source_document",
            id: source.id,
            sectionId: section.id,
            citation: item.sourceReference,
          }] as Prisma.InputJsonValue,
          lastSynthesizedAt: new Date(),
          version: 1,
        },
        select: { id: true },
      });

      // Embed (fire-and-forget)
      embedPage(page.id, item.content);
      created++;
    } catch (err) {
      console.error(`[source-synthesizer] Failed to create page "${slug}":`, err);
    }
  }

  // 5. Update section and source records
  await prisma.sourceSection.update({
    where: { id: sectionId },
    data: { status: "complete", pagesProduced: created },
  });

  return { pagesCreated: created, pagesSkipped: false };
}

// ── Helpers ─────────────────────────────────────────────

function extractCrossRefs(content: string): string[] {
  const matches = content.match(/\[\[([^\]]+)\]\]/g) || [];
  return [...new Set(matches.map(m => m.slice(2, -2)))];
}

async function resolveUniqueSlug(baseSlug: string): Promise<string> {
  const existing = await prisma.knowledgePage.findFirst({
    where: { scope: "system", slug: baseSlug },
    select: { id: true },
  });
  if (!existing) return baseSlug;

  // Append incrementing suffix
  for (let i = 2; i <= 20; i++) {
    const candidate = `${baseSlug}-${i}`;
    const found = await prisma.knowledgePage.findFirst({
      where: { scope: "system", slug: candidate },
      select: { id: true },
    });
    if (!found) return candidate;
  }

  // Extremely unlikely fallback
  return `${baseSlug}-${Date.now()}`;
}

function embedPage(pageId: string, content: string): void {
  embedChunks([content]).then(([embedding]) => {
    if (embedding) {
      const embeddingStr = `[${embedding.join(",")}]`;
      prisma.$executeRawUnsafe(
        `UPDATE "KnowledgePage" SET "embedding" = $1::vector WHERE "id" = $2`,
        embeddingStr,
        pageId,
      ).catch(() => {});
    }
  }).catch(() => {});
}

// ── Prompt ──────────────────────────────────────────────

const DELTA_EXTRACTION_PROMPT = `You are extracting PRACTITIONER DELTA KNOWLEDGE from a book for a business intelligence system's reference library. This system already has access to a frontier LLM (Claude) with comprehensive general knowledge. Your job is to find ONLY the knowledge that the LLM would NOT reliably produce on its own.

THE CORE TEST: Before extracting anything, ask: "If I gave Claude this task without this book, would Claude get this right?" If yes → SKIP. If no → EXTRACT.

EXTRACT these types of knowledge:
- Tacit practitioner knowledge (things only experience teaches)
- Real-world thresholds, benchmarks, and numbers not in obvious public sources
- Regional/jurisdictional specifics (especially Danish/Nordic deviations from defaults)
- Decision heuristics from pattern recognition across many cases
- Red flag combinations and smell tests
- What actually works vs. what textbooks say works
- Counter-intuitive findings backed by evidence
- Process sequences where order matters and mistakes are costly
- Specific failure modes practitioners have learned to watch for

SKIP these types of knowledge:
- Any framework, methodology, or concept the model already knows (Porter, SWOT, DCF, BATNA, Kotter, etc.)
- Standard definitions and terminology
- Anything easily googleable
- Generic best practices ("diversify revenue", "manage cash flow carefully")
- Regulatory text the model has memorized
- Historical facts

For each piece of extracted knowledge, produce a wiki page as JSON:
{
  "slug": "kebab-case-descriptive",
  "title": "Specific and actionable title (not 'Overview of X')",
  "pageType": "tacit_knowledge" | "benchmarks" | "red_flags" | "decision_heuristics" | "regional_practice" | "process_sequence" | "pattern_recognition" | "counter_intuitive",
  "content": "Dense markdown. Write as if briefing a senior colleague who knows the theory but hasn't worked in this specific market. No filler. No definitions of things they'd already know. Structure: THE INSIGHT → WHEN IT APPLIES → HOW TO USE IT → WATCH OUT FOR. Use [[slug]] for cross-references to related concepts.",
  "sourceReference": "Book Title, Chapter X, pp. Y-Z"
}

If the section contains ONLY knowledge the model already has, return an empty JSON array: []
Many sections will produce nothing. That is correct.

Respond with ONLY a JSON array. No preamble, no markdown fencing.`;
