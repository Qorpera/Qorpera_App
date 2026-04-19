import { prisma } from "@/lib/db";
import { runAgenticLoop } from "@/lib/agentic-loop";
import { getBusinessContext, formatBusinessContext } from "@/lib/business-context";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { captureApiError } from "@/lib/api-error";
import { REASONING_TOOLS, executeReasoningTool } from "@/lib/reasoning-tools";
import { updatePageWithLock, createPage, extractCrossReferences } from "@/lib/wiki-engine";
import { z } from "zod";
import {
  buildDownstreamSystemPrompt,
  buildDownstreamSeedContext,
  type DownstreamInvestigationInput,
} from "@/lib/idea-execution-prompts";
import type {
  IdeaPrimaryDeliverable,
  IdeaDownstreamEffect,
} from "@/lib/reasoning-types";
import {
  ExecutionStateSchema,
  type ExecutionState,
  type DownstreamExecState,
  type ExecConcern,
  type DownstreamLLMOutput,
} from "@/lib/idea-execution-types";

export const IDEA_EXECUTION_VERSION = 1;

const MAX_DOWNSTREAM = 10;
const PER_DOWNSTREAM_SOFT_BUDGET = 4;
const PER_DOWNSTREAM_HARD_BUDGET = 6;
const TOTAL_COST_HARD_ABORT_CENTS = 1000; // $10

// Narrow tool set — downstream investigation only reads, doesn't act
const DOWNSTREAM_TOOLS = REASONING_TOOLS.filter(t =>
  ["read_wiki_page", "search_wiki", "get_related_pages"].includes(t.name)
);

// Output schema for the agentic loop
const DownstreamOutputSchema = z.object({
  proposedContent: z.string().min(1),
  proposedProperties: z.record(z.unknown()).nullable().optional(),
  concerns: z.array(z.object({
    description: z.string(),
    severity: z.enum(["warning", "blocking"]),
    recommendation: z.string(),
  })).default([]),
});

// ── Entry point ─────────────────────────────────────────────────────────────

