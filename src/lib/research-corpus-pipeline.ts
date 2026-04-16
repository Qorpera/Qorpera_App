/**
 * Research Corpus Pipeline
 *
 * Processes a collection of research documents into system intelligence wiki pages.
 * Six phases: classify → plan → synthesize → audit → resolve references → quality check.
 *
 * Documents are processed as a CORPUS — pages draw from multiple sources,
 * cross-reference each other, and fill ontology gaps by design.
 */

import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSON, extractJSONArray } from "@/lib/json-helpers";
import { logSystemIntelligenceChange } from "@/lib/system-intelligence-signals";

// ── Types ──────────────────────────────────────────────

export interface CorpusDocument {
  id: string;          // unique ID for this document in the corpus
  title: string;
  content: string;     // full text
  focusArea?: string;  // e.g., "logistics", "due-diligence"
}

interface DocumentClassification {
  documentId: string;
  title: string;
  role: "methodology" | "benchmarks" | "case_study" | "regulatory" | "best_practices" | "worked_examples" | "reference" | "overview";
  primaryTopics: string[];
  subTopics: string[];
  keyConceptsOrEntities: string[];
  estimatedRelevanceByDomain: Record<string, number>; // domain name → 0-1 relevance
  horizontalSkills: string[]; // cross-cutting skills (negotiation, financial modeling, etc.)
  tokenCount: number;
}

interface CorpusMap {
  vertical: string;
  documents: DocumentClassification[];
  domainCoverage: Record<string, string[]>; // domain → document IDs with high relevance
  horizontalSkills: Map<string, string[]>;  // skill name → document IDs
}

interface PagePlan {
  slug: string;
  title: string;
  pageType: string; // fundamentals, methodology, theory, practices, statistics
  domain: string;
  isHub: boolean;            // true = domain entry point, surfaced in discovery index
  synthesisGoal: string;
  sourceDocumentIds: string[];       // which corpus documents contribute
  sourceSectionHints: string[];      // what to look for in each document
  crossReferences: string[];         // planned slugs this page should link to
  updateExisting: string | null;     // slug of existing page to enrich (null = create new)
  priority: "critical" | "important" | "useful";
  dependsOn: string[];               // slugs that should be synthesized first (soft dependency)
}

interface DomainPlan {
  domain: string;
  pages: PagePlan[];
  rationale: string;
}

export interface CorpusPipelineReport {
  phase: string;
  documentsClassified: number;
  domainsPlanned: number;
  pagesPlanned: number;
  pagesSynthesized: number;
  pagesFromAudit: number;
  crossReferencesResolved: number;
  totalCostCents: number;
  durationMs: number;
  errors: string[];
}

// ── Main Entry ─────────────────────────────────────────

export async function processResearchCorpus(
  documents: CorpusDocument[],
  vertical: string,
  options?: {
    onProgress?: (phase: string, message: string) => Promise<void>;
    dryRun?: boolean;        // if true, plan but don't synthesize
    adminReviewPlan?: boolean; // if true, stop after planning and return the plan
  },
): Promise<CorpusPipelineReport> {
  const startTime = Date.now();
  const progress = options?.onProgress ?? (async () => {});
  const report: CorpusPipelineReport = {
    phase: "starting",
    documentsClassified: 0,
    domainsPlanned: 0,
    pagesPlanned: 0,
    pagesSynthesized: 0,
    pagesFromAudit: 0,
    crossReferencesResolved: 0,
    totalCostCents: 0,
    durationMs: 0,
    errors: [],
  };

  try {
    // ═══ PHASE 1: Corpus Classification ═══════════════════════
    report.phase = "classification";
    await progress("classification", `Classifying ${documents.length} documents...`);

    const corpusMap = await classifyCorpus(documents, vertical, report);
    report.documentsClassified = corpusMap.documents.length;

    await progress("classification", `Classified ${corpusMap.documents.length} documents across ${Object.keys(corpusMap.domainCoverage).length} domains`);

    // ═══ PHASE 0: Ontology Generation ═════════════════════
    report.phase = "ontology";
    await progress("ontology", "Generating knowledge ontology from corpus...");

    const ontologySlug = await generateOntologyFromCorpus(corpusMap, vertical, report);

    await progress("ontology", `Ontology generated: ${ontologySlug}`);

    // ═══ PHASE 2: Domain-Level Planning ══════════════════════
    report.phase = "planning";
    await progress("planning", "Building knowledge architecture...");

    const domainPlans = await planDomainPages(corpusMap, vertical, report);
    report.domainsPlanned = domainPlans.length;
    report.pagesPlanned = domainPlans.reduce((n, d) => n + d.pages.length, 0);

    await progress("planning", `Planned ${report.pagesPlanned} pages across ${domainPlans.length} domains`);

    // Admin review gate
    if (options?.adminReviewPlan || options?.dryRun) {
      report.phase = "awaiting_review";
      report.durationMs = Date.now() - startTime;
      // Store plan for review (findFirst + create/update since null operatorId in unique)
      await upsertSystemPage(
        `corpus-plan-${vertical}`,
        `Corpus Plan — ${vertical}`,
        "log",
        JSON.stringify(domainPlans, null, 2),
        "corpus_pipeline",
        "planning",
      );
      return report;
    }

    // ═══ PHASE 3: Multi-Source Synthesis ═════════════════════
    report.phase = "synthesis";
    await progress("synthesis", `Synthesizing ${report.pagesPlanned} pages...`);

    const synthesizedSlugs = await synthesizeAllPages(documents, corpusMap, domainPlans, report, progress);

    await progress("synthesis", `Synthesized ${report.pagesSynthesized} pages`);

    // ═══ PHASE 4: Investigative Audit ═══════════════════════
    report.phase = "audit";
    await progress("audit", "Running investigative audit...");

    await runInvestigativeAudit(corpusMap, domainPlans, synthesizedSlugs, vertical, report, progress);

    await progress("audit", `Audit complete: ${report.pagesFromAudit} additional pages`);

    // ═══ PHASE 5: Cross-Reference Resolution ════════════════
    report.phase = "cross_references";
    await progress("cross_references", "Resolving cross-references...");

    report.crossReferencesResolved = await resolveCrossReferences(synthesizedSlugs);

    await progress("cross_references", `Resolved ${report.crossReferencesResolved} cross-references`);

    // ═══ PHASE 6: Quality Check ═════════════════════════════
    report.phase = "quality";
    await progress("quality", "Running quality checks...");

    // Fire-and-forget verification on all new pages
    for (const slug of synthesizedSlugs) {
      const page = await prisma.knowledgePage.findFirst({
        where: { scope: "system", slug },
        select: { id: true },
      });
      if (page) {
        import("@/lib/wiki-verification").then(({ verifyPage }) => {
          verifyPage(page.id).catch(() => {});
        }).catch(() => {});
      }
    }

    report.phase = "complete";
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : String(err));
    report.phase = "failed";
    console.error("[corpus-pipeline] Pipeline failed:", err);
  }

  report.durationMs = Date.now() - startTime;
  await progress(report.phase, `Pipeline ${report.phase}: ${report.pagesSynthesized} pages in ${Math.round(report.durationMs / 1000)}s, $${(report.totalCostCents / 100).toFixed(2)}`);

  return report;
}

