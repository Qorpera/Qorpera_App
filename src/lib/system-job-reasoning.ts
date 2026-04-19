// ── Imports ───────────────────────────────────────────────────────────────

import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { ensureInternalCapabilities } from "@/lib/internal-capabilities";
import { advanceNextRun } from "@/lib/system-job-index";
import { emitEvent, type TriggerChain } from "@/lib/system-job-events";
import {
  createSituationWikiPage,
  generateSituationSlug,
  formatDate,
} from "@/lib/situation-wiki-helpers";

// ── Zod output schemas (4 variants + mixed union) ─────────────────────────

const FindingSchema = z.object({
  title: z.string(),
  description: z.string(),
  category: z.enum(["trend", "risk", "opportunity", "metric", "anomaly"]),
});

const ProposedSituationSchema = z.object({
  title: z.string(),
  description: z.string(),
  suggestedSituationTypeName: z.string().optional(),
  triggerEntityName: z.string().optional(),
  urgency: z.enum(["low", "medium", "high"]),
  evidence: z.array(z.string()),
});

const ProposedInitiativeSchema = z.object({
  proposalType: z.enum([
    "project_creation",
    "policy_change",
    "system_job_creation",
    "strategy_revision",
    "wiki_update",
    "resource_recommendation",
    "general",
  ]),
  triggerSummary: z.string().min(10),
  rationale: z.string().min(20),
  impactAssessment: z.string().min(10),
  proposal: z.record(z.any()),
});

const WikiEditSchema = z.object({
  target_slug: z.string(),
  change_type: z.enum(["append", "replace_section", "update_property"]),
  section_name: z.string().optional(),
  property_key: z.string().optional(),
  new_content: z.string(),
  rationale: z.string().min(10),
});

const ReportOutputSchema = z.object({
  title: z.string().min(3),
  body_markdown: z.string().min(40),
  key_findings: z.array(z.string()),
  recommendations: z.array(z.string()),
  importance_score: z.number().min(0).max(1),
  summary: z.string().min(10),
  next_run_note: z.string().optional(),
});

const ProposalsOutputSchema = z.object({
  summary: z.string().min(10),
  importance_score: z.number().min(0).max(1),
  analysisNarrative: z.string().min(20),
  proposed_situations: z.array(ProposedSituationSchema),
  proposed_initiatives: z.array(ProposedInitiativeSchema),
  findings: z.array(FindingSchema),
});

const EditsOutputSchema = z.object({
  summary: z.string().min(10),
  importance_score: z.number().min(0).max(1),
  wiki_edits: z.array(WikiEditSchema),
});

const MixedOutputSchema = z.object({
  summary: z.string().min(10),
  importance_score: z.number().min(0).max(1),
  analysisNarrative: z.string().optional(),
  proposed_situations: z.array(ProposedSituationSchema).optional(),
  proposed_initiatives: z.array(ProposedInitiativeSchema).optional(),
  findings: z.array(FindingSchema).optional(),
  wiki_edits: z.array(WikiEditSchema).optional(),
  report: z
    .object({
      title: z.string(),
      body_markdown: z.string(),
      key_findings: z.array(z.string()),
      recommendations: z.array(z.string()),
    })
    .optional(),
});

type FindingT = z.infer<typeof FindingSchema>;
type ProposedSituationT = z.infer<typeof ProposedSituationSchema>;
type ProposedInitiativeT = z.infer<typeof ProposedInitiativeSchema>;
type WikiEditT = z.infer<typeof WikiEditSchema>;
type ReportOutput = z.infer<typeof ReportOutputSchema>;
type ProposalsOutput = z.infer<typeof ProposalsOutputSchema>;
type EditsOutput = z.infer<typeof EditsOutputSchema>;
type MixedOutput = z.infer<typeof MixedOutputSchema>;

type AnyOutput = ReportOutput | ProposalsOutput | EditsOutput | MixedOutput;

// ── Constants & defensive parsers ─────────────────────────────────────────

const VALID_TRUST = ["observe", "propose", "act"] as const;
type TrustLevel = (typeof VALID_TRUST)[number];

type DeliverableKind = "report" | "proposals" | "edits" | "mixed";
type PostPolicy = "always" | "importance_threshold" | "actionable_only";

type TriggerContext = {
  triggerType: "cron" | "event";
  eventType?: string;
  payload?: Record<string, unknown>;
};

function parseTrustLevel(raw: unknown): TrustLevel {
  if (typeof raw === "string" && (VALID_TRUST as readonly string[]).includes(raw)) {
    return raw as TrustLevel;
  }
  console.warn(
    `[system-job] Unknown trust_level ${JSON.stringify(raw)} — coercing to 'observe'`,
  );
  return "observe";
}

function parseDeliverableKind(raw: unknown): DeliverableKind {
  return raw === "report" || raw === "proposals" || raw === "edits" || raw === "mixed"
    ? raw
    : "proposals";
}

function parsePostPolicy(raw: unknown): PostPolicy {
  return raw === "always" || raw === "importance_threshold" || raw === "actionable_only"
    ? raw
    : "always";
}

// ── Internal types ────────────────────────────────────────────────────────

type SystemJobIndexRow = {
  id: string;
  wikiPageId: string;
  operatorId: string;
  slug: string;
  status: string;
  cronExpression: string | null;
  triggerTypes: string[];
  deliverableKind: string;
  trustLevel: string;
  creatorRoleSnapshot: string | null;
  creatorUserIdSnapshot: string | null;
};

type WikiPageRow = {
  id: string;
  slug: string;
  title: string;
  content: string;
  properties: Prisma.JsonValue;
};

// ── Public entry points ───────────────────────────────────────────────────

/**
 * Called every 15 min by the cron scheduler. Finds jobs whose nextRunAt has
 * elapsed and runs them. Does not handle event-triggered runs — those come
 * through the worker handler `run_system_job` → runSystemJobByIndex.
 */