export async function executeIdea(
  operatorId: string,
  pageSlug: string,
): Promise<void> {
  // 1. Load idea
  const ideaPage = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug: pageSlug, pageType: "idea", scope: "operator" },
    select: { slug: true, title: true, content: true, properties: true },
  });
  if (!ideaPage) {
    console.warn(`[idea-execution] Page ${pageSlug} not found`);
    return;
  }

  const props = (ideaPage.properties ?? {}) as Record<string, unknown>;
  const currentStatus = props.status as string | undefined;
  const primary = props.primary_deliverable as IdeaPrimaryDeliverable | null;
  const downstream = (props.downstream_effects ?? []) as IdeaDownstreamEffect[];

  // 2. Status guard — accept "accepted" (fresh) or "concerns_raised" (retry)
  if (currentStatus !== "accepted" && currentStatus !== "concerns_raised") {
    console.log(`[idea-execution] ${pageSlug} status is ${currentStatus}, skipping`);
    return;
  }

  if (!primary || !primary.proposedContent) {
    console.warn(`[idea-execution] ${pageSlug} has no primary.proposedContent — rejecting execution`);
    await writeConcernState(operatorId, pageSlug, {
      startedAt: new Date().toISOString(),
      totalCostCents: 0,
      primary: { status: "failed", error: "Primary deliverable has no proposedContent", appliedSlug: null },
      downstream: [],
      crossConcerns: [{
        source: "programmatic",
        targetChangeId: "primary",
        description: "Primary deliverable has no proposedContent — reasoning Phase 2 failed",
        severity: "blocking",
        recommendation: "Reject this idea and let the scanner re-surface it",
      }],
      completedAt: null,
    });
    return;
  }

  // 3. Acquire lock — transition to "implementing"
  let lockAcquired = false;
  try {
    await updatePageWithLock(operatorId, pageSlug, (p) => {
      const pp = (p.properties ?? {}) as Record<string, unknown>;
      if (pp.status !== "accepted" && pp.status !== "concerns_raised") return {};
      lockAcquired = true;
      return { properties: { ...pp, status: "implementing" } };
    });
  } catch (err) {
    console.error(`[idea-execution] Lock acquisition failed for ${pageSlug}:`, err);
    return;
  }
  if (!lockAcquired) return;

  try {
    // 4. Initialize or resume execution state — Zod-validate any stored state so a
    // schema drift doesn't crash the engine mid-execution. Fall back to fresh on parse failure.
    const parsedExisting = props.execution_state !== undefined
      ? ExecutionStateSchema.safeParse(props.execution_state)
      : null;
    let state: ExecutionState;
    if (parsedExisting?.success) {
      state = parsedExisting.data;
      console.log(`[idea-execution] ${pageSlug}: resumed from stored execution_state`);
    } else {
      if (parsedExisting && !parsedExisting.success) {
        console.warn(
          `[idea-execution] ${pageSlug}: stored execution_state failed schema validation, starting fresh:`,
          parsedExisting.error.message,
        );
      }
      state = {
        startedAt: new Date().toISOString(),
        totalCostCents: 0,
        primary: { status: "pending", error: null, appliedSlug: null },
        downstream: downstream.slice(0, MAX_DOWNSTREAM).map((e, idx) => ({
          changeId: `downstream-${idx}`,
          effect: e,
          status: "pending" as const,
          proposedContent: null,
          proposedProperties: null,
          concerns: [],
          model: null,
          costCents: 0,
          error: null,
          appliedSlug: null,
        })),
        crossConcerns: [],
        completedAt: null,
      };
    }

    // Load business context once
    const [operator, businessCtx] = await Promise.all([
      prisma.operator.findUnique({ where: { id: operatorId }, select: { companyName: true } }),
      getBusinessContext(operatorId),
    ]);
    const businessContextStr = businessCtx ? formatBusinessContext(businessCtx) : null;

    // Context for DB record creation and cross-linkage
    const acceptedBy = (props.accepted_by as string) ?? null;
    const extras: ApplyExtras = { acceptedBy, sourceIdeaSlug: pageSlug };

    // 5. Zero-downstream fast path
    if (state.downstream.length === 0) {
      console.log(`[idea-execution] ${pageSlug}: zero downstream, direct apply`);
      if (state.primary.status !== "applied") {
        await applyPrimary(operatorId, primary, state, extras);
      }
      if (state.primary.status === "applied") {
        state.completedAt = new Date().toISOString();
        await finalizeImplemented(operatorId, pageSlug, state, ideaPage.title);
      } else {
        await writeConcernState(operatorId, pageSlug, state);
        await notifyConcerns(operatorId, pageSlug, ideaPage.title, state);
      }
      return;
    }

    // 6. Parallel downstream investigation — only for pending/failed/generating
    const needsGeneration = state.downstream
      .map((d, idx) => ({ d, idx }))
      .filter(({ d }) => d.status === "pending" || d.status === "failed" || d.status === "generating");

    if (needsGeneration.length > 0) {
      console.log(`[idea-execution] ${pageSlug}: generating ${needsGeneration.length} downstream effects in parallel`);

      const results = await Promise.allSettled(
        needsGeneration.map(({ d, idx }) =>
          investigateDownstream({
            operatorId,
            ideaTitle: ideaPage.title,
            ideaPageContent: ideaPage.content ?? "",
            primary,
            state: d,
            businessContext: businessContextStr,
            companyName: operator?.companyName ?? null,
          }).then(result => ({ idx, result, error: null as string | null }))
            .catch(err => ({ idx, result: null, error: err instanceof Error ? err.message : String(err) }))
        )
      );

      for (const settled of results) {
        if (settled.status === "fulfilled") {
          const { idx, result, error } = settled.value;
          const d = state.downstream[idx];
          if (error || !result) {
            d.status = "failed";
            d.error = error ?? "Unknown error";
          } else {
            d.status = "generated";
            d.proposedContent = result.output.proposedContent;
            d.proposedProperties = result.output.proposedProperties ?? null;
            d.concerns = result.output.concerns.map(c => ({
              source: "llm" as const,
              targetChangeId: d.changeId,
              ...c,
            }));
            d.model = result.model;
            d.costCents = Math.round(result.costCents);
            state.totalCostCents += d.costCents;
          }
        }
      }
    }

    // 6b. Check total cost
    if (state.totalCostCents > TOTAL_COST_HARD_ABORT_CENTS) {
      state.crossConcerns.push({
        source: "programmatic",
        targetChangeId: null,
        description: `Execution exceeded $${TOTAL_COST_HARD_ABORT_CENTS / 100} cost cap (spent $${(state.totalCostCents / 100).toFixed(2)})`,
        severity: "blocking",
        recommendation: "Reduce scope or reject the idea",
      });
    }

    // 7. Programmatic checks
    const programmaticConcerns = await runProgrammaticChecks(operatorId, primary, state);
    state.crossConcerns.push(...programmaticConcerns);

    // 8. Any blocking concerns? → concerns_raised
    const allConcerns: ExecConcern[] = [
      ...state.crossConcerns,
      ...state.downstream.flatMap(d => d.concerns),
    ];
    const hasBlocking = allConcerns.some(c => c.severity === "blocking");
    const anyGenerationFailed = state.downstream.some(d => d.status === "failed");

    if (hasBlocking || anyGenerationFailed) {
      await writeConcernState(operatorId, pageSlug, state);
      await notifyConcerns(operatorId, pageSlug, ideaPage.title, state);
      return;
    }

    // 9. Apply primary (if not already applied)
    if (state.primary.status !== "applied") {
      await applyPrimary(operatorId, primary, state, extras);
      await writeExecutionState(operatorId, pageSlug, state);
    }

    if (state.primary.status !== "applied") {
      // Primary apply failed
      await writeConcernState(operatorId, pageSlug, state);
      await notifyConcerns(operatorId, pageSlug, ideaPage.title, state);
      return;
    }

    // 10. Apply downstream sequentially
    for (const d of state.downstream) {
      if (d.status === "applied") continue;
      if (d.status !== "generated") {
        // shouldn't happen, but skip
        continue;
      }
      try {
        d.status = "applying";
        await writeExecutionState(operatorId, pageSlug, state);
        await applyDownstream(operatorId, d, extras);
        d.status = "applied";
      } catch (err) {
        d.status = "failed";
        d.error = err instanceof Error ? err.message : String(err);
      }
      await writeExecutionState(operatorId, pageSlug, state);
    }

    // 11. Success check — all applied?
    const allApplied = state.downstream.every(d => d.status === "applied");
    if (!allApplied) {
      await writeConcernState(operatorId, pageSlug, state);
      await notifyConcerns(operatorId, pageSlug, ideaPage.title, state);
      return;
    }

    // 12. Done — finalize
    state.completedAt = new Date().toISOString();
    await finalizeImplemented(operatorId, pageSlug, state, ideaPage.title);
  } catch (err) {
    console.error(`[idea-execution] Error executing ${pageSlug}:`, err);
    captureApiError(err, { route: "idea-execution", ideaSlug: pageSlug });
    // Reset to "accepted" so retry is possible
    await updatePageWithLock(operatorId, pageSlug, (p) => ({
      properties: { ...(p.properties ?? {}), status: "accepted" },
    })).catch(() => {});
  }
}

