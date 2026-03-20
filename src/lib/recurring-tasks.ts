import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import { createExecutionPlan, advanceStep, type StepDefinition } from "@/lib/execution-engine";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { CronExpressionParser } from "cron-parser";
import { extractJSONAny } from "@/lib/json-helpers";

// ── Types ────────────────────────────────────────────────────────────────────

type RecurringTaskConfig = {
  description: string;
  contextHints: {
    departmentId?: string;
    targetEntityIds?: string[];
    outputFormat?: string;
    additionalInstructions?: string;
  };
};

type ProcessResult = {
  processed: number;
  triggered: number;
  errors: number;
};

// ── Cron Processor ───────────────────────────────────────────────────────────

export async function processRecurringTasks(): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, triggered: 0, errors: 0 };
  const now = new Date();

  const tasks = await prisma.recurringTask.findMany({
    where: {
      status: "active",
      nextTriggerAt: { lte: now },
    },
  });

  for (const task of tasks) {
    result.processed++;
    try {
      await executeRecurringTask(task);
      result.triggered++;

      // Compute next trigger
      try {
        const interval = CronExpressionParser.parse(task.cronExpression, { currentDate: now });
        const next = interval.next().toDate();
        await prisma.recurringTask.update({
          where: { id: task.id },
          data: { lastTriggeredAt: now, nextTriggerAt: next },
        });
      } catch {
        // Bad cron expression — pause the task
        await prisma.recurringTask.update({
          where: { id: task.id },
          data: { status: "paused", nextTriggerAt: null, lastTriggeredAt: now },
        });
        await sendNotificationToAdmins({
          operatorId: task.operatorId,
          type: "system_alert",
          title: `Recurring task paused: ${task.title}`,
          body: `Could not compute next trigger for cron expression "${task.cronExpression}". Task has been paused.`,
          sourceType: "recurring_task",
          sourceId: task.id,
        });
      }
    } catch (err) {
      result.errors++;
      console.error(`[recurring-tasks] Error executing task ${task.id}:`, err);
    }
  }

  return result;
}

// ── Execute Single Task ──────────────────────────────────────────────────────

