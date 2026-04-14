import { prisma } from "@/lib/db";
import { parseSituationPage } from "@/lib/situation-page-parser";
import type { OperatorSnapshot, DomainSnapshot } from "@/lib/system-health/compute-snapshot";

// ── Situation Context ────────────────────────────────────────────────────────

export async function loadSituationContext(
  situationId: string,
  operatorId: string,
): Promise<string | null> {
  // Load situation wiki page
  const page = await prisma.knowledgePage.findFirst({
    where: {
      operatorId,
      pageType: "situation_instance",
      scope: "operator",
      properties: { path: ["situation_id"], equals: situationId },
    },
    select: { slug: true, title: true, content: true, properties: true },
  });

  if (!page) return null;

  const props = (page.properties ?? {}) as Record<string, unknown>;

  // Load situation type name
  const stSlug = props.situation_type as string | undefined;
  let typeName = "Unknown";
  let typeDescription = "";
  if (stSlug) {
    const st = await prisma.situationType.findFirst({
      where: { operatorId, slug: stSlug },
      select: { name: true, description: true },
    });
    if (st) {
      typeName = st.name;
      typeDescription = st.description;
    }
  }

  // Build context from wiki page sections
  const parsed = parseSituationPage(page.content, props);

  const lines = [
    "SITUATION CONTEXT:",
    `Status: ${props.status ?? "unknown"} | Severity: ${typeof props.severity === "number" ? (props.severity as number).toFixed(1) : props.severity ?? "unknown"} | Detected: ${(props.detected_at as string)?.split("T")[0] ?? "unknown"}`,
    `Type: ${typeName}${typeDescription ? ` — ${typeDescription}` : ""}`,
    parsed.sections.investigation ? `\nInvestigation:\n${parsed.sections.investigation.slice(0, 1000)}` : "",
    parsed.sections.actionPlan ? `\nAction Plan:\n${parsed.sections.actionPlan.slice(0, 500)}` : "",
    parsed.sections.timeline ? `\nTimeline:\n${parsed.sections.timeline.slice(0, 500)}` : "",
  ];

  return lines.filter(Boolean).join("\n");
}

// ── Initiative Context ───────────────────────────────────────────────────────

export async function loadInitiativeContext(
  initiativeId: string,
  operatorId: string,
): Promise<string | null> {
  // Try wiki page first (new initiatives are wiki pages)
  const page = await prisma.knowledgePage.findFirst({
    where: {
      operatorId,
      pageType: "initiative",
      scope: "operator",
      OR: [
        { slug: initiativeId },
        { properties: { path: ["initiative_id"], equals: initiativeId } },
      ],
    },
    select: { slug: true, title: true, content: true, properties: true },
  });

  if (page) {
    const props = (page.properties ?? {}) as Record<string, unknown>;
    return [
      "INITIATIVE CONTEXT:",
      `Initiative: ${page.title}`,
      `Status: ${props.status ?? "unknown"}`,
      page.content.slice(0, 2000),
    ].join("\n");
  }

  // Fallback: try Initiative table (legacy records)
  const initiative = await prisma.initiative.findFirst({
    where: { id: initiativeId, operatorId },
    select: { triggerSummary: true, status: true, rationale: true },
  });

  if (!initiative) return null;

  return [
    "INITIATIVE CONTEXT:",
    `Initiative: ${initiative.triggerSummary}`,
    `Status: ${initiative.status}`,
    initiative.rationale?.slice(0, 1000) ?? "",
  ].join("\n");
}

// ── System Health Context ────────────────────────────────────────────────────

export async function loadSystemHealthContext(
  operatorId: string,
  visibleDomains: string[] | "all",
): Promise<string | null> {
  const healthRows = await prisma.domainHealth.findMany({
    where: { operatorId },
    select: { domainEntityId: true, snapshot: true, computedAt: true },
  });

  if (healthRows.length === 0) return null;

  // Scope filter: members only see their departments
  const filteredRows = visibleDomains === "all"
    ? healthRows
    : healthRows.filter(
        (r) => r.domainEntityId === null || visibleDomains.includes(r.domainEntityId),
      );

  return formatHealthContext(filteredRows);
}

