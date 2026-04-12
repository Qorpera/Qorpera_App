import { prisma } from "@/lib/db";
import type { StepOutput } from "@/lib/execution-engine";
import { buildSystemJobWikiContent } from "@/lib/system-job-wiki";

// ── Capability Definitions ──────────────────────────────────────────────────

export const INTERNAL_CAPABILITIES = [
  {
    name: "create_situation_type",
    description: "Create a new situation type with detection logic. Used when the AI identifies a pattern that should be monitored going forward.",
    inputSchema: {
      name: { type: "string", required: true },
      description: { type: "string", required: true },
      detectionLogic: { type: "object", required: true },
      scopeDepartmentId: { type: "string", required: true },
    },
    sideEffects: ["Creates a new SituationType that the detection engine will monitor"],
  },
  {
    name: "create_system_job",
    description: "Create a System Job — an autonomous work agent that runs on a schedule, performing deep contextual reasoning about an organizational domain. System Jobs analyze cross-system data, identify patterns and anomalies, and propose situations and initiatives based on their findings. Used when the AI identifies a domain that would benefit from periodic deep analysis.",
    inputSchema: {
      title: { type: "string", required: true },
      description: { type: "string", required: true },
      cronExpression: { type: "string", required: true, description: "Cron schedule (e.g., '0 8 * * 1' for Monday 8 AM)" },
      scope: { type: "string", required: false, description: "department | cross_department | personal | company_wide" },
      scopeDepartmentId: { type: "string", required: false, description: "Department entity ID if scope is department" },
    },
    sideEffects: ["Creates a SystemJob with status 'proposed' that requires admin approval before it starts running"],
  },
  {
    name: "request_meeting",
    description: "Request a meeting with company members. Creates meeting request situations for each invitee and waits for all responses before creating calendar events.",
    inputSchema: {
      participantUserIds: { type: "array", required: true, description: "User IDs of meeting participants" },
      suggestedTimes: { type: "array", required: true, description: "Array of { start, end } time slots" },
      agenda: { type: "string", required: true, description: "Meeting agenda" },
      topic: { type: "string", required: true, description: "Meeting topic/title" },
      originContext: { type: "string", required: false, description: "Why this meeting is needed" },
    },
    sideEffects: ["Creates meeting request situations for each invitee", "Creates calendar events when all accept"],
  },
  {
    name: "create_delegation",
    description: "Delegate work to another AI entity or a human user. Used for cross-department coordination or assigning tasks.",
    inputSchema: {
      toAiEntityId: { type: "string", required: false },
      toUserId: { type: "string", required: false },
      instruction: { type: "string", required: true },
      context: { type: "object", required: false },
    },
    sideEffects: ["Creates a Delegation record", "Sends notifications to target"],
  },
];

// ── Bootstrap ───────────────────────────────────────────────────────────────

export async function ensureInternalCapabilities(operatorId: string): Promise<void> {
  for (const cap of INTERNAL_CAPABILITIES) {
    const existing = await prisma.actionCapability.findFirst({
      where: { operatorId, name: cap.name },
    });
    if (!existing) {
      await prisma.actionCapability.create({
        data: {
          operatorId,
          connectorId: null,
          name: cap.name,
          description: cap.description,
          inputSchema: JSON.stringify(cap.inputSchema),
          sideEffects: JSON.stringify(cap.sideEffects),
          enabled: true,
        },
      });
    }
  }
}

// ── Execution ───────────────────────────────────────────────────────────────

export async function executeInternalCapability(
  name: string,
  inputContext: string | null,
  operatorId: string,
  planOwnerAiEntityId?: string,
): Promise<StepOutput> {
  const context = inputContext ? JSON.parse(inputContext) : {};
  const params = context.params ?? context;

  switch (name) {
    case "create_situation_type":
      return executeCreateSituationType(params, operatorId);
    case "create_system_job":
      return executeCreateSystemJob(params, operatorId, planOwnerAiEntityId);
    case "request_meeting": {
      const { handleRequestMeeting } = await import("@/lib/meeting-coordination");
      return handleRequestMeeting(params, operatorId);
    }
    default:
      throw new Error(`Unknown internal capability: ${name}`);
  }
}

