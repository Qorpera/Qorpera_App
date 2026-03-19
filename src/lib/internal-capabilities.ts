import { prisma } from "@/lib/db";
import type { StepOutput } from "@/lib/execution-engine";

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
    name: "create_goal",
    description: "Create a new organizational goal. Used when strategic analysis identifies a new objective.",
    inputSchema: {
      title: { type: "string", required: true },
      description: { type: "string", required: true },
      departmentId: { type: "string", required: false },
      measurableTarget: { type: "string", required: false },
      priority: { type: "number", required: false },
      deadline: { type: "string", required: false },
    },
    sideEffects: ["Creates a new Goal"],
  },
  {
    name: "update_goal",
    description: "Update an existing goal's status or details. Used when a goal is achieved or needs adjustment.",
    inputSchema: {
      goalId: { type: "string", required: true },
      status: { type: "string", required: false },
      title: { type: "string", required: false },
      description: { type: "string", required: false },
      measurableTarget: { type: "string", required: false },
      priority: { type: "number", required: false },
    },
    sideEffects: ["Updates an existing Goal"],
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
): Promise<StepOutput> {
  const context = inputContext ? JSON.parse(inputContext) : {};
  const params = context.params ?? context;

  switch (name) {
    case "create_situation_type":
      return executeCreateSituationType(params, operatorId);
    case "create_goal":
      return executeCreateGoal(params, operatorId);
    case "update_goal":
      return executeUpdateGoal(params, operatorId);
    case "create_delegation":
      return executeCreateDelegation(params, operatorId);
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

async function executeCreateGoal(
  params: Record<string, unknown>,
  operatorId: string,
): Promise<StepOutput> {
  const title = String(params.title ?? "");
  const description = String(params.description ?? "");

  if (!title || !description) {
    throw new Error("create_goal requires title and description");
  }

  const created = await prisma.goal.create({
    data: {
      operatorId,
      title,
      description,
      departmentId: params.departmentId ? String(params.departmentId) : null,
      measurableTarget: params.measurableTarget ? String(params.measurableTarget) : null,
      priority: typeof params.priority === "number" ? params.priority : 3,
      deadline: params.deadline ? new Date(String(params.deadline)) : null,
    },
  });

  return { type: "data", payload: { goalId: created.id, title }, description: "Goal created" };
}

async function executeUpdateGoal(
  params: Record<string, unknown>,
  operatorId: string,
): Promise<StepOutput> {
  const goalId = String(params.goalId ?? "");
  if (!goalId) throw new Error("update_goal requires goalId");

  const goal = await prisma.goal.findFirst({
    where: { id: goalId, operatorId },
  });
  if (!goal) throw new Error(`Goal ${goalId} not found for this operator`);

  const updates: Record<string, unknown> = {};
  if (params.status !== undefined) updates.status = String(params.status);
  if (params.title !== undefined) updates.title = String(params.title);
  if (params.description !== undefined) updates.description = String(params.description);
  if (params.measurableTarget !== undefined) updates.measurableTarget = String(params.measurableTarget);
  if (params.priority !== undefined) updates.priority = Number(params.priority);

  await prisma.goal.update({
    where: { id: goalId },
    data: updates,
  });

  return { type: "data", payload: { goalId, updated: true }, description: "Goal updated" };
}

async function executeCreateDelegation(
  params: Record<string, unknown>,
  operatorId: string,
): Promise<StepOutput> {
  const instruction = String(params.instruction ?? "");
  if (!instruction) throw new Error("create_delegation requires instruction");

  const toAiEntityId = params.toAiEntityId ? String(params.toAiEntityId) : undefined;
  const toUserId = params.toUserId ? String(params.toUserId) : undefined;
  const context = (params.context ?? {}) as Record<string, unknown>;

  // Resolve fromAiEntityId: find the AI entity executing this plan
  // The caller (execution-engine) passes operatorId; we need the department AI or HQ AI.
  // Look for the execution plan that contains this step to find the source AI entity.
  // For now, find the first active department-ai or hq-ai for the operator.
  let fromAiEntityId: string | null = null;

  if (params.fromAiEntityId) {
    fromAiEntityId = String(params.fromAiEntityId);
  } else {
    const aiEntity = await prisma.entity.findFirst({
      where: {
        operatorId,
        entityType: { slug: { in: ["department-ai", "hq-ai"] } },
        status: "active",
      },
      select: { id: true },
    });
    fromAiEntityId = aiEntity?.id ?? null;
  }

  if (!fromAiEntityId) throw new Error("No AI entity found to send delegation from");

  const { createDelegation } = await import("@/lib/delegations");
  const delegation = await createDelegation({
    operatorId,
    fromAiEntityId,
    toAiEntityId,
    toUserId,
    instruction,
    context,
  });

  return {
    type: "delegation",
    delegationId: delegation.id,
    targetType: toUserId ? "human" : "ai",
    targetId: toUserId ?? toAiEntityId ?? "",
  };
}
