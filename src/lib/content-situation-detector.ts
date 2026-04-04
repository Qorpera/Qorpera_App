import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { callLLM, getModel } from "@/lib/ai-provider";
import { resolveEntity } from "@/lib/entity-resolution";
import { resolveDepartmentsFromEmails } from "@/lib/activity-pipeline";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";
import { extractJSONArray } from "@/lib/json-helpers";
import { enrichSignalContext, type EnrichedSignalContext } from "./detection-enrichment";
import { checkConfirmationRate } from "@/lib/confirmation-rate";
import { getArchetypeTaxonomy, ensureArchetypeSituationType } from "@/lib/archetype-classifier";
import { ensureActionRequiredType, ensureAwarenessType } from "@/lib/situation-type-helpers";

// Re-export so existing consumers don't break
export { ensureActionRequiredType, ensureAwarenessType };

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
  evidence: string;
  reasoning: string;
  archetypeSlug: string | null;
  archetypeConfidence: number | null;
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
  actorEntityId: string;
  actorName: string;
  actorRole: string | null;
  departmentId: string | null;
  departmentName: string | null;
  items: CommunicationItem[];
  openSituations: Array<{ id: string; summary: string }>;
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
}): boolean {
  if (!COMMUNICATION_TYPES.has(item.sourceType)) return false;
  if (item.metadata?.isAutomated === true) return false;
  return true;
}

function extractSenderName(meta: Record<string, unknown>): { raw: string; name: string } {
  const raw = String(meta.from ?? meta.authorEmail ?? "unknown");
  const name = raw.split("@")[0].split("<").pop()?.trim() ?? "Unknown";
  return { raw, name };
}

// ── Actor Resolution ─────────────────────────────────────────────────────────

