import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { getProvider } from "@/lib/connectors/registry";
import { decrypt, encrypt } from "@/lib/encryption";
import { sendNotification, sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { evaluateActionPolicies } from "@/lib/policy-evaluator";
import { recheckWorkStreamStatus } from "@/lib/workstreams";
import { addBusinessDays } from "@/lib/business-days";

// ── Types ────────────────────────────────────────────────────────────────────

export type StepDefinition = {
  title: string;
  description: string;
  executionMode: "action" | "generate" | "human_task";
  actionCapabilityId?: string;
  assignedUserId?: string;
  inputContext?: Record<string, unknown>;
};

export type StepOutput =
  | { type: "document"; url: string; title: string; mimeType: string }
  | { type: "email"; threadId: string; recipients: string[]; subject: string }
  | { type: "message"; channelId: string; messageId: string; platform: string }
  | { type: "content"; text: string; format: "markdown" | "plain" | "html" }
  | { type: "data"; payload: Record<string, unknown>; description: string }
  | { type: "system_change"; entityType: string; entityId: string; changeDescription: string }
  | { type: "situation_type"; situationTypeId: string; name: string; detectionLogic: object }
  | { type: "calendar_event"; eventId: string; platform: string; attendees: string[] }
  | { type: "task"; taskId: string; platform: string; assignee: string }
  | { type: "delegation"; delegationId: string; targetType: "ai" | "human"; targetId: string }
  | { type: "follow_up"; followUpId: string; triggerCondition: object; deadline?: string }
  | { type: "human_completion"; notes: string; attachments?: string[] };

// ── Create Plan ──────────────────────────────────────────────────────────────

export async function createExecutionPlan(
  operatorId: string,
  sourceType: "situation" | "initiative" | "recurring" | "delegation",
  sourceId: string,
  steps: StepDefinition[],
): Promise<string> {
  const planId = await prisma.$transaction(async (tx) => {
    const plan = await tx.executionPlan.create({
      data: {
        operatorId,
        sourceType,
        sourceId,
        status: "pending",
        currentStepOrder: 1,
      },
    });

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      await tx.executionStep.create({
        data: {
          planId: plan.id,
          sequenceOrder: i + 1,
          title: step.title,
          description: step.description,
          executionMode: step.executionMode,
          actionCapabilityId: step.actionCapabilityId,
          assignedUserId: step.assignedUserId,
          inputContext: step.inputContext ? JSON.stringify(step.inputContext) : undefined,
          status: i === 0 ? "awaiting_approval" : "pending",
        },
      });
    }

    return plan.id;
  });

  // Score immediately (fire-and-forget)
  scorePlanOnCreate(planId).catch(console.error);

  return planId;
}

// Fire-and-forget: score newly created plan
async function scorePlanOnCreate(planId: string): Promise<void> {
  const { computeSinglePlanPriority } = await import("@/lib/prioritization-engine");
  await computeSinglePlanPriority(planId);
}

// ── Execute Step ─────────────────────────────────────────────────────────────