async function executeCreateSituationType(
  params: Record<string, unknown>,
  operatorId: string,
): Promise<StepOutput> {
  const name = String(params.name ?? "");
  const description = String(params.description ?? "");
  const detectionLogic = params.detectionLogic ?? {};
  const scopeDepartmentId = String(params.scopeDepartmentId ?? "");

  if (!name || !description) {
    throw new Error("create_situation_type requires name and description");
  }

  // Generate unique slug
  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  let slug = baseSlug;
  let suffix = 0;
  while (true) {
    const existing = await prisma.situationType.findFirst({
      where: { operatorId, slug },
    });
    if (!existing) break;
    suffix++;
    slug = `${baseSlug}-${suffix}`;
  }

  const created = await prisma.situationType.create({
    data: {
      operatorId,
      slug,
      name,
      description,
      detectionLogic: JSON.stringify(detectionLogic),
      scopeEntityId: scopeDepartmentId || null,
      autonomyLevel: "supervised",
    },
  });

  return {
    type: "situation_type",
    situationTypeId: created.id,
    name: created.name,
    detectionLogic: detectionLogic as object,
  };
}

async function executeCreateSystemJob(
  params: Record<string, unknown>,
  operatorId: string,
  planOwnerAiEntityId?: string,
): Promise<StepOutput> {
  const title = String(params.title ?? "");
  const description = String(params.description ?? "");
  const cronExpression = String(params.cronExpression ?? "");

  if (!title || !description || !cronExpression) {
    throw new Error("create_system_job requires title, description, and cronExpression");
  }

  // Validate cron expression
  const { CronExpressionParser } = await import("cron-parser");
  CronExpressionParser.parse(cronExpression); // throws on invalid

  const scope = params.scope ? String(params.scope) : "company_wide";
  const domainPageSlug = params.domainPageSlug ? String(params.domainPageSlug) : null;

  // Dedup check
  const existing = await prisma.systemJob.findFirst({
    where: {
      operatorId,
      title: { contains: title, mode: "insensitive" },
      status: { notIn: ["deactivated"] },
    },
  });
  if (existing) {
    return {
      type: "data",
      payload: { systemJobId: existing.id, title: existing.title, alreadyExists: true },
      description: `System Job already exists: ${existing.title}`,
    };
  }

  // Compute next trigger
  const now = new Date();
  const interval = CronExpressionParser.parse(cronExpression, { currentDate: now });
  const nextTriggerAt = interval.next().toDate();

  // Create wiki page for the job
  const slug = `system-job-${Date.now()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
  await prisma.knowledgePage.create({
    data: {
      operatorId,
      slug,
      title: `System Job: ${title}`,
      pageType: "system_job",
      scope: "operator",
      status: "verified",
      content: buildSystemJobWikiContent({ description, cronExpression, scope, domainPageSlug }),
      crossReferences: domainPageSlug ? [domainPageSlug] : [],
      synthesisPath: "manual",
      synthesizedByModel: "manual",
      confidence: 1.0,
      contentTokens: 0,
      lastSynthesizedAt: now,
    },
  });

  const systemJob = await prisma.systemJob.create({
    data: {
      operatorId,
      title,
      description,
      cronExpression,
      scope,
      wikiPageSlug: slug,
      domainPageSlug,
      status: "proposed",
      source: "initiative",
      nextTriggerAt,
    },
  });

  // Notify admins
  const { sendNotificationToAdmins } = await import("@/lib/notification-dispatch");
  sendNotificationToAdmins({
    operatorId,
    type: "system_alert",
    title: `System Job proposed: ${title}`,
    body: `A new System Job has been proposed via initiative. ${description.slice(0, 150)}`,
    sourceType: "system_job",
    sourceId: systemJob.id,
  }).catch(() => {});

  return {
    type: "data",
    payload: {
      systemJobId: systemJob.id,
      title: systemJob.title,
      status: "proposed",
      cronExpression: systemJob.cronExpression,
      nextTriggerAt: systemJob.nextTriggerAt?.toISOString() ?? null,
    },
    description: `System Job proposed: ${title}. Requires admin approval to activate.`,
  };
}
