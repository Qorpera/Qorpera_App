import { prisma } from "@/lib/db";
import { callLLM, getModel, getThinkingBudget } from "@/lib/ai-provider";
import { extractJSON } from "@/lib/json-helpers";
import { updatePageWithLock, resolvePageSlug } from "@/lib/wiki-engine";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import {
  parseActionPlan,
  renderActionPlan,
  replaceSection,
  type ParsedActionStep,
} from "@/lib/wiki-execution-engine";
import { parseSituationPage } from "@/lib/situation-page-parser";
import {
  ForkSchema,
  type Fork,
  type OpenQuestion,
  type AutoAppliedDecision,
  type AnsweredDecision,
  type Decision,
  type DeliberationPassOutput,
} from "@/lib/deliberation-types";
import {
  renderDecisionsSection,
  renderOpenQuestionsSection,
  parseOpenQuestionsSection,
  parseDecisionsSection,
  forkToOpenQuestion,
} from "@/lib/clarification-helpers";
import {
  readLearnedPreferences,
  recordDecision,
  meetsAutoApplyThreshold,
  buildPreferenceId,
} from "@/lib/learned-preferences";
import {
  buildForkIdentificationPrompt,
  buildDraftRefinementPrompt,
  type DraftingContext,
} from "@/lib/deliberation-prompts";
import { z } from "zod";

const CLARIFICATION_CAP = 2;

// ── Main orchestrator ────────────────────────────────────────────────────────

