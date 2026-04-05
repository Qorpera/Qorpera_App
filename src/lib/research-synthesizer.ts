/**
 * Research document synthesizer.
 *
 * Takes a research paper or expert document, plans a set of system wiki pages,
 * synthesizes each one from relevant document sections, then verifies them.
 * All pages are system-scoped (operatorId: null, scope: "system").
 */

import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSON, extractJSONArray } from "@/lib/json-helpers";
import { embedChunks } from "@/lib/rag/embedder";

// ── Types ──────────────────────────────────────────────

interface SynthesisPlan {
  pageType: string;
  title: string;
  slug: string;
  sourceSections: number[];
  synthesisGoal: string;
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

  const response = await callLLM({
    instructions: `You are planning a knowledge base synthesis from a research document. Identify 5-20 distinct knowledge pages that can be extracted.

Each page must be a self-contained topic, NOT a document summary. Think: what would an analyst need to look up during an investigation?

Output a JSON array of objects with: pageType (topic_synthesis, process_description, or financial_pattern), title, slug (lowercase-kebab-case), sourceSections (array of section indices), synthesisGoal.${focusHint}`,
    messages: [{
      role: "user",
      content: `Document: "${documentTitle}"\n\nSections:\n${sectionSummaries}`,
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
      plans.push(p as unknown as SynthesisPlan);
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

  const response = await callLLM({
    instructions: `You are building a knowledge base page for a professional intelligence system.

Page type: ${plan.pageType}
Title: ${plan.title}
Goal: ${plan.synthesisGoal}

Source material:
${sourceContent}

Write a comprehensive knowledge page. Requirements:
- Every claim must cite its source section as [src:section-N]
- Include specific numbers, benchmarks, thresholds where the source provides them
- Structure for quick reference — the reasoning engine will use this during investigations
- Write as KNOWLEDGE, not as a document summary. "Revenue concentration above 40% is a red flag" not "The paper discusses revenue concentration"
- Include practical guidance: what should an analyst look for, what questions to ask, what thresholds matter`,
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

  // Build source citations
  const sourceCitations = relevantSections.map((s) => ({
    type: "section" as const,
    id: `section-${s.index}`,
    citation: `${documentTitle} — ${s.heading}`,
    claimCount: 1,
  }));

  // Check for existing page with same slug
  const existing = await prisma.knowledgePage.findFirst({
    where: { scope: "system", slug: plan.slug },
    select: { id: true },
  });
  if (existing) {
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
      crossReferences: [],
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
  embedChunks([content])
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

  return page.id;
}