async function resolveActors(
  operatorId: string,
  items: CommunicationItem[],
): Promise<Map<string, { entityId: string; name: string; role: string | null; items: CommunicationItem[] }>> {
  const actorMap = new Map<
    string,
    { entityId: string; name: string; role: string | null; items: CommunicationItem[] }
  >();

  for (const item of items) {
    const actorEmails = getActorEmails(item);
    if (actorEmails.length === 0) continue;

    for (const email of actorEmails) {
      const entityId = await resolveEntity(operatorId, {
        identityValues: { email: email.toLowerCase().trim() },
      });
      if (!entityId) continue;

      const existing = actorMap.get(entityId);
      if (existing) {
        existing.items.push(item);
      } else {
        const entity = await prisma.entity.findUnique({
          where: { id: entityId },
          select: {
            displayName: true,
            propertyValues: {
              select: { value: true, property: { select: { slug: true } } },
            },
          },
        });
        const roleVal = entity?.propertyValues?.find(
          (pv: { property: { slug: string }; value: string }) =>
            pv.property.slug === "job-title" || pv.property.slug === "role",
        );
        actorMap.set(entityId, {
          entityId,
          name: entity?.displayName ?? email,
          role: roleVal?.value ?? null,
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
  actorEntityId: string,
): Promise<Array<{ id: string; summary: string }>> {
  const situations = await prisma.situation.findMany({
    where: {
      operatorId,
      triggerEntityId: actorEntityId,
      status: { notIn: ["resolved", "closed"] },
    },
    select: { id: true, reasoning: true, contextSnapshot: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return situations.map((s) => {
    let summary = "";
    if (s.reasoning) {
      try {
        const r = JSON.parse(s.reasoning);
        summary = r.analysis?.slice(0, 100) ?? "";
      } catch { /* ignore */ }
    }
    if (!summary && s.contextSnapshot) {
      try {
        const cs = JSON.parse(s.contextSnapshot);
        summary = cs.currentSummary?.slice(0, 100) ?? JSON.stringify(cs).slice(0, 100);
      } catch { /* ignore */ }
    }
    return { id: s.id, summary };
  });
}

// ── LLM Evaluation ──────────────────────────────────────────────────────────

async function buildSystemPrompt(): Promise<string> {
  const taxonomy = await getArchetypeTaxonomy();

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

When you classify as initiative_candidate, you must ALSO provide a projectRecommendation object with: title, description, coordinatorEmail (who should scope this — typically the meeting organizer or most senior attendee), dueDate, proposedMembers (each with email, name, role), proposedDeliverables (each with title, description, assignedToEmail, format, suggestedDeadline), and rationale explaining why this should be a project.

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

For each message classified as "action_required" OR as "awareness" with awarenessType "strategic", you must ALSO classify it against the situation archetype taxonomy. Pick the single best-matching archetype slug. If no archetype fits well, use "unclassified".

SITUATION ARCHETYPE TAXONOMY:
${taxonomy}

For initiative_candidate messages, also include:
    "projectRecommendation": {
      "title": "Project title",
      "description": "What this project accomplishes",
      "coordinatorEmail": "email of person who should review/scope this",
      "dueDate": "ISO date or null",
      "proposedMembers": [{"email": "...", "name": "...", "role": "owner|contributor|reviewer"}],
      "proposedDeliverables": [{"title": "...", "description": "...", "assignedToEmail": "...", "format": "document|spreadsheet|presentation|analysis", "suggestedDeadline": "ISO date or null"}],
      "rationale": "Why this needs a project, not individual tasks"
    }

Respond with ONLY valid JSON (no markdown fences):`;
}

async function evaluateActorBatch(batch: ActorBatch, enrichments: (EnrichedSignalContext | null)[]): Promise<EvaluationResult[]> {
  const openSitLines =
    batch.openSituations.length > 0
      ? batch.openSituations
          .map((s) => `- ${s.id}: ${s.summary}`)
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

  const userPrompt = `PERSON WHO NEEDS TO ACT: ${batch.actorName}${batch.actorRole ? ` (${batch.actorRole})` : ""}
DEPARTMENT: ${batch.departmentName ?? "Unknown"}

EXISTING OPEN SITUATIONS FOR THIS PERSON:
${openSitLines}

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
    "archetypeSlug": "overdue_invoice | client_escalation | ... | unclassified (action_required and strategic awareness only, null otherwise)",
    "archetypeConfidence": "0.0-1.0 (action_required and strategic awareness only, null otherwise)",
    "projectRecommendation": "(include ONLY for initiative_candidate — see system prompt for schema)"
  }
]`;

  const systemPrompt = await buildSystemPrompt();

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
    reasoning: String(r.reasoning ?? ""),
    archetypeSlug: (r.classification === "action_required" || (r.classification === "awareness" && r.awarenessType === "strategic"))
      && typeof r.archetypeSlug === "string"
      ? r.archetypeSlug
      : null,
    archetypeConfidence: (r.classification === "action_required" || (r.classification === "awareness" && r.awarenessType === "strategic"))
      && typeof r.archetypeConfidence === "number"
      ? r.archetypeConfidence
      : null,
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
  operatorId: string,
  threadId: string | null,
  inReplyTo: string | null,
  subject: string | null,
): Promise<string | null> {
  if (!threadId && !inReplyTo) return null;

  const conditions: Array<Record<string, unknown>> = [];
  if (threadId) conditions.push({ outputResult: { contains: threadId } });
  if (inReplyTo) conditions.push({ outputResult: { contains: inReplyTo } });

  const matchingSteps = await prisma.executionStep.findMany({
    where: {
      plan: { operatorId },
      executionMode: "action",
      status: "completed",
      OR: conditions,
    },
    include: {
      plan: {
        select: {
          sourceType: true,
          sourceId: true,
        },
      },
    },
    take: 10,
    orderBy: { executedAt: "desc" },
  });

  for (const step of matchingSteps) {
    if (step.plan.sourceType !== "situation") continue;
    try {
      const result = JSON.parse(step.outputResult!);
      if (result.type === "email" && result.threadId) {
        const matches = result.threadId === threadId || result.threadId === inReplyTo;
        if (!matches) continue;

        const situation = await prisma.situation.findUnique({
          where: { id: step.plan.sourceId },
          select: { id: true, status: true },
        });
        if (situation && ["monitoring", "executing", "proposed"].includes(situation.status)) {
          return situation.id;
        }
      }
    } catch {}
  }

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
  const meta = item.metadata ?? {};

  // Dedup: check if a similar initiative already exists
  const existing = await prisma.initiative.findFirst({
    where: {
      operatorId,
      status: { notIn: ["rejected", "failed"] },
      rationale: { contains: rec.title.slice(0, 50) },
      proposedProjectConfig: { not: Prisma.DbNull },
    },
  });
  if (existing) {
    console.log(`[content-detection] Initiative "${rec.title}" already exists (${existing.id}), skipping`);
    return;
  }

  // Also dedup by source signal — don't create multiple initiatives from the same email
  const existingFromSource = await prisma.initiative.findFirst({
    where: {
      operatorId,
      status: { notIn: ["rejected", "failed"] },
      proposedProjectConfig: { path: ["sourceSignal", "sourceId"], equals: item.sourceId },
    },
  });
  if (existingFromSource) {
    console.log(`[content-detection] Initiative already created from source ${item.sourceId}, skipping`);
    return;
  }

  // Resolve department for the actor
  const departmentId = batch.departmentId
    ?? (await resolveDepartmentsFromEmails(operatorId, item.participantEmails))[0]
    ?? null;

  // Find relevant goal (if any)
  let goalId: string | null = null;
  if (departmentId) {
    const goal = await prisma.goal.findFirst({
      where: { operatorId, departmentId, status: "active" },
      select: { id: true },
      orderBy: { priority: "asc" },
    });
    goalId = goal?.id ?? null;
  }
  if (!goalId) {
    const hqGoal = await prisma.goal.findFirst({
      where: { operatorId, departmentId: null, status: "active" },
      select: { id: true },
      orderBy: { priority: "asc" },
    });
    goalId = hqGoal?.id ?? null;
  }

  // Find AI entity for attribution
  let aiEntityId: string | null = null;
  if (departmentId) {
    const deptAi = await prisma.entity.findFirst({
      where: { operatorId, ownerDepartmentId: departmentId, status: "active" },
      select: { id: true },
    });
    aiEntityId = deptAi?.id ?? null;
  }
  if (!aiEntityId) {
    const hqAi = await prisma.entity.findFirst({
      where: {
        operatorId,
        status: "active",
        entityType: { slug: { in: ["hq-ai", "ai-agent"] } },
        ownerDepartmentId: null,
      },
      select: { id: true },
    });
    aiEntityId = hqAi?.id ?? null;
  }
  if (!aiEntityId) {
    console.warn("[content-detection] No AI entity found for initiative attribution, skipping");
    return;
  }

  // Create initiative with project config
  const initiative = await prisma.initiative.create({
    data: {
      operatorId,
      goalId,
      aiEntityId,
      status: "proposed",
      rationale: `[content-detected:initiative_candidate] ${rec.title}\n\n${rec.rationale}`,
      impactAssessment: rec.description,
      proposedProjectConfig: {
        title: rec.title,
        description: rec.description,
        coordinatorEmail: rec.coordinatorEmail,
        dueDate: rec.dueDate,
        members: rec.proposedMembers,
        deliverables: rec.proposedDeliverables,
        sourceSignal: {
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          sender: (meta.from as string) ?? (meta.authorEmail as string) ?? "unknown",
          subject: (meta.subject as string) ?? null,
          date: (meta.date as string) ?? new Date().toISOString(),
          summary: result.summary,
        },
      },
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
    sourceId: initiative.id,
  }).catch(() => {});

  console.log(
    `[content-detection] Created initiative "${rec.title}" with ${rec.proposedDeliverables.length} proposed deliverables`,
  );
}

// ── Situation Creation / Update ──────────────────────────────────────────────

async function handleActionRequired(
  operatorId: string,
  batch: ActorBatch,
  result: EvaluationResult,
  createdInBatch: Set<string>,
  companyWideArchetypes: Set<string>,
  correlationId?: string,
): Promise<void> {
  const item = batch.items[result.messageIndex];
  if (!item) return;

  const meta = item.metadata ?? {};

  // Related to existing situation → update context
  if (result.relatedSituationId) {
    const openIds = new Set(batch.openSituations.map((s) => s.id));
    if (openIds.has(result.relatedSituationId)) {
      const existing = await prisma.situation.findUnique({
        where: { id: result.relatedSituationId },
        select: { contextSnapshot: true },
      });

      let snapshot: Record<string, unknown> = {};
      if (existing?.contextSnapshot) {
        try {
          snapshot = JSON.parse(existing.contextSnapshot);
        } catch { /* ignore */ }
      }

      const evidenceArr = Array.isArray(snapshot.contentEvidence)
        ? (snapshot.contentEvidence as Array<Record<string, unknown>>)
        : [];
      evidenceArr.push({
        sourceId: item.sourceId,
        sourceType: item.sourceType,
        sender: meta.from ?? meta.authorEmail ?? "unknown",
        subject: meta.subject ?? null,
        date: meta.date ?? new Date().toISOString(),
        summary: result.summary,
      });
      snapshot.contentEvidence = evidenceArr;
      if (result.updatedSummary) {
        snapshot.currentSummary = result.updatedSummary;
      }

      await prisma.situation.update({
        where: { id: result.relatedSituationId },
        data: { contextSnapshot: JSON.stringify(snapshot) },
      });

      // Link evaluation log
      await prisma.evaluationLog.updateMany({
        where: {
          operatorId,
          sourceId: item.sourceId,
          sourceType: item.sourceType,
          actorEntityId: batch.actorEntityId,
          situationId: null,
        },
        data: { situationId: result.relatedSituationId },
      }).catch(() => {});

      console.log(
        `[content-detection] Updated situation ${result.relatedSituationId} with new evidence from ${item.sourceType}`,
      );
      return;
    }
  }

  // Safety: don't create multiple situations for the same actor from one batch
  const dedupeKey = result.archetypeSlug && result.archetypeSlug !== "unclassified"
    ? `${batch.actorEntityId}:archetype:${result.archetypeSlug}`
    : `${batch.actorEntityId}:${result.summary.slice(0, 50)}`;
  if (createdInBatch.has(dedupeKey)) return;

  // Cross-actor dedup for company-wide events: if the SAME source email
  // has already created a situation for a DIFFERENT actor with the SAME archetype,
  // merge into the first situation instead of creating a new one
  if (result.archetypeSlug && result.archetypeSlug !== "unclassified") {
    const sourceKey = `${item.sourceId}:${result.archetypeSlug}`;
    if (companyWideArchetypes.has(sourceKey)) {
      const existingCWSituation = await prisma.situation.findFirst({
        where: {
          operatorId,
          source: "content_detected",
          status: { notIn: ["resolved", "closed"] },
          situationType: { archetypeSlug: result.archetypeSlug },
          triggerEvidence: { contains: item.sourceId },
        },
        select: { id: true, contextSnapshot: true },
        orderBy: { createdAt: "desc" },
      });
      if (existingCWSituation) {
        let snapshot: Record<string, unknown> = {};
        if (existingCWSituation.contextSnapshot) {
          try { snapshot = JSON.parse(existingCWSituation.contextSnapshot as string); } catch {}
        }
        const evidenceArr = Array.isArray(snapshot.contentEvidence)
          ? (snapshot.contentEvidence as Array<Record<string, unknown>>)
          : [];
        evidenceArr.push({
          sourceId: item.sourceId,
          sourceType: item.sourceType,
          sender: meta.from ?? meta.authorEmail ?? "unknown",
          subject: meta.subject ?? null,
          date: meta.date ?? new Date().toISOString(),
          summary: result.summary,
          additionalActor: batch.actorName,
          classification: "merged_company_wide",
        });
        snapshot.contentEvidence = evidenceArr;
        await prisma.situation.update({
          where: { id: existingCWSituation.id },
          data: { contextSnapshot: JSON.stringify(snapshot) },
        });

        await prisma.evaluationLog.updateMany({
          where: { operatorId, sourceId: item.sourceId, sourceType: item.sourceType, actorEntityId: batch.actorEntityId, situationId: null },
          data: { situationId: existingCWSituation.id },
        }).catch(() => {});

        console.log(`[content-detection] Company-wide dedup: merged ${batch.actorName}'s instance into existing situation ${existingCWSituation.id} (${result.archetypeSlug})`);
        createdInBatch.add(dedupeKey);
        return;
      }
    }
  }

  // Cross-mechanism dedup: check if entity-based detection already created
  // a situation for this entity with the same archetype
  if (result.archetypeSlug && result.archetypeSlug !== "unclassified") {
    const existingSituation = await prisma.situation.findFirst({
      where: {
        operatorId,
        triggerEntityId: batch.actorEntityId,
        status: { notIn: ["resolved", "closed"] },
        situationType: {
          archetypeSlug: result.archetypeSlug,
        },
      },
    });
    if (existingSituation) {
      // Situation already exists from entity-based detection — enrich context instead
      const existing = await prisma.situation.findUnique({
        where: { id: existingSituation.id },
        select: { contextSnapshot: true },
      });
      let snapshot: Record<string, unknown> = {};
      if (existing?.contextSnapshot) {
        try { snapshot = JSON.parse(existing.contextSnapshot as string); } catch {}
      }
      const evidenceArr = Array.isArray(snapshot.contentEvidence)
        ? (snapshot.contentEvidence as Array<Record<string, unknown>>)
        : [];
      evidenceArr.push({
        sourceId: item.sourceId,
        sourceType: item.sourceType,
        sender: meta.from ?? meta.authorEmail ?? "unknown",
        subject: meta.subject ?? null,
        date: meta.date ?? new Date().toISOString(),
        summary: result.summary,
        evidence: result.evidence,
      });
      snapshot.contentEvidence = evidenceArr;
      await prisma.situation.update({
        where: { id: existingSituation.id },
        data: { contextSnapshot: JSON.stringify(snapshot) },
      });

      // Log evaluation linked to the existing situation
      await prisma.evaluationLog.updateMany({
        where: {
          operatorId,
          sourceId: item.sourceId,
          sourceType: item.sourceType,
          actorEntityId: batch.actorEntityId,
          situationId: null,
        },
        data: { situationId: existingSituation.id },
      }).catch(() => {});

      console.log(
        `[content-detection] Cross-mechanism dedup: enriched existing situation ${existingSituation.id} (${result.archetypeSlug}) instead of creating duplicate`,
      );
      createdInBatch.add(dedupeKey);
      return;
    }
  }

  // Resolve department — prefer batch-level resolution, fall back to per-item
  const departmentId = batch.departmentId
    ?? (await resolveDepartmentsFromEmails(operatorId, item.participantEmails))[0];
  if (!departmentId) {
    console.warn("[content-detection] No department resolved, skipping situation creation");
    return;
  }

  // Route to archetype-specific type, or generic "Action Required" for unclassified
  const situationTypeId = result.archetypeSlug && result.archetypeSlug !== "unclassified" && result.archetypeConfidence && result.archetypeConfidence >= 0.6
    ? await ensureArchetypeSituationType(operatorId, departmentId, result.archetypeSlug)
    : await ensureActionRequiredType(operatorId, departmentId);

  const confidence = (result.urgency ? URGENCY_CONFIDENCE[result.urgency] : null) ?? 0.7;

  const { raw: senderRaw, name: senderName } = extractSenderName(meta);
  const subjectStr = meta.subject ? ` re: ${meta.subject}` : "";
  const triggerSummary = `${senderName}${subjectStr} — ${result.summary}`.slice(0, 300);

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
  });

  const situation = await prisma.situation.create({
    data: {
      operatorId,
      situationTypeId,
      triggerEntityId: batch.actorEntityId,
      source: "content_detected",
      status: "detected",
      confidence,
      severity: 0.5,
      triggerEvidence,
      triggerSummary,
      contextSnapshot: JSON.stringify({
        contentEvidence: [
          {
            sourceId: item.sourceId,
            sourceType: item.sourceType,
            sender: meta.from ?? meta.authorEmail ?? "unknown",
            subject: meta.subject ?? null,
            date: meta.date ?? new Date().toISOString(),
            summary: result.summary,
            evidence: result.evidence,
          },
        ],
      }),
    },
  });

  createdInBatch.add(dedupeKey);

  // Register for cross-actor dedup
  if (result.archetypeSlug && result.archetypeSlug !== "unclassified") {
    companyWideArchetypes.add(`${item.sourceId}:${result.archetypeSlug}`);
  }

  // Link situation back to evaluation log
  await prisma.evaluationLog.updateMany({
    where: {
      operatorId,
      sourceId: item.sourceId,
      sourceType: item.sourceType,
      actorEntityId: batch.actorEntityId,
      situationId: null,
    },
    data: { situationId: situation.id },
  }).catch(() => {});

  // Free tier tracking (fire-and-forget)
  import("@/lib/situation-detector")
    .then((m) => m.trackFreeDetection(operatorId))
    .catch(console.error);

  // Increment detectedCount on the SituationType
  await prisma.situationType.update({
    where: { id: situationTypeId },
    data: { detectedCount: { increment: 1 } },
  }).catch(() => {});
  checkConfirmationRate(situationTypeId).catch(console.error);

  // Enqueue reasoning for Bastion worker
  enqueueWorkerJob("reason_situation", operatorId, { situationId: situation.id }, correlationId).catch((err) =>
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
      actorEntityId: batch.actorEntityId,
      sourceType: item?.sourceType ?? "unknown",
      sourceId: item?.sourceId ?? "unknown",
      classification: result.classification,
      awarenessType: result.awarenessType ?? null,
      summary: result.summary || null,
      reasoning: result.reasoning || null,
      urgency: result.urgency,
      confidence: result.confidence,
      archetypeSlug: result.archetypeSlug ?? null,
      archetypeConfidence: result.archetypeConfidence ?? null,
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
  createdInBatch: Set<string>,
  companyWideArchetypes: Set<string>,
): Promise<void> {
  const item = batch.items[result.messageIndex];
  if (!item) return;

  const meta = item.metadata ?? {};

  // If related to an existing situation, just update context (same as action_required)
  if (result.relatedSituationId) {
    const openIds = new Set(batch.openSituations.map((s) => s.id));
    if (openIds.has(result.relatedSituationId)) {
      const existing = await prisma.situation.findUnique({
        where: { id: result.relatedSituationId },
        select: { contextSnapshot: true },
      });

      let snapshot: Record<string, unknown> = {};
      if (existing?.contextSnapshot) {
        try { snapshot = JSON.parse(existing.contextSnapshot); } catch { /* ignore */ }
      }

      const evidenceArr = Array.isArray(snapshot.contentEvidence)
        ? (snapshot.contentEvidence as Array<Record<string, unknown>>)
        : [];
      evidenceArr.push({
        sourceId: item.sourceId,
        sourceType: item.sourceType,
        sender: meta.from ?? meta.authorEmail ?? "unknown",
        subject: meta.subject ?? null,
        date: meta.date ?? new Date().toISOString(),
        summary: result.summary,
        classification: "awareness",
      });
      snapshot.contentEvidence = evidenceArr;
      if (result.updatedSummary) snapshot.currentSummary = result.updatedSummary;

      await prisma.situation.update({
        where: { id: result.relatedSituationId },
        data: { contextSnapshot: JSON.stringify(snapshot) },
      });

      // Link evaluation log
      await prisma.evaluationLog.updateMany({
        where: { operatorId, sourceId: item.sourceId, sourceType: item.sourceType, actorEntityId: batch.actorEntityId, situationId: null },
        data: { situationId: result.relatedSituationId },
      }).catch(() => {});

      return;
    }
  }

  if (result.awarenessType === "strategic") {
    // Strategic awareness → create real situation with reasoning, same as action_required
    const dedupeKey = result.archetypeSlug && result.archetypeSlug !== "unclassified"
      ? `${batch.actorEntityId}:strategic:archetype:${result.archetypeSlug}`
      : `${batch.actorEntityId}:strategic:${result.summary.slice(0, 50)}`;
    if (createdInBatch.has(dedupeKey)) return;

    // Cross-mechanism dedup (same as handleActionRequired)
    if (result.archetypeSlug && result.archetypeSlug !== "unclassified") {
      const existingSituation = await prisma.situation.findFirst({
        where: {
          operatorId,
          triggerEntityId: batch.actorEntityId,
          status: { notIn: ["resolved", "closed"] },
          situationType: { archetypeSlug: result.archetypeSlug },
        },
      });
      if (existingSituation) {
        // Enrich existing situation context instead of creating duplicate
        const existing = await prisma.situation.findUnique({
          where: { id: existingSituation.id },
          select: { contextSnapshot: true },
        });
        let snapshot: Record<string, unknown> = {};
        if (existing?.contextSnapshot) {
          try { snapshot = JSON.parse(existing.contextSnapshot as string); } catch {}
        }
        const evidenceArr = Array.isArray(snapshot.contentEvidence)
          ? (snapshot.contentEvidence as Array<Record<string, unknown>>)
          : [];
        evidenceArr.push({
          sourceId: item.sourceId,
          sourceType: item.sourceType,
          sender: meta.from ?? meta.authorEmail ?? "unknown",
          subject: meta.subject ?? null,
          date: meta.date ?? new Date().toISOString(),
          summary: result.summary,
          evidence: result.evidence,
          classification: "strategic_awareness",
        });
        snapshot.contentEvidence = evidenceArr;
        await prisma.situation.update({
          where: { id: existingSituation.id },
          data: { contextSnapshot: JSON.stringify(snapshot) },
        });
        await prisma.evaluationLog.updateMany({
          where: { operatorId, sourceId: item.sourceId, sourceType: item.sourceType, actorEntityId: batch.actorEntityId, situationId: null },
          data: { situationId: existingSituation.id },
        }).catch(() => {});
        createdInBatch.add(dedupeKey);
        console.log(`[content-detection] Strategic awareness: enriched existing situation ${existingSituation.id}`);
        return;
      }
    }

    // Resolve department
    const departmentId = batch.departmentId
      ?? (await resolveDepartmentsFromEmails(operatorId, item.participantEmails))[0];
    if (!departmentId) {
      console.warn("[content-detection] No department resolved for strategic awareness, skipping");
      return;
    }

    // Route to archetype type or generic awareness type
    const situationTypeId = result.archetypeSlug && result.archetypeSlug !== "unclassified" && result.archetypeConfidence && result.archetypeConfidence >= 0.6
      ? await ensureArchetypeSituationType(operatorId, departmentId, result.archetypeSlug)
      : await ensureAwarenessType(operatorId, departmentId);

    const { raw: senderRaw, name: senderName } = extractSenderName(meta);
    const subjectStr = meta.subject ? ` re: ${meta.subject}` : "";
    const triggerSummary = `${senderName}${subjectStr} — ${result.summary}`.slice(0, 300);

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
      classification: "strategic_awareness",
    });

    const confidence = (result.urgency ? URGENCY_CONFIDENCE[result.urgency] : null) ?? 0.5;

    const situation = await prisma.situation.create({
      data: {
        operatorId,
        situationTypeId,
        triggerEntityId: batch.actorEntityId,
        source: "content_detected",
        status: "detected",  // Goes through reasoning — NOT pre-resolved
        confidence,
        severity: 0.3, // Lower than action_required (0.5) but not negligible
        triggerEvidence,
        triggerSummary,
        contextSnapshot: JSON.stringify({
          contentEvidence: [{
            sourceId: item.sourceId,
            sourceType: item.sourceType,
            sender: meta.from ?? meta.authorEmail ?? "unknown",
            subject: meta.subject ?? null,
            date: meta.date ?? new Date().toISOString(),
            summary: result.summary,
            evidence: result.evidence,
            classification: "strategic_awareness",
          }],
        }),
      },
    });

    createdInBatch.add(dedupeKey);

    await prisma.evaluationLog.updateMany({
      where: { operatorId, sourceId: item.sourceId, sourceType: item.sourceType, actorEntityId: batch.actorEntityId, situationId: null },
      data: { situationId: situation.id },
    }).catch(() => {});

    // Track free detection
    import("@/lib/situation-detector")
      .then((m) => m.trackFreeDetection(operatorId))
      .catch(console.error);

    await prisma.situationType.update({
      where: { id: situationTypeId },
      data: { detectedCount: { increment: 1 } },
    }).catch(() => {});
    checkConfirmationRate(situationTypeId).catch(console.error);

    // Enqueue reasoning — the reasoning engine will decide if action is warranted
    enqueueWorkerJob("reason_situation", operatorId, { situationId: situation.id }).catch((err) =>
      console.error("[content-detection] Failed to enqueue strategic awareness reasoning:", err),
    );

    console.log(`[content-detection] Created strategic awareness situation for ${batch.actorName}: ${result.summary}`);
    return;
  }

  // Informational awareness → notification only, no situation created
  const dedupeKey = `${batch.actorEntityId}:informational:${item.sourceId}`;
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
  const actorMap = await resolveActors(operatorId, items);
  if (actorMap.size === 0) return;

  // Step 2–4: Process each actor batch
  const createdInBatch = new Set<string>();
  // Cross-actor dedup: prevent the same company-wide event from creating situations for every actor
  const companyWideArchetypes = new Set<string>();
  const correlationId = `${operatorId}:reason_situation:${Date.now()}`;

  for (const [entityId, actor] of actorMap) {
    try {
      // Load open situations for this actor
      const openSituations = await loadOpenSituations(operatorId, entityId);

      // Resolve department for the actor
      const allEmails = actor.items.flatMap((i) => i.participantEmails ?? []);
      const deptIds = await resolveDepartmentsFromEmails(operatorId, allEmails);
      let departmentName: string | null = null;
      let departmentId: string | null = deptIds[0] ?? null;
      if (departmentId) {
        const dept = await prisma.entity.findUnique({
          where: { id: departmentId },
          select: { displayName: true },
        });
        departmentName = dept?.displayName ?? null;
      }

      const batch: ActorBatch = {
        actorEntityId: entityId,
        actorName: actor.name,
        actorRole: actor.role,
        departmentId,
        departmentName,
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
          await prisma.situation.update({
            where: { id: linkedSituationId },
            data: {
              status: "detected",
              triggerEvidence: JSON.stringify({
                type: "response",
                content: item.content?.slice(0, 2000),
                metadata: meta,
              }),
              triggerSummary: `Response received: ${((meta.subject as string) ?? "").slice(0, 150)}`,
            },
          });
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
          enrichSignalContext(operatorId, item, batch.actorEntityId)
            .catch(err => {
              console.warn("[content-detection] Enrichment failed, proceeding without:", err);
              return null;
            })
        )
      );

      // LLM evaluation
      const results = await evaluateActorBatch(batch, enrichments);

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
          await handleActionRequired(operatorId, batch, result, createdInBatch, companyWideArchetypes, correlationId);
        } else if (result.classification === "awareness") {
          await handleAwareness(operatorId, batch, result, createdInBatch, companyWideArchetypes);
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