export async function runDeliberationPass(
  operatorId: string,
  situationSlug: string,
): Promise<DeliberationPassOutput | null> {
  const startedAt = Date.now();

  // 1. Load situation page
  const page = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug: situationSlug, pageType: "situation_instance" },
    select: { content: true, title: true, properties: true },
  });
  if (!page) {
    console.warn(`[deliberation-pass] Situation page not found: ${situationSlug}`);
    return null;
  }

  const parsed = parseSituationPage(page.content, page.properties as Record<string, unknown> | null);
  const plan = parseActionPlan(page.content);

  // 2. Identify eligible steps (action steps with drafted text OR generate steps)
  const eligibleSteps = plan.steps.filter(s =>
    (s.actionType === "api_action" && hasDraftedText(s.params)) ||
    s.actionType === "generate"
  );
  if (eligibleSteps.length === 0) {
    console.log(`[deliberation-pass] ${situationSlug} has no eligible steps — skipping`);
    return null;
  }

  // 3. Load drafting context
  const situationTypeSlug = (page.properties as Record<string, unknown>)?.situation_type as string | undefined;
  if (!situationTypeSlug) {
    console.warn(`[deliberation-pass] ${situationSlug} has no situation_type property — skipping`);
    return null;
  }

  const context = await loadDraftingContext(operatorId, page.content, parsed, eligibleSteps, situationTypeSlug);

  // 4. Identify forks via LLM
  let apiCostCents = 0;
  const forksResult = await identifyForks(operatorId, context, eligibleSteps);
  apiCostCents += forksResult.apiCostCents;

  // 5. Match forks against learned preferences
  const nowIso = new Date().toISOString();
  const autoApplied: AutoAppliedDecision[] = [];
  const openQuestions: OpenQuestion[] = [];

  for (const fork of forksResult.forks) {
    const matchingPref = context.learnedPreferences.find(
      p => p.dimension === fork.dimension &&
           p.scope.type === fork.preferenceScope.type &&
           p.scope.scopeSlug === fork.preferenceScope.scopeSlug,
    );

    if (matchingPref && meetsAutoApplyThreshold(matchingPref, nowIso)) {
      autoApplied.push({
        id: `dec-${fork.id}`,
        dimension: fork.dimension,
        choice: matchingPref.preferredChoice,
        basis: `Learned preference — ${matchingPref.preferredChoice} (confidence ${matchingPref.confidence.toFixed(2)}, sample ${matchingPref.recencyWeightedSample.toFixed(1)}, last updated ${matchingPref.lastUpdatedAt.slice(0, 10)})`,
        affectedStepOrders: fork.affectedStepOrders,
        preferenceScope: fork.preferenceScope,
        preferenceId: matchingPref.id,
        confidenceAtApplication: matchingPref.confidence,
        appliedAt: nowIso,
      });
      continue;
    }

    // Raise as open question, respecting the cap
    if (openQuestions.length >= CLARIFICATION_CAP) {
      console.warn(`[deliberation-pass] Fork "${fork.dimension}" capped — making silent default choice`);
      // Silently pick option 0 as the default, log it as auto-applied with a "capped" basis
      autoApplied.push({
        id: `dec-${fork.id}`,
        dimension: fork.dimension,
        choice: fork.options[0].label,
        basis: `Clarification cap reached (${CLARIFICATION_CAP}) — system defaulted to first option to avoid overloading the operator`,
        affectedStepOrders: fork.affectedStepOrders,
        preferenceScope: fork.preferenceScope,
        preferenceId: buildPreferenceId(fork.dimension, fork.preferenceScope.scopeSlug),
        confidenceAtApplication: 0,
        appliedAt: nowIso,
      });
      continue;
    }

    const priorCustom = matchingPref?.priorCustomAnswers[0] ?? null;
    openQuestions.push(forkToOpenQuestion(fork, nowIso, priorCustom));
  }

  // 6. Determine which step orders become awaiting_clarification
  const blockedStepOrders = new Set<number>();
  for (const q of openQuestions) {
    for (const order of q.affectedStepOrders) blockedStepOrders.add(order);
  }

  // 7. Refine drafts for NON-blocked steps
  const stepsToRefine = eligibleSteps.filter(s => !blockedStepOrders.has(s.order)).map(s => s.order);
  const refineResult = stepsToRefine.length > 0
    ? await refineDraftedContent(operatorId, context, plan.steps, autoApplied, stepsToRefine)
    : { refinedParams: new Map<number, Record<string, unknown>>(), apiCostCents: 0 };
  apiCostCents += refineResult.apiCostCents;

  // 8. Rewrite the situation page atomically
  await updatePageWithLock(operatorId, situationSlug, (p) => {
    const currentPlan = parseActionPlan(p.content);
    for (const step of currentPlan.steps) {
      if (refineResult.refinedParams.has(step.order)) {
        step.params = refineResult.refinedParams.get(step.order);
      }
      if (blockedStepOrders.has(step.order)) {
        step.status = "awaiting_clarification";
      }
    }

    const newPlanSection = renderActionPlan(currentPlan.steps);
    let content = replaceSection(p.content, "Action Plan", newPlanSection);

    const decisionsSection = renderDecisionsSection(autoApplied.map(d => ({ ...d, kind: "auto_applied" as const })));
    if (decisionsSection) content = upsertSection(content, "Decisions", decisionsSection);

    const openQuestionsSection = renderOpenQuestionsSection(openQuestions);
    if (openQuestionsSection) content = upsertSection(content, "Open Questions", openQuestionsSection);
    else content = removeSection(content, "Open Questions");

    return { content };
  });

  // 9. Record auto-applied decisions as learned preference updates
  for (const d of autoApplied) {
    await recordDecision(operatorId, {
      dimension: d.dimension,
      choice: d.choice,
      timestamp: nowIso,
      isCustomAnswer: false,
      scope: d.preferenceScope,
    }).catch(err => console.warn(`[deliberation-pass] recordDecision failed:`, err));
  }

  // 10. Notify operator if clarifications raised
  if (openQuestions.length > 0) {
    sendNotificationToAdmins({
      operatorId,
      type: "clarification_raised",
      title: `${openQuestions.length} question${openQuestions.length > 1 ? "s" : ""} on ${page.title}`,
      body: `Answer ${openQuestions.length > 1 ? "them" : "it"} on the situation to unblock action steps.`,
      sourceType: "wiki_page",
      sourceId: situationSlug,
    }).catch(() => {});
  }

  const output: DeliberationPassOutput = {
    situationSlug,
    completedAt: nowIso,
    openQuestions,
    autoAppliedDecisions: autoApplied,
    awaitingStepOrders: Array.from(blockedStepOrders).sort((a, b) => a - b),
    refinedStepOrders: stepsToRefine,
    apiCostCents: Math.round(apiCostCents),
    durationMs: Date.now() - startedAt,
  };

  console.log(`[deliberation-pass] ${situationSlug} complete: ${openQuestions.length} questions, ${autoApplied.length} auto-applied, ${stepsToRefine.length} refined, $${(output.apiCostCents / 100).toFixed(2)}, ${output.durationMs}ms`);

  return output;
}

// ── Answer a clarification ───────────────────────────────────────────────────

