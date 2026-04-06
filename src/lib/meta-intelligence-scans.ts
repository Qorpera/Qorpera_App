/**
 * DEPRECATED: Coverage gap analysis, intelligence hygiene, and data
 * utilization audits are now handled by the wiki lint engine
 * (wiki-verification.ts verifyDraftPages + the planned lint cron).
 *
 * Safe to delete after wiki lint engine (Phase 4) is built and validated.
 */
import { prisma } from "@/lib/db";
import { callLLM, getModel, getThinkingBudget } from "@/lib/ai-provider";
import { extractJSONAny } from "@/lib/json-helpers";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import type { ScanResult } from "@/lib/strategic-scan";
import { CronExpressionParser } from "cron-parser";

// ── createSystemJobFromScan ────────────────────────────────────────────────

type SuggestedJob = {
  title: string;
  description: string;
  scope?: string;
  cronExpression?: string;
  contextProfile?: Record<string, unknown>;
  reasoningProfile?: string;
};

export async function createSystemJobFromScan(
  operatorId: string,
  scanResult: ScanResult,
  suggestedJob: SuggestedJob,
): Promise<boolean> {
  // Dedup check
  const existing = await prisma.systemJob.findFirst({
    where: {
      operatorId,
      title: { contains: suggestedJob.title, mode: "insensitive" },
      status: { notIn: ["deactivated"] },
    },
  });
  if (existing) {
    console.log(`[meta-scans] System Job "${suggestedJob.title}" already exists, skipping`);
    return false;
  }

  // Resolve AI entity
  let aiEntityId: string | null = null;
  if (scanResult.departmentId) {
    const deptAi = await prisma.entity.findFirst({
      where: { operatorId, ownerDepartmentId: scanResult.departmentId, status: "active" },
      select: { id: true },
    });
    aiEntityId = deptAi?.id ?? null;
  }
  if (!aiEntityId) {
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
    console.warn("[meta-scans] No AI entity found for System Job attribution, skipping");
    return false;
  }

  const cronExpression = suggestedJob.cronExpression ?? "0 8 * * 1";

  // Validate cron expression
  let nextTriggerAt: Date;
  try {
    const interval = CronExpressionParser.parse(cronExpression, { currentDate: new Date() });
    nextTriggerAt = interval.next().toDate();
  } catch {
    console.warn(`[meta-scans] Invalid cron expression "${cronExpression}", using default`);
    const interval = CronExpressionParser.parse("0 8 * * 1", { currentDate: new Date() });
    nextTriggerAt = interval.next().toDate();
  }

  const scope = suggestedJob.scope ?? (scanResult.departmentId ? "department" : "company_wide");

  const contextProfile = suggestedJob.contextProfile ?? {
    dataDomains: ["communication", "crm"],
    timeWindowDays: 30,
    includeInsights: true,
    includeGoals: true,
    includeSituationTypeStats: true,
  };

  const reasoningProfile = suggestedJob.reasoningProfile ?? suggestedJob.description;

  await prisma.systemJob.create({
    data: {
      operatorId,
      aiEntityId,
      title: suggestedJob.title,
      description: suggestedJob.description,
      contextProfile: JSON.stringify(contextProfile),
      reasoningProfile,
      cronExpression,
      scope,
      scopeEntityId: scanResult.departmentId ?? null,
      status: "proposed",
      source: "strategic_scan",
      nextTriggerAt,
    },
  });

  sendNotificationToAdmins({
    operatorId,
    type: "system_alert",
    title: `System Job proposed: ${suggestedJob.title}`,
    body: suggestedJob.description.slice(0, 200),
    sourceType: "system_job",
    sourceId: operatorId,
  }).catch(() => {});

  return true;
}

// ── Shared Billing Gate ────────────────────────────────────────────────────

async function checkBillingGate(operatorId: string): Promise<boolean> {
  const op = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { billingStatus: true, aiPaused: true },
  });
  if (op?.aiPaused) {
    console.log(`[meta-scans] Skipping operator ${operatorId} — AI paused`);
    return false;
  }
  if (op?.billingStatus === "depleted" || op?.billingStatus === "cancelled") {
    console.log(`[meta-scans] Skipping operator ${operatorId} — billing ${op.billingStatus}`);
    return false;
  }
  return true;
}

