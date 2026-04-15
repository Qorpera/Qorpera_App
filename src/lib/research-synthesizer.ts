/**
 * Research document synthesizer.
 *
 * Takes a research paper or expert document, plans a set of system wiki pages,
 * synthesizes each one from relevant document sections, then verifies them.
 * All pages are system-scoped (operatorId: null, scope: "system").
 */

import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSONArray } from "@/lib/json-helpers";
import { embedTexts } from "@/lib/wiki-embedder";

// ── Types ──────────────────────────────────────────────

interface SynthesisPlan {
  pageType: string;
  title: string;
  slug: string;
  sourceSections: number[];
  synthesisGoal: string;
  updateExisting: string | null;
  crossReferences: string[];
}

interface DocumentSection {
  index: number;
  heading: string;
  content: string;
}

// ── Main ───────────────────────────────────────────────

export async function synthesizeResearchDocument(params: {
  documentContent: string;
  documentTitle: string;
  focusArea?: string;
}): Promise<{ pagesCreated: number; pageIds: string[] }> {
  console.log(`[research-synthesizer] Starting synthesis of "${params.documentTitle}"`);
  const startTime = performance.now();

  // 1. Chunk into logical sections
  const sections = chunkDocument(params.documentContent);
  console.log(`[research-synthesizer] Chunked into ${sections.length} sections`);

  // 2. Planning call — determine what pages to create
  const plan = await planSynthesis(params.documentTitle, sections, params.focusArea);
  console.log(`[research-synthesizer] Plan: ${plan.length} pages`);

  if (plan.length === 0) {
    return { pagesCreated: 0, pageIds: [] };
  }

  // 3. Parallel synthesis (max 5 concurrent)
  const pageIds: string[] = [];
  const CONCURRENCY = 5;

  for (let i = 0; i < plan.length; i += CONCURRENCY) {
    const batch = plan.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((p) => synthesizePage(p, sections, params.documentTitle)),
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        pageIds.push(result.value);
      } else if (result.status === "rejected") {
        console.error("[research-synthesizer] Page synthesis failed:", result.reason);
      }
    }
  }

  const durationMs = Math.round(performance.now() - startTime);
  console.log(`[research-synthesizer] Complete: ${pageIds.length}/${plan.length} pages in ${durationMs}ms`);

  return { pagesCreated: pageIds.length, pageIds };
}

// ── Document Chunking ──────────────────────────────────

function chunkDocument(content: string): DocumentSection[] {
  const sections: DocumentSection[] = [];

  // Split on ## headings first
  const headingRegex = /^##\s+(.+)$/gm;
  const headings: { index: number; heading: string; pos: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(content)) !== null) {
    headings.push({ index: headings.length, heading: match[1], pos: match.index });
  }

  if (headings.length >= 3) {
    for (let i = 0; i < headings.length; i++) {
      const start = headings[i].pos;
      const end = i + 1 < headings.length ? headings[i + 1].pos : content.length;
      sections.push({
        index: i,
        heading: headings[i].heading,
        content: content.slice(start, end).trim(),
      });
    }
  } else {
    // Unstructured: split into ~2000 token blocks (~8000 chars)
    const BLOCK_SIZE = 8000;
    for (let i = 0; i < content.length; i += BLOCK_SIZE) {
      const block = content.slice(i, i + BLOCK_SIZE);
      sections.push({
        index: sections.length,
        heading: `Section ${sections.length + 1}`,
        content: block.trim(),
      });
    }
  }

  return sections;
}

// ── Planning ───────────────────────────────────────────

