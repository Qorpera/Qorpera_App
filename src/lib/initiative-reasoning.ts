import { prisma } from "@/lib/db";
import { runAgenticLoop } from "@/lib/agentic-loop";
import { getBusinessContext, formatBusinessContext } from "@/lib/business-context";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { InitiativeReasoningOutputSchema, type InitiativeReasoningOutput } from "@/lib/reasoning-types";
import { captureApiError } from "@/lib/api-error";
import { REASONING_TOOLS, executeReasoningTool } from "@/lib/reasoning-tools";
import { getConnectorReadTools, executeConnectorReadTool } from "@/lib/connector-read-tools";
import { processWikiUpdates, updatePageWithLock, type WikiUpdate } from "@/lib/wiki-engine";
import { PAGE_SCHEMAS } from "@/lib/wiki/page-schemas";
import {
  buildInitiativeSystemPrompt,
  buildInitiativeSeedContext,
  type InitiativeSeedInput,
} from "@/lib/initiative-reasoning-prompts";

/** Increment when the initiative reasoning prompt changes meaningfully. */
export const INITIATIVE_REASONING_PROMPT_VERSION = 1;

// Maps scanner proposal_type → the pageType that the primary deliverable would target
// Used to load the right template for the LLM's context.
function resolveTargetPageType(proposalType: string): string | null {
  switch (proposalType) {
    case "process_creation": return "process";
    case "project_creation": return "project";
    case "system_job_creation": return "system_job";
    case "wiki_update": return null;
    case "strategy_revision": return null;
    case "general":
    default: return null;
  }
}