export async function executeStep(stepId: string): Promise<void> {
  try {
    // 1. Load context
    const step = await prisma.executionStep.findUnique({
      where: { id: stepId },
      include: { plan: true },
    });
    if (!step) throw new Error("Step not found");

    const priorSteps = await prisma.executionStep.findMany({
      where: { planId: step.planId, status: "completed", sequenceOrder: { lt: step.sequenceOrder } },
      orderBy: { sequenceOrder: "asc" },
    });

    // 2. Branch on executionMode
    if (step.executionMode === "action") {
      await executeActionStep(step, priorSteps);
    } else if (step.executionMode === "generate") {
      await executeGenerateStep(step, priorSteps);
    } else if (step.executionMode === "human_task") {
      // Set step to executing — plan pauses here
      await prisma.executionStep.update({
        where: { id: stepId },
        data: { status: "executing" },
      });

      if (step.assignedUserId) {
        await sendNotification({
          operatorId: step.plan.operatorId,
          userId: step.assignedUserId,
          type: "delegation_received",
          title: `Task assigned: ${step.title}`,
          body: step.description,
          sourceType: "execution",
          sourceId: step.planId,
        });
      }

      // Auto-FollowUp: escalate to department admin after 3 business days
      const triggerAt = addBusinessDays(new Date(), 3);
      const escalateTargetId = await getDepartmentAdminId(step.plan.operatorId, step);
      await prisma.followUp.create({
        data: {
          operatorId: step.plan.operatorId,
          executionStepId: step.id,
          situationId: step.plan.sourceType === "situation" ? step.plan.sourceId : null,
          triggerCondition: JSON.stringify({
            type: "timeout",
            businessDays: 3,
          }),
          fallbackAction: JSON.stringify({
            type: "escalate",
            targetUserId: escalateTargetId,
          }),
          status: "watching",
          triggerAt,
          reminderSent: false,
        },
      });

      return; // Do NOT advance
    }

    // 3. Post-execution: advance plan
    await advancePlanAfterStep(step.id, step.planId, step.sequenceOrder, step.plan.operatorId);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    // Load step to get plan context for notification
    const failedStep = await prisma.executionStep.findUnique({
      where: { id: stepId },
      include: { plan: true },
    });

    await prisma.executionStep.update({
      where: { id: stepId },
      data: { status: "failed", errorMessage: errorMsg },
    }).catch(() => {});

    if (failedStep) {
      await sendNotificationToAdmins({
        operatorId: failedStep.plan.operatorId,
        type: "system_alert",
        title: `Step failed: ${failedStep.title}`,
        body: `Error: ${errorMsg}`,
        sourceType: "execution",
        sourceId: failedStep.planId,
      });
    }
  }
}

// ── Action Step ──────────────────────────────────────────────────────────────

async function executeActionStep(
  step: { id: string; planId: string; sequenceOrder: number; actionCapabilityId: string | null; assignedUserId: string | null; inputContext: string | null; plan: { id: string; operatorId: string; sourceType: string; sourceId: string } },
  priorSteps: Array<{ title: string; outputResult: string | null }>,
): Promise<void> {
  if (!step.actionCapabilityId) {
    throw new Error("Action step missing actionCapabilityId");
  }

  const capability = await prisma.actionCapability.findUnique({
    where: { id: step.actionCapabilityId },
  });
  if (!capability || !capability.enabled) {
    throw new Error("ActionCapability not found or disabled");
  }

  // Internal capability (no connector) — execute directly
  if (!capability.connectorId) {
    // Resolve the AI entity that owns this plan
    let planOwnerAiEntityId: string | undefined;
    if (step.plan.sourceType === "initiative") {
      const initiative = await prisma.initiative.findUnique({
        where: { id: step.plan.sourceId },
        select: { aiEntityId: true },
      });
      planOwnerAiEntityId = initiative?.aiEntityId;
    }

    const { executeInternalCapability } = await import("@/lib/internal-capabilities");
    const output = await executeInternalCapability(capability.name, step.inputContext, step.plan.operatorId, planOwnerAiEntityId);
    await prisma.executionStep.update({
      where: { id: step.id },
      data: {
        status: "completed",
        executedAt: new Date(),
        outputResult: JSON.stringify(output),
      },
    });
    return;
  }

  // Governance check
  if (step.plan.sourceType === "situation") {
    const situation = await prisma.situation.findUnique({
      where: { id: step.plan.sourceId },
      select: { triggerEntityId: true },
    });
    if (situation?.triggerEntityId) {
      const entity = await prisma.entity.findUnique({
        where: { id: situation.triggerEntityId },
        select: { entityType: { select: { slug: true } } },
      });
      if (entity) {
        const policyResult = await evaluateActionPolicies(
          step.plan.operatorId,
          [{
            name: capability.name,
            description: capability.description,
            connectorId: capability.connectorId,
            connectorProvider: null,
            inputSchema: capability.inputSchema,
          }],
          entity.entityType.slug,
          situation.triggerEntityId,
        );
        if (policyResult.blocked.length > 0) {
          throw new Error(`Blocked by policy: ${policyResult.blocked.map((b) => b.reason).join(", ")}`);
        }
      }
    }
  }

  // Resolve connector
  let connectorId: string | null = null;
  if (step.assignedUserId && capability.connectorId) {
    // Find the provider from the capability's connector, then find the user's connector for that provider
    const capConnector = await prisma.sourceConnector.findUnique({
      where: { id: capability.connectorId },
      select: { provider: true },
    });
    if (capConnector) {
      const userConnector = await prisma.sourceConnector.findFirst({
        where: {
          operatorId: step.plan.operatorId,
          provider: capConnector.provider,
          userId: step.assignedUserId,
          status: "active",
        },
      });
      if (userConnector) {
        connectorId = userConnector.id;
      }
    }
  }
  if (!connectorId) {
    connectorId = capability.connectorId;
  }
  if (!connectorId) {
    throw new Error("No connector available for action");
  }

  const connector = await prisma.sourceConnector.findUnique({
    where: { id: connectorId },
  });
  if (!connector) {
    throw new Error(`Connector not found: ${connectorId}`);
  }

  const provider = getProvider(connector.provider);
  if (!provider?.executeAction) {
    throw new Error(`Provider "${connector.provider}" does not support action execution`);
  }

  // Build params
  const inputContext = step.inputContext ? JSON.parse(step.inputContext) : {};
  const priorOutputs = priorSteps.map((s) => ({
    title: s.title,
    result: s.outputResult ? JSON.parse(s.outputResult) : null,
  }));
  const params = inputContext.params
    ? { ...inputContext.params, priorOutputs }
    : { ...inputContext, priorOutputs };

  // Execute action
  const config = JSON.parse(decrypt(connector.config || "{}"));
  const result = await provider.executeAction(config, capability.name, params);

  // Persist refreshed config
  await prisma.sourceConnector.update({
    where: { id: connector.id },
    data: { config: encrypt(JSON.stringify(config)) },
  }).catch(() => {});

  if (!result.success) {
    throw new Error(result.error || "Action execution failed");
  }

  // Store output
  const output = mapActionResult(capability.name, result.result ?? {});
  await prisma.executionStep.update({
    where: { id: step.id },
    data: {
      status: "completed",
      executedAt: new Date(),
      outputResult: JSON.stringify(output),
    },
  });
}

