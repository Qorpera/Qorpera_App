import { prisma } from "@/lib/db";
import { getWorkStreamContext } from "@/lib/workstreams";
import type { OperatorSnapshot, DepartmentSnapshot } from "@/lib/system-health/compute-snapshot";

// ── Situation Context ────────────────────────────────────────────────────────

export async function loadSituationContext(
  situationId: string,
  operatorId: string,
): Promise<string | null> {
  const situation = await prisma.situation.findFirst({
    where: { id: situationId, operatorId },
    select: {
      id: true,
      status: true,
      severity: true,
      confidence: true,
      source: true,
      reasoning: true,
      proposedAction: true,
      createdAt: true,
      triggerEntityId: true,
      situationType: { select: { name: true, description: true, autonomyLevel: true } },
      executionPlan: {
        select: {
          id: true,
          status: true,
          currentStepOrder: true,
          steps: {
            select: { title: true, executionMode: true, status: true, sequenceOrder: true },
            orderBy: { sequenceOrder: "asc" },
          },
        },
      },
    },
  });

  if (!situation) return null;

  // Load trigger entity
  let triggerInfo = "";
  if (situation.triggerEntityId) {
    const entity = await prisma.entity.findUnique({
      where: { id: situation.triggerEntityId },
      select: {
        displayName: true,
        entityType: { select: { name: true } },
        propertyValues: {
          select: { value: true, property: { select: { name: true } } },
          take: 10,
        },
      },
    });
    if (entity) {
      const props = entity.propertyValues
        .map(pv => `  ${pv.property.name}: ${pv.value}`)
        .join("\n");
      triggerInfo = `Trigger: ${entity.displayName} (${entity.entityType.name})${props ? `\n${props}` : ""}`;
    }
  }

  // Parse reasoning
  let analysisSection = "";
  let actionSection = "";
  if (situation.reasoning) {
    try {
      const reasoning = JSON.parse(situation.reasoning);
      if (reasoning.analysis) {
        analysisSection = `\nAI Analysis:\n${reasoning.analysis}`;
      }
      if (reasoning.evidenceSummary) {
        analysisSection += `\n\nEvidence:\n${reasoning.evidenceSummary}`;
      }
      if (reasoning.actionPlan && Array.isArray(reasoning.actionPlan)) {
        const steps = reasoning.actionPlan
          .map((s: { title: string; description: string }, i: number) => `${i + 1}. ${s.title}: ${s.description}`)
          .join("\n");
        actionSection = `\nRecommended Action:\n${steps}`;
      }
      if (reasoning.confidence !== undefined) {
        actionSection += `\nConfidence: ${(reasoning.confidence * 100).toFixed(0)}%`;
      }
    } catch { /* invalid JSON — skip */ }
  }

  // Execution plan
  let planSection = "";
  if (situation.executionPlan) {
    const plan = situation.executionPlan;
    const completedSteps = plan.steps.filter(s => s.status === "completed").length;
    const currentStep = plan.steps.find(s => s.sequenceOrder === plan.currentStepOrder);
    const stepList = plan.steps.map(s => {
      const icon = s.status === "completed" ? "✓" : s.sequenceOrder === plan.currentStepOrder ? "→" : "○";
      return `  ${icon} ${s.title} [${s.executionMode}] (${s.status})`;
    }).join("\n");
    planSection = `\nExecution Status: ${plan.status} (${completedSteps}/${plan.steps.length} steps)`;
    if (currentStep) planSection += ` — current: ${currentStep.title}`;
    planSection += `\n${stepList}`;

    // FollowUps — query via step IDs from the plan
    const stepIds = await prisma.executionStep.findMany({
      where: { planId: plan.id },
      select: { id: true },
    });
    const followUpRecords = stepIds.length > 0
      ? await prisma.followUp.findMany({
          where: { executionStepId: { in: stepIds.map(s => s.id) }, status: "watching" },
          select: { status: true, triggerAt: true },
        })
      : [];
    if (followUpRecords.length > 0) {
      const fuLines = followUpRecords.map(fu =>
        `  - ${fu.status}${fu.triggerAt ? ` (deadline: ${fu.triggerAt.toISOString().split("T")[0]})` : ""}`
      ).join("\n");
      planSection += `\n\nFollow-ups:\n${fuLines}`;
    }
  }

  // WorkStream membership
  let wsSection = "";
  const wsItem = await prisma.workStreamItem.findFirst({
    where: { itemType: "situation", itemId: situationId },
    select: {
      workStream: {
        select: {
          title: true,
          items: {
            select: { itemType: true, itemId: true },
            take: 10,
          },
        },
      },
    },
  });
  if (wsItem) {
    const otherItems = wsItem.workStream.items
      .filter(i => !(i.itemType === "situation" && i.itemId === situationId))
      .length;
    wsSection = `\nRelated Project: ${wsItem.workStream.title} (${otherItems} other items)`;
  }

  return [
    "SITUATION CONTEXT:",
    `Status: ${situation.status} | Severity: ${situation.severity.toFixed(1)} | Detected: ${situation.createdAt.toISOString().split("T")[0]}`,
    `Type: ${situation.situationType.name} — ${situation.situationType.description}`,
    triggerInfo,
    analysisSection,
    actionSection,
    planSection,
    wsSection,
  ].filter(Boolean).join("\n");
}

