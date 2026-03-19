import { z } from "zod";
import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import { createExecutionPlan, type StepDefinition } from "@/lib/execution-engine";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { ensureInternalCapabilities } from "@/lib/internal-capabilities";

// ── Zod Schema ──────────────────────────────────────────────────────────────

const InitiativeStepSchema = z.object({
  title: z.string(),
  description: z.string(),
  executionMode: z.enum(["action", "generate", "human_task"]),
  actionCapabilityName: z.string().optional(),
  params: z.record(z.any()).optional(),
});

const InitiativeProposalSchema = z.object({
  goalId: z.string(),
  rationale: z.string().min(20),
  impactAssessment: z.string().min(10),
  steps: z.array(InitiativeStepSchema).min(1),
});

const InitiativeReasoningOutputSchema = z.object({
  proposals: z.array(InitiativeProposalSchema),
  analysis: z.string(),
});

// ── Department Goals ────────────────────────────────────────────────────────

export async function evaluateDepartmentGoals(
  departmentId: string,
  operatorId: string,
): Promise<void> {
  await ensureInternalCapabilities(operatorId);

  // 1. Load department AI entity
  const deptAi = await prisma.entity.findFirst({
    where: { operatorId, ownerDepartmentId: departmentId, status: "active" },
    select: { id: true },
  });
  if (!deptAi) {
    console.warn(`[initiative-reasoning] No department AI for department ${departmentId}`);
    return;
  }

  // 2. Load context
  const goals = await prisma.goal.findMany({
    where: { operatorId, departmentId, status: "active" },
  });
  if (goals.length === 0) return;

  const goalIds = goals.map(g => g.id);

  const [existingInitiatives, capabilities, situationTypes, recentSituations, insights, department, operator] = await Promise.all([
    prisma.initiative.findMany({
      where: { operatorId, goalId: { in: goalIds }, status: { notIn: ["rejected", "failed"] } },
      select: { goalId: true, status: true, rationale: true },
    }),
    prisma.actionCapability.findMany({
      where: { operatorId, enabled: true },
      include: { connector: { select: { provider: true } } },
    }),
    prisma.situationType.findMany({
      where: { operatorId, scopeEntityId: departmentId, enabled: true },
      select: { name: true, description: true },
    }),
    prisma.situation.findMany({
      where: {
        operatorId,
        situationType: { scopeEntityId: departmentId },
        status: { in: ["resolved", "closed"] },
        resolvedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      select: { outcome: true, status: true },
      take: 100,
    }),
    prisma.operationalInsight.findMany({
      where: {
        operatorId,
        OR: [{ departmentId }, { shareScope: "operator" }],
        status: "active",
      },
      select: { description: true, confidence: true, evidence: true, insightType: true },
    }),
    prisma.entity.findFirst({
      where: { id: departmentId, operatorId },
      select: { displayName: true, description: true },
    }),
    prisma.operator.findUnique({
      where: { id: operatorId },
      select: { companyName: true },
    }),
  ]);

  if (!department) return;

  const memberCount = await prisma.entity.count({
    where: { operatorId, parentDepartmentId: departmentId, category: "base", status: "active" },
  });

  // 3. Build prompt
  const systemPrompt = buildDepartmentSystemPrompt(department.displayName, operator?.companyName ?? "the company");
  const userPrompt = buildUserPrompt(goals, existingInitiatives, capabilities, situationTypes, recentSituations, insights, department.displayName, department.description, memberCount);

  // 4. Call LLM + validate
  const output = await callAndValidate(systemPrompt, userPrompt);
  if (!output) return;

  // 5. Create initiatives
  await createInitiatives(output, operatorId, departmentId, deptAi.id, goalIds, capabilities);
}

// ── HQ Goals ────────────────────────────────────────────────────────────────

export async function evaluateHQGoals(operatorId: string): Promise<void> {
  await ensureInternalCapabilities(operatorId);

  // 1. Load HQ AI entity
  const hqAi = await prisma.entity.findFirst({
    where: { operatorId, entityType: { slug: "hq-ai" }, status: "active" },
    select: { id: true },
  });
  if (!hqAi) {
    console.warn(`[initiative-reasoning] No HQ AI for operator ${operatorId}`);
    return;
  }

  // 2. Load context
  const goals = await prisma.goal.findMany({
    where: { operatorId, departmentId: null, status: "active" },
  });
  if (goals.length === 0) return;

  const goalIds = goals.map(g => g.id);

  const [existingInitiatives, capabilities, situationTypes, recentSituations, insights, operator] = await Promise.all([
    prisma.initiative.findMany({
      where: { operatorId, goalId: { in: goalIds }, status: { notIn: ["rejected", "failed"] } },
      select: { goalId: true, status: true, rationale: true },
    }),
    prisma.actionCapability.findMany({
      where: { operatorId, enabled: true },
      include: { connector: { select: { provider: true } } },
    }),
    prisma.situationType.findMany({
      where: { operatorId, enabled: true },
      select: { name: true, description: true, scopeEntityId: true },
    }),
    prisma.situation.findMany({
      where: {
        operatorId,
        status: { in: ["resolved", "closed"] },
        resolvedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      select: { outcome: true, status: true },
      take: 200,
    }),
    prisma.operationalInsight.findMany({
      where: { operatorId, shareScope: { in: ["department", "operator"] }, status: "active" },
      select: { description: true, confidence: true, evidence: true, insightType: true, departmentId: true },
    }),
    prisma.operator.findUnique({
      where: { id: operatorId },
      select: { companyName: true },
    }),
  ]);

  // Load all departments for cross-department context
  const departments = await prisma.entity.findMany({
    where: { operatorId, category: "foundational" },
    select: { id: true, displayName: true, description: true },
  });

  // 3. Build prompt
  const systemPrompt = buildHQSystemPrompt(operator?.companyName ?? "the company");
  const userPrompt = buildHQUserPrompt(goals, existingInitiatives, capabilities, situationTypes, recentSituations, insights, departments);

  // 4. Call LLM + validate
  const output = await callAndValidate(systemPrompt, userPrompt);
  if (!output) return;

  // 5. Create initiatives
  await createInitiatives(output, operatorId, null, hqAi.id, goalIds, capabilities);
}

// ── LLM Call + Validation ───────────────────────────────────────────────────

type InitiativeReasoningOutput = z.infer<typeof InitiativeReasoningOutputSchema>;

async function callAndValidate(
  systemPrompt: string,
  userPrompt: string,
): Promise<InitiativeReasoningOutput | null> {
  let rawResponse = "";
  let parseError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = [
      { role: "system" as const, content: systemPrompt },
      {
        role: "user" as const,
        content: attempt === 0
          ? userPrompt
          : `${userPrompt}\n\nPREVIOUS ATTEMPT FAILED VALIDATION: ${parseError}\nPlease fix the JSON output to match the required schema exactly.`,
      },
    ];

    try {
      const response = await callLLM(messages, { aiFunction: "reasoning", temperature: 0.3, maxTokens: 4096 });
      rawResponse = response.content;

      const parsed = extractJSON(rawResponse);
      if (!parsed) {
        parseError = "Could not parse JSON from response";
        if (attempt === 0) continue;
        break;
      }

      const result = InitiativeReasoningOutputSchema.safeParse(parsed);
      if (!result.success) {
        parseError = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
        if (attempt === 0) continue;
        break;
      }

      return result.data;
    } catch (err) {
      console.error("[initiative-reasoning] LLM call failed:", err);
      return null;
    }
  }

  console.warn(`[initiative-reasoning] Validation failed: ${parseError}`);
  return null;
}

function extractJSON(text: string): Record<string, unknown> | null {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();
  try {
    const parsed = JSON.parse(jsonStr);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ── Initiative Creation ─────────────────────────────────────────────────────

type CapabilityRow = { id: string; name: string; connectorId: string | null; enabled: boolean; connector: { provider: string } | null };

async function createInitiatives(
  output: InitiativeReasoningOutput,
  operatorId: string,
  departmentId: string | null,
  aiEntityId: string,
  validGoalIds: string[],
  capabilities: CapabilityRow[],
): Promise<void> {
  for (const proposal of output.proposals) {
    // Verify goalId
    if (!validGoalIds.includes(proposal.goalId)) {
      console.warn(`[initiative-reasoning] Proposed goalId "${proposal.goalId}" not in valid set. Skipping.`);
      continue;
    }

    // Resolve actionCapabilityName → actionCapabilityId
    let resolvedSteps: StepDefinition[] | null = [];
    let skipProposal = false;

    for (const step of proposal.steps) {
      let actionCapabilityId: string | undefined;
      if (step.executionMode === "action" && step.actionCapabilityName) {
        const cap = capabilities.find(c => c.name === step.actionCapabilityName);
        if (!cap) {
          console.warn(`[initiative-reasoning] ActionCapability "${step.actionCapabilityName}" not found. Skipping proposal.`);
          skipProposal = true;
          break;
        }
        actionCapabilityId = cap.id;
      }
      resolvedSteps.push({
        title: step.title,
        description: step.description,
        executionMode: step.executionMode,
        actionCapabilityId,
        inputContext: step.params ? { params: step.params } : undefined,
      });
    }

    if (skipProposal || !resolvedSteps || resolvedSteps.length === 0) continue;

    try {
      // Create Initiative
      const initiative = await prisma.initiative.create({
        data: {
          operatorId,
          goalId: proposal.goalId,
          aiEntityId,
          status: "proposed",
          rationale: proposal.rationale,
          impactAssessment: proposal.impactAssessment,
        },
      });

      // Create ExecutionPlan
      const planId = await createExecutionPlan(operatorId, "initiative", initiative.id, resolvedSteps);

      // Link plan to initiative
      await prisma.initiative.update({
        where: { id: initiative.id },
        data: { executionPlanId: planId },
      });

      // Notify admins
      sendNotificationToAdmins({
        operatorId,
        type: "initiative_proposed",
        title: `New initiative proposed: ${resolvedSteps[0].title}`,
        body: proposal.rationale.slice(0, 200),
        sourceType: "initiative",
        sourceId: initiative.id,
      }).catch(() => {});
    } catch (err) {
      console.error(`[initiative-reasoning] Failed to create initiative for goal ${proposal.goalId}:`, err);
    }
  }
}

// ── Prompt Builders ─────────────────────────────────────────────────────────

function buildDepartmentSystemPrompt(departmentName: string, companyName: string): string {
  return `You are the Department AI for ${departmentName} at ${companyName}.
Your role is to evaluate department goals and propose strategic initiatives — multi-step plans that advance the department toward its objectives.

You propose initiatives. Humans approve and oversee execution.

RULES:
- Each proposal MUST link to an existing goal by goalId.
- Steps with executionMode "action" MUST reference a permitted action by name in actionCapabilityName.
- Steps with executionMode "generate" produce LLM-generated content (reports, drafts, analysis).
- Steps with executionMode "human_task" assign work to a human (calls, meetings, decisions that require a person).
- Do NOT propose initiatives that duplicate existing active/executing initiatives for the same goal.
- Be specific and actionable. "Improve customer retention" is not a step. "Draft personalized re-engagement email to clients with declining activity" is.
- Include human_task steps where human judgment or non-digital action is needed.

OUTPUT FORMAT:
Respond with ONLY valid JSON:
{
  "analysis": "your assessment of the department's current state relative to its goals",
  "proposals": [
    {
      "goalId": "the goal this advances",
      "rationale": "why this initiative now, based on evidence",
      "impactAssessment": "expected outcome and how it moves the goal forward",
      "steps": [
        {
          "title": "short step title",
          "description": "detailed description of what this step accomplishes",
          "executionMode": "action | generate | human_task",
          "actionCapabilityName": "action name (for action mode only)",
          "params": { }
        }
      ]
    }
  ]
}

Return an empty proposals array [] if no initiatives are warranted given current state.`;
}

function buildHQSystemPrompt(companyName: string): string {
  return `You are the HQ AI for ${companyName}.
You evaluate organization-level goals and propose cross-department strategic initiatives.

You propose initiatives. Humans approve and oversee execution.

RULES:
- Each proposal MUST link to an existing goal by goalId.
- Steps with executionMode "action" MUST reference a permitted action by name in actionCapabilityName.
- Steps with executionMode "generate" produce LLM-generated content (reports, drafts, analysis).
- Steps with executionMode "human_task" assign work to a human (calls, meetings, decisions that require a person).
- Do NOT propose initiatives that duplicate existing active/executing initiatives for the same goal.
- Be specific and actionable. Consider cross-department coordination needs.
- Include human_task steps where human judgment or non-digital action is needed.

OUTPUT FORMAT:
Respond with ONLY valid JSON:
{
  "analysis": "your assessment of the organization's current state relative to its goals",
  "proposals": [
    {
      "goalId": "the goal this advances",
      "rationale": "why this initiative now, based on evidence",
      "impactAssessment": "expected outcome and how it moves the goal forward",
      "steps": [
        {
          "title": "short step title",
          "description": "detailed description of what this step accomplishes",
          "executionMode": "action | generate | human_task",
          "actionCapabilityName": "action name (for action mode only)",
          "params": { }
        }
      ]
    }
  ]
}

Return an empty proposals array [] if no initiatives are warranted given current state.`;
}

type GoalRow = { id: string; title: string; description: string; measurableTarget: string | null; priority: number; deadline: Date | null };
type InitiativeRow = { goalId: string; status: string; rationale: string };
type SituationTypeRow = { name: string; description: string };
type SituationRow = { outcome: string | null; status: string };
type InsightRow = { description: string; confidence: number; evidence: string; insightType: string };

function buildUserPrompt(
  goals: GoalRow[],
  existingInitiatives: InitiativeRow[],
  capabilities: CapabilityRow[],
  situationTypes: SituationTypeRow[],
  recentSituations: SituationRow[],
  insights: InsightRow[],
  departmentName: string,
  departmentDescription: string | null,
  memberCount: number,
): string {
  const sections: string[] = [];

  // Department info
  sections.push(`DEPARTMENT: ${departmentName}${departmentDescription ? ` — ${departmentDescription}` : ""}\nTeam size: ${memberCount}`);

  // Goals
  const goalsStr = goals.map(g => {
    const deadline = g.deadline ? ` | Deadline: ${g.deadline.toISOString().split("T")[0]}` : "";
    const target = g.measurableTarget ? ` | Target: ${g.measurableTarget}` : "";
    return `  - [${g.id}] ${g.title} (priority ${g.priority}${deadline}${target})\n    ${g.description}`;
  }).join("\n");
  sections.push(`ACTIVE GOALS:\n${goalsStr}`);

  // Existing initiatives
  if (existingInitiatives.length > 0) {
    const initStr = existingInitiatives.map(i =>
      `  - Goal ${i.goalId} | Status: ${i.status} | ${i.rationale.slice(0, 100)}`
    ).join("\n");
    sections.push(`EXISTING INITIATIVES (do not duplicate):\n${initStr}`);
  }

  // Capabilities
  if (capabilities.length > 0) {
    const capStr = capabilities.map(c =>
      `  - ${c.name} (${c.connector?.provider ?? "unknown"})`
    ).join("\n");
    sections.push(`AVAILABLE ACTIONS:\n${capStr}`);
  } else {
    sections.push("AVAILABLE ACTIONS:\nNone. Only generate and human_task steps are possible.");
  }

  // Situation types
  if (situationTypes.length > 0) {
    const stStr = situationTypes.map(s => `  - ${s.name}: ${s.description}`).join("\n");
    sections.push(`MONITORED SITUATION TYPES:\n${stStr}`);
  }

  // Recent situation outcomes
  if (recentSituations.length > 0) {
    const positive = recentSituations.filter(s => s.outcome === "positive").length;
    const negative = recentSituations.filter(s => s.outcome === "negative").length;
    const neutral = recentSituations.length - positive - negative;
    sections.push(`RECENT SITUATION OUTCOMES (90 days):\n  Total: ${recentSituations.length} | Positive: ${positive} | Negative: ${negative} | Neutral/Other: ${neutral}`);
  }

  // Insights
  if (insights.length > 0) {
    const insightStr = insights.slice(0, 10).map(i =>
      `  - [${i.insightType}] ${i.description} (confidence: ${i.confidence.toFixed(2)})`
    ).join("\n");
    sections.push(`OPERATIONAL INSIGHTS:\n${insightStr}`);
  }

  return sections.join("\n\n");
}

type HQSituationTypeRow = { name: string; description: string; scopeEntityId: string | null };
type HQInsightRow = InsightRow & { departmentId: string | null };
type DepartmentRow = { id: string; displayName: string; description: string | null };

function buildHQUserPrompt(
  goals: GoalRow[],
  existingInitiatives: InitiativeRow[],
  capabilities: CapabilityRow[],
  situationTypes: HQSituationTypeRow[],
  recentSituations: SituationRow[],
  insights: HQInsightRow[],
  departments: DepartmentRow[],
): string {
  const sections: string[] = [];

  // Departments overview
  if (departments.length > 0) {
    const deptStr = departments.map(d =>
      `  - ${d.displayName}${d.description ? `: ${d.description}` : ""}`
    ).join("\n");
    sections.push(`DEPARTMENTS:\n${deptStr}`);
  }

  // Goals
  const goalsStr = goals.map(g => {
    const deadline = g.deadline ? ` | Deadline: ${g.deadline.toISOString().split("T")[0]}` : "";
    const target = g.measurableTarget ? ` | Target: ${g.measurableTarget}` : "";
    return `  - [${g.id}] ${g.title} (priority ${g.priority}${deadline}${target})\n    ${g.description}`;
  }).join("\n");
  sections.push(`HQ-LEVEL GOALS:\n${goalsStr}`);

  // Existing initiatives
  if (existingInitiatives.length > 0) {
    const initStr = existingInitiatives.map(i =>
      `  - Goal ${i.goalId} | Status: ${i.status} | ${i.rationale.slice(0, 100)}`
    ).join("\n");
    sections.push(`EXISTING INITIATIVES (do not duplicate):\n${initStr}`);
  }

  // Capabilities
  if (capabilities.length > 0) {
    const capStr = capabilities.map(c =>
      `  - ${c.name} (${c.connector?.provider ?? "unknown"})`
    ).join("\n");
    sections.push(`AVAILABLE ACTIONS:\n${capStr}`);
  } else {
    sections.push("AVAILABLE ACTIONS:\nNone. Only generate and human_task steps are possible.");
  }

  // Situation types (cross-department)
  if (situationTypes.length > 0) {
    const stStr = situationTypes.slice(0, 20).map(s => `  - ${s.name}: ${s.description}`).join("\n");
    sections.push(`MONITORED SITUATION TYPES (all departments):\n${stStr}`);
  }

  // Recent situation outcomes
  if (recentSituations.length > 0) {
    const positive = recentSituations.filter(s => s.outcome === "positive").length;
    const negative = recentSituations.filter(s => s.outcome === "negative").length;
    const neutral = recentSituations.length - positive - negative;
    sections.push(`RECENT SITUATION OUTCOMES (90 days, all departments):\n  Total: ${recentSituations.length} | Positive: ${positive} | Negative: ${negative} | Neutral/Other: ${neutral}`);
  }

  // Insights (cross-department)
  if (insights.length > 0) {
    const insightStr = insights.slice(0, 15).map(i => {
      const dept = i.departmentId ? ` [dept]` : ` [org-wide]`;
      return `  - [${i.insightType}]${dept} ${i.description} (confidence: ${i.confidence.toFixed(2)})`;
    }).join("\n");
    sections.push(`OPERATIONAL INSIGHTS:\n${insightStr}`);
  }

  return sections.join("\n\n");
}