export async function processCronTriggers(): Promise<{
  processed: number;
  triggered: number;
  compressed: number;
  errors: number;
}> {
  const result = { processed: 0, triggered: 0, compressed: 0, errors: 0 };
  const now = new Date();

  const due = await prisma.systemJobIndex.findMany({
    where: {
      status: "active",
      nextRunAt: { lte: now },
      triggerTypes: { has: "cron" },
    },
    include: {
      wikiPage: {
        select: { id: true, slug: true, title: true, content: true, properties: true },
      },
    },
  });

  for (const row of due) {
    result.processed++;

    if (!row.wikiPage) {
      console.warn(`[system-job] Index ${row.id} has no wiki page — skipping`);
      result.errors++;
      continue;
    }

    const index: SystemJobIndexRow = {
      id: row.id,
      wikiPageId: row.wikiPageId,
      operatorId: row.operatorId,
      slug: row.slug,
      status: row.status,
      cronExpression: row.cronExpression,
      triggerTypes: row.triggerTypes,
      deliverableKind: row.deliverableKind,
      trustLevel: row.trustLevel,
      creatorRoleSnapshot: row.creatorRoleSnapshot,
      creatorUserIdSnapshot: row.creatorUserIdSnapshot,
    };

    let runStatus: "completed" | "compressed" | "failed" = "failed";
    try {
      runStatus = await executeSystemJob({
        index,
        wikiPage: row.wikiPage,
        triggerContext: { triggerType: "cron" },
        triggerChain: [],
      });
    } catch (err) {
      console.error(`[system-job] Unhandled error for ${row.slug}:`, err);
      result.errors++;
    }

    if (runStatus === "compressed") result.compressed++;
    else if (runStatus === "completed") result.triggered++;
    else if (runStatus === "failed") result.errors++;

    if (row.cronExpression) {
      await advanceNextRun({
        indexId: row.id,
        cronExpression: row.cronExpression,
        from: now,
      });
    }
  }

  return result;
}

/**
 * Called by the worker handler for `run_system_job` jobs (from the event bus).
 * Also usable as a manual trigger from API routes.
 */
export async function runSystemJobByIndex(args: {
  systemJobIndexId: string;
  triggerContext: TriggerContext;
  triggerChain: string[];
}): Promise<void> {
  const row = await prisma.systemJobIndex.findUnique({
    where: { id: args.systemJobIndexId },
    include: {
      wikiPage: {
        select: { id: true, slug: true, title: true, content: true, properties: true },
      },
    },
  });

  if (!row) {
    console.warn(`[system-job] Index ${args.systemJobIndexId} not found`);
    return;
  }
  if (!row.wikiPage) {
    console.warn(`[system-job] Index ${args.systemJobIndexId} has no wiki page`);
    return;
  }
  if (row.status !== "active") {
    console.log(`[system-job] Skipping ${row.slug} — status=${row.status}`);
    return;
  }

  const index: SystemJobIndexRow = {
    id: row.id,
    wikiPageId: row.wikiPageId,
    operatorId: row.operatorId,
    slug: row.slug,
    status: row.status,
    cronExpression: row.cronExpression,
    triggerTypes: row.triggerTypes,
    deliverableKind: row.deliverableKind,
    trustLevel: row.trustLevel,
    creatorRoleSnapshot: row.creatorRoleSnapshot,
    creatorUserIdSnapshot: row.creatorUserIdSnapshot,
  };

  await executeSystemJob({
    index,
    wikiPage: row.wikiPage,
    triggerContext: args.triggerContext,
    triggerChain: args.triggerChain,
  });
}

// ── Core execution ────────────────────────────────────────────────────────

