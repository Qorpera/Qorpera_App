import { prisma } from "@/lib/db";
import { sendNotification, sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { isWithinOneBusinessDay } from "@/lib/business-days";
import { advanceStep, createExecutionPlan } from "@/lib/execution-engine";
import type { StepDefinition } from "@/lib/execution-engine";

// ── Types ────────────────────────────────────────────────────────────────────

type TimeoutCondition = {
  type: "timeout";
  businessDays: number;
};

type ResponseReceivedCondition = {
  type: "response_received";
  watchedEntityId: string;
  afterTimestamp: string;
};

type PropertyChangeCondition = {
  type: "property_change";
  entityId: string;
  propertyName: string;
  expectedValue: unknown;
};

type TriggerCondition = TimeoutCondition | ResponseReceivedCondition | PropertyChangeCondition;

type EscalateAction = { type: "escalate"; targetUserId: string };
type NotifyAction = { type: "notify"; targetUserId: string };
type SkipStepAction = { type: "skip_step" };
type CreatePlanAction = { type: "create_plan"; steps: StepDefinition[] };
type FallbackAction = EscalateAction | NotifyAction | SkipStepAction | CreatePlanAction;

type ProcessResult = {
  processed: number;
  triggered: number;
  reminders: number;
  errors: number;
};

// ── Main Processor ───────────────────────────────────────────────────────────

export async function processFollowUps(): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, triggered: 0, reminders: 0, errors: 0 };

  const followUps = await prisma.followUp.findMany({
    where: { status: "watching" },
    include: {
      executionStep: {
        include: { plan: true },
      },
    },
  });

  for (const followUp of followUps) {
    result.processed++;
    try {
      const condition = JSON.parse(followUp.triggerCondition) as TriggerCondition;

      switch (condition.type) {
        case "timeout":
          await processTimeout(followUp, result);
          break;
        case "response_received":
          await processResponseReceived(followUp, condition, result);
          break;
        case "property_change":
          await processPropertyChange(followUp, condition, result);
          break;
      }
    } catch (err) {
      result.errors++;
      console.error(`[follow-up-scheduler] Error processing FollowUp ${followUp.id}:`, err);
    }
  }

  return result;
}

// ── Timeout ──────────────────────────────────────────────────────────────────

async function processTimeout(
  followUp: FollowUpWithStep,
  result: ProcessResult,
): Promise<void> {
  const now = new Date();

  if (followUp.triggerAt && followUp.triggerAt <= now) {
    // Deadline passed — trigger fallback
    await prisma.followUp.update({
      where: { id: followUp.id },
      data: { status: "triggered", triggeredAt: now },
    });
    await executeFallbackAction(followUp);
    result.triggered++;
    return;
  }

  // Reminder check: within 1 business day and not yet reminded
  if (
    !followUp.reminderSent &&
    followUp.triggerAt &&
    isWithinOneBusinessDay(followUp.triggerAt, now)
  ) {
    const assignedUserId = followUp.executionStep.assignedUserId;
    if (assignedUserId) {
      await sendNotification({
        operatorId: followUp.executionStep.plan.operatorId,
        userId: assignedUserId,
        type: "follow_up_reminder",
        title: "Task deadline approaching",
        body: `Task deadline approaching: ${followUp.executionStep.title}. Due in 1 business day.`,
        sourceType: "execution",
        sourceId: followUp.executionStep.planId,
        linkUrl: "/situations",
      });
    }
    await prisma.followUp.update({
      where: { id: followUp.id },
      data: { reminderSent: true },
    });
    result.reminders++;
  }
}

// ── Response Received ────────────────────────────────────────────────────────

async function processResponseReceived(
  followUp: FollowUpWithStep,
  condition: ResponseReceivedCondition,
  result: ProcessResult,
): Promise<void> {
  const signals = await prisma.activitySignal.findFirst({
    where: {
      operatorId: followUp.executionStep.plan.operatorId,
      actorEntityId: condition.watchedEntityId,
      occurredAt: { gt: new Date(condition.afterTimestamp) },
    },
  });

  if (signals) {
    // Response received — condition satisfied, no fallback needed
    await prisma.followUp.update({
      where: { id: followUp.id },
      data: { status: "cancelled", triggeredAt: new Date() },
    });
    result.triggered++;
  }
  // else: continue watching
}