// ── Scan 1: Coverage Gap Analysis ──────────────────────────────────────────

export async function runCoverageGapAnalysis(operatorId: string): Promise<ScanResult[]> {
  if (!(await checkBillingGate(operatorId))) return [];

  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { companyName: true },
  });
  const companyName = operator?.companyName ?? "the company";

  // Load context
  const [
    goals,
    departments,
    situationTypes,
    systemJobs,
    recurringTasks,
    connectors,
  ] = await Promise.all([
    prisma.goal.findMany({
      where: { operatorId, status: "active" },
      select: { id: true, title: true, description: true, measurableTarget: true, priority: true, departmentId: true },
    }),
    prisma.entity.findMany({
      where: { operatorId, category: "foundational", status: "active", entityType: { slug: "department" } },
      select: { id: true, displayName: true, description: true },
    }),
    prisma.situationType.findMany({
      where: { operatorId, enabled: true },
      select: {
        name: true,
        description: true,
        scopeEntityId: true,
        _count: {
          select: {
            situations: {
              where: { createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
            },
          },
        },
      },
    }),
    prisma.systemJob.findMany({
      where: { operatorId, status: "active" },
      select: { title: true, description: true, scope: true, scopeEntityId: true, cronExpression: true },
    }),
    prisma.recurringTask.findMany({
      where: { operatorId, status: "active" },
      select: { title: true, description: true },
    }),
    prisma.sourceConnector.findMany({
      where: { operatorId, status: { in: ["active", "degraded"] }, deletedAt: null },
      select: { provider: true, status: true, name: true },
    }),
  ]);

  // Load department member counts + members with roles
  const deptMemberData: Record<string, { count: number; members: Array<{ name: string; role: string | null }> }> = {};
  for (const dept of departments) {
    const members = await prisma.entity.findMany({
      where: { operatorId, parentDepartmentId: dept.id, category: "base", status: "active" },
      include: { propertyValues: { include: { property: { select: { slug: true } } } } },
      take: 30,
    });
    deptMemberData[dept.id] = {
      count: members.length,
      members: members.map(m => ({
        name: m.displayName,
        role: m.propertyValues.find(pv => pv.property.slug === "role" || pv.property.slug === "job-title")?.value ?? null,
      })),
    };
  }

  // Build user prompt
  const sections: string[] = [];

  // Company goals
  if (goals.length > 0) {
    const goalLines = goals.map(g => {
      const scope = g.departmentId ? `(dept: ${departments.find(d => d.id === g.departmentId)?.displayName ?? g.departmentId})` : "(company-wide)";
      return `  - ${g.title} ${scope} — priority ${g.priority}${g.measurableTarget ? ` | Target: ${g.measurableTarget}` : ""}\n    ${g.description}`;
    }).join("\n");
    sections.push(`COMPANY GOALS:\n${goalLines}`);
  }

  // Departments
  if (departments.length > 0) {
    const deptLines = departments.map(d => {
      const data = deptMemberData[d.id];
      return `  - ${d.displayName} (${data?.count ?? 0} members)${d.description ? `: ${d.description}` : ""}`;
    }).join("\n");
    sections.push(`DEPARTMENTS:\n${deptLines}`);
  }

  // Team members by department
  for (const dept of departments) {
    const data = deptMemberData[dept.id];
    if (data && data.members.length > 0) {
      const memberLines = data.members.map(m =>
        `    - ${m.name}${m.role ? ` (${m.role})` : ""}`,
      ).join("\n");
      sections.push(`TEAM MEMBERS — ${dept.displayName}:\n${memberLines}`);
    }
  }

  // Situation types
  if (situationTypes.length > 0) {
    const stLines = situationTypes.map(st => {
      const scope = st.scopeEntityId ? `(dept: ${departments.find(d => d.id === st.scopeEntityId)?.displayName ?? st.scopeEntityId})` : "(company-wide)";
      return `  - ${st.name} ${scope}: ${st.description} — ${st._count.situations} detected (90d)`;
    }).join("\n");
    sections.push(`EXISTING SITUATION TYPES:\n${stLines}`);
  } else {
    sections.push("EXISTING SITUATION TYPES: None.");
  }

  // System jobs
  if (systemJobs.length > 0) {
    const sjLines = systemJobs.map(j =>
      `  - ${j.title} (${j.scope}, cron: ${j.cronExpression})${j.description ? `: ${j.description.slice(0, 100)}` : ""}`,
    ).join("\n");
    sections.push(`EXISTING SYSTEM JOBS:\n${sjLines}`);
  } else {
    sections.push("EXISTING SYSTEM JOBS: None.");
  }

  // Recurring tasks
  if (recurringTasks.length > 0) {
    const rtLines = recurringTasks.map(t =>
      `  - ${t.title}${t.description ? `: ${t.description.slice(0, 100)}` : ""}`,
    ).join("\n");
    sections.push(`EXISTING RECURRING TASKS:\n${rtLines}`);
  } else {
    sections.push("EXISTING RECURRING TASKS: None.");
  }

  // Connected data sources
  if (connectors.length > 0) {
    const cLines = connectors.map(c =>
      `  - ${c.provider} (${c.name || "unnamed"}) — status: ${c.status}`,
    ).join("\n");
    sections.push(`CONNECTED DATA SOURCES:\n${cLines}`);
  } else {
    sections.push("CONNECTED DATA SOURCES: None.");
  }

  const userPrompt = sections.join("\n\n");

  const systemPrompt = `You are an intelligence coverage auditor for ${companyName}. Your job is to identify gaps in the organization's intelligence system — analytical capabilities that SHOULD exist but DON'T.

Reason FORWARD from intent to capability:
1. Read the company's goals and department purposes
2. For each goal/purpose, ask: "What recurring analytical work would a competent operations leader do to advance this?"
3. Check: does any existing Situation Type, System Job, or Recurring Task already cover this?
4. If not: this is a coverage gap

TYPES OF GAPS TO LOOK FOR:
- Analytical gaps: data exists across connected tools but nobody is regularly synthesizing it (e.g., sales + finance data exists but no sales-to-cash cycle analysis)
- Monitoring gaps: things that should be watched continuously but only get attention reactively (e.g., client relationship health trending, cash flow trajectory)
- Cross-department gaps: interactions between departments that nobody is analyzing (e.g., sales promises vs delivery capacity, hiring pipeline vs project demand)
- Role-specific gaps: things that specific roles should have intelligence on but don't (e.g., a sales manager needs pipeline velocity analysis, a finance lead needs payment pattern monitoring)
- Tool utilization gaps: connected tools whose data could power intelligence that doesn't exist (e.g., Google Ads connected but no marketing ROI analysis)

For each gap, determine whether it's best served by:
- A new System Job (recurring deep analysis — use when the gap requires cross-system reasoning, trend analysis, or strategic recommendations)
- A new Situation Type (event-driven detection — use when the gap is about catching specific events or threshold breaches)
- Both (the System Job does periodic analysis AND a Situation Type catches urgent instances between cycles)

Output a JSON array of findings. Each finding:
{
  "title": "Coverage gap title",
  "description": "What intelligence is missing",
  "rationale": "Why this matters — connect to specific goals or department purposes",
  "impactAssessment": "What value this would add if filled",
  "departmentId": "department entity ID if department-specific, null if company-wide",
  "urgency": "low | medium | high",
  "confidence": 0.0-1.0,
  "approach": "coverage_gap_analysis",
  "evidence": [{ "type": "goal_gap | tool_gap | role_gap | cross_dept_gap", "summary": "evidence description" }],
  "gapType": "system_job | situation_type | both",
  "suggestedSystemJob": {
    "title": "Proposed System Job name",
    "description": "What it analyzes and why",
    "scope": "department | cross_department | company_wide",
    "cronExpression": "appropriate cron schedule",
    "contextProfile": { "dataDomains": [...], "timeWindowDays": N, ... },
    "reasoningProfile": "The analytical framework — what questions to answer, what to compare, what good/bad looks like"
  }
}

Only include suggestedSystemJob when gapType is "system_job" or "both".
Be specific in reasoningProfile — "Analyze marketing performance" is useless. "Compare cost-per-lead across channels, identify channels where CAC increased >15% month-over-month, cross-reference with pipeline conversion rates to find efficiency/volume tradeoffs" is useful.

Return an empty array if coverage is adequate. Do not force findings.`;

  const response = await callLLM({
    instructions: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    temperature: 0.3,
    maxTokens: 65_536,
    aiFunction: "reasoning",
    model: getModel("strategicScan"),
    thinking: true,
    thinkingBudget: getThinkingBudget("strategicScan") ?? undefined,
  });

  const parsed = extractJSONAny(response.text);
  if (!Array.isArray(parsed)) {
    console.warn("[meta-scans:coverage-gap] Failed to parse LLM response as array");
    return [];
  }

  const results: ScanResult[] = parsed.slice(0, 5).map((r: Record<string, unknown>) => ({
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    rationale: String(r.rationale ?? ""),
    impactAssessment: String(r.impactAssessment ?? ""),
    departmentId: typeof r.departmentId === "string" ? r.departmentId : null,
    urgency: (["low", "medium", "high"].includes(r.urgency as string) ? r.urgency : "medium") as "low" | "medium" | "high",
    confidence: typeof r.confidence === "number" ? r.confidence : 0.5,
    approach: "coverage_gap_analysis",
    evidence: Array.isArray(r.evidence)
      ? r.evidence.map((e: Record<string, unknown>) => ({ type: String(e.type ?? ""), summary: String(e.summary ?? "") }))
      : [],
  }));

  // Dispatch: create system jobs (initiatives are created by runStrategicScan's dispatch loop)
  for (const result of results) {
    const raw = parsed.find((p: Record<string, unknown>) => p.title === result.title);
    const gapType = raw?.gapType as string | undefined;
    const suggestedJob = raw?.suggestedSystemJob as SuggestedJob | undefined;
    if ((gapType === "system_job" || gapType === "both") && suggestedJob) {
      try {
        await createSystemJobFromScan(operatorId, result, suggestedJob);
      } catch (err) {
        console.error(`[meta-scans:coverage-gap] Failed to create system job for "${result.title}":`, err);
      }
    }
  }

  return results;
}

