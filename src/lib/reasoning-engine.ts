import { prisma } from "@/lib/db";
import { callLLM, getModel, getModelForArchetype, getThinkingBudgetForArchetype, getArchetypeTier } from "@/lib/ai-provider";
import { assembleSituationContext } from "@/lib/context-assembly";
import { evaluateActionPolicies, getEffectiveAutonomy } from "@/lib/policy-evaluator";
import { buildReasoningSystemPrompt, buildReasoningUserPrompt, type ReasoningInput } from "@/lib/reasoning-prompts";
import { getBusinessContext, formatBusinessContext } from "@/lib/business-context";
import { createExecutionPlan, type StepDefinition } from "@/lib/execution-engine";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { ReasoningOutputSchema, type ReasoningOutput } from "@/lib/reasoning-types";
import { captureApiError } from "@/lib/api-error";
import { shouldAutoApprovePlan } from "@/lib/plan-autonomy";
import { extractJSON } from "@/lib/json-helpers";
import { parseCitedSections } from "@/lib/reasoning/citation-parser";
import { generateSituationSummaries } from "@/lib/situation-summarizer";

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
    // 4. Load context
    const context = await assembleSituationContext(
      situation.operatorId,
      situation.situationTypeId,
      situation.triggerEntityId ?? "",
      situation.triggerEventId ?? undefined,
      situationId,
    );

    // 4b. Flag hollow context sections for reasoning quality awareness
    const hollowSections = context.contextSections.filter(s => s.itemCount === 0);
    let missingContextNote: string | undefined;
    if (hollowSections.length >= 3) {
      const hollowNames = hollowSections.map(s => s.section).join(", ");
      missingContextNote = `WARNING: ${hollowSections.length} context sections returned empty (${hollowNames}). This may indicate data sync issues or embedding failures. Reason with reduced confidence.`;
    }

    // 5. Resolve governance
    // Get trigger entity type slug
    let triggerEntityTypeSlug = "unknown";
    if (situation.triggerEntityId) {
      const entity = await prisma.entity.findUnique({
        where: { id: situation.triggerEntityId },
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
      const triggerEntity = await prisma.entity.findUnique({
        where: { id: situation.triggerEntityId },
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

    const reasoningInput: ReasoningInput = {
      situationType: {
        name: situation.situationType.name,
        description: situation.situationType.description,
        autonomyLevel: effectiveAutonomy,
      },
      severity: situation.severity,
      confidence: situation.confidence,
      triggerEntity: {
        displayName: context.triggerEntity.displayName,
        type: context.triggerEntity.type,
        category: context.triggerEntity.category,
        properties: context.triggerEntity.properties,
      },
      departments: context.departments,
      departmentKnowledge: context.departmentKnowledge,
      relatedEntities: context.relatedEntities,
      recentEvents: context.recentEvents.map((e) => ({
        type: e.eventType,
        timestamp: e.createdAt,
        payload: e.payload,
      })),
      priorSituations: await enrichPriorSituations(context.priorSituations),
      autonomyLevel: effectiveAutonomy,
      permittedActions: policyResult.permitted,
      blockedActions: policyResult.blocked,
      businessContext: businessContextStr,
      activityTimeline: context.activityTimeline,
      communicationContext: context.communicationContext,
      crossDepartmentSignals: context.crossDepartmentSignals,
      connectorCapabilities: context.connectorCapabilities,
      workStreamContexts: context.workStreamContexts,
      delegationSource: context.delegationSource,
      operationalInsights: context.operationalInsights,
      actionCycles: context.actionCycles,
    };

    // 6a. Compute edit instruction and prior feedback (needed by both paths)
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

    // 6b. Route: single-pass vs multi-agent based on context complexity
    const { shouldUseMultiAgent, runMultiAgentReasoning } = await import("@/lib/multi-agent-reasoning");

    if (shouldUseMultiAgent(context.contextSections)) {
      console.log(`[reasoning-engine] Multi-agent path activated for situation ${situationId} (${context.contextSections.reduce((s, c) => s + c.tokenEstimate, 0)} estimated tokens)`);

      const maStartTime = performance.now();
      const maModelString = getModel("multiAgentCoordinator");
      const multiAgentResult = await runMultiAgentReasoning(
        reasoningInput,
        context.contextSections,
        operator?.companyName ?? undefined,
        editInstructionText,
        priorFeedbackLines,
      );

      let reasoning = multiAgentResult.coordinatorReasoning;

      // Post-reasoning policy verification (same as single-pass)
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

      // Resolve actionCapabilityName → actionCapabilityId for action steps
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
          resolvedSteps.push({
            title: step.title,
            description: step.description,
            executionMode: step.executionMode,
            actionCapabilityId,
            assignedUserId: step.assignedUserId || situation.assignedUserId || undefined,
            inputContext: step.params ? { params: step.params } : undefined,
          });
        }
      }

      // Store reasoning with multi-agent metadata + model tracking
      const maDurationMs = Math.round(performance.now() - maStartTime);
      const maPlanTracking = { modelId: maModelString, promptVersion: REASONING_PROMPT_VERSION };
      const updates: Record<string, unknown> = {
        reasoning: JSON.stringify({
          ...reasoning,
          _multiAgent: {
            routingReason: multiAgentResult.routingReason,
            specialistFindings: multiAgentResult.findings,
          },
        }),
        modelId: maModelString,
        promptVersion: REASONING_PROMPT_VERSION,
        reasoningDurationMs: maDurationMs,
        apiCostCents: multiAgentResult.totalApiCostCents,
      };

      // Store proposedAction as the full plan for backward-compatible UI display
      if (reasoning.actionPlan) {
        updates.proposedAction = JSON.stringify(reasoning.actionPlan);
      }

      // Advance status
      if (reasoning.actionPlan === null || !resolvedSteps) {
        updates.status = "proposed";
      } else if (effectiveAutonomy === "supervised") {
        const planId = await createExecutionPlan(situation.operatorId, "situation", situationId, resolvedSteps, maPlanTracking);
        updates.executionPlanId = planId;
        updates.status = "proposed";
      } else if (effectiveAutonomy === "notify") {
        const planId = await createExecutionPlan(situation.operatorId, "situation", situationId, resolvedSteps, maPlanTracking);
        updates.executionPlanId = planId;
        updates.status = "executing";
      } else {
        // autonomous
        const planId = await createExecutionPlan(situation.operatorId, "situation", situationId, resolvedSteps, maPlanTracking);
        updates.executionPlanId = planId;
        updates.status = "executing";
      }

      // Fold situationTitle into the main update
      if (reasoning.situationTitle) {
        updates.triggerSummary = reasoning.situationTitle;
      }

      await prisma.situation.update({
        where: { id: situationId },
        data: updates,
      });

      await createSituationCycle(situationId, situation, reasoning, updates.executionPlanId as string | undefined);

      // Generate Haiku summaries (fire-and-forget — non-blocking)
      generateSituationSummaries(situationId).catch(err =>
        console.error(`[reasoning-engine] Summary generation failed for ${situationId}:`, err)
      );

      // Workstream absorption: link situation to related workstream
      if (reasoning.relatedWorkStreamId) {
        absorbSituationIntoWorkStream(situationId, reasoning.relatedWorkStreamId, situation.operatorId).catch(err =>
          console.error(`[reasoning-engine] Workstream absorption failed for ${situationId}:`, err),
        );
      }

      // For notify/autonomous: auto-advance the first step
      if (resolvedSteps && (effectiveAutonomy === "notify" || effectiveAutonomy === "autonomous")) {
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
      } else if (effectiveAutonomy === "supervised") {
        sendNotificationToAdmins({
          operatorId: situation.operatorId,
          type: "situation_proposed",
          title: `Plan proposed: ${situation.situationType.name}`,
          body: `AI proposes a ${resolvedSteps.length}-step plan: ${resolvedSteps.map(s => s.title).join(" → ")}`,
          sourceType: "situation",
          sourceId: situationId,
        }).catch(() => {});
      } else if (effectiveAutonomy === "notify") {
        sendNotificationToAdmins({
          operatorId: situation.operatorId,
          type: "situation_proposed",
          title: `Auto-executing: ${situation.situationType.name}`,
          body: `AI is executing a ${resolvedSteps.length}-step plan. Review and reverse if needed.`,
          sourceType: "situation",
          sourceId: situationId,
        }).catch(() => {});
      }
      // autonomous: no notification (by design)

      // Handle escalation
      if (reasoning.escalation) {
        const triggerEntity = situation.triggerEntityId
          ? await prisma.entity.findUnique({ where: { id: situation.triggerEntityId }, select: { parentDepartmentId: true } })
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

      return; // multi-agent path complete
    }

    // 6c. Single-pass: build prompt with edit instruction and prior feedback
    const systemPrompt = buildReasoningSystemPrompt(businessContextStr, operator?.companyName ?? undefined);
    let userPrompt = buildReasoningUserPrompt(reasoningInput);

    if (missingContextNote) {
      userPrompt += `\n\nDATA QUALITY NOTICE:\n${missingContextNote}`;
    }

    if (editInstructionText) {
      userPrompt += `\n\nEDIT REQUEST:\n${editInstructionText}\n\nRevise your actionPlan to incorporate this feedback. Keep the same situation analysis but adjust the plan steps and justification accordingly.`;
    }

    if (priorFeedbackLines) {
      userPrompt += `\n\nHUMAN FEEDBACK ON SIMILAR SITUATIONS:\n${priorFeedbackLines.join("\n")}\nIncorporate this feedback into your reasoning.`;
    }

    // 7. Call LLM
    const reasoningStartTime = performance.now();
    const archetypeSlug = situation.situationType.archetypeSlug ?? null;
    const modelString = getModelForArchetype(archetypeSlug);
    const thinkingBudget = getThinkingBudgetForArchetype(archetypeSlug);
    console.log(`[reasoning-engine] Situation ${situationId} reasoned with tier=${getArchetypeTier(archetypeSlug)} model=${modelString}`);
    let reasoning: ReasoningOutput | null = null;
    let rawResponse = "";
    let parseError = "";
    let reasoningApiCostCents = 0;

    for (let attempt = 0; attempt < 2; attempt++) {
      const userContent = attempt === 0
        ? userPrompt
        : `${userPrompt}\n\nPREVIOUS ATTEMPT FAILED VALIDATION: ${parseError}\nPlease fix the JSON output to match the required schema exactly.`;

      try {
        const response = await callLLM({
          instructions: systemPrompt,
          messages: [{ role: "user", content: userContent }],
          temperature: 0.2,
          maxTokens: 32768,
          aiFunction: "reasoning",
          model: modelString,
          operatorId: situation.operatorId,
          thinking: thinkingBudget !== null,
          thinkingBudget: thinkingBudget ?? undefined,
        });
        rawResponse = response.text;
        reasoningApiCostCents += response.apiCostCents;

        // 8. Validate response
        const parsed = extractJSON(rawResponse);
        if (!parsed) {
          parseError = "Could not parse JSON from response";
          if (attempt === 0) continue;
          break;
        }

        const result = ReasoningOutputSchema.safeParse(parsed);
        if (!result.success) {
          parseError = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
          if (attempt === 0) continue;
          break;
        }

        reasoning = result.data;

        // Label web sources if present
        if (response.webSources && response.webSources.length > 0) {
          reasoning = {
            ...reasoning,
            analysis: reasoning.analysis + "\n\n[External web sources were consulted.]",
            webSources: response.webSources.map(s => s.url),
          };
        }

        break;
      } catch (err) {
        console.error(`[reasoning-engine] LLM call failed for situation ${situationId}:`, err);
        // Leave at detected status for retry
        await prisma.situation.update({
          where: { id: situationId },
          data: { status: "detected" },
        });
        return;
      }
    }

    // If validation failed after both attempts
    if (!reasoning) {
      console.warn(`[reasoning-engine] Validation failed for situation ${situationId}: ${parseError}`);
      await prisma.situation.update({
        where: { id: situationId },
        data: {
          status: "detected",
          reasoning: JSON.stringify({ raw: rawResponse, parseError }),
        },
      });
      return;
    }

    // 8b. Post-reasoning policy verification — catch LLM ignoring BLOCKED instructions
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
        resolvedSteps.push({
          title: step.title,
          description: step.description,
          executionMode: step.executionMode,
          actionCapabilityId,
          assignedUserId: step.assignedUserId || situation.assignedUserId || undefined,
          inputContext: step.params ? { params: step.params } : undefined,
        });
      }
    }

    // 10. Store reasoning + model tracking
    const reasoningDurationMs = Math.round(performance.now() - reasoningStartTime);
    const planTracking = { modelId: modelString, promptVersion: REASONING_PROMPT_VERSION };

    // Parse cited context sections from reasoning text
    const citedSections = parseCitedSections(rawResponse);
    const contextMeta = context.contextSections.map((s) => ({
      ...s,
      citedInReasoning: citedSections.includes(s.section),
    }));

    const updates: Record<string, unknown> = {
      reasoning: JSON.stringify(reasoning),
      modelId: modelString,
      promptVersion: REASONING_PROMPT_VERSION,
      reasoningDurationMs,
      apiCostCents: reasoningApiCostCents,
      contextSnapshot: JSON.stringify({
        ...(() => { try { return situation.contextSnapshot ? JSON.parse(situation.contextSnapshot as string) : {}; } catch { return {}; } })(),
        contextMeta,
      }),
    };

    // Store proposedAction as the full plan for backward-compatible UI display
    if (reasoning.actionPlan) {
      updates.proposedAction = JSON.stringify(reasoning.actionPlan);
    }

    // 11. Advance status
    if (reasoning.actionPlan === null || !resolvedSteps) {
      updates.status = "proposed";
    } else if (effectiveAutonomy === "autonomous") {
      // Autonomous: auto-execute without approval
      const planId = await createExecutionPlan(situation.operatorId, "situation", situationId, resolvedSteps, planTracking);
      updates.executionPlanId = planId;
      updates.status = "executing";
      await prisma.situationType.update({
        where: { id: situation.situationTypeId },
        data: { confirmedCount: { increment: 1 } },
      }).catch(() => {});
    } else {
      // Propose: create plan, await human approval (supervised + notify both land here)
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

    await createSituationCycle(situationId, situation, reasoning, updates.executionPlanId as string | undefined);

    // Generate Haiku summaries (fire-and-forget — non-blocking)
    generateSituationSummaries(situationId).catch(err =>
      console.error(`[reasoning-engine] Summary generation failed for ${situationId}:`, err)
    );

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
      // Propose: notify admins of proposed plan (supervised + notify both land here)
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
        ? await prisma.entity.findUnique({ where: { id: situation.triggerEntityId }, select: { parentDepartmentId: true } })
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

// ── Helpers ──────────────────────────────────────────────────────────────────

async function enrichPriorSituations(
  priors: Array<{ id: string; outcome: string | null; feedback: string | null; actionTaken: unknown; createdAt: string }>,
) {
  if (priors.length === 0) return [];

  // Fetch reasoning field for prior situations to extract analysis
  const priorRecords = await prisma.situation.findMany({
    where: { id: { in: priors.map((p) => p.id) } },
    select: { id: true, reasoning: true },
  });
  const reasoningMap = new Map(priorRecords.map((r) => [r.id, r.reasoning]));

  return priors.map((p) => {
    let analysis: string | undefined;
    const raw = reasoningMap.get(p.id);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.analysis === "string") analysis = parsed.analysis;
      } catch {}
    }
    return {
      analysis,
      outcome: p.outcome ?? undefined,
      feedback: p.feedback ?? undefined,
      actionTaken: p.actionTaken,
      createdAt: p.createdAt,
    };
  });
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

