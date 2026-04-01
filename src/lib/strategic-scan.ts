import { prisma } from "@/lib/db";
import { callLLM, getModel, getThinkingBudget } from "@/lib/ai-provider";
import { retrieveRelevantContext } from "@/lib/rag/retriever";
import { extractJSON } from "@/lib/json-helpers";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

// ── Types ────────────────────────────────────────────────────────────────────

interface ScanApproach {
  name: string;
  weight: number; // higher = more likely to be selected
  execute: (operatorId: string) => Promise<ScanResult[]>;
}

export interface ScanResult {
  title: string;
  description: string;
  rationale: string;
  impactAssessment: string;
  departmentId: string | null; // null = company-wide
  urgency: "low" | "medium" | "high";
  confidence: number; // 0-1
  approach: string; // which scan approach found this
  evidence: Array<{ type: string; summary: string }>; // what data supported this finding
}

interface DepartmentAuditContext {
  department: {
    id: string;
    name: string;
    description: string | null;
    memberCount: number;
    members: Array<{ name: string; role: string | null; email: string | null }>;
  };
  openSituations: Array<{ id: string; typeName: string; entityName: string; status: string; severity: number; createdAt: string }>;
  recentResolvedSituations: Array<{ typeName: string; entityName: string; outcome: string | null; feedback: string | null; resolvedAt: string }>;
  situationTypes: Array<{ name: string; description: string; detectedCount: number; confirmedCount: number }>;
  goals: Array<{ title: string; description: string; measurableTarget: string | null; priority: number; deadline: string | null }>;
  knowledgeExcerpts: Array<{ documentName: string; content: string; score: number }>;
  communicationPatterns: {
    emailVolumeLast30Days: number;
    meetingCountLast30Days: number;
    avgResponseTimeHours: number | null;
  };
  crossDepartmentInteractions: Array<{ departmentName: string; emailCount: number; meetingCount: number }>;
  activeInitiatives: Array<{ title: string; status: string; goalTitle: string }>;
}

// ── Approach Registry ────────────────────────────────────────────────────────

const approaches: ScanApproach[] = [
  {
    name: "department_audit",
    weight: 1.0,
    execute: runDepartmentAudit,
  },
  // Future approaches will be added here:
  // { name: "hypothesis_investigation", weight: 1.0, execute: runHypothesisInvestigation },
  // { name: "decision_review", weight: 0.8, execute: runDecisionReview },
  // { name: "structural_vulnerability", weight: 0.7, execute: runStructuralVulnerability },
  // { name: "say_vs_do_divergence", weight: 0.9, execute: runSayVsDoDivergence },
  // { name: "recurrence_detection", weight: 0.8, execute: runRecurrenceDetection },
  // { name: "cross_department_friction", weight: 0.7, execute: runCrossDepartmentFriction },
  // { name: "relationship_trend", weight: 0.6, execute: runRelationshipTrend },
  // { name: "workload_imbalance", weight: 0.7, execute: runWorkloadImbalance },
  // { name: "blind_spot_detection", weight: 0.5, execute: runBlindSpotDetection },
  // { name: "critical_dependency", weight: 0.6, execute: runCriticalDependency },
  // { name: "resilience_probing", weight: 0.4, execute: runResilienceProbing },
  // { name: "decision_propagation", weight: 0.5, execute: runDecisionPropagation },
];

// ── Main Entry Point ─────────────────────────────────────────────────────────