// ═══ PHASE 1: Classification ═══════════════════════════════

async function classifyCorpus(
  documents: CorpusDocument[],
  vertical: string,
  report: CorpusPipelineReport,
): Promise<CorpusMap> {
  const BATCH_SIZE = 5;
  const classifications: DocumentClassification[] = [];
  const model = getModel("documentClassification"); // Haiku — structural, not analytical

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = documents.slice(i, i + BATCH_SIZE);
    const batchContent = batch.map((doc) => {
      // Send title + first 3000 chars + last 1000 chars (captures intro + conclusions)
      const preview = doc.content.length > 4000
        ? doc.content.slice(0, 3000) + "\n...\n" + doc.content.slice(-1000)
        : doc.content;
      return `[DOC_${doc.id}] "${doc.title}"\n${preview}`;
    }).join("\n\n════════\n\n");

    try {
      const response = await callLLM({
        instructions: `You are classifying research documents for a ${vertical} knowledge base. For each document, determine:

1. role: methodology | benchmarks | case_study | regulatory | best_practices | worked_examples | reference | overview
2. primaryTopics: 2-4 main topics covered
3. subTopics: more specific topics within the primary ones
4. keyConceptsOrEntities: specific frameworks, standards, companies, regulations mentioned
5. estimatedRelevanceByDomain: for each domain in the ${vertical} ontology, how relevant is this document (0.0 = not relevant, 1.0 = highly relevant)
6. horizontalSkills: identify any cross-cutting skills this document teaches that apply beyond this specific domain (e.g., "negotiation", "financial modeling", "risk assessment", "stakeholder communication"). These are skills that would be valuable in OTHER domains too. Empty array if the document is purely domain-specific.

Respond with JSON array, one object per document:
[{ "documentId": "id", "role": "...", "primaryTopics": [...], "subTopics": [...], "keyConceptsOrEntities": [...], "estimatedRelevanceByDomain": { "domain": 0.8 }, "horizontalSkills": [] }]`,
        messages: [{ role: "user", content: batchContent }],
        model,
        maxTokens: 4000,
      });
      report.totalCostCents += response.apiCostCents;

      const parsed = extractJSONArray(response.text);
      if (parsed) {
        for (const item of parsed) {
          const raw = item as Record<string, unknown>;
          const doc = batch.find(d => d.id === raw.documentId) ?? batch[0];
          classifications.push({
            documentId: (raw.documentId as string) ?? doc.id,
            title: doc.title,
            role: (raw.role as DocumentClassification["role"]) ?? "reference",
            primaryTopics: Array.isArray(raw.primaryTopics) ? raw.primaryTopics as string[] : [],
            subTopics: Array.isArray(raw.subTopics) ? raw.subTopics as string[] : [],
            keyConceptsOrEntities: Array.isArray(raw.keyConceptsOrEntities) ? raw.keyConceptsOrEntities as string[] : [],
            estimatedRelevanceByDomain: (raw.estimatedRelevanceByDomain as Record<string, number>) ?? {},
            horizontalSkills: Array.isArray(raw.horizontalSkills) ? raw.horizontalSkills as string[] : [],
            tokenCount: Math.ceil(doc.content.length / 4),
          });
        }
      }
    } catch (err) {
      report.errors.push(`Classification batch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Build domain coverage map
  const domainCoverage: Record<string, string[]> = {};
  for (const cls of classifications) {
    for (const [domain, relevance] of Object.entries(cls.estimatedRelevanceByDomain)) {
      if (relevance >= 0.4) {
        if (!domainCoverage[domain]) domainCoverage[domain] = [];
        domainCoverage[domain].push(cls.documentId);
      }
    }
  }

  // Aggregate horizontal skills
  const horizontalSkills = new Map<string, string[]>();
  for (const cls of classifications) {
    for (const skill of cls.horizontalSkills) {
      const existing = horizontalSkills.get(skill) ?? [];
      existing.push(cls.documentId);
      horizontalSkills.set(skill, existing);
    }
  }

  return { vertical, documents: classifications, domainCoverage, horizontalSkills };
}

// ═══ PHASE 2: Domain-Level Planning ═══════════════════════

async function planDomainPages(
  corpusMap: CorpusMap,
  vertical: string,
  report: CorpusPipelineReport,
): Promise<DomainPlan[]> {
  const model = getModel("researchPlanner"); // Opus — this is the most critical planning call

  // Load ontology gaps for this vertical
  let ontologyContext = "";
  try {
    const { getOntologyGapsForPrompt } = await import("@/lib/system-intelligence-ontology");
    const gaps = await getOntologyGapsForPrompt(vertical);
    if (gaps) ontologyContext = `\n\nONTOLOGY GAPS TO FILL:\n${gaps}`;
  } catch { /* ontology may not exist for this vertical */ }

  // Load existing system pages
  const existingPages = await prisma.knowledgePage.findMany({
    where: { scope: "system", status: { in: ["verified", "draft"] } },
    select: { slug: true, title: true, pageType: true, version: true },
  });
  const existingContext = existingPages.length > 0
    ? `\n\nEXISTING SYSTEM PAGES (${existingPages.length}):\n${existingPages.map(p => `- [[${p.slug}]] "${p.title}" [${p.pageType}] (v${p.version})`).join("\n")}`
    : "";

  const plans: DomainPlan[] = [];

  // Plan each domain separately
  for (const [domain, docIds] of Object.entries(corpusMap.domainCoverage)) {
    const domainDocs = corpusMap.documents.filter(d => docIds.includes(d.documentId));
    if (domainDocs.length === 0) continue;

    const docSummaries = domainDocs.map(d =>
      `- [${d.documentId}] "${d.title}" (${d.role}) — Topics: ${d.primaryTopics.join(", ")}. Concepts: ${d.keyConceptsOrEntities.slice(0, 5).join(", ")}`,
    ).join("\n");

    try {
      const response = await callLLM({
        instructions: `You are designing the knowledge architecture for the "${domain}" domain of a ${vertical} system intelligence wiki.

You have ${domainDocs.length} research documents covering this domain. Your job: design a TREE of wiki pages that provides structured entry points (hub pages) linking down to specific knowledge (leaf pages).

CORPUS DOCUMENTS FOR THIS DOMAIN:
${docSummaries}
${ontologyContext}${existingContext}

ARCHITECTURE RULES:

1. HUB PAGES (the doors):
   - Each domain gets 1-2 hub pages. These are the entry points the reasoning engine sees in its discovery index.
   - A hub page covers the domain comprehensively in 2-4 pages. It IS useful on its own — not just a table of contents.
   - A hub links DOWN to specific methodology, frameworks, statistics, and worked example pages via [[cross-references]].
   - Hub pages should be marked with pageType matching their content (usually "methodology" or "practices"), NOT a special hub type.

2. LEAF PAGES (the depth):
   - Specific methodology guides, frameworks, benchmarks, worked examples, statistical data.
   - Each leaf draws from 1-3 documents that cover that specific topic.
   - Leaves link to OTHER leaves and hubs freely — cross-references go everywhere. If a carrier evaluation page mentions game theory, it links to [[game-theory-negotiation-framework]] even if that's in a different domain.

3. CROSS-REFERENCES ARE FLAT:
   - The tree structure is for PLANNING and DISCOVERY — it determines which pages exist and how the discovery index surfaces them.
   - The actual [[cross-reference]] graph is FLAT and fully connected. Any page can link to any other page in any domain.
   - When a page mentions a concept that has its own article, that concept should be a [[link]].

4. GENERAL RULES:
   - Pages should be 2-4 printed pages (~2000-8000 tokens). Dense, no filler.
   - If an existing page covers a topic, plan an UPDATE (set updateExisting to its slug).
   - Page types: fundamentals, methodology, theory, practices, statistics
   - Priority: critical (ontology gap or hub page), important (multi-source leaf), useful (single-source or supplementary)

5. HORIZONTAL SKILL APPLICATIONS:
   - If the corpus covers topics that are cross-cutting skills (negotiation, financial modeling, risk assessment, communication, etc.), plan APPLICATION pages that bridge the skill into this vertical.
   - An application page links BOTH to the vertical hub AND to the skill hub: [[dd-financial-analysis-overview]] and [[negotiation-overview]]
   - DO NOT recreate core skill knowledge. If "negotiation fundamentals" belongs in the negotiation skill domain, reference it via [[link]]. Create only the APPLICATION: "how negotiation applies in THIS vertical."
   - Check the ontology for "Cross-Cutting Skills" section — it lists which skills are relevant.

Respond with JSON:
{
  "domain": "${domain}",
  "rationale": "Brief explanation of the knowledge structure",
  "pages": [
    {
      "slug": "page-slug",
      "title": "Page Title",
      "pageType": "methodology",
      "domain": "${domain}",
      "isHub": true,
      "synthesisGoal": "What this page should teach an analyst",
      "sourceDocumentIds": ["doc1", "doc2"],
      "sourceSectionHints": ["Look for X methodology in doc1", "Get benchmarks from doc2"],
      "crossReferences": ["leaf-slug-1", "leaf-slug-2", "cross-domain-slug"],
      "updateExisting": null,
      "priority": "critical",
      "dependsOn": []
    }
  ]
}`,
        messages: [{ role: "user", content: `Plan the "${domain}" domain knowledge architecture.` }],
        model,
        maxTokens: 65_536,
        thinking: true,
        thinkingBudget: 16_384,
      });
      report.totalCostCents += response.apiCostCents;

      const parsed = extractJSON(response.text) as DomainPlan | null;
      if (parsed?.pages) {
        for (const page of parsed.pages) {
          if (typeof (page as any).isHub !== "boolean") (page as any).isHub = false;
        }
        plans.push(parsed);
      }
    } catch (err) {
      report.errors.push(`Planning failed for domain "${domain}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return plans;
}

// ═══ PHASE 3: Multi-Source Synthesis ═══════════════════════

async function synthesizeAllPages(
  documents: CorpusDocument[],
  _corpusMap: CorpusMap,
  domainPlans: DomainPlan[],
  report: CorpusPipelineReport,
  progress: (phase: string, message: string) => Promise<void>,
): Promise<string[]> {
  const allPages = domainPlans.flatMap(d => d.pages);
  const synthesizedSlugs: string[] = [];
  const docMap = new Map(documents.map(d => [d.id, d]));

  // Sort by dependencies: pages with no dependencies first
  const sorted = topologicalSort(allPages);

  const CONCURRENCY = 3;
  const synthesizedContent = new Map<string, string>(); // slug → content (for dependent pages)

  for (let i = 0; i < sorted.length; i += CONCURRENCY) {
    const batch = sorted.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (plan) => {
        // Gather source content for this page
        const sourceContent = gatherSourceContent(plan, docMap);

        // Load existing page content for enrichment mode
        let existingContent: string | null = null;
        if (plan.updateExisting) {
          const existing = await prisma.knowledgePage.findFirst({
            where: { scope: "system", slug: plan.updateExisting, status: { in: ["verified", "draft"] } },
            select: { content: true, version: true },
          });
          if (existing && existing.version > 1) {
            // Enrichment mode — preserve refinements
            existingContent = existing.content;
          }
        }

        // Load dependent page content for cross-referencing
        const dependencyContent = plan.dependsOn
          .map(slug => synthesizedContent.get(slug))
          .filter(Boolean)
          .map((c, idx) => `Referenced page ${idx + 1}:\n${(c as string).slice(0, 2000)}`)
          .join("\n\n");

        return synthesizeSinglePage(plan, sourceContent, existingContent, dependencyContent, report);
      }),
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const plan = batch[j];
      if (result.status === "fulfilled" && result.value) {
        synthesizedSlugs.push(plan.updateExisting ?? plan.slug);
        synthesizedContent.set(plan.slug, result.value);
        report.pagesSynthesized++;
      } else if (result.status === "rejected") {
        report.errors.push(`Synthesis failed for "${plan.slug}": ${result.reason}`);
      }
    }

    await progress("synthesis", `Synthesized ${report.pagesSynthesized}/${allPages.length} pages`);
  }

  return synthesizedSlugs;
}

