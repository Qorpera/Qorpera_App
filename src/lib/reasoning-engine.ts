import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runAgenticLoop } from "@/lib/agentic-loop";
import { loadOperationalInsights } from "@/lib/context-assembly";
import { evaluateActionPolicies } from "@/lib/policy-evaluator";
import { buildSystemPrompt, buildAgenticSeedContext, type AgenticSeedInput } from "@/lib/reasoning-prompts";
import { getBusinessContext, formatBusinessContext } from "@/lib/business-context";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { WikiReasoningOutputSchema, type WikiReasoningOutput } from "@/lib/reasoning-types";
import {
  updateSituationWikiPage,
  type SituationProperties,
} from "@/lib/situation-wiki-helpers";
import { captureApiError } from "@/lib/api-error";
import { generateSituationSummaries } from "@/lib/situation-summarizer";
import { REASONING_TOOLS, executeReasoningTool } from "@/lib/reasoning-tools";
import { getConnectorReadTools, executeConnectorReadTool } from "@/lib/connector-read-tools";
import { processWikiUpdates, updatePageWithLock, type WikiUpdate } from "@/lib/wiki-engine";
import { parseSituationPage } from "@/lib/situation-page-parser";
import { renderActionPlan, replaceSection, type ParsedActionStep } from "@/lib/wiki-execution-engine";

/** Increment this whenever the reasoning system/user prompt changes meaningfully. */
export const REASONING_PROMPT_VERSION = 7; // v7: wiki-first entry point — wiki page is primary gate, no thin Situation dependency

const PROVIDER_TYPES: Record<string, string[]> = {
  google: ["gmail", "google_drive", "google_calendar", "google_sheets"],
  microsoft: ["outlook", "onedrive", "teams", "microsoft_calendar"],
  slack: ["slack"],
  hubspot: ["hubspot"],
  stripe: ["stripe"],
};

// ── Main ─────────────────────────────────────────────────────────────────────

