import { prisma } from "@/lib/db";
import { sendNotification, sendNotificationToAdmins } from "@/lib/notification-dispatch";

// ── Types ────────────────────────────────────────────────────────────────────

interface CreateDelegationParams {
  operatorId: string;
  fromAiEntityId: string;
  toAiEntityId?: string;
  toUserId?: string;
  instruction: string;
  context: Record<string, unknown>;
  workStreamId?: string;
  situationId?: string;
  initiativeId?: string;
}

// ── Create Delegation ────────────────────────────────────────────────────────

export async function createDelegation(params: CreateDelegationParams) {
  // Exactly one target required
  if ((!params.toAiEntityId && !params.toUserId) || (params.toAiEntityId && params.toUserId)) {
    throw new Error("Exactly one of toAiEntityId or toUserId must be provided");
  }

  // Validate fromAiEntityId
  const fromEntity = await prisma.entity.findFirst({
    where: { id: params.fromAiEntityId, operatorId: params.operatorId, status: "active" },
    select: { id: true, parentDepartmentId: true },
  });
  if (!fromEntity) throw new Error("fromAiEntityId not found or wrong operator");

  // Validate target
  if (params.toAiEntityId) {
    const toEntity = await prisma.entity.findFirst({
      where: { id: params.toAiEntityId, operatorId: params.operatorId, status: "active" },
      select: { id: true },
    });
    if (!toEntity) throw new Error("toAiEntityId not found or wrong operator");
  }
  if (params.toUserId) {
    const toUser = await prisma.user.findFirst({
      where: { id: params.toUserId, operatorId: params.operatorId },
      select: { id: true },
    });
    if (!toUser) throw new Error("toUserId not found or wrong operator");
  }

  // Validate optional refs
  if (params.workStreamId) {
    const ws = await prisma.workStream.findFirst({
      where: { id: params.workStreamId, operatorId: params.operatorId },
      select: { id: true },
    });
    if (!ws) throw new Error("workStreamId not found or wrong operator");
  }
  if (params.situationId) {
    const sit = await prisma.situation.findFirst({
      where: { id: params.situationId, operatorId: params.operatorId },
      select: { id: true },
    });
    if (!sit) throw new Error("situationId not found or wrong operator");
  }
  if (params.initiativeId) {
    const init = await prisma.initiative.findFirst({
      where: { id: params.initiativeId, operatorId: params.operatorId },
      select: { id: true },
    });
    if (!init) throw new Error("initiativeId not found or wrong operator");
  }

  // Status: AI→Human = accepted, AI→AI = pending
  const status = params.toUserId ? "accepted" : "pending";

  const delegation = await prisma.delegation.create({
    data: {
      operatorId: params.operatorId,
      fromAiEntityId: params.fromAiEntityId,
      toAiEntityId: params.toAiEntityId ?? null,
      toUserId: params.toUserId ?? null,
      instruction: params.instruction,
      context: JSON.stringify(params.context),
      workStreamId: params.workStreamId ?? null,
      situationId: params.situationId ?? null,
      initiativeId: params.initiativeId ?? null,
      status,
    },
  });

  // Notifications
  if (params.toUserId) {
    sendNotification({
      operatorId: params.operatorId,
      userId: params.toUserId,
      type: "delegation_received",
      title: `Task delegated: ${params.instruction.slice(0, 80)}`,
      body: params.instruction,
      sourceType: "delegation",
      sourceId: delegation.id,
    }).catch(console.error);
  } else {
    sendNotificationToAdmins({
      operatorId: params.operatorId,
      type: "delegation_received",
      title: `AI delegation requires approval`,
      body: `AI-to-AI delegation: ${params.instruction.slice(0, 200)}`,
      sourceType: "delegation",
      sourceId: delegation.id,
    }).catch(console.error);
  }

  return delegation;
}

// ── Approve Delegation ───────────────────────────────────────────────────────

export async function approveDelegation(
  delegationId: string,
  approvingUserId: string,
  operatorId: string,
): Promise<void> {
  const delegation = await prisma.delegation.findFirst({
    where: { id: delegationId, operatorId },
  });
  if (!delegation) throw new Error("Delegation not found");
  if (delegation.status !== "pending") throw new Error("Delegation is not pending");
  if (!delegation.toAiEntityId) throw new Error("Only AI-to-AI delegations need approval");

  await prisma.delegation.update({
    where: { id: delegationId },
    data: { status: "accepted" },
  });

  // Determine target type: department-ai or personal ai-agent
  const targetEntity = await prisma.entity.findUnique({
    where: { id: delegation.toAiEntityId },
    include: { entityType: { select: { slug: true } } },
  });

  if (targetEntity?.entityType.slug === "department-ai") {
    // Department AI — will be picked up in next evaluateDepartmentGoals cycle
    sendNotificationToAdmins({
      operatorId: delegation.operatorId,
      type: "system_alert",
      title: "Delegation accepted",
      body: "Delegation accepted. Will be processed in next department AI reasoning cycle.",
      sourceType: "delegation",
      sourceId: delegationId,
    }).catch(console.error);
  } else {
    // Personal AI agent — create a situation from the delegation
    await createSituationFromDelegation(delegation);
  }
}

// ── Create Situation from Delegation ─────────────────────────────────────────

