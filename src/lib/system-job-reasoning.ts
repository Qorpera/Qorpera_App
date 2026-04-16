import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { ensureInternalCapabilities } from "@/lib/internal-capabilities";
import { CronExpressionParser } from "cron-parser";
import { createSituationWikiPage, generateSituationSlug, formatDate } from "@/lib/situation-wiki-helpers";

// ── Zod Output Schema ──────────────────────────────────────────────────────

const SystemJobFindingSchema = z.object({
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
    "project_creation", "policy_change",
    "system_job_creation", "strategy_revision", "wiki_update",
    "resource_recommendation", "general",
  ]),
  triggerSummary: z.string().min(10),
  rationale: z.string().min(20),
  impactAssessment: z.string().min(10),
  proposal: z.record(z.any()),
});

const SelfAmendmentSchema = z.object({
  type: z.enum(["add_data_source", "change_frequency", "refine_focus", "expand_scope", "deactivate"]),
  description: z.string(),
  rationale: z.string(),
});

const PriorRecommendationOutcomeSchema = z.object({
  recommendation: z.string(),
  whatHappened: z.string(),
  assessment: z.enum(["effective", "ineffective", "too_early", "not_implemented"]),
});

const SystemJobOutputSchema = z.object({
  summary: z.string().min(10),
  importanceScore: z.number().min(0).max(1),
  analysisNarrative: z.string().min(20),
  proposedSituations: z.array(ProposedSituationSchema),
  proposedInitiatives: z.array(ProposedInitiativeSchema),
  findings: z.array(SystemJobFindingSchema),
  selfAmendments: z.array(SelfAmendmentSchema),
  cycleComparison: z.object({
    keyChanges: z.array(z.string()),
    priorRecommendationOutcomes: z.array(PriorRecommendationOutcomeSchema),
  }).optional(),
});

type SystemJobOutput = z.infer<typeof SystemJobOutputSchema>;

// ── Cron Entry Point ───────────────────────────────────────────────────────

export async function processSystemJobs(): Promise<{
  processed: number;
  triggered: number;
  compressed: number;
  errors: number;
}> {
  const result = { processed: 0, triggered: 0, compressed: 0, errors: 0 };
  const now = new Date();

  const jobs = await prisma.systemJob.findMany({
    where: {
      status: "active",
      nextTriggerAt: { lte: now },
    },
    select: {
      id: true, operatorId: true, title: true, description: true,
      cronExpression: true, scope: true,
      wikiPageSlug: true, ownerPageSlug: true, domainPageSlug: true,
      importanceThreshold: true, autoDispatchFindings: true,
      executionPlanTemplate: true, autoApproveSteps: true,
      aiEntityId: true, scopeEntityId: true,
    },
  });

  for (const job of jobs) {
    result.processed++;
    try {
      const runResult = await executeSystemJob(job);
      if (runResult === "compressed") {
        result.compressed++;
      } else {
        result.triggered++;
      }

      // Compute next trigger
      try {
        const interval = CronExpressionParser.parse(job.cronExpression, { currentDate: now });
        const next = interval.next().toDate();
        await prisma.systemJob.update({
          where: { id: job.id },
          data: { lastTriggeredAt: now, nextTriggerAt: next },
        });
      } catch {
        await prisma.systemJob.update({
          where: { id: job.id },
          data: { status: "paused", nextTriggerAt: null, lastTriggeredAt: now },
        });
        await sendNotificationToAdmins({
          operatorId: job.operatorId,
          type: "system_alert",
          title: `System Job paused: ${job.title}`,
          body: `Could not compute next trigger for cron expression "${job.cronExpression}". Job has been paused.`,
          sourceType: "system_job",
          sourceId: job.id,
        });
      }
    } catch (err) {
      result.errors++;
      console.error(`[system-job] Error executing job ${job.id}:`, err);
    }
  }

  return result;
}

// ── Main Execution ─────────────────────────────────────────────────────────

