import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import { resolveEntity } from "@/lib/entity-resolution";
import { resolveDepartmentsFromEmails } from "@/lib/activity-pipeline";
import { reasonAboutSituation } from "@/lib/reasoning-engine";

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
  actionRequired: boolean;
  summary: string;
  urgency: "low" | "medium" | "high";
  relatedSituationId: string | null;
  updatedSummary: string | null;
  evidence: string;
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

function extractJSONArray(
  text: string,
): Array<Record<string, unknown>> | null {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();
  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return null;
  }
}

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

const SYSTEM_PROMPT = `You are evaluating incoming business communications to determine if they require action from a specific person.

For each message, determine:
1. Does this message require the recipient to perform a concrete action? (task assignment, request, question needing a response, deadline, decision needed, follow-up required)
2. If yes — is this related to an existing open situation, or is it a new action item?

Things that are NOT action-required:
- FYI/informational messages with no ask
- Newsletter or automated emails (already filtered, but double-check)
- Messages where the recipient already responded (look at thread context)
- Social/casual messages
- Read receipts, calendar notifications, automated system messages

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
    "actionRequired": true/false,
    "summary": "Brief description of what needs to be done (1-2 sentences)",
    "urgency": "low" | "medium" | "high",
    "relatedSituationId": "existing situation ID if this is about the same thing, or null",
    "updatedSummary": "If related to existing situation, the updated summary reflecting new information, or null",
    "evidence": "The specific text from the message that implies action is needed"
  }
]`;

  const response = await callLLM(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.1, maxTokens: 2000, aiFunction: "reasoning" },
  );

  const parsed = extractJSONArray(response.content);
  if (!parsed) {
    console.error("[content-detection] Failed to parse LLM response");
    return [];
  }

  return parsed.map((r) => ({
    messageIndex: Number(r.messageIndex ?? 0),
    actionRequired: Boolean(r.actionRequired),
    summary: String(r.summary ?? ""),
    urgency: (["low", "medium", "high"].includes(r.urgency as string)
      ? r.urgency
      : "medium") as "low" | "medium" | "high",
    relatedSituationId: r.relatedSituationId ? String(r.relatedSituationId) : null,
    updatedSummary: r.updatedSummary ? String(r.updatedSummary) : null,
    evidence: String(r.evidence ?? ""),
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

  const confidence = URGENCY_CONFIDENCE[result.urgency] ?? 0.7;

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

  // Notification
  await prisma.notification.create({
    data: {
      operatorId,
      title: `Action needed: ${result.summary}`,
      body: result.summary,
      sourceType: "situation",
      sourceId: situation.id,
    },
  }).catch(() => {});

  // Fire-and-forget reasoning
  reasonAboutSituation(situation.id).catch((err) =>
    console.error("[content-detection] Reasoning error:", err),
  );

  console.log(
    `[content-detection] Created situation for ${batch.actorName}: ${result.summary}`,
  );
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
        if (!result.actionRequired) continue;
        await handleActionRequired(operatorId, batch, result, createdInBatch);
      }
    } catch (err) {
      console.error(
        `[content-detection] Error processing actor ${actor.name}:`,
        err,
      );
    }
  }
}
