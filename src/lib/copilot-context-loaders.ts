import { prisma } from "@/lib/db";
import { parseSituationPage } from "@/lib/situation-page-parser";
import type { OperatorHealthSnapshot } from "@/lib/system-health/compute-snapshot";

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

// ── Idea Context ───────────────────────────────────────────────────────

export async function loadIdeaContext(
  ideaId: string,
  operatorId: string,
): Promise<string | null> {
  // Try wiki page first (new ideas are wiki pages)
  const page = await prisma.knowledgePage.findFirst({
    where: {
      operatorId,
      pageType: "idea",
      scope: "operator",
      OR: [
        { slug: ideaId },
        { properties: { path: ["idea_id"], equals: ideaId } },
      ],
    },
    select: { slug: true, title: true, content: true, properties: true },
  });

  if (page) {
    const props = (page.properties ?? {}) as Record<string, unknown>;
    return [
      "IDEA CONTEXT:",
      `Idea: ${page.title}`,
      `Status: ${props.status ?? "unknown"}`,
      page.content.slice(0, 2000),
    ].join("\n");
  }

  // Fallback: try Idea table (legacy records)
  const idea = await prisma.idea.findFirst({
    where: { id: ideaId, operatorId },
    select: { triggerSummary: true, status: true, rationale: true },
  });

  if (!idea) return null;

  return [
    "IDEA CONTEXT:",
    `Idea: ${idea.triggerSummary}`,
    `Status: ${idea.status}`,
    idea.rationale?.slice(0, 1000) ?? "",
  ].join("\n");
}

// ── System Health Context ────────────────────────────────────────────────────

export async function loadSystemHealthContext(
  operatorId: string,
): Promise<string | null> {
  const healthRow = await prisma.domainHealth.findFirst({
    where: { operatorId, domainEntityId: null },
    select: { snapshot: true, computedAt: true },
  });

  if (!healthRow) return null;

  return formatHealthContext(
    healthRow.snapshot as unknown as OperatorHealthSnapshot,
    healthRow.computedAt,
  );
}

function formatHealthContext(
  snap: OperatorHealthSnapshot,
  computedAt: Date,
): string {
  const lines: string[] = ["## Current System Health Status\n"];

  lines.push(`Overall: ${snap.overallStatus}`);
  lines.push(`Last computed: ${computedAt.toISOString()}\n`);

  // Connectors
  const problemConnectors = snap.connectors.filter((c) => c.issue);
  if (problemConnectors.length > 0) {
    lines.push("### Connectors");
    for (const c of problemConnectors) {
      lines.push(`  - ${c.name} (${c.provider}): ${c.issue}`);
    }
    lines.push("");
  }

  // Wiki
  lines.push(`Wiki: ${snap.wiki.totalPages} pages (${snap.wiki.verifiedPages} verified, ${snap.wiki.draftPages} draft, ${snap.wiki.stalePages} stale)`);
  if (snap.wiki.totalPages > 0) {
    lines.push(`  Avg confidence: ${(snap.wiki.avgConfidence * 100).toFixed(0)}%`);
  }

  // People
  lines.push(`People: ${snap.people.totalProfiles} profiles (${snap.people.withRoles} with roles, ${snap.people.withReportingLines} with reporting lines)`);

  // Detection
  if (snap.detection.totalSituationTypes > 0) {
    lines.push(`Detection: ${snap.detection.activeSituationTypes}/${snap.detection.totalSituationTypes} active types, ${snap.detection.totalDetected30d} detected (30d)`);
    if (snap.detection.confirmationRate !== null) {
      lines.push(`  Confirmation rate: ${(snap.detection.confirmationRate * 100).toFixed(0)}%`);
    }
  } else {
    lines.push("Detection: no situation types configured");
  }

  // Raw content
  lines.push(`Raw content: ${snap.rawContent.totalItems} items`);

  return lines.join("\n");
}

// ── System Jobs Context ─────────────────────────────────────────────────────

export async function loadSystemJobsContext(
  operatorId: string,
): Promise<string | null> {
  const pages = await prisma.knowledgePage.findMany({
    where: { operatorId, pageType: "system_job", scope: "operator" },
    select: {
      id: true,
      slug: true,
      title: true,
      properties: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (pages.length === 0) return null;

  // Resolve domain names from wiki pages
  const domainSlugs = pages
    .map(p => (p.properties as Record<string, unknown> | null)?.domain)
    .filter((s): s is string => typeof s === "string");
  const pageNameMap = new Map<string, string>();
  if (domainSlugs.length > 0) {
    const domainPages = await prisma.knowledgePage.findMany({
      where: { operatorId, slug: { in: [...new Set(domainSlugs)] }, scope: "operator" },
      select: { slug: true, title: true },
    });
    for (const p of domainPages) pageNameMap.set(p.slug, p.title);
  }

  const lines: string[] = ["SYSTEM JOBS CONTEXT:\n"];

  // Status counts from wiki properties
  const activeCount = pages.filter(p => (p.properties as Record<string, unknown> | null)?.status === "active").length;
  const pausedCount = pages.filter(p => (p.properties as Record<string, unknown> | null)?.status === "paused").length;
  const draftCount = pages.filter(p => (p.properties as Record<string, unknown> | null)?.status === "draft").length;

  lines.push(`Total jobs: ${pages.length} (${activeCount} active, ${pausedCount} paused, ${draftCount} draft)\n`);

  for (const page of pages) {
    const props = (page.properties ?? {}) as Record<string, unknown>;
    const status = typeof props.status === "string" ? props.status : "unknown";
    const latestSummary = typeof props.latest_run_summary === "string" ? props.latest_run_summary : null;
    const latestStatus = typeof props.latest_run_status === "string" ? props.latest_run_status : null;
    const importance = typeof props.latest_run_importance === "number" ? props.latest_run_importance : null;

    lines.push(`## ${page.title} [${status}]`);
    lines.push(`  Slug: ${page.slug}`);

    const domainSlug = typeof props.domain === "string" ? props.domain : null;
    if (domainSlug) {
      lines.push(`  Domain: ${pageNameMap.get(domainSlug) ?? domainSlug}`);
    }

    if (latestSummary || latestStatus) {
      const importanceStr = importance !== null ? ` (importance ${importance.toFixed(2)})` : "";
      lines.push(`  Latest run: ${latestStatus ?? "unknown"}${importanceStr} — ${latestSummary ?? "no summary"}`);
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
    case "idea":
      return loadIdeaContext(contextId, operatorId);
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
    case "idea":
      return "You are advising on this specific idea proposed by the department AI. You have full context about the rationale and the execution plan. Help the user evaluate whether this idea makes sense, discuss the approach, or understand the expected impact.";
    case "system-health":
      return "The user is viewing the System Health page. Help them understand and resolve any issues shown. When suggesting fixes, provide specific navigation paths (e.g., \"Go to Settings → Connections to reconnect Gmail\"). If a department has no issues, say so briefly. Focus on actionable advice — what specifically should the user do next to improve their system health.";
    case "system_jobs":
      return "You are helping manage system monitoring jobs. You have full context about all configured jobs, their schedules, run history, and available domains. Help the user create new jobs, adjust schedules or importance thresholds, pause/resume jobs, understand run results, or diagnose why a job might not be producing useful findings. When creating jobs, you need a title, description, cron expression, and a domain (department) to scope the job to.";
    default:
      return "";
  }
}