// ── Scan 2: Intelligence Hygiene ───────────────────────────────────────────

export async function runIntelligenceHygiene(operatorId: string): Promise<ScanResult[]> {
  if (!(await checkBillingGate(operatorId))) return [];

  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { companyName: true },
  });
  const companyName = operator?.companyName ?? "the company";

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // Load situation types with computed stats
  const situationTypes = await prisma.situationType.findMany({
    where: { operatorId, enabled: true },
    select: {
      id: true,
      name: true,
      description: true,
      scopeEntityId: true,
      detectedCount: true,
      confirmedCount: true,
    },
  });

  // Compute 90-day stats per situation type
  const stStats: Array<{
    name: string;
    description: string;
    totalDetected: number;
    confirmed: number;
    rejected: number;
    confirmationRate: number;
  }> = [];

  for (const st of situationTypes) {
    const [totalDetected, confirmed, rejected] = await Promise.all([
      prisma.situation.count({
        where: { operatorId, situationTypeId: st.id, createdAt: { gte: ninetyDaysAgo } },
      }),
      prisma.situation.count({
        where: {
          operatorId,
          situationTypeId: st.id,
          createdAt: { gte: ninetyDaysAgo },
          status: { in: ["resolved", "closed"] },
        },
      }),
      prisma.situation.count({
        where: {
          operatorId,
          situationTypeId: st.id,
          createdAt: { gte: ninetyDaysAgo },
          status: "dismissed",
        },
      }),
    ]);

    stStats.push({
      name: st.name,
      description: st.description,
      totalDetected,
      confirmed,
      rejected,
      confirmationRate: totalDetected > 0 ? confirmed / totalDetected : 0,
    });
  }

  // Load system jobs with run stats
  const systemJobs = await prisma.systemJob.findMany({
    where: { operatorId, status: "active" },
    select: { id: true, title: true, description: true, cronExpression: true },
  });

  const sjStats: Array<{
    title: string;
    description: string | null;
    cronExpression: string;
    totalRuns: number;
    avgImportance: number;
    compressedRate: number;
    avgProposals: number;
  }> = [];

  for (const sj of systemJobs) {
    const runs = await prisma.systemJobRun.findMany({
      where: { systemJobId: sj.id },
      select: { status: true, importanceScore: true, proposedSituationCount: true, proposedInitiativeCount: true },
      orderBy: { cycleNumber: "desc" },
      take: 10,
    });

    const totalRuns = runs.length;
    const importanceScores = runs.filter(r => r.importanceScore !== null).map(r => r.importanceScore!);
    const compressedCount = runs.filter(r => r.status === "compressed").length;
    const proposalCounts = runs.map(r => r.proposedSituationCount + r.proposedInitiativeCount);

    sjStats.push({
      title: sj.title,
      description: sj.description,
      cronExpression: sj.cronExpression,
      totalRuns,
      avgImportance: importanceScores.length > 0 ? importanceScores.reduce((a, b) => a + b, 0) / importanceScores.length : 0,
      compressedRate: totalRuns > 0 ? compressedCount / totalRuns : 0,
      avgProposals: proposalCounts.length > 0 ? proposalCounts.reduce((a, b) => a + b, 0) / proposalCounts.length : 0,
    });
  }

  // Recurring tasks
  const recurringTasks = await prisma.recurringTask.findMany({
    where: { operatorId, status: "active" },
    select: { title: true, description: true, lastTriggeredAt: true },
  });

  // Overlap detection (keyword overlap between situation type descriptions)
  const overlaps: Array<{ typeA: string; typeB: string; overlapPercent: number }> = [];
  const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "can", "shall", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as", "into", "through", "during", "before", "after", "above", "below", "between", "out", "off", "over", "under", "again", "further", "then", "once", "and", "but", "or", "nor", "not", "so", "if", "when", "that", "this", "it", "its", "all", "each", "every", "both", "few", "more", "most", "other", "some", "such", "no", "only", "own", "same", "than", "too", "very"]);

  function getSignificantWords(text: string): Set<string> {
    return new Set(
      text.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !stopWords.has(w)),
    );
  }

  for (let i = 0; i < stStats.length; i++) {
    for (let j = i + 1; j < stStats.length; j++) {
      const wordsA = getSignificantWords(stStats[i].description);
      const wordsB = getSignificantWords(stStats[j].description);
      const union = new Set([...wordsA, ...wordsB]);
      const intersection = [...wordsA].filter(w => wordsB.has(w));
      const overlapPct = union.size > 0 ? intersection.length / union.size : 0;
      if (overlapPct > 0.5) {
        overlaps.push({ typeA: stStats[i].name, typeB: stStats[j].name, overlapPercent: Math.round(overlapPct * 100) });
      }
    }
  }

  // Build user prompt
  const sections: string[] = [];

  if (stStats.length > 0) {
    const stLines = stStats.map(st =>
      `  - ${st.name}: ${st.description}\n    Detected: ${st.totalDetected} | Confirmed: ${st.confirmed} | Rejected: ${st.rejected} | Confirmation rate: ${(st.confirmationRate * 100).toFixed(0)}%`,
    ).join("\n");
    sections.push(`SITUATION TYPE STATS (90 days):\n${stLines}`);
  } else {
    sections.push("SITUATION TYPE STATS: No active situation types.");
  }

  if (sjStats.length > 0) {
    const sjLines = sjStats.map(sj =>
      `  - ${sj.title} (cron: ${sj.cronExpression})\n    Runs: ${sj.totalRuns} | Avg importance: ${sj.avgImportance.toFixed(2)} | Compressed rate: ${(sj.compressedRate * 100).toFixed(0)}% | Avg proposals/cycle: ${sj.avgProposals.toFixed(1)}`,
    ).join("\n");
    sections.push(`SYSTEM JOB STATS (last 10 runs):\n${sjLines}`);
  } else {
    sections.push("SYSTEM JOB STATS: No active system jobs.");
  }

  if (recurringTasks.length > 0) {
    const rtLines = recurringTasks.map(t =>
      `  - ${t.title} — last triggered: ${t.lastTriggeredAt?.toISOString().split("T")[0] ?? "never"}`,
    ).join("\n");
    sections.push(`RECURRING TASKS:\n${rtLines}`);
  }

  if (overlaps.length > 0) {
    const olLines = overlaps.map(o =>
      `  - "${o.typeA}" and "${o.typeB}" — ${o.overlapPercent}% keyword overlap`,
    ).join("\n");
    sections.push(`POTENTIAL OVERLAPS:\n${olLines}`);
  }

  const userPrompt = sections.join("\n\n");

  const systemPrompt = `You are an intelligence system hygiene auditor for ${companyName}. Your job is to identify intelligence components that are wasteful, redundant, outdated, or underperforming.

Reason BACKWARD from outcomes to value:
1. For each Situation Type: is the confirmation rate healthy? Below 30% suggests detection logic is too aggressive or the type is no longer relevant. Above 90% with very few detections suggests it might be too conservative.
2. For each System Job: are the cycles producing value? Average importanceScore < 0.2 over 5+ cycles means it's not finding anything useful. High compressed rate (>80%) suggests deactivation or frequency reduction.
3. Look for redundancy: situation types with very similar descriptions or overlapping detection patterns.
4. Look for waste: components consuming LLM tokens but producing rejected/ignored output.
5. Look for replacements: a System Job doing simple work that a Situation Type could handle? A Situation Type that would benefit from periodic deep analysis instead?

TYPES OF RECOMMENDATIONS:
- deactivate: Turn off this component. Provide clear rationale and what (if anything) should replace it.
- merge: Two or more components overlap. Specify which survives and what changes in the merged version.
- refine: Detection logic or reasoning profile needs adjustment. Be specific about what to change.
- reduce_frequency: Runs too often for the value produced. Suggest new cadence with reasoning.
- increase_frequency: Runs too rarely for something that changes fast. Suggest new cadence.
- replace: One mechanism would be better served by a different one. Specify the replacement.

Output a JSON array:
{
  "title": "Recommendation title",
  "description": "What should change",
  "rationale": "Why — cite specific stats",
  "impactAssessment": "Expected improvement (token savings, noise reduction, better coverage)",
  "departmentId": null,
  "urgency": "low | medium | high",
  "confidence": 0.0-1.0,
  "approach": "intelligence_hygiene",
  "evidence": [{ "type": "low_confirmation | high_compressed | redundancy | waste", "summary": "stat-backed evidence" }]
}

Return an empty array if the system is healthy. Do not force findings — a healthy system is a valid result.`;

  const response = await callLLM({
    instructions: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    temperature: 0.3,
    maxTokens: 65_536,
    aiFunction: "reasoning",
    model: getModel("strategicScan"),
    thinking: true,
    thinkingBudget: getThinkingBudget("strategicScan") ?? undefined,
  });

  const parsed = extractJSONAny(response.text);
  if (!Array.isArray(parsed)) {
    console.warn("[meta-scans:hygiene] Failed to parse LLM response as array");
    return [];
  }

  const results: ScanResult[] = parsed.slice(0, 5).map((r: Record<string, unknown>) => ({
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    rationale: String(r.rationale ?? ""),
    impactAssessment: String(r.impactAssessment ?? ""),
    departmentId: typeof r.departmentId === "string" ? r.departmentId : null,
    urgency: (["low", "medium", "high"].includes(r.urgency as string) ? r.urgency : "medium") as "low" | "medium" | "high",
    confidence: typeof r.confidence === "number" ? r.confidence : 0.5,
    approach: "intelligence_hygiene",
    evidence: Array.isArray(r.evidence)
      ? r.evidence.map((e: Record<string, unknown>) => ({ type: String(e.type ?? ""), summary: String(e.summary ?? "") }))
      : [],
  }));

  return results;
}