async function planSynthesis(
  documentTitle: string,
  sections: DocumentSection[],
  focusArea?: string,
): Promise<SynthesisPlan[]> {
  const sectionSummaries = sections.map((s) =>
    `[${s.index}] ${s.heading}: ${s.content.slice(0, 200)}...`,
  ).join("\n");

  const focusHint = focusArea
    ? `\nFOCUS AREA: ${focusArea} — prioritize pages relevant to this domain.`
    : "";

  // Load existing system wiki pages for dedup and cross-referencing
  const existingSystemPages = await prisma.knowledgePage.findMany({
    where: { scope: "system", status: { in: ["verified", "stale", "draft"] } },
    select: { slug: true, title: true, pageType: true },
    orderBy: { title: "asc" },
  });

  const existingPagesContext = existingSystemPages.length > 0
    ? `\n\nEXISTING SYSTEM WIKI PAGES (${existingSystemPages.length} pages):\n${existingSystemPages.map(p => `- [[${p.slug}]] — ${p.title} [${p.pageType}]`).join("\n")}\n\nIMPORTANT: If the source material covers a topic that an existing page already addresses, plan an UPDATE (not a new page). If the source material covers a RELATED but distinct topic, plan a new page and note which existing pages should be cross-referenced.`
    : "";

  // Load ontology gaps for the focus area
  let ontologyContext = "";
  if (focusArea) {
    try {
      const { getOntologyGapsForPrompt } = await import("@/lib/system-intelligence-ontology");
      const vertical = inferVertical(focusArea);
      if (vertical) {
        const gapsPrompt = await getOntologyGapsForPrompt(vertical);
        if (gapsPrompt) {
          ontologyContext = `\n\nKNOWLEDGE GAPS (from the ${vertical} ontology — prioritize filling these):\n${gapsPrompt}\n\nWhen planning pages, check if any gap from the ontology is addressed by this document. If so, use the gap's suggested page types and domain categorization.`;
        }
      }
    } catch { /* non-fatal */ }
  }

  const response = await callLLM({
    instructions: `You are planning a knowledge base synthesis from a research document. Identify 5-20 distinct knowledge pages that can be extracted.

Each page must be a self-contained topic, NOT a document summary. Think: what would an analyst need to look up during an investigation?

CROSS-REFERENCING IS CRITICAL:
- When a page covers a topic that RELATES to another page (existing or planned), note the cross-reference
- Every page you plan should reference at least 1-2 other pages it connects to
- Think in terms of navigation: an analyst reading about "revenue quality analysis" should be able to follow a link to "revenue concentration red flags" and from there to "customer diversification assessment"

Each page must have a pageType from this taxonomy:
- "fundamentals" — Stable foundational knowledge that rarely changes (principles, definitions, legal frameworks)
- "methodology" — Analytical frameworks and step-by-step approaches (how to analyze, how to evaluate)
- "theory" — Models and analytical logic that reference statistics and practices (when to escalate, risk scoring models)
- "practices" — How things are actually done in industry (typical payment terms, common contract structures, standard processes)
- "statistics" — Empirical data, benchmarks, and metrics (median values, ranges, trends, market data)

Choose the type that best describes the NATURE of the knowledge, not the topic. A page about "average freight rates in Scandinavia" is statistics. A page about "how to evaluate freight rate proposals" is methodology. A page about "what freight forwarding is" is fundamentals.

This matters because the system uses different update policies per type — fundamentals are near-frozen, statistics update frequently.

Output a JSON array of objects with:
- pageType: fundamentals | methodology | theory | practices | statistics
- title: descriptive title for the knowledge page
- slug: lowercase-kebab-case identifier
- sourceSections: array of section indices from the document
- synthesisGoal: what this page should teach the analyst
- updateExisting: slug of existing page to UPDATE instead of creating new (or null)
- crossReferences: array of slugs (existing or planned) this page should link to

If KNOWLEDGE GAPS from the ontology are provided, prioritize creating pages that fill those gaps. Match your planned page types to the suggested types in the gap description. Pages that fill critical gaps should be planned first.

If the document doesn't cover any ontology gaps, that's fine — create pages based on the document content. Not every document fills a gap.${focusHint}`,
    messages: [{
      role: "user",
      content: `Document: "${documentTitle}"\n\nSections:\n${sectionSummaries}${existingPagesContext}${ontologyContext}`,
    }],
    model: getModel("onboardingSynthesis"),
    aiFunction: "reasoning",
    temperature: 0.3,
  });

  const parsed = extractJSONArray(response.text);
  if (!parsed || !Array.isArray(parsed)) {
    console.error("[research-synthesizer] Planning failed — could not parse JSON array");
    return [];
  }

  const plans: SynthesisPlan[] = [];
  for (const p of parsed) {
    if (
      typeof p === "object" && p !== null &&
      typeof (p as Record<string, unknown>).pageType === "string" &&
      typeof (p as Record<string, unknown>).title === "string" &&
      typeof (p as Record<string, unknown>).slug === "string" &&
      Array.isArray((p as Record<string, unknown>).sourceSections) &&
      typeof (p as Record<string, unknown>).synthesisGoal === "string"
    ) {
      const raw = p as Record<string, unknown>;
      plans.push({
        ...(p as unknown as SynthesisPlan),
        updateExisting: typeof raw.updateExisting === "string" ? raw.updateExisting : null,
        crossReferences: Array.isArray(raw.crossReferences)
          ? (raw.crossReferences as string[]).filter(s => typeof s === "string")
          : [],
      });
    }
  }
  return plans;
}

