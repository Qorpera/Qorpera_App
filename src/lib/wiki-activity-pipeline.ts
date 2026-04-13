/**
 * Wiki Activity Pipeline
 *
 * Processes RawContent items through the wiki-based activity pipeline.
 * Replaces entity-based activity-pipeline.ts for the wiki architecture.
 *
 * Flow per item:
 * 1. Load RawContent record
 * 2. Resolve actor email -> person page slug (via resolvePageSlug)
 * 3. Algorithmic pre-filter (skip obvious noise without LLM)
 * 4. For email/drive_doc: Haiku classification (individual/department/both/noise/attachment)
 * 5. For other sourceTypes: route directly to individual (no LLM needed)
 * 6. Write activity summary to appropriate page(s) activityContent
 * 7. Inline situation detection (Haiku scan with page context)
 * 8. If detection flags a trigger: dispatch deep assessment
 */

import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { resolvePageSlug, resolveDomainSlugForPerson } from "@/lib/wiki-engine";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";
import { extractJSON } from "@/lib/json-helpers";

// Communication types already assessed by evaluate_content via content-situation-detector.
// Skip inline detection here to avoid duplicate situation creation.
const SKIP_INLINE_DETECTION = new Set(["email", "slack_message", "teams_message"]);

// ── Types ────────────────────────────────────────────────────────────────────

type PreFilterResult = "noise" | "pass";

type ActivityClassification = "individual" | "department" | "both" | "noise" | "attachment";

interface RawContentRow {
  id: string;
  sourceType: string;
  sourceId: string;
  rawBody: string | null;
  rawMetadata: Record<string, unknown>;
  occurredAt: Date;
}

// ── Algorithmic Pre-Filter ───────────────────────────────────────────────────

function algorithmicPreFilter(
  sourceType: string,
  metadata: Record<string, unknown>,
  rawBody: string | null,
): PreFilterResult {
  // Check sender for automated addresses
  const sender = String(metadata.from ?? metadata.sender ?? "").toLowerCase();
  if (/(?:^|\b)(noreply@|no-reply@|system@|mailer-daemon@)/.test(sender)) {
    return "noise";
  }

  // Email with unsubscribe header = marketing/newsletter
  if (sourceType === "email") {
    const headers = metadata.headers as Record<string, unknown> | undefined;
    if (
      metadata["list-unsubscribe"] ||
      metadata.unsubscribe ||
      headers?.["list-unsubscribe"]
    ) {
      return "noise";
    }
  }

  // Calendar auto-accepts with no notes
  if (sourceType === "calendar_event") {
    const status = String(metadata.status ?? metadata.responseStatus ?? "").toLowerCase();
    if ((!rawBody || rawBody.trim().length === 0) && (status === "accepted")) {
      return "noise";
    }
  }

  // Empty body for non-file types
  const fileTypes = ["drive_doc", "onedrive_doc", "attachment"];
  if (!fileTypes.includes(sourceType) && (!rawBody || rawBody.trim().length === 0)) {
    return "noise";
  }

  return "pass";
}

// ── Haiku Classification ─────────────────────────────────────────────────────

