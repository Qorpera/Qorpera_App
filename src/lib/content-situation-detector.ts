import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { callLLM, getModel } from "@/lib/ai-provider";
import { resolveEntity } from "@/lib/entity-resolution";
import { resolveDepartmentsFromEmails } from "@/lib/activity-pipeline";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";
import { extractJSONArray } from "@/lib/json-helpers";
import { checkConfirmationRate } from "@/lib/confirmation-rate";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

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
  classification: "action_required" | "awareness" | "irrelevant";
  summary: string;
  urgency: "low" | "medium" | "high" | null; // null for irrelevant
  confidence: number;
  relatedSituationId: string | null;
  updatedSummary: string | null;
  evidence: string;
  reasoning: string; // NEW: why the LLM classified it this way
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
const COMMUNICATION_TYPES = new Set(["email", "slack_message", "teams_message"]);

const URGENCY_CONFIDENCE: Record<string, number> = {
  high: 0.9,
  medium: 0.7,
  low: 0.5,
};

// ── SituationType Cache ──────────────────────────────────────────────────────

const actionRequiredTypeCache = new Map<string, string>();

export async function ensureActionRequiredType(
  operatorId: string,
  departmentId: string,
): Promise<string> {
  const cacheKey = `${operatorId}:${departmentId}`;
  const cached = actionRequiredTypeCache.get(cacheKey);
  if (cached) return cached;

  // Look up department name for slug
  const dept = await prisma.entity.findUnique({
    where: { id: departmentId },
    select: { displayName: true },
  });
  const deptSlug = (dept?.displayName ?? "general")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const slug = `action-required-${deptSlug}`;

  const sitType = await prisma.situationType.upsert({
    where: { operatorId_slug: { operatorId, slug } },
    create: {
      operatorId,
      slug,
      name: "Action Required",
      description:
        "Communication-detected situations requiring action from team members in this department.",
      // mode: "content" is deliberately unrecognized by the cron detector's
      // safeParseDetection(), so these types are skipped during cron detection.
      // Content-detected situations are created inline by this module, not by the cron.
      detectionLogic: JSON.stringify({
        mode: "content",
        description: "Detected from incoming communications",
      }),
      autonomyLevel: "supervised",
      scopeEntityId: departmentId,
      enabled: true,
    },
    update: {}, // no-op if exists
  });

  actionRequiredTypeCache.set(cacheKey, sitType.id);
  return sitType.id;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function isEligibleCommunication(item: {
  sourceType: string;
  metadata?: Record<string, unknown>;
}): boolean {
  if (!COMMUNICATION_TYPES.has(item.sourceType)) return false;
  if (item.metadata?.isAutomated === true) return false;
  return true;
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

const SYSTEM_PROMPT = `You are evaluating incoming business communications to determine what attention they require from a specific person within their organization.

Classify each message into one of three categories:

**action_required** — The recipient needs to perform a concrete action: respond to a question, complete a task, make a decision, attend a meeting, review a document, follow up on something, approve/reject something. The action must be relevant to legitimate business operations — not personal purchases, spam, or solicitations.

**awareness** — The recipient should know about this but doesn't need to do anything specific. They are CC'd or BCC'd with no direct ask. It's a status update, FYI, or informational share relevant to their work. Includes meeting notes they weren't actioned on, announcements, or context they may need later.

**irrelevant** — This has nothing to do with the recipient's work responsibilities. Spam, marketing solicitations, newsletters they didn't subscribe to for work purposes, automated system notifications with no actionable content, social/casual messages with no work relevance, promotional offers (gambling, personal shopping, etc).

For each message, also assess:
- **urgency** (low/medium/high) — only for action_required and awareness. null for irrelevant.
- **confidence** (0.0-1.0) — how confident you are in the classification
- **reasoning** — one sentence explaining why you chose this classification

Respond with ONLY valid JSON (no markdown fences):`;

async function evaluateActorBatch(batch: ActorBatch): Promise<EvaluationResult[]> {
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
      return `MESSAGE ${idx}:
  Source: ${item.sourceType}
  From: ${meta.from ?? meta.authorEmail ?? "unknown"}
  To: ${meta.to ?? "unknown"}
  Subject: ${meta.subject ?? "(none)"}
  Date: ${meta.date ?? "unknown"}
  Content: ${contentTruncated}`;
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
    "classification": "action_required" | "awareness" | "irrelevant",
    "summary": "Brief description (1-2 sentences). For awareness: what the person should know. For irrelevant: why it doesn't matter.",
    "urgency": "low" | "medium" | "high" | null,
    "confidence": 0.0-1.0,
    "relatedSituationId": "existing situation ID if this updates an open situation, or null",
    "updatedSummary": "If related to existing situation, the updated summary, or null",
    "evidence": "The specific text that drove the classification",
    "reasoning": "One sentence: why this classification"
  }
]`;

  const response = await callLLM({
    instructions: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    temperature: 0.1,
    maxTokens: 2000,
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
    classification: (["action_required", "awareness", "irrelevant"].includes(r.classification as string)
      ? r.classification
      : r.actionRequired === true ? "action_required" : "irrelevant") as "action_required" | "awareness" | "irrelevant",
    summary: String(r.summary ?? ""),
    urgency: r.urgency === null ? null : (["low", "medium", "high"].includes(r.urgency as string)
      ? r.urgency
      : "medium") as "low" | "medium" | "high" | null,
    confidence: typeof r.confidence === "number" ? r.confidence : 0.5,
    relatedSituationId: r.relatedSituationId ? String(r.relatedSituationId) : null,
    updatedSummary: r.updatedSummary ? String(r.updatedSummary) : null,
    evidence: String(r.evidence ?? ""),
    reasoning: String(r.reasoning ?? ""),
  }));
}

// ── Situation Creation / Update ──────────────────────────────────────────────

async function handleActionRequired(
  operatorId: string,
  batch: ActorBatch,
  result: EvaluationResult,
  createdInBatch: Set<string>,
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
  const dedupeKey = `${batch.actorEntityId}:${result.summary.slice(0, 50)}`;
  if (createdInBatch.has(dedupeKey)) return;

  // Resolve department — prefer batch-level resolution, fall back to per-item
  const departmentId = batch.departmentId
    ?? (await resolveDepartmentsFromEmails(operatorId, item.participantEmails))[0];
  if (!departmentId) {
    console.warn("[content-detection] No department resolved, skipping situation creation");
    return;
  }

  const situationTypeId = await ensureActionRequiredType(operatorId, departmentId);

  const confidence = (result.urgency ? URGENCY_CONFIDENCE[result.urgency] : null) ?? 0.7;

  const situation = await prisma.situation.create({
    data: {
      operatorId,
      situationTypeId,
      triggerEntityId: batch.actorEntityId,
      source: "content_detected",
      status: "detected",
      confidence,
      severity: 0.5,
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

  // Notification
  await sendNotificationToAdmins({
    operatorId,
    type: "situation_proposed",
    title: `Action needed: ${result.summary}`,
    body: result.summary,
    sourceType: "situation",
    sourceId: situation.id,
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
  enqueueWorkerJob("reason_situation", operatorId, { situationId: situation.id }).catch((err) =>
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
      summary: result.summary || null,
      reasoning: result.reasoning || null,
      urgency: result.urgency,
      confidence: result.confidence,
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

  // Dedup
  const dedupeKey = `${batch.actorEntityId}:awareness:${result.summary.slice(0, 50)}`;
  if (createdInBatch.has(dedupeKey)) return;

  // Resolve department
  const departmentId = batch.departmentId
    ?? (await resolveDepartmentsFromEmails(operatorId, item.participantEmails))[0];
  if (!departmentId) return;

  const situationTypeId = await ensureAwarenessType(operatorId, departmentId);

  // Create situation at lowest possible severity and confidence
  const situation = await prisma.situation.create({
    data: {
      operatorId,
      situationTypeId,
      triggerEntityId: batch.actorEntityId,
      source: "content_detected",
      status: "resolved", // Pre-resolved — no action needed
      confidence: result.confidence ?? 0.3,
      severity: 0.1, // Lowest priority
      contextSnapshot: JSON.stringify({
        contentEvidence: [{
          sourceId: item.sourceId,
          sourceType: item.sourceType,
          sender: meta.from ?? meta.authorEmail ?? "unknown",
          subject: meta.subject ?? null,
          date: meta.date ?? new Date().toISOString(),
          summary: result.summary,
          classification: "awareness",
        }],
        currentSummary: result.summary,
      }),
      reasoning: JSON.stringify({
        analysis: result.summary,
        classification: "awareness",
        reasoning: result.reasoning,
        actionPlan: null, // No action needed
      }),
    },
  });

  createdInBatch.add(dedupeKey);

  // Link evaluation log
  await prisma.evaluationLog.updateMany({
    where: { operatorId, sourceId: item.sourceId, sourceType: item.sourceType, actorEntityId: batch.actorEntityId, situationId: null },
    data: { situationId: situation.id },
  }).catch(() => {});

  // No notification for awareness items — they surface passively in the feed
  // No reasoning enqueue — already resolved
  // No free tier tracking — awareness items don't count toward the 50-situation cap

  console.log(`[content-detection] Created awareness situation for ${batch.actorName}: ${result.summary}`);
}

// ── Awareness SituationType Cache ────────────────────────────────────────────

const awarenessTypeCache = new Map<string, string>();

export async function ensureAwarenessType(
  operatorId: string,
  departmentId: string,
): Promise<string> {
  const cacheKey = `${operatorId}:${departmentId}`;
  const cached = awarenessTypeCache.get(cacheKey);
  if (cached) return cached;

  const dept = await prisma.entity.findUnique({
    where: { id: departmentId },
    select: { displayName: true },
  });
  const deptSlug = (dept?.displayName ?? "general")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const slug = `awareness-${deptSlug}`;

  const sitType = await prisma.situationType.upsert({
    where: { operatorId_slug: { operatorId, slug } },
    create: {
      operatorId,
      slug,
      name: "Awareness",
      description: "Items the employee should be aware of but that don't require direct action.",
      detectionLogic: JSON.stringify({
        mode: "content",
        description: "Awareness items detected from incoming communications",
      }),
      autonomyLevel: "supervised",
      scopeEntityId: departmentId,
      enabled: true,
    },
    update: {},
  });

  awarenessTypeCache.set(cacheKey, sitType.id);
  return sitType.id;
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

  // Step 1: Resolve actors
  const actorMap = await resolveActors(operatorId, items);
  if (actorMap.size === 0) return;

  // Step 2–4: Process each actor batch
  const createdInBatch = new Set<string>();

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

      // LLM evaluation
      const results = await evaluateActorBatch(batch);

      // Handle results
      for (const result of results) {
        const item = batch.items[result.messageIndex];

        // Log EVERY evaluation to EvaluationLog
        await logEvaluation(operatorId, batch, result, item).catch((err) =>
          console.error("[content-detection] Failed to log evaluation:", err),
        );

        if (result.classification === "action_required") {
          await handleActionRequired(operatorId, batch, result, createdInBatch);
        } else if (result.classification === "awareness") {
          await handleAwareness(operatorId, batch, result, createdInBatch);
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