export async function runStrategicScan(operatorId: string): Promise<{
  approach: string;
  results: ScanResult[];
  initiativesCreated: number;
}> {
  // Billing gate — don't consume LLM credits for depleted/cancelled operators
  const op = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { billingStatus: true, aiPaused: true },
  });
  if (op?.aiPaused) {
    console.log(`[strategic-scan] Skipping operator ${operatorId} — AI paused`);
    return { approach: "none", results: [], initiativesCreated: 0 };
  }
  if (op?.billingStatus === "depleted" || op?.billingStatus === "cancelled") {
    console.log(`[strategic-scan] Skipping operator ${operatorId} — billing ${op.billingStatus}`);
    return { approach: "none", results: [], initiativesCreated: 0 };
  }

  // 1. Select approach (for now, only department_audit — future: weighted random)
  const approach = selectApproach();

  console.log(`[strategic-scan] Running approach: ${approach.name} for operator ${operatorId}`);

  // 2. Execute
  const results = await approach.execute(operatorId);

  // 3. Create initiatives from results
  let created = 0;
  for (const result of results) {
    try {
      const wasCreated = await createInitiativeFromScan(operatorId, result);
      if (wasCreated) created++;
    } catch (err) {
      console.error(`[strategic-scan] Failed to create initiative from result "${result.title}":`, err);
    }
  }

  console.log(`[strategic-scan] Completed: ${results.length} findings, ${created} initiatives created`);

  return { approach: approach.name, results, initiativesCreated: created };
}

function selectApproach(): ScanApproach {
  // For now: always department_audit (only one implemented)
  // Future: weighted random selection, biased by time since last run and recent activity
  return approaches[0];
}

// ── Department Audit Approach ────────────────────────────────────────────────

async function runDepartmentAudit(operatorId: string): Promise<ScanResult[]> {
  // 1. Select a department to audit
  const department = await selectDepartmentForAudit(operatorId);
  if (!department) {
    console.log("[strategic-scan:dept-audit] No departments available for audit");
    return [];
  }

  console.log(`[strategic-scan:dept-audit] Auditing department: ${department.displayName}`);

  // 2. Load comprehensive context
  const context = await loadDepartmentAuditContext(operatorId, department.id, department.displayName);

  // 3. LLM reasoning
  const results = await reasonAboutDepartment(operatorId, context);

  return results;
}

