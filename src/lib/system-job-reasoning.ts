import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { callLLM, getModel, getThinkingBudget } from "@/lib/ai-provider";
import { createExecutionPlan, type StepDefinition } from "@/lib/execution-engine";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { ensureInternalCapabilities } from "@/lib/internal-capabilities";
import { extractJSON } from "@/lib/json-helpers";
import { embedChunks } from "@/lib/rag/embedder";
import { retrieveRelevantChunks } from "@/lib/rag/retriever";
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
  rationale: z.string().min(20),
  impactAssessment: z.string().min(10),
  suggestedGoalId: z.string().optional(),
  steps: z.array(z.object({
    title: z.string(),
    description: z.string(),
    executionMode: z.enum(["action", "generate", "human_task"]),
    actionCapabilityName: z.string().optional(),
    params: z.record(z.any()).optional(),
  })),
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
  description: string | null;
  contextProfile: string;
  reasoningProfile: string;
  outputProfile: string | null;
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

  // Create run record
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

    // Load context
    const context = await assembleSystemJobContext(job, job.operatorId);

    // Load operator company name
    const operator = await prisma.operator.findUnique({
      where: { id: job.operatorId },
      select: { companyName: true },
    });

    // Build prompts
    const systemPrompt = buildSystemJobSystemPrompt(job, operator?.companyName ?? "the company");
    const userPrompt = buildSystemJobUserPrompt(context);

    // Call LLM with retry
    const llmResult = await callAndValidateSystemJob(systemPrompt, userPrompt);
    if (!llmResult) {
      await prisma.systemJobRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          errorMessage: "LLM output validation failed after 2 attempts",
          durationMs: Date.now() - startTime,
        },
      });
      return "completed";
    }

    const { output, rawText } = llmResult;

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
          rawReasoning: rawText,
          durationMs: Date.now() - startTime,
        },
      });

      sendNotificationToAdmins({
        operatorId: job.operatorId,
        type: "system_alert",
        title: `System Job ran: ${job.title}`,
        body: `No actionable findings. Summary: ${output.summary.slice(0, 200)}`,
        sourceType: "system_job",
        sourceId: job.id,
      }).catch(() => {});

      return "compressed";
    }

    // Dispatch output
    const { situationsCreated, initiativesCreated } = await dispatchOutput(
      output,
      job,
      context.capabilities,
    );

    // Update run record
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
        rawReasoning: rawText,
        durationMs: Date.now() - startTime,
      },
    });

    // Notify admins
    sendNotificationToAdmins({
      operatorId: job.operatorId,
      type: "system_alert",
      title: `System Job completed: ${job.title}`,
      body: `${output.proposedSituations.length} situations, ${output.proposedInitiatives.length} initiatives proposed. ${output.summary.slice(0, 200)}`,
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

    throw err; // Re-throw so processSystemJobs counts the error
  }
}

// ── LLM Call + Validation ──────────────────────────────────────────────────

async function callAndValidateSystemJob(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ output: SystemJobOutput; rawText: string } | null> {
  let rawResponse = "";
  let parseError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const userContent = attempt === 0
      ? userPrompt
      : `${userPrompt}\n\nPREVIOUS ATTEMPT FAILED VALIDATION: ${parseError}\nPlease fix the JSON output to match the required schema exactly.`;

    try {
      const response = await callLLM({
        instructions: systemPrompt,
        messages: [{ role: "user", content: userContent }],
        aiFunction: "reasoning",
        temperature: 0.3,
        maxTokens: 32768,
        model: getModel("systemJobReasoning"),
        thinking: true,
        thinkingBudget: getThinkingBudget("systemJobReasoning") ?? undefined,
      });
      rawResponse = response.text;

      const parsed = extractJSON(rawResponse);
      if (!parsed) {
        parseError = "Could not parse JSON from response";
        if (attempt === 0) continue;
        break;
      }

      const result = SystemJobOutputSchema.safeParse(parsed);
      if (!result.success) {
        parseError = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
        if (attempt === 0) continue;
        break;
      }

      return { output: result.data, rawText: rawResponse };
    } catch (err) {
      console.error("[system-job] LLM call failed:", err);
      return null;
    }
  }

  console.warn(`[system-job] Validation failed: ${parseError}`);
  return null;
}