export async function answerClarification(
  operatorId: string,
  situationSlug: string,
  questionId: string,
  choice: string,
  isCustomAnswer: boolean,
  answeredByUserId: string,
): Promise<void> {
  const answeredAt = new Date().toISOString();

  // Resolve the answering user's page slug for audit rendering
  const user = await prisma.user.findUnique({
    where: { id: answeredByUserId },
    select: { email: true, name: true },
  });
  const answeredBySlug = user ? await resolvePageSlug(operatorId, user.email ?? undefined, user.name ?? undefined) : null;

  // Load the open question from the page + rewrite
  let answeredQuestion: OpenQuestion | null = null;

  await updatePageWithLock(operatorId, situationSlug, (page) => {
    if (page.pageType !== "situation_instance") return {};

    const parsed = parseSituationPage(page.content, page.properties as Record<string, unknown> | null);
    const openQuestions = parsed.sections.openQuestions
      ? parseOpenQuestionsSection(parsed.sections.openQuestions)
      : [];

    const question = openQuestions.find(q => q.id === questionId);
    if (!question) {
      console.warn(`[deliberation-pass] answerClarification: question ${questionId} not found on ${situationSlug}`);
      return {};
    }
    answeredQuestion = question;

    // Build the AnsweredDecision
    const answered: AnsweredDecision = {
      id: `dec-${question.id}`,
      dimension: question.dimension,
      question: question.question,
      raisedAt: question.raisedAt,
      answeredAt,
      answeredByUserId,
      answeredBySlug,
      choice,
      isCustomAnswer,
      affectedStepOrders: question.affectedStepOrders,
      preferenceScope: question.preferenceScope,
    };

    // Append to Decisions section
    const existingDecisions = parsed.sections.decisions
      ? parseDecisionsSection(parsed.sections.decisions)
      : [];
    const mergedDecisions: Decision[] = [...existingDecisions, { ...answered, kind: "answered" }];

    // Remove the question from Open Questions
    const remainingQuestions = openQuestions.filter(q => q.id !== questionId);

    // Unblock affected steps (pending status; refinement happens below asynchronously)
    const currentPlan = parseActionPlan(page.content);
    for (const step of currentPlan.steps) {
      if (question.affectedStepOrders.includes(step.order) && step.status === "awaiting_clarification") {
        step.status = "pending";
      }
    }

    let content = page.content;
    content = replaceSection(content, "Action Plan", renderActionPlan(currentPlan.steps));
    content = upsertSection(content, "Decisions", renderDecisionsSection(mergedDecisions));
    if (remainingQuestions.length > 0) {
      content = upsertSection(content, "Open Questions", renderOpenQuestionsSection(remainingQuestions));
    } else {
      content = removeSection(content, "Open Questions");
    }

    return { content };
  });

  if (!answeredQuestion) return;
  const q: OpenQuestion = answeredQuestion;

  // Record the decision in learned preferences
  await recordDecision(operatorId, {
    dimension: q.dimension,
    choice,
    timestamp: answeredAt,
    isCustomAnswer,
    scope: q.preferenceScope,
  }).catch(err => console.warn(`[deliberation-pass] recordDecision on answer failed:`, err));

  // Send resolved notification
  sendNotificationToAdmins({
    operatorId,
    type: "clarification_resolved",
    title: `Question resolved on situation`,
    body: `"${q.dimension}" → ${choice}`,
    sourceType: "wiki_page",
    sourceId: situationSlug,
  }).catch(() => {});

  // Trigger partial re-deliberation for the unblocked steps
  const { enqueueWorkerJob } = await import("@/lib/worker-dispatch");
  await enqueueWorkerJob("run_partial_deliberation_pass", operatorId, {
    operatorId,
    situationSlug,
    unblockedStepOrders: q.affectedStepOrders,
  });
}

// ── Partial re-run for unblocked steps ───────────────────────────────────────