// ── User action: skip remaining downstream and implement ────────────────────

/**
 * User clicked "Implement without downstream" on a concerns_raised idea.
 * Applies the primary if not already applied, marks all non-applied downstream
 * as failed (with a "skipped by user" error), transitions to implemented.
 */
export async function skipDownstreamAndImplement(
  operatorId: string,
  pageSlug: string,
): Promise<void> {
  const ideaPage = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug: pageSlug, pageType: "idea", scope: "operator" },
    select: { slug: true, title: true, properties: true },
  });
  if (!ideaPage) throw new Error("Idea not found");

  // primary is stable across retry/skip races (not mutated by the engine post-acceptance)
  const props = (ideaPage.properties ?? {}) as Record<string, unknown>;
  const primary = props.primary_deliverable as IdeaPrimaryDeliverable | null;
  if (!primary || !primary.proposedContent) {
    throw new Error("Primary deliverable missing — cannot implement");
  }

  // Atomic: status check + state parse + status flip all inside the lock callback.
  // This closes the TOCTOU window between an out-of-lock parse and the lock acquisition.
  // Closure stash: TS can't narrow across the callback boundary, so we re-bind to a const after.
  const captured: { state: ExecutionState | null; error: string | null } = { state: null, error: null };
  await updatePageWithLock(operatorId, pageSlug, (p) => {
    const pp = (p.properties ?? {}) as Record<string, unknown>;
    if (pp.status !== "concerns_raised") {
      captured.error = `status is ${pp.status}, not concerns_raised`;
      return {};
    }
    const parsed = ExecutionStateSchema.safeParse(pp.execution_state);
    if (!parsed.success) {
      captured.error = "execution_state invalid or missing";
      return {};
    }
    captured.state = parsed.data;
    return { properties: { ...pp, status: "implementing" } };
  });

  if (captured.error || !captured.state) {
    throw new Error(`Cannot skip downstream: ${captured.error ?? "state unavailable"}`);
  }
  const state: ExecutionState = captured.state;

  const acceptedBy = (props.accepted_by as string) ?? null;
  const extras: ApplyExtras = { acceptedBy, sourceIdeaSlug: pageSlug };

  try {
    if (state.primary.status !== "applied") {
      await applyPrimary(operatorId, primary, state, extras);
      await writeExecutionState(operatorId, pageSlug, state);
    }

    if (state.primary.status !== "applied") {
      // Primary apply failed — throw to trigger catch-block rollback to concerns_raised
      throw new Error(`Primary apply failed: ${state.primary.error}`);
    }

    for (const d of state.downstream) {
      if (d.status !== "applied") {
        d.status = "failed";
        d.error = d.error ?? "Skipped by user (implement without downstream)";
      }
    }

    state.completedAt = new Date().toISOString();
    await finalizeImplemented(operatorId, pageSlug, state, ideaPage.title);
  } catch (err) {
    await updatePageWithLock(operatorId, pageSlug, (p) => ({
      properties: { ...(p.properties ?? {}), status: "concerns_raised" },
    })).catch(() => {});
    throw err;
  }
}