// ── Generate Step ────────────────────────────────────────────────────────────

async function executeGenerateStep(
  step: { id: string; description: string; inputContext: string | null },
  priorSteps: Array<{ title: string; outputResult: string | null }>,
): Promise<void> {
  let userContent = `Task: ${step.description}`;

  if (priorSteps.length > 0) {
    userContent += "\n\nPrior step results:";
    for (const prior of priorSteps) {
      const result = prior.outputResult ? JSON.parse(prior.outputResult) : null;
      userContent += `\n- ${prior.title}: ${result ? JSON.stringify(result) : "No output"}`;
    }
  }

  if (step.inputContext) {
    userContent += `\n\nContext:\n${step.inputContext}`;
  }

  const response = await callLLM({
    instructions: "You are executing a step in a business workflow. Complete the task described below using the provided context. Return your output as plain text.",
    messages: [{ role: "user", content: userContent }],
    aiFunction: "reasoning",
    temperature: 0.3,
    model: getModel("executionGenerate"),
  });

  await prisma.executionStep.update({
    where: { id: step.id },
    data: {
      status: "completed",
      executedAt: new Date(),
      outputResult: JSON.stringify({ type: "content", text: response.text, format: "markdown" }),
    },
  });
}

// ── Plan Advancement ─────────────────────────────────────────────────────────

export async function advancePlanAfterStep(
  stepId: string,
  planId: string,
  currentSequenceOrder: number,
  operatorId: string,
): Promise<void> {
  const nextStep = await prisma.executionStep.findFirst({
    where: { planId, sequenceOrder: { gt: currentSequenceOrder } },
    orderBy: { sequenceOrder: "asc" },
  });

  if (!nextStep) {
    // Plan complete
    const completedPlan = await prisma.executionPlan.update({
      where: { id: planId },
      data: { status: "completed", completedAt: new Date() },
    });
    await sendNotificationToAdmins({
      operatorId,
      type: "system_alert",
      title: "Plan completed",
      body: `Execution plan ${planId} has completed all steps.`,
      sourceType: "execution",
      sourceId: planId,
    });

    // Track plan autonomy
    const { recordPlanCompletion } = await import("@/lib/plan-autonomy");
    recordPlanCompletion(completedPlan).catch(err =>
      console.error("Plan autonomy tracking failed:", err),
    );

    // Trigger WorkStream recheck for the plan's source
    triggerPlanWorkStreamRecheck(planId).catch(console.error);
  } else {
    // Advance to next step
    await prisma.executionPlan.update({
      where: { id: planId },
      data: { currentStepOrder: nextStep.sequenceOrder },
    });
    await prisma.executionStep.update({
      where: { id: nextStep.id },
      data: { status: "awaiting_approval" },
    });
    await sendNotificationToAdmins({
      operatorId,
      type: "step_ready",
      title: `Step ready for review: ${nextStep.title}`,
      body: `Next step in plan ${planId} is awaiting approval.`,
      sourceType: "execution",
      sourceId: planId,
    });
  }
}