export async function runPartialDeliberationPass(
  operatorId: string,
  situationSlug: string,
  unblockedStepOrders: number[],
): Promise<void> {
  const page = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug: situationSlug, pageType: "situation_instance" },
    select: { content: true, properties: true },
  });
  if (!page) return;

  const parsed = parseSituationPage(page.content, page.properties as Record<string, unknown> | null);
  const plan = parseActionPlan(page.content);
  const stepsToRefine = plan.steps.filter(s => unblockedStepOrders.includes(s.order));
  if (stepsToRefine.length === 0) return;

  const situationTypeSlug = (page.properties as Record<string, unknown>)?.situation_type as string | undefined;
  if (!situationTypeSlug) return;

  const context = await loadDraftingContext(operatorId, page.content, parsed, stepsToRefine, situationTypeSlug);

  // Load all decisions on the page — both auto-applied and answered — to pass as resolvedDecisions
  const decisions = parsed.sections.decisions
    ? parseDecisionsSection(parsed.sections.decisions)
    : [];
  const resolvedDecisions = decisions.map(d => ({
    dimension: d.dimension,
    choice: d.choice,
    affectedStepOrders: d.affectedStepOrders,
  }));

  const refineResult = await refineDraftedContent(operatorId, context, plan.steps, resolvedDecisions, unblockedStepOrders);

  await updatePageWithLock(operatorId, situationSlug, (p) => {
    const currentPlan = parseActionPlan(p.content);
    for (const step of currentPlan.steps) {
      if (refineResult.refinedParams.has(step.order)) {
        step.params = refineResult.refinedParams.get(step.order);
      }
    }
    const newPlanSection = renderActionPlan(currentPlan.steps);
    return { content: replaceSection(p.content, "Action Plan", newPlanSection) };
  });
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function hasDraftedText(params: Record<string, unknown> | undefined): boolean {
  if (!params) return false;
  const textFields = ["body", "message", "text", "content", "description"];
  for (const f of textFields) {
    const v = params[f];
    if (typeof v === "string" && v.length > 20) return true;
  }
  return false;
}

async function loadDraftingContext(
  operatorId: string,
  situationContent: string,
  _parsed: ReturnType<typeof parseSituationPage>,
  steps: ParsedActionStep[],
  situationTypeSlug: string,
): Promise<DraftingContext> {
  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { companyName: true },
  });
  const senderName = operator?.companyName ?? "the company";

  // Extract recipients from step params
  const recipientHints = new Set<string>();
  for (const step of steps) {
    const p = step.params ?? {};
    for (const field of ["to", "recipient", "email", "contactEmail"]) {
      const v = p[field];
      if (typeof v === "string" && v.length > 0) recipientHints.add(v);
    }
  }

  // Resolve each recipient hint to a wiki page slug
  const recipientSlugs: string[] = [];
  for (const hint of recipientHints) {
    const slug = await resolvePageSlug(operatorId, hint, undefined);
    if (slug) recipientSlugs.push(slug);
  }

  // Load communication_pattern pages for recipients (if any)
  const recipientPatterns: DraftingContext["recipientPatterns"] = [];
  for (const slug of recipientSlugs) {
    const patternPage = await prisma.knowledgePage.findFirst({
      where: { operatorId, slug, pageType: "communication_pattern" },
      select: { content: true, title: true },
    });
    if (patternPage) recipientPatterns.push({ slug, title: patternPage.title, content: patternPage.content });
  }

  // Sender voice samples — use existing loadCommunicationContext
  let senderVoiceSamples: DraftingContext["senderVoiceSamples"] = [];
  try {
    const { loadCommunicationContext } = await import("@/lib/context-assembly");
    const commContext = await loadCommunicationContext(operatorId, `outbound from ${senderName}`, 5);
    senderVoiceSamples = commContext.excerpts.map(e => {
      const meta = e.metadata as Record<string, unknown>;
      return {
        excerpt: e.content,
        recipient: (meta.recipient as string) ?? (meta.subject as string) ?? "—",
        timestamp: (meta.timestamp as string) ?? "—",
      };
    });
  } catch (err) {
    console.warn(`[deliberation-pass] Sender voice sampling failed, proceeding without:`, err);
  }

  // Learned preferences
  const personSlug = recipientSlugs[0] ?? null; // Primary recipient (simple heuristic for v1)
  const learnedPreferences = await readLearnedPreferences(operatorId, personSlug, situationTypeSlug);

  // Situation type name
  const typePage = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug: situationTypeSlug, pageType: "situation_type_playbook" },
    select: { title: true },
  });

  return {
    situationPageContent: situationContent.slice(0, 8000),
    senderName,
    recipientPatterns,
    senderVoiceSamples,
    learnedPreferences,
    situationTypeName: typePage?.title ?? situationTypeSlug,
  };
}

const ForkListSchema = z.object({ forks: z.array(ForkSchema.extend({ id: z.string().optional() })) });

