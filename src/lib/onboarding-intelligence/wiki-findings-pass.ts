/**
 * Wiki Findings Pass (Pass 1) — iterative context-managed reader.
 *
 * Reads raw operator data and writes structured findings to draft KnowledgePages.
 * Content is prioritized by information density and processed iteratively:
 * each reader agent writes findings to wiki pages, and the next reader reads
 * the wiki to load accumulated understanding before continuing.
 *
 * Smart model routing: Haiku for simple content, Sonnet for complex.
 */

import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSONAny } from "@/lib/json-helpers";
import type { PeopleRegistryEntry } from "./people-discovery";

// ── Configuration ──────────────────────────────────────────────────────────────

const PERSON_CONCURRENCY = 5;
const READER_TOKEN_BUDGET = 80_000;

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-6";

function getFindingsModel(): string {
  try {
    const m = getModel("contentClassification" as any);
    if (m) return m;
  } catch { /* fallback */ }
  return SONNET_MODEL;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FindingsPassReport {
  personPages: number;
  domainPages: number;
  processPages: number;
  externalPages: number;
  totalObservations: number;
  totalCostCents: number;
  durationMs: number;
  errors: string[];
  readersUsed: number;
  haikuItems: number;
  sonnetItems: number;
}

interface PrioritizedContent {
  id: string;
  sourceType: string;
  sourceId: string;
  rawBody: string;
  rawMetadata: Record<string, unknown>;
  occurredAt: Date;
  priority: number;
  complexity: "simple" | "medium" | "complex";
  threadGroup?: string;
}

interface FindingEntry {
  targetPage: string;
  targetPageTitle: string;
  targetPageType: string;
  observation: string;
}

interface ParsedMetadata {
  from?: string;
  to?: string;
  cc?: string;
  subject?: string;
  date?: string;
  sender?: string;
  channel?: string;
  fileName?: string;
  threadId?: string;
  attendees?: string[];
  recurrence?: string;
  location?: string;
  timestamp?: string;
  isAutomated?: boolean;
  [key: string]: unknown;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const executing: Promise<void>[] = [];
  for (const item of items) {
    const p = fn(item).then(() => {
      executing.splice(executing.indexOf(p), 1);
    });
    executing.push(p);
    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

function parseMeta(raw: string | null | undefined | object): ParsedMetadata {
  if (!raw) return {};
  try {
    return typeof raw === "string" ? JSON.parse(raw) : (raw as ParsedMetadata);
  } catch {
    return {};
  }
}

function sanitizeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function inferPageType(slug: string): string {
  if (slug.startsWith("findings-person")) return "findings_person";
  if (slug.startsWith("findings-domain")) return "findings_domain";
  if (slug.startsWith("findings-process")) return "findings_process";
  if (slug.startsWith("findings-external")) return "findings_external";
  if (slug.startsWith("findings-project")) return "findings_project";
  if (slug.startsWith("findings-company")) return "findings_overview";
  return "findings_domain";
}

function trackPageType(report: FindingsPassReport, pageType: string): void {
  switch (pageType) {
    case "findings_person": report.personPages++; break;
    case "findings_domain": report.domainPages++; break;
    case "findings_process": report.processPages++; break;
    case "findings_external": report.externalPages++; break;
  }
}

// ── Content Prioritization ─────────────────────────────────────────────────────

function assessComplexity(rawBody: string, sourceType: string, meta: ParsedMetadata): "simple" | "medium" | "complex" {
  const bodyLength = rawBody?.length || 0;

  // Simple: short messages, automated emails, calendar confirmations
  if (bodyLength < 200) return "simple";
  if (meta.isAutomated) return "simple";
  if (sourceType === "calendar_event" && !rawBody) return "simple";
  if (sourceType === "calendar_note" && bodyLength < 300) return "simple";

  // Complex: long documents, financial/legal content
  if (bodyLength > 5000) return "complex";
  if (["file_upload", "drive_doc", "uploaded_doc", "file", "document", "sharepoint_file"].includes(sourceType)) return "complex";

  const complexKeywords = ["contract", "agreement", "invoice", "proposal", "budget",
    "legal", "compliance", "audit", "confidential", "nda", "terms"];
  const lowerBody = rawBody?.toLowerCase() || "";
  if (complexKeywords.some(kw => lowerBody.includes(kw))) return "complex";

  return "medium";
}

function assignPriority(sourceType: string, meta: ParsedMetadata, hasThread: boolean, companyDomain?: string): number {
  if (meta.isAutomated) return 90;

  if (sourceType === "email") {
    // Internal = sender domain matches company domain
    const senderDomain = meta.from?.split("@")[1]?.toLowerCase();
    const isInternal = companyDomain ? senderDomain === companyDomain : true;
    if (hasThread) return isInternal ? 10 : 50;
    return isInternal ? 30 : 60;
  }

  if (["file_upload", "drive_doc", "uploaded_doc", "file", "document", "sharepoint_file"].includes(sourceType)) {
    return 20;
  }

  if (sourceType === "calendar_event" || sourceType === "calendar_note") {
    const hasNotes = (meta.subject?.length ?? 0) > 0 || false;
    return hasNotes ? 40 : 80;
  }

  // Slack/Teams messages
  if (["slack_message", "teams_message"].includes(sourceType)) return 70;

  return 60;
}

function prioritizeContent(rawItems: Array<{
  id: string;
  sourceType: string;
  sourceId: string;
  rawBody: string;
  rawMetadata: unknown;
  occurredAt: Date;
}>, companyDomain?: string): PrioritizedContent[] {
  return rawItems.map(item => {
    const meta = parseMeta(item.rawMetadata as string | null | object);
    const hasThread = !!(meta.threadId);
    return {
      id: item.id,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      rawBody: item.rawBody,
      rawMetadata: meta as Record<string, unknown>,
      occurredAt: item.occurredAt,
      priority: assignPriority(item.sourceType, meta, hasThread, companyDomain),
      complexity: assessComplexity(item.rawBody, item.sourceType, meta),
    };
  });
}

// ── Thread Grouping ────────────────────────────────────────────────────────────

function groupByThread(items: PrioritizedContent[]): PrioritizedContent[] {
  const threads = new Map<string, PrioritizedContent[]>();
  const nonThreaded: PrioritizedContent[] = [];

  for (const item of items) {
    const threadId = item.rawMetadata?.threadId as string;
    if (threadId && item.sourceType === "email") {
      if (!threads.has(threadId)) threads.set(threadId, []);
      threads.get(threadId)!.push(item);
    } else {
      nonThreaded.push(item);
    }
  }

  const result: PrioritizedContent[] = [];
  for (const [, thread] of threads) {
    thread.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    const threadPriority = Math.min(...thread.map(t => t.priority));
    const groupId = thread[0].sourceId;
    for (const item of thread) {
      item.priority = threadPriority;
      item.threadGroup = groupId;
    }
    result.push(...thread);
  }

  result.push(...nonThreaded);
  result.sort((a, b) => a.priority - b.priority || a.occurredAt.getTime() - b.occurredAt.getTime());

  return result;
}

// ── Batch Sizing ───────────────────────────────────────────────────────────────

function buildReaderBatch(
  items: PrioritizedContent[],
  startIndex: number,
): { batch: PrioritizedContent[]; nextIndex: number } {
  let totalTokens = 0;
  const batch: PrioritizedContent[] = [];
  let i = startIndex;

  while (i < items.length && totalTokens < READER_TOKEN_BUDGET) {
    const item = items[i];
    const itemTokens = estimateTokens(item.rawBody || "");

    // Don't split threads — include the full thread or none
    if (item.threadGroup) {
      const threadItems: PrioritizedContent[] = [];
      let threadTokens = 0;
      let j = i;
      while (j < items.length && items[j].threadGroup === item.threadGroup) {
        threadItems.push(items[j]);
        threadTokens += estimateTokens(items[j].rawBody || "");
        j++;
      }

      if (totalTokens + threadTokens > READER_TOKEN_BUDGET && batch.length > 0) break;
      batch.push(...threadItems);
      totalTokens += threadTokens;
      i = j;
    } else {
      if (totalTokens + itemTokens > READER_TOKEN_BUDGET && batch.length > 0) break;
      batch.push(item);
      totalTokens += itemTokens;
      i++;
    }
  }

  return { batch, nextIndex: i };
}

// ── Page Writer (atomic upsert) ────────────────────────────────────────────────

async function appendFindingsToPage(
  operatorId: string,
  slug: string,
  pageType: string,
  title: string,
  observation: string,
  createdPages: Map<string, true>,
  subjectEntityId?: string,
): Promise<void> {
  const key = `${operatorId}:${slug}`;

  if (!createdPages.has(key)) {
    const existing = await prisma.knowledgePage.findUnique({
      where: { operatorId_slug: { operatorId, slug } },
      select: { id: true },
    });

    if (!existing) {
      const header = `# ${title}\n\n_Findings page — structured observations from raw data analysis._\n\n---\n\n`;
      const fullContent = header + observation;
      await prisma.knowledgePage.create({
        data: {
          operatorId,
          scope: "operator",
          pageType,
          title,
          slug,
          content: fullContent,
          contentTokens: estimateTokens(fullContent),
          crossReferences: [],
          status: "draft",
          confidence: 0.3,
          version: 1,
          synthesisPath: "findings",
          synthesizedByModel: getFindingsModel(),
          lastSynthesizedAt: new Date(),
          ...(subjectEntityId ? { subjectEntityId } : {}),
        },
      });
      createdPages.set(key, true);
      return;
    }
    createdPages.set(key, true);
  }

  const newTokens = estimateTokens(observation);
  await prisma.$executeRaw`
    UPDATE "KnowledgePage"
    SET content = content || E'\n\n' || ${observation}::text,
        "contentTokens" = "contentTokens" + ${newTokens},
        "lastSynthesizedAt" = NOW(),
        "updatedAt" = NOW()
    WHERE "operatorId" = ${operatorId} AND slug = ${slug}
  `;
}

// ── Reader Agent ───────────────────────────────────────────────────────────────

async function runReaderAgent(
  operatorId: string,
  batch: PrioritizedContent[],
  readerIndex: number,
  model: string,
  createdPages: Map<string, true>,
  report: FindingsPassReport,
  onProgress?: (msg: string) => Promise<void>,
): Promise<{ costCents: number; observationsWritten: number }> {
  let costCents = 0;
  let observationsWritten = 0;

  // Format content items for the reader
  const contentBlock = batch.map((item, idx) => {
    const meta = item.rawMetadata;
    let header = `--- ITEM ${idx + 1} [${item.sourceType}] ---`;
    if (meta.subject) header += `\nSubject: ${meta.subject}`;
    if (meta.from) header += `\nFrom: ${meta.from}`;
    if (meta.to) header += `\nTo: ${meta.to}`;
    if (meta.date || meta.timestamp) header += `\nDate: ${meta.date || meta.timestamp}`;
    if (meta.fileName) header += `\nFile: ${meta.fileName}`;
    if (meta.attendees && Array.isArray(meta.attendees)) header += `\nAttendees: ${(meta.attendees as string[]).join(", ")}`;
    if (item.threadGroup) header += `\n[Thread: ${item.threadGroup}]`;
    return `${header}\n${item.rawBody?.slice(0, 3000) || "(empty)"}`;
  }).join("\n\n");

  // Load existing findings pages with content snippets for reader continuity
  let existingFindings = "";
  if (readerIndex > 1) {
    const pages = await prisma.knowledgePage.findMany({
      where: { operatorId, synthesisPath: "findings", status: "draft" },
      select: { slug: true, title: true, pageType: true, content: true, contentTokens: true },
      orderBy: { contentTokens: "desc" },
    });
    if (pages.length > 0) {
      existingFindings = `\n\nEXISTING FINDINGS (${pages.length} pages from previous readers):\n` +
        pages.map(p => {
          // Include first ~300 tokens (~1200 chars) of content so the reader knows WHAT was found
          const snippet = p.content
            .replace(/^#.*\n+_Findings page.*\n+---\n+/s, "") // strip header
            .slice(0, 1200)
            .trim();
          return `### ${p.title} (${p.pageType})\n${snippet}${p.content.length > 1200 ? "\n..." : ""}`;
        }).join("\n\n");
    }
  }

  const systemPrompt = `You are an organizational intelligence analyst reading through a company's data. Your job is to build understanding by writing structured findings.

You are Reader #${readerIndex}. ${readerIndex > 1 ? "Previous readers have already processed some content and written findings. The existing findings pages are listed below — build on them." : "You are the first reader. Start fresh."}

## What You're Reading

You'll receive ${batch.length} content items (emails, documents, calendar events). Read each one and extract findings.

## How to Write Findings

Respond with ONLY a JSON array of findings:
{
  "findings": [
    {
      "targetPage": "findings-domain-engineering",
      "targetPageTitle": "Engineering Domain Findings",
      "targetPageType": "findings_domain",
      "observation": "Detailed observation with names, dates, amounts, subjects."
    }
  ]
}

Page naming conventions:
- findings-person-{name} / findings_person — observations about a specific person
- findings-domain-{name} / findings_domain — observations about a functional area
- findings-process-{name} / findings_process — observations about a recurring process
- findings-external-{name} / findings_external — observations about a vendor/client/partner
- findings-project-{name} / findings_project — observations about a specific project

## Rules

- Be specific. Cite email subjects, meeting names, dates, participants.
- Each finding should be analyst's notes, not a summary.
- Create new findings pages freely — better to over-create than miss categories.
- If you see something that connects to an existing finding, mention the connection.
- Do NOT skip content. Extract findings from every item.${existingFindings}`;

  const response = await callLLM({
    instructions: systemPrompt,
    messages: [{ role: "user", content: `Analyze these ${batch.length} content items and extract findings:\n\n${contentBlock}` }],
    model,
    maxTokens: model === HAIKU_MODEL ? 4000 : 8000,
  });

  costCents += response.apiCostCents;

  const parsed = extractJSONAny(response.text) as { findings?: FindingEntry[] } | null;
  if (parsed?.findings && Array.isArray(parsed.findings)) {
    for (const finding of parsed.findings) {
      if (!finding.targetPage || !finding.observation) continue;
      const slug = sanitizeSlug(finding.targetPage);
      const pageType = finding.targetPageType || inferPageType(slug);
      await appendFindingsToPage(
        operatorId,
        slug,
        pageType,
        finding.targetPageTitle || slug,
        finding.observation,
        createdPages,
      );
      trackPageType(report, pageType);
      observationsWritten++;
    }
  }

  return { costCents, observationsWritten };
}

// ── Iterative Content Processing ───────────────────────────────────────────────

async function processAllContent(
  operatorId: string,
  sortedItems: PrioritizedContent[],
  createdPages: Map<string, true>,
  report: FindingsPassReport,
  onProgress?: (msg: string) => Promise<void>,
): Promise<{ readersUsed: number; errors: string[] }> {
  let readerIndex = 0;
  let currentIndex = 0;
  const errors: string[] = [];

  while (currentIndex < sortedItems.length) {
    readerIndex++;

    const { batch, nextIndex } = buildReaderBatch(sortedItems, currentIndex);
    if (batch.length === 0) break;

    // Determine model from batch complexity
    const simpleCount = batch.filter(b => b.complexity === "simple").length;
    const simpleRatio = simpleCount / batch.length;
    const model = simpleRatio > 0.8 ? HAIKU_MODEL : SONNET_MODEL;

    const modelLabel = model === HAIKU_MODEL ? "Haiku" : "Sonnet";
    await onProgress?.(`Reader ${readerIndex}: processing ${batch.length} items (${modelLabel})...`);

    try {
      const result = await runReaderAgent(operatorId, batch, readerIndex, model, createdPages, report, onProgress);
      report.totalCostCents += result.costCents;
      report.totalObservations += result.observationsWritten;

      // Mark content as processed
      const processedIds = batch.map(b => b.id);
      await prisma.rawContent.updateMany({
        where: { id: { in: processedIds } },
        data: { processedAt: new Date(), processedBy: `reader-${readerIndex}` },
      });

      await onProgress?.(`Reader ${readerIndex} complete: ${result.observationsWritten} observations, ${report.totalObservations} total`);
    } catch (err) {
      const msg = `Reader ${readerIndex} failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[wiki-findings] ${msg}`);
      errors.push(msg);
    }

    currentIndex = nextIndex;
  }

  return { readersUsed: readerIndex, errors };
}

// ── Person Findings (parallel) ─────────────────────────────────────────────────

async function processPersonFindings(
  operatorId: string,
  internalPeople: PeopleRegistryEntry[],
  rawItems: Array<{ sourceType: string; sourceId: string; rawBody: string; rawMetadata: unknown; occurredAt: Date }>,
  calendarSignals: Array<{ metadata: unknown; occurredAt: Date }>,
  createdPages: Map<string, true>,
  report: FindingsPassReport,
  onProgress?: (msg: string) => Promise<void>,
): Promise<void> {
  if (internalPeople.length === 0) return;

  await onProgress?.(`Person findings: processing ${internalPeople.length} team members...`);

  await runWithConcurrency(internalPeople, PERSON_CONCURRENCY, async (person) => {
    try {
      const personEmail = person.email?.toLowerCase();
      if (!personEmail) return;

      // Gather emails involving this person
      const personEmails = rawItems.filter(c => {
        if (c.sourceType !== "email") return false;
        const meta = parseMeta(c.rawMetadata as string | null | object);
        const participants = [meta.from, meta.to, meta.cc, meta.sender].filter(Boolean).join(" ").toLowerCase();
        return participants.includes(personEmail);
      });

      // Gather calendar items
      const personMeetings = calendarSignals.filter(s => {
        const meta = parseMeta(s.metadata as string);
        const attendees = (meta.attendees ?? []).map((a: string) => a.toLowerCase());
        return attendees.includes(personEmail);
      });

      // Gather documents mentioning this person
      const personName = person.displayName.toLowerCase();
      const personDocs = rawItems.filter(c => {
        if (!["file_upload", "drive_doc", "uploaded_doc", "file", "document", "sharepoint_file"].includes(c.sourceType)) return false;
        const content = c.rawBody?.toLowerCase() || "";
        return content.includes(personName) || content.includes(personEmail);
      });

      if (personEmails.length === 0 && personMeetings.length === 0 && personDocs.length === 0) return;

      // Determine model based on data volume
      const totalItems = personEmails.length + personMeetings.length + personDocs.length;
      const model = totalItems < 5 ? HAIKU_MODEL : getFindingsModel();

      // Build context
      const emailSummaries = personEmails.slice(0, 30).map(c => {
        const meta = parseMeta(c.rawMetadata as string | null | object);
        return `From: ${meta.from || meta.sender || "unknown"}\nTo: ${meta.to || "unknown"}\nSubject: ${meta.subject || "(no subject)"}\nDate: ${meta.date || meta.timestamp || "unknown"}\nBody: ${c.rawBody?.slice(0, 1000) || ""}`;
      });

      const meetingSummaries = personMeetings.slice(0, 20).map(s => {
        const meta = parseMeta(s.metadata as string);
        return `Meeting: ${meta.subject || "Untitled"}\nDate: ${s.occurredAt.toISOString()}\nAttendees: ${(meta.attendees ?? []).join(", ")}\nLocation: ${meta.location || "N/A"}`;
      });

      const docSummaries = personDocs.slice(0, 10).map(c => {
        const meta = parseMeta(c.rawMetadata as string | null | object);
        return `Document (${c.sourceType}): ${meta.fileName || meta.subject || "Untitled"}\nExcerpt: ${c.rawBody?.slice(0, 500) || ""}`;
      });

      const prompt = `PERSON: ${person.displayName}
EMAIL: ${personEmail}
TITLE: ${person.adminTitle || person.sources?.[0]?.title || "Unknown"}
DEPARTMENT: ${person.adminDepartment || person.sources?.[0]?.role || "Unknown"}

EMAILS (${personEmails.length} total, showing ${emailSummaries.length}):
${emailSummaries.join("\n---\n")}

MEETINGS (${personMeetings.length} total, showing ${meetingSummaries.length}):
${meetingSummaries.join("\n---\n")}

DOCUMENTS (${personDocs.length}):
${docSummaries.join("\n---\n")}

Write structured findings about this person. Include:
1. Their likely role and responsibilities (based on evidence)
2. Who they communicate with most
3. What topics/projects they're involved in
4. Communication patterns
5. Notable observations (leadership, expertise, bottleneck signals)

Be specific — cite email subjects, meeting names, document names.`;

      const response = await callLLM({
        instructions: "You are writing structured analyst findings about a team member. Be detailed and specific.",
        messages: [{ role: "user", content: prompt }],
        model,
        maxTokens: 4000,
      });

      report.totalCostCents += response.apiCostCents;

      const slug = `findings-person-${sanitizeSlug(person.displayName)}`;
      await appendFindingsToPage(
        operatorId,
        slug,
        "findings_person",
        `Person Findings: ${person.displayName}`,
        response.text,
        createdPages,
        person.entityId,
      );
      report.personPages++;
      report.totalObservations++;
    } catch (err) {
      const msg = `Person findings failed for ${person.displayName}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[wiki-findings] ${msg}`);
      report.errors.push(msg);
    }
  });

  await onProgress?.(`Person findings complete: ${report.personPages} pages`);
}

// ── Company Overview (post-processing) ─────────────────────────────────────────

async function processCompanyOverview(
  operatorId: string,
  internalPeople: PeopleRegistryEntry[],
  externalPeople: PeopleRegistryEntry[],
  contentCounts: { emails: number; documents: number; calendar: number },
  createdPages: Map<string, true>,
  report: FindingsPassReport,
  onProgress?: (msg: string) => Promise<void>,
): Promise<void> {
  await onProgress?.("Writing company overview findings...");

  try {
    const findingsPages = await prisma.knowledgePage.findMany({
      where: { operatorId, synthesisPath: "findings", status: "draft" },
      select: { slug: true, pageType: true, title: true, contentTokens: true },
      orderBy: { contentTokens: "desc" },
    });

    const pageSummary = findingsPages
      .map(p => `- ${p.title} (${p.pageType}, ~${p.contentTokens} tokens)`)
      .join("\n");

    const teamList = internalPeople.length > 0
      ? `TEAM MEMBERS:\n${internalPeople.slice(0, 30).map(p => `- ${p.displayName}${p.adminTitle ? ` (${p.adminTitle})` : ""}${p.adminDepartment ? ` — ${p.adminDepartment}` : ""}`).join("\n")}`
      : "";

    const overviewPrompt = `FINDINGS PAGES CREATED (${findingsPages.length} pages):
${pageSummary}

PEOPLE: ${internalPeople.length} internal, ${externalPeople.length} external
DATA SOURCES: ${contentCounts.emails} emails, ${contentCounts.documents} documents, ${contentCounts.calendar} calendar items

${teamList}

Write a high-level company overview covering:
1. Company size and apparent structure
2. Communication patterns
3. Key domains/functions identified
4. External relationships
5. Organizational dynamics (hubs, hierarchy)
6. Tools and systems in use
7. Notable patterns or concerns

These are analyst working notes — be specific and cite evidence.`;

    const response = await callLLM({
      instructions: "You are writing a company overview based on analyzed organizational data. Be thorough and specific.",
      messages: [{ role: "user", content: overviewPrompt }],
      model: getFindingsModel(),
      maxTokens: 6000,
    });

    report.totalCostCents += response.apiCostCents;

    await appendFindingsToPage(
      operatorId,
      "findings-company-overview",
      "findings_overview",
      "Company Overview Findings",
      response.text,
      createdPages,
    );
    report.totalObservations++;
  } catch (err) {
    const msg = `Company overview failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[wiki-findings] ${msg}`);
    report.errors.push(msg);
  }
}

// ── Main Entry Point ───────────────────────────────────────────────────────────

export async function runWikiFindingsPass(
  operatorId: string,
  options?: {
    onProgress?: (msg: string) => Promise<void>;
    analysisId?: string;
  },
): Promise<FindingsPassReport> {
  const startTime = Date.now();
  const progress = options?.onProgress ?? (async () => {});
  const report: FindingsPassReport = {
    personPages: 0,
    domainPages: 0,
    processPages: 0,
    externalPages: 0,
    totalObservations: 0,
    totalCostCents: 0,
    durationMs: 0,
    errors: [],
    readersUsed: 0,
    haikuItems: 0,
    sonnetItems: 0,
  };

  const createdPages = new Map<string, true>();

  // ── 1. Load people registry ──────────────────────────────────────────────────

  await progress("Loading people registry...");

  const analysis = options?.analysisId
    ? await prisma.onboardingAnalysis.findUnique({
        where: { id: options.analysisId },
        select: { id: true },
      })
    : await prisma.onboardingAnalysis.findFirst({
        where: { operatorId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

  let peopleRegistry: PeopleRegistryEntry[] = [];

  if (analysis) {
    const peopleRun = await prisma.onboardingAgentRun.findFirst({
      where: { analysisId: analysis.id, agentName: "people_discovery", status: "complete" },
      orderBy: { completedAt: "desc" },
      select: { report: true },
    });
    if (peopleRun?.report && Array.isArray(peopleRun.report)) {
      peopleRegistry = peopleRun.report as unknown as PeopleRegistryEntry[];
    }
  }

  const internalPeople = peopleRegistry.filter(p => p.isInternal);
  const externalPeople = peopleRegistry.filter(p => !p.isInternal);

  await progress(`People registry: ${internalPeople.length} internal, ${externalPeople.length} external`);

  // ── 2. Load all unprocessed raw content ──────────────────────────────────────

  await progress("Loading raw content...");

  const rawItems = await prisma.rawContent.findMany({
    where: { operatorId, rawBody: { not: null }, processedAt: null },
    select: {
      id: true,
      sourceType: true,
      sourceId: true,
      rawBody: true,
      rawMetadata: true,
      occurredAt: true,
    },
    orderBy: { occurredAt: "asc" },
    take: 10000,
  });

  // ActivitySignal table removed — calendar signals no longer available here
  const calendarSignals: { metadata: unknown; occurredAt: Date }[] = [];

  // Content counts for overview
  const emailCount = rawItems.filter(r => r.sourceType === "email").length;
  const docCount = rawItems.filter(r => ["file_upload", "drive_doc", "uploaded_doc", "file", "document", "sharepoint_file"].includes(r.sourceType)).length;
  const calCount = rawItems.filter(r => r.sourceType === "calendar_note").length + calendarSignals.length;

  await progress(`Raw data: ${rawItems.length} items (${emailCount} emails, ${docCount} documents, ${calCount} calendar)`);

  // ── 3. Prioritize and classify content ───────────────────────────────────────

  // Derive company domain from internal people emails (most common domain)
  const domainCounts = new Map<string, number>();
  for (const p of internalPeople) {
    const domain = p.email?.split("@")[1]?.toLowerCase();
    if (domain) domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
  }
  const companyDomain = domainCounts.size > 0
    ? [...domainCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
    : undefined;

  const prioritized = prioritizeContent(rawItems.map(r => ({
    id: r.id,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    rawBody: r.rawBody!,
    rawMetadata: r.rawMetadata,
    occurredAt: r.occurredAt,
  })), companyDomain);

  // ── 4. Group threads ─────────────────────────────────────────────────────────

  const grouped = groupByThread(prioritized);

  report.haikuItems = grouped.filter(g => g.complexity === "simple").length;
  report.sonnetItems = grouped.filter(g => g.complexity !== "simple").length;

  await progress(`Classified: ${report.haikuItems} simple (Haiku), ${report.sonnetItems} medium/complex (Sonnet)`);

  // ── 5. Person findings (parallel) ────────────────────────────────────────────

  await processPersonFindings(
    operatorId,
    internalPeople,
    rawItems.map(r => ({
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      rawBody: r.rawBody!,
      rawMetadata: r.rawMetadata,
      occurredAt: r.occurredAt,
    })),
    calendarSignals,
    createdPages,
    report,
    progress,
  );

  // ── 6. Iterative reader loop ─────────────────────────────────────────────────

  const readerResult = await processAllContent(operatorId, grouped, createdPages, report, progress);
  report.readersUsed = readerResult.readersUsed;
  report.errors.push(...readerResult.errors);

  // ── 7. Company overview ──────────────────────────────────────────────────────

  await processCompanyOverview(
    operatorId,
    internalPeople,
    externalPeople,
    { emails: emailCount, documents: docCount, calendar: calCount },
    createdPages,
    report,
    progress,
  );

  // ── 8. Final report ──────────────────────────────────────────────────────────

  report.durationMs = Date.now() - startTime;

  // Count page types from actual DB
  const findingsPages = await prisma.knowledgePage.findMany({
    where: { operatorId, synthesisPath: "findings" },
    select: { pageType: true },
  });
  // Reset counts from DB truth
  let dbDomainPages = 0, dbProcessPages = 0, dbExternalPages = 0;
  for (const p of findingsPages) {
    if (p.pageType === "findings_domain") dbDomainPages++;
    else if (p.pageType === "findings_process") dbProcessPages++;
    else if (p.pageType === "findings_external") dbExternalPages++;
  }
  report.domainPages = dbDomainPages;
  report.processPages = dbProcessPages;
  report.externalPages = dbExternalPages;

  await progress(
    `Wiki findings pass complete: ${report.totalObservations} observations, ${report.readersUsed} readers, ${report.personPages} person / ${report.domainPages} domain / ${report.processPages} process / ${report.externalPages} external pages ($${(report.totalCostCents / 100).toFixed(2)}, ${Math.round(report.durationMs / 1000)}s)`,
  );

  return report;
}