function formatHealthContext(
  healthRows: { domainEntityId: string | null; snapshot: unknown; computedAt: Date }[],
): string {
  const lines: string[] = ["## Current System Health Status\n"];

  const operatorRow = healthRows.find((r) => r.domainEntityId === null);
  if (operatorRow) {
    const snap = operatorRow.snapshot as OperatorSnapshot;
    lines.push(`Overall: ${snap.overallStatus} (${snap.criticalIssueCount} critical issues)`);
    lines.push(`Last computed: ${operatorRow.computedAt.toISOString()}\n`);
  }

  const deptRows = healthRows.filter((r) => r.domainEntityId !== null);
  for (const row of deptRows) {
    const dept = row.snapshot as DomainSnapshot;

    if (dept.overallStatus === "healthy") continue;

    lines.push(`### ${dept.domainName} — ${dept.overallStatus}`);

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
    .filter((r) => (r.snapshot as DomainSnapshot).overallStatus === "healthy")
    .map((r) => (r.snapshot as DomainSnapshot).domainName);

  if (healthyDepts.length > 0) {
    lines.push(`Healthy departments (no issues): ${healthyDepts.join(", ")}`);
  }

  return lines.join("\n");
}

// ── System Jobs Context ─────────────────────────────────────────────────────

export async function loadSystemJobsContext(
  operatorId: string,
): Promise<string | null> {
  const jobs = await prisma.systemJob.findMany({
    where: { operatorId },
    orderBy: { createdAt: "desc" },
    include: {
      runs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { summary: true, importanceScore: true, status: true, createdAt: true },
      },
    },
  });

  if (jobs.length === 0) return null;

  // Resolve domain names from wiki pages
  const domainSlugs = jobs.map(j => j.domainPageSlug).filter(Boolean) as string[];
  const pageNameMap = new Map<string, string>();
  if (domainSlugs.length > 0) {
    const pages = await prisma.knowledgePage.findMany({
      where: { operatorId, slug: { in: [...new Set(domainSlugs)] }, scope: "operator" },
      select: { slug: true, title: true },
    });
    for (const p of pages) pageNameMap.set(p.slug, p.title);
  }

  const lines: string[] = ["SYSTEM JOBS CONTEXT:\n"];

  lines.push(`Total jobs: ${jobs.length} (${jobs.filter(j => j.status === "active").length} active, ${jobs.filter(j => j.status === "paused").length} paused, ${jobs.filter(j => j.status === "proposed").length} proposed)\n`);

  for (const job of jobs) {
    const latestRun = job.runs[0];
    lines.push(`## ${job.title} [${job.status}]`);
    const domainName = job.domainPageSlug ? pageNameMap.get(job.domainPageSlug) : null;
    if (domainName) lines.push(`  Domain: ${domainName}`);
    lines.push(`  Schedule: ${job.cronExpression}`);
    lines.push(`  Importance threshold: ${(job.importanceThreshold * 100).toFixed(0)}%`);
    lines.push(`  Description: ${job.description}`);
    if (job.lastTriggeredAt) {
      lines.push(`  Last triggered: ${job.lastTriggeredAt.toISOString().split("T")[0]}`);
    }
    if (job.nextTriggerAt) {
      lines.push(`  Next trigger: ${job.nextTriggerAt.toISOString()}`);
    }
    if (latestRun) {
      lines.push(`  Latest run: ${latestRun.status}${latestRun.importanceScore != null ? ` (importance: ${(latestRun.importanceScore * 100).toFixed(0)}%)` : ""}`);
      if (latestRun.summary) {
        lines.push(`  Summary: ${latestRun.summary.slice(0, 300)}`);
      }
    }
    lines.push("");
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
    case "system_jobs":
      return loadSystemJobsContext(operatorId);
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
      return "You are advising on this specific initiative proposed by the department AI. You have full context about the rationale and the execution plan. Help the user evaluate whether this initiative makes sense, discuss the approach, or understand the expected impact.";
    case "system-health":
      return "The user is viewing the System Health page. Help them understand and resolve any issues shown. When suggesting fixes, provide specific navigation paths (e.g., \"Go to Settings → Connections to reconnect Gmail\"). If a department has no issues, say so briefly. Focus on actionable advice — what specifically should the user do next to improve their system health.";
    case "system_jobs":
      return "You are helping manage system monitoring jobs. You have full context about all configured jobs, their schedules, run history, and available domains. Help the user create new jobs, adjust schedules or importance thresholds, pause/resume jobs, understand run results, or diagnose why a job might not be producing useful findings. When creating jobs, you need a title, description, cron expression, and a domain (department) to scope the job to.";
    default:
      return "";
  }
}