type SystemJobRow = {
  id: string;
  operatorId: string;
  title: string;
  description: string;
  cronExpression: string;
  scope: string;
  wikiPageSlug: string | null;
  ownerPageSlug: string | null;
  domainPageSlug: string | null;
  importanceThreshold: number;
  autoDispatchFindings: boolean;
  executionPlanTemplate: string | null;
  autoApproveSteps: boolean;
  // Deprecated entity fields — kept for compat
  aiEntityId: string | null;
  scopeEntityId: string | null;
};

async function executeSystemJob(
  job: SystemJobRow,
): Promise<"completed" | "compressed"> {
  const startTime = Date.now();

  const runCount = await prisma.systemJobRun.count({ where: { systemJobId: job.id } });
  const run = await prisma.systemJobRun.create({
    data: {
      systemJobId: job.id,
      operatorId: job.operatorId,
      cycleNumber: runCount + 1,
      status: "running",
    },
  });

  try {
    // Legacy execution plan branch removed — skip if template present
    if (job.executionPlanTemplate) {
      console.warn(`[system-job] Skipping legacy execution plan template for job ${job.id}`);
      await prisma.systemJobRun.update({
        where: { id: run.id },
        data: { status: "compressed", summary: "Legacy execution plan template — skipped", durationMs: 0 },
      });
      return "compressed";
    }

    await ensureInternalCapabilities(job.operatorId);

    const operator = await prisma.operator.findUnique({
      where: { id: job.operatorId },
      select: { companyName: true },
    });

    // Load prior cycle history for seed context
    const priorRuns = await prisma.systemJobRun.findMany({
      where: { systemJobId: job.id, status: { in: ["completed", "compressed"] } },
      orderBy: { cycleNumber: "desc" },
      take: 3,
      select: {
        cycleNumber: true,
        summary: true,
        findings: true,
        cycleComparison: true,
        importanceScore: true,
        createdAt: true,
      },
    });

    // Load active situations from wiki pages for dedup
    const activeSituationPages = await prisma.knowledgePage.findMany({
      where: {
        operatorId: job.operatorId,
        pageType: "situation_instance",
        scope: "operator",
        NOT: {
          properties: { path: ["status"], string_contains: "resolved" },
        },
      },
      select: { title: true, properties: true },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    const activeSituations = activeSituationPages
      .filter(p => {
        const props = (p.properties ?? {}) as Record<string, unknown>;
        const status = props.status as string | undefined;
        return !status || !["resolved", "closed", "dismissed"].includes(status);
      })
      .map(p => {
        const props = (p.properties ?? {}) as Record<string, unknown>;
        return {
          triggerSummary: p.title,
          status: (props.status as string) ?? "detected",
          situationType: { name: (props.situation_type as string) ?? "unknown" },
        };
      });

    const activeInitiativePages = await prisma.knowledgePage.findMany({
      where: { operatorId: job.operatorId, pageType: "initiative", scope: "operator" },
      select: { title: true, properties: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const activeInitiatives = activeInitiativePages
      .filter(p => {
        const props = (p.properties ?? {}) as Record<string, unknown>;
        return !["rejected", "failed", "completed"].includes(props.status as string);
      })
      .map(p => {
        const props = (p.properties ?? {}) as Record<string, unknown>;
        return { rationale: p.title, status: (props.status as string) ?? "proposed", proposalType: (props.proposal_type as string) ?? "general" };
      });

    // Load job's wiki page for detailed instructions
    let jobInstructions = job.description;
    if (job.wikiPageSlug) {
      const jobPage = await prisma.knowledgePage.findFirst({
        where: { operatorId: job.operatorId, slug: job.wikiPageSlug, scope: "operator" },
        select: { content: true },
      });
      if (jobPage) {
        jobInstructions = jobPage.content;
      }
    }

    // Load domain context from wiki hub
    let domainContext = "";
    if (job.domainPageSlug) {
      const domainPage = await prisma.knowledgePage.findFirst({
        where: { operatorId: job.operatorId, slug: job.domainPageSlug, scope: "operator" },
        select: { title: true, content: true },
      });
      if (domainPage) {
        domainContext = `\nDOMAIN: ${domainPage.title}\n${domainPage.content.slice(0, 1500)}`;
      }
    }

    // Build seed context
    const seedParts: string[] = [];
    seedParts.push(`SYSTEM JOB: ${job.title}`);
    seedParts.push(`\nJOB INSTRUCTIONS:\n${jobInstructions}`);
    if (domainContext) seedParts.push(domainContext);
    seedParts.push(`COMPANY: ${operator?.companyName ?? "Unknown"}`);
    seedParts.push(`SCOPE: ${job.scope}`);

    if (priorRuns.length > 0) {
      seedParts.push("\nPRIOR CYCLES:");
      for (const r of priorRuns) {
        seedParts.push(`  Cycle ${r.cycleNumber} (${r.createdAt.toISOString().split("T")[0]}): ${r.summary ?? "No summary"} (importance: ${r.importanceScore?.toFixed(2) ?? "N/A"})`);
      }
    }

    if (activeSituations.length > 0) {
      seedParts.push("\nACTIVE SITUATIONS (do NOT duplicate):");
      for (const s of activeSituations) {
        seedParts.push(`  [${s.status}] ${s.situationType.name}: ${s.triggerSummary?.slice(0, 100) ?? "No summary"}`);
      }
    }

    if (activeInitiatives.length > 0) {
      seedParts.push("\nACTIVE INITIATIVES (do NOT duplicate):");
      for (const i of activeInitiatives) {
        seedParts.push(`  [${i.status}] [${i.proposalType}] ${i.rationale.slice(0, 120)}`);
      }
    }

    const seedContext = seedParts.join("\n");

    // Build system prompt
    const systemPrompt = buildAgenticSystemJobPrompt(job, operator?.companyName ?? "the company");

    // Assemble tools: reasoning tools + connector read tools
    const { REASONING_TOOLS, executeReasoningTool } = await import("@/lib/reasoning-tools");
    const { getConnectorReadTools, executeConnectorReadTool } = await import("@/lib/connector-read-tools");
    const { tools: connectorTools } = await getConnectorReadTools(job.operatorId);
    const allTools = [...REASONING_TOOLS, ...connectorTools];

    const dispatchTool = async (toolName: string, args: Record<string, unknown>): Promise<string> => {
      try {
        return await executeReasoningTool(job.operatorId, toolName, args);
      } catch {
        return await executeConnectorReadTool(job.operatorId, toolName, args);
      }
    };

    // Run agentic loop
    const { runAgenticLoop } = await import("@/lib/agentic-loop");
    const agenticResult = await runAgenticLoop({
      operatorId: job.operatorId,
      contextId: job.id,
      contextType: "system_job",
      cycleNumber: runCount + 1,
      systemPrompt,
      seedContext,
      tools: allTools,
      dispatchTool,
      outputSchema: SystemJobOutputSchema,
      softBudget: 15,
      hardBudget: 25,
      modelRoute: "systemJobReasoning",
    });

    const output = agenticResult.output;

    // Importance gate
    if (
      output.importanceScore < job.importanceThreshold &&
      output.proposedSituations.length === 0 &&
      output.proposedInitiatives.length === 0
    ) {
      await prisma.systemJobRun.update({
        where: { id: run.id },
        data: {
          status: "compressed",
          summary: output.summary,
          importanceScore: output.importanceScore,
          findings: (output.findings ?? []) as unknown as Prisma.InputJsonValue,
          selfAmendments: (output.selfAmendments ?? []) as unknown as Prisma.InputJsonValue,
          rawReasoning: JSON.stringify({ toolCalls: agenticResult.toolCallCount, cost: agenticResult.apiCostCents }),
          durationMs: Date.now() - startTime,
        },
      });
      return "compressed";
    }

    // Dispatch output
    const { situationsCreated, initiativesCreated } = await dispatchOutput(output, job);

    await prisma.systemJobRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        summary: output.summary,
        analysisNarrative: output.analysisNarrative,
        importanceScore: output.importanceScore,
        findings: (output.findings ?? []) as unknown as Prisma.InputJsonValue,
        selfAmendments: (output.selfAmendments ?? []) as unknown as Prisma.InputJsonValue,
        cycleComparison: (output.cycleComparison ?? null) as unknown as Prisma.InputJsonValue,
        proposedSituationCount: situationsCreated,
        proposedInitiativeCount: initiativesCreated,
        rawReasoning: JSON.stringify({ toolCalls: agenticResult.toolCallCount, cost: agenticResult.apiCostCents }),
        durationMs: Date.now() - startTime,
      },
    });

    sendNotificationToAdmins({
      operatorId: job.operatorId,
      type: "system_alert",
      title: `System Job completed: ${job.title}`,
      body: output.summary.slice(0, 200),
      sourceType: "system_job",
      sourceId: job.id,
    }).catch(() => {});

    return "completed";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[system-job] Execution failed for job ${job.id}:`, err);

    await prisma.systemJobRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        errorMessage: message.slice(0, 2000),
        durationMs: Date.now() - startTime,
      },
    });

    throw err;
  }
}

// ── Output Dispatch ────────────────────────────────────────────────────────

async function dispatchOutput(
  output: SystemJobOutput,
  job: SystemJobRow,
): Promise<{ situationsCreated: number; initiativesCreated: number }> {
  let situationsCreated = 0;
  let initiativesCreated = 0;

  // Dispatch proposed situations
  for (const proposed of output.proposedSituations) {
    try {
      let situationTypeId: string | null = null;
      if (proposed.suggestedSituationTypeName) {
        const st = await prisma.situationType.findFirst({
          where: {
            operatorId: job.operatorId,
            name: { contains: proposed.suggestedSituationTypeName, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (!st) {
          console.warn(`[system-job] Could not resolve situation type: ${proposed.suggestedSituationTypeName}. Skipping.`);
          continue;
        }
        situationTypeId = st.id;
      }
      if (!situationTypeId) continue;

      let triggerPageSlug: string | null = null;
      if (proposed.triggerEntityName) {
        const page = await prisma.knowledgePage.findFirst({
          where: {
            operatorId: job.operatorId,
            scope: "operator",
            title: { contains: proposed.triggerEntityName, mode: "insensitive" },
            status: { in: ["draft", "verified"] },
          },
          select: { slug: true },
        });
        triggerPageSlug = page?.slug ?? null;
      }

      // Look up situation type slug for wiki page
      const stRow = await prisma.situationType.findUnique({
        where: { id: situationTypeId },
        select: { name: true, slug: true },
      });
      const situationId = createId();
      const severity = { high: 0.9, medium: 0.6, low: 0.3 }[proposed.urgency] ?? 0.5;
      const subjectSlug = triggerPageSlug ?? "system-job";
      const wikiPageSlug = await generateSituationSlug(job.operatorId, stRow?.slug ?? "situation", subjectSlug);

      await createSituationWikiPage({
        operatorId: job.operatorId,
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
          trigger_ref: `system-job:${job.id}`,
          domain: job.domainPageSlug ?? undefined,
        },
        triggerContent: `System Job "${job.title}" proposed this situation:\n\n${proposed.description}`,
        contextContent: proposed.evidence.map(e => `- ${e}`).join("\n"),
        timelineEntries: [`${formatDate(new Date().toISOString())} — Detected by system job: ${job.title}`],
      });

      // Dispatch reasoning
      const { enqueueWorkerJob } = await import("@/lib/worker-dispatch");
      enqueueWorkerJob("reason_situation", job.operatorId, { situationId, wikiPageSlug }).catch(err =>
        console.error("[system-job] Failed to enqueue reasoning:", err),
      );
      situationsCreated++;
    } catch (err) {
      console.error(`[system-job] Failed to create situation:`, err);
    }
  }

  // Dispatch proposed initiatives as wiki pages
  for (const proposed of output.proposedInitiatives) {
    try {
      const slug = `initiative-${Date.now()}-${proposed.triggerSummary.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;

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
        `${new Date().toISOString().slice(0, 16)} — Proposed by system job: ${job.title}`,
      ].join("\n");

      const crossRefs: string[] = [];
      if (job.domainPageSlug) crossRefs.push(job.domainPageSlug);
      if (job.ownerPageSlug) crossRefs.push(job.ownerPageSlug);

      await prisma.knowledgePage.create({
        data: {
          operatorId: job.operatorId,
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
            source_job_id: job.id,
            domain: job.domainPageSlug,
            owner: job.ownerPageSlug,
            rationale: proposed.rationale,
            impact_assessment: proposed.impactAssessment,
            evidence: [{ source: "system_job", claim: proposed.triggerSummary }],
            ...(proposed.proposalType === "project_creation" ? { project_config: proposed.proposal } : {}),
          },
          synthesisPath: "detection",
          synthesizedByModel: "system_job_reasoning",
          confidence: 0.5,
          lastSynthesizedAt: new Date(),
        },
      });

      // Enqueue reasoning instead of notifying directly
      const { enqueueWorkerJob } = await import("@/lib/worker-dispatch");
      await enqueueWorkerJob("reason_initiative", job.operatorId, {
        operatorId: job.operatorId,
        pageSlug: slug,
      }).catch(err => {
        console.error(`[system-job] Failed to enqueue reason_initiative for ${slug}:`, err);
      });

      initiativesCreated++;
    } catch (err) {
      console.error(`[system-job] Failed to create initiative:`, err);
    }
  }

  return { situationsCreated, initiativesCreated };
}