async function executeRecurringTask(task: {
  id: string;
  operatorId: string;
  aiEntityId: string;
  title: string;
  executionPlanTemplate: string;
  autoApproveSteps: boolean;
}): Promise<void> {
  const config = JSON.parse(task.executionPlanTemplate) as RecurringTaskConfig;

  // Load capabilities
  const capabilities = await prisma.actionCapability.findMany({
    where: { operatorId: task.operatorId, enabled: true },
    include: { connector: { select: { provider: true } } },
  });

  // Load department context if scoped
  let departmentContext = "";
  if (config.contextHints.departmentId) {
    const dept = await prisma.entity.findFirst({
      where: { id: config.contextHints.departmentId, operatorId: task.operatorId },
      select: { displayName: true, description: true },
    });
    if (dept) {
      departmentContext = `\nDepartment: ${dept.displayName}${dept.description ? ` — ${dept.description}` : ""}`;
    }
  }

  // Load recent insights
  const insights = await prisma.operationalInsight.findMany({
    where: {
      operatorId: task.operatorId,
      status: "active",
      ...(config.contextHints.departmentId
        ? { OR: [{ departmentId: config.contextHints.departmentId }, { shareScope: "operator" }] }
        : { shareScope: { in: ["department", "operator"] } }),
    },
    select: { description: true, insightType: true, confidence: true },
    take: 10,
    orderBy: { confidence: "desc" },
  });

  // Load governance policies
  const policies = await prisma.policyRule.findMany({
    where: { operatorId: task.operatorId, enabled: true },
    select: { name: true, effect: true, actionType: true, scope: true },
    take: 20,
  });

  // Build prompt
  const capList = capabilities.map(c => `  - ${c.name}: ${c.description} (${c.connector?.provider ?? "internal"})`).join("\n");
  const insightList = insights.length > 0
    ? insights.map(i => `  - [${i.insightType}] ${i.description} (confidence: ${i.confidence.toFixed(2)})`).join("\n")
    : "  None available.";
  const policyList = policies.length > 0
    ? policies.map(p => `  - ${p.name}: ${p.effect} on ${p.actionType} (${p.scope})`).join("\n")
    : "  No restrictions.";

  const systemPrompt = `You are executing a recurring task for an organization. Generate an execution plan.

Task: ${config.description}
${config.contextHints.additionalInstructions ? `Additional instructions: ${config.contextHints.additionalInstructions}` : ""}
${config.contextHints.outputFormat ? `Output format: ${config.contextHints.outputFormat}` : ""}
${departmentContext}

Available actions:
${capList || "  None — only generate and human_task steps are available."}

Operational insights:
${insightList}

Governance policies:
${policyList}

Respond with ONLY valid JSON — an array of steps:
[
  {
    "title": "short step title",
    "description": "what to do in this step",
    "executionMode": "action" | "generate" | "human_task",
    "actionCapabilityName": "action name (for action mode only)",
    "params": { },
    "assignedUserId": "user ID (for human_task mode only)"
  }
]

The plan should accomplish the task using the available actions and current context.`;

  const response = await callLLM(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Execute the recurring task: "${task.title}"` },
    ],
    { aiFunction: "reasoning", temperature: 0.3, maxTokens: 4096 },
  );

  // Parse response
  const parsed = extractJSONAny(response.content);
  if (!parsed) {
    throw new Error("Could not parse JSON from LLM response");
  }

  const steps = Array.isArray(parsed) ? parsed : (parsed as Record<string, unknown>).steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error("LLM response contained no valid steps");
  }

  // Resolve actionCapabilityName → actionCapabilityId
  const resolvedSteps: StepDefinition[] = [];
  for (const step of steps) {
    let actionCapabilityId: string | undefined;
    if (step.executionMode === "action" && step.actionCapabilityName) {
      const cap = capabilities.find(c => c.name === step.actionCapabilityName);
      if (!cap) {
        console.warn(`[recurring-tasks] ActionCapability "${step.actionCapabilityName}" not found. Skipping step.`);
        continue;
      }
      actionCapabilityId = cap.id;
    }
    resolvedSteps.push({
      title: String(step.title ?? ""),
      description: String(step.description ?? ""),
      executionMode: step.executionMode as "action" | "generate" | "human_task",
      actionCapabilityId,
      assignedUserId: step.assignedUserId || undefined,
      inputContext: step.params ? { params: step.params } : undefined,
    });
  }

  if (resolvedSteps.length === 0) {
    throw new Error("No valid steps after capability resolution");
  }

  // Create plan
  const planId = await createExecutionPlan(task.operatorId, "recurring", task.id, resolvedSteps);

  // Auto-approve or notify
  if (task.autoApproveSteps) {
    const plan = await prisma.executionPlan.findFirst({
      where: { id: planId },
      include: { steps: { orderBy: { sequenceOrder: "asc" }, take: 1 } },
    });
    if (plan?.steps[0]) {
      advanceStep(plan.steps[0].id, "approve", "system").catch(err =>
        console.error(`[recurring-tasks] Auto-advance failed for task ${task.id}:`, err),
      );
    }
    await sendNotificationToAdmins({
      operatorId: task.operatorId,
      type: "recurring_task_triggered",
      title: `Recurring task auto-executing: ${task.title}`,
      body: `A ${resolvedSteps.length}-step plan is being executed automatically.`,
      sourceType: "recurring_task",
      sourceId: task.id,
    });
  } else {
    await sendNotificationToAdmins({
      operatorId: task.operatorId,
      type: "recurring_task_triggered",
      title: `Recurring task triggered, plan ready for review: ${task.title}`,
      body: `A ${resolvedSteps.length}-step plan has been created and is awaiting review.`,
      sourceType: "recurring_task",
      sourceId: task.id,
    });
  }
}

// ── CRUD Helpers ─────────────────────────────────────────────────────────────

export async function createRecurringTask(params: {
  operatorId: string;
  aiEntityId: string;
  title: string;
  description: string;
  cronExpression: string;
  autoApproveSteps?: boolean;
  contextHints?: {
    departmentId?: string;
    targetEntityIds?: string[];
    outputFormat?: string;
    additionalInstructions?: string;
  };
}) {
  // Validate cron expression
  CronExpressionParser.parse(params.cronExpression); // throws on invalid

  const now = new Date();
  const interval = CronExpressionParser.parse(params.cronExpression, { currentDate: now });
  const nextTriggerAt = interval.next().toDate();

  const config: RecurringTaskConfig = {
    description: params.description,
    contextHints: params.contextHints ?? {},
  };

  return prisma.recurringTask.create({
    data: {
      operatorId: params.operatorId,
      aiEntityId: params.aiEntityId,
      title: params.title,
      description: params.description,
      cronExpression: params.cronExpression,
      executionPlanTemplate: JSON.stringify(config),
      autoApproveSteps: params.autoApproveSteps ?? false,
      nextTriggerAt,
      status: "active",
    },
  });
}

export async function pauseRecurringTask(taskId: string) {
  return prisma.recurringTask.update({
    where: { id: taskId },
    data: { status: "paused", nextTriggerAt: null },
  });
}

export async function resumeRecurringTask(taskId: string) {
  const task = await prisma.recurringTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Task not found");

  const now = new Date();
  const interval = CronExpressionParser.parse(task.cronExpression, { currentDate: now });
  const nextTriggerAt = interval.next().toDate();

  return prisma.recurringTask.update({
    where: { id: taskId },
    data: { status: "active", nextTriggerAt },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