// ── Initiative Context ───────────────────────────────────────────────────────

export async function loadInitiativeContext(
  initiativeId: string,
  operatorId: string,
): Promise<string | null> {
  const initiative = await prisma.initiative.findFirst({
    where: { id: initiativeId, operatorId },
    select: {
      id: true,
      status: true,
      rationale: true,
      impactAssessment: true,
      aiEntityId: true,
      createdAt: true,
      goal: {
        select: { title: true, description: true, priority: true, deadline: true },
      },
      executionPlan: {
        select: {
          id: true,
          status: true,
          currentStepOrder: true,
          steps: {
            select: { title: true, executionMode: true, status: true, sequenceOrder: true },
            orderBy: { sequenceOrder: "asc" },
          },
        },
      },
    },
  });

  if (!initiative) return null;

  // Resolve AI entity name
  let aiEntityInfo = "";
  const aiEntity = await prisma.entity.findUnique({
    where: { id: initiative.aiEntityId },
    select: { displayName: true, parentDepartmentId: true },
  });
  if (aiEntity) {
    let deptName = "";
    if (aiEntity.parentDepartmentId) {
      const dept = await prisma.entity.findUnique({
        where: { id: aiEntity.parentDepartmentId },
        select: { displayName: true },
      });
      deptName = dept ? ` (${dept.displayName})` : "";
    }
    aiEntityInfo = `Proposed by: ${aiEntity.displayName}${deptName}`;
  }

  // Goal section
  const goal = initiative.goal;
  const goalSection = goal ? [
    `\nGoal: ${goal.title}`,
    goal.description ? `Goal description: ${goal.description}` : null,
    `Goal priority: ${goal.priority} | Deadline: ${goal.deadline ? goal.deadline.toISOString().split("T")[0] : "none"}`,
  ].filter(Boolean).join("\n") : "";

  // Rationale
  const rationaleSection = `\nRationale:\n${initiative.rationale}`;

  // Impact
  const impactSection = initiative.impactAssessment
    ? `\nImpact Assessment:\n${initiative.impactAssessment}`
    : "";

  // Execution plan
  let planSection = "";
  if (initiative.executionPlan) {
    const plan = initiative.executionPlan;
    const stepLines = plan.steps.map(s => {
      const icon = s.status === "completed" ? "✓" : s.sequenceOrder === plan.currentStepOrder ? "→" : "○";
      return `  ${icon} ${s.title} [${s.executionMode}] (${s.status})`;
    }).join("\n");
    planSection = `\nExecution Plan (${plan.status}):\n${stepLines}`;
  }

  // WorkStream membership
  let wsSection = "";
  const wsItem = await prisma.workStreamItem.findFirst({
    where: { itemType: "initiative", itemId: initiativeId },
    select: { workStream: { select: { title: true } } },
  });
  if (wsItem) {
    wsSection = `\nRelated Project: ${wsItem.workStream.title}`;
  }

  return [
    "INITIATIVE CONTEXT:",
    `Status: ${initiative.status} | Created: ${initiative.createdAt.toISOString().split("T")[0]}`,
    aiEntityInfo,
    goalSection,
    rationaleSection,
    impactSection,
    planSection,
    wsSection,
  ].filter(Boolean).join("\n");
}

// ── WorkStream Context ───────────────────────────────────────────────────────

export async function loadWorkStreamContext(
  workStreamId: string,
  operatorId: string,
): Promise<string | null> {
  // Verify operator ownership
  const ws = await prisma.workStream.findFirst({
    where: { id: workStreamId, operatorId },
    select: { id: true },
  });
  if (!ws) return null;

  const ctx = await getWorkStreamContext(workStreamId);
  if (!ctx) return null;

  const itemLines = ctx.items.map(item => {
    const icon = item.type === "situation" ? "📋" : "💡";
    return `  ${icon} ${item.summary.slice(0, 150)} (${item.status})`;
  }).join("\n");

  // Load child count
  const childCount = await prisma.workStream.count({
    where: { parentWorkStreamId: workStreamId },
  });

  return [
    "PROJECT CONTEXT:",
    `Title: ${ctx.title}`,
    `Status: ${ctx.status}${ctx.goal ? ` | Goal: ${ctx.goal.title}` : ""}`,
    ctx.description ? `Description: ${ctx.description}` : null,
    itemLines ? `\nItems:\n${itemLines}` : "\nItems: none",
    ctx.parent ? `\nParent project: ${ctx.parent.title}` : null,
    childCount > 0 ? `Sub-projects: ${childCount}` : null,
  ].filter(Boolean).join("\n");
}

