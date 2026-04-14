import { createId } from "@paralleldrive/cuid2";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { callLLM, getModel } from "@/lib/ai-provider";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";
import { extractJSONArray } from "@/lib/json-helpers";
import { enrichSignalContext, type EnrichedSignalContext } from "./detection-enrichment";
import {
  createSituationWikiPage,
  generateSituationSlug,
  formatDate as formatDetectionDate,
  type SituationProperties,
} from "@/lib/situation-wiki-helpers";
import { checkConfirmationRate } from "@/lib/confirmation-rate";
import { ensureActionRequiredType, ensureAwarenessType } from "@/lib/situation-type-helpers";

// Re-export so existing consumers don't break
export { ensureActionRequiredType, ensureAwarenessType };

// ── Wiki Page Resolution ────────────────────────────────────────────────────

async function resolvePageSlug(operatorId: string, email?: string, name?: string): Promise<string | null> {
  if (!email && !name) return null;

  if (email) {
    const page = await prisma.knowledgePage.findFirst({
      where: {
        operatorId,
        scope: "operator",
        pageType: "person_profile",
        content: { contains: email, mode: "insensitive" },
      },
      select: { slug: true },
    });
    if (page) return page.slug;
  }

  if (name) {
    const page = await prisma.knowledgePage.findFirst({
      where: {
        operatorId,
        scope: "operator",
        pageType: "person_profile",
        title: { contains: name, mode: "insensitive" },
      },
      select: { slug: true },
    });
    if (page) return page.slug;
  }

  return null;
}

async function findDomainRefFromPage(operatorId: string, slug: string): Promise<string | null> {
  const page = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug, scope: "operator" },
    select: { crossReferences: true },
  });
  return page?.crossReferences.find(ref => ref.startsWith("domain-")) ?? null;
}


// ── Types ────────────────────────────────────────────────────────────────────

export type CommunicationItem = {
  sourceType: string; // "email" | "slack_message" | "teams_message"
  sourceId: string; // external ID (message ID)
  content: string; // the full text content
  metadata: Record<string, unknown> | undefined;
  participantEmails: string[] | undefined;
};

type EvaluationResult = {
  messageIndex: number;
  classification: "action_required" | "awareness" | "irrelevant" | "initiative_candidate";
  awarenessType: "informational" | "strategic" | null; // only for awareness
  summary: string;
  urgency: "low" | "medium" | "high" | null; // null for irrelevant
  confidence: number;
  relatedSituationId: string | null;
  updatedSummary: string | null;
  investigationDepth: "standard" | "thorough";
  evidence: string;
  reasoning: string;
  projectRecommendation: {
    title: string;
    description: string;
    coordinatorEmail: string;
    dueDate: string | null;
    proposedMembers: Array<{
      email: string;
      name: string;
      role: string;
    }>;
    proposedDeliverables: Array<{
      title: string;
      description: string;
      assignedToEmail: string;
      format: string;
      suggestedDeadline: string | null;
    }>;
    rationale: string;
  } | null;
};

type ActorBatch = {
  actorKey: string;             // person page slug or email
  actorPageSlug: string | null;
  domainPageSlug: string | null;
  actorName: string;
  actorRole: string | null;
  domainName: string | null;
  items: CommunicationItem[];
  openSituations: Array<{ situationId: string; summary: string }>;
};

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_BATCH_SIZE = 20;
const COMMUNICATION_TYPES = new Set(["email", "slack_message", "teams_message", "calendar_proactive"]);

