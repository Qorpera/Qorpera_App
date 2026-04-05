import { prisma } from "@/lib/db";
import { callLLM, getModel, getThinkingBudget } from "@/lib/ai-provider";
import type { LLMMessage, AITool } from "@/lib/ai-provider";
import { loadOperationalInsights } from "@/lib/context-assembly";
import { evaluateActionPolicies, getEffectiveAutonomy } from "@/lib/policy-evaluator";
import { buildAgenticSystemPrompt, buildAgenticSeedContext, type AgenticSeedInput } from "@/lib/reasoning-prompts";
import { getBusinessContext, formatBusinessContext } from "@/lib/business-context";
import { createExecutionPlan, type StepDefinition } from "@/lib/execution-engine";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { ReasoningOutputSchema, type ReasoningOutput } from "@/lib/reasoning-types";
import { captureApiError } from "@/lib/api-error";
import { shouldAutoApprovePlan } from "@/lib/plan-autonomy";
import { extractJSON } from "@/lib/json-helpers";
import { generateSituationSummaries } from "@/lib/situation-summarizer";
import { refineUncertainties } from "@/lib/reasoning/uncertainty-refiner";
import { REASONING_TOOLS, executeReasoningTool } from "@/lib/reasoning-tools";
import { getConnectorReadTools, executeConnectorReadTool } from "@/lib/connector-read-tools";
import { logToolCall } from "@/lib/tool-call-trace";
import { processWikiUpdates, getRelevantPagesForSeed, type WikiUpdate } from "@/lib/wiki-engine";

/** Increment this whenever the reasoning system/user prompt changes meaningfully. */
export const REASONING_PROMPT_VERSION = 5; // v5: capability binding, email drafting, params population

// ── Main ─────────────────────────────────────────────────────────────────────