export async function reasonAboutInitiative(
  operatorId: string,
  pageSlug: string,
): Promise<void> {
  // 1. Load the initiative page
  const initiativePage = await prisma.knowledgePage.findFirst({
    where: {
      operatorId,
      slug: pageSlug,
      pageType: "initiative",
      scope: "operator",
    },
    select: { slug: true, title: true, content: true, properties: true },
  });

  if (!initiativePage) {
    console.warn(`[initiative-reasoning] Page ${pageSlug} not found`);
    return;
  }

  const props = (initiativePage.properties ?? {}) as Record<string, unknown>;
  const currentStatus = props.status as string | undefined;
  const detectionSource = (props.source as string) ?? "unknown";
  const proposalType = (props.proposal_type as string) ?? "general";
  const severity = props.severity as string | undefined;
  const domainSlug = props.domain as string | undefined;
  const ownerSlug = props.owner as string | undefined;
  const evidence = props.evidence as Array<{ pageSlug?: string }> | undefined;
  const editInstruction = props.edit_instruction as string | undefined;

  // 2. Status guard
  if (currentStatus !== "detected") {
    console.log(`[initiative-reasoning] ${pageSlug} status is ${currentStatus}, skipping`);
    return;
  }

  // 3. Acquire lock by transitioning to "reasoning"
  let lockAcquired = false;
  try {
    await updatePageWithLock(operatorId, pageSlug, (p) => {
      const pp = (p.properties ?? {}) as Record<string, unknown>;
      if (pp.status !== "detected") return {};
      lockAcquired = true;
      return { properties: { ...pp, status: "reasoning" } };
    });
  } catch {
    return;
  }
  if (!lockAcquired) return;

  try {
    // 4. Load context in parallel
    const evidenceSlugs = (evidence ?? [])
      .map(e => e?.pageSlug)
      .filter((s): s is string => typeof s === "string")
      .slice(0, 5);

    const hubSlugs: string[] = [];
    const hubRoles: Record<string, string> = {};
    if (domainSlug) { hubSlugs.push(domainSlug); hubRoles[domainSlug] = "domain_hub"; }
    if (ownerSlug) { hubSlugs.push(ownerSlug); hubRoles[ownerSlug] = "owner"; }
    for (const s of evidenceSlugs) {
      if (!hubRoles[s]) { hubSlugs.push(s); hubRoles[s] = "evidence_reference"; }
    }

    const [
      hubPageResults,
      capabilities,
      businessCtx,
      operator,
      existingInitiatives,
      priorDismissed,
    ] = await Promise.all([
      hubSlugs.length > 0
        ? prisma.knowledgePage.findMany({
            where: { operatorId, slug: { in: hubSlugs }, scope: "operator" },
            select: { slug: true, title: true, content: true, pageType: true },
          })
        : Promise.resolve([]),
      prisma.actionCapability.findMany({
        where: { operatorId, enabled: true },
        select: { name: true, description: true },
      }),
      getBusinessContext(operatorId),
      prisma.operator.findUnique({
        where: { id: operatorId },
        select: { companyName: true },
      }),
      // Existing initiatives (excluding self and detected ones)
      prisma.knowledgePage.findMany({
        where: {
          operatorId,
          pageType: "initiative",
          scope: "operator",
          slug: { not: pageSlug },
        },
        select: { slug: true, title: true, properties: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      // Prior dismissed of same proposal_type
      prisma.knowledgePage.findMany({
        where: {
          operatorId,
          pageType: "initiative",
          scope: "operator",
          slug: { not: pageSlug },
          AND: [
            { properties: { path: ["status"], equals: "dismissed" } },
            { properties: { path: ["proposal_type"], equals: proposalType } },
          ],
        },
        select: { title: true, properties: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    // Assemble hub pages with roles
    const hubPages: InitiativeSeedInput["hubPages"] = [];
    for (const p of hubPageResults) {
      const role = hubRoles[p.slug];
      if (!role) continue;
      hubPages.push({ slug: p.slug, title: p.title, pageType: p.pageType, content: p.content, role });
    }

    // Filter existing initiatives to those with visible statuses (not "detected")
    const existingInitiativeTitles = existingInitiatives
      .map(p => {
        const pp = (p.properties ?? {}) as Record<string, unknown>;
        return { slug: p.slug, title: p.title, status: (pp.status as string) ?? "unknown" };
      })
      .filter(i => i.status !== "detected");

    const priorDismissedInitiatives = priorDismissed.map(p => {
      const pp = (p.properties ?? {}) as Record<string, unknown>;
      return {
        title: p.title,
        dismissalReason: (pp.dismissal_reason as string) ?? "no reason recorded",
      };
    });

    // Resolve target page type template
    const targetPageType = resolveTargetPageType(proposalType);
    const targetPageTypeTemplate = targetPageType ? (PAGE_SCHEMAS[targetPageType] ?? null) : null;

    // System expertise discovery (best-effort)
    let systemExpertiseIndex: InitiativeSeedInput["systemExpertiseIndex"] = [];
    try {
      const { discoverSystemExpertise } = await import("@/lib/wiki-discovery");
      const query = [initiativePage.title, proposalType].filter(Boolean).join(" ");
      systemExpertiseIndex = await discoverSystemExpertise(operatorId, query, 10);
    } catch (err) {
      console.warn("[initiative-reasoning] System expertise discovery failed:", err);
    }

    const businessContextStr = businessCtx ? formatBusinessContext(businessCtx) : null;

    // 5. Build tools + dispatcher
    const { tools: connectorTools, availableToolNames: connectorToolNames } =
      await getConnectorReadTools(operatorId);
    const allTools = [...REASONING_TOOLS, ...connectorTools];

    const dispatchTool = async (toolName: string, args: Record<string, unknown>): Promise<string> => {
      if (connectorToolNames.has(toolName)) {
        return executeConnectorReadTool(operatorId, toolName, args);
      }
      return executeReasoningTool(operatorId, toolName, args);
    };

    // 6. Build prompts
    const systemPrompt = buildInitiativeSystemPrompt(
      businessContextStr,
      operator?.companyName ?? undefined,
      connectorToolNames,
    );

    const seedInput: InitiativeSeedInput = {
      initiativeSlug: initiativePage.slug,
      initiativeTitle: initiativePage.title,
      initiativePageContent: initiativePage.content,
      detectionSource,
      proposalType,
      severity,
      hubPages,
      existingInitiativeTitles,
      priorDismissedInitiatives,
      businessContext: businessContextStr,
      companyName: operator?.companyName ?? undefined,
      availableCapabilities: capabilities.map(c => ({ name: c.name, description: c.description })),
      targetPageTypeTemplate,
      systemExpertiseIndex,
      editInstruction: editInstruction ?? null,
    };

    const seedContext = buildInitiativeSeedContext(seedInput);

    // 7. Run the agentic loop (Opus, bounded budget)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outputSchema = InitiativeReasoningOutputSchema as any;

    const agenticResult = await runAgenticLoop({
      operatorId,
      contextId: pageSlug,
      contextType: "initiative",
      cycleNumber: 1,
      systemPrompt,
      seedContext,
      tools: allTools,
      dispatchTool,
      outputSchema,
      softBudget: 15,
      hardBudget: 20,
      editInstruction: editInstruction ?? null,
    });

    const reasoning = agenticResult.output as InitiativeReasoningOutput;
    console.log(
      `[initiative-reasoning] ${pageSlug}: ${agenticResult.durationMs}ms, $${(agenticResult.apiCostCents / 100).toFixed(2)}, isValuable=${reasoning.isValuable}`
    );

    // 8. Validate output
    if (!reasoning.isValuable && !reasoning.dismissalReason) {
      console.warn(`[initiative-reasoning] ${pageSlug}: dismissed without reason, using fallback`);
    }

    const finalStatus = reasoning.isValuable ? "proposed" : "dismissed";
    const updatedTitle = reasoning.initiativeTitle ?? initiativePage.title;

    // ── Phase 2: Content generation (only for valuable initiatives) ──────────────
    let contentGenCostCents = 0;
    let contentGenModelId = "";
    let contentGenerationFailed = false;
    let contentGenerationError: string | null = null;

    if (reasoning.isValuable && reasoning.primaryDeliverable) {
      try {
        // For wiki_update: load current target page content
        let targetCurrent: { content: string; properties: Record<string, unknown> | null } | null = null;
        if (
          reasoning.primaryDeliverable.type === "wiki_update" &&
          reasoning.primaryDeliverable.targetPageSlug
        ) {
          const targetPage = await prisma.knowledgePage.findFirst({
            where: {
              operatorId,
              slug: reasoning.primaryDeliverable.targetPageSlug,
              scope: "operator",
            },
            select: { content: true, properties: true },
          });
          if (targetPage) {
            targetCurrent = {
              content: targetPage.content,
              properties: targetPage.properties as Record<string, unknown> | null,
            };
          }
        }

        const { buildContentGenerationPrompt } = await import("@/lib/initiative-reasoning-prompts");
        const { callLLM, getModel, getThinkingBudget } = await import("@/lib/ai-provider");
        const { extractJSON } = await import("@/lib/json-helpers");

        const prompt = buildContentGenerationPrompt({
          initiativeTitle: updatedTitle,
          initiativePageContent: reasoning.pageContent,
          deliverable: reasoning.primaryDeliverable,
          targetPageCurrentContent: targetCurrent?.content,
          targetPageCurrentProperties: targetCurrent?.properties ?? undefined,
          businessContext: businessContextStr,
          companyName: operator?.companyName ?? undefined,
        });

        const modelRoute = "initiativeContentGeneration";
        const model = getModel(modelRoute);
        const thinkingBudget = getThinkingBudget(modelRoute);

        const response = await callLLM({
          operatorId,
          instructions: prompt.system,
          messages: [{ role: "user", content: prompt.user }],
          aiFunction: "reasoning",
          model,
          thinkingBudget: thinkingBudget ?? undefined,
          temperature: 0.2,
        });

        contentGenCostCents = response.apiCostCents ?? 0;
        contentGenModelId = model;

        const parsed = extractJSON(response.text) as {
          proposedContent?: string;
          proposedProperties?: Record<string, unknown> | null;
        } | null;

        if (!parsed || typeof parsed.proposedContent !== "string" || parsed.proposedContent.length < 10) {
          throw new Error("Phase 2 produced no valid proposedContent");
        }

        // Merge into the primaryDeliverable
        reasoning.primaryDeliverable = {
          ...reasoning.primaryDeliverable,
          proposedContent: parsed.proposedContent,
          proposedProperties: parsed.proposedProperties ?? null,
        };

        console.log(
          `[initiative-reasoning] Phase 2 content generation for ${pageSlug}: $${(contentGenCostCents / 100).toFixed(2)}, ${parsed.proposedContent.length} chars`
        );
      } catch (err) {
        contentGenerationFailed = true;
        contentGenerationError = err instanceof Error ? err.message : String(err);
        console.error(`[initiative-reasoning] Phase 2 content generation failed for ${pageSlug}:`, err);
        // Don't throw — fall through to write the page with spec-only primaryDeliverable.
        // The UI will handle the missing proposedContent gracefully (placeholder banner).
      }
    }

    // 9. Write updated page + transition status
    await updatePageWithLock(operatorId, pageSlug, (p) => {
      const pp = (p.properties ?? {}) as Record<string, unknown>;
      const newProps: Record<string, unknown> = {
        ...pp,
        ...reasoning.properties,
        status: finalStatus,
        investigated_at: new Date().toISOString(),
        synthesized_by_model: agenticResult.modelId,
        synthesis_cost_cents: Math.round(agenticResult.apiCostCents + contentGenCostCents),
        synthesis_duration_ms: Math.round(agenticResult.durationMs),
      };
      if (contentGenModelId) {
        newProps.content_generation_model = contentGenModelId;
      }
      if (contentGenerationFailed) {
        newProps.content_generation_failed = true;
        if (contentGenerationError) {
          newProps.content_generation_error = contentGenerationError;
        }
      }
      if (!reasoning.isValuable && reasoning.dismissalReason) {
        newProps.dismissal_reason = reasoning.dismissalReason;
      }
      if (reasoning.primaryDeliverable) {
        newProps.primary_deliverable = reasoning.primaryDeliverable;
      }
      if (reasoning.downstreamEffects && reasoning.downstreamEffects.length > 0) {
        newProps.downstream_effects = reasoning.downstreamEffects;
      }
      return {
        title: updatedTitle,
        content: reasoning.pageContent,
        properties: newProps,
      };
    });

    // 10. Process wiki knowledge updates (fire-and-forget)
    if (reasoning.wikiUpdates && reasoning.wikiUpdates.length > 0) {
      processWikiUpdates({
        operatorId,
        situationId: pageSlug,
        updates: reasoning.wikiUpdates as WikiUpdate[],
        synthesisPath: "initiative_reasoning",
        synthesizedByModel: agenticResult.modelId,
        synthesisCostCents: Math.round(agenticResult.apiCostCents),
        synthesisDurationMs: Math.round(agenticResult.durationMs),
      }).catch((err) => {
        console.error(`[initiative-reasoning] Wiki update processing failed for ${pageSlug}:`, err);
      });
    }

    // 11. Evaluation log
    await prisma.evaluationLog.create({
      data: {
        operatorId,
        sourceType: "initiative_reasoning",
        sourceId: pageSlug,
        classification: reasoning.isValuable ? "promoted_to_proposed" : "dismissed",
        evaluatedAt: new Date(),
        metadata: {
          proposalType,
          detectionSource,
          durationMs: agenticResult.durationMs,
          costCents: agenticResult.apiCostCents,
          modelId: agenticResult.modelId,
          dismissalReason: reasoning.dismissalReason,
          primaryDeliverableType: reasoning.primaryDeliverable?.type ?? null,
          downstreamEffectCount: reasoning.downstreamEffects?.length ?? 0,
        },
      },
    }).catch(err => {
      console.warn(`[initiative-reasoning] EvaluationLog creation failed:`, err);
    });

    // 12. Notify admins
    if (reasoning.isValuable) {
      await sendNotificationToAdmins({
        operatorId,
        type: "initiative_proposed",
        title: `Initiative proposed: ${updatedTitle.slice(0, 80)}`,
        body: reasoning.primaryDeliverable?.description?.slice(0, 200)
          ?? "A new initiative has been proposed for review.",
        sourceType: "wiki_page",
        sourceId: pageSlug,
      }).catch(() => {});
    } else {
      // Informational — the initiative doesn't land in the list, but admins should
      // know the scanner found something that didn't survive reasoning.
      await sendNotificationToAdmins({
        operatorId,
        type: "initiative_dismissed",
        title: `Initiative dismissed: ${updatedTitle.slice(0, 80)}`,
        body: reasoning.dismissalReason ?? "Reasoning determined this initiative is not valuable.",
        sourceType: "wiki_page",
        sourceId: pageSlug,
      }).catch(() => {});
    }

    console.log(`[initiative-reasoning] ${pageSlug} → ${finalStatus}`);
  } catch (err) {
    console.error(`[initiative-reasoning] Error reasoning about ${pageSlug}:`, err);
    captureApiError(err, { route: "initiative-reasoning", initiativeSlug: pageSlug });
    // Reset status so it can be retried
    await updatePageWithLock(operatorId, pageSlug, (p) => ({
      properties: { ...(p.properties ?? {}), status: "detected" },
    })).catch(() => {});
  }
}
