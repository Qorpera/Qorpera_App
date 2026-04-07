import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { ensureInternalCapabilities } from "@/lib/internal-capabilities";
import { CronExpressionParser } from "cron-parser";

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
    "project_creation", "policy_change", "autonomy_graduation",
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
  aiEntityId: string;
  title: string;
  description: string;
  cronExpression: string;
  scope: string;
  scopeEntityId: string | null;
  importanceThreshold: number;
  autoDispatchFindings: boolean;
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

    // Load active situations + initiatives for dedup
    const activeSituations = await prisma.situation.findMany({
      where: { operatorId: job.operatorId, status: { notIn: ["resolved", "closed", "dismissed"] } },
      select: { triggerSummary: true, status: true, situationType: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const activeInitiatives = await prisma.initiative.findMany({
      where: { operatorId: job.operatorId, status: { notIn: ["rejected", "failed", "completed"] } },
      select: { rationale: true, status: true, proposalType: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Build seed context
    const seedParts: string[] = [];
    seedParts.push(`SYSTEM JOB: ${job.title}`);
    seedParts.push(`DESCRIPTION: ${job.description ?? "No description"}`);
    seedParts.push(`COMPANY: ${operator?.companyName ?? "Unknown"}`);
    seedParts.push(`SCOPE: ${job.scope}${job.scopeEntityId ? ` (entity: ${job.scopeEntityId})` : ""}`);

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

      let triggerEntityId: string | null = null;
      if (proposed.triggerEntityName) {
        const entity = await prisma.entity.findFirst({
          where: { operatorId: job.operatorId, displayName: { contains: proposed.triggerEntityName, mode: "insensitive" }, status: "active" },
          select: { id: true },
        });
        triggerEntityId = entity?.id ?? null;
      }

      await prisma.situation.create({
        data: {
          operatorId: job.operatorId,
          situationTypeId,
          triggerEntityId,
          triggerSummary: proposed.description,
          status: "detected",
          severity: { high: 0.9, medium: 0.6, low: 0.3 }[proposed.urgency] ?? 0.5,
          confidence: 0.7,
          source: "system_job",
        },
      });
      situationsCreated++;
    } catch (err) {
      console.error(`[system-job] Failed to create situation:`, err);
    }
  }

  // Dispatch proposed initiatives
  for (const proposed of output.proposedInitiatives) {
    try {
      await prisma.initiative.create({
        data: {
          operatorId: job.operatorId,
          aiEntityId: job.aiEntityId,
          proposalType: proposed.proposalType,
          triggerSummary: proposed.triggerSummary,
          evidence: JSON.stringify([{ source: "system_job", claim: proposed.triggerSummary }]),
          proposal: proposed.proposal as Prisma.InputJsonValue,
          status: "proposed",
          rationale: proposed.rationale,
          impactAssessment: proposed.impactAssessment,
          ...(proposed.proposalType === "project_creation" ? {
            proposedProjectConfig: proposed.proposal as Prisma.InputJsonValue,
          } : {}),
        },
      });

      sendNotificationToAdmins({
        operatorId: job.operatorId,
        type: "initiative_proposed",
        title: `New initiative: ${proposed.triggerSummary.slice(0, 80)}`,
        body: proposed.rationale.slice(0, 200),
        sourceType: "initiative",
        sourceId: job.id,
      }).catch(() => {});

      initiativesCreated++;
    } catch (err) {
      console.error(`[system-job] Failed to create initiative:`, err);
    }
  }

  return { situationsCreated, initiativesCreated };
}

// ── System Prompt ──────────────────────────────────────────────────────────

function buildAgenticSystemJobPrompt(job: SystemJobRow, companyName: string): string {
  return `You are an intelligence analyst for ${companyName}. Your role: ${job.title}.

${job.description ?? ""}

You have access to organizational tools to investigate. Start by reading relevant wiki pages to understand the current state, then search for external information if needed, then produce your assessment.

INVESTIGATION PROCESS:
1. Use search_wiki and read_wiki_page to understand the company's current state relevant to your role
2. Use web_search if you need external intelligence (competitors, market, legal, technology)
3. Use search_entities, lookup_entity, get_activity_timeline for operational data
4. Use search_communications, search_documents for detailed evidence
5. Compare what you find against what SHOULD be happening (per wiki strategy/operational pages)
6. Identify gaps — things the wiki says should happen that aren't happening

YOUR OUTPUT:
After investigation, produce a JSON assessment with:
- summary: 2-3 sentence executive summary
- importanceScore: 0.0-1.0 — be honest. If nothing changed, score low.
- analysisNarrative: full analysis with evidence
- proposedSituations: things that need decisions NOW (each becomes a real situation)
- proposedInitiatives: proposed actions for the operator to approve or reject. These are the actual deliverables — not just "we should do X" but "here is X, should we implement it?"
  Each initiative has a proposalType:
  - "project_creation": propose creating a project with specific config (title, description, deliverables, team)
  - "policy_change": propose adding, modifying, or removing a governance policy (include the policy text)
  - "autonomy_graduation": propose changing a situation type's autonomy level (include which type and to what level)
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