export async function reasonAboutSituation(situationId: string): Promise<void> {
  // 1. Load situation
  const situation = await prisma.situation.findUnique({
    where: { id: situationId },
    include: {
      situationType: true,
    },
  });

  if (!situation) {
    console.warn(`[reasoning-engine] Situation ${situationId} not found`);
    return;
  }

  // 2. Guard — skip if not detected (idempotent)
  if (situation.status !== "detected") {
    return;
  }

  // 3. Update status to reasoning (optimistic lock)
  const lockResult = await prisma.situation.updateMany({
    where: { id: situationId, status: "detected" },
    data: { status: "reasoning" },
  });
  if (lockResult.count === 0) {
    return;
  }

  try {
    // 4. Resolve governance
    // Get trigger entity type slug
    let triggerEntityTypeSlug = "unknown";
    if (situation.triggerEntityId) {
      const entity = await prisma.entity.findFirst({
        where: { id: situation.triggerEntityId, operatorId: situation.operatorId },
        include: { entityType: { select: { slug: true } } },
      });
      if (entity) {
        triggerEntityTypeSlug = entity.entityType.slug;
      }
    }

    // Load action capabilities with connector info
    const capabilities = await prisma.actionCapability.findMany({
      where: { operatorId: situation.operatorId, enabled: true },
      include: { connector: { select: { provider: true } } },
    });

    const actionsForEval = capabilities.map((c) => ({
      name: c.name,
      description: c.description,
      connectorId: c.connectorId,
      connectorProvider: c.connector?.provider ?? null,
      inputSchema: c.inputSchema,
    }));

    const policyResult = await evaluateActionPolicies(
      situation.operatorId,
      actionsForEval,
      triggerEntityTypeSlug,
      situation.triggerEntityId ?? "",
    );

    // Look up personal autonomy for users in scope
    let personalAutonomyLevel: string | undefined;

    if (situation.triggerEntityId) {
      const triggerEntity = await prisma.entity.findFirst({
        where: { id: situation.triggerEntityId, operatorId: situation.operatorId },
        select: { parentDepartmentId: true },
      });

      if (triggerEntity?.parentDepartmentId) {
        const scopedUsers = await prisma.userScope.findMany({
          where: { departmentEntityId: triggerEntity.parentDepartmentId },
          select: { userId: true },
        });
        const adminUsers = await prisma.user.findMany({
          where: { operatorId: situation.operatorId, role: "admin" },
          select: { id: true },
        });
        const allUserIds = [
          ...new Set([
            ...scopedUsers.map(s => s.userId),
            ...adminUsers.map(u => u.id),
          ]),
        ];

        if (allUserIds.length > 0) {
          const aiEntities = await prisma.entity.findMany({
            where: { ownerUserId: { in: allUserIds }, operatorId: situation.operatorId, status: "active" },
            select: { id: true },
          });

          if (aiEntities.length > 0) {
            const pas = await prisma.personalAutonomy.findMany({
              where: {
                situationTypeId: situation.situationTypeId,
                aiEntityId: { in: aiEntities.map(e => e.id) },
              },
              select: { autonomyLevel: true },
            });

            const AUTONOMY_RANK: Record<string, number> = {
              supervised: 0, notify: 1, autonomous: 2,
            };
            if (pas.length > 0) {
              const highest = pas.reduce((best, pa) =>
                (AUTONOMY_RANK[pa.autonomyLevel] ?? 0) > (AUTONOMY_RANK[best.autonomyLevel] ?? 0) ? pa : best
              );
              personalAutonomyLevel = highest.autonomyLevel;
            }
          }
        }
      }
    }

    const effectiveAutonomy = getEffectiveAutonomy(
      situation.situationType,
      policyResult,
      personalAutonomyLevel,
    );

    // 6. Build prompt
    const [businessCtx, operator] = await Promise.all([
      getBusinessContext(situation.operatorId),
      prisma.operator.findUnique({
        where: { id: situation.operatorId },
        select: { companyName: true },
      }),
    ]);
    const businessContextStr = businessCtx ? formatBusinessContext(businessCtx) : null;

    // 5a. Compute edit instruction and prior feedback
    let editInstructionText: string | null = null;
    if (situation.editInstruction) {
      let originalProposal = "null";
      if (situation.proposedAction) {
        try { originalProposal = JSON.stringify(JSON.parse(situation.proposedAction), null, 2); } catch { originalProposal = situation.proposedAction; }
      }
      editInstructionText = `The human reviewed the original proposal and requested changes.\n\nORIGINAL PROPOSAL:\n${originalProposal}\n\nHUMAN'S EDIT INSTRUCTION:\n"${situation.editInstruction}"`;
    }

    const priorFeedback = await prisma.situation.findMany({
      where: {
        situationTypeId: situation.situationTypeId,
        feedback: { not: null },
        id: { not: situationId },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { feedback: true, feedbackCategory: true },
    });
    const priorFeedbackLines = priorFeedback.length > 0
      ? priorFeedback.map((f) => `  - ${f.feedback}${f.feedbackCategory ? ` [${f.feedbackCategory}]` : ""}`)
      : null;

    // 5b. Load trigger entity stub (minimal — model uses lookup_entity for full details)
    const triggerStub = situation.triggerEntityId
      ? await prisma.entity.findFirst({
          where: { id: situation.triggerEntityId, operatorId: situation.operatorId },
          select: {
            id: true,
            displayName: true,
            category: true,
            entityType: { select: { name: true, slug: true } },
          },
        })
      : null;

    // 5c. Load operational insights
    let aiEntityId: string | null = null;
    let triggerDepartmentId: string | null = null;
    if (situation.triggerEntityId) {
      const te = await prisma.entity.findFirst({
        where: { id: situation.triggerEntityId, operatorId: situation.operatorId },
        select: { parentDepartmentId: true },
      });
      triggerDepartmentId = te?.parentDepartmentId ?? null;
      if (triggerDepartmentId) {
        const deptAi = await prisma.entity.findFirst({
          where: { ownerDepartmentId: triggerDepartmentId, operatorId: situation.operatorId, status: "active" },
          select: { id: true },
        });
        aiEntityId = deptAi?.id ?? null;
      }
    }
    const operationalInsights = await loadOperationalInsights(
      situation.operatorId, aiEntityId, triggerDepartmentId, situation.situationTypeId,
    );

    // 5d. Load action cycles (prior completed cycles for this situation)
    const completedCycles = await prisma.situationCycle.findMany({
      where: { situationId, status: "completed" },
      orderBy: { cycleNumber: "asc" },
      include: {
        executionPlan: {
          include: { steps: { orderBy: { sequenceOrder: "asc" } } },
        },
      },
    });
    const actionCycles = completedCycles.map((c) => ({
      cycleNumber: c.cycleNumber,
      triggerType: c.triggerType,
      triggerSummary: c.triggerSummary,
      steps: (c.executionPlan?.steps ?? []).map((s) => ({
        title: s.title,
        completed: s.status === "completed",
        notes: s.outputResult ? (() => { try { const r = JSON.parse(s.outputResult!); return r.notes || r.description || undefined; } catch { return undefined; } })() : undefined,
      })),
    }));
    const cycleNumber = completedCycles.length + 1;

    // 5e. Load delegation source
    let delegationSource: { instruction: string; context: unknown; fromEntityName: string | null } | null = null;
    if (situation.delegationId) {
      const delegation = await prisma.delegation.findFirst({
        where: { id: situation.delegationId!, operatorId: situation.operatorId },
        select: { instruction: true, context: true, fromAiEntityId: true },
      });
      if (delegation) {
        const fromEntity = await prisma.entity.findFirst({
          where: { id: delegation.fromAiEntityId, operatorId: situation.operatorId },
          select: { displayName: true },
        });
        delegationSource = {
          instruction: delegation.instruction,
          context: delegation.context ? (() => { try { return JSON.parse(delegation.context!); } catch { return null; } })() : null,
          fromEntityName: fromEntity?.displayName ?? null,
        };
      }
    }

    // 5f. Load workstream membership
    const workstreamItems = await prisma.workStreamItem.findMany({
      where: { itemType: "situation", itemId: situationId },
      select: { workStreamId: true },
    });

    // 6. Load connector capabilities for seed context
    const PROVIDER_TYPES: Record<string, string[]> = {
      google: ["gmail", "google_drive", "google_calendar", "google_sheets"],
      microsoft: ["outlook", "onedrive", "teams", "microsoft_calendar"],
      slack: ["slack"],
      hubspot: ["hubspot"],
      stripe: ["stripe"],
    };
    const activeConnectors = await prisma.sourceConnector.findMany({
      where: { operatorId: situation.operatorId, status: "active", deletedAt: null },
      select: { provider: true, userId: true },
    });
    const connSeen = new Set<string>();
    const connectorCapabilities = activeConnectors.flatMap((c) => {
      const types = PROVIDER_TYPES[c.provider] ?? [c.provider];
      return types
        .filter((type) => {
          const key = `${c.provider}:${type}:${c.userId ? "personal" : "company"}`;
          if (connSeen.has(key)) return false;
          connSeen.add(key);
          return true;
        })
        .map((type) => ({
          provider: c.provider,
          type,
          scope: (c.userId ? "personal" : "company") as "personal" | "company",
        }));
    });

    // 6b. Assemble dynamic tool set (knowledge-graph + connector read tools)
    const [
      { tools: connectorTools, availableToolNames: connectorToolNames },
      wikiPages,
    ] = await Promise.all([
      getConnectorReadTools(situation.operatorId),
      situation.triggerEntityId
        ? getRelevantPagesForSeed(
            situation.operatorId,
            situation.triggerEntityId,
            situation.situationType.slug,
          )
        : Promise.resolve([]),
    ]);
    const allTools = [...REASONING_TOOLS, ...connectorTools];

    const dispatchTool = async (toolName: string, args: Record<string, unknown>): Promise<string> => {
      if (connectorToolNames.has(toolName)) {
        return executeConnectorReadTool(situation.operatorId, toolName, args);
      }
      return executeReasoningTool(situation.operatorId, toolName, args);
    };

    // 6c. Build system prompt and seed context
    const systemPrompt = buildAgenticSystemPrompt(businessContextStr, operator?.companyName ?? undefined, connectorToolNames);

    const seedInput: AgenticSeedInput = {
      situationType: { name: situation.situationType.name, description: situation.situationType.description },
      severity: situation.severity,
      confidence: situation.confidence,
      autonomyLevel: effectiveAutonomy,
      triggerEvidence: situation.triggerEvidence,
      triggerSummary: situation.triggerSummary,
      triggerStub: triggerStub ? {
        id: triggerStub.id,
        displayName: triggerStub.displayName,
        category: triggerStub.category,
        typeName: triggerStub.entityType.name,
      } : null,
      permittedActions: policyResult.permitted,
      blockedActions: policyResult.blocked,
      businessContext: businessContextStr,
      operationalInsights,
      actionCycles,
      delegationSource,
      workstreamCount: workstreamItems.length,
      connectorCapabilities,
      wikiPages,
    };
    const seedContext = buildAgenticSeedContext(seedInput);

    // 7. Run agentic reasoning loop
    const agenticResult = await runAgenticLoop({
      operatorId: situation.operatorId,
      situationId,
      cycleNumber,
      systemPrompt,
      seedContext,
      tools: allTools,
      dispatchTool,
      editInstruction: editInstructionText,
      priorFeedbackLines,
    });
    let reasoning = agenticResult.reasoning;
    const reasoningApiCostCents = agenticResult.apiCostCents;
    const modelString = agenticResult.modelId;
    const reasoningDurationMs = agenticResult.durationMs;

    console.log(`[reasoning-engine] Agentic reasoning complete for situation ${situationId}: ${reasoningDurationMs}ms, $${(reasoningApiCostCents / 100).toFixed(2)}`);

    // 8. Post-reasoning policy verification — catch LLM ignoring BLOCKED instructions
    if (reasoning.actionPlan) {
      const actionSteps = reasoning.actionPlan.filter(s => s.executionMode === "action");
      for (const step of actionSteps) {
        if (step.actionCapabilityName) {
          const isPermitted = policyResult.permitted.some(p => p.name === step.actionCapabilityName);
          const isBlocked = policyResult.blocked.some(b => b.name === step.actionCapabilityName);
          if (!isPermitted || isBlocked) {
            console.warn(`[reasoning-engine] AI proposed blocked action "${step.actionCapabilityName}" in plan for situation ${situationId}. Nullifying plan.`);
            reasoning = {
              ...reasoning,
              actionPlan: null,
              analysis: reasoning.analysis + `\n\n[SYSTEM: Plan nullified — step "${step.title}" uses blocked action "${step.actionCapabilityName}".]`,
            };
            break;
          }
        }
      }
    }

    // 9. Resolve actionCapabilityName → actionCapabilityId for action steps
    let resolvedSteps: StepDefinition[] | null = null;
    if (reasoning.actionPlan) {
      resolvedSteps = [];
      for (const step of reasoning.actionPlan) {
        let actionCapabilityId: string | undefined;
        if (step.executionMode === "action" && step.actionCapabilityName) {
          const cap = await prisma.actionCapability.findFirst({
            where: { operatorId: situation.operatorId, name: step.actionCapabilityName, enabled: true },
          });
          if (!cap) {
            console.warn(`[reasoning-engine] ActionCapability "${step.actionCapabilityName}" not found. Nullifying plan.`);
            reasoning = { ...reasoning, actionPlan: null };
            resolvedSteps = null;
            break;
          }
          actionCapabilityId = cap.id;
        }
        const stepParams = step.params ? { ...step.params } : {};
        if (step.previewType) stepParams.previewType = step.previewType;
        resolvedSteps.push({
          title: step.title,
          description: step.description,
          executionMode: step.executionMode,
          actionCapabilityId,
          assignedUserId: step.assignedUserId || situation.assignedUserId || undefined,
          inputContext: Object.keys(stepParams).length > 0 ? { params: stepParams } : undefined,
        });
      }
    }

    // Refine uncertainties — focused pass to resolve or confirm
    if (resolvedSteps && reasoning.actionPlan) {
      const hasUncertainties = reasoning.actionPlan.some(s => s.uncertainties && s.uncertainties.length > 0);
      if (hasUncertainties) {
        try {
          let triggerEvidenceStr: string | undefined;
          if (situation.triggerEvidence) {
            try {
              const te = JSON.parse(situation.triggerEvidence);
              triggerEvidenceStr = te.content ?? te.summary ?? undefined;
            } catch {}
          }

          const refinement = await refineUncertainties(
            reasoning.actionPlan,
            reasoning.evidenceSummary ?? "",
            undefined, // agentic model already investigated communications
            triggerEvidenceStr,
          );

          for (const refined of refinement.refinedSteps) {
            if (refined.stepIndex >= resolvedSteps.length) continue;
            const step = resolvedSteps[refined.stepIndex];

            if (refined.paramUpdates && step.inputContext) {
              const existingParams = (step.inputContext as Record<string, unknown>).params as Record<string, unknown> ?? {};
              (step.inputContext as Record<string, unknown>).params = { ...existingParams, ...refined.paramUpdates };
            }

            if (refined.descriptionUpdate) {
              step.description = refined.descriptionUpdate;
            }

            if (refined.remainingUncertainties.length > 0) {
              step.inputContext = {
                ...(step.inputContext ?? {}),
                uncertainties: refined.remainingUncertainties,
              };
            }
          }

          const totalFlagged = reasoning.actionPlan.reduce((n, s) => n + (s.uncertainties?.length ?? 0), 0);
          const totalRemaining = refinement.refinedSteps.reduce((n, s) => n + s.remainingUncertainties.length, 0);
          if (totalFlagged > 0) {
            console.log(`[reasoning-engine] Uncertainty refinement: ${totalFlagged} flagged → ${totalRemaining} kept for situation ${situationId}`);
          }
        } catch (err) {
          console.error(`[reasoning-engine] Uncertainty refinement failed for ${situationId}:`, err);
        }
      }
    }

    // 10. Store reasoning + model tracking
    const planTracking = { modelId: modelString, promptVersion: REASONING_PROMPT_VERSION };

    const updates: Record<string, unknown> = {
      reasoning: JSON.stringify(reasoning),
      modelId: modelString,
      promptVersion: REASONING_PROMPT_VERSION,
      reasoningDurationMs,
      apiCostCents: reasoningApiCostCents,
      contextSnapshot: JSON.stringify({ agenticReasoning: true, toolCallCount: "see ToolCallTrace" }),
    };

    // Store proposedAction as the full plan for backward-compatible UI display
    if (reasoning.actionPlan) {
      updates.proposedAction = JSON.stringify(reasoning.actionPlan);
    }

    // 11. Advance status
    if (reasoning.actionPlan === null || !resolvedSteps) {
      updates.status = "proposed";
    } else if (effectiveAutonomy === "autonomous") {
      const planId = await createExecutionPlan(situation.operatorId, "situation", situationId, resolvedSteps, planTracking);
      updates.executionPlanId = planId;
      updates.status = "executing";
      await prisma.situationType.update({
        where: { id: situation.situationTypeId },
        data: { confirmedCount: { increment: 1 } },
      }).catch(() => {});
    } else {
      const planId = await createExecutionPlan(situation.operatorId, "situation", situationId, resolvedSteps, planTracking);
      updates.executionPlanId = planId;
      updates.status = "proposed";
    }

    // Fold situationTitle into the main update
    if (reasoning.situationTitle) {
      updates.triggerSummary = reasoning.situationTitle;
    }

    await prisma.situation.update({
      where: { id: situationId },
      data: updates,
    });

    await assignSituationOwner(situationId, situation.operatorId, reasoning, situation.assignedUserId);

    await createSituationCycle(situationId, situation, reasoning, updates.executionPlanId as string | undefined);

    // Generate Haiku summaries (fire-and-forget — non-blocking)
    generateSituationSummaries(situationId).catch(err =>
      console.error(`[reasoning-engine] Summary generation failed for ${situationId}:`, err)
    );

    // Wiki knowledge updates (fire-and-forget)
    if (reasoning.wikiUpdates && reasoning.wikiUpdates.length > 0) {
      processWikiUpdates({
        operatorId: situation.operatorId,
        situationId: situation.id,
        updates: reasoning.wikiUpdates as WikiUpdate[],
        synthesisPath: "reasoning",
        synthesizedByModel: modelString,
        synthesisCostCents: Math.round(reasoningApiCostCents),
        synthesisDurationMs: Math.round(reasoningDurationMs),
      }).catch((err) => {
        console.error(`[reasoning-engine] Wiki update processing failed for ${situationId}:`, err);
      });

      // Mark cited sources as wiki-processed
      const chunkIds: string[] = [];
      const signalIds: string[] = [];
      for (const update of reasoning.wikiUpdates) {
        for (const cite of update.sourceCitations) {
          if (cite.sourceType === "chunk") chunkIds.push(cite.sourceId);
          if (cite.sourceType === "signal") signalIds.push(cite.sourceId);
        }
      }
      if (chunkIds.length > 0) {
        prisma.contentChunk.updateMany({
          where: { id: { in: chunkIds } },
          data: { wikiProcessedAt: new Date() },
        }).catch(() => {});
      }
      if (signalIds.length > 0) {
        prisma.activitySignal.updateMany({
          where: { id: { in: signalIds } },
          data: { wikiProcessedAt: new Date() },
        }).catch(() => {});
      }
    }

    // Workstream absorption: link situation to related workstream
    if (reasoning.relatedWorkStreamId) {
      absorbSituationIntoWorkStream(situationId, reasoning.relatedWorkStreamId, situation.operatorId).catch(err =>
        console.error(`[reasoning-engine] Workstream absorption failed for ${situationId}:`, err),
      );
    }

    // For autonomous: auto-advance the first step
    if (resolvedSteps && effectiveAutonomy === "autonomous") {
      const plan = await prisma.executionPlan.findFirst({
        where: { id: updates.executionPlanId as string },
        include: { steps: { orderBy: { sequenceOrder: "asc" }, take: 1 } },
      });
      if (plan?.steps[0]) {
        const { advanceStep } = await import("@/lib/execution-engine");
        advanceStep(plan.steps[0].id, "approve", "system").catch(err =>
          console.error(`[reasoning-engine] Auto-advance failed for ${situationId}:`, err)
        );
      }
    }

    // For supervised: check plan autonomy graduation
    if (resolvedSteps && effectiveAutonomy === "supervised" && updates.executionPlanId) {
      await checkPlanAutonomyAutoApprove(
        situation.operatorId, situation.triggerEntityId, updates.executionPlanId as string,
        resolvedSteps, situation.situationType.name, situationId,
      );
    }

    // Situation-level notifications
    if (reasoning.actionPlan === null || !resolvedSteps) {
      sendNotificationToAdmins({
        operatorId: situation.operatorId,
        type: "situation_proposed",
        title: `Review needed: ${situation.situationType.name}`,
        body: "AI analyzed the situation but recommends no action. Please review the reasoning.",
        sourceType: "situation",
        sourceId: situationId,
      }).catch(() => {});
    } else if (effectiveAutonomy !== "autonomous") {
      sendNotificationToAdmins({
        operatorId: situation.operatorId,
        type: "situation_proposed",
        title: `Plan proposed: ${situation.situationType.name}`,
        body: `AI proposes a ${resolvedSteps.length}-step plan: ${resolvedSteps.map(s => s.title).join(" → ")}`,
        sourceType: "situation",
        sourceId: situationId,
      }).catch(() => {});
    }
    // autonomous: no notification (by design)

    // Handle escalation
    if (reasoning.escalation) {
      const triggerEntity = situation.triggerEntityId
        ? await prisma.entity.findFirst({ where: { id: situation.triggerEntityId, operatorId: situation.operatorId }, select: { parentDepartmentId: true } })
        : null;

      if (triggerEntity?.parentDepartmentId) {
        const deptAi = await prisma.entity.findFirst({
          where: { ownerDepartmentId: triggerEntity.parentDepartmentId, operatorId: situation.operatorId },
          select: { id: true },
        });

        const goal = await prisma.goal.findFirst({
          where: { operatorId: situation.operatorId, departmentId: triggerEntity.parentDepartmentId, status: "active" },
          orderBy: { priority: "asc" },
        });

        if (deptAi && goal) {
          await prisma.initiative.create({
            data: {
              operatorId: situation.operatorId,
              goalId: goal.id,
              aiEntityId: deptAi.id,
              status: "proposed",
              rationale: reasoning.escalation.rationale,
              impactAssessment: `Escalated from situation: ${situation.situationType?.name ?? situationId}`,
            },
          }).catch(err => console.error(`[reasoning-engine] Escalation initiative creation failed:`, err));
        }
      }
    }

  } catch (err) {
    console.error(`[reasoning-engine] Error reasoning about situation ${situationId}:`, err);
    captureApiError(err, { route: "reasoning-engine", situationId });
    // Reset to detected so it can be retried
    await prisma.situation.update({
      where: { id: situationId },
      data: { status: "detected" },
    }).catch(() => {});
  }
}

// ── Agentic Loop ────────────────────────────────────────────────────────────

const SOFT_BUDGET = 20;
const HARD_BUDGET = 25;

async function runAgenticLoop(params: {
  operatorId: string;
  situationId: string;
  cycleNumber: number;
  systemPrompt: string;
  seedContext: string;
  tools: AITool[];
  dispatchTool: (toolName: string, args: Record<string, unknown>) => Promise<string>;
  editInstruction?: string | null;
  priorFeedbackLines?: string[] | null;
}): Promise<{
  reasoning: ReasoningOutput;
  apiCostCents: number;
  durationMs: number;
  modelId: string;
}> {
  const model = getModel("agenticReasoning");
  const thinkingBudget = getThinkingBudget("agenticReasoning");
  const startTime = performance.now();
  let apiCostCents = 0;
  let totalCalls = 0;
  let callIndex = 0;
  let softNudgeSent = false;
  let parseRetried = false;

  // Build initial user message
  let initialContent = params.seedContext;
  if (params.editInstruction) {
    initialContent += `\n\nEDIT REQUEST:\n${params.editInstruction}\nRevise your actionPlan to incorporate this feedback. Keep the same situation analysis but adjust the plan steps and justification accordingly.`;
  }
  if (params.priorFeedbackLines) {
    initialContent += `\n\nHUMAN FEEDBACK ON SIMILAR SITUATIONS:\n${params.priorFeedbackLines.join("\n")}\nIncorporate this feedback into your reasoning.`;
  }

  const messages: LLMMessage[] = [
    { role: "user", content: initialContent },
  ];

  while (totalCalls < HARD_BUDGET) {
    // Soft budget nudge
    if (totalCalls >= SOFT_BUDGET && !softNudgeSent) {
      messages.push({
        role: "user",
        content: `BUDGET NOTICE: You have used ${totalCalls} of your ${HARD_BUDGET} tool call budget. You may make up to ${HARD_BUDGET - totalCalls} more calls if critical evidence is still missing. Otherwise, produce your final JSON assessment now.`,
      });
      softNudgeSent = true;
    }

    const response = await callLLM({
      instructions: params.systemPrompt,
      messages,
      tools: params.tools,
      temperature: 0.2,
      aiFunction: "reasoning",
      model,
      operatorId: params.operatorId,
      thinking: thinkingBudget !== null,
      thinkingBudget: thinkingBudget ?? undefined,
    });
    apiCostCents += response.apiCostCents;

    // Terminal check — model produced final output (no tool calls)
    if (!response.toolCalls?.length) {
      const parsed = extractJSON(response.text);
      if (!parsed) {
        if (!parseRetried) {
          parseRetried = true;
          messages.push({ role: "assistant", content: response.text });
          messages.push({ role: "user", content: "Your output could not be parsed as JSON. Produce valid JSON matching the required schema." });
          continue;
        }
        throw new Error(`Agentic reasoning failed: could not parse JSON after retry`);
      }
      const result = ReasoningOutputSchema.safeParse(parsed);
      if (!result.success) {
        const errors = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        if (!parseRetried) {
          parseRetried = true;
          messages.push({ role: "assistant", content: response.text });
          messages.push({ role: "user", content: `Your output could not be parsed: ${errors}. Produce valid JSON matching the required schema.` });
          continue;
        }
        throw new Error(`Agentic reasoning failed: schema validation failed after retry: ${errors}`);
      }
      return {
        reasoning: result.data,
        apiCostCents,
        durationMs: Math.round(performance.now() - startTime),
        modelId: model,
      };
    }

    // Tool execution — push assistant message with tool_calls, then execute each
    messages.push({
      role: "assistant",
      content: response.text || "",
      tool_calls: response.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      })),
    });

    for (const toolCall of response.toolCalls) {
      const toolStart = performance.now();
      const result = await params.dispatchTool(toolCall.name, toolCall.arguments);
      const toolDurationMs = Math.round(performance.now() - toolStart);

      messages.push({
        role: "tool",
        content: result,
        tool_call_id: toolCall.id,
        name: toolCall.name,
      });

      // Fire-and-forget telemetry
      logToolCall({
        situationId: params.situationId,
        cycleNumber: params.cycleNumber,
        callIndex,
        toolName: toolCall.name,
        arguments: toolCall.arguments,
        result,
        durationMs: toolDurationMs,
      }).catch(() => {});

      callIndex++;
      totalCalls++;
    }
  }

  // Hard budget hit — force final output with no tools
  messages.push({
    role: "user",
    content: "You must produce your final JSON assessment now. Note any remaining evidence gaps in the missingContext field.",
  });

  const finalResponse = await callLLM({
    instructions: params.systemPrompt,
    messages,
    temperature: 0.2,
    aiFunction: "reasoning",
    model,
    operatorId: params.operatorId,
    thinking: thinkingBudget !== null,
    thinkingBudget: thinkingBudget ?? undefined,
  });
  apiCostCents += finalResponse.apiCostCents;

  const parsed = extractJSON(finalResponse.text);
  if (!parsed) throw new Error("Agentic reasoning failed: could not parse final JSON after budget exhaustion");
  const result = ReasoningOutputSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Agentic reasoning failed: final output schema validation failed: ${errors}`);
  }

  return {
    reasoning: result.data,
    apiCostCents,
    durationMs: Math.round(performance.now() - startTime),
    modelId: model,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve situationOwner from reasoning output to a userId and assign it.
 */
async function assignSituationOwner(
  situationId: string,
  operatorId: string,
  reasoning: { situationOwner?: { entityName: string; entityRole?: string } | null },
  fallbackAssignedUserId: string | null,
): Promise<void> {
  try {
    if (!reasoning.situationOwner?.entityName) return;

    const ownerName = reasoning.situationOwner.entityName;

    const ownerEntity = await prisma.entity.findFirst({
      where: {
        operatorId,
        displayName: ownerName,
        status: "active",
        entityType: { slug: "team-member" },
      },
      select: { id: true, ownerUserId: true },
    });

    if (!ownerEntity) return;

    let userId: string | null = ownerEntity.ownerUserId ?? null;

    if (!userId) {
      const emailPv = await prisma.propertyValue.findFirst({
        where: {
          entityId: ownerEntity.id,
          property: { identityRole: "email" },
        },
        select: { value: true },
      });
      if (emailPv?.value) {
        const user = await prisma.user.findFirst({
          where: { operatorId, email: emailPv.value.toLowerCase() },
          select: { id: true },
        });
        if (user) userId = user.id;
      }
    }

    if (userId) {
      await prisma.situation.update({
        where: { id: situationId },
        data: { assignedUserId: userId },
      });
    }
  } catch (err) {
    console.error(`[reasoning-engine] Failed to assign situation owner for ${situationId}:`, err);
  }
}


async function checkPlanAutonomyAutoApprove(
  operatorId: string,
  triggerEntityId: string | null,
  planId: string,
  resolvedSteps: StepDefinition[],
  situationTypeName: string,
  situationId: string,
): Promise<void> {
  try {
    if (!triggerEntityId) return;

    // Resolve department AI entity
    const entity = await prisma.entity.findUnique({
      where: { id: triggerEntityId },
      select: { parentDepartmentId: true },
    });
    if (!entity?.parentDepartmentId) return;

    const deptAi = await prisma.entity.findFirst({
      where: { ownerDepartmentId: entity.parentDepartmentId, operatorId, status: "active" },
      select: { id: true },
    });
    if (!deptAi) return;

    const autoApprove = await shouldAutoApprovePlan(deptAi.id, resolvedSteps);
    if (!autoApprove) return;

    // Auto-advance the first awaiting step
    const plan = await prisma.executionPlan.findFirst({
      where: { id: planId },
      include: { steps: { where: { status: "awaiting_approval" }, orderBy: { sequenceOrder: "asc" }, take: 1 } },
    });
    if (!plan?.steps[0]) return;

    const { advanceStep } = await import("@/lib/execution-engine");
    await advanceStep(plan.steps[0].id, "approve", "system");

    // Look up consecutive approvals for the notification
    const { computePlanPatternHash } = await import("@/lib/plan-autonomy");
    const hash = computePlanPatternHash(resolvedSteps);
    const record = await prisma.planAutonomy.findUnique({
      where: { aiEntityId_planPatternHash: { aiEntityId: deptAi.id, planPatternHash: hash } },
    });

    sendNotificationToAdmins({
      operatorId,
      type: "plan_auto_executed",
      title: `Plan auto-executed: ${situationTypeName}`,
      body: `Plan auto-executed based on pattern trust for situation ${situationTypeName}. Pattern approved ${record?.consecutiveApprovals ?? "20+"} times consecutively.`,
      sourceType: "situation",
      sourceId: situationId,
    }).catch(() => {});
  } catch (err) {
    console.error(`[reasoning-engine] Plan autonomy auto-approve failed for ${situationId}:`, err);
  }
}

// ── Workstream Absorption ──────────────────────────────────────────────────

async function absorbSituationIntoWorkStream(
  situationId: string,
  workStreamId: string,
  operatorId: string,
): Promise<void> {
  // Verify workstream exists and belongs to operator
  const ws = await prisma.workStream.findFirst({
    where: { id: workStreamId, operatorId },
    select: { id: true },
  });
  if (!ws) return;

  await prisma.workStreamItem.upsert({
    where: { workStreamId_itemType_itemId: { workStreamId, itemType: "situation", itemId: situationId } },
    create: { workStreamId, itemType: "situation", itemId: situationId },
    update: {},
  });
}

// ── Cycle Record Creation ───────────────────────────────────────────────────

async function createSituationCycle(
  situationId: string,
  situation: { triggerEvidence: string | null; triggerSummary: string | null },
  reasoning: unknown,
  executionPlanId: string | undefined,
): Promise<void> {
  try {
    const cycleCount = await prisma.situationCycle.count({ where: { situationId } });
    await prisma.situationCycle.create({
      data: {
        situationId,
        cycleNumber: cycleCount + 1,
        triggerType: cycleCount === 0 ? "detection" : (situation.triggerEvidence ? (() => {
          try {
            const ev = JSON.parse(situation.triggerEvidence!);
            return ev.type === "response" ? "response_received" : ev.type === "timeout" ? "timeout" : "signal";
          } catch { return "signal"; }
        })() : "signal"),
        triggerSummary: situation.triggerSummary ?? (cycleCount === 0 ? "Situation detected" : "Re-evaluation triggered"),
        triggerData: situation.triggerEvidence ? JSON.parse(situation.triggerEvidence) : undefined,
        reasoning: reasoning as any,
        executionPlanId,
        status: "active",
      },
    });
  } catch (err) {
    console.error("[reasoning-engine] Failed to create SituationCycle record:", err);
  }
}