export async function selectDepartmentForAudit(operatorId: string): Promise<{ id: string; displayName: string } | null> {
  // Get all departments
  const departments = await prisma.entity.findMany({
    where: {
      operatorId,
      category: "foundational",
      status: "active",
      entityType: { slug: "department" },
    },
    select: { id: true, displayName: true },
  });

  if (departments.length === 0) return null;

  // Weighted selection: prefer departments that haven't been audited recently.
  // Check the most recent strategic scan initiative for each department.
  const recentScans = await prisma.initiative.findMany({
    where: {
      operatorId,
      rationale: { contains: "[strategic-scan:department_audit]" },
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // last 7 days
    },
    select: { rationale: true, createdAt: true },
  });

  // Extract department IDs from recent scan rationales
  const recentlyScannedIds = new Set<string>();
  for (const scan of recentScans) {
    const match = scan.rationale.match(/dept:([a-z0-9_-]+)/);
    if (match) recentlyScannedIds.add(match[1]);
  }

  // Prefer departments not recently scanned
  const unscanned = departments.filter(d => !recentlyScannedIds.has(d.id));
  const pool = unscanned.length > 0 ? unscanned : departments;

  // Random from pool
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function loadDepartmentAuditContext(
  operatorId: string,
  departmentId: string,
  departmentName: string,
): Promise<DepartmentAuditContext> {
  // Members
  const members = await prisma.entity.findMany({
    where: { operatorId, parentDepartmentId: departmentId, category: "base", status: "active" },
    include: {
      propertyValues: { include: { property: { select: { slug: true } } } },
    },
    take: 50,
  });

  const memberData = members.map(m => {
    const role = m.propertyValues.find(pv => pv.property.slug === "role" || pv.property.slug === "job-title")?.value ?? null;
    const email = m.propertyValues.find(pv => pv.property.slug === "email")?.value ?? null;
    return { name: m.displayName, role, email };
  });

  // Department entity
  const dept = await prisma.entity.findUnique({
    where: { id: departmentId },
    select: { displayName: true, description: true },
  });

  // Open situations for this department's situation types
  const openSituations = await prisma.situation.findMany({
    where: {
      operatorId,
      situationType: { scopeEntityId: departmentId },
      status: { notIn: ["resolved", "closed"] },
    },
    include: {
      situationType: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const openSitEntityIds = openSituations.map(s => s.triggerEntityId).filter(Boolean) as string[];
  const openSitEntities = openSitEntityIds.length > 0
    ? await prisma.entity.findMany({ where: { id: { in: openSitEntityIds } }, select: { id: true, displayName: true } })
    : [];
  const openSitEntityMap = new Map(openSitEntities.map(e => [e.id, e.displayName]));

  // Recent resolved situations (last 90 days)
  const recentResolved = await prisma.situation.findMany({
    where: {
      operatorId,
      situationType: { scopeEntityId: departmentId },
      status: { in: ["resolved", "closed"] },
      resolvedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    },
    include: {
      situationType: { select: { name: true } },
    },
    orderBy: { resolvedAt: "desc" },
    take: 30,
  });

  const resolvedEntityIds = recentResolved.map(s => s.triggerEntityId).filter(Boolean) as string[];
  const resolvedEntities = resolvedEntityIds.length > 0
    ? await prisma.entity.findMany({ where: { id: { in: resolvedEntityIds } }, select: { id: true, displayName: true } })
    : [];
  const resolvedEntityMap = new Map(resolvedEntities.map(e => [e.id, e.displayName]));

  // Situation types
  const situationTypes = await prisma.situationType.findMany({
    where: { operatorId, scopeEntityId: departmentId, enabled: true },
    select: { name: true, description: true, detectedCount: true, confirmedCount: true },
  });

  // Goals
  const goals = await prisma.goal.findMany({
    where: { operatorId, departmentId, status: "active" },
    select: { title: true, description: true, measurableTarget: true, priority: true, deadline: true },
  });
  // Also include HQ-level goals
  const hqGoals = await prisma.goal.findMany({
    where: { operatorId, departmentId: null, status: "active" },
    select: { title: true, description: true, measurableTarget: true, priority: true, deadline: true },
  });

  // Knowledge base excerpts relevant to this department
  let knowledgeExcerpts: Array<{ documentName: string; content: string; score: number }> = [];
  try {
    const chunks = await retrieveRelevantContext(
      `${departmentName} department operations processes challenges improvements`,
      operatorId,
      [departmentId],
      10,
    );
    knowledgeExcerpts = chunks.map(c => ({
      documentName: c.documentName ?? "Unknown",
      content: c.content.slice(0, 500),
      score: c.score,
    }));
  } catch (err) {
    console.warn("[strategic-scan:dept-audit] RAG retrieval failed:", err);
  }

  // Communication patterns (aggregate activity signals)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const memberIds = members.map(m => m.id);

  const [emailCount, meetingCount] = await Promise.all([
    prisma.activitySignal.count({
      where: {
        operatorId,
        actorEntityId: { in: memberIds },
        signalType: { in: ["email_sent", "email_received"] },
        occurredAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.activitySignal.count({
      where: {
        operatorId,
        actorEntityId: { in: memberIds },
        signalType: { in: ["meeting_attended", "meeting_organized"] },
        occurredAt: { gte: thirtyDaysAgo },
      },
    }),
  ]);

  // Cross-department interactions (placeholder — full cross-department signal analysis deferred)
  const allDepts = await prisma.entity.findMany({
    where: {
      operatorId,
      category: "foundational",
      status: "active",
      entityType: { slug: "department" },
      id: { not: departmentId },
    },
    select: { id: true, displayName: true },
  });

  const crossDeptData = allDepts.map(d => ({
    departmentName: d.displayName,
    emailCount: 0,
    meetingCount: 0,
  }));

  // Active initiatives
  const activeInitiatives = await prisma.initiative.findMany({
    where: {
      operatorId,
      status: { in: ["proposed", "approved", "executing"] },
      goal: { departmentId },
    },
    include: { goal: { select: { title: true } } },
    take: 10,
  });

  return {
    department: {
      id: departmentId,
      name: dept?.displayName ?? departmentName,
      description: dept?.description ?? null,
      memberCount: members.length,
      members: memberData,
    },
    openSituations: openSituations.map(s => ({
      id: s.id,
      typeName: s.situationType.name,
      entityName: s.triggerEntityId ? (openSitEntityMap.get(s.triggerEntityId) ?? "Unknown") : "Unknown",
      status: s.status,
      severity: s.severity,
      createdAt: s.createdAt.toISOString(),
    })),
    recentResolvedSituations: recentResolved.map(s => ({
      typeName: s.situationType.name,
      entityName: s.triggerEntityId ? (resolvedEntityMap.get(s.triggerEntityId) ?? "Unknown") : "Unknown",
      outcome: s.outcome,
      feedback: s.feedback,
      resolvedAt: s.resolvedAt?.toISOString() ?? "",
    })),
    situationTypes,
    goals: [...goals, ...hqGoals].map(g => ({
      title: g.title,
      description: g.description,
      measurableTarget: g.measurableTarget,
      priority: g.priority,
      deadline: g.deadline?.toISOString() ?? null,
    })),
    knowledgeExcerpts,
    communicationPatterns: {
      emailVolumeLast30Days: emailCount,
      meetingCountLast30Days: meetingCount,
      avgResponseTimeHours: null, // deferred — requires more complex query
    },
    crossDepartmentInteractions: crossDeptData,
    activeInitiatives: activeInitiatives.map(i => ({
      title: i.rationale.slice(0, 100),
      status: i.status,
      goalTitle: i.goal.title,
    })),
  };
}

// ── LLM Reasoning ────────────────────────────────────────────────────────────

const DEPARTMENT_AUDIT_SYSTEM_PROMPT = `You are a strategic operations analyst conducting a department audit. Your job is to find genuine improvement opportunities — not generic advice.

You are looking for CRACKS and VULNERABILITIES in how this department operates. Think like a security researcher auditing a codebase: look for structural weaknesses, missing error handling, single points of failure, unhandled edge cases, and performance bottlenecks.

## What to look for:

1. **Operational bottlenecks** — Processes that are slower than they should be, manual steps that could be automated, handoff points where things get stuck
2. **Risk concentrations** — Single points of failure (one person holds all knowledge), unmitigated dependencies, missing backup processes
3. **Goal misalignment** — Activities that don't connect to stated goals, goals that have no supporting activities, conflicting priorities
4. **Pattern repetition** — The same type of situation recurring repeatedly (indicates root cause not addressed), the same feedback appearing on resolved situations
5. **Capacity issues** — Team members who appear overloaded (many open situations, high email volume) or underutilized, mismatched workload distribution
6. **Missing monitoring** — Important aspects of the department that have no situation types watching them, blind spots in data coverage
7. **Communication gaps** — Low interaction with departments they should collaborate with, information not flowing to the right people

## Output rules:

- Only propose initiatives you can JUSTIFY from the provided data. No generic recommendations.
- Each finding must cite specific evidence from the context (open situations, resolved patterns, communication data, knowledge excerpts).
- If the department is running well and you find nothing actionable — return an empty array. That's a valid outcome.
- Limit to 3 findings maximum. Quality over quantity. Each finding should be substantial enough to warrant an initiative.
- Urgency: "high" = this is actively causing problems now. "medium" = this will cause problems if not addressed. "low" = improvement opportunity, not urgent.

Respond with ONLY valid JSON (no markdown fences):
[
  {
    "title": "Concise finding title",
    "description": "Full description of the finding and proposed improvement",
    "rationale": "Why this matters — what happens if it's not addressed",
    "impactAssessment": "Expected impact if the initiative is executed",
    "urgency": "low" | "medium" | "high",
    "confidence": 0.0-1.0,
    "evidence": [
      { "type": "situation_pattern" | "communication_gap" | "knowledge_gap" | "workload" | "goal_misalignment" | "structural", "summary": "specific evidence" }
    ]
  }
]`;

async function reasonAboutDepartment(
  operatorId: string,
  context: DepartmentAuditContext,
): Promise<ScanResult[]> {
  const sections: string[] = [];

  // Department overview
  sections.push(`DEPARTMENT: ${context.department.name}${context.department.description ? ` — ${context.department.description}` : ""}`);
  sections.push(`Team size: ${context.department.memberCount}`);
  if (context.department.members.length > 0) {
    const memberStr = context.department.members.map(m =>
      `  - ${m.name}${m.role ? ` (${m.role})` : ""}`
    ).join("\n");
    sections.push(`TEAM MEMBERS:\n${memberStr}`);
  }

  // Goals
  if (context.goals.length > 0) {
    const goalStr = context.goals.map(g => {
      const parts = [`  - ${g.title} (priority ${g.priority})`];
      if (g.measurableTarget) parts.push(`    Target: ${g.measurableTarget}`);
      if (g.deadline) parts.push(`    Deadline: ${g.deadline.split("T")[0]}`);
      parts.push(`    ${g.description}`);
      return parts.join("\n");
    }).join("\n");
    sections.push(`ACTIVE GOALS:\n${goalStr}`);
  } else {
    sections.push("ACTIVE GOALS: None defined. This itself may be a finding.");
  }

  // Situation types being monitored
  if (context.situationTypes.length > 0) {
    const stStr = context.situationTypes.map(st =>
      `  - ${st.name}: ${st.description} (detected: ${st.detectedCount}, confirmed: ${st.confirmedCount})`
    ).join("\n");
    sections.push(`MONITORED SITUATION TYPES:\n${stStr}`);
  } else {
    sections.push("MONITORED SITUATION TYPES: None. The department has no active monitoring.");
  }

  // Open situations
  if (context.openSituations.length > 0) {
    const openStr = context.openSituations.map(s =>
      `  - [${s.status}] ${s.typeName}: ${s.entityName} (severity: ${s.severity.toFixed(1)}, ${s.createdAt.split("T")[0]})`
    ).join("\n");
    sections.push(`OPEN SITUATIONS (${context.openSituations.length}):\n${openStr}`);
  } else {
    sections.push("OPEN SITUATIONS: None.");
  }

  // Recent resolved situations
  if (context.recentResolvedSituations.length > 0) {
    const resolvedStr = context.recentResolvedSituations.slice(0, 15).map(s =>
      `  - ${s.typeName}: ${s.entityName} → ${s.outcome ?? "no outcome recorded"}${s.feedback ? ` | Feedback: "${s.feedback}"` : ""}`
    ).join("\n");
    sections.push(`RECENTLY RESOLVED (90 days, ${context.recentResolvedSituations.length} total):\n${resolvedStr}`);
  }

  // Communication patterns
  sections.push(`COMMUNICATION (last 30 days):\n  Emails: ${context.communicationPatterns.emailVolumeLast30Days}\n  Meetings: ${context.communicationPatterns.meetingCountLast30Days}`);

  // Knowledge excerpts
  if (context.knowledgeExcerpts.length > 0) {
    const kbStr = context.knowledgeExcerpts.slice(0, 5).map(k =>
      `  [${k.documentName}]: ${k.content}`
    ).join("\n\n");
    sections.push(`RELEVANT KNOWLEDGE BASE EXCERPTS:\n${kbStr}`);
  }

  // Active initiatives
  if (context.activeInitiatives.length > 0) {
    const initStr = context.activeInitiatives.map(i =>
      `  - [${i.status}] ${i.title} (goal: ${i.goalTitle})`
    ).join("\n");
    sections.push(`ACTIVE INITIATIVES (do not duplicate):\n${initStr}`);
  }

  const userPrompt = sections.join("\n\n");

  const response = await callLLM({
    instructions: DEPARTMENT_AUDIT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    temperature: 0.3,
    maxTokens: 32768,
    aiFunction: "reasoning",
    model: getModel("strategicScan"),
    thinking: true,
    thinkingBudget: getThinkingBudget("strategicScan") ?? undefined,
  });

  const parsed = extractJSON(response.text);
  if (!Array.isArray(parsed)) {
    console.warn("[strategic-scan:dept-audit] Failed to parse LLM response as array");
    return [];
  }

  return parsed.slice(0, 3).map((r: Record<string, unknown>) => ({
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    rationale: String(r.rationale ?? ""),
    impactAssessment: String(r.impactAssessment ?? ""),
    departmentId: context.department.id,
    urgency: (["low", "medium", "high"].includes(r.urgency as string) ? r.urgency : "medium") as "low" | "medium" | "high",
    confidence: typeof r.confidence === "number" ? r.confidence : 0.5,
    approach: "department_audit",
    evidence: Array.isArray(r.evidence)
      ? r.evidence.map((e: Record<string, unknown>) => ({ type: String(e.type ?? ""), summary: String(e.summary ?? "") }))
      : [],
  }));
}

// ── Initiative Creation ──────────────────────────────────────────────────────

export async function createInitiativeFromScan(
  operatorId: string,
  result: ScanResult,
): Promise<boolean> {
  // Find or create a goal for this department to attach the initiative to
  let goalId: string | null = null;

  if (result.departmentId) {
    // Look for existing active goals in this department
    const existingGoal = await prisma.goal.findFirst({
      where: { operatorId, departmentId: result.departmentId, status: "active" },
      select: { id: true },
      orderBy: { priority: "asc" }, // highest priority first
    });

    if (existingGoal) {
      goalId = existingGoal.id;
    } else {
      // Create a catch-all improvement goal for the department
      const dept = await prisma.entity.findUnique({
        where: { id: result.departmentId },
        select: { displayName: true },
      });
      const newGoal = await prisma.goal.create({
        data: {
          operatorId,
          departmentId: result.departmentId,
          title: `Improve ${dept?.displayName ?? "department"} operations`,
          description: `Strategic improvement opportunities identified through automated department audits.`,
          priority: 3,
          status: "active",
          source: "strategic-scan",
        },
      });
      goalId = newGoal.id;
    }
  } else {
    // Company-wide — find HQ goal
    const hqGoal = await prisma.goal.findFirst({
      where: { operatorId, departmentId: null, status: "active" },
      select: { id: true },
      orderBy: { priority: "asc" },
    });
    if (hqGoal) {
      goalId = hqGoal.id;
    } else {
      const newGoal = await prisma.goal.create({
        data: {
          operatorId,
          departmentId: null,
          title: "Company-wide operational improvements",
          description: "Strategic improvement opportunities identified through automated company analysis.",
          priority: 3,
          status: "active",
          source: "strategic-scan",
        },
      });
      goalId = newGoal.id;
    }
  }

  // Find the department AI entity for attribution
  let aiEntityId: string | null = null;
  if (result.departmentId) {
    const deptAi = await prisma.entity.findFirst({
      where: { operatorId, ownerDepartmentId: result.departmentId, status: "active" },
      select: { id: true },
    });
    aiEntityId = deptAi?.id ?? null;
  }

  if (!aiEntityId) {
    // Fall back to HQ AI
    const hqAi = await prisma.entity.findFirst({
      where: {
        operatorId,
        status: "active",
        entityType: { slug: { in: ["hq-ai", "ai-agent"] } },
        ownerDepartmentId: null,
      },
      select: { id: true },
    });
    aiEntityId = hqAi?.id ?? null;
  }

  if (!aiEntityId) {
    console.warn("[strategic-scan] No AI entity found for initiative attribution, skipping");
    return false;
  }

  // Dedup: check if a similar initiative already exists
  const existing = await prisma.initiative.findFirst({
    where: {
      operatorId,
      goalId,
      rationale: { contains: result.title },
      status: { notIn: ["rejected", "failed"] },
    },
  });
  if (existing) {
    console.log(`[strategic-scan] Initiative "${result.title}" already exists, skipping`);
    return false;
  }

  // Create initiative
  await prisma.initiative.create({
    data: {
      operatorId,
      goalId,
      aiEntityId,
      status: "proposed",
      rationale: `[strategic-scan:${result.approach}] [dept:${result.departmentId ?? "hq"}] ${result.title}\n\n${result.rationale}`,
      impactAssessment: result.impactAssessment,
    },
  });

  // Notify admins
  await sendNotificationToAdmins({
    operatorId,
    type: "initiative_proposed",
    title: `Initiative proposed: ${result.title}`,
    body: result.description.slice(0, 200),
    sourceType: "initiative",
    sourceId: goalId,
  }).catch(() => {});

  return true;
}