// ── Page Synthesis ─────────────────────────────────────

async function synthesizePage(
  plan: SynthesisPlan,
  sections: DocumentSection[],
  documentTitle: string,
): Promise<string | null> {
  const relevantSections = plan.sourceSections
    .filter((i) => i >= 0 && i < sections.length)
    .map((i) => sections[i]);

  if (relevantSections.length === 0) return null;

  const sourceContent = relevantSections
    .map((s) => `### Section ${s.index}: ${s.heading}\n${s.content}`)
    .join("\n\n");

  const crossRefContext = plan.crossReferences?.length > 0
    ? `\n\nCROSS-REFERENCES: Link to these related pages using [[slug]] notation inline in your text. Don't just list them — weave them naturally: "For detailed methodology on assessing revenue concentration, see [[revenue-concentration-analysis]]".\nRelated pages: ${plan.crossReferences.map(s => `[[${s}]]`).join(", ")}`
    : "";

  const existingContent = plan.updateExisting
    ? await prisma.knowledgePage.findFirst({
        where: { scope: "system", slug: plan.updateExisting },
        select: { content: true },
      })
    : null;

  const updateContext = existingContent
    ? `\n\nEXISTING PAGE CONTENT (you are UPDATING this page with new material):\n${existingContent.content}\n\nIntegrate the new material into the existing page. Preserve existing content and citations. Add the new information in the relevant sections, or create new sections if needed.`
    : "";

  const response = await callLLM({
    instructions: `You are building a knowledge base page for a professional intelligence system.

Page type: ${plan.pageType}
Title: ${plan.title}
Goal: ${plan.synthesisGoal}
${updateContext}

Source material:
${sourceContent}
${crossRefContext}

Write a comprehensive knowledge page. Requirements:
- Every claim must cite its source section as [src:section-N]
- Include specific numbers, benchmarks, thresholds where the source provides them
- Structure for quick reference — the reasoning engine will use this during investigations
- Write as KNOWLEDGE, not as a document summary. "Revenue concentration above 40% is a red flag" not "The paper discusses revenue concentration"
- Include practical guidance: what should an analyst look for, what questions to ask, what thresholds matter
- USE [[cross-references]] to link to related pages. When you mention a concept covered by another page, write it as [[page-slug]]. This creates the navigation graph that analysts use to build deep expertise.
- At the end of the page, include a "## Related Pages" section listing all [[cross-references]] with a one-line description of what each linked page covers`,
    messages: [{
      role: "user",
      content: `Synthesize the knowledge page "${plan.title}" from the source material above.`,
    }],
    model: getModel("agenticReasoning"),
    aiFunction: "reasoning",
    temperature: 0.2,
  });

  const content = response.text;
  if (!content || content.length < 100) return null;

  const contentTokens = Math.ceil(content.length / 4);
  const crossReferences = extractCrossRefsFromContent(content);

  // Build source citations
  const sourceCitations = relevantSections.map((s) => ({
    type: "section" as const,
    id: `section-${s.index}`,
    citation: `${documentTitle} — ${s.heading}`,
    claimCount: 1,
  }));

  // Handle updateExisting path — update the existing page instead of creating new
  if (plan.updateExisting) {
    const existing = await prisma.knowledgePage.findFirst({
      where: { scope: "system", slug: plan.updateExisting },
      select: { id: true, version: true, content: true },
    });
    if (existing) {
      const { createVersionSnapshot } = await import("@/lib/wiki-engine");
      await createVersionSnapshot(existing.id, "research", getModel("agenticReasoning"));

      await prisma.knowledgePage.update({
        where: { id: existing.id },
        data: {
          content,
          contentTokens,
          crossReferences,
          sources: sourceCitations,
          sourceCount: sourceCitations.length,
          status: "draft",
          version: existing.version + 1,
          lastSynthesizedAt: new Date(),
        },
      });

      // Re-embed (fire-and-forget)
      embedTexts([content]).then(([embedding]) => {
        if (embedding) {
          const embeddingStr = `[${embedding.join(",")}]`;
          return prisma.$executeRawUnsafe(
            `UPDATE "KnowledgePage" SET "embedding" = $1::vector WHERE "id" = $2`,
            embeddingStr,
            existing.id,
          );
        }
      }).catch(() => {});

      // Re-verify (fire-and-forget)
      import("@/lib/wiki-verification").then(({ verifyPage }) => {
        verifyPage(existing.id).catch((err) =>
          console.error(`[research-synthesizer] Verification failed for ${plan.updateExisting}:`, err),
        );
      });

      // Log system intelligence change (fire-and-forget)
      import("@/lib/system-intelligence-signals").then(({ logSystemIntelligenceChange }) => {
        logSystemIntelligenceChange({
          action: "page_updated",
          pageSlug: plan.updateExisting!,
          pageTitle: plan.title,
          pageType: plan.pageType,
          previousContent: existing.content,
          newContent: content,
          reason: `Research synthesis update from "${documentTitle}" — ${plan.synthesisGoal}`,
          changeSource: "research_synthesis",
          curatorModel: getModel("agenticReasoning"),
        }).catch(() => {});
      }).catch(() => {});

      console.log(`[research-synthesizer] Updated existing page "${plan.updateExisting}"`);
      return existing.id;
    }
  }

  // Check for existing page with same slug (collision guard for new pages)
  const existingBySlug = await prisma.knowledgePage.findFirst({
    where: { scope: "system", slug: plan.slug },
    select: { id: true },
  });
  if (existingBySlug) {
    console.log(`[research-synthesizer] Skipping "${plan.slug}" — already exists`);
    return null;
  }

  // Create system-scoped page
  const page = await prisma.knowledgePage.create({
    data: {
      operatorId: null,
      scope: "system",
      pageType: plan.pageType,
      title: plan.title,
      slug: plan.slug,
      content,
      contentTokens,
      crossReferences,
      sources: sourceCitations,
      sourceCount: sourceCitations.length,
      sourceTypes: ["research"],
      status: "draft",
      confidence: 0.70,
      version: 1,
      synthesisPath: "research",
      synthesizedByModel: getModel("agenticReasoning"),
      lastSynthesizedAt: new Date(),
    },
    select: { id: true },
  });

  // Embed for vector search (fire-and-forget)
  embedTexts([content])
    .then(([embedding]) => {
      if (embedding) {
        const embeddingStr = `[${embedding.join(",")}]`;
        return prisma.$executeRawUnsafe(
          `UPDATE "KnowledgePage" SET "embedding" = $1::vector WHERE "id" = $2`,
          embeddingStr,
          page.id,
        );
      }
    })
    .catch(() => {});

  // Run verification (fire-and-forget — updates status to verified or keeps draft)
  import("@/lib/wiki-verification").then(({ verifyPage }) => {
    verifyPage(page.id).catch((err) =>
      console.error(`[research-synthesizer] Verification failed for ${plan.slug}:`, err),
    );
  });

  // Log system intelligence change (fire-and-forget)
  import("@/lib/system-intelligence-signals").then(({ logSystemIntelligenceChange }) => {
    logSystemIntelligenceChange({
      action: "page_created",
      pageSlug: plan.slug,
      pageTitle: plan.title,
      pageType: plan.pageType,
      newContent: content,
      reason: `Research synthesis from "${documentTitle}" — ${plan.synthesisGoal}`,
      changeSource: "research_synthesis",
      curatorModel: getModel("agenticReasoning"),
    }).catch(() => {});
  }).catch(() => {});

  return page.id;
}

function extractCrossRefsFromContent(content: string): string[] {
  const matches = content.match(/\[\[([a-z0-9-]+)\]\]/g) ?? [];
  return [...new Set(matches.map(m => m.replace(/\[\[|\]\]/g, "")))];
}

function inferVertical(focusArea: string): string | null {
  const text = focusArea.toLowerCase();
  if (text.includes("logist") || text.includes("freight") || text.includes("shipping") || text.includes("cargo") || text.includes("warehouse")) return "logistics";
  if (text.includes("saas") || text.includes("software") || text.includes("subscription")) return "saas";
  if (text.includes("construct") || text.includes("building") || text.includes("electrician")) return "construction";
  if (text.includes("consult") || text.includes("service") || text.includes("advisory")) return "professional-services";
  if (text.includes("hotel") || text.includes("restaurant") || text.includes("hospitality")) return "hospitality";
  return null;
}