// ── Output Dispatch ────────────────────────────────────────────────────────

type CapabilityRow = {
  id: string;
  name: string;
  connectorId: string | null;
  enabled: boolean;
  connector: { provider: string } | null;
};

async function dispatchOutput(
  output: SystemJobOutput,
  job: SystemJobRow,
  capabilities: CapabilityRow[],
): Promise<{ situationsCreated: number; initiativesCreated: number }> {
  let situationsCreated = 0;
  let initiativesCreated = 0;

  // Dispatch proposed situations
  for (const proposed of output.proposedSituations) {
    try {
      // Resolve situation type
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
      if (!situationTypeId) {
        console.warn("[system-job] No situation type resolved for proposed situation. Skipping.");
        continue;
      }

      // Resolve trigger entity
      let triggerEntityId: string | null = null;
      if (proposed.triggerEntityName) {
        const entity = await prisma.entity.findFirst({
          where: {
            operatorId: job.operatorId,
            displayName: { contains: proposed.triggerEntityName, mode: "insensitive" },
            status: "active",
          },
          select: { id: true },
        });
        triggerEntityId = entity?.id ?? null;
      }

      const urgencyToSeverity: Record<string, number> = { high: 0.9, medium: 0.6, low: 0.3 };

      await prisma.situation.create({
        data: {
          operatorId: job.operatorId,
          situationTypeId,
          triggerEntityId,
          triggerSummary: proposed.description,
          status: "detected",
          severity: urgencyToSeverity[proposed.urgency] ?? 0.5,
          confidence: 0.7,
          source: "system_job",
        },
      });

      situationsCreated++;
    } catch (err) {
      console.error(`[system-job] Failed to create situation "${proposed.title}":`, err);
    }
  }

  // Dispatch proposed initiatives
  for (const proposed of output.proposedInitiatives) {
    try {
      // Resolve goal
      let goalId = proposed.suggestedGoalId ?? null;
      if (goalId) {
        const exists = await prisma.goal.findFirst({
          where: { id: goalId, operatorId: job.operatorId, status: "active" },
          select: { id: true },
        });
        if (!exists) goalId = null;
      }
      if (!goalId) {
        // Fall back to first active goal in scope
        const fallback = await prisma.goal.findFirst({
          where: {
            operatorId: job.operatorId,
            status: "active",
            ...(job.scopeEntityId ? { departmentId: job.scopeEntityId } : {}),
          },
          select: { id: true },
          orderBy: { priority: "asc" },
        });
        if (!fallback) {
          console.warn("[system-job] No active goal found for initiative. Skipping.");
          continue;
        }
        goalId = fallback.id;
      }

      // Resolve steps
      const resolvedSteps: StepDefinition[] = [];
      let skipProposal = false;
      for (const step of proposed.steps) {
        let actionCapabilityId: string | undefined;
        if (step.executionMode === "action" && step.actionCapabilityName) {
          const cap = capabilities.find(c => c.name === step.actionCapabilityName);
          if (!cap) {
            console.warn(`[system-job] ActionCapability "${step.actionCapabilityName}" not found. Skipping proposal.`);
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
      if (skipProposal || resolvedSteps.length === 0) continue;

      // Create initiative
      const initiative = await prisma.initiative.create({
        data: {
          operatorId: job.operatorId,
          goalId,
          aiEntityId: job.aiEntityId,
          status: "proposed",
          rationale: proposed.rationale,
          impactAssessment: proposed.impactAssessment,
        },
      });

      const planId = await createExecutionPlan(job.operatorId, "initiative", initiative.id, resolvedSteps);

      await prisma.initiative.update({
        where: { id: initiative.id },
        data: { executionPlanId: planId },
      });

      sendNotificationToAdmins({
        operatorId: job.operatorId,
        type: "initiative_proposed",
        title: `New initiative proposed by System Job: ${proposed.rationale.slice(0, 80)}`,
        body: proposed.impactAssessment.slice(0, 200),
        sourceType: "initiative",
        sourceId: initiative.id,
      }).catch(() => {});

      initiativesCreated++;
    } catch (err) {
      console.error(`[system-job] Failed to create initiative:`, err);
    }
  }

  return { situationsCreated, initiativesCreated };
}

// ── Context Assembly ───────────────────────────────────────────────────────

type ContextProfile = {
  dataDomains?: string[];
  focusEntityIds?: string[];
  connectorProviders?: string[];
  timeWindowDays?: number;
  includeInsights?: boolean;
  includeGoals?: boolean;
  includeSituationTypeStats?: boolean;
};

type AssembledContext = {
  sections: { label: string; content: string }[];
  capabilities: CapabilityRow[];
};

async function assembleSystemJobContext(
  job: SystemJobRow,
  operatorId: string,
): Promise<AssembledContext> {
  const sections: { label: string; content: string }[] = [];

  let profile: ContextProfile = {};
  try {
    profile = JSON.parse(job.contextProfile) as ContextProfile;
  } catch {
    console.warn(`[system-job] Invalid contextProfile JSON for job ${job.id}`);
  }

  const timeWindowDays = profile.timeWindowDays ?? 30;
  const since = new Date(Date.now() - timeWindowDays * 24 * 60 * 60 * 1000);
  const dataDomains = profile.dataDomains ?? [];

  // ── Department context (always if scoped) ────────────────────────────────
  if (job.scopeEntityId) {
    const dept = await prisma.entity.findFirst({
      where: { id: job.scopeEntityId, operatorId },
      select: { displayName: true, description: true },
    });
    if (dept) {
      const memberCount = await prisma.entity.count({
        where: { operatorId, parentDepartmentId: job.scopeEntityId, category: "base", status: "active" },
      });
      sections.push({
        label: "DEPARTMENT",
        content: `${dept.displayName}${dept.description ? ` — ${dept.description}` : ""}\nMembers: ${memberCount}`,
      });
    }
  }

  // ── Prior cycle history (always) ─────────────────────────────────────────
  const priorRuns = await prisma.systemJobRun.findMany({
    where: { systemJobId: job.id, status: { in: ["completed", "compressed"] } },
    orderBy: { cycleNumber: "desc" },
    take: 5,
    select: {
      cycleNumber: true,
      summary: true,
      findings: true,
      cycleComparison: true,
      importanceScore: true,
      status: true,
      createdAt: true,
    },
  });
  if (priorRuns.length > 0) {
    const runLines = priorRuns.map(r => {
      const findings = Array.isArray(r.findings) ? r.findings as Array<{ title: string; category: string }> : [];
      const findingSummary = findings.length > 0
        ? `\n    Findings: ${findings.map(f => `[${f.category}] ${f.title}`).join("; ")}`
        : "";
      const comparison = r.cycleComparison as { keyChanges?: string[] } | null;
      const changesSummary = comparison?.keyChanges?.length
        ? `\n    Key changes: ${comparison.keyChanges.join("; ")}`
        : "";
      return `  Cycle ${r.cycleNumber} (${r.createdAt.toISOString().split("T")[0]}) — importance: ${r.importanceScore?.toFixed(2) ?? "N/A"}, status: ${r.status}\n    Summary: ${r.summary ?? "N/A"}${findingSummary}${changesSummary}`;
    }).join("\n\n");
    sections.push({ label: "PRIOR CYCLE HISTORY", content: runLines });
  }

  // ── Domain-specific data ─────────────────────────────────────────────────

  const DOMAIN_SIGNAL_PATTERNS: Record<string, string[]> = {
    financial: ["invoice", "payment", "revenue", "subscription", "charge", "refund"],
    crm: ["deal", "contact", "pipeline", "company", "lead"],
    communication: ["email", "message", "thread", "reply"],
    calendar: ["calendar", "meeting", "event"],
  };

  for (const domain of dataDomains) {
    if (domain === "content") continue; // Handled via RAG below

    const patterns = DOMAIN_SIGNAL_PATTERNS[domain];
    if (!patterns) continue;

    const signals = await prisma.activitySignal.findMany({
      where: {
        operatorId,
        occurredAt: { gte: since },
        OR: patterns.map(p => ({ signalType: { contains: p, mode: "insensitive" as const } })),
        ...(job.scopeEntityId ? { departmentIds: { contains: job.scopeEntityId } } : {}),
      },
      select: {
        signalType: true,
        metadata: true,
        actorEntityId: true,
        targetEntityIds: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: "desc" },
      take: 100,
    });

    if (signals.length > 0) {
      const lines = signals.map(s => {
        let detail = "";
        if (s.metadata) {
          try {
            const meta = JSON.parse(s.metadata) as Record<string, unknown>;
            const subject = meta.subject ?? meta.file_name ?? meta.channel ?? "";
            if (subject) detail = ` — ${String(subject)}`;
          } catch { /* ignore */ }
        }
        return `  ${s.occurredAt.toISOString().split("T")[0]} [${s.signalType}]${detail}`;
      }).join("\n");
      sections.push({ label: `${domain.toUpperCase()} DATA`, content: `${signals.length} signals in last ${timeWindowDays} days:\n${lines}` });
    }
  }

  // ── Content domain (RAG retrieval) ───────────────────────────────────────
  if (dataDomains.includes("content") && job.description) {
    try {
      const [queryEmbedding] = await embedChunks([job.description]);
      if (queryEmbedding) {
        const chunks = await retrieveRelevantChunks(operatorId, queryEmbedding, {
          limit: 10,
          minScore: 0.3,
          ...(job.scopeEntityId ? { departmentIds: [job.scopeEntityId] } : {}),
          skipUserFilter: true,
        });
        if (chunks.length > 0) {
          const lines = chunks.map((c, i) =>
            `  [${i + 1}] (score: ${c.score.toFixed(2)}) ${c.content.slice(0, 300)}`,
          ).join("\n");
          sections.push({ label: "KNOWLEDGE BASE", content: lines });
        }
      }
    } catch (err) {
      console.warn("[system-job] RAG retrieval failed:", err);
    }
  }

  // ── Operational insights ─────────────────────────────────────────────────
  if (profile.includeInsights) {
    const insights = await prisma.operationalInsight.findMany({
      where: {
        operatorId,
        status: "active",
        ...(job.scopeEntityId
          ? { OR: [{ departmentId: job.scopeEntityId }, { shareScope: "operator" }] }
          : {}),
      },
      select: { description: true, confidence: true, insightType: true },
      orderBy: { confidence: "desc" },
      take: 15,
    });
    if (insights.length > 0) {
      const lines = insights.map(i =>
        `  [${i.insightType}] ${i.description} (confidence: ${i.confidence.toFixed(2)})`,
      ).join("\n");
      sections.push({ label: "OPERATIONAL INSIGHTS", content: lines });
    }
  }

  // ── Active goals ─────────────────────────────────────────────────────────
  if (profile.includeGoals) {
    const goals = await prisma.goal.findMany({
      where: {
        operatorId,
        status: "active",
        ...(job.scopeEntityId ? { departmentId: job.scopeEntityId } : {}),
      },
      select: { id: true, title: true, description: true, measurableTarget: true, priority: true, deadline: true },
      orderBy: { priority: "asc" },
    });
    if (goals.length > 0) {
      const lines = goals.map(g => {
        const deadline = g.deadline ? ` | Deadline: ${g.deadline.toISOString().split("T")[0]}` : "";
        const target = g.measurableTarget ? ` | Target: ${g.measurableTarget}` : "";
        return `  [${g.id}] ${g.title} (priority ${g.priority}${deadline}${target})\n    ${g.description}`;
      }).join("\n");
      sections.push({ label: "ACTIVE GOALS", content: lines });
    }
  }

  // ── Situation type stats ─────────────────────────────────────────────────
  if (profile.includeSituationTypeStats) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const stypes = await prisma.situationType.findMany({
      where: {
        operatorId,
        enabled: true,
        ...(job.scopeEntityId ? { scopeEntityId: job.scopeEntityId } : {}),
      },
      select: {
        name: true,
        description: true,
        _count: {
          select: {
            situations: {
              where: { createdAt: { gte: ninetyDaysAgo } },
            },
          },
        },
      },
    });
    if (stypes.length > 0) {
      const lines = stypes.map(st =>
        `  ${st.name}: ${st.description} — ${st._count.situations} detected (90d)`,
      ).join("\n");
      sections.push({ label: "SITUATION TYPES", content: lines });
    }
  }

  // ── Active situations (dedup check) ──────────────────────────────────────
  const activeSituations = await prisma.situation.findMany({
    where: {
      operatorId,
      status: { notIn: ["resolved", "closed", "dismissed"] },
      ...(job.scopeEntityId ? { situationType: { scopeEntityId: job.scopeEntityId } } : {}),
    },
    select: {
      triggerSummary: true,
      status: true,
      situationType: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  if (activeSituations.length > 0) {
    const lines = activeSituations.map(s =>
      `  [${s.status}] ${s.situationType.name}: ${s.triggerSummary?.slice(0, 100) ?? "No summary"}`,
    ).join("\n");
    sections.push({ label: "ACTIVE SITUATIONS", content: `Do NOT propose situations that duplicate these:\n${lines}` });
  }

  // ── Active initiatives (dedup check) ─────────────────────────────────────
  const activeInitiatives = await prisma.initiative.findMany({
    where: {
      operatorId,
      status: { notIn: ["rejected", "failed"] },
      ...(job.scopeEntityId ? { goal: { departmentId: job.scopeEntityId } } : {}),
    },
    select: {
      rationale: true,
      status: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  if (activeInitiatives.length > 0) {
    const lines = activeInitiatives.map(i =>
      `  [${i.status}] ${i.rationale.slice(0, 120)}`,
    ).join("\n");
    sections.push({ label: "ACTIVE INITIATIVES", content: `Do NOT propose initiatives that duplicate these:\n${lines}` });
  }

  // ── Active system jobs (self-amendment awareness) ────────────────────────
  const otherJobs = await prisma.systemJob.findMany({
    where: {
      operatorId,
      status: "active",
      id: { not: job.id },
    },
    select: { title: true, description: true, scope: true },
  });
  if (otherJobs.length > 0) {
    const lines = otherJobs.map(j =>
      `  ${j.title} (${j.scope})${j.description ? `: ${j.description.slice(0, 100)}` : ""}`,
    ).join("\n");
    sections.push({ label: "ACTIVE SYSTEM JOBS", content: `Other active jobs (do not duplicate):\n${lines}` });
  }

  // ── Available action capabilities ────────────────────────────────────────
  const capabilities = await prisma.actionCapability.findMany({
    where: { operatorId, enabled: true },
    include: { connector: { select: { provider: true } } },
  });
  if (capabilities.length > 0) {
    const lines = capabilities.map(c =>
      `  ${c.name}: ${c.description ?? "No description"} (${c.connector?.provider ?? "internal"})`,
    ).join("\n");
    sections.push({ label: "AVAILABLE ACTIONS", content: lines });
  } else {
    sections.push({ label: "AVAILABLE ACTIONS", content: "None. Only generate and human_task steps are possible." });
  }

  return { sections, capabilities };
}

// ── Prompt Builders ────────────────────────────────────────────────────────

function buildSystemJobSystemPrompt(
  job: SystemJobRow,
  companyName: string,
): string {
  return `You are a specialized intelligence analyst performing a scheduled analysis for ${companyName}.

YOUR ROLE: ${job.title}
${job.description || ""}

ANALYTICAL FRAMEWORK:
${job.reasoningProfile}

You run on a recurring schedule. Your value comes from DEPTH OF INSIGHT, not breadth of summary. Do not restate metrics that anyone could read from a dashboard. Identify patterns, correlations, anomalies, and actionable opportunities that require cross-system reasoning.

YOUR JOB HAS TWO PHASES:

Phase 1 — THINKING (use your extended thinking block):
- Review all data sections thoroughly
- Compare against prior cycle findings (if available)
- Identify what CHANGED since last cycle and what that change means
- Assess which findings are truly actionable vs merely informational
- Self-assess: is this cycle's analysis important enough to warrant attention?

Phase 2 — OUTPUT (JSON):
- summary: 2-3 sentence executive summary. Lead with the most important finding.
- importanceScore: 0.0-1.0. Be honest. If nothing significant changed since last cycle, score low. A score below ${job.importanceThreshold} means your findings will be compressed to a notification only. This is fine — it builds trust that when you DO flag something, it matters.
- analysisNarrative: Full analysis with evidence citations. Reference data by section name (e.g., [FINANCIAL DATA], [CRM DATA]).
- proposedSituations: Things that need decisions NOW. Only propose if you have concrete evidence and a clear entity involved. Each becomes a real situation in the system that a human must review and act on. Use existing situation type names when possible.
- proposedInitiatives: Strategic changes that need multi-step planning. Only propose for significant opportunities or risks. Steps with executionMode "action" must reference available capabilities by name.
- findings: Informational observations — trends, metrics, anomalies that don't require immediate action but should be visible.
- selfAmendments: How should this job evolve? Should it look at additional data sources? Run more/less frequently? Be deactivated because it's no longer finding value?
- cycleComparison: What changed since last cycle? For each recommendation from prior cycles, track what happened.

RULES:
- proposedSituations must reference existing situation type names when possible (see SITUATION TYPES section)
- proposedInitiatives steps with executionMode "action" MUST reference available capabilities by name (see AVAILABLE ACTIONS section)
- Do NOT propose situations for things already in ACTIVE SITUATIONS
- Do NOT propose initiatives that duplicate ACTIVE INITIATIVES
- Do NOT propose System Jobs that duplicate ACTIVE SYSTEM JOBS (use selfAmendments to suggest changes to THIS job instead)
- If nothing significant changed since last cycle, say so honestly and score importanceScore LOW
- selfAmendments with type "deactivate" should be rare — only when the job has been consistently low-importance for many cycles

OUTPUT FORMAT:
Respond with ONLY valid JSON (no markdown fences, no commentary):
{
  "summary": "2-3 sentence executive summary",
  "importanceScore": 0.0,
  "analysisNarrative": "full analysis with evidence citations",
  "proposedSituations": [
    {
      "title": "specific situation title",
      "description": "what needs a decision",
      "suggestedSituationTypeName": "existing type name or null",
      "triggerEntityName": "entity name involved or null",
      "urgency": "low | medium | high",
      "evidence": ["evidence point 1", "evidence point 2"]
    }
  ],
  "proposedInitiatives": [
    {
      "rationale": "why this initiative now",
      "impactAssessment": "expected outcome",
      "suggestedGoalId": "goal ID or null",
      "steps": [
        {
          "title": "step title",
          "description": "step description",
          "executionMode": "action | generate | human_task",
          "actionCapabilityName": "capability name (for action mode)",
          "params": {}
        }
      ]
    }
  ],
  "findings": [
    {
      "title": "finding title",
      "description": "finding description",
      "category": "trend | risk | opportunity | metric | anomaly"
    }
  ],
  "selfAmendments": [
    {
      "type": "add_data_source | change_frequency | refine_focus | expand_scope | deactivate",
      "description": "what to change",
      "rationale": "why"
    }
  ],
  "cycleComparison": {
    "keyChanges": ["change 1", "change 2"],
    "priorRecommendationOutcomes": [
      {
        "recommendation": "what was recommended last cycle",
        "whatHappened": "what actually happened",
        "assessment": "effective | ineffective | too_early | not_implemented"
      }
    ]
  }
}`;
}

function buildSystemJobUserPrompt(context: AssembledContext): string {
  return context.sections
    .map(s => `${s.label}:\n${s.content}`)
    .join("\n\n");
}
