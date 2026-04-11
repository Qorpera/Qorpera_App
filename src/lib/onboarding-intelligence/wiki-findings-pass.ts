/**
 * Wiki Findings Pass (Pass 1) — reads all raw operator data and writes
 * structured findings to draft KnowledgePages organized by topic.
 *
 * These pages are working notes (not polished wiki pages). They become the
 * source material for the synthesis pass (Pass 2).
 *
 * Model: Sonnet (fast, parallel batch processing).
 */

import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSONAny } from "@/lib/json-helpers";
import { addProgressMessage } from "./progress";
import type { PeopleRegistryEntry } from "./people-discovery";

// ── Configuration ──────────────────────────────────────────────────────────────

const PERSON_CONCURRENCY = 5;
const EMAIL_BATCH_SIZE = 20;
const DOC_CONCURRENCY = 5;
const CALENDAR_BATCH_SIZE = 30;
const BATCH_CONCURRENCY = 5;

function getFindingsModel(): string {
  try {
    const m = getModel("contentClassification" as any);
    if (m) return m;
  } catch { /* fallback */ }
  return "claude-sonnet-4-6";
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
  [key: string]: unknown;
}

// ── Concurrency helper ─────────────────────────────────────────────────────────

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

function parseMeta(raw: string | null | undefined): ParsedMetadata {
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

// ── Page writer (atomic upsert) ────────────────────────────────────────────────

/**
 * In-memory tracker for pages created in this run — avoids duplicate creates
 * from concurrent batches targeting the same slug.
 */
const createdPages = new Map<string, true>();

async function appendFindingsToPage(
  operatorId: string,
  slug: string,
  pageType: string,
  title: string,
  observation: string,
  subjectEntityId?: string,
): Promise<void> {
  const key = `${operatorId}:${slug}`;

  if (!createdPages.has(key)) {
    // First time seeing this page — try to create, or append if it already exists
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
          sources: [],
          sourceCount: 0,
          sourceTypes: [],
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

  // Page exists — append observation atomically
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

// ── Orchestrator ───────────────────────────────────────────────────────────────

export async function runWikiFindingsPass(
  operatorId: string,
  options?: {
    onProgress?: (msg: string) => Promise<void>;
    analysisId?: string;
  },
): Promise<FindingsPassReport> {
  const startTime = Date.now();
  const model = getFindingsModel();
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
  };

  // Reset the page tracker for this run
  createdPages.clear();

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

  const internalPeople = peopleRegistry.filter((p) => p.isInternal);
  const externalPeople = peopleRegistry.filter((p) => !p.isInternal);

  await progress(`People registry loaded: ${internalPeople.length} internal, ${externalPeople.length} external`);

  // ── 2. Load all raw content ──────────────────────────────────────────────────

  await progress("Loading raw content chunks and activity signals...");

  const allChunks = await prisma.contentChunk.findMany({
    where: { operatorId },
    select: {
      id: true,
      sourceType: true,
      sourceId: true,
      chunkIndex: true,
      content: true,
      metadata: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const calendarSignals = await prisma.activitySignal.findMany({
    where: { operatorId, signalType: { in: ["meeting_held"] } },
    select: {
      id: true,
      signalType: true,
      actorEntityId: true,
      targetEntityIds: true,
      metadata: true,
      occurredAt: true,
    },
    orderBy: { occurredAt: "desc" },
    take: 500,
  });

  // Categorize chunks
  const emailChunks = allChunks.filter((c) => c.sourceType === "email" && c.chunkIndex === 0);
  const docChunks = allChunks.filter((c) =>
    ["file_upload", "drive_doc", "uploaded_doc", "file", "document", "sharepoint_file"].includes(c.sourceType),
  );
  const calendarChunks = allChunks.filter((c) => c.sourceType === "calendar_note" && c.chunkIndex === 0);

  // Reconstruct full documents: group all chunks by sourceId, concatenate
  const docsBySourceId = new Map<string, { content: string; meta: ParsedMetadata; sourceType: string }>();
  for (const chunk of docChunks) {
    const existing = docsBySourceId.get(chunk.sourceId);
    if (existing) {
      existing.content += "\n" + chunk.content;
    } else {
      docsBySourceId.set(chunk.sourceId, {
        content: chunk.content,
        meta: parseMeta(chunk.metadata),
        sourceType: chunk.sourceType,
      });
    }
  }

  await progress(
    `Raw data: ${emailChunks.length} emails, ${docsBySourceId.size} documents, ${calendarSignals.length + calendarChunks.length} calendar items`,
  );

  // ── Phase A: Person findings (parallel, 5 concurrent) ───────────────────────

  if (internalPeople.length > 0) {
    await progress(`Phase A: Writing person findings for ${internalPeople.length} team members...`);

    await runWithConcurrency(internalPeople, PERSON_CONCURRENCY, async (person) => {
      try {
        const personEmail = person.email?.toLowerCase();
        if (!personEmail) return;

        // Gather all emails involving this person
        const personEmails = emailChunks.filter((c) => {
          const meta = parseMeta(c.metadata);
          const participants = [meta.from, meta.to, meta.cc, meta.sender]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return participants.includes(personEmail);
        });

        // Gather calendar items involving this person
        const personMeetings = calendarSignals.filter((s) => {
          const meta = parseMeta(s.metadata as string);
          const attendees = (meta.attendees ?? []).map((a: string) => a.toLowerCase());
          return attendees.includes(personEmail);
        });

        // Gather documents mentioning this person
        const personName = person.displayName.toLowerCase();
        const personDocs = Array.from(docsBySourceId.entries()).filter(([, doc]) =>
          doc.content.toLowerCase().includes(personName) ||
          doc.content.toLowerCase().includes(personEmail),
        );

        if (personEmails.length === 0 && personMeetings.length === 0 && personDocs.length === 0) return;

        // Build context for LLM
        const emailSummaries = personEmails.slice(0, 30).map((c) => {
          const meta = parseMeta(c.metadata);
          return `From: ${meta.from || meta.sender || "unknown"}\nTo: ${meta.to || "unknown"}\nSubject: ${meta.subject || "(no subject)"}\nDate: ${meta.date || meta.timestamp || "unknown"}\nBody: ${c.content.slice(0, 1000)}`;
        });

        const meetingSummaries = personMeetings.slice(0, 20).map((s) => {
          const meta = parseMeta(s.metadata as string);
          return `Meeting: ${meta.subject || "Untitled"}\nDate: ${s.occurredAt.toISOString()}\nAttendees: ${(meta.attendees ?? []).join(", ")}\nLocation: ${meta.location || "N/A"}`;
        });

        const docSummaries = personDocs.slice(0, 10).map(([, doc]) => {
          return `Document (${doc.sourceType}): ${doc.meta.fileName || doc.meta.subject || "Untitled"}\nExcerpt: ${doc.content.slice(0, 500)}`;
        });

        const prompt = `You are analyzing data about a team member at a company to build organizational intelligence.

PERSON: ${person.displayName}
EMAIL: ${personEmail}
TITLE: ${person.adminTitle || person.sources?.[0]?.title || "Unknown"}
DEPARTMENT: ${person.adminDepartment || person.sources?.[0]?.role || "Unknown"}
VERIFIED: ${person.adminApiVerified ? "Yes (directory)" : "No (inferred)"}

EMAILS (${personEmails.length} total, showing ${emailSummaries.length}):
${emailSummaries.join("\n---\n")}

MEETINGS (${personMeetings.length} total, showing ${meetingSummaries.length}):
${meetingSummaries.join("\n---\n")}

DOCUMENTS MENTIONING THEM (${personDocs.length}):
${docSummaries.join("\n---\n")}

Write a structured findings summary for this person. Include:
1. Their likely role and responsibilities (based on evidence, not just title)
2. Who they communicate with most (internal and external)
3. What topics/projects they're involved in
4. Their communication patterns (initiator vs responder, urgency level)
5. Any notable observations (leadership signals, bottleneck signals, expertise areas)

Be specific — cite email subjects, meeting names, document names. These are analyst notes, not polished text.`;

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

    await progress(`Phase A complete: ${report.personPages} person findings pages`);
  }

  // ── Phase B: Communication scan (email batches, parallel) ────────────────────

  if (emailChunks.length > 0) {
    const emailBatches: typeof emailChunks[] = [];
    for (let i = 0; i < emailChunks.length; i += EMAIL_BATCH_SIZE) {
      emailBatches.push(emailChunks.slice(i, i + EMAIL_BATCH_SIZE));
    }

    await progress(`Phase B: Scanning ${emailChunks.length} emails in ${emailBatches.length} batches...`);

    let completedBatches = 0;
    await runWithConcurrency(emailBatches, BATCH_CONCURRENCY, async (batch) => {
      try {
        const formatted = batch.map((c) => {
          const meta = parseMeta(c.metadata);
          return `From: ${meta.from || meta.sender || "unknown"}
To: ${meta.to || "unknown"}
Subject: ${meta.subject || "(no subject)"}
Date: ${meta.date || meta.timestamp || "unknown"}
Body: ${c.content.slice(0, 2000)}`;
        });

        const response = await callLLM({
          instructions: `You are analyzing a batch of emails from a company to build organizational intelligence.

BATCH (${batch.length} emails):
${formatted.join("\n\n════════════════════════════════════════\n\n")}

For each email, extract:
- TOPICS: What functional domains does this relate to? (engineering, sales, HR, etc.)
- PROCESSES: Does this mention or demonstrate a recurring process? (weekly standup, code review, invoice approval, etc.)
- EXTERNAL RELATIONSHIPS: Any vendors, clients, or partners mentioned?
- PROJECTS: Any specific projects or initiatives mentioned?
- KEY INFORMATION: What would be important to know about this company? Tone, urgency, decisions made, action items.

Respond with ONLY JSON:
{
  "findings": [
    {
      "targetPage": "findings-domain-engineering",
      "targetPageTitle": "Engineering Domain Findings",
      "targetPageType": "findings_domain",
      "observation": "The detailed observation text. Include specifics — names, dates, amounts, decisions."
    }
  ]
}

Use these page naming conventions:
- findings-domain-{name} / findings_domain for functional areas
- findings-process-{name} / findings_process for recurring processes
- findings-external-{name} / findings_external for vendors/clients/partners
- findings-person-{name} / findings_person for people-specific observations`,
          messages: [{ role: "user", content: "Analyze the email batch above." }],
          model,
          maxTokens: 6000,
        });

        report.totalCostCents += response.apiCostCents;

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
            );
            trackPageType(report, pageType);
            report.totalObservations++;
          }
        }

        completedBatches++;
        if (completedBatches % 5 === 0 || completedBatches === emailBatches.length) {
          await progress(`Phase B: ${completedBatches}/${emailBatches.length} email batches (${report.totalObservations} observations)`);
        }
      } catch (err) {
        const msg = `Email batch failed: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[wiki-findings] ${msg}`);
        report.errors.push(msg);
      }
    });

    await progress(`Phase B complete: ${report.totalObservations} total observations from emails`);
  }

  // ── Phase C: Document scan (parallel) ────────────────────────────────────────

  const docs = Array.from(docsBySourceId.entries());
  if (docs.length > 0) {
    await progress(`Phase C: Scanning ${docs.length} documents...`);

    const obsBeforeDocs = report.totalObservations;
    await runWithConcurrency(docs, DOC_CONCURRENCY, async ([sourceId, doc]) => {
      try {
        const contentPreview = doc.content.slice(0, 8000);
        const fileName = doc.meta.fileName || doc.meta.subject || sourceId;

        const response = await callLLM({
          instructions: `You are analyzing a document from a company to build organizational intelligence.

DOCUMENT: ${fileName}
TYPE: ${doc.sourceType}
CONTENT:
${contentPreview}

Analyze this document and extract findings. What does it tell us about:
1. What domain/department does it belong to?
2. What processes does it describe or support?
3. Who is involved (authors, stakeholders)?
4. Any external relationships (vendors, clients)?
5. Key information: terms, numbers, deadlines, decisions.

Respond with ONLY JSON:
{
  "findings": [
    {
      "targetPage": "findings-domain-{name}",
      "targetPageTitle": "Domain Title Findings",
      "targetPageType": "findings_domain",
      "observation": "Detailed observation with specifics."
    }
  ]
}

Use these page types: findings_domain, findings_process, findings_external, findings_person`,
          messages: [{ role: "user", content: "Analyze the document above." }],
          model,
          maxTokens: 4000,
        });

        report.totalCostCents += response.apiCostCents;

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
            );
            trackPageType(report, pageType);
            report.totalObservations++;
          }
        }
      } catch (err) {
        const msg = `Document scan failed for ${doc.meta.fileName || sourceId}: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[wiki-findings] ${msg}`);
        report.errors.push(msg);
      }
    });

    await progress(`Phase C complete: ${report.totalObservations - obsBeforeDocs} observations from documents`);
  }

  // ── Phase D: Calendar scan (batches, parallel) ───────────────────────────────

  const calendarItems = [
    ...calendarChunks.map((c) => {
      const meta = parseMeta(c.metadata);
      return {
        subject: meta.subject || "(no subject)",
        date: meta.date || meta.timestamp || c.createdAt.toISOString(),
        attendees: meta.attendees ?? [],
        location: meta.location || "",
        content: c.content.slice(0, 500),
        recurrence: meta.recurrence || "",
      };
    }),
    ...calendarSignals.map((s) => {
      const meta = parseMeta(s.metadata as string);
      return {
        subject: meta.subject || "(no subject)",
        date: s.occurredAt.toISOString(),
        attendees: meta.attendees ?? [],
        location: meta.location || "",
        content: "",
        recurrence: meta.recurrence || "",
      };
    }),
  ];

  if (calendarItems.length > 0) {
    const calendarBatches: typeof calendarItems[] = [];
    for (let i = 0; i < calendarItems.length; i += CALENDAR_BATCH_SIZE) {
      calendarBatches.push(calendarItems.slice(i, i + CALENDAR_BATCH_SIZE));
    }

    await progress(`Phase D: Scanning ${calendarItems.length} calendar items in ${calendarBatches.length} batches...`);

    const obsBeforeCal = report.totalObservations;
    await runWithConcurrency(calendarBatches, BATCH_CONCURRENCY, async (batch) => {
      try {
        const formatted = batch
          .map(
            (item) =>
              `Subject: ${item.subject}\nDate: ${item.date}\nAttendees: ${item.attendees.join(", ") || "N/A"}\nLocation: ${item.location || "N/A"}\nRecurrence: ${item.recurrence || "None"}${item.content ? `\nNotes: ${item.content}` : ""}`,
          )
          .join("\n---\n");

        const response = await callLLM({
          instructions: `You are analyzing calendar events from a company to build organizational intelligence.

CALENDAR EVENTS (${batch.length}):
${formatted}

Identify:
1. Recurring meetings and their purpose (standups, reviews, all-hands, 1:1s)
2. Which domain/department each meeting relates to
3. Cross-functional meetings (multiple departments)
4. External meetings (with clients, vendors, partners)
5. Communication patterns (who meets with whom regularly)

Respond with ONLY JSON:
{
  "findings": [
    {
      "targetPage": "findings-domain-{name}",
      "targetPageTitle": "Title",
      "targetPageType": "findings_domain",
      "observation": "Detailed observation."
    }
  ]
}

Use these page types: findings_domain, findings_process, findings_external, findings_person`,
          messages: [{ role: "user", content: "Analyze the calendar events above." }],
          model,
          maxTokens: 4000,
        });

        report.totalCostCents += response.apiCostCents;

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
            );
            trackPageType(report, pageType);
            report.totalObservations++;
          }
        }
      } catch (err) {
        const msg = `Calendar batch failed: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[wiki-findings] ${msg}`);
        report.errors.push(msg);
      }
    });

    await progress(`Phase D complete: ${report.totalObservations - obsBeforeCal} observations from calendar`);
  }

  // ── Phase E: Company overview (single Sonnet call) ───────────────────────────

  await progress("Phase E: Writing company overview findings...");

  try {
    // Load all findings pages written so far
    const findingsPages = await prisma.knowledgePage.findMany({
      where: { operatorId, synthesisPath: "findings", status: "draft" },
      select: { slug: true, pageType: true, title: true, contentTokens: true },
      orderBy: { contentTokens: "desc" },
    });

    const pageSummary = findingsPages
      .map((p) => `- ${p.title} (${p.pageType}, ~${p.contentTokens} tokens)`)
      .join("\n");

    const overviewPrompt = `You are writing a company overview based on findings from raw data analysis.

FINDINGS PAGES CREATED (${findingsPages.length} pages):
${pageSummary}

PEOPLE: ${internalPeople.length} internal team members, ${externalPeople.length} external contacts
DATA SOURCES: ${emailChunks.length} emails, ${docsBySourceId.size} documents, ${calendarItems.length} calendar items

${internalPeople.length > 0 ? `TEAM MEMBERS:\n${internalPeople.slice(0, 30).map((p) => `- ${p.displayName}${p.adminTitle ? ` (${p.adminTitle})` : ""}${p.adminDepartment ? ` — ${p.adminDepartment}` : ""}`).join("\n")}` : ""}

Write a high-level company overview findings page covering:
1. Company size and apparent structure (how many people, what departments)
2. Communication patterns (which tools, how formal/informal, volume)
3. Key domains/functions identified
4. External relationships (major vendors, clients, partners seen)
5. Organizational dynamics (who are the hubs, any hierarchy signals)
6. Tools and systems in use (email, Slack, Drive, CRM, etc.)
7. Any notable patterns or concerns

These are analyst working notes — be specific and cite evidence.`;

    const response = await callLLM({
      instructions: "You are writing a company overview based on analyzed organizational data. Be thorough and specific.",
      messages: [{ role: "user", content: overviewPrompt }],
      model,
      maxTokens: 6000,
    });

    report.totalCostCents += response.apiCostCents;

    await appendFindingsToPage(
      operatorId,
      "findings-company-overview",
      "findings_overview",
      "Company Overview Findings",
      response.text,
    );
    report.totalObservations++;
  } catch (err) {
    const msg = `Company overview failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[wiki-findings] ${msg}`);
    report.errors.push(msg);
  }

  // ── Done ─────────────────────────────────────────────────────────────────────

  report.durationMs = Date.now() - startTime;

  await progress(
    `Wiki findings pass complete: ${report.totalObservations} observations across ${report.personPages} person, ${report.domainPages} domain, ${report.processPages} process, ${report.externalPages} external pages ($${(report.totalCostCents / 100).toFixed(2)}, ${Math.round(report.durationMs / 1000)}s)`,
  );

  return report;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function inferPageType(slug: string): string {
  if (slug.startsWith("findings-person")) return "findings_person";
  if (slug.startsWith("findings-domain")) return "findings_domain";
  if (slug.startsWith("findings-process")) return "findings_process";
  if (slug.startsWith("findings-external")) return "findings_external";
  if (slug.startsWith("findings-company")) return "findings_overview";
  return "findings_domain"; // default
}

function trackPageType(report: FindingsPassReport, pageType: string): void {
  switch (pageType) {
    case "findings_person":
      report.personPages++;
      break;
    case "findings_domain":
      report.domainPages++;
      break;
    case "findings_process":
      report.processPages++;
      break;
    case "findings_external":
      report.externalPages++;
      break;
  }
}
