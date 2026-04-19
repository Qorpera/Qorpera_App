import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { rebuildSystemJobIndex } from "@/lib/system-job-index";

/**
 * Seed default system jobs for a new operator as wiki pages.
 * Called after onboarding confirmation and from the admin seed-synthetic route.
 * Idempotent via upsert on (operatorId, slug).
 *
 * Returns the number of jobs created or updated.
 */
export async function seedDefaultSystemJobs(operatorId: string): Promise<number> {
  const adminUser = await prisma.user.findFirst({
    where: { operatorId, role: "admin" },
    select: { id: true, wikiPageSlug: true },
  });

  const domainHubs = await prisma.knowledgePage.findMany({
    where: { operatorId, pageType: "domain_hub", scope: "operator" },
    select: { slug: true, title: true },
    take: 20,
  });

  const normalizeKey = (s: string): string =>
    s.toLowerCase().replace(/^domain[-_]?(hub[-_])?/, "");

  const domainMap = new Map<string, string>();
  for (const d of domainHubs) {
    domainMap.set(normalizeKey(d.slug), d.slug);
  }

  const firstDomain = domainHubs[0]?.slug ?? null;
  const pickDomain = (preferred: string): string | null =>
    domainMap.get(normalizeKey(preferred)) ?? firstDomain;

  const ownerSlug = adminUser?.wikiPageSlug ?? null;
  const adminUserId = adminUser?.id ?? null;

  const seedJobs = buildSeedJobs({
    ownerSlug,
    adminUserId,
    pickDomain,
    allDomainSlugs: domainHubs.map(d => d.slug),
  });

  let created = 0;
  for (const job of seedJobs) {
    await createOrUpdateJobPage(operatorId, job);
    created++;
  }

  return created;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface SeedJobInput {
  slug: string;
  title: string;
  properties: Record<string, unknown>;
  crossReferences: string[];
}

interface SeedJobContext {
  ownerSlug: string | null;
  adminUserId: string | null;
  pickDomain: (preferred: string) => string | null;
  allDomainSlugs: string[];
}

// ── Upsert helper ────────────────────────────────────────────────────────────

async function createOrUpdateJobPage(operatorId: string, job: SeedJobInput): Promise<void> {
  const content = renderJobContent(job);

  const page = await prisma.knowledgePage.upsert({
    where: { operatorId_slug: { operatorId, slug: job.slug } },
    create: {
      operatorId,
      slug: job.slug,
      title: job.title,
      pageType: "system_job",
      scope: "operator",
      status: "verified",
      content,
      contentTokens: Math.ceil(content.length / 4),
      crossReferences: job.crossReferences,
      properties: job.properties as Prisma.InputJsonValue,
      synthesisPath: "onboarding",
      synthesizedByModel: "seed",
      confidence: 1.0,
      lastSynthesizedAt: new Date(),
    },
    update: {
      title: job.title,
      content,
      contentTokens: Math.ceil(content.length / 4),
      crossReferences: job.crossReferences,
      properties: job.properties as Prisma.InputJsonValue,
      status: "verified",
    },
  });

  // Direct prisma.knowledgePage.upsert bypasses the /api/wiki/[slug] hook,
  // so we rebuild the SystemJobIndex explicitly.
  await rebuildSystemJobIndex({
    wikiPageId: page.id,
    operatorId,
    slug: page.slug,
    scope: page.scope,
    properties: page.properties,
  });
}

// ── The five jobs ────────────────────────────────────────────────────────────

function buildSeedJobs(ctx: SeedJobContext): SeedJobInput[] {
  const { ownerSlug, adminUserId, pickDomain, allDomainSlugs } = ctx;
  const recipients = ownerSlug ? [ownerSlug] : [];

  const jobs: SeedJobInput[] = [];

  // Job 1 — Weekly Performance Evaluation (kind=proposals, cron-only, trust=propose)
  const managementDomain = pickDomain("management");
  jobs.push({
    slug: "weekly-performance-evaluation",
    title: "Weekly Performance Evaluation & Purpose Orientation",
    properties: {
      status: "active",
      description: "Evaluates the week's operating activity against stated purpose, surfacing drift and strategic-link candidates for leadership.",
      triggers: [{ type: "cron", expression: "0 17 * * 5" }],
      schedule: "0 17 * * 5",
      deliverable_kind: "proposals",
      trust_level: "propose",
      post_policy: "importance_threshold",
      importance_threshold: 0.3,
      anchor_pages: [managementDomain, "company-overview"].filter(Boolean),
      reach_mode: "domain_bounded",
      domain_scope: managementDomain ? [managementDomain] : [],
      owner: ownerSlug,
      domain: managementDomain,
      recipients,
      budget_soft_tool_calls: 15,
      budget_hard_tool_calls: 25,
      dedup_window_runs: 3,
      creator_user_id_snapshot: adminUserId,
      creator_role_snapshot: "admin",
    },
    crossReferences: [managementDomain, ownerSlug].filter((x): x is string => Boolean(x)),
  });

  // Job 2 — Overdue Invoices Daily Check (kind=report, cron-only, trust=observe)
  const financeDomain = pickDomain("finance");
  jobs.push({
    slug: "overdue-invoices-daily-check",
    title: "Overdue Invoices — Daily Report",
    properties: {
      status: "active",
      description: "Daily morning report of overdue invoices, aging buckets, and collection priorities.",
      triggers: [{ type: "cron", expression: "0 8 * * 1-5" }],
      schedule: "0 8 * * 1-5",
      deliverable_kind: "report",
      trust_level: "observe",
      post_policy: "always",
      anchor_pages: [financeDomain, "ar-aging-policy"].filter(Boolean),
      reach_mode: "pinned_only",
      owner: ownerSlug,
      domain: financeDomain,
      recipients,
      budget_soft_tool_calls: 8,
      budget_hard_tool_calls: 12,
      creator_user_id_snapshot: adminUserId,
      creator_role_snapshot: "admin",
    },
    crossReferences: [financeDomain, ownerSlug].filter((x): x is string => Boolean(x)),
  });

  // Job 3 — Strategic Link Candidate Scout (kind=edits, cron-only, trust=act)
  const strategyDomain = pickDomain("strategy");
  jobs.push({
    slug: "strategic-link-scout",
    title: "Strategic Link Candidate Scout",
    properties: {
      status: "active",
      description: "Scans weekly for new strategic-link candidates and appends to the watchlist wiki page.",
      triggers: [{ type: "cron", expression: "0 9 * * 1" }],
      schedule: "0 9 * * 1",
      deliverable_kind: "edits",
      trust_level: "act",
      post_policy: "actionable_only",
      anchor_pages: [strategyDomain, "strategic-link-watchlist"].filter(Boolean),
      reach_mode: "agentic",
      owner: ownerSlug,
      domain: strategyDomain,
      recipients,
      budget_soft_tool_calls: 12,
      budget_hard_tool_calls: 20,
      creator_user_id_snapshot: adminUserId,
      creator_role_snapshot: "admin",
    },
    crossReferences: [strategyDomain, ownerSlug].filter((x): x is string => Boolean(x)),
  });

  // Job 4 — Situation Escalation Monitor (kind=proposals, event-only)
  jobs.push({
    slug: "situation-escalation-monitor",
    title: "Situation Escalation Monitor",
    properties: {
      status: "active",
      description: "Wakes on any high-severity situation escalation and evaluates whether executive attention is warranted.",
      triggers: [
        {
          type: "event",
          eventType: "situation.escalated",
          filter: { severity: { op: "gte", value: 0.8 } },
        },
      ],
      schedule: "",
      deliverable_kind: "proposals",
      trust_level: "propose",
      post_policy: "always",
      anchor_pages: ["escalation-playbook"],
      reach_mode: "domain_bounded",
      domain_scope: allDomainSlugs,
      owner: ownerSlug,
      recipients,
      budget_soft_tool_calls: 6,
      budget_hard_tool_calls: 10,
      creator_user_id_snapshot: adminUserId,
      creator_role_snapshot: "admin",
    },
    crossReferences: ownerSlug ? [ownerSlug] : [],
  });

  // Job 5 — Initiative Acceptance Audit (kind=mixed, cron + event)
  jobs.push({
    slug: "initiative-acceptance-audit",
    title: "Initiative Acceptance Audit",
    properties: {
      status: "active",
      description: "Reviews recently accepted initiatives for policy compliance. Runs Friday afternoons and wakes on any accept.",
      triggers: [
        { type: "cron", expression: "0 16 * * 5" },
        { type: "event", eventType: "initiative.accepted", filter: {} },
      ],
      schedule: "0 16 * * 5",
      deliverable_kind: "mixed",
      trust_level: "propose",
      post_policy: "actionable_only",
      anchor_pages: ["governance-policies", "initiative-acceptance-criteria"],
      reach_mode: "agentic",
      owner: ownerSlug,
      recipients,
      budget_soft_tool_calls: 10,
      budget_hard_tool_calls: 18,
      creator_user_id_snapshot: adminUserId,
      creator_role_snapshot: "admin",
    },
    crossReferences: ownerSlug ? [ownerSlug] : [],
  });

  return jobs;
}

// ── Content rendering ────────────────────────────────────────────────────────

function renderJobContent(job: SeedJobInput): string {
  const props = job.properties;
  const triggers = (props.triggers as Array<{ type: string; expression?: string; eventType?: string }>) ?? [];
  const triggerLines = triggers.map(t => {
    if (t.type === "cron") return `- Cron: \`${t.expression}\``;
    if (t.type === "event") return `- Event: \`${t.eventType}\``;
    return `- ${t.type}`;
  }).join("\n");

  const anchors = Array.isArray(props.anchor_pages) && (props.anchor_pages as string[]).length > 0
    ? `Always reads anchor pages: ${(props.anchor_pages as string[]).map(s => `[[${s}]]`).join(", ")}.`
    : "No pinned anchor pages.";

  const recipientsList = Array.isArray(props.recipients) && (props.recipients as string[]).length > 0
    ? (props.recipients as string[]).map(r => `- [[${r}]]`).join("\n")
    : "No recipients configured.";

  return `# ${job.title}

## Purpose

${props.description ?? ""}

## Scope

Reach mode: \`${props.reach_mode ?? "agentic"}\`. ${anchors}

## Method

On each trigger, the agent reads anchor pages, optionally explores the wider wiki (per reach mode), and produces a \`${props.deliverable_kind}\` deliverable.

## Output

Deliverable kind: **${props.deliverable_kind}**. Trust level: **${props.trust_level}**. Post policy: **${props.post_policy}**${typeof props.importance_threshold === "number" ? ` (threshold ${props.importance_threshold})` : ""}.

## Recipients

${recipientsList}

## Configuration

Triggers:
${triggerLines || "- (none)"}

Budget: soft ${props.budget_soft_tool_calls ?? 15} / hard ${props.budget_hard_tool_calls ?? 25} tool calls.

## Execution History

_No runs yet._
`;
}