// ── Property Change ──────────────────────────────────────────────────────────

async function processPropertyChange(
  followUp: FollowUpWithStep,
  condition: PropertyChangeCondition,
  result: ProcessResult,
): Promise<void> {
  // Find the property by slug for the entity's type
  const entity = await prisma.entity.findUnique({
    where: { id: condition.entityId },
    select: { entityTypeId: true },
  });
  if (!entity) return;

  const propValue = await prisma.propertyValue.findFirst({
    where: {
      entityId: condition.entityId,
      property: {
        entityTypeId: entity.entityTypeId,
        slug: condition.propertyName,
      },
    },
    select: { value: true },
  });

  if (propValue && propValue.value === String(condition.expectedValue)) {
    await prisma.followUp.update({
      where: { id: followUp.id },
      data: { status: "triggered", triggeredAt: new Date() },
    });
    await executeFallbackAction(followUp);
    result.triggered++;
  }
  // else: continue watching
}

// ── Fallback Execution ───────────────────────────────────────────────────────

async function executeFallbackAction(followUp: FollowUpWithStep): Promise<void> {
  try {
    const action = JSON.parse(followUp.fallbackAction) as FallbackAction;
    const operatorId = followUp.executionStep.plan.operatorId;

    switch (action.type) {
      case "escalate": {
        await sendNotification({
          operatorId,
          userId: action.targetUserId,
          type: "follow_up_triggered",
          title: "Follow-up triggered",
          body: `Follow-up triggered: ${followUp.executionStep.description}. Escalated for action.`,
          sourceType: "execution",
          sourceId: followUp.executionStep.planId,
        });
        // Reassign step if still executing
        if (followUp.executionStep.status === "executing") {
          await prisma.executionStep.update({
            where: { id: followUp.executionStepId },
            data: { assignedUserId: action.targetUserId },
          });
        }
        break;
      }
      case "notify": {
        await sendNotification({
          operatorId,
          userId: action.targetUserId,
          type: "follow_up_triggered",
          title: "Follow-up triggered",
          body: `Follow-up triggered: ${followUp.executionStep.description}. Review required.`,
          sourceType: "execution",
          sourceId: followUp.executionStep.planId,
        });
        break;
      }
      case "skip_step": {
        // Find a system admin user ID for the advance operation
        const admin = await prisma.user.findFirst({
          where: { operatorId, role: { in: ["superadmin", "admin"] } },
          select: { id: true },
        });
        if (admin) {
          await advanceStep(followUp.executionStepId, "skip", admin.id);
        }
        break;
      }
      case "create_plan": {
        await createExecutionPlan(
          operatorId,
          "situation",
          followUp.situationId ?? followUp.executionStep.plan.sourceId,
          action.steps,
        );
        break;
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[follow-up-scheduler] Fallback execution failed for FollowUp ${followUp.id}:`, errorMsg);
    await sendNotificationToAdmins({
      operatorId: followUp.executionStep.plan.operatorId,
      type: "system_alert",
      title: "Follow-up fallback failed",
      body: `Fallback action failed for step "${followUp.executionStep.title}": ${errorMsg}`,
      sourceType: "execution",
      sourceId: followUp.executionStep.planId,
    });
  }
}

// ── Helper Types ─────────────────────────────────────────────────────────────

type FollowUpWithStep = {
  id: string;
  operatorId: string;
  executionStepId: string;
  situationId: string | null;
  triggerCondition: string;
  fallbackAction: string;
  status: string;
  triggerAt: Date | null;
  reminderSent: boolean;
  triggeredAt: Date | null;
  executionStep: {
    id: string;
    planId: string;
    title: string;
    description: string;
    status: string;
    assignedUserId: string | null;
    plan: {
      id: string;
      operatorId: string;
      sourceType: string;
      sourceId: string;
    };
  };
};