// ── System Health Context ────────────────────────────────────────────────────

export async function loadSystemHealthContext(
  operatorId: string,
  visibleDepts: string[] | "all",
): Promise<string | null> {
  const healthRows = await prisma.departmentHealth.findMany({
    where: { operatorId },
    select: { departmentEntityId: true, snapshot: true, computedAt: true },
  });

  if (healthRows.length === 0) return null;

  // Scope filter: members only see their departments
  const filteredRows = visibleDepts === "all"
    ? healthRows
    : healthRows.filter(
        (r) => r.departmentEntityId === null || visibleDepts.includes(r.departmentEntityId),
      );

  return formatHealthContext(filteredRows);
}

function formatHealthContext(
  healthRows: { departmentEntityId: string | null; snapshot: unknown; computedAt: Date }[],
): string {
  const lines: string[] = ["## Current System Health Status\n"];

  const operatorRow = healthRows.find((r) => r.departmentEntityId === null);
  if (operatorRow) {
    const snap = operatorRow.snapshot as OperatorSnapshot;
    lines.push(`Overall: ${snap.overallStatus} (${snap.criticalIssueCount} critical issues)`);
    lines.push(`Last computed: ${operatorRow.computedAt.toISOString()}\n`);
  }

  const deptRows = healthRows.filter((r) => r.departmentEntityId !== null);
  for (const row of deptRows) {
    const dept = row.snapshot as DepartmentSnapshot;

    if (dept.overallStatus === "healthy") continue;

    lines.push(`### ${dept.departmentName} — ${dept.overallStatus}`);

    if (dept.dataPipeline.status !== "healthy") {
      lines.push(`Data Pipeline: ${dept.dataPipeline.status}`);
      for (const conn of dept.dataPipeline.connectors) {
        if (conn.issue) {
          lines.push(`  - ${conn.name} (${conn.provider}): ${conn.issue}`);
        }
      }
    }

    if (dept.knowledge.status !== "complete") {
      lines.push(`Knowledge: ${dept.knowledge.status}`);
      for (const gap of dept.knowledge.people.gaps) {
        lines.push(`  - ${gap}`);
      }
      if (dept.knowledge.documents.count === 0) {
        lines.push("  - No operational documents uploaded");
      }
      if (dept.knowledge.operationalInsights.count === 0) {
        lines.push("  - No operational patterns learned yet");
      }
    }

    if (dept.detection.status !== "active") {
      lines.push(`Detection: ${dept.detection.status}`);
      for (const st of dept.detection.situationTypes) {
        if (st.diagnosis !== "healthy") {
          lines.push(`  - ${st.name}: ${st.diagnosis} — ${st.diagnosisDetail}`);
        }
      }
    }

    lines.push("");
  }

  const healthyDepts = deptRows
    .filter((r) => (r.snapshot as DepartmentSnapshot).overallStatus === "healthy")
    .map((r) => (r.snapshot as DepartmentSnapshot).departmentName);

  if (healthyDepts.length > 0) {
    lines.push(`Healthy departments (no issues): ${healthyDepts.join(", ")}`);
  }

  return lines.join("\n");
}

// ── Context Loader Dispatcher ────────────────────────────────────────────────

export async function loadContextForCopilot(
  contextType: string,
  contextId: string,
  operatorId: string,
): Promise<string | null> {
  switch (contextType) {
    case "situation":
      return loadSituationContext(contextId, operatorId);
    case "initiative":
      return loadInitiativeContext(contextId, operatorId);
    case "workstream":
      return loadWorkStreamContext(contextId, operatorId);
    default:
      return null;
  }
}

// ── Role Instructions ────────────────────────────────────────────────────────

export function getContextRoleInstruction(contextType: string): string {
  switch (contextType) {
    case "situation":
      return "You are advising on this specific situation. You have full context about the AI's analysis, the proposed action plan, and the current execution status. Help the user understand the situation, evaluate the AI's reasoning, discuss alternatives, or take action. If the user wants to approve or modify the plan, guide them through the options.";
    case "initiative":
      return "You are advising on this specific initiative proposed by the department AI. You have full context about the goal it serves, the rationale, and the execution plan. Help the user evaluate whether this initiative makes sense, discuss the approach, or understand the expected impact.";
    case "workstream":
      return "You are advising on this project. You have full context about all the items grouped in this work stream, their current statuses, and the goal being served. Help the user understand project progress, identify blockers, or plan next steps.";
    case "system-health":
      return "The user is viewing the System Health page. Help them understand and resolve any issues shown. When suggesting fixes, provide specific navigation paths (e.g., \"Go to Settings → Connections to reconnect Gmail\"). If a department has no issues, say so briefly. Focus on actionable advice — what specifically should the user do next to improve their system health.";
    default:
      return "";
  }
}