// ── Advance Step (approve/reject/skip) ───────────────────────────────────────

export async function advanceStep(
  stepId: string,
  action: "approve" | "reject" | "skip",
  userId: string,
): Promise<void> {
  const step = await prisma.executionStep.findUnique({
    where: { id: stepId },
    include: { plan: true },
  });
  if (!step) throw new Error("Step not found");
  if (step.status !== "awaiting_approval") {
    throw new Error(`Step is not awaiting approval (status: ${step.status})`);
  }

  if (action === "approve") {
    await prisma.executionStep.update({
      where: { id: stepId },
      data: { status: "approved", approvedAt: new Date(), approvedById: userId },
    });
    await executeStep(stepId);
  } else if (action === "reject") {
    await prisma.executionStep.update({
      where: { id: stepId },
      data: { status: "failed", errorMessage: "Rejected by user" },
    });
    const rejectedPlan = await prisma.executionPlan.update({
      where: { id: step.planId },
      data: { status: "failed" },
    });
    await sendNotificationToAdmins({
      operatorId: step.plan.operatorId,
      type: "system_alert",
      title: "Plan rejected",
      body: `Step "${step.title}" was rejected. Plan ${step.planId} has been marked as failed.`,
      sourceType: "execution",
      sourceId: step.planId,
    });

    // Track plan autonomy rejection
    const { recordPlanRejection } = await import("@/lib/plan-autonomy");
    recordPlanRejection(rejectedPlan).catch(err =>
      console.error("Plan autonomy rejection tracking failed:", err),
    );
  } else if (action === "skip") {
    await prisma.executionStep.update({
      where: { id: stepId },
      data: { status: "skipped" },
    });
    await advancePlanAfterStep(stepId, step.planId, step.sequenceOrder, step.plan.operatorId);
  }

  // Only rescore if the plan is still active (not rejected/failed)
  if (action !== "reject") {
    scorePlanOnCreate(step.planId).catch(console.error);
  }
}

// ── Complete Human Step ──────────────────────────────────────────────────────

export async function completeHumanStep(
  stepId: string,
  userId: string,
  notes: string,
  attachments?: string[],
): Promise<void> {
  const step = await prisma.executionStep.findUnique({
    where: { id: stepId },
    include: { plan: true },
  });
  if (!step) throw new Error("Step not found");
  if (step.status !== "executing" || step.executionMode !== "human_task") {
    throw new Error("Step is not an executing human task");
  }
  if (userId !== step.assignedUserId) {
    throw new Error("Only the assigned user can complete this task");
  }

  await prisma.executionStep.update({
    where: { id: stepId },
    data: {
      status: "completed",
      executedAt: new Date(),
      outputResult: JSON.stringify({ type: "human_completion", notes, attachments }),
    },
  });

  // Cancel any watching FollowUps for this step
  await prisma.followUp.updateMany({
    where: {
      executionStepId: step.id,
      status: "watching",
    },
    data: {
      status: "cancelled",
    },
  });

  await advancePlanAfterStep(stepId, step.planId, step.sequenceOrder, step.plan.operatorId);
}

// ── Plan Amendment ────────────────────────────────────────────────────────

export type PlanAmendment = {
  stepSequenceOrder: number;
  newDescription: string;
  newTitle?: string;
};