// ── System Prompt ──────────────────────────────────────────────────────────

function buildAgenticSystemJobPrompt(job: SystemJobRow, companyName: string): string {
  const wikiHint = job.wikiPageSlug
    ? `\nYour detailed instructions are in wiki page [[${job.wikiPageSlug}]]. Read it first.`
    : "";
  const domainHint = job.domainPageSlug
    ? `\nYour domain context is in wiki page [[${job.domainPageSlug}]]. Read it to understand the area you monitor.`
    : "";

  return `You are an autonomous work agent for ${companyName}. Your role: ${job.title}.
${wikiHint}${domainHint}

You have access to organizational tools to investigate. Start by reading your job's wiki page for detailed instructions, then explore the domain wiki pages, then search for external information if needed.

INVESTIGATION PROCESS:
1. Use read_wiki_page to read your job's wiki page and domain hub page for instructions and context
2. Use search_wiki to find related wiki pages about the area you monitor
3. Use web_search if you need external intelligence (competitors, market, legal, technology)
4. Use search_entities, lookup_entity, get_activity_timeline for operational data
5. Use search_communications, search_documents for detailed evidence
6. Compare what you find against what SHOULD be happening (per wiki strategy/operational pages)
7. Identify gaps — things the wiki says should happen that aren't happening

YOUR OUTPUT:
After investigation, produce a JSON assessment with:
- summary: 2-3 sentence executive summary
- importanceScore: 0.0-1.0 — be honest. If nothing changed, score low.
- analysisNarrative: full analysis with evidence
- proposedSituations: things that need decisions NOW (each becomes a real situation)
  When naming triggerEntityName, use the wiki page title of the relevant person/domain/entity.
- proposedInitiatives: proposed actions for the operator to approve or reject. These are the actual deliverables — not just "we should do X" but "here is X, should we implement it?"
  Each initiative has a proposalType:
  - "project_creation": propose creating a project with specific config (title, description, deliverables, team)
  - "policy_change": propose adding, modifying, or removing a governance policy (include the policy text)
  - "system_job_creation": propose creating a new system job (include title, description, cron schedule)
  - "strategy_revision": propose updating a strategic wiki page (include the proposed content)
  - "wiki_update": propose updating any wiki page (include slug and proposed content)
  - "resource_recommendation": propose a resource change (hiring, firing, reallocation — include full analysis)
  - "general": any other proposal (include full description of what to do)
  The proposal field MUST contain the actual work product, not just a description of what to do.
- findings: informational observations (trends, metrics, anomalies)
- selfAmendments: how should this job evolve?
- cycleComparison: what changed since last cycle?

RULES:
- Do NOT propose situations/initiatives that duplicate active ones (listed in seed context)
- Score importanceScore below ${job.importanceThreshold} if nothing significant — this is fine, it builds trust
- For proposedSituations: reference existing situation type names when possible
- For proposedInitiatives: the proposal field must contain ACTIONABLE content the operator can approve directly

Respond with ONLY valid JSON (no markdown fences).`;
}