function gatherSourceContent(plan: PagePlan, docMap: Map<string, CorpusDocument>): string {
  const parts: string[] = [];
  for (const docId of plan.sourceDocumentIds) {
    const doc = docMap.get(docId);
    if (!doc) continue;

    // Extract relevant sections based on hints
    // For now: send the full document (the synthesis model extracts what it needs)
    // Future: use L4 comprehension summaries + L5 evidence extractions
    const maxChars = Math.min(doc.content.length, 15000); // ~3750 tokens per doc
    parts.push(`## Source: "${doc.title}" [${docId}]\n${doc.content.slice(0, maxChars)}`);
  }
  return parts.join("\n\n════\n\n");
}

async function synthesizeSinglePage(
  plan: PagePlan,
  sourceContent: string,
  existingContent: string | null,
  dependencyContent: string,
  report: CorpusPipelineReport,
): Promise<string | null> {
  const model = getModel("agenticReasoning"); // Opus — synthesis quality is final output quality

  const enrichmentNote = existingContent
    ? `\n\nEXISTING PAGE (version > 1 — has been refined through use):\nPreserve the existing structure and refinements. Integrate new source material where it adds value. Do not discard content that may have been added through operational experience.\n\n${existingContent}`
    : "";

  const dependencyNote = dependencyContent
    ? `\n\nRELATED PAGES ALREADY SYNTHESIZED (cross-reference these using [[slug]]):\n${dependencyContent}`
    : "";

  const roleNote = plan.isHub
    ? `\n\nTHIS IS A HUB PAGE — a domain entry point. It should:\n- Cover the domain comprehensively — useful on its own, not just a table of contents\n- Provide structured [[links]] DOWN to specific methodology, benchmarks, and framework pages\n- Give the reader a mental model of the domain and clear paths to go deeper\n- Be the page an analyst reads FIRST when investigating anything in this domain`
    : `\n\nTHIS IS A LEAF PAGE — specific expertise. It should:\n- Go deep on one specific topic with concrete frameworks, thresholds, and examples\n- Link freely to related pages in ANY domain via [[cross-references]]\n- Be the page an analyst reads when they need the SPECIFIC methodology or data for this topic`;

  try {
    const response = await callLLM({
      instructions: `You are synthesizing a system intelligence wiki page from multiple research sources.

Page: "${plan.title}" [${plan.pageType}]
Domain: ${plan.domain}
Goal: ${plan.synthesisGoal}
${roleNote}${enrichmentNote}${dependencyNote}

SOURCE MATERIAL:
${sourceContent}

SYNTHESIS RULES:
- Write as KNOWLEDGE, not as document summaries. "Revenue concentration above 40% is a red flag" not "Paper A discusses revenue concentration."
- Weave sources together — a finding from one source is strengthened by corroboration from another.
- Cite sources as [src:DOC_ID] (e.g., [src:doc-003]).
- Include specific numbers, thresholds, benchmarks, frameworks.
- When sources CONTRADICT each other, present both with context: "Nordic-specific research suggests X [src:doc-005], while general best practice indicates Y [src:doc-002]. The discrepancy reflects..."
- Use [[cross-references]] for concepts covered by other pages. At the end, include a "## Related Pages" section.
- Planned cross-references for this page: ${plan.crossReferences.map(s => `[[${s}]]`).join(", ") || "none specified"}
- Target length: 2-4 pages (~2000-8000 tokens). Dense. No filler. Every sentence carries information.
- Page type is "${plan.pageType}" — write accordingly:
  - fundamentals: stable definitions and principles. Authoritative tone.
  - methodology: step-by-step frameworks. Practical, actionable.
  - theory: analytical models with explicit assumptions. Reference [[statistics]] pages for data.
  - practices: how things are done. Industry-specific, concrete.
  - statistics: empirical data with sources, dates, and confidence intervals. Note when data may be stale.`,
      messages: [{ role: "user", content: `Synthesize the page "${plan.title}" from the source material.` }],
      model,
      maxTokens: 65_536,
      thinking: true,
      thinkingBudget: 16_384,
    });
    report.totalCostCents += response.apiCostCents;

    const content = response.text;
    if (!content || content.length < 200) return null;

    const contentTokens = Math.ceil(content.length / 4);
    const crossReferences = extractCrossRefsFromContent(content);
    const targetSlug = plan.updateExisting ?? plan.slug;

    // Check for existing page
    const existing = await prisma.knowledgePage.findFirst({
      where: { scope: "system", slug: targetSlug },
      select: { id: true, version: true, content: true },
    });

    if (existing) {
      // Update existing page
      const { createVersionSnapshot } = await import("@/lib/wiki-engine");
      await createVersionSnapshot(existing.id, "corpus_pipeline", model);

      await prisma.knowledgePage.update({
        where: { id: existing.id },
        data: {
          content,
          contentTokens,
          crossReferences,
          pageType: plan.pageType,
          version: existing.version + 1,
          status: "draft",
          lastSynthesizedAt: new Date(),
          synthesisPath: "corpus_pipeline",
          synthesizedByModel: model,
        },
      });

      logSystemIntelligenceChange({
        action: "page_updated",
        pageSlug: targetSlug,
        pageTitle: plan.title,
        pageType: plan.pageType,
        previousContent: existing.content,
        newContent: content,
        reason: `Corpus pipeline synthesis — ${plan.synthesisGoal}`,
        changeSource: "research_synthesis",
        curatorModel: model,
      }).catch(() => {});

      return content;
    } else {
      // Create new page
      const page = await prisma.knowledgePage.create({
        data: {
          operatorId: null,
          scope: "system",
          pageType: plan.pageType,
          title: plan.title,
          slug: targetSlug,
          content,
          contentTokens,
          crossReferences,
          sources: [],
          sourceCount: plan.sourceDocumentIds.length,
          sourceTypes: ["research"],
          status: "draft",
          confidence: 0.7,
          version: 1,
          synthesisPath: "corpus_pipeline",
          synthesizedByModel: model,
          lastSynthesizedAt: new Date(),
        },
        select: { id: true },
      });

      logSystemIntelligenceChange({
        action: "page_created",
        pageSlug: targetSlug,
        pageTitle: plan.title,
        pageType: plan.pageType,
        newContent: content,
        reason: `Corpus pipeline synthesis — ${plan.synthesisGoal}`,
        changeSource: "research_synthesis",
        curatorModel: model,
      }).catch(() => {});

      return content;
    }
  } catch (err) {
    console.error(`[corpus-pipeline] Synthesis failed for "${plan.slug}":`, err);
    return null;
  }
}