// ── Scan 3: Data Utilization Audit ─────────────────────────────────────────

export async function runDataUtilizationAudit(operatorId: string): Promise<ScanResult[]> {
  if (!(await checkBillingGate(operatorId))) return [];

  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { companyName: true },
  });
  const companyName = operator?.companyName ?? "the company";

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Load connectors
  const connectors = await prisma.sourceConnector.findMany({
    where: { operatorId, deletedAt: null },
    select: { id: true, provider: true, status: true, name: true, lastSyncAt: true },
  });

  // Per-connector stats
  const connectorStats: Array<{
    provider: string;
    name: string;
    status: string;
    lastSyncAt: string | null;
    signalCount: number;
    chunkCount: number;
    entityCount: number;
  }> = [];

  for (const c of connectors) {
    const [signalCount, chunkCount, entityCount] = await Promise.all([
      prisma.activitySignal.count({
        where: { operatorId, connectorId: c.id, occurredAt: { gte: thirtyDaysAgo } },
      }),
      prisma.contentChunk.count({
        where: { operatorId, connectorId: c.id },
      }),
      // Best-effort entity count: entities created by this connector's events
      prisma.event.count({
        where: { operatorId, connectorId: c.id, createdAt: { gte: thirtyDaysAgo } },
      }),
    ]);

    connectorStats.push({
      provider: c.provider,
      name: c.name || c.provider,
      status: c.status,
      lastSyncAt: c.lastSyncAt?.toISOString().split("T")[0] ?? null,
      signalCount,
      chunkCount,
      entityCount,
    });
  }

  // Load situation types — check which reference providers in detectionLogic
  const situationTypes = await prisma.situationType.findMany({
    where: { operatorId, enabled: true },
    select: { name: true, description: true, detectionLogic: true },
  });

  // Load system jobs — check contextProfile for connectorProviders/dataDomains
  const systemJobs = await prisma.systemJob.findMany({
    where: { operatorId, status: "active" },
    select: { title: true, contextProfile: true },
  });

  // Build user prompt
  const sections: string[] = [];

  if (connectorStats.length > 0) {
    const cLines = connectorStats.map(c =>
      `  - ${c.provider} (${c.name}) — status: ${c.status}, last sync: ${c.lastSyncAt ?? "never"}\n    Signals (30d): ${c.signalCount} | Content chunks: ${c.chunkCount} | Events (30d): ${c.entityCount}`,
    ).join("\n");
    sections.push(`CONNECTED DATA SOURCES:\n${cLines}`);
  } else {
    sections.push("CONNECTED DATA SOURCES: None.");
  }

  // Which situation types reference which providers
  if (situationTypes.length > 0) {
    const stLines = situationTypes.map(st => {
      const providerRefs = connectorStats
        .filter(c => {
          const logic = st.detectionLogic ?? "";
          return logic.toLowerCase().includes(c.provider.toLowerCase());
        })
        .map(c => c.provider);
      return `  - ${st.name}: ${st.description}${providerRefs.length > 0 ? ` [references: ${providerRefs.join(", ")}]` : " [no provider references]"}`;
    }).join("\n");
    sections.push(`SITUATION TYPES (provider references):\n${stLines}`);
  }

  // Which system jobs reference which providers
  if (systemJobs.length > 0) {
    const sjLines = systemJobs.map(sj => {
      let domains: string[] = [];
      let providers: string[] = [];
      try {
        const profile = JSON.parse(sj.contextProfile) as Record<string, unknown>;
        domains = Array.isArray(profile.dataDomains) ? profile.dataDomains as string[] : [];
        providers = Array.isArray(profile.connectorProviders) ? profile.connectorProviders as string[] : [];
      } catch { /* ignore */ }
      return `  - ${sj.title} — domains: [${domains.join(", ")}], providers: [${providers.join(", ")}]`;
    }).join("\n");
    sections.push(`SYSTEM JOBS (data dependencies):\n${sjLines}`);
  }

  const userPrompt = sections.join("\n\n");

  const systemPrompt = `You are a data utilization auditor for ${companyName}. Your job is to find mismatches between what data is being collected and what data is being used by the intelligence system.

For each connected data source, classify it:
- WELL_UTILIZED: Multiple situation types or system jobs actively consume and reason about this data
- UNDERUTILIZED: Data is syncing regularly but few or no intelligence components reference it
- ORPHANED: Connector exists but has no recent sync activity or very low signal count
- POTENTIAL: The data could power valuable intelligence that doesn't exist yet

For UNDERUTILIZED and POTENTIAL sources, propose:
- A System Job that would consume this data meaningfully — be specific about what analysis it would perform
- OR a Situation Type that would detect events from this source
- OR suggest deprioritizing/disconnecting the sync if the data isn't valuable

Output a JSON array:
{
  "title": "Data utilization finding",
  "description": "What the mismatch is",
  "rationale": "Why this matters",
  "impactAssessment": "Value of fixing this (better intelligence) or savings (stop syncing unused data)",
  "departmentId": null,
  "urgency": "low | medium | high",
  "confidence": 0.0-1.0,
  "approach": "data_utilization_audit",
  "evidence": [{ "type": "underutilized | orphaned | potential", "summary": "provider X has N signals synced but 0 situation types reference it" }],
  "dataSource": { "provider": "name", "signalCount": 0, "chunkCount": 0, "entityCount": 0 },
  "classification": "well_utilized | underutilized | orphaned | potential",
  "suggestedSystemJob": {
    "title": "Proposed System Job name",
    "description": "What it analyzes and why",
    "scope": "department | cross_department | company_wide",
    "cronExpression": "appropriate cron schedule",
    "contextProfile": { "dataDomains": [], "timeWindowDays": 30, "includeInsights": true, "includeGoals": true, "includeSituationTypeStats": true },
    "reasoningProfile": "The analytical framework"
  }
}

Only include suggestedSystemJob for underutilized/potential classifications.
Only include findings for sources that are NOT well_utilized — well-utilized sources don't need action.
Return an empty array if all sources are well-utilized.`;

  const response = await callLLM({
    instructions: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    temperature: 0.3,
    maxTokens: 65_536,
    aiFunction: "reasoning",
    model: getModel("strategicScan"),
    thinking: true,
    thinkingBudget: getThinkingBudget("strategicScan") ?? undefined,
  });

  const parsed = extractJSONAny(response.text);
  if (!Array.isArray(parsed)) {
    console.warn("[meta-scans:data-util] Failed to parse LLM response as array");
    return [];
  }

  const results: ScanResult[] = parsed.slice(0, 5).map((r: Record<string, unknown>) => ({
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    rationale: String(r.rationale ?? ""),
    impactAssessment: String(r.impactAssessment ?? ""),
    departmentId: typeof r.departmentId === "string" ? r.departmentId : null,
    urgency: (["low", "medium", "high"].includes(r.urgency as string) ? r.urgency : "medium") as "low" | "medium" | "high",
    confidence: typeof r.confidence === "number" ? r.confidence : 0.5,
    approach: "data_utilization_audit",
    evidence: Array.isArray(r.evidence)
      ? r.evidence.map((e: Record<string, unknown>) => ({ type: String(e.type ?? ""), summary: String(e.summary ?? "") }))
      : [],
  }));

  // Dispatch: create system jobs (initiatives are created by runStrategicScan's dispatch loop)
  for (const result of results) {
    const raw = parsed.find((p: Record<string, unknown>) => p.title === result.title);
    const suggestedJob = raw?.suggestedSystemJob as SuggestedJob | undefined;
    const classification = raw?.classification as string | undefined;
    if ((classification === "underutilized" || classification === "potential") && suggestedJob) {
      try {
        await createSystemJobFromScan(operatorId, result, suggestedJob);
      } catch (err) {
        console.error(`[meta-scans:data-util] Failed to create system job for "${result.title}":`, err);
      }
    }
  }

  return results;
}
