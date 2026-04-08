import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runAgenticLoop } from "@/lib/agentic-loop";
import { loadOperationalInsights } from "@/lib/context-assembly";
import { evaluateActionPolicies, getEffectiveAutonomy } from "@/lib/policy-evaluator";
import { buildAgenticSystemPrompt, buildAgenticSeedContext, type AgenticSeedInput } from "@/lib/reasoning-prompts";
import { getBusinessContext, formatBusinessContext } from "@/lib/business-context";
import { createExecutionPlan, type StepDefinition } from "@/lib/execution-engine";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { ReasoningOutputSchema, DeepReasoningOutputSchema, type ReasoningOutput, type DeepReasoningOutput } from "@/lib/reasoning-types";
import { captureApiError } from "@/lib/api-error";
import { shouldAutoApprovePlan } from "@/lib/plan-autonomy";
import { generateSituationSummaries } from "@/lib/situation-summarizer";
import { refineUncertainties } from "@/lib/reasoning/uncertainty-refiner";
import { REASONING_TOOLS, executeReasoningTool } from "@/lib/reasoning-tools";
import { getConnectorReadTools, executeConnectorReadTool } from "@/lib/connector-read-tools";
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

  // Skip reasoning for awareness situations — they're resolved at detection time
  if (situation.situationType?.slug?.startsWith("awareness-")) {
    console.log(`[reasoning-engine] Skipping reasoning for awareness situation ${situationId} (type: ${situation.situationType.slug})`);
    if (situation.status === "detected") {
      await prisma.situation.update({
        where: { id: situationId },
        data: { status: "resolved", resolvedAt: new Date() },
      });
    }
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
        select: { primaryDomainId: true },
      });

      if (triggerEntity?.primaryDomainId) {
        const scopedUsers = await prisma.userScope.findMany({
          where: { domainEntityId: triggerEntity.primaryDomainId },
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
        operatorId: situation.operatorId,
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
        select: { primaryDomainId: true },
      });
      triggerDepartmentId = te?.primaryDomainId ?? null;
      if (triggerDepartmentId) {
        const deptAi = await prisma.entity.findFirst({
          where: { ownerDomainId: triggerDepartmentId, operatorId: situation.operatorId, status: "active" },
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
            undefined,
            situation.triggerSummary ?? (situation.triggerEvidence as { summary?: string } | null)?.summary ?? "",
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

    // 6c-i. Load top relevant evidence claims for seed context
    let evidenceClaims: Array<{ claim: string; type: string; confidence: number; source: string }> = [];
    try {
      const searchQuery = situation.triggerSummary
        ?? (situation.triggerEvidence as { summary?: string } | null)?.summary
        ?? "";

      if (searchQuery.length > 10) {
        const escaped = searchQuery.replace(/[%_\\]/g, "\\$&");
        const keywords = `%${escaped.split(" ").slice(0, 3).join("%")}%`;
        const results = await prisma.$queryRaw<Array<{
          extractions: unknown;
          sourceType: string;
        }>>`
          SELECT extractions, "sourceType"
          FROM "EvidenceExtraction"
          WHERE "operatorId" = ${situation.operatorId}
            AND extractions::text ILIKE ${keywords}
          ORDER BY "extractedAt" DESC
          LIMIT 5
        `;

        const allClaims: Array<{ claim: string; type: string; confidence: number; source: string }> = [];
        for (const result of results) {
          const exts = Array.isArray(result.extractions) ? result.extractions : [];
          for (const ext of exts as Array<{ claim?: string; type?: string; confidence?: number }>) {
            if (ext.claim && typeof ext.confidence === "number" && ext.confidence >= 0.6) {
              allClaims.push({
                claim: ext.claim,
                type: ext.type ?? "fact",
                confidence: ext.confidence,
                source: result.sourceType,
              });
            }
          }
        }
        evidenceClaims = allClaims
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 10);
      }
    } catch (err) {
      console.warn("[reasoning-engine] Evidence claim loading failed:", err);
    }

    // 6c-ii. Discover available system expertise for seed context
    let systemExpertiseIndex: Array<{
      slug: string; title: string; pageType: string; confidence: number; contentPreview: string;
    }> = [];
    try {
      const { discoverSystemExpertise } = await import("@/lib/wiki-discovery");
      const searchQuery = [
        situation.situationType.name,
        situation.situationType.description?.slice(0, 200) ?? "",
        situation.triggerSummary ?? "",
      ].filter(Boolean).join(" ");
      systemExpertiseIndex = await discoverSystemExpertise(situation.operatorId, searchQuery, 15);
    } catch (err) {
      console.warn("[reasoning-engine] System expertise discovery failed:", err);
    }

    // 6c. Build system prompt and seed context
    const depth = situation.investigationDepth ?? "standard";
    const softBudget = depth === "thorough" ? 50 : 20;
    const hardBudget = depth === "thorough" ? 80 : 25;
    const systemPrompt = buildAgenticSystemPrompt(businessContextStr, operator?.companyName ?? undefined, connectorToolNames, depth);

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
      evidenceClaims,
      systemExpertiseIndex,
    };
    const seedContext = buildAgenticSeedContext(seedInput);

    // 6d. Record context sections for telemetry
    const contextSections: Array<{
      type: string;
      id: string;
      slug?: string;
      pageType?: string;
      tokenCount: number;
    }> = [];
    for (const page of wikiPages) {
      contextSections.push({
        type: "wiki_page",
        id: page.slug,
        slug: page.slug,
        pageType: page.pageType,
        tokenCount: Math.ceil(page.content.length / 4),
      });
    }
    if (evidenceClaims.length > 0) {
      contextSections.push({
        type: "evidence_claims",
        id: "evidence_batch",
        tokenCount: evidenceClaims.reduce((n, c) => n + Math.ceil(c.claim.length / 4), 0),
      });
    }
    const contextEval = await prisma.contextEvaluation.create({
      data: {
        operatorId: situation.operatorId,
        situationId,
        contextSections: contextSections as Prisma.InputJsonValue,
        citedSections: [] as Prisma.InputJsonValue,
      },
      select: { id: true },
    }).catch(err => {
      console.warn("[reasoning-engine] Context eval creation failed:", err);
      return null;
    });

    // 7. Run agentic reasoning loop
    const agenticResult = await runAgenticLoop({
      operatorId: situation.operatorId,
      contextId: situationId,
      contextType: "situation",
      cycleNumber,
      systemPrompt,
      seedContext,
      tools: allTools,
      dispatchTool,
      outputSchema: depth === "thorough" ? DeepReasoningOutputSchema : ReasoningOutputSchema,
      softBudget,
      hardBudget,
      editInstruction: editInstructionText,
      priorFeedbackLines,
    });
    let reasoning = agenticResult.output as DeepReasoningOutput;
    const reasoningApiCostCents = agenticResult.apiCostCents;
    const modelString = agenticResult.modelId;
    const reasoningDurationMs = agenticResult.durationMs;

    console.log(`[reasoning-engine] Agentic reasoning complete for situation ${situationId} (${depth}): ${reasoningDurationMs}ms, $${(reasoningApiCostCents / 100).toFixed(2)}`);

    // Parse which context sections were cited in reasoning output
    if (contextEval) {
      try {
        const fullText = [reasoning.analysis ?? "", reasoning.evidenceSummary ?? ""].join(" ");
        const citedSections: Array<{ type: string; id: string; citationCount: number }> = [];

        for (const page of wikiPages) {
          const slugRegex = new RegExp(page.slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
          const titleWords = page.title.split(/\s+/).filter(w => w.length > 3).slice(0, 3);
          const titleRegex = titleWords.length > 0
            ? new RegExp(titleWords.join(".*"), "gi")
            : null;
          const total = (fullText.match(slugRegex) ?? []).length
            + (titleRegex ? (fullText.match(titleRegex) ?? []).length : 0);
          if (total > 0) {
            citedSections.push({ type: "wiki_page", id: page.slug, citationCount: total });
          }
        }

        if (evidenceClaims.length > 0) {
          let evidenceCitations = 0;
          for (const claim of evidenceClaims) {
            const fragment = claim.claim.split(/\s+/).slice(0, 5).join(" ");
            if (fullText.toLowerCase().includes(fragment.toLowerCase())) {
              evidenceCitations++;
            }
          }
          if (evidenceCitations > 0) {
            citedSections.push({ type: "evidence_claims", id: "evidence_batch", citationCount: evidenceCitations });
          }
        }

        await prisma.contextEvaluation.update({
          where: { id: contextEval.id },
          data: { citedSections: citedSections as Prisma.InputJsonValue },
        });
      } catch (err) {
        console.warn("[reasoning-engine] Context citation parsing failed:", err);
      }
    }

    // Depth upgrade: if standard investigation discovers complexity, re-run as thorough
    if (reasoning.depthUpgrade && depth === "standard") {
      await prisma.situation.update({
        where: { id: situationId },
        data: {
          investigationDepth: "thorough",
          status: "detected",
          apiCostCents: reasoningApiCostCents,
        },
      });
      console.log(`[reasoning-engine] Situation ${situationId} upgraded to thorough investigation (standard run cost: ${reasoningApiCostCents}c)`);
      return reasonAboutSituation(situationId);
    }

    // 8. Post-reasoning policy verification — catch LLM ignoring BLOCKED instructions
    if (reasoning.actionBatch) {
      const actionSteps = reasoning.actionBatch.filter(s => s.executionMode === "action");
      for (const step of actionSteps) {
        if (step.actionCapabilityName) {
          const isPermitted = policyResult.permitted.some(p => p.name === step.actionCapabilityName);
          const isBlocked = policyResult.blocked.some(b => b.name === step.actionCapabilityName);
          if (!isPermitted || isBlocked) {
            console.warn(`[reasoning-engine] AI proposed blocked action "${step.actionCapabilityName}" in plan for situation ${situationId}. Nullifying plan.`);
            reasoning = {
              ...reasoning,
              actionBatch: null,
              analysis: reasoning.analysis + `\n\n[SYSTEM: Plan nullified — step "${step.title}" uses blocked action "${step.actionCapabilityName}".]`,
            };
            break;
          }
        }
      }
    }

    // 9. Resolve actionCapabilityName → actionCapabilityId for action steps
    let resolvedSteps: StepDefinition[] | null = null;
    if (reasoning.actionBatch) {
      resolvedSteps = [];
      for (const step of reasoning.actionBatch) {
        let actionCapabilityId: string | undefined;
        if (step.executionMode === "action" && step.actionCapabilityName) {
          const cap = await prisma.actionCapability.findFirst({
            where: { operatorId: situation.operatorId, name: step.actionCapabilityName, enabled: true },
          });
          if (!cap) {
            console.warn(`[reasoning-engine] ActionCapability "${step.actionCapabilityName}" not found. Nullifying plan.`);
            reasoning = { ...reasoning, actionBatch: null };
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
    if (resolvedSteps && reasoning.actionBatch) {
      const hasUncertainties = reasoning.actionBatch.some(s => s.uncertainties && s.uncertainties.length > 0);
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
            reasoning.actionBatch,
            reasoning.evidenceSummary ?? "",
            undefined, // agentic model already investigated communications
            triggerEvidenceStr,
            situation.operatorId,
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

          const totalFlagged = reasoning.actionBatch.reduce((n, s) => n + (s.uncertainties?.length ?? 0), 0);
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

    // Accumulate cost from prior depth upgrade run (if any)
    const priorCostCents = situation.apiCostCents ?? 0;

    const updates: Record<string, unknown> = {
      reasoning: JSON.stringify(reasoning),
      modelId: modelString,
      promptVersion: REASONING_PROMPT_VERSION,
      reasoningDurationMs,
      apiCostCents: reasoningApiCostCents + priorCostCents,
      contextSnapshot: JSON.stringify({ agenticReasoning: true, toolCallCount: "see ToolCallTrace" }),
    };

    // Store analysis document for thorough investigations
    if (depth === "thorough" && reasoning.analysisDocument) {
      updates.analysisDocument = reasoning.analysisDocument;
    }

    // Store proposedAction with batch + afterBatch metadata
    if (reasoning.actionBatch) {
      updates.proposedAction = JSON.stringify({
        batch: reasoning.actionBatch,
        afterBatch: reasoning.afterBatch ?? "resolve",
        reEvaluationReason: reasoning.reEvaluationReason,
        monitorDurationHours: reasoning.monitorDurationHours,
      });
    }

    // Store afterBatch on Situation for easy querying
    if (reasoning.afterBatch === "monitor" && reasoning.monitorDurationHours) {
      updates.afterBatch = "monitor";
      updates.monitorUntil = new Date(Date.now() + reasoning.monitorDurationHours * 3600000);
    } else {
      updates.afterBatch = reasoning.afterBatch ?? "resolve";
    }

    // 11. Advance status
    if (reasoning.actionBatch === null || !resolvedSteps) {
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
          where: { operatorId: situation.operatorId, id: { in: chunkIds } },
          data: { wikiProcessedAt: new Date() },
        }).catch(() => {});
      }
      if (signalIds.length > 0) {
        prisma.activitySignal.updateMany({
          where: { operatorId: situation.operatorId, id: { in: signalIds } },
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
    if (reasoning.actionBatch === null || !resolvedSteps) {
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
        ? await prisma.entity.findFirst({ where: { id: situation.triggerEntityId, operatorId: situation.operatorId }, select: { primaryDomainId: true } })
        : null;

      if (triggerEntity?.primaryDomainId) {
        const deptAi = await prisma.entity.findFirst({
          where: { ownerDomainId: triggerEntity.primaryDomainId, operatorId: situation.operatorId },
          select: { id: true },
        });

          if (deptAi) {
          await prisma.initiative.create({
            data: {
              operatorId: situation.operatorId,
              aiEntityId: deptAi.id,
              proposalType: "general",
              triggerSummary: `Escalated from situation: ${situation.situationType?.name ?? situationId}`,
              evidence: [{ source: "situation_escalation", claim: reasoning.escalation.rationale }],
              proposal: { type: "escalation", description: reasoning.escalation.rationale, sourceSituationId: situationId },
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
      select: { primaryDomainId: true },
    });
    if (!entity?.primaryDomainId) return;

    const deptAi = await prisma.entity.findFirst({
      where: { ownerDomainId: entity.primaryDomainId, operatorId, status: "active" },
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
        reasoning: {
          ...(reasoning as Record<string, unknown>),
          afterBatch: (reasoning as Record<string, unknown>).afterBatch ?? "resolve",
          reEvaluationReason: (reasoning as Record<string, unknown>).reEvaluationReason,
          monitorDurationHours: (reasoning as Record<string, unknown>).monitorDurationHours,
        } as any,
        executionPlanId,
        status: "active",
      },
    });
  } catch (err) {
    console.error("[reasoning-engine] Failed to create SituationCycle record:", err);
  }
}

