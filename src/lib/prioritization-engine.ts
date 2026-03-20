import { prisma } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────────────────────

export type PriorityBreakdown = {
  urgency: number;
  impact: number;
  dependencies: number;
  staleness: number;
};

type ScoredPlan = {
  score: number;
  breakdown: PriorityBreakdown;
};

// ── Urgency mapping ──────────────────────────────────────────────────────────

const URGENCY_MAP: Record<string, number> = {
  low: 10,
  medium: 30,
  high: 60,
  critical: 90,
};

// ── Compute all open plans for an operator ───────────────────────────────────

export async function computePriorityScores(
  operatorId: string,
): Promise<{ updated: number }> {
  const plans = await prisma.executionPlan.findMany({
    where: {
      operatorId,
      status: { in: ["pending", "approved", "executing"] },
    },
    select: { id: true },
  });

  let updated = 0;
  for (const plan of plans) {
    try {
      await computeAndSave(plan.id);
      updated++;
    } catch (err) {
      console.error(`Priority scoring failed for plan ${plan.id}:`, err);
    }
  }

  return { updated };
}

// ── Compute single plan priority ─────────────────────────────────────────────

export async function computeSinglePlanPriority(
  planId: string,
): Promise<number> {
  const result = await computeAndSave(planId);
  return result.score;
}

// ── Compute with breakdown (for GET endpoint) ────────────────────────────────

export async function computePlanPriorityWithBreakdown(
  planId: string,
): Promise<ScoredPlan> {
  return computeScoreInternal(planId);
}

// ── Internal: compute + persist ──────────────────────────────────────────────

async function computeAndSave(planId: string): Promise<ScoredPlan> {
  const result = await computeScoreInternal(planId);
  await prisma.executionPlan.update({
    where: { id: planId },
    data: { priorityScore: result.score },
  });
  return result;
}

// ── Core scoring logic ───────────────────────────────────────────────────────