// ── Investigation ───────────────────────────────────────────────────────────

async function investigateDownstream(input: {
  operatorId: string;
  ideaTitle: string;
  ideaPageContent: string;
  primary: IdeaPrimaryDeliverable;
  state: DownstreamExecState;
  businessContext: string | null;
  companyName: string | null;
}): Promise<{ output: DownstreamLLMOutput; model: string; costCents: number }> {
  const { operatorId, state } = input;
  const effect = state.effect;

  // Load target page current content (if exists)
  let targetCurrent: { content: string; properties: Record<string, unknown> | null } | null = null;
  const targetPage = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug: effect.targetPageSlug, scope: "operator" },
    select: { content: true, properties: true },
  });
  if (targetPage) {
    targetCurrent = {
      content: targetPage.content,
      properties: targetPage.properties as Record<string, unknown> | null,
    };
  }

  const promptInput: DownstreamInvestigationInput = {
    ideaTitle: input.ideaTitle,
    ideaPageContent: input.ideaPageContent,
    primary: input.primary,
    effect,
    targetPageCurrentContent: targetCurrent?.content ?? null,
    targetPageCurrentProperties: targetCurrent?.properties ?? null,
    businessContext: input.businessContext,
    companyName: input.companyName,
  };

  const systemPrompt = buildDownstreamSystemPrompt(promptInput);
  const seedContext = buildDownstreamSeedContext(promptInput);

  // Dispatcher: only reasoning tools, no connector tools
  const dispatchTool = async (toolName: string, args: Record<string, unknown>): Promise<string> => {
    return executeReasoningTool(operatorId, toolName, args);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outputSchema = DownstreamOutputSchema as any;

  const agenticResult = await runAgenticLoop({
    operatorId,
    contextId: state.changeId,
    contextType: "idea_downstream",
    cycleNumber: 1,
    systemPrompt,
    seedContext,
    tools: DOWNSTREAM_TOOLS,
    dispatchTool,
    outputSchema,
    softBudget: PER_DOWNSTREAM_SOFT_BUDGET,
    hardBudget: PER_DOWNSTREAM_HARD_BUDGET,
    modelRoute: "ideaDownstream",
  });

  return {
    output: agenticResult.output as DownstreamLLMOutput,
    model: agenticResult.modelId,
    costCents: agenticResult.apiCostCents,
  };
}