async function executeSystemJob(args: {
  index: SystemJobIndexRow;
  wikiPage: WikiPageRow;
  triggerContext: TriggerContext;
  triggerChain: string[];
}): Promise<"completed" | "compressed" | "failed"> {
  const { index, wikiPage, triggerContext, triggerChain } = args;
  const runDate = new Date();

  const props = (wikiPage.properties ?? {}) as Record<string, unknown>;
  const kind = parseDeliverableKind(index.deliverableKind);
  const postPolicy = parsePostPolicy(props.post_policy);
  const importanceThreshold =
    typeof props.importance_threshold === "number" ? props.importance_threshold : 0.5;
  const softBudget =
    typeof props.budget_soft_tool_calls === "number" ? props.budget_soft_tool_calls : 15;
  const hardBudget =
    typeof props.budget_hard_tool_calls === "number" ? props.budget_hard_tool_calls : 25;

  // Permission gate: defensive trust parse + creator-role downgrade
  const declaredTrust = parseTrustLevel(index.trustLevel);
  let effectiveTrust: TrustLevel = declaredTrust;
  let trustBannerNote: string | null = null;
  const creatorRole = index.creatorRoleSnapshot ?? "";
  if (declaredTrust === "act" && creatorRole !== "admin" && creatorRole !== "superadmin") {
    console.warn(
      `[system-job] Job ${index.slug}: trust_level=act requires admin creator (got ${JSON.stringify(creatorRole)}) — downgrading to propose for this run`,
    );
    effectiveTrust = "propose";
    trustBannerNote = "Trust downgraded to propose — creator role insufficient for act.";
  }

  try {
    await ensureInternalCapabilities(index.operatorId);

    const operator = await prisma.operator.findUnique({
      where: { id: index.operatorId },
      select: { companyName: true },
    });
    const companyName = operator?.companyName ?? "the company";

    // Anchor pages (referenced wiki pages to prefetch)
    const anchorSlugs = Array.isArray(props.anchor_pages)
      ? (props.anchor_pages as unknown[]).filter((s): s is string => typeof s === "string")
      : [];
    const anchorPages =
      anchorSlugs.length > 0
        ? await prisma.knowledgePage.findMany({
            where: {
              operatorId: index.operatorId,
              slug: { in: anchorSlugs },
              scope: "operator",
            },
            select: { slug: true, title: true, content: true },
            take: 10,
          })
        : [];

    // Domain context (optional)
    let domainContext = "";
    const domainSlug = typeof props.domain === "string" ? props.domain : null;
    if (domainSlug) {
      const domainPage = await prisma.knowledgePage.findFirst({
        where: { operatorId: index.operatorId, slug: domainSlug, scope: "operator" },
        select: { title: true, content: true },
      });
      if (domainPage) {
        domainContext = `\nDOMAIN: ${domainPage.title}\n${domainPage.content.slice(0, 1500)}`;
      }
    }

    // Prior runs from execution history
    const priorRuns = parseExecutionHistory(wikiPage.content, 3);

    // Active situations (dedup, cap 40)
    const activeSituationPages = await prisma.knowledgePage.findMany({
      where: {
        operatorId: index.operatorId,
        pageType: "situation_instance",
        scope: "operator",
      },
      select: { title: true, properties: true },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    const activeSituations = activeSituationPages
      .filter((p) => {
        const sp = (p.properties ?? {}) as Record<string, unknown>;
        const status = sp.status as string | undefined;
        return !status || !["resolved", "closed", "dismissed"].includes(status);
      })
      .map((p) => {
        const sp = (p.properties ?? {}) as Record<string, unknown>;
        return {
          title: p.title,
          status: (sp.status as string) ?? "detected",
          situationType: (sp.situation_type as string) ?? "unknown",
        };
      });

    // Active initiatives (dedup, cap 20)
    const activeInitiativePages = await prisma.knowledgePage.findMany({
      where: { operatorId: index.operatorId, pageType: "initiative", scope: "operator" },
      select: { title: true, properties: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const activeInitiatives = activeInitiativePages
      .filter((p) => {
        const sp = (p.properties ?? {}) as Record<string, unknown>;
        return !["rejected", "failed", "completed"].includes(sp.status as string);
      })
      .map((p) => {
        const sp = (p.properties ?? {}) as Record<string, unknown>;
        return {
          title: p.title,
          status: (sp.status as string) ?? "proposed",
          proposalType: (sp.proposal_type as string) ?? "general",
        };
      });

    // Build seed context
    const seedContext = buildSeedContext({
      jobTitle: wikiPage.title,
      jobInstructions: wikiPage.content,
      anchorPages,
      domainContext,
      companyName,
      priorRuns,
      activeSituations,
      activeInitiatives,
      triggerContext,
    });

    const systemPrompt = buildSystemPrompt({
      kind,
      jobTitle: wikiPage.title,
      jobSlug: wikiPage.slug,
      companyName,
      softBudget,
      hardBudget,
    });

    // Tools
    const { REASONING_TOOLS, executeReasoningTool } = await import("@/lib/reasoning-tools");
    const { getConnectorReadTools, executeConnectorReadTool } = await import(
      "@/lib/connector-read-tools"
    );
    const { tools: connectorTools } = await getConnectorReadTools(index.operatorId);
    const allTools = [...REASONING_TOOLS, ...connectorTools];

    const dispatchTool = async (
      toolName: string,
      toolArgs: Record<string, unknown>,
    ): Promise<string> => {
      try {
        return await executeReasoningTool(index.operatorId, toolName, toolArgs);
      } catch {
        return await executeConnectorReadTool(index.operatorId, toolName, toolArgs);
      }
    };

    const outputSchema = pickOutputSchema(kind) as z.ZodType<AnyOutput>;
    const cycleNumber = priorRuns.length + 1;

    const { runAgenticLoop } = await import("@/lib/agentic-loop");
    const agenticResult = await runAgenticLoop<AnyOutput>({
      operatorId: index.operatorId,
      contextId: index.id,
      contextType: "system_job",
      cycleNumber,
      systemPrompt,
      seedContext,
      tools: allTools,
      dispatchTool,
      outputSchema,
      softBudget,
      hardBudget,
      modelRoute: "systemJobReasoning",
    });

    const output = agenticResult.output as AnyOutput;
    const importanceScore = output.importance_score;
    const summary = output.summary;
    const toolCalls = agenticResult.toolCallCount;
    const costCents = Math.round(agenticResult.apiCostCents);

    // ── Post-policy gate ──
    const dispatchable = countDispatchableOutputs(kind, output);
    let shouldCompress = false;
    if (postPolicy === "importance_threshold" && importanceScore < importanceThreshold) {
      shouldCompress = true;
    } else if (postPolicy === "actionable_only" && dispatchable === 0) {
      shouldCompress = true;
    }

    if (shouldCompress) {
      await writeRunOutcomeToWikiPage({
        operatorId: index.operatorId,
        wikiPageSlug: wikiPage.slug,
        entry: {
          runDate,
          status: "compressed",
          importanceScore,
          summary: summary || "Compressed by post_policy",
          toolCalls,
          costCents,
          trustBannerNote,
        },
        latestRunSummary: summary,
        latestRunStatus: "compressed",
        runDate,
      });
      await emitJobCompletedEvent({
        operatorId: index.operatorId,
        sourceJobSlug: wikiPage.slug,
        importanceScore,
        status: "compressed",
        triggerChain: [...triggerChain, wikiPage.slug],
      });
      return "compressed";
    }

    // ── Dispatch by kind ──
    let proposedSlugs: string[] = [];
    let reportSubPageSlug: string | null = null;
    let editCount = 0;

    if (kind === "report") {
      const r = output as ReportOutput;
      const res = await handleReportOutput({
        index,
        wikiPage: { slug: wikiPage.slug, id: wikiPage.id, operatorId: index.operatorId },
        output: r,
        runDate,
        toolCalls,
        costCents,
      });
      reportSubPageSlug = res.subPageSlug;
    } else if (kind === "proposals") {
      const p = output as ProposalsOutput;
      const res = await handleProposalsOutput({
        index,
        wikiPage,
        situations: p.proposed_situations,
        initiatives: p.proposed_initiatives,
        triggerChain: [...triggerChain, wikiPage.slug],
      });
      proposedSlugs = res.proposedSlugs;
    } else if (kind === "edits") {
      const e = output as EditsOutput;
      const res = await handleEditsOutput({
        index,
        wikiPage,
        edits: e.wiki_edits,
        effectiveTrust,
        triggerChain: [...triggerChain, wikiPage.slug],
      });
      editCount = res.editCount;
      proposedSlugs = res.initiativeSlugs;
    } else {
      // mixed — call all conditionally
      const m = output as MixedOutput;
      if (m.proposed_situations?.length || m.proposed_initiatives?.length) {
        const res = await handleProposalsOutput({
          index,
          wikiPage,
          situations: m.proposed_situations ?? [],
          initiatives: m.proposed_initiatives ?? [],
          triggerChain: [...triggerChain, wikiPage.slug],
        });
        proposedSlugs.push(...res.proposedSlugs);
      }
      if (m.wiki_edits?.length) {
        const res = await handleEditsOutput({
          index,
          wikiPage,
          edits: m.wiki_edits,
          effectiveTrust,
          triggerChain: [...triggerChain, wikiPage.slug],
        });
        editCount += res.editCount;
        proposedSlugs.push(...res.initiativeSlugs);
      }
      if (m.report) {
        const res = await handleReportOutput({
          index,
          wikiPage: { slug: wikiPage.slug, id: wikiPage.id, operatorId: index.operatorId },
          output: {
            ...m.report,
            importance_score: importanceScore,
            summary,
          },
          runDate,
          toolCalls,
          costCents,
        });
        reportSubPageSlug = res.subPageSlug;
      }
    }

    // ── Execution history + props update (atomic, locked) ──
    await writeRunOutcomeToWikiPage({
      operatorId: index.operatorId,
      wikiPageSlug: wikiPage.slug,
      entry: {
        runDate,
        status: "completed",
        importanceScore,
        summary,
        proposedSlugs,
        reportSubPageSlug,
        editCount,
        toolCalls,
        costCents,
        trustBannerNote,
      },
      latestRunSummary: summary,
      latestRunStatus: "completed",
      runDate,
    });

    sendNotificationToAdmins({
      operatorId: index.operatorId,
      type: "system_alert",
      title: `System Job completed: ${wikiPage.title}`,
      body: summary.slice(0, 200),
      sourceType: "system_job",
      sourceId: index.id,
    }).catch(() => {});

    await emitJobCompletedEvent({
      operatorId: index.operatorId,
      sourceJobSlug: wikiPage.slug,
      importanceScore,
      status: "completed",
      triggerChain: [...triggerChain, wikiPage.slug],
    });

    return "completed";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[system-job] Execution failed for ${index.slug}:`, err);
    try {
      await writeRunOutcomeToWikiPage({
        operatorId: index.operatorId,
        wikiPageSlug: wikiPage.slug,
        entry: {
          runDate,
          status: "failed",
          importanceScore: 0,
          summary: "Execution failed",
          toolCalls: 0,
          costCents: 0,
          errorMessage: message.slice(0, 200),
          trustBannerNote,
        },
        latestRunSummary: message.slice(0, 200),
        latestRunStatus: "failed",
        runDate,
      });
    } catch (writeErr) {
      console.error(`[system-job] Failed to write failure history:`, writeErr);
    }
    return "failed";
  }
}

function pickOutputSchema(kind: DeliverableKind) {
  if (kind === "report") return ReportOutputSchema;
  if (kind === "proposals") return ProposalsOutputSchema;
  if (kind === "edits") return EditsOutputSchema;
  return MixedOutputSchema;
}

function countDispatchableOutputs(kind: DeliverableKind, output: AnyOutput): number {
  if (kind === "report") {
    const r = output as ReportOutput;
    return (r.key_findings?.length ?? 0) + (r.recommendations?.length ?? 0);
  }
  if (kind === "proposals") {
    const p = output as ProposalsOutput;
    return p.proposed_situations.length + p.proposed_initiatives.length;
  }
  if (kind === "edits") {
    const e = output as EditsOutput;
    return e.wiki_edits.length;
  }
  const m = output as MixedOutput;
  return (
    (m.proposed_situations?.length ?? 0) +
    (m.proposed_initiatives?.length ?? 0) +
    (m.wiki_edits?.length ?? 0) +
    (m.report ? 1 : 0)
  );
}

// ── Per-kind output handling ──────────────────────────────────────────────

async function handleReportOutput(params: {
  index: SystemJobIndexRow;
  wikiPage: { slug: string; id: string; operatorId: string };
  output: ReportOutput;
  runDate: Date;
  toolCalls: number;
  costCents: number;
}): Promise<{ subPageSlug: string }> {
  const { index, wikiPage, output, runDate, toolCalls, costCents } = params;
  const dateStr = runDate.toISOString().slice(0, 10);

  // Slashes are not allowed in normalized slugs — use dash notation.
  let subPageSlug = `system-job-${wikiPage.slug}-runs-${dateStr}`;
  let suffix = 0;
  while (
    await prisma.knowledgePage.findFirst({
      where: { operatorId: wikiPage.operatorId, slug: subPageSlug },
      select: { id: true },
    })
  ) {
    suffix++;
    subPageSlug = `system-job-${wikiPage.slug}-runs-${dateStr}-${suffix}`;
    if (suffix > 50) {
      subPageSlug = `system-job-${wikiPage.slug}-runs-${createId()}`;
      break;
    }
  }

  await prisma.knowledgePage.create({
    data: {
      operatorId: index.operatorId,
      slug: subPageSlug,
      title: output.title,
      pageType: "system_job_run_report",
      scope: "operator",
      status: "draft",
      content: output.body_markdown,
      contentTokens: Math.ceil(output.body_markdown.length / 4),
      crossReferences: [wikiPage.slug],
      properties: {
        parent_job_slug: wikiPage.slug,
        run_date: runDate.toISOString(),
        importance_score: output.importance_score,
        tool_calls: toolCalls,
        cost_cents: costCents,
        key_findings: output.key_findings,
        recommendations: output.recommendations,
        ...(output.next_run_note ? { next_run_note: output.next_run_note } : {}),
      } as Prisma.InputJsonValue,
      synthesisPath: "reasoning",
      synthesizedByModel: "system_job_reasoning",
      confidence: 0.6,
      lastSynthesizedAt: new Date(),
    },
  });

  return { subPageSlug };
}

async function handleProposalsOutput(params: {
  index: SystemJobIndexRow;
  wikiPage: WikiPageRow;
  situations: ProposedSituationT[];
  initiatives: ProposedInitiativeT[];
  triggerChain: string[];
}): Promise<{ proposedSlugs: string[] }> {
  const { index, wikiPage, situations, initiatives, triggerChain } = params;
  const props = (wikiPage.properties ?? {}) as Record<string, unknown>;
  const domainSlug = typeof props.domain === "string" ? props.domain : null;
  const ownerSlug = typeof props.owner === "string" ? props.owner : null;

  const proposedSlugs: string[] = [];

  for (const proposed of situations) {
    try {
      let situationTypeId: string | null = null;
      if (proposed.suggestedSituationTypeName) {
        const st = await prisma.situationType.findFirst({
          where: {
            operatorId: index.operatorId,
            name: { contains: proposed.suggestedSituationTypeName, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (!st) {
          console.warn(
            `[system-job] Could not resolve situation type: ${proposed.suggestedSituationTypeName}. Skipping.`,
          );
          continue;
        }
        situationTypeId = st.id;
      }
      if (!situationTypeId) continue;

      let triggerPageSlug: string | null = null;
      if (proposed.triggerEntityName) {
        const page = await prisma.knowledgePage.findFirst({
          where: {
            operatorId: index.operatorId,
            scope: "operator",
            title: { contains: proposed.triggerEntityName, mode: "insensitive" },
            status: { in: ["draft", "verified"] },
          },
          select: { slug: true },
        });
        triggerPageSlug = page?.slug ?? null;
      }

      const stRow = await prisma.situationType.findUnique({
        where: { id: situationTypeId },
        select: { name: true, slug: true },
      });
      const situationId = createId();
      const severity = { high: 0.9, medium: 0.6, low: 0.3 }[proposed.urgency] ?? 0.5;
      const subjectSlug = triggerPageSlug ?? "system-job";
      const wikiPageSlug = await generateSituationSlug(
        index.operatorId,
        stRow?.slug ?? "situation",
        subjectSlug,
      );

      await createSituationWikiPage({
        operatorId: index.operatorId,
        slug: wikiPageSlug,
        title: `${stRow?.name ?? "Situation"}: ${proposed.description.slice(0, 100)}`,
        properties: {
          situation_id: situationId,
          status: "detected",
          severity,
          confidence: 0.7,
          situation_type: stRow?.slug ?? "situation",
          detected_at: new Date().toISOString(),
          source: "detected",
          trigger_ref: `system-job:${wikiPage.slug}`,
          domain: domainSlug ?? undefined,
        },
        triggerContent: `System Job "${wikiPage.title}" proposed this situation:\n\n${proposed.description}`,
        contextContent: proposed.evidence.map((e) => `- ${e}`).join("\n"),
        timelineEntries: [
          `${formatDate(new Date().toISOString())} — Detected by system job: ${wikiPage.title}`,
        ],
      });

      const { enqueueWorkerJob } = await import("@/lib/worker-dispatch");
      enqueueWorkerJob("reason_situation", index.operatorId, {
        situationId,
        wikiPageSlug,
      }).catch((err) => console.error("[system-job] Failed to enqueue reasoning:", err));

      proposedSlugs.push(wikiPageSlug);
    } catch (err) {
      console.error(`[system-job] Failed to create situation:`, err);
    }
  }

  for (const proposed of initiatives) {
    try {
      const slug = `initiative-${createId()}`;

      const articleBody = [
        `## Trigger`,
        proposed.triggerSummary,
        ``,
        `## Rationale`,
        proposed.rationale,
        ``,
        `## Impact`,
        proposed.impactAssessment,
        ``,
        `## Timeline`,
        `${new Date().toISOString().slice(0, 16)} — Proposed by system job: ${wikiPage.title}`,
      ].join("\n");

      const crossRefs: string[] = [wikiPage.slug];
      if (domainSlug) crossRefs.push(domainSlug);
      if (ownerSlug) crossRefs.push(ownerSlug);

      // Schedule mirror requirement: when proposing system_job_creation, derive
      // schedule from the first cron trigger in the proposal so legacy UI works.
      let scheduleMirror: string | undefined;
      if (proposed.proposalType === "system_job_creation") {
        const triggers = (proposed.proposal as { triggers?: unknown[] }).triggers;
        if (Array.isArray(triggers)) {
          const firstCron = triggers.find(
            (t) =>
              t &&
              typeof t === "object" &&
              (t as { type?: unknown }).type === "cron" &&
              typeof (t as { expression?: unknown }).expression === "string",
          ) as { expression: string } | undefined;
          scheduleMirror = firstCron?.expression ?? "";
        } else {
          scheduleMirror = "";
        }
      }

      await prisma.knowledgePage.create({
        data: {
          operatorId: index.operatorId,
          slug,
          title: proposed.triggerSummary,
          pageType: "initiative",
          scope: "operator",
          status: "draft",
          content: articleBody,
          contentTokens: Math.ceil(articleBody.length / 4),
          crossReferences: crossRefs,
          properties: {
            status: "detected",
            proposal_type: proposed.proposalType,
            proposed_at: new Date().toISOString(),
            source: "system_job",
            source_job_id: wikiPage.id,
            source_job_slug: wikiPage.slug,
            domain: domainSlug,
            owner: ownerSlug,
            rationale: proposed.rationale,
            impact_assessment: proposed.impactAssessment,
            evidence: [{ source: "system_job", claim: proposed.triggerSummary }],
            ...(proposed.proposalType === "project_creation"
              ? { project_config: proposed.proposal }
              : {}),
            ...(scheduleMirror !== undefined ? { schedule: scheduleMirror } : {}),
          } as Prisma.InputJsonValue,
          synthesisPath: "reasoning",
          synthesizedByModel: "system_job_reasoning",
          confidence: 0.5,
          lastSynthesizedAt: new Date(),
        },
      });

      try {
        await emitEvent(
          {
            type: "initiative.proposed",
            operatorId: index.operatorId,
            payload: {
              proposalType: proposed.proposalType,
              source: "system_job",
              domain: domainSlug ?? null,
              initiativeSlug: slug,
              sourceJobId: wikiPage.id,
              sourceJobSlug: wikiPage.slug,
            },
          },
          triggerChain,
        );
      } catch (err) {
        console.warn(`[event-emit] initiative.proposed failed:`, err);
      }

      const { enqueueWorkerJob } = await import("@/lib/worker-dispatch");
      await enqueueWorkerJob("reason_initiative", index.operatorId, {
        operatorId: index.operatorId,
        pageSlug: slug,
      }).catch((err) => {
        console.error(`[system-job] Failed to enqueue reason_initiative for ${slug}:`, err);
      });

      proposedSlugs.push(slug);
    } catch (err) {
      console.error(`[system-job] Failed to create initiative:`, err);
    }
  }

  return { proposedSlugs };
}

async function handleEditsOutput(params: {
  index: SystemJobIndexRow;
  wikiPage: WikiPageRow;
  edits: WikiEditT[];
  effectiveTrust: TrustLevel;
  triggerChain: string[];
}): Promise<{ editCount: number; initiativeSlugs: string[] }> {
  const { index, wikiPage, edits, effectiveTrust, triggerChain } = params;
  const initiativeSlugs: string[] = [];
  let editCount = 0;

  for (const edit of edits) {
    try {
      // Apply first when trust=act so the initiative reflects the actual outcome.
      let applyOutcome: "applied" | "skipped" | "failed" = "skipped";
      let applyError: string | null = null;
      if (effectiveTrust === "act") {
        try {
          await applyWikiEdit(edit, index.operatorId);
          applyOutcome = "applied";
        } catch (err) {
          applyOutcome = "failed";
          applyError = err instanceof Error ? err.message : String(err);
          console.error(
            `[system-job] applyWikiEdit failed for ${edit.target_slug}:`,
            err,
          );
        }
      }

      const initiativeStatus =
        effectiveTrust === "act"
          ? applyOutcome === "applied"
            ? "accepted"
            : "failed"
          : "proposed";
      const autoAccepted = effectiveTrust === "act" && applyOutcome === "applied";

      const slug = `init-wiki-update-${createId()}`;
      const articleBody = buildWikiEditInitiativeBody(edit, wikiPage.title);

      await prisma.knowledgePage.create({
        data: {
          operatorId: index.operatorId,
          slug,
          title: `Wiki update: ${edit.target_slug}`,
          pageType: "initiative",
          scope: "operator",
          status: "draft",
          content: articleBody,
          contentTokens: Math.ceil(articleBody.length / 4),
          crossReferences: [edit.target_slug, wikiPage.slug],
          properties: {
            status: initiativeStatus,
            auto_accepted: autoAccepted,
            apply_error: applyError,
            proposal_type: "wiki_update",
            source: "system_job",
            source_job_id: wikiPage.id,
            source_job_slug: wikiPage.slug,
            proposed_at: new Date().toISOString(),
            target_slug: edit.target_slug,
            change_type: edit.change_type,
            section_name: edit.section_name,
            property_key: edit.property_key,
            new_content: edit.new_content,
            rationale: edit.rationale,
          } as Prisma.InputJsonValue,
          synthesisPath: "reasoning",
          synthesizedByModel: "system_job_reasoning",
          confidence: 0.5,
          lastSynthesizedAt: new Date(),
        },
      });
      initiativeSlugs.push(slug);
      editCount++;

      try {
        await emitEvent(
          {
            type: "initiative.proposed",
            operatorId: index.operatorId,
            payload: {
              proposalType: "wiki_update",
              source: "system_job",
              initiativeSlug: slug,
              sourceJobId: wikiPage.id,
              sourceJobSlug: wikiPage.slug,
              targetSlug: edit.target_slug,
              autoAccepted,
              applyOutcome,
            },
          },
          triggerChain,
        );
      } catch (err) {
        console.warn(`[event-emit] initiative.proposed failed:`, err);
      }
    } catch (err) {
      console.error(`[system-job] Failed to create wiki_update initiative:`, err);
    }
  }

  return { editCount, initiativeSlugs };
}

function buildWikiEditInitiativeBody(edit: WikiEditT, jobTitle: string): string {
  const lines = [
    `## Target`,
    `[[${edit.target_slug}]]`,
    ``,
    `## Change Type`,
    edit.change_type,
  ];
  if (edit.section_name) {
    lines.push(``, `## Section`, edit.section_name);
  }
  if (edit.property_key) {
    lines.push(``, `## Property`, edit.property_key);
  }
  lines.push(
    ``,
    `## Proposed Content`,
    "```",
    edit.new_content,
    "```",
    ``,
    `## Rationale`,
    edit.rationale,
    ``,
    `## Provenance`,
    `Proposed by system job: ${jobTitle}`,
  );
  return lines.join("\n");
}

async function applyWikiEdit(edit: WikiEditT, operatorId: string): Promise<void> {
  const target = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug: edit.target_slug, scope: "operator" },
    select: { id: true, content: true, properties: true },
  });
  if (!target) {
    console.warn(`[system-job] applyWikiEdit: target slug not found: ${edit.target_slug}`);
    return;
  }

  if (edit.change_type === "append") {
    const newContent = `${target.content.replace(/\s+$/, "")}\n\n${edit.new_content.trim()}\n`;
    await prisma.knowledgePage.update({
      where: { id: target.id },
      data: {
        content: newContent,
        contentTokens: Math.ceil(newContent.length / 4),
        updatedAt: new Date(),
      },
    });
    return;
  }

  if (edit.change_type === "replace_section") {
    if (!edit.section_name) {
      throw new Error(
        `replace_section requires section_name (target_slug=${edit.target_slug})`,
      );
    }
    const newContent = replaceSection(target.content, edit.section_name, edit.new_content);
    if (newContent === null) {
      throw new Error(
        `replace_section: target section "${edit.section_name}" not found on page ${edit.target_slug}`,
      );
    }
    await prisma.knowledgePage.update({
      where: { id: target.id },
      data: {
        content: newContent,
        contentTokens: Math.ceil(newContent.length / 4),
        updatedAt: new Date(),
      },
    });
    return;
  }

  if (edit.change_type === "update_property") {
    if (!edit.property_key) {
      console.warn(`[system-job] applyWikiEdit update_property requires property_key`);
      return;
    }
    const props = (target.properties ?? {}) as Record<string, unknown>;
    let parsed: unknown = edit.new_content;
    try {
      parsed = JSON.parse(edit.new_content);
    } catch {
      // not JSON — store as string
    }
    const updated = { ...props, [edit.property_key]: parsed };
    await prisma.knowledgePage.update({
      where: { id: target.id },
      data: {
        properties: updated as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
    return;
  }
}

/**
 * Replace the body of a level-2 section (`## Name`). Returns the new content,
 * or null if the named section does not exist. Caller decides how to surface
 * the miss (typically: surface the error so the initiative reflects failure).
 */
function replaceSection(
  content: string,
  sectionName: string,
  newBody: string,
): string | null {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(^|\\n)(## ${escaped}\\s*\\n)([\\s\\S]*?)(?=\\n## |\\n*$)`,
    "i",
  );
  if (!re.test(content)) return null;
  return content.replace(re, (_m, lead, header) => `${lead}${header}${newBody.trim()}\n`);
}

// ── Execution history writer + parser ─────────────────────────────────────

const EXECUTION_HISTORY_HEADER = "## Execution History";

export interface ExecutionHistoryEntry {
  runDate: Date;
  status: "completed" | "compressed" | "failed";
  importanceScore: number;
  summary: string;
  proposedSlugs: string[];
  reportSubPageSlug: string | null;
  editCount: number;
  toolCalls: number | null;
  costCents: number | null;
  errorMessage: string | null;
  trustBannerNote: string | null;
}

export type ExecutionHistoryEntryInput = {
  runDate: Date;
  status: "completed" | "compressed" | "failed";
  importanceScore: number;
  summary: string;
  proposedSlugs?: string[];
  reportSubPageSlug?: string | null;
  editCount?: number;
  toolCalls: number;
  costCents: number;
  errorMessage?: string;
  trustBannerNote?: string | null;
};

/**
 * Atomically write the Execution History entry AND update the runtime-owned
 * properties (latest_run_summary/status, last_run). Uses updatePageWithLock
 * for CAS — concurrent cron + event runs on the same job won't clobber each
 * other's entries. Triggers SystemJobIndex rebuild as a side effect of the
 * update hook in updatePageWithLock.
 */
async function writeRunOutcomeToWikiPage(params: {
  operatorId: string;
  wikiPageSlug: string;
  entry: ExecutionHistoryEntryInput;
  latestRunSummary: string;
  latestRunStatus: "completed" | "compressed" | "failed";
  runDate: Date;
}): Promise<void> {
  const { updatePageWithLock } = await import("@/lib/wiki-engine");
  await updatePageWithLock(params.operatorId, params.wikiPageSlug, (page) => {
    const nextContent = prependHistoryEntry(page.content, params.entry);
    const currentProps = (page.properties ?? {}) as Record<string, unknown>;
    const nextProps: Record<string, unknown> = {
      ...currentProps,
      last_run: params.runDate.toISOString(),
      latest_run_summary: params.latestRunSummary.slice(0, 280),
      latest_run_status: params.latestRunStatus,
    };
    return { content: nextContent, properties: nextProps };
  });
}

/**
 * Pure helper — splice a new entry to the top of the Execution History
 * section. If the section doesn't exist, append it with the entry. Unit-testable.
 */
export function prependHistoryEntry(content: string, entry: ExecutionHistoryEntryInput): string {
  const block = formatExecutionHistoryEntry(entry);
  const idx = content.indexOf(EXECUTION_HISTORY_HEADER);
  if (idx === -1) {
    const sep = content.endsWith("\n") ? "" : "\n";
    return `${content}${sep}\n${EXECUTION_HISTORY_HEADER}\n\n${block}`;
  }
  const before = content.slice(0, idx + EXECUTION_HISTORY_HEADER.length);
  const after = content.slice(idx + EXECUTION_HISTORY_HEADER.length);
  const trimmed = after.replace(/^\n+/, "");
  return `${before}\n\n${block}${trimmed}`;
}

function formatExecutionHistoryEntry(entry: ExecutionHistoryEntryInput): string {
  const statusWord =
    entry.status === "completed"
      ? "Completed"
      : entry.status === "compressed"
        ? "Compressed"
        : "Failed";
  const dateStr = entry.runDate.toISOString().slice(0, 10);
  const dayHm = formatDayHm(entry.runDate);
  const importance = entry.importanceScore.toFixed(2);
  const lines: string[] = [];
  lines.push(`### ${dateStr} (${dayHm}) — ${statusWord} [importance ${importance}]`);
  lines.push("");
  if (entry.trustBannerNote) {
    lines.push(`> ${entry.trustBannerNote}`);
    lines.push("");
  }
  lines.push(entry.summary);
  lines.push("");

  if (entry.status === "compressed") {
    lines.push(
      `**Tool calls:** ${entry.toolCalls} | **Cost:** $${(entry.costCents / 100).toFixed(2)}`,
    );
  } else if (entry.status === "failed") {
    if (entry.errorMessage) {
      lines.push(`**Error:** ${entry.errorMessage.slice(0, 200)}`);
    }
    lines.push(
      `**Tool calls:** ${entry.toolCalls} | **Cost:** $${(entry.costCents / 100).toFixed(2)}`,
    );
  } else {
    if (entry.proposedSlugs && entry.proposedSlugs.length > 0) {
      lines.push(`**Proposed:** ${entry.proposedSlugs.map((s) => `[[${s}]]`).join(", ")}`);
    }
    if (entry.reportSubPageSlug) {
      lines.push(`**Report:** [[${entry.reportSubPageSlug}]]`);
    }
    if (entry.editCount && entry.editCount > 0) {
      lines.push(`**Edits:** ${entry.editCount} wiki update(s) proposed`);
    }
    lines.push(
      `**Tool calls:** ${entry.toolCalls} | **Cost:** $${(entry.costCents / 100).toFixed(2)}`,
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

function formatDayHm(d: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = days[d.getUTCDay()];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day} ${hh}:${mm}`;
}

export function parseExecutionHistory(content: string, limit?: number): ExecutionHistoryEntry[] {
  const idx = content.indexOf(EXECUTION_HISTORY_HEADER);
  if (idx === -1) return [];
  // Take everything after header until next `## ` (a sibling section) or EOF.
  const after = content.slice(idx + EXECUTION_HISTORY_HEADER.length);
  const nextSiblingMatch = after.match(/\n## (?!#)/);
  const sectionBody = nextSiblingMatch
    ? after.slice(0, nextSiblingMatch.index ?? after.length)
    : after;

  const blocks = sectionBody.split(/\n---\s*\n/).filter((b) => b.trim().length > 0);
  const entries: ExecutionHistoryEntry[] = [];

  for (const block of blocks) {
    const headerLine = block.split("\n").find((l) => /^### \d{4}-\d{2}-\d{2}/.test(l));
    if (!headerLine) continue;
    const headerMatch = headerLine.match(
      /^### (\d{4}-\d{2}-\d{2}) \(([^)]+)\) — (Completed|Compressed|Failed) \[importance ([\d.]+)\]/,
    );
    if (!headerMatch) continue;

    const [, dateStr, , statusWord, scoreStr] = headerMatch;
    const status =
      statusWord === "Completed"
        ? "completed"
        : statusWord === "Compressed"
          ? "compressed"
          : "failed";

    const lines = block.split("\n");
    const headerIdx = lines.indexOf(headerLine);
    const bodyLines = lines.slice(headerIdx + 1);

    let trustBannerNote: string | null = null;
    let summary = "";
    let proposedSlugs: string[] = [];
    let reportSubPageSlug: string | null = null;
    let editCount = 0;
    let toolCalls: number | null = null;
    let costCents: number | null = null;
    let errorMessage: string | null = null;

    let summaryStarted = false;
    let summaryDone = false;
    const summaryParts: string[] = [];

    for (const raw of bodyLines) {
      const line = raw.trimEnd();
      if (!summaryStarted && line.trim() === "") continue;
      if (line.startsWith("> ") && !summaryStarted) {
        trustBannerNote = line.slice(2).trim();
        continue;
      }
      if (line.startsWith("**Proposed:**")) {
        const slugs = Array.from(line.matchAll(/\[\[([^\]]+)\]\]/g)).map((m) => m[1]);
        proposedSlugs = slugs;
        summaryDone = true;
        continue;
      }
      if (line.startsWith("**Report:**")) {
        const m = line.match(/\[\[([^\]]+)\]\]/);
        reportSubPageSlug = m ? m[1] : null;
        summaryDone = true;
        continue;
      }
      if (line.startsWith("**Edits:**")) {
        const m = line.match(/(\d+)/);
        editCount = m ? Number(m[1]) : 0;
        summaryDone = true;
        continue;
      }
      if (line.startsWith("**Tool calls:**")) {
        const tcMatch = line.match(/Tool calls:\*\*\s+(\d+)/);
        toolCalls = tcMatch ? Number(tcMatch[1]) : null;
        const costMatch = line.match(/Cost:\*\*\s+\$([\d.]+)/);
        costCents = costMatch ? Math.round(Number(costMatch[1]) * 100) : null;
        summaryDone = true;
        continue;
      }
      if (line.startsWith("**Error:**")) {
        errorMessage = line.replace(/^\*\*Error:\*\*\s*/, "").trim();
        summaryDone = true;
        continue;
      }
      if (!summaryDone) {
        if (line.trim() === "" && summaryStarted) {
          summaryDone = true;
          continue;
        }
        summaryStarted = true;
        summaryParts.push(line);
      }
    }
    summary = summaryParts.join("\n").trim();

    entries.push({
      runDate: new Date(`${dateStr}T00:00:00.000Z`),
      status,
      importanceScore: Number(scoreStr),
      summary,
      proposedSlugs,
      reportSubPageSlug,
      editCount,
      toolCalls,
      costCents,
      errorMessage,
      trustBannerNote,
    });

    if (limit && entries.length >= limit) break;
  }

  return entries;
}

// ── Event emission ────────────────────────────────────────────────────────

async function emitJobCompletedEvent(args: {
  operatorId: string;
  sourceJobSlug: string;
  importanceScore: number;
  status: "completed" | "compressed";
  triggerChain: TriggerChain;
}): Promise<void> {
  try {
    await emitEvent(
      {
        type: "system_job.completed",
        operatorId: args.operatorId,
        payload: {
          sourceJobSlug: args.sourceJobSlug,
          importanceScore: args.importanceScore,
          status: args.status,
        },
      },
      args.triggerChain,
    );
  } catch (err) {
    console.warn(`[event-emit] system_job.completed failed:`, err);
  }
}

// ── Seed context builder ──────────────────────────────────────────────────

function buildSeedContext(args: {
  jobTitle: string;
  jobInstructions: string;
  anchorPages: Array<{ slug: string; title: string; content: string }>;
  domainContext: string;
  companyName: string;
  priorRuns: ExecutionHistoryEntry[];
  activeSituations: Array<{ title: string; status: string; situationType: string }>;
  activeInitiatives: Array<{ title: string; status: string; proposalType: string }>;
  triggerContext: TriggerContext;
}): string {
  const parts: string[] = [];
  parts.push(`SYSTEM JOB: ${args.jobTitle}`);
  parts.push(`COMPANY: ${args.companyName}`);

  if (args.triggerContext.triggerType === "event") {
    parts.push(
      `\nTRIGGER: Event "${args.triggerContext.eventType ?? "unknown"}" with payload ${JSON.stringify(
        args.triggerContext.payload ?? {},
      ).slice(0, 800)}`,
    );
  } else {
    parts.push(`\nTRIGGER: Cron schedule`);
  }

  parts.push(`\nJOB INSTRUCTIONS (from wiki page):\n${args.jobInstructions}`);

  if (args.domainContext) parts.push(args.domainContext);

  for (const ap of args.anchorPages) {
    parts.push(`\nANCHOR PAGE [[${ap.slug}]] — ${ap.title}\n${ap.content.slice(0, 1500)}`);
  }

  if (args.priorRuns.length > 0) {
    parts.push(`\nPRIOR RUNS (most recent first):`);
    for (const r of args.priorRuns) {
      parts.push(
        `  ${r.runDate.toISOString().slice(0, 10)} [${r.status}] importance=${r.importanceScore.toFixed(2)} — ${r.summary.slice(0, 160)}`,
      );
    }
  }

  if (args.activeSituations.length > 0) {
    parts.push(`\nACTIVE SITUATIONS (do NOT duplicate):`);
    for (const s of args.activeSituations) {
      parts.push(`  [${s.status}] ${s.situationType}: ${s.title.slice(0, 100)}`);
    }
  }

  if (args.activeInitiatives.length > 0) {
    parts.push(`\nACTIVE INITIATIVES (do NOT duplicate):`);
    for (const i of args.activeInitiatives) {
      parts.push(`  [${i.status}] [${i.proposalType}] ${i.title.slice(0, 120)}`);
    }
  }

  return parts.join("\n");
}

// ── System prompt builders (one per kind) ─────────────────────────────────

function buildSystemPrompt(args: {
  kind: DeliverableKind;
  jobTitle: string;
  jobSlug: string;
  companyName: string;
  softBudget: number;
  hardBudget: number;
}): string {
  const preamble = sharedPreamble(args.companyName, args.jobTitle, args.jobSlug);
  const budget = `Use tools aggressively to gather evidence. Soft budget: ${args.softBudget} tool calls, hard: ${args.hardBudget}.`;
  const closing = `Respond with ONLY valid JSON (no markdown fences).`;

  if (args.kind === "report") {
    return [
      preamble,
      ``,
      `DELIVERABLE: A one-run REPORT.`,
      `After investigation, produce JSON with:`,
      `- title: report title`,
      `- body_markdown: full report as markdown (use ## headers for sections)`,
      `- key_findings: 3–7 bullet-point findings`,
      `- recommendations: 2–5 actionable recommendations`,
      `- importance_score: 0.0–1.0`,
      `- summary: one-line synopsis for execution history`,
      `- next_run_note: optional — anything the next cycle should remember`,
      ``,
      `This is a REPORT not a list of proposed changes. Do not propose situations or edits.`,
      `Focus on a coherent narrative of what you found and what it means.`,
      ``,
      budget,
      ``,
      closing,
    ].join("\n");
  }

  if (args.kind === "proposals") {
    return [
      preamble,
      ``,
      `DELIVERABLE: PROPOSALS — situations and initiatives for the operator to act on.`,
      `After investigation, produce JSON with:`,
      `- summary: 2–3 sentence executive summary`,
      `- importance_score: 0.0–1.0`,
      `- analysisNarrative: full analysis with evidence`,
      `- proposed_situations[]: things that need decisions NOW (each becomes a real situation)`,
      `- proposed_initiatives[]: proposals for the operator to approve or reject`,
      `- findings[]: informational observations (trends, metrics, anomalies)`,
      ``,
      `Initiative proposalType options: project_creation, policy_change, system_job_creation,`,
      `strategy_revision, wiki_update, resource_recommendation, general.`,
      `The proposal field MUST contain the actual work product, not just a description.`,
      `Do NOT duplicate active situations/initiatives listed in seed context.`,
      ``,
      budget,
      ``,
      closing,
    ].join("\n");
  }

  if (args.kind === "edits") {
    return [
      preamble,
      ``,
      `DELIVERABLE: EDITS — proposed updates to existing wiki pages.`,
      `After investigation, produce JSON with:`,
      `- summary: 2–3 sentence executive summary`,
      `- importance_score: 0.0–1.0`,
      `- wiki_edits[]: list of edits to apply, each with:`,
      `  - target_slug: the wiki page to edit (use slug of an existing page)`,
      `  - change_type: "append" | "replace_section" | "update_property"`,
      `  - section_name: required for replace_section`,
      `  - property_key: required for update_property`,
      `  - new_content: the content to apply (for update_property, JSON-encode if not a string)`,
      `  - rationale: why this edit improves the page`,
      ``,
      `Self-amendments are edits targeting this job's own slug — same shape, no special handling needed.`,
      `Edits will be queued as initiatives for approval (or auto-applied at trust=act).`,
      ``,
      budget,
      ``,
      closing,
    ].join("\n");
  }

  // mixed
  return [
    preamble,
    ``,
    `DELIVERABLE: MIXED — produce any combination of report, proposals, edits.`,
    `After investigation, produce JSON with:`,
    `- summary, importance_score (both required)`,
    `- analysisNarrative (optional)`,
    `- proposed_situations[], proposed_initiatives[], findings[] (optional)`,
    `- wiki_edits[] (optional)`,
    `- report { title, body_markdown, key_findings[], recommendations[] } (optional)`,
    ``,
    `Pick whichever shapes match what you actually found. Empty arrays are fine.`,
    `Do NOT duplicate active situations/initiatives listed in seed context.`,
    ``,
    budget,
    ``,
    closing,
  ].join("\n");
}

function sharedPreamble(companyName: string, jobTitle: string, jobSlug: string): string {
  return [
    `You are an autonomous agent for ${companyName}. Your role: ${jobTitle}.`,
    ``,
    `Your detailed instructions are in wiki page [[${jobSlug}]]. The full content is also`,
    `provided in the seed context — start by reading it carefully. Use read_wiki_page,`,
    `search_wiki, search_entities, lookup_entity, search_documents, and connector tools to`,
    `gather evidence. Use web_search if external intelligence is needed.`,
  ].join("\n");
}