const URGENCY_CONFIDENCE: Record<string, number> = {
  high: 0.9,
  medium: 0.7,
  low: 0.5,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export function isEligibleCommunication(item: {
  sourceType: string;
  metadata?: Record<string, unknown>;
  content?: string;
}): boolean {
  if (!COMMUNICATION_TYPES.has(item.sourceType)) return false;
  if (item.metadata?.isAutomated === true) return false;
  if (item.metadata?.isAutoReply === true) return false;
  if (item.content && item.content.length < 20) return false;
  return true;
}

// ── Wiki Enrichment ─────────────────────────────────────────────────────────

type WikiEnrichment = {
  actorContext: string | null;
  relatedKnowledge: Array<{ slug: string; title: string; pageType: string; contentSnippet: string }>;
  existingSituations: Array<{ situationId: string; summary: string }>;
};

async function enrichBatchWithWiki(
  batch: ActorBatch,
  operatorId: string,
): Promise<WikiEnrichment> {
  const actorPage = batch.actorPageSlug
    ? await prisma.knowledgePage.findFirst({
        where: { operatorId, slug: batch.actorPageSlug, scope: "operator" },
        select: { content: true },
      }).catch(() => null)
    : null;

  // Search for related wiki pages using keywords from batch content
  const contentSample = batch.items.map((i) => i.content.slice(0, 200)).join(" ");
  const KEYWORD_STOP = new Set([
    "about", "after", "before", "being", "could", "doing", "every", "first",
    "going", "great", "hello", "known", "later", "might", "never", "other",
    "place", "please", "quite", "right", "shall", "should", "since", "still",
    "thank", "thanks", "their", "there", "these", "thing", "think", "those",
    "today", "under", "using", "which", "while", "would", "yours",
  ]);
  const keywords = contentSample
    .split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
    .filter(w => w.length > 4 && !KEYWORD_STOP.has(w))
    .slice(0, 5);
  let relatedPages: Array<{ slug: string; title: string; pageType: string; content: string }> = [];
  if (keywords.length > 0) {
    relatedPages = await prisma.knowledgePage.findMany({
      where: {
        operatorId,
        scope: "operator",
        OR: keywords.map(kw => ({ content: { contains: kw, mode: "insensitive" as const } })),
        ...(batch.actorPageSlug ? { slug: { not: batch.actorPageSlug } } : {}),
      },
      select: { slug: true, title: true, pageType: true, content: true },
      take: 3,
    }).catch(() => []);
  }

  return {
    actorContext: actorPage?.content ?? null,
    relatedKnowledge: relatedPages.map((p) => ({
      slug: p.slug,
      title: p.title,
      pageType: p.pageType,
      contentSnippet: p.content.slice(0, 300),
    })),
    existingSituations: batch.openSituations,
  };
}

function extractSenderName(meta: Record<string, unknown>): { raw: string; name: string } {
  const raw = String(meta.from ?? meta.authorEmail ?? "unknown");
  const name = raw.split("@")[0].split("<").pop()?.trim() ?? "Unknown";
  return { raw, name };
}

// ── Actor Resolution ─────────────────────────────────────────────────────────

async function resolveActorsFromWiki(
  operatorId: string,
  items: CommunicationItem[],
): Promise<Map<string, { actorKey: string; actorPageSlug: string | null; name: string; role: string | null; items: CommunicationItem[] }>> {
  const actorMap = new Map<
    string,
    { actorKey: string; actorPageSlug: string | null; name: string; role: string | null; items: CommunicationItem[] }
  >();

  for (const item of items) {
    const actorEmails = getActorEmails(item);
    if (actorEmails.length === 0) continue;

    for (const email of actorEmails) {
      const normalizedEmail = email.toLowerCase().trim();

      // Try to resolve to a person wiki page
      const pageSlug = await resolvePageSlug(operatorId, normalizedEmail);

      // Use page slug as key if found, email as fallback
      const actorKey = pageSlug ?? normalizedEmail;

      const existing = actorMap.get(actorKey);
      if (existing) {
        existing.items.push(item);
      } else {
        let name = normalizedEmail;
        let role: string | null = null;

        if (pageSlug) {
          // Read name and role from person wiki page
          const page = await prisma.knowledgePage.findFirst({
            where: { operatorId, slug: pageSlug, scope: "operator" },
            select: { title: true, properties: true },
          });
          if (page) {
            name = page.title;
            const props = (page.properties ?? {}) as Record<string, unknown>;
            role = (props.role as string) ?? (props.job_title as string) ?? null;
          }
        }

        actorMap.set(actorKey, {
          actorKey,
          actorPageSlug: pageSlug,
          name,
          role,
          items: [item],
        });
      }
    }
  }

  return actorMap;
}

function getActorEmails(item: CommunicationItem): string[] {
  const meta = item.metadata ?? {};

  if (item.sourceType === "email") {
    // For received emails, the org member is the recipient who needs to act
    if (meta.direction === "sent") return []; // org already acted
    // direction === "received" or unset: recipients are potential actors
    const emails: string[] = [];
    if (typeof meta.to === "string") emails.push(meta.to);
    if (Array.isArray(meta.to)) emails.push(...(meta.to as string[]));
    if (typeof meta.cc === "string") emails.push(meta.cc);
    if (Array.isArray(meta.cc)) emails.push(...(meta.cc as string[]));
    return emails;
  }

  // Slack / Teams: everyone except the author
  const authorEmail =
    typeof meta.authorEmail === "string" ? meta.authorEmail.toLowerCase() : null;
  const participants = item.participantEmails ?? [];
  return participants.filter(
    (e) => e.toLowerCase() !== authorEmail,
  );
}

// ── Open Situation Loader ────────────────────────────────────────────────────

async function loadOpenSituations(
  operatorId: string,
  actorPageSlug: string | null,
): Promise<Array<{ situationId: string; summary: string }>> {
  if (!actorPageSlug) return [];

  // Primary: wiki situation_instance pages (canonical after migration).
  // Fallback: if wiki page creation failed for a situation, the Situation table
  // dedup in handleActionRequired/handleAwareness (triggerPageSlug query) still catches it.
  const pages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      pageType: "situation_instance",
      scope: "operator",
      properties: {
        path: ["trigger_page"],
        equals: actorPageSlug,
      },
      NOT: {
        properties: {
          path: ["status"],
          string_contains: "resolved",
        },
      },
    },
    select: { properties: true, title: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Post-filter for other closed statuses (JSONB path only supports single value match)
  return pages
    .filter(p => {
      const props = (p.properties ?? {}) as Record<string, unknown>;
      const status = props.status as string | undefined;
      return !status || !["resolved", "closed", "dismissed"].includes(status);
    })
    .map(p => {
      const props = (p.properties ?? {}) as Record<string, unknown>;
      return {
        situationId: (props.situation_id as string) ?? "",
        summary: p.title?.slice(0, 100) ?? "",
      };
    });
}

// ── LLM Evaluation ──────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are evaluating incoming business communications to determine what attention they require from a specific person within their organization.

Classify each message into one of four categories:

**action_required** — The recipient needs to perform a concrete action: respond to a question, complete a task, make a decision, attend a meeting, review a document, follow up on something, approve/reject something. The action must be relevant to legitimate business operations — not personal purchases, spam, or solicitations.

**awareness** — The recipient should know about this but no one is directly asking them to do anything. They are CC'd or BCC'd, it's a status update, FYI, or informational share.

For each awareness message, you must ALSO sub-classify as:
- **informational** — Routine updates requiring zero thought or decision-making: meeting acceptances/declines, calendar reminders for existing meetings, read receipts, auto-generated status notifications, newsletter digests, booking confirmations, schedule change confirmations, system notifications ("synced successfully"), out-of-office auto-replies, meeting notes shared as FYI with no questions asked. The KEY TEST: would the recipient delete this email without reading it twice? If yes → informational.
- **strategic** — Information the recipient didn't ask for but that carries BUSINESS RISK or OPPORTUNITY if ignored: being CC'd on an escalating dispute, competitor pricing shared in a thread, a client's payment pattern changing, an employee mentioning they're considering leaving, a regulatory deadline appearing in a forwarded document, a partner signaling dissatisfaction. The KEY TEST: could ignoring this cost the company money, a relationship, or a legal obligation within 30 days? If yes → strategic. Calendar reminders, meeting confirmations, and scheduling logistics are NEVER strategic — even if the meeting topic is important, the reminder itself carries no strategic information.

**initiative_candidate** — This signal indicates work that requires COORDINATION across multiple people, each producing distinct deliverables toward a shared objective with a deadline. Use this when:
- The signal references a meeting/event where multiple people must PREPARE MATERIALS (not just attend)
- The signal describes a project, audit, review, or coordinated effort involving 3+ people producing distinct outputs
- A calendar event exists with multiple attendees and substantive preparation is clearly needed but hasn't started
- The effort has a clear deadline and the deliverables don't exist yet

Do NOT use initiative_candidate for:
- A meeting that's just a discussion with no deliverables needed
- A single person being asked to do multiple tasks (that's action_required)
- Status updates about ongoing work (that's awareness)
- An event that already has an active Project with these participants (check ACTIVE PROJECTS in enriched context)

When you classify as initiative_candidate, you must ALSO provide a projectRecommendation object.

**irrelevant** — This has nothing to do with the recipient's work responsibilities. Spam, marketing solicitations, newsletters they didn't subscribe to for work purposes, automated system notifications with no actionable content, social/casual messages with no work relevance, promotional offers (gambling, personal shopping, etc).

For each message, also assess:
- **urgency** (low/medium/high) — only for action_required and awareness. null for irrelevant.
- **confidence** (0.0-1.0) — how confident you are in the classification
- **reasoning** — one sentence explaining why you chose this classification

TEMPORAL RELEVANCE RULE:
Each message has a Date field. Consider the content's age when classifying:

- If the content describes a TIME-SENSITIVE action (respond to someone, approve something, deliver by a date, attend a meeting, fix an urgent issue) AND it is more than 7 days old: mark as "awareness" NOT "action_required". The window for action has almost certainly passed.
- If the content describes a STRUCTURAL condition (compliance gap, missing documentation, process failure, contractual issue, pattern of behavior, budget variance, personnel problem): mark as "action_required" regardless of age. These persist until resolved.
- If the content references an entity that can be verified (invoice, order, delivery): the entity's CURRENT state determines relevance, not the email's age. But the email alone, without entity confirmation, is not sufficient for action_required if older than 7 days.

Examples:
- "Kan du godkende dette inden fredag?" — 15 days old → awareness (deadline passed)
- "HACCP-planen er ikke opdateret" — 25 days old → action_required (still true)
- "Faktura INV-2026-080 er forfalden" — 20 days old → check if invoice is STILL overdue in entity data. If yes → action_required. If paid → awareness.
- "Vi mister kunden hvis vi ikke reagerer" — 12 days old → awareness (moment passed)
- "Forsikringspolicen dækker kun 35 medarbejdere" — 60 days old → action_required (structural)

INVESTIGATION DEPTH:
For each action_required or strategic awareness message, determine how much investigation it warrants:
- "standard": A clear, bounded issue resolvable with a direct action plan. Examples: overdue invoice follow-up, meeting scheduling, simple client question, routine approval.
- "thorough": A complex pattern requiring deep analysis before action. Examples: declining revenue across multiple clients, repeated complaints suggesting systemic issues, regulatory concerns, multi-party disputes, strategic decisions with significant consequences.
Key question: does this need a REPORT explaining what's happening before proposing actions? If yes → thorough. If the right action is obvious → standard.

Use the organizational context provided for each actor batch to make better-informed decisions:
- If the wiki shows this person has a pattern of late payments, an invoice mention is more likely action_required
- If there's already an open situation about this topic, this message may be an update to the existing situation (set relatedSituationId)
- If the wiki shows this is a routine communication pattern for this person, it's more likely awareness or irrelevant

Respond with ONLY valid JSON (no markdown fences):`;
}

async function evaluateActorBatch(batch: ActorBatch, enrichments: (EnrichedSignalContext | null)[], wikiEnrichment: WikiEnrichment): Promise<EvaluationResult[]> {
  const openSitLines =
    batch.openSituations.length > 0
      ? batch.openSituations
          .map((s) => `- ${s.situationId}: ${s.summary}`)
          .join("\n")
      : "None";

  const messageLines = batch.items
    .map((item, idx) => {
      const meta = item.metadata ?? {};
      const contentTruncated =
        item.content.length > 2000
          ? item.content.slice(0, 2000) + "..."
          : item.content;
      const msgDate = meta.date ? new Date(meta.date as string) : null;
      const daysAgo = msgDate ? Math.round((Date.now() - msgDate.getTime()) / 86_400_000) : null;

      // Build enriched context block
      const enrichment = enrichments[idx];
      let enrichmentBlock = "";
      if (enrichment) {
        const parts: string[] = [];

        if (enrichment.relatedCalendarEvents.length > 0) {
          parts.push("RELATED CALENDAR EVENTS:\n" + enrichment.relatedCalendarEvents
            .map(e => `  - "${e.title}" on ${e.date} (${e.daysUntil} days), attendees: ${e.attendees.join(", ")}`)
            .join("\n"));
        }

        if (enrichment.threadHistory.length > 0) {
          parts.push("THREAD HISTORY:\n" + enrichment.threadHistory
            .map(t => `  - ${t.from} (${t.date}): ${t.contentSnippet.slice(0, 200)}`)
            .join("\n"));
        }

        if (enrichment.recentActorActivity.length > 0) {
          parts.push("RECENT ACTOR ACTIVITY (7 DAYS):\n" + enrichment.recentActorActivity
            .map(a => `  - ${a.type} (${a.date}): ${a.summary}`)
            .join("\n"));
        }

        if (enrichment.relatedDocuments.length > 0) {
          parts.push("RELATED DOCUMENTS:\n" + enrichment.relatedDocuments
            .map(d => `  - ${d.fileName} (modified: ${d.lastModified}, by: ${d.author})`)
            .join("\n"));
        }

        if (enrichment.activeProjects.length > 0) {
          parts.push("ACTIVE PROJECTS WITH THESE PARTICIPANTS:\n" + enrichment.activeProjects
            .map(p => `  - "${p.name}" (${p.status}, ${p.memberCount} members, ${p.deliverableCount} deliverables${p.dueDate ? `, due: ${p.dueDate}` : ""})`)
            .join("\n"));
        }

        if (parts.length > 0) {
          enrichmentBlock = "\n  ENRICHED CONTEXT:\n" + parts.join("\n");
        }
      }

      return `MESSAGE ${idx}:
  Source: ${item.sourceType}
  From: ${meta.from ?? meta.authorEmail ?? "unknown"}
  To: ${meta.to ?? "unknown"}
  Subject: ${meta.subject ?? "(none)"}
  Date: ${meta.date ?? "unknown"}${daysAgo !== null ? ` (${daysAgo} days ago)` : ""}
  Content: ${contentTruncated}${enrichmentBlock}`;
    })
    .join("\n\n");

  // Build wiki context block
  const wikiBlock: string[] = [];
  if (wikiEnrichment.actorContext) {
    wikiBlock.push(`ORGANIZATIONAL CONTEXT FOR THIS ACTOR:\nAbout ${batch.actorName}:\n${wikiEnrichment.actorContext.slice(0, 1500)}`);
  }
  if (wikiEnrichment.relatedKnowledge.length > 0) {
    wikiBlock.push(`RELATED KNOWLEDGE:\n${wikiEnrichment.relatedKnowledge.map((k) => `- ${k.title} (${k.pageType}): ${k.contentSnippet}`).join("\n")}`);
  }
  const wikiContextStr = wikiBlock.length > 0 ? `\n${wikiBlock.join("\n\n")}\n` : "";

  const userPrompt = `PERSON WHO NEEDS TO ACT: ${batch.actorName}${batch.actorRole ? ` (${batch.actorRole})` : ""}
DEPARTMENT: ${batch.domainName ?? "Unknown"}

EXISTING OPEN SITUATIONS FOR THIS PERSON:
${openSitLines}
${wikiContextStr}
NEW MESSAGES TO EVALUATE:
${messageLines}

For each message, respond with:
[
  {
    "messageIndex": 0,
    "classification": "action_required" | "awareness" | "irrelevant" | "initiative_candidate",
    "awarenessType": "informational" | "strategic" | null,
    "summary": "Brief description (1-2 sentences). For awareness: what the person should know. For irrelevant: why it doesn't matter.",
    "urgency": "low" | "medium" | "high" | null,
    "confidence": 0.0-1.0,
    "relatedSituationId": "existing situation ID if this updates an open situation, or null",
    "updatedSummary": "If related to existing situation, the updated summary, or null",
    "evidence": "The specific text that drove the classification",
    "reasoning": "One sentence: why this classification",
    "investigationDepth": "standard | thorough (for action_required and strategic awareness only)",
    "projectRecommendation": "(include ONLY for initiative_candidate — see system prompt for schema)"
  }
]`;

  const systemPrompt = buildSystemPrompt();

  const response = await callLLM({
    instructions: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    temperature: 0.1,
    maxTokens: 8000,
    aiFunction: "reasoning",
    model: getModel("contentDetection"),
  });

  const parsed = extractJSONArray(response.text);
  if (!parsed) {
    console.error("[content-detection] Failed to parse LLM response");
    return [];
  }

  return parsed.map((r) => ({
    messageIndex: Number(r.messageIndex ?? 0),
    classification: (["action_required", "awareness", "irrelevant", "initiative_candidate"].includes(r.classification as string)
      ? r.classification
      : r.actionRequired === true ? "action_required" : "irrelevant") as EvaluationResult["classification"],
    awarenessType: r.classification === "awareness"
      ? (["informational", "strategic"].includes(r.awarenessType as string) ? r.awarenessType as "informational" | "strategic" : "informational")
      : null,
    summary: String(r.summary ?? ""),
    urgency: r.urgency === null ? null : (["low", "medium", "high"].includes(r.urgency as string)
      ? r.urgency
      : "medium") as "low" | "medium" | "high" | null,
    confidence: typeof r.confidence === "number" ? r.confidence : 0.5,
    relatedSituationId: r.relatedSituationId ? String(r.relatedSituationId) : null,
    updatedSummary: r.updatedSummary ? String(r.updatedSummary) : null,
    evidence: String(r.evidence ?? ""),
    investigationDepth: (r.investigationDepth === "thorough" ? "thorough" : "standard") as "standard" | "thorough",
    reasoning: String(r.reasoning ?? ""),
    projectRecommendation: (() => {
      if (r.classification !== "initiative_candidate" || !r.projectRecommendation) return null;
      const pr = r.projectRecommendation as Record<string, any>;
      return {
        title: String(pr.title ?? ""),
        description: String(pr.description ?? ""),
        coordinatorEmail: String(pr.coordinatorEmail ?? ""),
        dueDate: pr.dueDate ? String(pr.dueDate) : null,
        proposedMembers: Array.isArray(pr.proposedMembers)
          ? pr.proposedMembers.map((m: any) => ({
              email: String(m.email ?? ""),
              name: String(m.name ?? ""),
              role: String(m.role ?? "contributor"),
            }))
          : [],
        proposedDeliverables: Array.isArray(pr.proposedDeliverables)
          ? pr.proposedDeliverables.map((d: any) => ({
              title: String(d.title ?? ""),
              description: String(d.description ?? ""),
              assignedToEmail: String(d.assignedToEmail ?? ""),
              format: String(d.format ?? "document"),
              suggestedDeadline: d.suggestedDeadline ? String(d.suggestedDeadline) : null,
            }))
          : [],
        rationale: String(pr.rationale ?? ""),
      };
    })(),
  }));
}

// ── Response Linking ────────────────────────────────────────────────────────

async function checkResponseToOpenSituation(
  _operatorId: string,
  threadId: string | null,
  inReplyTo: string | null,
  _subject: string | null,
): Promise<string | null> {
  if (!threadId && !inReplyTo) return null;

  // TODO: Implement wiki-based response detection — check situation pages'
  // Action Plan sections for steps that are "awaiting response" and match
  // the incoming email thread/subject. ExecutionStep table has been dropped.
  return null;
}

// ── Initiative Candidate Handler ─────────────────────────────────────────────

async function handleInitiativeCandidate(
  operatorId: string,
  batch: ActorBatch,
  result: EvaluationResult,
  correlationId?: string,
): Promise<void> {
  const item = batch.items[result.messageIndex];
  if (!item || !result.projectRecommendation) return;

  const rec = result.projectRecommendation;
  const now = new Date();

  // Dedup: title similarity + source signal (parallel, independent checks)
  const [existing, existingFromSource] = await Promise.all([
    prisma.knowledgePage.findFirst({
      where: {
        operatorId,
        scope: "operator",
        pageType: "initiative",
        title: { contains: rec.title.slice(0, 50), mode: "insensitive" },
      },
      select: { slug: true },
    }),
    prisma.knowledgePage.findFirst({
      where: {
        operatorId,
        scope: "operator",
        pageType: "initiative",
        properties: { path: ["source_id"], equals: item.sourceId },
      },
      select: { slug: true },
    }),
  ]);
  if (existing) {
    console.log(`[content-detection] Initiative "${rec.title}" already exists (${existing.slug}), skipping`);
    return;
  }
  if (existingFromSource) {
    console.log(`[content-detection] Initiative already created from source ${item.sourceId}, skipping`);
    return;
  }

  const initiativeSlug = `initiative-${createId().slice(0, 8)}-${rec.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;

  const initiativeProps = {
    status: "proposed",
    proposed_at: now.toISOString(),
    source: "content_detected",
    source_id: item.sourceId,
    domain: batch.domainPageSlug ?? undefined,
    coordinator: rec.coordinatorEmail ?? undefined,
    due_date: rec.dueDate ?? undefined,
  };

  const articleBody = [
    `## Trigger`,
    `Detected from ${item.sourceType}: ${rec.rationale}`,
    ``,
    `## Proposal`,
    rec.description,
    ``,
    rec.proposedMembers?.length ? `## Proposed Members\n${rec.proposedMembers.map(m => `- ${m.name ?? m.email} — ${m.role ?? "TBD"}`).join("\n")}` : null,
    rec.proposedDeliverables?.length ? `## Deliverables\n${rec.proposedDeliverables.map(d => `- ${d.title}: ${d.description ?? ""}`).join("\n")}` : null,
    ``,
    `## Timeline`,
    `${now.toISOString().slice(0, 16)} — Proposed by detection pipeline`,
  ].filter(Boolean).join("\n");

  await prisma.knowledgePage.create({
    data: {
      operatorId,
      slug: initiativeSlug,
      title: rec.title,
      scope: "operator",
      pageType: "initiative",
      content: articleBody,
      properties: initiativeProps,
      synthesisPath: "detection",
      synthesizedByModel: "content-detector",
      lastSynthesizedAt: now,
    },
  });

  // Notify admins about the proposed initiative
  const { sendNotificationToAdmins } = await import("@/lib/notification-dispatch");
  await sendNotificationToAdmins({
    operatorId,
    type: "initiative_proposed",
    title: `Foreslået projekt: ${rec.title}`,
    body: `${rec.proposedDeliverables.length} leverancer identificeret. Gennemgå og godkend for at oprette projektet.`,
    sourceType: "initiative",
    sourceId: initiativeSlug,
  }).catch(() => {});

  console.log(
    `[content-detection] Created initiative wiki page "${rec.title}" (${initiativeSlug}) with ${rec.proposedDeliverables.length} proposed deliverables`,
  );
}

// ── Situation Creation / Update ──────────────────────────────────────────────

async function handleActionRequired(
  operatorId: string,
  batch: ActorBatch,
  result: EvaluationResult,
  wikiEnrichment: WikiEnrichment,
  createdInBatch: Set<string>,
  correlationId?: string,
): Promise<void> {
  const item = batch.items[result.messageIndex];
  if (!item) return;

  const meta = item.metadata ?? {};

  // Related to existing situation → link evaluation log (wiki page is source of truth)
  if (result.relatedSituationId) {
    const openIds = new Set(batch.openSituations.map((s) => s.situationId));
    if (openIds.has(result.relatedSituationId)) {
      await prisma.evaluationLog.updateMany({
        where: {
          operatorId,
          sourceId: item.sourceId,
          sourceType: item.sourceType,
          actorPageSlug: batch.actorPageSlug,
          situationId: null,
        },
        data: { situationId: result.relatedSituationId },
      }).catch(() => {});

      console.log(
        `[content-detection] Linked evidence to situation ${result.relatedSituationId} from ${item.sourceType}`,
      );
      return;
    }
  }

  // Safety: don't create multiple situations for the same actor+topic from one batch
  const dedupeKey = `${batch.actorKey}:${result.summary.slice(0, 80).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (createdInBatch.has(dedupeKey)) return;

  // Company-wide dedup: check if this source message already triggered a situation (wiki page)
  const existingPage = await prisma.knowledgePage.findFirst({
    where: {
      operatorId,
      pageType: "situation_instance",
      properties: { path: ["trigger_ref"], equals: item.sourceId },
    },
    select: { slug: true, properties: true },
  });
  if (existingPage) {
    const existingSituationId = ((existingPage.properties as Record<string, unknown>)?.situation_id as string) ?? "";
    await prisma.evaluationLog.updateMany({
      where: { operatorId, sourceId: item.sourceId, sourceType: item.sourceType, actorPageSlug: batch.actorPageSlug, situationId: null },
      data: { situationId: existingSituationId },
    }).catch(() => {});
    console.log(`[content-detection] Source dedup: merged ${batch.actorName} into existing situation page ${existingPage.slug}`);
    createdInBatch.add(dedupeKey);
    return;
  }

  // Cross-mechanism dedup: check for recent open situation wiki pages for this actor
  const recentPage = batch.actorPageSlug ? await prisma.knowledgePage.findFirst({
    where: {
      operatorId,
      pageType: "situation_instance",
      scope: "operator",
      properties: {
        path: ["trigger_page"], equals: batch.actorPageSlug,
      },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    select: { slug: true, properties: true, createdAt: true },
  }) : null;
  if (recentPage) {
    const recentProps = (recentPage.properties ?? {}) as Record<string, unknown>;
    const recentStatus = recentProps.status as string | undefined;
    if (recentStatus && ["detected", "reasoning", "proposed"].includes(recentStatus)) {
      const recentSituationId = (recentProps.situation_id as string) ?? "";
      const llmLinked = result.relatedSituationId === recentSituationId;
      const veryRecent = recentPage.createdAt > new Date(Date.now() - 2 * 60 * 60 * 1000);
      if (llmLinked || (!result.relatedSituationId && veryRecent)) {
        await prisma.evaluationLog.updateMany({
          where: { operatorId, sourceId: item.sourceId, sourceType: item.sourceType, actorPageSlug: batch.actorPageSlug, situationId: null },
          data: { situationId: recentSituationId },
        }).catch(() => {});
        console.log(`[content-detection] Cross-mechanism dedup: linked to recent situation page ${recentPage.slug} (${llmLinked ? "llm-linked" : "time-fallback"})`);
        createdInBatch.add(dedupeKey);
        return;
      }
    }
  }

  const situationTypeRef = await ensureActionRequiredType(operatorId, batch.domainPageSlug);
  const situationTypeId = situationTypeRef.id;

  const confidence = (result.urgency ? URGENCY_CONFIDENCE[result.urgency] : null) ?? 0.7;

  const { raw: senderRaw, name: senderName } = extractSenderName(meta);
  const subjectStr = meta.subject ? ` re: ${meta.subject}` : "";
  const triggerSummary = `${senderName}${subjectStr} — ${result.summary}`.slice(0, 300);

  // ── Wiki page creation (additive — failures must not block detection) ────
  const situationId = createId();
  let wikiPageSlug: string | undefined;
  try {
    const situationTypeWikiSlug = situationTypeRef.slug;

    const subjectSlug = batch.actorPageSlug
      ?? batch.actorName?.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)
      ?? "unknown";

    wikiPageSlug = await generateSituationSlug(operatorId, situationTypeWikiSlug, subjectSlug);

    const triggerDate = (meta.date as string) ?? new Date().toISOString();
    const triggerContent = [
      `${item.sourceType === "email" ? "Email" : "Message"} from ${senderName} received ${formatDetectionDate(triggerDate)}:`,
      `"${item.content.slice(0, 500)}${item.content.length > 500 ? "..." : ""}"`,
      meta.subject ? `Subject: ${meta.subject}` : null,
      `[RC-${item.sourceId}]`,
    ].filter(Boolean).join("\n");

    const contextLines: string[] = [];
    if (batch.actorPageSlug) {
      contextLines.push(`**Subject:** [[${batch.actorPageSlug}]]`);
    }
    if (batch.domainPageSlug) {
      contextLines.push(`**Domain:** [[${batch.domainPageSlug}]]`);
    }
    if (wikiEnrichment.actorContext) {
      contextLines.push(`\n${wikiEnrichment.actorContext.slice(0, 500)}`);
    }
    if (wikiEnrichment.relatedKnowledge.length > 0) {
      contextLines.push("\n**Related knowledge:**");
      for (const k of wikiEnrichment.relatedKnowledge.slice(0, 5)) {
        contextLines.push(`- [[${k.slug}]] — ${k.title}`);
      }
    }
    const contextContent = contextLines.join("\n");

    // source: "detected" (wiki property enum) — DB record uses "content_detected" for backward compat
    const situationProps: SituationProperties = {
      situation_id: situationId,
      status: "detected",
      severity: 0.5,
      confidence,
      situation_type: situationTypeWikiSlug,
      detected_at: new Date().toISOString(),
      source: "detected",
      trigger_ref: item.sourceId,
      domain: batch.domainPageSlug ?? undefined,
    };

    const situationTitle = `${situationTypeRef.name}: ${senderName}${subjectStr ? ` — ${meta.subject}` : ""}`;

    const detectedAtStr = formatDetectionDate(new Date().toISOString());
    await createSituationWikiPage({
      operatorId,
      slug: wikiPageSlug,
      title: situationTitle,
      properties: situationProps,
      triggerContent,
      contextContent,
      timelineEntries: [`${detectedAtStr} — Detected: ${result.summary}`],
    });
  } catch (err) {
    console.error("[content-detection] Wiki page creation failed:", err);
    wikiPageSlug = undefined;
  }

  const triggerEvidence = JSON.stringify({
    type: "content",
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    sender: senderRaw,
    subject: meta.subject ?? null,
    date: meta.date ?? new Date().toISOString(),
    content: item.content.slice(0, 2000),
    summary: result.summary,
    evidence: result.evidence,
    reasoning: result.reasoning,
    urgency: result.urgency,
    wikiEnrichment: {
      actorPageTitle: wikiEnrichment.actorContext ? "available" : null,
      relatedPages: wikiEnrichment.relatedKnowledge.map((k) => k.title),
    },
  });

  createdInBatch.add(dedupeKey);

  // Link situation back to evaluation log (situationId is the CUID stored in wiki page properties)
  await prisma.evaluationLog.updateMany({
    where: {
      operatorId,
      sourceId: item.sourceId,
      sourceType: item.sourceType,
      actorPageSlug: batch.actorPageSlug,
      situationId: null,
    },
    data: { situationId },
  }).catch(() => {});

  // Increment detectedCount on the SituationType
  await prisma.situationType.update({
    where: { id: situationTypeId },
    data: { detectedCount: { increment: 1 } },
  }).catch(() => {});
  checkConfirmationRate(situationTypeId).catch(console.error);

  // Enqueue reasoning for Bastion worker
  enqueueWorkerJob("reason_situation", operatorId, { situationId, wikiPageSlug }, correlationId).catch((err) =>
    console.error("[content-detection] Failed to enqueue reasoning:", err),
  );

  console.log(
    `[content-detection] Created situation for ${batch.actorName}: ${result.summary}`,
  );
}

// ── Evaluation Logging ───────────────────────────────────────────────────────

async function logEvaluation(
  operatorId: string,
  batch: ActorBatch,
  result: EvaluationResult,
  item: CommunicationItem | undefined,
): Promise<void> {
  await prisma.evaluationLog.create({
    data: {
      operatorId,
      actorPageSlug: batch.actorPageSlug,
      sourceType: item?.sourceType ?? "unknown",
      sourceId: item?.sourceId ?? "unknown",
      classification: result.classification,
      awarenessType: result.awarenessType ?? null,
      summary: result.summary || null,
      reasoning: result.reasoning || null,
      urgency: result.urgency,
      confidence: result.confidence,
      archetypeSlug: null,
      archetypeConfidence: null,
      situationId: null, // Updated after situation creation if applicable
      metadata: item?.metadata ? (item.metadata as Prisma.InputJsonValue) : undefined,
    },
  });
}

// ── Awareness Handling ───────────────────────────────────────────────────────

async function handleAwareness(
  operatorId: string,
  batch: ActorBatch,
  result: EvaluationResult,
  wikiEnrichment: WikiEnrichment,
  createdInBatch: Set<string>,
): Promise<void> {
  const item = batch.items[result.messageIndex];
  if (!item) return;

  const meta = item.metadata ?? {};

  // If related to an existing situation, link evaluation log (wiki page is source of truth)
  if (result.relatedSituationId) {
    const openIds = new Set(batch.openSituations.map((s) => s.situationId));
    if (openIds.has(result.relatedSituationId)) {
      await prisma.evaluationLog.updateMany({
        where: { operatorId, sourceId: item.sourceId, sourceType: item.sourceType, actorPageSlug: batch.actorPageSlug, situationId: null },
        data: { situationId: result.relatedSituationId },
      }).catch(() => {});
      return;
    }
  }

  if (result.awarenessType === "strategic") {
    // Strategic awareness → create wiki page for awareness signal
    const dedupeKey = `${batch.actorKey}:strategic:${result.summary.slice(0, 80).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    if (createdInBatch.has(dedupeKey)) return;

    // Cross-mechanism dedup: check for recent open situation wiki pages for this actor
    const recentPage = batch.actorPageSlug ? await prisma.knowledgePage.findFirst({
      where: {
        operatorId,
        pageType: "situation_instance",
        scope: "operator",
        properties: {
          path: ["trigger_page"], equals: batch.actorPageSlug,
        },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
      select: { slug: true, properties: true, createdAt: true },
    }) : null;
    if (recentPage) {
      const recentProps = (recentPage.properties ?? {}) as Record<string, unknown>;
      const recentStatus = recentProps.status as string | undefined;
      if (recentStatus && ["detected", "reasoning", "proposed"].includes(recentStatus)) {
        const recentSituationId = (recentProps.situation_id as string) ?? "";
        const llmLinked = result.relatedSituationId === recentSituationId;
        const veryRecent = recentPage.createdAt > new Date(Date.now() - 2 * 60 * 60 * 1000);
        if (llmLinked || (!result.relatedSituationId && veryRecent)) {
          await prisma.evaluationLog.updateMany({
            where: { operatorId, sourceId: item.sourceId, sourceType: item.sourceType, actorPageSlug: batch.actorPageSlug, situationId: null },
            data: { situationId: recentSituationId },
          }).catch(() => {});
          createdInBatch.add(dedupeKey);
          console.log(`[content-detection] Strategic awareness: linked to recent situation page ${recentPage.slug} (${llmLinked ? "llm-linked" : "time-fallback"})`);
          return;
        }
      }
    }

    const situationTypeId = await ensureAwarenessType(operatorId, batch.domainPageSlug);
    const situationId = createId();

    createdInBatch.add(dedupeKey);

    await prisma.evaluationLog.updateMany({
      where: { operatorId, sourceId: item.sourceId, sourceType: item.sourceType, actorPageSlug: batch.actorPageSlug, situationId: null },
      data: { situationId },
    }).catch(() => {});

    await prisma.situationType.update({
      where: { id: situationTypeId },
      data: { detectedCount: { increment: 1 } },
    }).catch(() => {});
    checkConfirmationRate(situationTypeId).catch(console.error);

    // Lightweight wiki signal — note the awareness in relevant person pages
    if (batch.actorPageSlug) {
      try {
        const { processWikiUpdates } = await import("@/lib/wiki-engine");
        await processWikiUpdates({
          operatorId,
          updates: [{
            slug: batch.actorPageSlug,
            pageType: "person_profile",
            title: `Awareness: ${result.summary.slice(0, 80)}`,
            updateType: "update",
            content: `## Recent Awareness Signal\n\n${result.summary}\n\n**Source:** ${item.sourceType} from ${meta.from ?? "unknown"} (${meta.date ?? "recent"})\n**Classification:** Strategic awareness\n**Evidence:** ${result.evidence ?? "N/A"}`,
            sourceCitations: [{
              sourceType: item.sourceType === "email" || item.sourceType === "slack" || item.sourceType === "teams" ? "chunk" : "signal",
              sourceId: item.sourceId,
              claim: result.summary,
            }],
            reasoning: `Strategic awareness signal detected during content evaluation. ${result.reasoning ?? ""}`,
          }],
          synthesisPath: "onboarding",
          synthesizedByModel: "content-detector",
        }).catch(err => {
          console.warn("[content-detection] Wiki awareness signal failed:", err);
        });
      } catch {
        // Non-fatal — wiki update is best-effort for awareness
      }
    }

    console.log(`[content-detection] Created strategic awareness situation (resolved, no reasoning) for ${batch.actorName}: ${result.summary}`);
    return;
  }

  // Informational awareness → notification only, no situation created
  const dedupeKey = `${batch.actorKey}:informational:${item.sourceId}`;
  if (createdInBatch.has(dedupeKey)) return;

  const { sendNotificationToAdmins } = await import("@/lib/notification-dispatch");

  const { name: senderName } = extractSenderName(meta);
  const notifTitle = `${senderName}${meta.subject ? ` — ${meta.subject}` : ""}`;
  const notifBody = result.summary;

  await sendNotificationToAdmins({
    operatorId,
    type: "awareness_informational",
    title: notifTitle.slice(0, 200),
    body: notifBody.slice(0, 500),
    sourceType: "awareness",
    sourceId: item.sourceId,
  });

  createdInBatch.add(dedupeKey);

  console.log(`[content-detection] Routed informational awareness to notification for ${batch.actorName}: ${result.summary}`);
}

// ── Main Entry Point ─────────────────────────────────────────────────────────

export async function evaluateContentForSituations(
  operatorId: string,
  items: CommunicationItem[],
): Promise<void> {
  // Rate limit
  if (items.length > MAX_BATCH_SIZE) {
    console.warn(
      `[content-detection] Batch of ${items.length} exceeds limit of ${MAX_BATCH_SIZE}, processing first ${MAX_BATCH_SIZE}`,
    );
    items = items.slice(0, MAX_BATCH_SIZE);
  }

  // Detection cap check for free/past_due operators
  const cdOperator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { billingStatus: true, freeDetectionStartedAt: true, freeDetectionSituationCount: true },
  });
  if (cdOperator) {
    const { checkDetectionCap } = await import("@/lib/billing-gate");
    const cap = checkDetectionCap(cdOperator);
    if (!cap.allowed) {
      console.log(`[content-detection] Skipping operator ${operatorId}: ${cap.reason}`);
      return;
    }
  }

  // Dedup: filter out items already evaluated
  const existingEvals = await prisma.evaluationLog.findMany({
    where: {
      operatorId,
      sourceId: { in: items.map(i => i.sourceId) },
    },
    select: { sourceId: true },
  });
  const evaluatedIds = new Set(existingEvals.map(e => e.sourceId));
  const originalCount = items.length;
  items = items.filter(i => !evaluatedIds.has(i.sourceId));
  if (items.length < originalCount) {
    console.log(`[content-detection] Filtered ${originalCount - items.length} already-evaluated items, ${items.length} remaining`);
  }
  if (items.length === 0) {
    console.log(`[content-detection] All items already evaluated, skipping`);
    return;
  }

  // Step 1: Resolve actors
  const actorMap = await resolveActorsFromWiki(operatorId, items);
  if (actorMap.size === 0) return;

  // Step 2–4: Process each actor batch
  const createdInBatch = new Set<string>();
  const correlationId = `${operatorId}:reason_situation:${Date.now()}`;

  for (const [actorKey, actor] of actorMap) {
    try {
      // Load open situations for this actor
      const openSituations = await loadOpenSituations(operatorId, actor.actorPageSlug);

      // Resolve domain from person page cross-references
      let domainPageSlug: string | null = null;
      let domainName: string | null = null;
      if (actor.actorPageSlug) {
        domainPageSlug = await findDomainRefFromPage(operatorId, actor.actorPageSlug);
      }
      if (domainPageSlug) {
        const domainPage = await prisma.knowledgePage.findFirst({
          where: { operatorId, slug: domainPageSlug, scope: "operator" },
          select: { title: true },
        });
        domainName = domainPage?.title ?? null;
      }

      const batch: ActorBatch = {
        actorKey,
        actorPageSlug: actor.actorPageSlug,
        domainPageSlug,
        actorName: actor.name,
        actorRole: actor.role,
        domainName,
        items: actor.items,
        openSituations,
      };

      // Check if any item is a response to an open situation
      const remainingItems: typeof actor.items = [];
      for (const item of actor.items) {
        const meta = item.metadata ?? {};
        const linkedSituationId = await checkResponseToOpenSituation(
          operatorId,
          (meta.threadId as string) ?? null,
          (meta.inReplyTo as string) ?? null,
          (meta.subject as string) ?? null,
        );
        if (linkedSituationId) {
          // checkResponseToOpenSituation currently returns null (TODO: wiki-based response detection)
          await enqueueWorkerJob("reason_situation", operatorId, { situationId: linkedSituationId });
          console.log(`[content-detector] Linked reply to open situation ${linkedSituationId}, triggered re-reasoning cycle`);
        } else {
          remainingItems.push(item);
        }
      }

      if (remainingItems.length === 0) continue; // All items linked to open situations
      batch.items = remainingItems;

      // Enrich signals with surrounding context (parallel, per-item)
      const enrichments = await Promise.all(
        batch.items.map(item =>
          enrichSignalContext(operatorId, item, batch.actorPageSlug)
            .catch(err => {
              console.warn("[content-detection] Enrichment failed, proceeding without:", err);
              return null;
            })
        )
      );

      // Wiki enrichment (batch-level — one query per batch, not per item)
      const wikiEnrichment = await enrichBatchWithWiki(batch, operatorId);

      // LLM evaluation
      const results = await evaluateActorBatch(batch, enrichments, wikiEnrichment);

      // Handle results
      for (const result of results) {
        const item = batch.items[result.messageIndex];

        // Log EVERY evaluation to EvaluationLog
        await logEvaluation(operatorId, batch, result, item).catch((err) =>
          console.error("[content-detection] Failed to log evaluation:", err),
        );

        if (result.classification === "initiative_candidate") {
          await handleInitiativeCandidate(operatorId, batch, result, correlationId);
        } else if (result.classification === "action_required") {
          await handleActionRequired(operatorId, batch, result, wikiEnrichment, createdInBatch, correlationId);
        } else if (result.classification === "awareness") {
          await handleAwareness(operatorId, batch, result, wikiEnrichment, createdInBatch);
        }
        // irrelevant items: logged but no situation created
      }
    } catch (err) {
      console.error(
        `[content-detection] Error processing actor ${actor.name}:`,
        err,
      );
    }
  }
}