async function identifyForks(
  operatorId: string,
  context: DraftingContext,
  steps: ParsedActionStep[],
): Promise<{ forks: Fork[]; apiCostCents: number }> {
  const prompt = buildForkIdentificationPrompt({ context, steps });
  const model = getModel("deliverableDraftRefinement");
  const thinkingBudget = getThinkingBudget("deliverableDraftRefinement");

  const response = await callLLM({
    operatorId,
    instructions: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
    aiFunction: "reasoning",
    model,
    thinking: true,
    thinkingBudget: thinkingBudget ?? undefined,
    temperature: 0.2,
  });

  const parsedJson = extractJSON(response.text) as unknown;
  const parsed = ForkListSchema.safeParse(parsedJson);
  if (!parsed.success) {
    console.warn(`[deliberation-pass] Fork identification returned invalid JSON — treating as zero forks:`, parsed.error.issues);
    return { forks: [], apiCostCents: response.apiCostCents ?? 0 };
  }

  // Assign stable IDs
  const forks: Fork[] = parsed.data.forks.map((f, i) => ({
    ...(f as Fork),
    id: f.id ?? `fork-${Date.now()}-${i}`,
  }));

  return { forks, apiCostCents: response.apiCostCents ?? 0 };
}

const RefinedStepsSchema = z.object({
  refinedSteps: z.array(z.object({
    order: z.number().int().positive(),
    params: z.record(z.string(), z.unknown()),
  })),
});

async function refineDraftedContent(
  operatorId: string,
  context: DraftingContext,
  allSteps: ParsedActionStep[],
  resolvedDecisions: Array<{ dimension: string; choice: string; affectedStepOrders: number[] }>,
  stepsToRefine: number[],
): Promise<{ refinedParams: Map<number, Record<string, unknown>>; apiCostCents: number }> {
  if (stepsToRefine.length === 0) return { refinedParams: new Map(), apiCostCents: 0 };

  const prompt = buildDraftRefinementPrompt({
    context,
    steps: allSteps,
    resolvedDecisions,
    stepsToRefine,
  });
  const model = getModel("deliverableDraftRefinement");
  const thinkingBudget = getThinkingBudget("deliverableDraftRefinement");

  const response = await callLLM({
    operatorId,
    instructions: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
    aiFunction: "reasoning",
    model,
    thinking: true,
    thinkingBudget: thinkingBudget ?? undefined,
    temperature: 0.3,
  });

  const parsedJson = extractJSON(response.text) as unknown;
  const parsed = RefinedStepsSchema.safeParse(parsedJson);
  const refinedParams = new Map<number, Record<string, unknown>>();
  if (!parsed.success) {
    console.warn(`[deliberation-pass] Draft refinement returned invalid JSON — steps left unrefined:`, parsed.error.issues);
    return { refinedParams, apiCostCents: response.apiCostCents ?? 0 };
  }
  for (const r of parsed.data.refinedSteps) {
    refinedParams.set(r.order, r.params);
  }

  return { refinedParams, apiCostCents: response.apiCostCents ?? 0 };
}

// ── Section helpers (local copy — same as learned-preferences.ts) ────────────

function upsertSection(pageContent: string, sectionName: string, newSectionContent: string): string {
  const headerRegex = new RegExp(`^##\\s+${sectionName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*$`, "m");
  const match = headerRegex.exec(pageContent);

  if (!match) {
    return pageContent.trimEnd() + "\n\n" + newSectionContent.trim() + "\n";
  }

  const before = pageContent.slice(0, match.index);
  const afterHeader = pageContent.slice(match.index + match[0].length);
  const nextSectionMatch = /^##\s/m.exec(afterHeader);
  const after = nextSectionMatch ? afterHeader.slice(nextSectionMatch.index) : "";

  return before.trimEnd() + "\n\n" + newSectionContent.trim() + "\n\n" + after.trimStart();
}

function removeSection(pageContent: string, sectionName: string): string {
  const headerRegex = new RegExp(`^##\\s+${sectionName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*$`, "m");
  const match = headerRegex.exec(pageContent);
  if (!match) return pageContent;

  const before = pageContent.slice(0, match.index);
  const afterHeader = pageContent.slice(match.index + match[0].length);
  const nextSectionMatch = /^##\s/m.exec(afterHeader);
  const after = nextSectionMatch ? afterHeader.slice(nextSectionMatch.index) : "";

  return before.trimEnd() + "\n\n" + after.trimStart();
}