export async function reasonAboutSituation(situationId: string, wikiPageSlug?: string): Promise<void> {
  if (!wikiPageSlug) {
    console.warn(`[reasoning-engine] No wiki page slug provided for situation ${situationId}`);
    return;
  }

  const situationPage = await prisma.knowledgePage.findFirst({
    where: { slug: wikiPageSlug, scope: "operator", pageType: "situation_instance" },
    select: { slug: true, title: true, content: true, properties: true, operatorId: true },
  });

  if (!situationPage || !situationPage.operatorId) {
    console.warn(`[reasoning-engine] Wiki page ${wikiPageSlug} not found`);
    return;
  }

  const operatorId = situationPage.operatorId;
  const props = (situationPage.properties ?? {}) as Record<string, unknown>;
  const wikiSituationId = (props.situation_id as string) ?? situationId;
  const situationTypeSlug = props.situation_type as string | undefined;
  const triggerPageSlug = props.trigger_page as string | undefined;
  const domainSlug = props.domain as string | undefined;
  const currentStatus = props.status as string | undefined;
  const investigationDepth = (props.investigation_depth as string) ?? "standard";
  const editInstruction = props.edit_instruction as string | undefined;

  // 2. Resolve situation type from slug
  if (!situationTypeSlug) {
    console.warn(`[reasoning-engine] No situation_type in properties for ${wikiPageSlug}`);
    return;
  }

  const situationType = await prisma.situationType.findFirst({
    where: { operatorId, slug: situationTypeSlug },
  });

  if (!situationType) {
    console.warn(`[reasoning-engine] SituationType ${situationTypeSlug} not found for operator ${operatorId}`);
    return;
  }

  // Skip reasoning for awareness situations
  if (situationTypeSlug.startsWith("awareness-")) {
    console.log(`[reasoning-engine] Skipping reasoning for awareness situation ${wikiPageSlug}`);
    if (currentStatus === "detected") {
      await updatePageWithLock(operatorId, wikiPageSlug, (p) => ({
        properties: { ...(p.properties ?? {}), status: "resolved", resolved_at: new Date().toISOString() },
      }));
    }
    return;
  }

  // 3. Status guard + lock via wiki page
  if (currentStatus !== "detected") {
    return; // Idempotent — already being reasoned about or past that stage
  }

  let lockAcquired = false;
  try {
    await updatePageWithLock(operatorId, wikiPageSlug, (p) => {
      const pageProps = (p.properties ?? {}) as Record<string, unknown>;
      if (pageProps.status !== "detected") {
        return {}; // Another worker got here first — no-op
      }
      lockAcquired = true;
      return { properties: { ...pageProps, status: "reasoning" } };
    });
  } catch {
    return; // Lock failed
  }
  if (!lockAcquired) return;

  try {
    // Load hub pages (2-4), capabilities, business context, prior feedback, insights, and cycle count in parallel
    const hubSlugs = [situationType.wikiPageSlug, triggerPageSlug, domainSlug].filter(Boolean) as string[];
    const hubRoles: Record<string, string> = {};
    if (situationType.wikiPageSlug) hubRoles[situationType.wikiPageSlug] = "situation_type_playbook";
    if (triggerPageSlug) hubRoles[triggerPageSlug] = "trigger_person";
    if (domainSlug) hubRoles[domainSlug] = "domain_hub";

    const [
      hubPageResults,
      capabilities,
      businessCtx,
      operator,
      priorFeedbackPages,
      operationalInsights,
      cycleCount,
    ] = await Promise.all([
      hubSlugs.length > 0
        ? prisma.knowledgePage.findMany({
            where: { operatorId, slug: { in: hubSlugs }, scope: "operator" },
            select: { slug: true, title: true, content: true, pageType: true },
          })
        : Promise.resolve([]),
      prisma.actionCapability.findMany({
        where: { operatorId, enabled: true },
        include: { connector: { select: { provider: true } } },
      }),
      getBusinessContext(operatorId),
      prisma.operator.findUnique({
        where: { id: operatorId },
        select: { companyName: true },
      }),
      prisma.knowledgePage.findMany({
        where: {
          operatorId,
          pageType: "situation_instance",
          scope: "operator",
          properties: { path: ["situation_type"], equals: situationTypeSlug },
        },
        select: { content: true, properties: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      loadOperationalInsights(operatorId, null, null, situationType.id),
      prisma.situationCycle.count({ where: { situationId: wikiSituationId } }),
    ]);

    // Assemble hub pages array (situation page first, then DB results in role order)
    const hubPages: Array<{ slug: string; title: string; pageType: string; content: string; role: string }> = [{
      slug: situationPage.slug,
      title: situationPage.title,
      pageType: "situation_instance",
      content: situationPage.content,
      role: "situation",
    }];
    let triggerPersonName: string | null = null;
    for (const page of hubPageResults) {
      const role = hubRoles[page.slug];
      if (!role) continue;
      hubPages.push({ slug: page.slug, title: page.title, pageType: page.pageType, content: page.content, role });
      if (role === "trigger_person") triggerPersonName = page.title;
    }

    // Governance
    const actionsForEval = capabilities.map((c) => ({
      name: c.name,
      description: c.description,
      connectorId: c.connectorId,
      connectorProvider: c.connector?.provider ?? null,
      inputSchema: c.inputSchema,
    }));

    const policyResult = await evaluateActionPolicies(
      operatorId,
      actionsForEval,
      "person_profile",
      "",
    );

    const businessContextStr = businessCtx ? formatBusinessContext(businessCtx) : null;

    // Edit instruction — tells the LLM which changes the human requested
    let editInstructionText: string | null = null;
    if (editInstruction) {
      editInstructionText = `The human reviewed the original proposal and requested changes.\n\nHUMAN'S EDIT INSTRUCTION:\n"${editInstruction}"`;
    }

    // Extract prior learnings from resolved situations of this type
    const priorFeedbackLines: string[] = [];
    for (const p of priorFeedbackPages) {
      const parsed = parseSituationPage(p.content, p.properties as Record<string, unknown> | null);
      const learnings = parsed.sections.learnings?.trim();
      if (learnings) priorFeedbackLines.push(learnings.slice(0, 200));
    }

    const triggerStub = triggerPersonName && triggerPageSlug
      ? { displayName: triggerPersonName, pageSlug: triggerPageSlug, pageType: "person_profile" as const }
      : null;

    const cycleNumber = cycleCount + 1;

    // Connector capabilities for seed context
    const activeConnectors = await prisma.sourceConnector.findMany({
      where: { operatorId, status: "active", deletedAt: null },
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

    // Dynamic tool set (knowledge-graph + connector read tools)
    const { tools: connectorTools, availableToolNames: connectorToolNames } =
      await getConnectorReadTools(operatorId);
    const allTools = [...REASONING_TOOLS, ...connectorTools];

    const dispatchTool = async (toolName: string, args: Record<string, unknown>): Promise<string> => {
      if (connectorToolNames.has(toolName)) {
        return executeConnectorReadTool(operatorId, toolName, args);
      }
      return executeReasoningTool(operatorId, toolName, args);
    };

    // Evidence claims for seed context
    let evidenceClaims: Array<{ claim: string; type: string; confidence: number; source: string }> = [];
    try {
      const searchQuery = situationPage.title ?? "";
      if (searchQuery.length > 10) {
        const escaped = searchQuery.replace(/[%_\\]/g, "\\$&");
        const keywords = `%${escaped.split(" ").slice(0, 3).join("%")}%`;
        const results = await prisma.$queryRaw<Array<{
          extractions: unknown;
          sourceType: string;
        }>>`
          SELECT extractions, "sourceType"
          FROM "EvidenceExtraction"
          WHERE "operatorId" = ${operatorId}
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

    // System expertise discovery
    let systemExpertiseIndex: Array<{
      slug: string; title: string; pageType: string; confidence: number; contentPreview: string;
    }> = [];
    try {
      const { discoverSystemExpertise } = await import("@/lib/wiki-discovery");
      const expertiseQuery = [
        situationType.name,
        situationType.description?.slice(0, 200) ?? "",
        situationPage.title ?? "",
      ].filter(Boolean).join(" ");
      systemExpertiseIndex = await discoverSystemExpertise(operatorId, expertiseQuery, 15);
    } catch (err) {
      console.warn("[reasoning-engine] System expertise discovery failed:", err);
    }

    // Gap signal for system intelligence
    if (systemExpertiseIndex.length === 0) {
      import("@/lib/system-intelligence-signals").then(({ emitSystemSignal }) => {
        emitSystemSignal({
          operatorId,
          signalType: "gap_signal",
          situationTypeSlug,
          payload: {
            situationId: wikiSituationId,
            searchQuery: [situationType.name, situationType.description?.slice(0, 200)].filter(Boolean).join(" "),
            situationTypeName: situationType.name,
          },
        }).catch(() => {});
      }).catch(() => {});
    }

    const softBudget = investigationDepth === "thorough" ? 50 : 20;
    const hardBudget = investigationDepth === "thorough" ? 80 : 25;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outputSchema = WikiReasoningOutputSchema as any;
    const systemPrompt = buildSystemPrompt(businessContextStr, operator?.companyName ?? undefined, connectorToolNames, investigationDepth);

    const seedInput: AgenticSeedInput = {
      situationType: { name: situationType.name, description: situationType.description },
      severity: (props.severity as number) ?? 0.5,
      confidence: (props.confidence as number) ?? 0.5,
      autonomyLevel: "supervised",
      triggerEvidence: null, // Evidence is on the situation page content, not a separate field
      triggerSummary: situationPage.title,
      triggerStub,
      permittedActions: policyResult.permitted,
      blockedActions: policyResult.blocked,
      businessContext: businessContextStr,
      operationalInsights,
      actionCycles: [], // Cycle history is in the situation page Timeline section
      delegationSource: null,
      connectorCapabilities,
      wikiPages: hubPages, // The 4 hub pages replace the old semantic-similarity pages
      evidenceClaims,
      systemExpertiseIndex,
      situationPageContent: situationPage.content,
    };
    const seedContext = buildAgenticSeedContext(seedInput);

    // Context eval telemetry
    const contextSections: Array<{
      type: string;
      id: string;
      slug?: string;
      pageType?: string;
      source?: string;
      tokenCount: number;
    }> = [];
    for (const page of hubPages) {
      contextSections.push({
        type: "wiki_page",
        id: page.slug,
        slug: page.slug,
        pageType: page.pageType,
        source: "operator",
        tokenCount: Math.ceil(page.content.length / 4),
      });
    }
    if (systemExpertiseIndex.length > 0) {
      contextSections.push({
        type: "system_expertise_index",
        id: "system_discovery",
        tokenCount: systemExpertiseIndex.reduce((n, e) => n + Math.ceil(e.contentPreview.length / 4), 0),
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
        operatorId,
        situationId: wikiSituationId,
        contextSections: contextSections as Prisma.InputJsonValue,
        citedSections: [] as Prisma.InputJsonValue,
      },
      select: { id: true },
    }).catch(err => {
      console.warn("[reasoning-engine] Context eval creation failed:", err);
      return null;
    });

    // 9. Run agentic reasoning loop
    const agenticResult = await runAgenticLoop({
      operatorId,
      contextId: wikiSituationId,
      contextType: "situation",
      cycleNumber,
      systemPrompt,
      seedContext,
      tools: allTools,
      dispatchTool,
      outputSchema,
      softBudget,
      hardBudget,
      editInstruction: editInstructionText,
      priorFeedbackLines: priorFeedbackLines.length > 0 ? priorFeedbackLines : null,
    });
    const reasoning = agenticResult.output as WikiReasoningOutput;
    const reasoningApiCostCents = agenticResult.apiCostCents;
    const modelString = agenticResult.modelId;
    const reasoningDurationMs = agenticResult.durationMs;

    console.log(`[reasoning-engine] Agentic reasoning complete for ${wikiPageSlug} (${investigationDepth}): ${reasoningDurationMs}ms, $${(reasoningApiCostCents / 100).toFixed(2)}`);

    // Parse cited context sections
    if (contextEval) {
      try {
        const fullText = reasoning.pageContent ?? "";
        const citedSections: Array<{ type: string; id: string; citationCount: number }> = [];

        for (const page of hubPages) {
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
    if (reasoning.depthUpgrade && investigationDepth === "standard") {
      await updatePageWithLock(operatorId, wikiPageSlug, (p) => ({
        properties: { ...(p.properties ?? {}), investigation_depth: "thorough", status: "detected" },
      }));
      console.log(`[reasoning-engine] ${wikiPageSlug} upgraded to thorough investigation`);
      return reasonAboutSituation(situationId, wikiPageSlug);
    }

    // 10. Resolve actionSteps → system-written Action Plan section
    let resolvedSteps: ParsedActionStep[] = [];

    if (reasoning.actionSteps && reasoning.actionSteps.length > 0) {
      for (let i = 0; i < reasoning.actionSteps.length; i++) {
        const step = reasoning.actionSteps[i];

        // Resolve actionCapabilityName → verify exists
        if (step.executionMode === "action") {
          if (!step.actionCapabilityName) {
            console.warn(`[reasoning-engine] Action step "${step.title}" missing actionCapabilityName for ${wikiPageSlug}. Nullifying plan.`);
            resolvedSteps = [];
            break;
          }
          const cap = capabilities.find(
            (c) => c.name === step.actionCapabilityName && c.enabled,
          );
          if (!cap) {
            console.warn(`[reasoning-engine] ActionCapability "${step.actionCapabilityName}" not found for ${wikiPageSlug}. Nullifying plan.`);
            resolvedSteps = [];
            break;
          }
        }

        // Inject previewType into params (system responsibility, not LLM)
        const stepParams = step.params ? { ...step.params } : {};
        if (step.previewType) stepParams.previewType = step.previewType;

        // Map executionMode: LLM says "action" → wiki format says "api_action"
        if (step.executionMode === "await_situation") {
          console.warn(`[reasoning-engine] Step "${step.title}" uses unsupported await_situation mode. Falling back to human_task.`);
        }
        const actionType: ParsedActionStep["actionType"] =
          step.executionMode === "action" ? "api_action"
          : step.executionMode === "generate" ? "generate"
          : "human_task";  // human_task | await_situation (fallback)

        resolvedSteps.push({
          order: i + 1,
          title: step.title,
          actionType,
          status: "pending" as const,
          description: step.description,
          ...(step.executionMode === "action" && step.actionCapabilityName
            ? { capabilityName: step.actionCapabilityName } : {}),
          ...(step.assignedUserId ? { assignedSlug: step.assignedUserId } : {}),
          ...(Object.keys(stepParams).length > 0 ? { params: stepParams } : {}),
          ...(step.previewType ? { previewType: step.previewType } : {}),
        });
      }
    }

    // System writes the Action Plan section — overwrite whatever the LLM wrote
    let finalPageContent = reasoning.pageContent;
    if (resolvedSteps.length > 0) {
      const renderedPlan = renderActionPlan(resolvedSteps);
      finalPageContent = replaceSection(finalPageContent, "Action Plan", renderedPlan);
    }

    // 11. Output — wiki page only
    const updatedTitle = reasoning.situationTitle ?? situationPage.title;
    const updatedProps = reasoning.properties as SituationProperties;

    await updateSituationWikiPage({
      operatorId,
      slug: situationPage.slug,
      title: updatedTitle,
      properties: updatedProps,
      articleBody: finalPageContent,
      synthesizedByModel: modelString,
      synthesisCostCents: Math.round(reasoningApiCostCents),
      synthesisDurationMs: Math.round(reasoningDurationMs),
    });

    // SituationCycle record (uses situation_id from wiki properties)
    await createSituationCycle(wikiSituationId, reasoning);

    // Generate Haiku summaries (fire-and-forget — non-blocking)
    generateSituationSummaries(wikiSituationId).catch(err =>
      console.error(`[reasoning-engine] Summary generation failed for ${wikiSituationId}:`, err)
    );

    // Wiki knowledge updates (fire-and-forget)
    if (reasoning.wikiUpdates && reasoning.wikiUpdates.length > 0) {
      processWikiUpdates({
        operatorId,
        situationId: wikiSituationId,
        updates: reasoning.wikiUpdates as WikiUpdate[],
        synthesisPath: "reasoning",
        synthesizedByModel: modelString,
        synthesisCostCents: Math.round(reasoningApiCostCents),
        synthesisDurationMs: Math.round(reasoningDurationMs),
      }).catch((err) => {
        console.error(`[reasoning-engine] Wiki update processing failed for ${wikiSituationId}:`, err);
      });
    }

    // Notifications — use resolvedSteps directly instead of re-parsing
    if (resolvedSteps.length === 0) {
      sendNotificationToAdmins({
        operatorId,
        type: "situation_proposed",
        title: `Review needed: ${situationType.name}`,
        body: "AI analyzed the situation but recommends no action. Please review the reasoning.",
        sourceType: "situation",
        sourceId: wikiSituationId,
      }).catch(() => {});
    } else {
      sendNotificationToAdmins({
        operatorId,
        type: "situation_proposed",
        title: `Plan proposed: ${situationType.name}`,
        body: `AI proposes a ${resolvedSteps.length}-step plan: ${resolvedSteps.map(s => s.title).join(" → ")}`,
        sourceType: "situation",
        sourceId: wikiSituationId,
      }).catch(() => {});
    }

    // Escalation
    if (reasoning.escalation) {
      console.log(`[reasoning-engine] Escalation recommended for ${wikiSituationId}: ${reasoning.escalation.rationale}`);
    }

    console.log(`[reasoning-engine] Reasoning complete for ${wikiPageSlug}`);

  } catch (err) {
    console.error(`[reasoning-engine] Error reasoning about situation ${wikiPageSlug}:`, err);
    captureApiError(err, { route: "reasoning-engine", situationId: wikiSituationId });
    // Reset wiki page status to "detected" so it can be retried
    await updatePageWithLock(operatorId, wikiPageSlug, (p) => ({
      properties: { ...(p.properties ?? {}), status: "detected" },
    })).catch(() => {});
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function createSituationCycle(
  situationId: string,
  reasoning: { afterBatch?: string; reEvaluationReason?: string; monitorDurationHours?: number },
): Promise<void> {
  try {
    const cycleCount = await prisma.situationCycle.count({ where: { situationId } });
    await prisma.situationCycle.create({
      data: {
        situationId,
        cycleNumber: cycleCount + 1,
        triggerType: cycleCount === 0 ? "detection" : "signal",
        triggerSummary: cycleCount === 0 ? "Situation detected" : "Re-evaluation triggered",
        reasoning: {
          afterBatch: reasoning.afterBatch ?? "resolve",
          reEvaluationReason: reasoning.reEvaluationReason,
          monitorDurationHours: reasoning.monitorDurationHours,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        status: "active",
      },
    });
  } catch (err) {
    console.error("[reasoning-engine] Failed to create SituationCycle record:", err);
  }
}
