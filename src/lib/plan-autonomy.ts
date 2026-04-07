import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import type { StepDefinition } from "@/lib/execution-engine";

const GRADUATION_THRESHOLD = 20;

// ── Pattern Hash ─────────────────────────────────────────────────────────────

export function computePlanPatternHash(
  steps: Array<{ title: string; executionMode: string }>,
): string {
  const pattern = steps.map(s => `${s.title}:${s.executionMode}`).join("|");
  return createHash("sha256").update(pattern).digest("hex");
}

// ── Record Completion ────────────────────────────────────────────────────────

export async function recordPlanCompletion(plan: {
  id: string;
  operatorId: string;
  sourceType: string;
  sourceId: string;
}): Promise<void> {
  const steps = await prisma.executionStep.findMany({
    where: { planId: plan.id },
    orderBy: { sequenceOrder: "asc" },
    select: { title: true, executionMode: true },
  });
  if (steps.length === 0) return;

  const hash = computePlanPatternHash(steps);
  const aiEntityId = await resolveAiEntityId(plan);
  if (!aiEntityId) return;

  const record = await prisma.planAutonomy.upsert({
    where: {
      aiEntityId_planPatternHash: {
        aiEntityId,
        planPatternHash: hash,
      },
    },
    create: {
      operatorId: plan.operatorId,
      aiEntityId,
      planPatternHash: hash,
      consecutiveApprovals: 1,
      autoApproved: false,
    },
    update: {
      consecutiveApprovals: { increment: 1 },
    },
  });

  // Check graduation
  if (record.consecutiveApprovals >= GRADUATION_THRESHOLD && !record.autoApproved) {
    await prisma.planAutonomy.update({
      where: { id: record.id },
      data: { autoApproved: true },
    });
    await sendNotificationToAdmins({
      operatorId: plan.operatorId,
      type: "plan_auto_executed",
      title: "Plan pattern graduated to auto-execution",
      body: `Plan pattern graduated to auto-execution: ${steps[0].title} + ${steps.length - 1} more steps. This pattern has been approved ${record.consecutiveApprovals} times consecutively.`,
      sourceType: "execution",
      sourceId: plan.id,
    });
  }
}

// ── Record Rejection ─────────────────────────────────────────────────────────

export async function recordPlanRejection(plan: {
  id: string;
  operatorId: string;
  sourceType: string;
  sourceId: string;
}): Promise<void> {
  const steps = await prisma.executionStep.findMany({
    where: { planId: plan.id },
    orderBy: { sequenceOrder: "asc" },
    select: { title: true, executionMode: true },
  });
  if (steps.length === 0) return;

  const hash = computePlanPatternHash(steps);
  const aiEntityId = await resolveAiEntityId(plan);
  if (!aiEntityId) return;

  await prisma.planAutonomy.updateMany({
    where: { aiEntityId, planPatternHash: hash },
    data: { consecutiveApprovals: 0, autoApproved: false },
  });

  console.log(`[plan-autonomy] Plan pattern rejected for AI entity ${aiEntityId}, hash ${hash.slice(0, 8)}...`);
}

// ── Should Auto-Approve ──────────────────────────────────────────────────────

export async function shouldAutoApprovePlan(
  aiEntityId: string,
  steps: StepDefinition[],
): Promise<boolean> {
  const hash = computePlanPatternHash(steps);
  const record = await prisma.planAutonomy.findUnique({
    where: {
      aiEntityId_planPatternHash: {
        aiEntityId,
        planPatternHash: hash,
      },
    },
  });
  return record?.autoApproved === true;
}

// ── AI Entity Resolution ─────────────────────────────────────────────────────

async function resolveAiEntityId(plan: {
  sourceType: string;
  sourceId: string;
}): Promise<string | null> {
  switch (plan.sourceType) {
    case "situation": {
      const situation = await prisma.situation.findUnique({
        where: { id: plan.sourceId },
        select: { triggerEntityId: true, operatorId: true },
      });
      if (!situation?.triggerEntityId) return null;
      const entity = await prisma.entity.findUnique({
        where: { id: situation.triggerEntityId },
        select: { primaryDomainId: true },
      });
      if (!entity?.primaryDomainId) return null;
      const deptAi = await prisma.entity.findFirst({
        where: { ownerDomainId: entity.primaryDomainId, operatorId: situation.operatorId, status: "active" },
        select: { id: true },
      });
      return deptAi?.id ?? null;
    }
    case "initiative": {
      const initiative = await prisma.initiative.findUnique({
        where: { id: plan.sourceId },
        select: { aiEntityId: true },
      });
      return initiative?.aiEntityId ?? null;
    }
    case "recurring": {
      const task = await prisma.recurringTask.findUnique({
        where: { id: plan.sourceId },
        select: { aiEntityId: true },
      });
      return task?.aiEntityId ?? null;
    }
    case "delegation": {
      const delegation = await prisma.delegation.findUnique({
        where: { id: plan.sourceId },
        select: { toAiEntityId: true },
      });
      return delegation?.toAiEntityId ?? null;
    }
    default:
      return null;
  }
}