async function computeScoreInternal(planId: string): Promise<ScoredPlan> {
  const plan = await prisma.executionPlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      operatorId: true,
      sourceType: true,
      sourceId: true,
      status: true,
      currentStepOrder: true,
      createdAt: true,
      priorityOverride: true,
      steps: { select: { id: true }, orderBy: { sequenceOrder: "asc" } },
    },
  });

  if (!plan) throw new Error(`Plan not found: ${planId}`);

  // ── Human overrides (special handling) ──────────────────────────────────
  if (plan.priorityOverride) {
    const override = plan.priorityOverride;
    if (override.overrideType === "pin") {
      return { score: 100, breakdown: { urgency: 0, impact: 0, dependencies: 0, staleness: 0 } };
    }
    if (override.overrideType === "snooze") {
      if (override.snoozeUntil && override.snoozeUntil > new Date()) {
        return { score: 0, breakdown: { urgency: 0, impact: 0, dependencies: 0, staleness: 0 } };
      }
      // Snooze expired — delete override and compute normally
      await prisma.priorityOverride.delete({ where: { id: override.id } });
    }
  }

  // ── Load source data once ────────────────────────────────────────────
  let sourceSituation: { triggerEntityId: string | null; spawningStepId: string | null; situationType: { slug: string; detectionLogic: string } } | null = null;
  let sourceInitiative: { goal: { priority: number } } | null = null;

  if (plan.sourceType === "situation") {
    sourceSituation = await prisma.situation.findFirst({
      where: { executionPlanId: plan.id },
      select: {
        triggerEntityId: true,
        spawningStepId: true,
        situationType: { select: { slug: true, detectionLogic: true } },
      },
    });
  } else if (plan.sourceType === "initiative") {
    sourceInitiative = await prisma.initiative.findFirst({
      where: { executionPlanId: plan.id },
      select: { goal: { select: { priority: true } } },
    });
  }

  // ── Urgency (weight: 0.30) ──────────────────────────────────────────────
  let urgency = 20; // default
  if (sourceSituation) {
    try {
      const detection = JSON.parse(sourceSituation.situationType.detectionLogic);
      if (detection.urgency && URGENCY_MAP[detection.urgency]) {
        urgency = URGENCY_MAP[detection.urgency];
      }
    } catch { /* detectionLogic parse error — use default */ }
  }

  // FollowUp urgency boost
  const stepIds = plan.steps.map((s) => s.id);
  if (stepIds.length > 0) {
    const watchingFollowUps = await prisma.followUp.findMany({
      where: {
        executionStepId: { in: stepIds },
        status: "watching",
        triggerAt: { not: null },
      },
      select: { triggerAt: true },
    });
    if (watchingFollowUps.length > 0) {
      const now = Date.now();
      let earliestDays = Infinity;
      for (const fu of watchingFollowUps) {
        const daysRemaining = (fu.triggerAt!.getTime() - now) / (1000 * 60 * 60 * 24);
        if (daysRemaining < earliestDays) earliestDays = daysRemaining;
      }
      const urgencyBoost = Math.min(40, 80 * Math.exp(-earliestDays / 2));
      urgency += urgencyBoost;
    }
  }
  urgency = Math.min(100, urgency);

  // ── Impact (weight: 0.30) ──────────────────────────────────────────────
  let impact = 30; // default
  if (sourceSituation?.triggerEntityId) {
    const propertyValues = await prisma.propertyValue.findMany({
      where: { entityId: sourceSituation.triggerEntityId },
      select: {
        value: true,
        property: { select: { slug: true, name: true } },
      },
    });
    const monetaryKeys = ["amount", "value", "revenue", "cost", "price", "salary"];
    for (const pv of propertyValues) {
      const keyLower = (pv.property.slug || pv.property.name).toLowerCase();
      if (monetaryKeys.some((mk) => keyLower.includes(mk))) {
        const numVal = parseFloat(pv.value);
        if (isFinite(numVal) && numVal > 0) {
          impact = Math.min(100, 20 * Math.log10(numVal + 1));
          break;
        }
      }
    }
  } else if (sourceInitiative?.goal) {
    impact = sourceInitiative.goal.priority * 20;
  }

  // ── Dependencies (weight: 0.20) ────────────────────────────────────────
  let dependencies = 20; // default for no workstream, single-step
  if (plan.sourceType === "situation" || plan.sourceType === "initiative") {
    const workStreamItems = await prisma.workStreamItem.findMany({
      where: { itemType: plan.sourceType, itemId: plan.sourceId },
      select: { workStreamId: true },
    });
    if (workStreamItems.length > 0) {
      // Count other non-terminal items in same workstream(s)
      const wsIds = workStreamItems.map((w) => w.workStreamId);
      const siblingItems = await prisma.workStreamItem.findMany({
        where: {
          workStreamId: { in: wsIds },
          NOT: { itemType: plan.sourceType, itemId: plan.sourceId },
        },
        select: { itemType: true, itemId: true },
      });

      // Check how many siblings are still active (non-terminal)
      let blockedCount = 0;
      for (const item of siblingItems) {
        if (item.itemType === "situation") {
          const sit = await prisma.situation.findUnique({
            where: { id: item.itemId },
            select: { status: true },
          });
          if (sit && !["resolved", "closed"].includes(sit.status)) {
            blockedCount++;
          }
        } else if (item.itemType === "initiative") {
          const init = await prisma.initiative.findUnique({
            where: { id: item.itemId },
            select: { status: true },
          });
          if (init && !["completed", "rejected", "failed"].includes(init.status)) {
            blockedCount++;
          }
        }
      }

      if (blockedCount > 0) {
        dependencies = Math.min(100, 30 + blockedCount * 15);
      }
    }
  }

  // Gateway step bonus
  if (plan.currentStepOrder === 1 && plan.steps.length > 1) {
    dependencies += 10;
  }
  dependencies = Math.min(100, dependencies);

  // ── Staleness (weight: 0.15 + 0.05 placeholder) ────────────────────────
  const daysSinceCreation = (Date.now() - plan.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  let staleness = Math.min(100, daysSinceCreation * 5);

  // Pending > 3 days boost
  if (plan.status === "pending" && daysSinceCreation > 3) {
    staleness += 20;
  }
  staleness = Math.min(100, staleness);

  // ── Final score ─────────────────────────────────────────────────────────
  let score = Math.round(
    urgency * 0.30 +
    impact * 0.30 +
    dependencies * 0.20 +
    staleness * 0.15 +
    staleness * 0.05, // placeholder for future signals
  );

  // ── Spawned situation priority inheritance ──────────────────────────────
  if (sourceSituation?.spawningStepId) {
    const spawningStep = await prisma.executionStep.findUnique({
      where: { id: sourceSituation.spawningStepId },
      select: { plan: { select: { priorityScore: true } } },
    });
    const parentScore = spawningStep?.plan?.priorityScore ?? 0;

    if (sourceSituation.situationType.slug === "meeting_request") {
      score = Math.max(score, parentScore, 75);
    } else {
      score = Math.max(score, parentScore);
    }
  }

  return {
    score,
    breakdown: {
      urgency: Math.round(urgency * 100) / 100,
      impact: Math.round(impact * 100) / 100,
      dependencies: Math.round(dependencies * 100) / 100,
      staleness: Math.round(staleness * 100) / 100,
    },
  };
}