// ── Programmatic checks ─────────────────────────────────────────────────────

async function runProgrammaticChecks(
  operatorId: string,
  primary: IdeaPrimaryDeliverable,
  state: ExecutionState,
): Promise<ExecConcern[]> {
  const concerns: ExecConcern[] = [];

  // Check 1: Primary wiki_update target exists
  if (primary.type === "wiki_update" && primary.targetPageSlug) {
    const exists = await prisma.knowledgePage.findFirst({
      where: { operatorId, slug: primary.targetPageSlug, scope: "operator" },
      select: { slug: true },
    });
    if (!exists) {
      concerns.push({
        source: "programmatic",
        targetChangeId: "primary",
        description: `Primary wiki_update targets [[${primary.targetPageSlug}]] which doesn't exist`,
        severity: "blocking",
        recommendation: "Reject and let scanner re-surface with fresh target identification",
      });
    }
  }

  // Check 2: Primary wiki_create target slug doesn't already exist
  if (primary.type === "wiki_create" && primary.targetPageSlug) {
    const exists = await prisma.knowledgePage.findFirst({
      where: { operatorId, slug: primary.targetPageSlug, scope: "operator" },
      select: { slug: true },
    });
    if (exists) {
      concerns.push({
        source: "programmatic",
        targetChangeId: "primary",
        description: `Primary wiki_create targets slug [[${primary.targetPageSlug}]] but a page with that slug already exists`,
        severity: "blocking",
        recommendation: "Rename the target slug or change to wiki_update",
      });
    }
  }

  // Check 3: Overlapping writes — two changes targeting the same slug
  const targetSlugs = new Map<string, string[]>(); // slug → list of changeIds
  if (primary.targetPageSlug) {
    targetSlugs.set(primary.targetPageSlug, ["primary"]);
  }
  for (const d of state.downstream) {
    if (d.status === "failed") continue; // failed downstream won't apply
    const list = targetSlugs.get(d.effect.targetPageSlug) ?? [];
    list.push(d.changeId);
    targetSlugs.set(d.effect.targetPageSlug, list);
  }
  for (const [slug, ids] of targetSlugs.entries()) {
    if (ids.length > 1) {
      concerns.push({
        source: "programmatic",
        targetChangeId: null,
        description: `Multiple changes target [[${slug}]]: ${ids.join(", ")}. They would overwrite each other.`,
        severity: "blocking",
        recommendation: "Consolidate into a single change or reject overlapping downstream effects",
      });
    }
  }

  // Check 4: Broken cross-references in generated content — warning only (LLM may cite pages not indexed)
  const allProposedContent = [
    primary.proposedContent ?? "",
    ...state.downstream.map(d => d.proposedContent ?? ""),
  ].join("\n");
  const refSlugs = extractCrossReferences(allProposedContent);
  if (refSlugs.length > 0) {
    const existing = await prisma.knowledgePage.findMany({
      where: { operatorId, slug: { in: refSlugs }, scope: "operator" },
      select: { slug: true },
    });
    const existingSet = new Set(existing.map(e => e.slug));
    const missing = refSlugs.filter(s =>
      !existingSet.has(s) &&
      s !== primary.targetPageSlug // the new page being created
    );
    if (missing.length > 0) {
      concerns.push({
        source: "programmatic",
        targetChangeId: null,
        description: `Proposed content references pages that don't exist: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` (+${missing.length - 5} more)` : ""}`,
        severity: "warning",
        recommendation: "Review cross-references before committing; may be typos or stale slugs",
      });
    }
  }

  return concerns;
}

