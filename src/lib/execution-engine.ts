import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { getProvider } from "@/lib/connectors/registry";
import { encryptConfig, decryptConfig } from "@/lib/config-encryption";
import { sendNotification, sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { evaluateActionPolicies } from "@/lib/policy-evaluator";
import { recheckWorkStreamStatus } from "@/lib/workstreams";
import { addBusinessDays } from "@/lib/business-days";
import { classifyError, extractErrorMessage, sanitizeErrorMessage } from "@/lib/execution/error-classification";
import { captureApiError } from "@/lib/api-error";

// ── Types ────────────────────────────────────────────────────────────────────

export type StepDefinition = {
  title: string;
  description: string;
  executionMode: "action" | "generate" | "human_task" | "await_situation";
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
  | { type: "human_completion"; notes: string; attachments?: string[] }
  | { type: "situation_resolution"; resolutions: Array<{ situationId: string; resolution: string; resolvedById: string; resolvedAt: string; metadata: Record<string, unknown> }> };

// ── Create Plan ──────────────────────────────────────────────────────────────

export async function createExecutionPlan(
  operatorId: string,
  sourceType: "situation" | "initiative" | "recurring" | "delegation",
  sourceId: string,
  steps: StepDefinition[],
  tracking?: { modelId?: string; promptVersion?: number },
): Promise<string> {
  const planId = await prisma.$transaction(async (tx) => {
    const plan = await tx.executionPlan.create({
      data: {
        operatorId,
        sourceType,
        sourceId,
        status: "pending",
        currentStepOrder: 1,
        modelId: tracking?.modelId,
        promptVersion: tracking?.promptVersion,
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

    // 1a. Emergency stop — checked fresh every step, not cached from plan creation
    const stepOperator = await prisma.operator.findUnique({
      where: { id: step.plan.operatorId },
      select: { aiPaused: true, billingStatus: true },
    });
    if (stepOperator?.aiPaused) {
      console.log(`[execution-engine] Skipping step ${stepId} — AI paused by administrator`);
      return;
    }

    // 1a2. Billing gate — pause execution if operator billing is not active
    if (stepOperator && stepOperator.billingStatus !== "active") {
      console.log(`[execution-engine] Skipping step ${stepId} — operator billing status: ${stepOperator.billingStatus}`);
      return;
    }

    const priorSteps = await prisma.executionStep.findMany({
      where: { planId: step.planId, status: "completed", sequenceOrder: { lt: step.sequenceOrder } },
      orderBy: { sequenceOrder: "asc" },
    });

    // 1b. Loop breaker — increment counter and check ceiling
    const updatedPlan = await prisma.executionPlan.update({
      where: { id: step.plan.id },
      data: { totalStepExecutions: { increment: 1 } },
      select: { id: true, totalStepExecutions: true, maxStepExecutions: true, operatorId: true, sourceType: true, sourceId: true },
    });

    if (updatedPlan.totalStepExecutions > updatedPlan.maxStepExecutions) {
      await prisma.executionPlan.update({
        where: { id: step.plan.id },
        data: { status: "failed" },
      });

      await sendNotificationToAdmins({
        operatorId: updatedPlan.operatorId,
        type: "plan_failed",
        title: "Execution plan stopped",
        body: `Execution plan was stopped: exceeded maximum of ${updatedPlan.maxStepExecutions} step executions. This usually indicates a retry loop. Source: ${updatedPlan.sourceType} ${updatedPlan.sourceId}`,
        linkUrl: `/execution-plans/${step.plan.id}`,
        emailContext: {
          planTitle: step.plan.sourceType + " plan",
          failureReason: `Exceeded maximum step execution limit (${updatedPlan.maxStepExecutions}). The plan may have been stuck in a retry or amendment loop.`,
          source: updatedPlan.sourceType,
          viewUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/execution-plans/${step.plan.id}`,
          isLoopBreaker: true,
        },
      });

      // Revert source situation to proposed so a human can review
      if (updatedPlan.sourceType === "situation" && updatedPlan.sourceId) {
        await prisma.situation.update({
          where: { id: updatedPlan.sourceId },
          data: { status: "proposed" },
        });
      }

      return; // Stop execution
    }

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
    } else if (step.executionMode === "await_situation") {
      await executeAwaitSituationStep(step);
      return; // Do NOT advance — resumes when spawned situation resolves
    }

    // 3. Post-execution: advance plan
    await advancePlanAfterStep(step.id, step.planId, step.sequenceOrder, step.plan.operatorId);
  } catch (err) {
    // Load step fresh for error handling (may have been modified during execution)
    const failedStep = await prisma.executionStep.findUnique({
      where: { id: stepId },
      include: { plan: true },
    });
    if (!failedStep) return;

    const errorClass = classifyError(err, failedStep.executionMode);
    const rawMessage = extractErrorMessage(err);
    const message = sanitizeErrorMessage(rawMessage);

    switch (errorClass) {
      case "transient":
        await handleTransientError(failedStep, err, message);
        break;
      case "permanent":
        await handlePermanentError(failedStep, message);
        break;
      case "catastrophic":
        await handleCatastrophicError(failedStep, err, message);
        break;
    }
  }
}

// ── Error Handlers ──────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 4000, 16000]; // exponential: 1s, 4s, 16s

type StepWithPlan = {
  id: string;
  planId: string;
  sequenceOrder: number;
  title: string;
  description: string;
  executionMode: string;
  retryCount: number;
  plan: { id: string; operatorId: string; sourceType: string; sourceId: string };
};

async function handleTransientError(
  step: StepWithPlan,
  error: unknown,
  message: string,
): Promise<void> {
  const newRetryCount = step.retryCount + 1;

  if (newRetryCount <= MAX_RETRIES) {
    await prisma.executionStep.update({
      where: { id: step.id },
      data: {
        retryCount: newRetryCount,
        lastError: `Transient (attempt ${newRetryCount}/${MAX_RETRIES}): ${message}`,
      },
    });

    await sleep(BACKOFF_MS[newRetryCount - 1]);

    // Check emergency stop before retrying
    const op = await prisma.operator.findUnique({
      where: { id: step.plan.operatorId },
      select: { aiPaused: true },
    });
    if (op?.aiPaused) {
      await prisma.executionStep.update({
        where: { id: step.id },
        data: { status: "failed", lastError: `Halted: operator AI paused during retry` },
      });
      return;
    }

    // Retry — re-enter executeStep with fresh data
    const freshStep = await prisma.executionStep.findUnique({
      where: { id: step.id },
      select: { status: true },
    });
    if (freshStep && freshStep.status !== "failed") {
      await executeStep(step.id);
    }
  } else {
    // Exhausted retries — escalate to permanent
    await handlePermanentError(
      step,
      `Transient error exhausted ${MAX_RETRIES} retries: ${message}`,
    );
  }
}

async function handlePermanentError(
  step: StepWithPlan,
  message: string,
): Promise<void> {
  await prisma.executionStep.update({
    where: { id: step.id },
    data: { status: "failed", lastError: `Permanent: ${message}`, errorMessage: message },
  });

  // Load plan with remaining steps for amendment context
  const plan = await prisma.executionPlan.findUnique({
    where: { id: step.planId },
    include: {
      steps: { orderBy: { sequenceOrder: "asc" } },
    },
  });

  if (plan) {
    await amendPlanFromError(plan, {
      failedStepId: step.id,
      failedStepDescription: step.description,
      errorMessage: message,
      errorClass: "permanent",
    });
  }
}

async function handleCatastrophicError(
  step: StepWithPlan,
  error: unknown,
  message: string,
): Promise<void> {
  await prisma.executionStep.update({
    where: { id: step.id },
    data: { status: "failed", lastError: `Catastrophic: ${message}`, errorMessage: message },
  });

  await prisma.executionPlan.update({
    where: { id: step.planId },
    data: { status: "failed" },
  });

  // Notify all admins
  const admins = await prisma.user.findMany({
    where: {
      operatorId: step.plan.operatorId,
      role: "admin",
      accountSuspended: false,
    },
    select: { id: true },
  });

  for (const admin of admins) {
    await sendNotification({
      operatorId: step.plan.operatorId,
      userId: admin.id,
      type: "system_alert",
      title: "AI execution halted — action required",
      body: `Plan for step "${step.title}" has been halted due to a critical error: ${message}. This may indicate a disconnected integration or revoked access. Please check your connections in Settings.`,
      sourceType: "execution",
      sourceId: step.planId,
    });
  }

  captureApiError(error instanceof Error ? error : new Error(message), {
    operatorId: step.plan.operatorId,
    planId: step.planId,
    stepId: step.id,
    errorClass: "catastrophic",
  });
}

// ── Error-Triggered Plan Amendment ──────────────────────────────────────────

export interface AmendmentContext {
  failedStepId: string;
  failedStepDescription: string;
  errorMessage: string;
  errorClass: "permanent" | "transient";
}

async function amendPlanFromError(
  plan: { id: string; operatorId: string; steps: Array<{ id: string; sequenceOrder: number; title: string; description: string; status: string }> },
  context: AmendmentContext,
): Promise<void> {
  const remainingSteps = plan.steps.filter(
    (s) => s.status === "pending" || s.status === "awaiting_approval",
  );

  if (remainingSteps.length === 0) {
    // No steps to amend — just fail the plan
    await prisma.executionPlan.update({
      where: { id: plan.id },
      data: { status: "failed" },
    });
    await sendNotificationToAdmins({
      operatorId: plan.operatorId,
      type: "system_alert",
      title: "Plan failed — no remaining steps to amend",
      body: `Step "${context.failedStepDescription}" failed: ${context.errorMessage}`,
      sourceType: "execution",
      sourceId: plan.id,
    });
    return;
  }

  // Use LLM to re-reason remaining steps with failure context
  try {
    const prompt = buildAmendmentPrompt(plan, context, remainingSteps);

    const response = await callLLM({
      operatorId: plan.operatorId,
      aiFunction: "reasoning",
      instructions:
        "You are an execution plan advisor. A step in an execution plan has failed. Propose amendments to remaining steps to achieve the original goal, or recommend escalation if the goal cannot be achieved.",
      messages: [{ role: "user", content: prompt }],
    });

    // Parse LLM response for amendments
    const amendments = parseAmendmentResponse(response.text, remainingSteps);

    if (amendments.length > 0) {
      await amendExecutionPlan(plan.id, amendments);
      await prisma.executionPlan.update({
        where: { id: plan.id },
        data: { modifiedBeforeApproval: true },
      });
    } else {
      // LLM recommended escalation
      await prisma.executionPlan.update({
        where: { id: plan.id },
        data: { status: "failed" },
      });
      await sendNotificationToAdmins({
        operatorId: plan.operatorId,
        type: "system_alert",
        title: "Plan requires human intervention",
        body: `Step failed: ${context.errorMessage}. AI could not determine alternative steps.`,
        sourceType: "execution",
        sourceId: plan.id,
      });
    }
  } catch (amendErr) {
    // Amendment reasoning itself failed — fail the plan
    console.error("[execution-engine] Amendment reasoning failed:", amendErr);
    await prisma.executionPlan.update({
      where: { id: plan.id },
      data: { status: "failed" },
    });
    await sendNotificationToAdmins({
      operatorId: plan.operatorId,
      type: "system_alert",
      title: `Step failed: ${context.failedStepDescription}`,
      body: `Error: ${context.errorMessage}. Amendment reasoning also failed.`,
      sourceType: "execution",
      sourceId: plan.id,
    });
  }
}

function buildAmendmentPrompt(
  plan: { id: string; steps: Array<{ sequenceOrder: number; title: string; description: string; status: string }> },
  context: AmendmentContext,
  remainingSteps: Array<{ sequenceOrder: number; title: string; description: string }>,
): string {
  const completedSteps = plan.steps
    .filter((s) => s.status === "completed")
    .map((s) => `  ${s.sequenceOrder}. [DONE] ${s.title}`)
    .join("\n");

  const remaining = remainingSteps
    .map((s) => `  ${s.sequenceOrder}. ${s.title}: ${s.description}`)
    .join("\n");

  return `A step in the execution plan has failed.

FAILED STEP: ${context.failedStepDescription}
ERROR: ${context.errorMessage}
ERROR CLASS: ${context.errorClass}

COMPLETED STEPS:
${completedSteps || "  (none)"}

REMAINING STEPS TO AMEND:
${remaining}

Propose alternative descriptions for the remaining steps to achieve the original goal while accounting for the failure. If the goal cannot be achieved without the failed step, respond with "ESCALATE" on a single line.

Respond in JSON format:
[{ "sequenceOrder": <number>, "newTitle": "<optional new title>", "newDescription": "<amended description>" }, ...]`;
}

function parseAmendmentResponse(
  response: string,
  remainingSteps: Array<{ sequenceOrder: number }>,
): PlanAmendment[] {
  const trimmed = response.trim();
  if (trimmed.toUpperCase().includes("ESCALATE")) return [];

  try {
    // Extract JSON array from response
    const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      sequenceOrder: number;
      newTitle?: string;
      newDescription: string;
    }>;

    const validOrders = new Set(remainingSteps.map((s) => s.sequenceOrder));
    return parsed
      .filter((a) => validOrders.has(a.sequenceOrder) && a.newDescription)
      .map((a) => ({
        stepSequenceOrder: a.sequenceOrder,
        newDescription: a.newDescription,
        newTitle: a.newTitle,
      }));
  } catch {
    return [];
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

  // writeBackStatus gate: only connector-backed capabilities with writeBackStatus
  if (capability.connectorId && capability.writeBackStatus !== "enabled") {
    const connectorForType = await prisma.sourceConnector.findFirst({
      where: { id: capability.connectorId, deletedAt: null },
      select: { provider: true },
    });
    const errorPayload = JSON.stringify({
      code: "WRITEBACK_NOT_ENABLED",
      capabilitySlug: capability.slug || capability.name,
      connectorType: connectorForType?.provider ?? "unknown",
      message: `Write-back for ${capability.name} has not been enabled. An admin can enable this in Settings → Connections.`,
    });
    await prisma.executionStep.update({
      where: { id: step.id },
      data: { status: "failed", errorMessage: errorPayload },
    });
    await sendNotificationToAdmins({
      operatorId: step.plan.operatorId,
      type: "system_alert",
      title: `Write-back not enabled: ${capability.name}`,
      body: `Write-back for ${capability.name} has not been enabled. An admin can enable this in Settings → Connections.`,
      sourceType: "execution",
      sourceId: step.planId,
    });
    return;
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
      planOwnerAiEntityId = initiative?.aiEntityId ?? undefined;
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
    const capConnector = await prisma.sourceConnector.findFirst({
      where: { id: capability.connectorId, deletedAt: null },
      select: { provider: true },
    });
    if (capConnector) {
      const userConnector = await prisma.sourceConnector.findFirst({
        where: {
          deletedAt: null,
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

  const connector = await prisma.sourceConnector.findFirst({
    where: { id: connectorId, deletedAt: null },
  });
  if (!connector) {
    throw new Error(`Connector not found: ${connectorId}`);
  }

  // Demo connector mock — skip real API, produce mock output
  const connectorConfig = (() => {
    try { return JSON.parse(connector.config || "{}"); } catch { return {}; }
  })();

  if (connectorConfig.demo === true) {
    const inputContext = step.inputContext ? JSON.parse(step.inputContext) : {};
    const params = inputContext.params || inputContext;
    const mockId = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let output: Record<string, unknown>;

    switch (capability.name) {
      case "send_email":
      case "reply_to_email":
      case "reply_to_thread":
      case "forward_email":
        output = {
          type: "email",
          threadId: mockId,
          recipients: [params.to].filter(Boolean),
          subject: params.subject || "(no subject)",
          _demo: true,
        };
        break;
      case "send_slack_message":
      case "send_teams_message":
        output = {
          type: "message",
          channelId: params.channel || "general",
          messageId: mockId,
          platform: connector.provider === "slack" ? "slack" : "teams",
          _demo: true,
        };
        break;
      case "create_calendar_event":
        output = {
          type: "calendar_event",
          eventId: mockId,
          platform: connector.provider,
          attendees: params.attendees || [],
          _demo: true,
        };
        break;
      case "create_document":
      case "create_spreadsheet":
      case "create_presentation":
        output = {
          type: "document",
          url: `https://demo.qorpera.com/doc/${mockId}`,
          title: params.title || "Untitled",
          mimeType: "text/html",
          _demo: true,
        };
        break;
      default:
        output = {
          type: "data",
          payload: params,
          description: `Demo execution of ${capability.name}`,
          _demo: true,
        };
    }

    console.log(`[execution-engine] Demo execution: ${capability.name} → mock ${output.type} (${mockId})`);

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

  // EU AI Act Article 50: flag AI-generated content for email/Slack actions
  // Auto-executed steps (no approvedById) are AI-generated; user-approved are not
  const isAiGenerated = !(step as any).approvedById;
  if (["send_email", "reply_to_thread", "send_slack_message"].includes(capability.name)) {
    params.isAiGenerated = isAiGenerated;
    if (isAiGenerated) {
      const operator = await prisma.operator.findUnique({
        where: { id: step.plan.operatorId },
        select: { companyName: true, displayName: true },
      });
      params._operatorName = operator?.companyName || operator?.displayName || undefined;
    }
  }

  // Execute action
  const config = decryptConfig(connector.config || "{}") as Record<string, any>;
  const result = await provider.executeAction(config, capability.name, params);

  // Persist refreshed config
  await prisma.sourceConnector.update({
    where: { id: connector.id },
    data: { config: encryptConfig(config) },
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
      apiCostCents: response.apiCostCents,
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

    // Mark the active cycle as completed
    await prisma.situationCycle.updateMany({
      where: { executionPlanId: planId, status: "active" },
      data: { status: "completed", completedAt: new Date() },
    });

    // Determine resolution behavior from reasoning output
    if (completedPlan.sourceType === "situation") {
      const situation = await prisma.situation.findUnique({
        where: { id: completedPlan.sourceId },
        select: { id: true, status: true, reasoning: true, triggerSummary: true, assignedUserId: true, contextSnapshot: true },
      });

      if (situation && !["resolved", "closed", "rejected", "dismissed"].includes(situation.status)) {
        let resolutionType = "response_dependent";
        let monitoringCriteria: { waitingFor?: string; expectedWithinDays?: number; followUpAction?: string } | null = null;

        if (situation.reasoning) {
          try {
            const r = JSON.parse(situation.reasoning);
            if (r.resolutionType) resolutionType = r.resolutionType;
            if (r.monitoringCriteria) monitoringCriteria = r.monitoringCriteria;
          } catch {}
        }

        if (resolutionType === "self_resolving" || resolutionType === "informational") {
          await prisma.situation.update({
            where: { id: situation.id },
            data: {
              status: "resolved",
              resolvedAt: new Date(),
              outcome: resolutionType === "informational" ? "information_delivered" : "action_completed",
            },
          });

          const completedSteps = await prisma.executionStep.findMany({
            where: { planId, status: "completed" },
            orderBy: { sequenceOrder: "asc" },
            select: { title: true, outputResult: true, executedAt: true },
          });
          const receiptLines = completedSteps.map(s => {
            let detail = s.title;
            if (s.outputResult) {
              try {
                const out = JSON.parse(s.outputResult);
                if (out.type === "email") detail += ` → ${(out.recipients ?? []).join(", ")}`;
                else if (out.type === "calendar_event") detail += ` → event created`;
                else if (out.type === "document") detail += ` → ${out.url ?? "created"}`;
              } catch {}
            }
            return detail;
          }).join(" · ");

          const notifyUserId = situation.assignedUserId;
          if (notifyUserId) {
            await sendNotification({
              operatorId,
              userId: notifyUserId,
              type: "situation_resolved",
              title: `${situation.triggerSummary?.slice(0, 80) ?? "Situation resolved"}`,
              body: receiptLines || "All actions completed successfully.",
              sourceType: "situation",
              sourceId: situation.id,
            }).catch(() => {});
          } else {
            await sendNotificationToAdmins({
              operatorId,
              type: "situation_resolved",
              title: `${situation.triggerSummary?.slice(0, 80) ?? "Situation resolved"}`,
              body: receiptLines || "All actions completed successfully.",
              sourceType: "situation",
              sourceId: situation.id,
            }).catch(() => {});
          }

          console.log(`[execution-engine] Situation ${situation.id} → auto-resolved (${resolutionType})`);
        } else {
          const monitoringData: Record<string, unknown> = { status: "monitoring" };
          if (monitoringCriteria) {
            let existingSnapshot: Record<string, unknown> = {};
            if (situation.contextSnapshot) {
              try { existingSnapshot = JSON.parse(situation.contextSnapshot); } catch {}
            }
            monitoringData.contextSnapshot = JSON.stringify({
              ...existingSnapshot,
              monitoringCriteria,
            });
          }

          await prisma.situation.update({
            where: { id: situation.id },
            data: monitoringData,
          });

          const monitorMsg = monitoringCriteria
            ? `Waiting for: ${monitoringCriteria.waitingFor}. Follow-up in ${monitoringCriteria.expectedWithinDays ?? 3} business days if no response.`
            : "Monitoring — waiting for external response.";

          const notifyUserId = situation.assignedUserId;
          if (notifyUserId) {
            await sendNotification({
              operatorId,
              userId: notifyUserId,
              type: "situation_resolved",
              title: `${situation.triggerSummary?.slice(0, 80) ?? "Actions completed, monitoring"}`,
              body: monitorMsg,
              sourceType: "situation",
              sourceId: situation.id,
            }).catch(() => {});
          }

          console.log(`[execution-engine] Situation ${situation.id} → monitoring (${monitoringCriteria?.waitingFor ?? "no criteria"})`);
        }
      }
    }

    // Track plan autonomy
    const { recordPlanCompletion } = await import("@/lib/plan-autonomy");
    recordPlanCompletion(completedPlan).catch(err =>
      console.error("Plan autonomy tracking failed:", err),
    );

    // Trigger WorkStream recheck for the plan's source
    triggerPlanWorkStreamRecheck(planId).catch(console.error);

    // Trigger workstream reassessment
    triggerWorkStreamReassessment(completedPlan).catch(console.error);
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
  notes?: string,
  attachments?: string[],
): Promise<void> {
  const step = await prisma.executionStep.findUnique({
    where: { id: stepId },
    include: { plan: true },
  });
  if (!step) throw new Error("Step not found");
  if (step.executionMode !== "human_task") {
    throw new Error("Step is not a human task");
  }
  if (step.status === "completed") {
    throw new Error("Step is already completed");
  }
  if (!["pending", "awaiting_approval", "executing"].includes(step.status)) {
    throw new Error(`Cannot complete step in status "${step.status}"`);
  }

  await prisma.executionStep.update({
    where: { id: stepId },
    data: {
      status: "completed",
      executedAt: new Date(),
      outputResult: JSON.stringify({ type: "human_completion", notes: notes ?? "", attachments }),
    },
  });

  await prisma.followUp.updateMany({
    where: { executionStepId: step.id, status: "watching" },
    data: { status: "cancelled" },
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
    data: { status: "amended", modifiedBeforeApproval: true },
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

// ── Await Situation Step ─────────────────────────────────────────────────────

async function executeAwaitSituationStep(
  step: { id: string; planId: string; inputContext: string | null; plan: { id: string; operatorId: string; sourceType: string; sourceId: string } },
): Promise<void> {
  const input = step.inputContext ? JSON.parse(step.inputContext) : {};

  // Resolve situation type from slug
  const situationType = await prisma.situationType.findFirst({
    where: { operatorId: step.plan.operatorId, slug: input.situationTypeSlug },
  });
  if (!situationType) {
    throw new Error(`SituationType with slug "${input.situationTypeSlug}" not found`);
  }

  // Create the spawned situation
  const situation = await prisma.situation.create({
    data: {
      operatorId: step.plan.operatorId,
      situationTypeId: situationType.id,
      spawningStepId: step.id,
      source: "detected",
      status: "detected",
      contextSnapshot: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });

  // Inherit workstream from parent plan's source
  if (input.inheritWorkStream !== false) {
    const parentItems = await prisma.workStreamItem.findMany({
      where: { itemType: step.plan.sourceType, itemId: step.plan.sourceId },
      select: { workStreamId: true },
    });
    for (const item of parentItems) {
      await prisma.workStreamItem.upsert({
        where: { workStreamId_itemType_itemId: { workStreamId: item.workStreamId, itemType: "situation", itemId: situation.id } },
        create: { workStreamId: item.workStreamId, itemType: "situation", itemId: situation.id },
        update: {},
      });
    }
  }

  // Set step to awaiting_situation
  await prisma.executionStep.update({
    where: { id: step.id },
    data: { status: "awaiting_situation" },
  });

  // Notify target user
  if (input.targetUserId) {
    await sendNotification({
      operatorId: step.plan.operatorId,
      userId: input.targetUserId,
      type: "situation_proposed",
      title: input.title || `New situation: ${situationType.name}`,
      body: input.description || situationType.description,
      sourceType: "situation",
      sourceId: situation.id,
    });
  }
}

// ── Resume After Situation Resolution ────────────────────────────────────────

export async function resumeAfterSituationResolution(situationId: string): Promise<void> {
  const situation = await prisma.situation.findUnique({
    where: { id: situationId },
    select: { id: true, spawningStepId: true, status: true, resolvedAt: true, assignedUserId: true, contextSnapshot: true },
  });

  if (!situation?.spawningStepId) return;

  const spawningStep = await prisma.executionStep.findUnique({
    where: { id: situation.spawningStepId },
    include: { plan: true },
  });
  if (!spawningStep || spawningStep.status !== "awaiting_situation") return;

  // Check if ALL situations with this spawningStepId are resolved
  const unresolvedCount = await prisma.situation.count({
    where: {
      spawningStepId: situation.spawningStepId,
      status: { notIn: ["resolved", "closed", "dismissed"] },
    },
  });

  if (unresolvedCount > 0) return; // Still waiting for other situations

  // All resolved — collect resolution outcomes
  const resolvedSituations = await prisma.situation.findMany({
    where: { spawningStepId: situation.spawningStepId },
    select: {
      id: true,
      status: true,
      resolvedAt: true,
      assignedUserId: true,
      contextSnapshot: true,
    },
  });

  const resolutions = resolvedSituations.map(s => ({
    situationId: s.id,
    resolution: s.status,
    resolvedById: s.assignedUserId || "",
    resolvedAt: s.resolvedAt?.toISOString() || new Date().toISOString(),
    metadata: s.contextSnapshot ? JSON.parse(s.contextSnapshot) : {},
  }));

  // Complete the step with resolution data
  await prisma.executionStep.update({
    where: { id: spawningStep.id },
    data: {
      status: "completed",
      executedAt: new Date(),
      outputResult: JSON.stringify({ type: "situation_resolution", resolutions }),
    },
  });

  // Advance the plan
  await advancePlanAfterStep(
    spawningStep.id,
    spawningStep.planId,
    spawningStep.sequenceOrder,
    spawningStep.plan.operatorId,
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function triggerWorkStreamReassessment(
  plan: { id: string; sourceType: string; sourceId: string },
): Promise<void> {
  if (plan.sourceType !== "situation" && plan.sourceType !== "initiative") return;

  const items = await prisma.workStreamItem.findMany({
    where: { itemType: plan.sourceType, itemId: plan.sourceId },
    select: { workStreamId: true },
  });

  if (items.length > 0) {
    const { reassessWorkStream } = await import("@/lib/workstream-reassessment");
    for (const item of items) {
      await reassessWorkStream(item.workStreamId, plan.sourceId, plan.sourceType).catch(err =>
        console.error("[execution-engine] Workstream reassessment failed:", err),
      );
    }
  }
}

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
      select: { domainEntityId: true },
    });

    if (scopes.length > 0) {
      // Find an admin in one of those departments
      const deptIds = scopes.map((s) => s.domainEntityId).filter(Boolean) as string[];
      const adminScope = deptIds.length > 0 ? await prisma.userScope.findFirst({
        where: {
          domainEntityId: { in: deptIds },
          user: {
            operatorId,
            role: { in: ["admin", "superadmin"] },
          },
        },
        select: { userId: true },
      }) : null;
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