export async function amendExecutionPlan(
  planId: string,
  amendments: PlanAmendment[],
): Promise<void> {
  const plan = await prisma.executionPlan.findUnique({
    where: { id: planId },
    include: { steps: { orderBy: { sequenceOrder: "asc" } } },
  });

  if (!plan) throw new Error("Plan not found");
  if (!["executing", "approved", "pending", "amended"].includes(plan.status)) {
    throw new Error(`Cannot amend plan in status "${plan.status}"`);
  }

  const amendedStepTitles: string[] = [];

  for (const amendment of amendments) {
    const step = plan.steps.find(s => s.sequenceOrder === amendment.stepSequenceOrder);
    if (!step) {
      throw new Error(`Step with sequenceOrder ${amendment.stepSequenceOrder} not found`);
    }
    if (!["pending", "awaiting_approval"].includes(step.status)) {
      throw new Error(`Cannot amend step "${step.title}" — status is "${step.status}"`);
    }

    const updates: Record<string, unknown> = {
      description: amendment.newDescription,
    };
    if (amendment.newTitle) {
      updates.title = amendment.newTitle;
    }
    // Preserve original description only if not already set
    if (!step.originalDescription) {
      updates.originalDescription = step.description;
    }

    await prisma.executionStep.update({
      where: { id: step.id },
      data: updates,
    });

    amendedStepTitles.push(amendment.newTitle ?? step.title);
  }

  await prisma.executionPlan.update({
    where: { id: planId },
    data: { status: "amended" },
  });

  await sendNotificationToAdmins({
    operatorId: plan.operatorId,
    type: "system_alert",
    title: "Plan amended",
    body: `Steps amended: ${amendedStepTitles.join(", ")}`,
    sourceType: "execution",
    sourceId: planId,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function triggerPlanWorkStreamRecheck(planId: string): Promise<void> {
  const plan = await prisma.executionPlan.findUnique({
    where: { id: planId },
    select: { sourceType: true, sourceId: true },
  });
  if (!plan) return;

  if (plan.sourceType === "situation" || plan.sourceType === "initiative") {
    const items = await prisma.workStreamItem.findMany({
      where: { itemType: plan.sourceType, itemId: plan.sourceId },
      select: { workStreamId: true },
    });
    for (const item of items) {
      await recheckWorkStreamStatus(item.workStreamId);
    }
  }
}

async function getDepartmentAdminId(
  operatorId: string,
  step: { assignedUserId: string | null },
): Promise<string> {
  if (step.assignedUserId) {
    // Find the assigned user's department memberships
    const scopes = await prisma.userScope.findMany({
      where: { userId: step.assignedUserId },
      select: { departmentEntityId: true },
    });

    if (scopes.length > 0) {
      // Find an admin in one of those departments
      const deptIds = scopes.map((s) => s.departmentEntityId);
      const adminScope = await prisma.userScope.findFirst({
        where: {
          departmentEntityId: { in: deptIds },
          user: {
            operatorId,
            role: { in: ["admin", "superadmin"] },
          },
        },
        select: { userId: true },
      });
      if (adminScope) return adminScope.userId;
    }
  }

  // Fallback: any admin/superadmin for the operator
  const admin = await prisma.user.findFirst({
    where: { operatorId, role: { in: ["superadmin", "admin"] } },
    select: { id: true },
  });
  // There's always at least the operator creator as superadmin
  return admin!.id;
}

function mapActionResult(capabilityName: string, result: unknown): StepOutput {
  const r = (result ?? {}) as Record<string, unknown>;
  switch (capabilityName) {
    case "send_email":
      return { type: "email", threadId: String(r.threadId ?? ""), recipients: (r.recipients ?? []) as string[], subject: String(r.subject ?? "") };
    case "create_calendar_event":
    case "create_event":
      return { type: "calendar_event", eventId: String(r.eventId ?? ""), platform: String(r.platform ?? ""), attendees: (r.attendees ?? []) as string[] };
    case "send_slack_message":
    case "send_teams_message":
      return { type: "message", channelId: String(r.channelId ?? ""), messageId: String(r.messageId ?? ""), platform: String(r.platform ?? (capabilityName.includes("slack") ? "slack" : "teams")) };
    default:
      return { type: "data", payload: r, description: capabilityName };
  }
}