// ═══ PHASE 4: Investigative Audit ═══════════════════════

async function runInvestigativeAudit(
  corpusMap: CorpusMap,
  _domainPlans: DomainPlan[],
  synthesizedSlugs: string[],
  vertical: string,
  report: CorpusPipelineReport,
  _progress: (phase: string, message: string) => Promise<void>,
): Promise<void> {
  const model = getModel("agenticReasoning"); // Opus

  // Load all newly synthesized pages
  const pages = await prisma.knowledgePage.findMany({
    where: { scope: "system", slug: { in: synthesizedSlugs } },
    select: { slug: true, title: true, pageType: true, content: true, sourceCount: true },
  });

  const pageSummaries = pages.map(p =>
    `- [[${p.slug}]] "${p.title}" [${p.pageType}] (${p.sourceCount} sources, ${Math.ceil(p.content.length / 4)} tokens)`,
  ).join("\n");

  const allTopics = corpusMap.documents.flatMap(d => [...d.primaryTopics, ...d.subTopics]);
  const topicFreq = new Map<string, number>();
  for (const t of allTopics) topicFreq.set(t, (topicFreq.get(t) ?? 0) + 1);
  const frequentTopics = [...topicFreq.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, count]) => `${topic} (${count} documents)`)
    .join(", ");

  // Load remaining ontology gaps for audit
  let ontologyGaps = "";
  try {
    const { getOntologyGapsForPrompt } = await import("@/lib/system-intelligence-ontology");
    const gaps = await getOntologyGapsForPrompt(vertical);
    if (gaps) ontologyGaps = `\n\nREMAINING ONTOLOGY GAPS:\n${gaps}`;
  } catch { /* ontology may not exist for this vertical */ }

  try {
    const response = await callLLM({
      instructions: `You have just completed synthesizing a system intelligence wiki from ${corpusMap.documents.length} research documents. Now audit the result.

SYNTHESIZED PAGES:
${pageSummaries}

FREQUENT TOPICS ACROSS CORPUS: ${frequentTopics}
${ontologyGaps}

Answer these 5 questions as a JSON object:

1. SOURCE COVERAGE: Which pages have only 1 source? (These are weak — flag them)
2. CROSS-DOMAIN GAPS: Which pages reference concepts that should link to another domain but don't have a target page?
3. CONCEPT EMERGENCE: What concepts appear in 3+ source documents but don't have their own page? (Candidate new pages)
4. METHODOLOGY TRANSFER: What frameworks from one sub-domain could apply to another?
5. COLLECTIVE SILENCE: What does the ontology say should exist that NO page covers?

Respond with JSON:
{
  "singleSourcePages": [{ "slug": "...", "recommendation": "merge with X or find additional sources" }],
  "missingCrossLinks": [{ "fromSlug": "...", "concept": "...", "suggestedTargetDomain": "..." }],
  "emergentConcepts": [{ "concept": "...", "documentCount": 3, "suggestedSlug": "...", "suggestedPageType": "..." }],
  "methodologyTransfers": [{ "fromDomain": "...", "toDomain": "...", "methodology": "...", "rationale": "..." }],
  "ontologyGapsRemaining": [{ "requirement": "...", "domain": "..." }]
}`,
      messages: [{ role: "user", content: "Audit the synthesized knowledge base." }],
      model,
      maxTokens: 65_536,
      thinking: true,
      thinkingBudget: 16_384,
    });
    report.totalCostCents += response.apiCostCents;

    const audit = extractJSON(response.text) as Record<string, unknown> | null;
    if (!audit) return;

    // Create stub pages for emergent concepts
    const emergent = Array.isArray(audit.emergentConcepts) ? audit.emergentConcepts as any[] : [];
    for (const concept of emergent.slice(0, 5)) {
      if (!concept.suggestedSlug) continue;
      const exists = await prisma.knowledgePage.findFirst({
        where: { scope: "system", slug: concept.suggestedSlug },
      });
      if (exists) continue;

      await prisma.knowledgePage.create({
        data: {
          operatorId: null,
          scope: "system",
          pageType: concept.suggestedPageType ?? "topic_synthesis",
          title: concept.concept,
          slug: concept.suggestedSlug,
          content: `# ${concept.concept}\n\n*This page was identified by the investigative audit as an emergent concept appearing across ${concept.documentCount} source documents. It needs synthesis from those sources.*\n\n## Status\nAwaiting synthesis. This concept was not covered by the initial planning pass but appeared frequently enough to warrant its own page.`,
          contentTokens: 50,
          crossReferences: [],
          sources: [],
          sourceCount: 0,
          sourceTypes: ["audit"],
          status: "draft",
          confidence: 0.3,
          version: 1,
          synthesisPath: "corpus_pipeline",
          synthesizedByModel: "audit",
          lastSynthesizedAt: new Date(),
        },
      }).catch(() => {});
      report.pagesFromAudit++;
    }

    // Store audit results as a log page
    await upsertSystemPage(
      `corpus-audit-${vertical}`,
      `Corpus Audit — ${vertical}`,
      "log",
      JSON.stringify(audit, null, 2),
      "corpus_pipeline",
      model,
    );
  } catch (err) {
    report.errors.push(`Audit failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ═══ PHASE 5: Cross-Reference Resolution ════════════════

async function resolveCrossReferences(slugs: string[]): Promise<number> {
  let resolved = 0;
  const allSlugs = new Set(slugs);

  // Also load all existing system page slugs
  const existingPages = await prisma.knowledgePage.findMany({
    where: { scope: "system", status: { in: ["verified", "draft"] } },
    select: { slug: true },
  });
  for (const p of existingPages) allSlugs.add(p.slug);

  // For each synthesized page, check its cross-references
  for (const slug of slugs) {
    const page = await prisma.knowledgePage.findFirst({
      where: { scope: "system", slug },
      select: { id: true, content: true, crossReferences: true },
    });
    if (!page) continue;

    // Extract cross-references from content
    const contentRefs = extractCrossRefsFromContent(page.content);

    // Check which references resolve to existing pages
    const validRefs = contentRefs.filter(ref => allSlugs.has(ref));
    const invalidRefs = contentRefs.filter(ref => !allSlugs.has(ref));

    if (invalidRefs.length > 0) {
      console.warn(`[corpus-pipeline] Page "${slug}" has ${invalidRefs.length} unresolved references: ${invalidRefs.join(", ")}`);
    }

    // Update stored crossReferences with valid ones
    if (validRefs.length !== page.crossReferences.length ||
        !validRefs.every(r => page.crossReferences.includes(r))) {
      await prisma.knowledgePage.update({
        where: { id: page.id },
        data: { crossReferences: validRefs },
      });
      resolved++;
    }

    // Add reciprocal references: if this page links to page B, page B should link back
    for (const targetSlug of validRefs) {
      const targetPage = await prisma.knowledgePage.findFirst({
        where: { scope: "system", slug: targetSlug },
        select: { id: true, crossReferences: true },
      });
      if (targetPage && !targetPage.crossReferences.includes(slug)) {
        await prisma.knowledgePage.update({
          where: { id: targetPage.id },
          data: { crossReferences: [...targetPage.crossReferences, slug] },
        });
        resolved++;
      }
    }
  }

  return resolved;
}

// ═══ PHASE 0: Ontology Generation ═══════════════════════

async function generateOntologyFromCorpus(
  corpusMap: CorpusMap,
  vertical: string,
  report: CorpusPipelineReport,
): Promise<string> {
  const model = getModel("researchPlanner"); // Opus — structural design

  const allTopics = corpusMap.documents.flatMap(d => d.primaryTopics);
  const allSubTopics = corpusMap.documents.flatMap(d => d.subTopics);
  const allConcepts = corpusMap.documents.flatMap(d => d.keyConceptsOrEntities);
  const allRoles = corpusMap.documents.map(d => `"${d.title}" (${d.role})`);

  // Check if ontology already exists
  const slug = `ontology-${vertical.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const existingOntology = await prisma.knowledgePage.findFirst({
    where: { scope: "system", slug, pageType: "ontology_index" },
    select: { content: true, slug: true, id: true, version: true },
  });

  const existingContext = existingOntology
    ? `\n\nEXISTING ONTOLOGY (update and expand — don't discard existing structure unless wrong):\n${existingOntology.content}`
    : "";

  // Check for existing horizontal skill ontologies
  const horizontalOntologies = await prisma.knowledgePage.findMany({
    where: { scope: "system", pageType: "ontology_index", slug: { startsWith: "ontology-skill-" } },
    select: { slug: true, title: true },
  });
  const horizontalContext = horizontalOntologies.length > 0
    ? `\n\nEXISTING HORIZONTAL SKILL ONTOLOGIES:\n${horizontalOntologies.map(o => `- [[${o.slug}]] ${o.title}`).join("\n")}\n\nIf this corpus touches any of these skills, plan APPLICATION pages that bridge the skill into this vertical. Do NOT duplicate the skill's core knowledge — reference it via [[cross-references]].`
    : "";

  const response = await callLLM({
    instructions: `You are generating a knowledge ontology from a research corpus. The corpus contains ${corpusMap.documents.length} documents about "${vertical}".

CORPUS OVERVIEW:
Documents: ${allRoles.join(", ")}
Primary topics: ${[...new Set(allTopics)].join(", ")}
Sub-topics: ${[...new Set(allSubTopics)].join(", ")}
Key concepts: ${[...new Set(allConcepts)].slice(0, 50).join(", ")}
${existingContext}${horizontalContext}

YOUR TASK: Generate an ontology that maps the knowledge structure of this domain.

THE TWO AXES OF KNOWLEDGE:

1. VERTICAL DOMAINS — specific to this field (e.g., for DD: financial analysis, legal review, commercial assessment, tax structuring). These are the core competency areas.

2. HORIZONTAL SKILLS — foundational capabilities that this field USES but that also apply elsewhere (e.g., negotiation, financial modeling, risk assessment, stakeholder communication). If the corpus discusses these, they should be noted as cross-cutting skills with APPLICATION requirements.

For each domain/skill, identify:
- What specific knowledge an expert needs (the requirements)
- Which corpus documents cover this area
- Whether requirements are critical (must have), important (should have), or useful (nice to have)
- Whether this is a vertical domain or a horizontal skill application

OUTPUT FORMAT — structured markdown matching this template:

# Knowledge Ontology — [Vertical Name]

[1-2 sentence description of what this vertical covers]

## [Domain Name]
[What this domain covers and why it matters]

- [critical] Sub-domain: Knowledge requirement description (needs: page_types)
- [important] Sub-domain: Knowledge requirement description (needs: page_types)
- [useful] Sub-domain: Knowledge requirement description (needs: page_types)

## Cross-Cutting Skills

### [Skill Name] (horizontal — see [[ontology-skill-slug]] if exists)
Application of [skill] in [vertical] context:
- [important] Application area: What the analyst needs to know about applying this skill HERE (needs: practices, methodology)

Page types: fundamentals, methodology, theory, practices, statistics
Use the [priority] prefix on every requirement line — this is parsed by the system.`,
    messages: [{ role: "user", content: "Generate the ontology for this corpus." }],
    model,
    maxTokens: 65_536,
    thinking: true,
    thinkingBudget: 16_384,
  });
  report.totalCostCents += response.apiCostCents;

  const ontologyContent = response.text;

  if (existingOntology) {
    const { createVersionSnapshot } = await import("@/lib/wiki-engine");
    await createVersionSnapshot(existingOntology.id, "corpus_pipeline", model);

    await prisma.knowledgePage.update({
      where: { id: existingOntology.id },
      data: {
        content: ontologyContent,
        contentTokens: Math.ceil(ontologyContent.length / 4),
        version: existingOntology.version + 1,
        lastSynthesizedAt: new Date(),
        synthesizedByModel: model,
      },
    });

    logSystemIntelligenceChange({
      action: "page_updated",
      pageSlug: slug,
      pageTitle: `Knowledge Ontology — ${vertical}`,
      pageType: "ontology_index",
      previousContent: existingOntology.content,
      newContent: ontologyContent,
      reason: `Auto-generated from ${corpusMap.documents.length}-document corpus`,
      changeSource: "research_synthesis",
      curatorModel: model,
    }).catch(() => {});
  } else {
    const page = await prisma.knowledgePage.create({
      data: {
        operatorId: null,
        scope: "system",
        pageType: "ontology_index",
        title: `Knowledge Ontology — ${vertical}`,
        slug,
        content: ontologyContent,
        contentTokens: Math.ceil(ontologyContent.length / 4),
        crossReferences: [],
        sources: [],
        sourceCount: 0,
        sourceTypes: ["corpus_pipeline"],
        status: "verified",
        confidence: 0.9,
        version: 1,
        synthesisPath: "corpus_pipeline",
        synthesizedByModel: model,
        lastSynthesizedAt: new Date(),
        verifiedAt: new Date(),
        verifiedByModel: model,
      },
      select: { id: true },
    });

    logSystemIntelligenceChange({
      action: "page_created",
      pageSlug: slug,
      pageTitle: `Knowledge Ontology — ${vertical}`,
      pageType: "ontology_index",
      newContent: ontologyContent,
      reason: `Auto-generated from ${corpusMap.documents.length}-document corpus`,
      changeSource: "research_synthesis",
      curatorModel: model,
    }).catch(() => {});
  }

  // Generate horizontal skill ontology stubs
  await generateHorizontalSkillOntologies(ontologyContent, vertical);

  return slug;
}

async function generateHorizontalSkillOntologies(
  verticalOntology: string,
  vertical: string,
): Promise<void> {
  const crossCuttingSection = verticalOntology.split("## Cross-Cutting Skills")[1];
  if (!crossCuttingSection) return;

  const skillHeaders = crossCuttingSection.match(/### (.+?)(?:\s*\(|$)/gm) ?? [];
  const skillNames = skillHeaders.map(h => h.replace("### ", "").replace(/\s*\(.+$/, "").trim());

  for (const skillName of skillNames) {
    const skillSlug = `ontology-skill-${skillName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

    const existing = await prisma.knowledgePage.findFirst({
      where: { scope: "system", slug: skillSlug, pageType: "ontology_index" },
      select: { id: true },
    });
    if (existing) continue;

    const verticalSlug = `ontology-${vertical.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const content = `# Knowledge Ontology — ${skillName} (Horizontal Skill)

${skillName} is a cross-cutting skill applicable across multiple vertical domains.

## Core Principles
- [critical] Foundational Concepts: Core principles and frameworks of ${skillName.toLowerCase()} (needs: fundamentals)
- [important] Methodologies: Established approaches and techniques (needs: methodology)
- [useful] Psychology and Behavioral Patterns: Human factors and cognitive aspects (needs: theory)

## Applications
This skill has been identified as relevant in the following verticals:
- ${vertical}: See [[${verticalSlug}]] for application requirements

*This ontology was auto-generated as a stub. It will be enriched when a focused research corpus on ${skillName.toLowerCase()} is processed.*`;

    await prisma.knowledgePage.create({
      data: {
        operatorId: null,
        scope: "system",
        pageType: "ontology_index",
        title: `Knowledge Ontology — ${skillName} (Skill)`,
        slug: skillSlug,
        content,
        contentTokens: Math.ceil(content.length / 4),
        crossReferences: [verticalSlug],
        sources: [],
        sourceCount: 0,
        sourceTypes: ["corpus_pipeline"],
        status: "draft",
        confidence: 0.5,
        version: 1,
        synthesisPath: "corpus_pipeline",
        synthesizedByModel: "auto_stub",
        lastSynthesizedAt: new Date(),
      },
    }).catch(() => {});
  }
}

// ═══ Helpers ═══════════════════════════════════════════

function extractCrossRefsFromContent(content: string): string[] {
  const matches = content.match(/\[\[([a-z0-9-]+)\]\]/g) ?? [];
  return [...new Set(matches.map(m => m.replace(/\[\[|\]\]/g, "")))];
}

function topologicalSort(pages: PagePlan[]): PagePlan[] {
  const slugMap = new Map(pages.map(p => [p.slug, p]));
  const visited = new Set<string>();
  const sorted: PagePlan[] = [];

  function visit(slug: string) {
    if (visited.has(slug)) return;
    visited.add(slug);
    const page = slugMap.get(slug);
    if (!page) return;
    for (const dep of page.dependsOn) {
      visit(dep);
    }
    sorted.push(page);
  }

  // Visit critical pages first, then important, then useful
  const byPriority = [...pages].sort((a, b) => {
    const order = { critical: 0, important: 1, useful: 2 };
    return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
  });

  for (const page of byPriority) {
    visit(page.slug);
  }

  return sorted;
}

/** Upsert a system-scoped page (null operatorId). Uses findFirst + create/update
 *  because Prisma can't use null in compound unique where clauses. */
async function upsertSystemPage(
  slug: string,
  title: string,
  pageType: string,
  content: string,
  synthesisPath: string,
  synthesizedByModel: string,
): Promise<void> {
  const existing = await prisma.knowledgePage.findFirst({
    where: { scope: "system", slug },
    select: { id: true },
  });
  if (existing) {
    await prisma.knowledgePage.update({
      where: { id: existing.id },
      data: { content, lastSynthesizedAt: new Date() },
    });
  } else {
    await prisma.knowledgePage.create({
      data: {
        operatorId: null,
        scope: "system",
        pageType,
        title,
        slug,
        content,
        contentTokens: 0,
        sources: [],
        sourceCount: 0,
        sourceTypes: [synthesisPath],
        status: "draft",
        confidence: 1.0,
        version: 1,
        synthesisPath,
        synthesizedByModel,
        lastSynthesizedAt: new Date(),
      },
    });
  }
}