async function createSituationFromDelegation(delegation: {
  id: string;
  operatorId: string;
  fromAiEntityId: string;
  toAiEntityId: string | null;
  instruction: string;
  context: string | null;
}): Promise<void> {
  const situationTypeId = await ensureDelegationSituationType(delegation.operatorId);

  // Determine triggerEntityId: use the Entity linked to the target AI's owner user
  let triggerEntityId = delegation.fromAiEntityId;
  if (delegation.toAiEntityId) {
    const targetAi = await prisma.entity.findUnique({
      where: { id: delegation.toAiEntityId },
      select: { ownerUserId: true },
    });
    if (targetAi?.ownerUserId) {
      const userEntity = await prisma.user.findUnique({
        where: { id: targetAi.ownerUserId },
        select: { entityId: true },
      });
      if (userEntity?.entityId) {
        triggerEntityId = userEntity.entityId;
      }
    }
  }

  const situation = await prisma.situation.create({
    data: {
      operatorId: delegation.operatorId,
      situationTypeId,
      delegationId: delegation.id,
      status: "detected",
      severity: 0.5,
      confidence: 1.0,
      source: "manual",
      triggerEntityId,
      contextSnapshot: JSON.stringify({
        delegationInstruction: delegation.instruction,
        delegationContext: delegation.context ? JSON.parse(delegation.context) : null,
        fromAiEntityId: delegation.fromAiEntityId,
      }),
    },
  });

  // Notify admins about the new delegation-sourced situation
  sendNotificationToAdmins({
    operatorId: delegation.operatorId,
    type: "situation_proposed",
    title: `Delegation task created: ${delegation.instruction.slice(0, 80)}`,
    body: delegation.instruction,
    sourceType: "situation",
    sourceId: situation.id,
  }).catch(console.error);
}

// ── Ensure Delegation SituationType ──────────────────────────────────────────

async function ensureDelegationSituationType(operatorId: string): Promise<string> {
  const existing = await prisma.situationType.findFirst({
    where: { operatorId, slug: "delegation-task" },
    select: { id: true },
  });
  if (existing) return existing.id;

  try {
    const created = await prisma.situationType.create({
      data: {
        operatorId,
        slug: "delegation-task",
        name: "Delegation Task",
        description: "Work delegated from another AI entity",
        detectionLogic: JSON.stringify({ mode: "manual" }),
        autonomyLevel: "supervised",
      },
    });
    return created.id;
  } catch {
    // Concurrent creation — re-query
    const retried = await prisma.situationType.findFirst({
      where: { operatorId, slug: "delegation-task" },
      select: { id: true },
    });
    if (retried) return retried.id;
    throw new Error("Failed to create delegation-task SituationType");
  }
}

// ── Complete Delegation ──────────────────────────────────────────────────────

export async function completeDelegation(
  delegationId: string,
  userId: string,
  notes: string,
  operatorId?: string,
): Promise<void> {
  const delegation = operatorId
    ? await prisma.delegation.findFirst({ where: { id: delegationId, operatorId } })
    : await prisma.delegation.findUnique({ where: { id: delegationId } });
  if (!delegation) throw new Error("Delegation not found");
  if (delegation.status !== "accepted") throw new Error("Delegation is not accepted");

  await prisma.delegation.update({
    where: { id: delegationId },
    data: {
      status: "completed",
      completedNotes: notes,
      completedAt: new Date(),
    },
  });

  // If linked to a human_task execution step, complete it
  // Note: executionStepId is not in the Delegation model currently,
  // but delegations linked to steps can be tracked via the situation/initiative link.
  // For direct step linkage, the caller provides the stepId.

  // Notify admins of the sender's department
  const fromEntity = await prisma.entity.findUnique({
    where: { id: delegation.fromAiEntityId },
    select: { parentDepartmentId: true, displayName: true },
  });

  sendNotificationToAdmins({
    operatorId: delegation.operatorId,
    type: "system_alert",
    title: "Delegation completed",
    body: `Delegation from ${fromEntity?.displayName ?? "AI"} completed by user ${userId}: ${notes.slice(0, 200)}`,
    sourceType: "delegation",
    sourceId: delegationId,
  }).catch(console.error);
}

// ── Return Delegation ────────────────────────────────────────────────────────

export async function returnDelegation(
  delegationId: string,
  userId: string,
  reason: string,
  operatorId?: string,
): Promise<void> {
  const delegation = operatorId
    ? await prisma.delegation.findFirst({ where: { id: delegationId, operatorId } })
    : await prisma.delegation.findUnique({ where: { id: delegationId } });
  if (!delegation) throw new Error("Delegation not found");
  if (delegation.status !== "pending" && delegation.status !== "accepted") {
    throw new Error("Delegation cannot be returned from current status");
  }

  await prisma.delegation.update({
    where: { id: delegationId },
    data: {
      status: "returned",
      returnReason: reason,
    },
  });

  // Notify admins of the sender's department
  const fromEntity = await prisma.entity.findUnique({
    where: { id: delegation.fromAiEntityId },
    select: { displayName: true },
  });

  sendNotificationToAdmins({
    operatorId: delegation.operatorId,
    type: "system_alert",
    title: "Delegation returned",
    body: `Delegation from ${fromEntity?.displayName ?? "AI"} returned by user ${userId}: ${reason.slice(0, 200)}`,
    sourceType: "delegation",
    sourceId: delegationId,
  }).catch(console.error);
}