async function classifyActivity(
  operatorId: string,
  sourceType: string,
  rawBody: string,
  metadata: Record<string, unknown>,
  personContext: { name: string; role?: string; department?: string } | null,
): Promise<ActivityClassification> {
  const personLine = personContext
    ? `The person: ${personContext.name}${personContext.role ? `, ${personContext.role}` : ""}${personContext.department ? ` at ${personContext.department}` : ""}.`
    : "Unknown person.";

  const systemPrompt = `You are classifying incoming activity for a wiki page.
${personLine}

Classify this ${sourceType} content:
- "individual": meaningful activity for this specific person's page
- "department": relevant at the department level (3+ participants, team-wide topic)
- "both": relevant to both the person and their department
- "noise": automated notifications, marketing, newsletters, system-generated content, spam
- "attachment": only notable as a file reference, no substantive text content

Respond with exactly one word: individual, department, both, noise, or attachment.`;

  // Build user message with relevant metadata
  const metaFields: string[] = [];
  if (metadata.subject) metaFields.push(`Subject: ${metadata.subject}`);
  if (metadata.from) metaFields.push(`From: ${metadata.from}`);
  if (metadata.to) metaFields.push(`To: ${metadata.to}`);
  if (metadata.cc) metaFields.push(`CC: ${metadata.cc}`);
  if (metadata.fileName) metaFields.push(`File: ${metadata.fileName}`);
  if (metadata.mimeType) metaFields.push(`Type: ${metadata.mimeType}`);

  const metaStr = metaFields.length > 0 ? metaFields.join("\n") + "\n\n" : "";
  const userMessage = metaStr + rawBody.slice(0, 2000);

  const response = await callLLM({
    operatorId,
    model: getModel("activityFilter"),
    instructions: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const word = response.text.trim().toLowerCase();
  const valid: ActivityClassification[] = ["individual", "department", "both", "noise", "attachment"];
  return valid.includes(word as ActivityClassification)
    ? (word as ActivityClassification)
    : "individual";
}

// ── Activity Summary Formatter ───────────────────────────────────────────────

function formatActivitySummary(
  rawContent: RawContentRow,
): string {
  const meta = rawContent.rawMetadata;
  const date = rawContent.occurredAt.toISOString().split("T")[0];
  const id = rawContent.id;

  switch (rawContent.sourceType) {
    case "email": {
      const subject = meta.subject ?? meta.fileName ?? rawContent.sourceId;
      const from = meta.from ?? "unknown";
      const to = meta.to ?? "unknown";
      const direction = meta.direction ?? (meta.isInbound ? "inbound" : "outbound");
      return `- **${subject}** (${direction}, ${date})\n  From: ${from} → To: ${to}\n  [Expand → RC-${id}]`;
    }

    case "calendar_event": {
      const summary = meta.summary ?? meta.subject ?? rawContent.sourceId;
      const duration = meta.duration ?? meta.durationMinutes ?? "?";
      const attendees = meta.attendees ?? meta.participants ?? "";
      return `- **${summary}** (meeting, ${date}, ${duration}min)\n  Participants: ${attendees}\n  [Expand → RC-${id}]`;
    }

    case "drive_doc":
    case "onedrive_doc": {
      const fileName = meta.fileName ?? meta.name ?? rawContent.sourceId;
      const action = meta.action ?? "updated";
      return `- **${fileName}** (${action} ${date}) [Open → RC-${id}]`;
    }

    default: {
      const summary = meta.subject ?? meta.summary ?? meta.name ?? rawContent.sourceId;
      return `- **${rawContent.sourceType}: ${summary}** (${date}) [Expand → RC-${id}]`;
    }
  }
}

// ── Activity Writer (atomic SQL append) ──────────────────────────────────────

/**
 * Write an activity summary to a wiki page's activityContent.
 * Uses atomic SQL to prepend (newest on top).
 * Also updates activityUpdatedAt timestamp.
 */
async function writeActivityToPage(
  operatorId: string,
  pageSlug: string,
  summary: string,
): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE "KnowledgePage"
    SET "activityContent" = ${summary} || E'\n' || COALESCE("activityContent", ''),
        "activityUpdatedAt" = NOW(),
        "updatedAt" = NOW()
    WHERE "operatorId" = ${operatorId} AND "slug" = ${pageSlug} AND "scope" = 'operator'
  `;
  return result > 0;
}

// ── Inline Situation Detection ───────────────────────────────────────────────

async function assessForSituationTriggers(
  operatorId: string,
  pageSlug: string,
  newActivitySummary: string,
  rawContent: { sourceType: string; sourceId: string; rawBody: string | null; rawMetadata: Record<string, unknown> },
): Promise<{ triggered: boolean; dispatchedJobId?: string }> {
  // Load the person page for context
  const page = await prisma.knowledgePage.findUnique({
    where: { operatorId_slug: { operatorId, slug: pageSlug } },
    select: { content: true, activityContent: true },
  });

  if (!page) return { triggered: false };

  const personContext = (page.content ?? "").slice(0, 2000);
  const recentActivity = (page.activityContent ?? "").slice(0, 3000);

  const systemPrompt = `You are monitoring a person's activity stream for situations that need attention.

Person context:
${personContext}

Recent activity (newest first):
${recentActivity}`;

  const userMessage = `New activity just recorded:
${newActivitySummary}

Does this new activity potentially trigger a situation that needs attention? Consider: overdue items, escalation signals, unusual patterns, requests requiring action, compliance issues, relationship risks.

Respond with JSON: { "triggered": false } or { "triggered": true, "reason": "...", "suggestedType": "..." }`;

  const response = await callLLM({
    operatorId,
    model: getModel("activityDetection"),
    instructions: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const parsed = extractJSON(response.text);
  if (!parsed || parsed.triggered !== true) {
    return { triggered: false };
  }

  const jobId = await enqueueWorkerJob("evaluate_content", operatorId, {
    operatorId,
    items: [
      {
        sourceType: rawContent.sourceType,
        sourceId: rawContent.sourceId,
        content: rawContent.rawBody ?? "",
        metadata: rawContent.rawMetadata,
        participantEmails: undefined,
      },
    ],
  });

  console.log(
    `[wiki-activity] Situation trigger detected on ${pageSlug}: ${parsed.reason ?? "unknown"} → dispatched ${jobId}`,
  );

  return { triggered: true, dispatchedJobId: jobId };
}

// ── Person Context Loader ────────────────────────────────────────────────────

async function loadPersonContext(
  operatorId: string,
  pageSlug: string,
): Promise<{ name: string; role?: string; department?: string } | null> {
  const page = await prisma.knowledgePage.findUnique({
    where: { operatorId_slug: { operatorId, slug: pageSlug } },
    select: { title: true, properties: true },
  });

  if (!page) return null;

  const props = (page.properties ?? {}) as Record<string, unknown>;
  return {
    name: page.title,
    role: props.role as string | undefined,
    department: props.department as string | undefined,
  };
}

// ── Main Pipeline ────────────────────────────────────────────────────────────

/**
 * Process a batch of RawContent items through the wiki activity pipeline.
 * Called by the process_activity worker job after connector sync.
 */
export async function processActivityBatch(
  operatorId: string,
  rawContentIds: string[],
): Promise<{ processed: number; written: number; detected: number; skipped: number }> {
  const stats = { processed: 0, written: 0, detected: 0, skipped: 0 };

  for (const rcId of rawContentIds) {
    stats.processed++;

    try {
      // 1. Load RawContent
      const rawContent = await prisma.rawContent.findUnique({
        where: { id: rcId },
        select: {
          id: true,
          sourceType: true,
          sourceId: true,
          rawBody: true,
          rawMetadata: true,
          occurredAt: true,
        },
      });

      if (!rawContent) {
        stats.skipped++;
        continue;
      }

      const meta = rawContent.rawMetadata as Record<string, unknown>;

      // 2. Resolve actor email -> person page slug
      const actorEmail = String(meta.from ?? meta.sender ?? meta.actorEmail ?? "").trim();
      const actorName = String(meta.actorName ?? meta.senderName ?? "").trim();

      const personSlug = await resolvePageSlug(
        operatorId,
        actorEmail || undefined,
        actorName || undefined,
      );

      if (!personSlug) {
        // No matching person page — skip (can't route activity)
        stats.skipped++;
        continue;
      }

      // 3. Algorithmic pre-filter
      const preFilterResult = algorithmicPreFilter(rawContent.sourceType, meta, rawContent.rawBody);
      if (preFilterResult === "noise") {
        stats.skipped++;
        continue;
      }

      // 4. Classification
      let classification: ActivityClassification;

      if (rawContent.sourceType === "email" || rawContent.sourceType === "drive_doc") {
        // LLM classification for email and drive
        const personContext = await loadPersonContext(operatorId, personSlug);
        classification = await classifyActivity(
          operatorId,
          rawContent.sourceType,
          rawContent.rawBody ?? "",
          meta,
          personContext,
        );

        if (classification === "noise") {
          stats.skipped++;
          continue;
        }
      } else {
        // Non-email/drive: route directly to individual
        classification = "individual";
      }

      // 5. Format activity summary
      const row: RawContentRow = {
        id: rawContent.id,
        sourceType: rawContent.sourceType,
        sourceId: rawContent.sourceId,
        rawBody: rawContent.rawBody,
        rawMetadata: meta,
        occurredAt: rawContent.occurredAt,
      };
      const summary = formatActivitySummary(row);

      // 6. Write activity to page(s) based on classification
      let written = false;

      if (classification === "department" || classification === "both") {
        const domainSlug = await resolveDomainSlugForPerson(operatorId, personSlug);

        if (domainSlug) {
          // Write full summary to domain hub
          const domainWritten = await writeActivityToPage(operatorId, domainSlug, summary);

          if (classification === "both") {
            // Also write to person page
            written = await writeActivityToPage(operatorId, personSlug, summary);
          } else {
            // department only — write a reference to person page
            const subject = String(meta.subject ?? meta.summary ?? meta.fileName ?? row.sourceId);
            const date = row.occurredAt.toISOString().split("T")[0];
            const ref = `- Participated in "${subject}" thread — see [[${domainSlug}]] (${date})`;
            written = await writeActivityToPage(operatorId, personSlug, ref);
          }

          written = written || domainWritten;
        } else {
          // No domain hub found — fall back to individual
          written = await writeActivityToPage(operatorId, personSlug, summary);
        }
      } else {
        // individual or attachment — write to person page
        written = await writeActivityToPage(operatorId, personSlug, summary);
      }

      if (written) {
        stats.written++;
      }

      // 7. Inline situation detection (skip communication types handled by content-situation-detector)
      if (classification !== "attachment" && !SKIP_INLINE_DETECTION.has(rawContent.sourceType)) {
        const detection = await assessForSituationTriggers(
          operatorId,
          personSlug,
          summary,
          { sourceType: rawContent.sourceType, sourceId: rawContent.sourceId, rawBody: rawContent.rawBody, rawMetadata: meta },
        ).catch((err) => {
          console.error(`[wiki-activity] Situation detection error for ${personSlug}:`, err);
          return { triggered: false } as const;
        });

        if (detection.triggered) {
          stats.detected++;
        }
      }
    } catch (err) {
      console.error(`[wiki-activity] Error processing RawContent ${rcId}:`, err);
      stats.skipped++;
    }
  }

  console.log(
    `[wiki-activity] Batch complete: ${stats.processed} processed, ${stats.written} written, ${stats.detected} detected, ${stats.skipped} skipped`,
  );

  return stats;
}

// ── Activity Page Cleanup ───────────────────────────────────────────────────

/**
 * Clean stale activity from person and domain hub pages.
 * Runs every 6 hours via cron.
 *
 * Rules:
 * - Activity entries older than 14 days with no linked situation → removed
 * - Activity that triggered a situation → compressed to 1-line history trace
 * - Raw data always stays in RawContent regardless of page cleanup
 */
export async function cleanActivityPages(
  operatorId: string,
): Promise<{ pagesCleanedUp: number; entriesRemoved: number; entriesCompressed: number }> {
  const stats = { pagesCleanedUp: 0, entriesRemoved: 0, entriesCompressed: 0 };

  const STALE_DAYS = 14;
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

  // 1. Get all activity pages for this operator
  const pages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      activityContent: { not: null },
      pageType: { in: ["person_profile", "domain_hub"] },
    },
    select: { id: true, slug: true, activityContent: true },
  });

  if (pages.length === 0) return stats;

  // 2. Find RC IDs referenced by situation_instance pages (via raw SQL to avoid loading full page content)
  const situationRcRows = await prisma.$queryRaw<Array<{ slug: string; rc_id: string }>>`
    SELECT slug, m[1] AS rc_id
    FROM "KnowledgePage",
         LATERAL regexp_matches(
           COALESCE(properties::text, '') || ' ' || COALESCE(content, ''),
           'RC-([a-zA-Z0-9_-]+)', 'g'
         ) AS m
    WHERE "operatorId" = ${operatorId}
      AND "pageType" = 'situation_instance'
  `;

  const situationSlugByRcId = new Map<string, string>();
  for (const row of situationRcRows) {
    if (!situationSlugByRcId.has(row.rc_id)) {
      situationSlugByRcId.set(row.rc_id, row.slug);
    }
  }

  // 3. Process each page
  for (const page of pages) {
    const content = page.activityContent!;

    // Split into entries — each starts with "- **".
    // The first entry has no leading \n (writeActivityToPage prepends), so it
    // lands as the first array element without splitting. Subsequent entries
    // split on the \n before "- **".
    const entries = content.split(/\n(?=- \*\*)/).filter((e) => e.trim().length > 0);

    let changed = false;
    const cleaned: string[] = [];

    for (const entry of entries) {
      try {
        // Extract date (YYYY-MM-DD)
        const dateMatch = entry.match(/\b(\d{4}-\d{2}-\d{2})\b/);
        if (!dateMatch) {
          cleaned.push(entry);
          continue;
        }

        const entryDate = new Date(dateMatch[1]);
        if (isNaN(entryDate.getTime())) {
          cleaned.push(entry);
          continue;
        }

        // Not stale — keep as-is
        if (entryDate >= cutoff) {
          cleaned.push(entry);
          continue;
        }

        // Stale entry — check for situation link via RC ID
        const rcMatch = entry.match(/RC-([a-zA-Z0-9_-]+)/);
        const rcId = rcMatch?.[1];

        if (rcId && situationSlugByRcId.has(rcId)) {
          // Linked to a situation — compress to one-line trace
          const situationSlug = situationSlugByRcId.get(rcId)!;
          const subjectMatch = entry.match(/\*\*(.+?)\*\*/);
          const subject = subjectMatch?.[1] ?? "activity";
          cleaned.push(`- ${dateMatch[1]} — ${subject} → [[${situationSlug}]] (RC-${rcId})`);
          stats.entriesCompressed++;
          changed = true;
        } else {
          // No situation link and stale — remove
          stats.entriesRemoved++;
          changed = true;
        }
      } catch {
        // Malformed entry — keep as-is to avoid data loss
        cleaned.push(entry);
      }
    }

    if (changed) {
      const newContent = cleaned.join("\n");
      await prisma.knowledgePage.update({
        where: { id: page.id },
        data: {
          activityContent: newContent || null,
          activityUpdatedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      stats.pagesCleanedUp++;
    }
  }

  return stats;
}