// ── Apply functions ─────────────────────────────────────────────────────────

type ApplyExtras = {
  acceptedBy: string | null;
  sourceIdeaSlug: string;
};

async function applyPrimary(
  operatorId: string,
  primary: IdeaPrimaryDeliverable,
  state: ExecutionState,
  extras: ApplyExtras,
): Promise<void> {
  state.primary.status = "applying";
  try {
    const result = await applyChange(operatorId, {
      type: primary.type,
      targetPageSlug: primary.targetPageSlug,
      targetPageType: primary.targetPageType,
      title: primary.title,
      proposedContent: primary.proposedContent ?? "",
      proposedProperties: primary.proposedProperties ?? null,
      model: "approved_by_user",
    }, extras);
    state.primary.status = "applied";
    state.primary.error = null;
    state.primary.appliedSlug = result.appliedSlug;
  } catch (err) {
    state.primary.status = "failed";
    state.primary.error = err instanceof Error ? err.message : String(err);
  }
}

async function applyDownstream(
  operatorId: string,
  d: DownstreamExecState,
  extras: ApplyExtras,
): Promise<void> {
  if (!d.proposedContent) throw new Error("No proposedContent to apply");
  const effect = d.effect;
  const result = await applyChange(operatorId, {
    type: effect.changeType === "create" ? "wiki_create" : "wiki_update",
    targetPageSlug: effect.targetPageSlug,
    targetPageType: effect.targetPageType,
    title: effect.targetPageSlug, // fallback — wiki_update preserves existing title anyway
    proposedContent: d.proposedContent,
    proposedProperties: d.proposedProperties,
    model: d.model ?? "unknown",
  }, extras);
  d.appliedSlug = result.appliedSlug;
}

/** Generic change applier — handles wiki_update, wiki_create, document, settings_change.
 * Returns the slug that was actually written (matters for documents where the slug is generated). */
async function applyChange(
  operatorId: string,
  change: {
    type: string;
    targetPageSlug?: string;
    targetPageType?: string;
    title: string;
    proposedContent: string;
    proposedProperties: Record<string, unknown> | null;
    model: string;
  },
  extras: ApplyExtras,
): Promise<{ appliedSlug: string | null }> {
  switch (change.type) {
    case "wiki_update": {
      if (!change.targetPageSlug) throw new Error("wiki_update requires targetPageSlug");
      await updatePageWithLock(operatorId, change.targetPageSlug, (p) => ({
        content: change.proposedContent,
        properties: change.proposedProperties
          ? { ...(p.properties ?? {}), ...change.proposedProperties }
          : (p.properties ?? {}),
      }));

      // Sync changed properties to DB record if this page is backed by one
      if (change.proposedProperties) {
        await syncProjectFromPropertyChanges(operatorId, change.targetPageSlug, change.proposedProperties);
      }
      return { appliedSlug: change.targetPageSlug };
    }
    case "wiki_create": {
      if (!change.targetPageSlug || !change.targetPageType) {
        throw new Error("wiki_create requires targetPageSlug and targetPageType");
      }
      // Canonical pipeline: cross-refs, citedBy, visibility, verifyPage all fire
      await createPage({
        operatorId,
        slug: change.targetPageSlug,
        title: change.title || change.targetPageSlug,
        pageType: change.targetPageType,
        content: change.proposedContent,
        properties: change.proposedProperties ?? undefined,
        synthesisPath: "idea_execution",
        synthesizedByModel: change.model,
      });

      // Conditionally create the corresponding DB record for project pages.
      // system_job pages are registered via the SystemJobIndex rebuild hook inside createPage (wiki-engine).
      if (change.targetPageType === "project") {
        await createProjectRecord(operatorId, change, extras);
      }
      return { appliedSlug: change.targetPageSlug };
    }
    case "document": {
      // MVP: store as a wiki page of pageType "other" with a document_type marker.
      // Session C.2 or later can integrate actual connector-based document creation.
      const docSlug = change.targetPageSlug
        ?? `document-${Date.now()}-${change.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
      await createPage({
        operatorId,
        slug: docSlug,
        title: change.title,
        pageType: "other",
        content: change.proposedContent,
        properties: {
          ...(change.proposedProperties ?? {}),
          document_type: "idea_output",
        },
        synthesisPath: "idea_execution",
        synthesizedByModel: change.model,
      });
      return { appliedSlug: docSlug };
    }
    case "settings_change": {
      if (!change.targetPageSlug) {
        console.warn("[idea-execution] settings_change without targetPageSlug — skipping");
        return { appliedSlug: null };
      }
      await updatePageWithLock(operatorId, change.targetPageSlug, (p) => ({
        properties: change.proposedProperties
          ? { ...(p.properties ?? {}), ...change.proposedProperties }
          : (p.properties ?? {}),
      }));
      return { appliedSlug: change.targetPageSlug };
    }
    default:
      throw new Error(`Unknown change type: ${change.type}`);
  }
}

// ── State persistence ───────────────────────────────────────────────────────

async function writeExecutionState(
  operatorId: string,
  pageSlug: string,
  state: ExecutionState,
): Promise<void> {
  await updatePageWithLock(operatorId, pageSlug, (p) => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: { ...(p.properties ?? {}), execution_state: state as any },
  }));
}

async function writeConcernState(
  operatorId: string,
  pageSlug: string,
  state: ExecutionState,
): Promise<void> {
  await updatePageWithLock(operatorId, pageSlug, (p) => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: { ...(p.properties ?? {}), status: "concerns_raised", execution_state: state as any },
  }));
}

async function finalizeImplemented(
  operatorId: string,
  pageSlug: string,
  state: ExecutionState,
  ideaTitle: string,
): Promise<void> {
  const pagesModified: string[] = [];
  if (state.primary.status === "applied" && state.primary.appliedSlug) {
    pagesModified.push(state.primary.appliedSlug);
  }
  for (const d of state.downstream) {
    if (d.status === "applied" && d.appliedSlug) {
      pagesModified.push(d.appliedSlug);
    }
  }

  const skippedDownstream = state.downstream
    .filter(d => d.status !== "applied")
    .map(d => d.effect.targetPageSlug);

  const failedDownstream = state.downstream
    .filter(d => d.status === "failed")
    .map(d => d.effect.targetPageSlug);

  await updatePageWithLock(operatorId, pageSlug, (p) => ({
    properties: {
      ...(p.properties ?? {}),
      status: "implemented",
      implemented_at: new Date().toISOString(),
      execution_state: undefined,  // clear transient state
      execution_summary: {
        completedAt: state.completedAt,
        totalCostCents: state.totalCostCents,
        pagesModified,
        skippedDownstream,
        failedDownstream,
      },
    },
  }));

  await sendNotificationToAdmins({
    operatorId,
    type: "idea_implemented",
    title: `Idea pushed: ${ideaTitle.slice(0, 80)}`,
    body: `${pagesModified.length} page(s) modified.${failedDownstream.length > 0 ? ` ${failedDownstream.length} downstream skipped.` : ""}`,
    sourceType: "wiki_page",
    sourceId: pageSlug,
  }).catch(() => {});

  console.log(`[idea-execution] ${pageSlug} → implemented (${pagesModified.length} pages)`);
}

async function notifyConcerns(
  operatorId: string,
  pageSlug: string,
  ideaTitle: string,
  state: ExecutionState,
): Promise<void> {
  const blocking = [
    ...state.crossConcerns,
    ...state.downstream.flatMap(d => d.concerns),
  ].filter(c => c.severity === "blocking").length;
  const warnings = [
    ...state.crossConcerns,
    ...state.downstream.flatMap(d => d.concerns),
  ].filter(c => c.severity === "warning").length;
  const failed = state.downstream.filter(d => d.status === "failed").length;

  await sendNotificationToAdmins({
    operatorId,
    type: "idea_concerns_raised",
    title: `Idea needs review: ${ideaTitle.slice(0, 80)}`,
    body: `${blocking} blocking concern(s), ${warnings} warning(s), ${failed} generation failure(s). Review in the idea panel.`,
    sourceType: "wiki_page",
    sourceId: pageSlug,
  }).catch(() => {});
}

// ── DB record creation helpers (wiki_create) ────────────────────────────────

type WikiCreateChange = {
  targetPageSlug?: string;
  title: string;
  proposedContent: string;
  proposedProperties: Record<string, unknown> | null;
};

async function createProjectRecord(
  operatorId: string,
  change: WikiCreateChange,
  extras: ApplyExtras,
): Promise<void> {
  if (!change.targetPageSlug) return;
  if (!extras.acceptedBy) {
    console.warn(
      `[idea-execution] createProjectRecord: no acceptedBy user; skipping Project DB creation for ${change.targetPageSlug}`,
    );
    return;
  }

  const props = change.proposedProperties ?? {};
  const description = (props.description as string | undefined)
    ?? change.proposedContent.slice(0, 500);
  const dueDateRaw = props.due_date ?? props.target_date ?? props.end_date;
  const dueDate = typeof dueDateRaw === "string" && dueDateRaw.length > 0
    ? new Date(dueDateRaw)
    : null;

  try {
    const project = await prisma.project.create({
      data: {
        operatorId,
        name: change.title || change.targetPageSlug,
        description,
        status: (props.status as string) ?? "active",
        createdById: extras.acceptedBy,
        dueDate,
        config: {
          wikiPageSlug: change.targetPageSlug,
          sourceIdeaSlug: extras.sourceIdeaSlug,
        },
      },
    });

    // Bidirectional link: write projectId back to the wiki page
    await updatePageWithLock(operatorId, change.targetPageSlug, (p) => ({
      properties: {
        ...(p.properties ?? {}),
        project_id: project.id,
      },
    })).catch((err) => {
      console.warn(
        `[idea-execution] Failed to write project_id back to ${change.targetPageSlug}:`,
        err,
      );
    });

    console.log(
      `[idea-execution] Created Project record ${project.id} for wiki page ${change.targetPageSlug}`,
    );
  } catch (err) {
    console.warn(
      `[idea-execution] Project DB creation failed for ${change.targetPageSlug}:`,
      err,
    );
  }
}

// ── Property sync helpers (wiki_update) ─────────────────────────────────────

async function syncProjectFromPropertyChanges(
  operatorId: string,
  wikiPageSlug: string,
  newProperties: Record<string, unknown>,
): Promise<void> {
  // Find Project(s) by wikiPageSlug stored in config JSON
  const projects = await prisma.project.findMany({
    where: {
      operatorId,
      config: { path: ["wikiPageSlug"], equals: wikiPageSlug },
    },
    select: { id: true },
  });
  if (projects.length === 0) return; // no DB record — skip sync

  const updates: Record<string, unknown> = {};
  if (typeof newProperties.status === "string") updates.status = newProperties.status;
  if (typeof newProperties.description === "string") updates.description = newProperties.description;
  const due = newProperties.due_date ?? newProperties.target_date ?? newProperties.end_date;
  if (typeof due === "string" && due.length > 0) updates.dueDate = new Date(due);

  if (Object.keys(updates).length === 0) return;

  for (const p of projects) {
    await prisma.project.update({
      where: { id: p.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: updates as any,
    }).catch((err) => {
      console.warn(`[idea-execution] Project sync failed for ${p.id}:`, err);
    });
  }
}

