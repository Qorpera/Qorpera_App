import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";
import { handleMeetingRequestResolution } from "@/lib/meeting-coordination";
import { getVisibleDomainSlugs } from "@/lib/domain-scope";
import { parseSituationPage } from "@/lib/situation-page-parser";
import { parseActionPlan, appendTimelineEntry, deriveActionPlanStatus } from "@/lib/wiki-execution-engine";
import type { SituationProperties } from "@/lib/situation-wiki-helpers";

import { checkInsightExtractionTrigger } from "@/lib/operational-knowledge";
import { updateWikiOutcomeSignals, updatePageWithLock } from "@/lib/wiki-engine";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id } = await params;

  // ── Wiki-first lookup ─────────────────────────────────────────────────────
  type WikiRow = {
    id: string; slug: string; title: string; content: string;
    properties: SituationProperties | null; crossReferences: string[];
    createdAt: Date; updatedAt: Date;
  };

  const wikiRows = await prisma.$queryRawUnsafe<WikiRow[]>(
    `SELECT id, slug, title, content, properties, "crossReferences",
            "createdAt", "updatedAt"
     FROM "KnowledgePage"
     WHERE "operatorId" = $1
       AND "pageType" = 'situation_instance'
       AND (slug = $2 OR id::text = $2)
     LIMIT 1`,
    operatorId, id,
  );

  if (wikiRows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return handleWikiFirstResponse(wikiRows[0], su, operatorId, id);
}

// ── Wiki-first detail handler ─────────────────────────────────────────────
async function handleWikiFirstResponse(
  page: {
    id: string; slug: string; title: string; content: string;
    properties: SituationProperties | null; crossReferences: string[];
    createdAt: Date; updatedAt: Date;
  },
  su: SessionUser,
  operatorId: string,
  situationId: string,
) {
  const props = page.properties;
  if (!props) {
    return NextResponse.json({ error: "Malformed situation page" }, { status: 500 });
  }

  // Domain scoping check
  const visibleDomains = await getVisibleDomainSlugs(operatorId, su.effectiveUserId);
  if (visibleDomains !== "all" && props.domain) {
    if (!visibleDomains.includes(props.domain)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  // Parse page content
  const parsed = parseSituationPage(page.content, page.properties as Record<string, unknown> | null);
  const actionPlan = parseActionPlan(page.content);

  // Build action plan steps for frontend
  const steps = actionPlan.steps.map((step) => ({
    id: `wiki-step-${step.order}`,
    sequenceOrder: step.order,
    title: step.title,
    description: step.description,
    executionMode: step.actionType,
    status: step.status,
    capabilityName: step.capabilityName ?? null,
    assignedSlug: step.assignedSlug ?? null,
    params: step.params ?? null,
    previewType: step.previewType ?? null,
    result: step.result ?? null,
  }));

  // Resolve cross-references, situation type, and cycles in parallel
  const refSlugs = page.crossReferences.filter(Boolean);
  const [refPages, situationType, cycles] = await Promise.all([
    refSlugs.length > 0
      ? prisma.knowledgePage.findMany({
          where: { operatorId, slug: { in: refSlugs }, scope: "operator" },
          select: { slug: true, title: true, pageType: true },
        })
      : Promise.resolve([]),
    props.situation_type
      ? prisma.situationType.findUnique({
          where: { operatorId_slug: { operatorId, slug: props.situation_type } },
          select: { id: true, name: true, slug: true, description: true, autonomyLevel: true },
        })
      : Promise.resolve(null),
    prisma.situationCycle.findMany({
      where: { situationId },
      orderBy: { cycleNumber: "asc" },
      select: {
        id: true, cycleNumber: true, triggerType: true, triggerSummary: true,
        cycleSummary: true, status: true, completedAt: true, createdAt: true,
      },
    }),
  ]);

  const crossReferences = Object.fromEntries(
    refPages.map((p) => [p.slug, { title: p.title, pageType: p.pageType }]),
  );

  return NextResponse.json({
    id: props.situation_id,
    slug: page.slug,
    _wikiFirst: true,
    situationType,
    severity: props.severity,
    confidence: props.confidence,
    status: props.status,
    source: props.source,
    triggerSummary: page.title,
    domainPageSlug: props.domain ?? null,
    assignedPageSlug: props.assigned_to ?? null,
    autonomyLevel: props.autonomy_level ?? null,
    investigationDepth: "standard",
    wikiContent: parsed.sections,
    wikiProperties: page.properties,
    executionPlanId: null,
    actionPlan: {
      steps,
      totalSteps: steps.length,
      currentStep: props.current_step ?? null,
      status: deriveActionPlanStatus(actionPlan.steps),
    },
    cycles,
    crossReferences,
    createdAt: props.detected_at,
    resolvedAt: props.resolved_at ?? null,
    updatedAt: page.updatedAt.toISOString(),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = await params;
  const body = await req.json();

  // Billing gate: block status changes and edit instructions for non-active operators
  if (body.status !== undefined || body.editInstruction || body.meetingDecision) {
    const operator = await prisma.operator.findUnique({
      where: { id: operatorId },
      select: { billingStatus: true },
    });
    if (operator) {
      const { checkBillingGate } = await import("@/lib/billing-gate");
      const gate = checkBillingGate(operator);
      if (!gate.allowed) {
        return NextResponse.json({ error: gate.reason, code: gate.code }, { status: 403 });
      }
    }
  }

  // ── Wiki-first lookup ─────────────────────────────────────────────────────
  const wikiPage = await prisma.$queryRawUnsafe<Array<{
    id: string; slug: string; content: string;
    properties: SituationProperties | null; version: number;
  }>>(
    `SELECT id, slug, content, properties, version
     FROM "KnowledgePage"
     WHERE "operatorId" = $1
       AND "pageType" = 'situation_instance'
       AND (slug = $2 OR id::text = $2)
     LIMIT 1`,
    operatorId, id,
  );

  if (!wikiPage.length) {
    return NextResponse.json({ error: "Situation not found" }, { status: 404 });
  }
  return handleWikiFirstPatch(wikiPage[0], su, operatorId, id, body);
}

// ── Wiki-first PATCH handler ────────────────────────────────────────────────
async function handleWikiFirstPatch(
  page: { id: string; slug: string; content: string; properties: SituationProperties | null; version: number },
  su: SessionUser,
  operatorId: string,
  id: string,
  body: Record<string, unknown>,
) {
  const { user } = su;
  const props = page.properties;
  if (!props) {
    return NextResponse.json({ error: "Malformed situation page" }, { status: 500 });
  }

  // Domain scoping + situation type resolution (parallel — independent queries)
  const [visibleDomains, situationType] = await Promise.all([
    getVisibleDomainSlugs(operatorId, su.effectiveUserId),
    props.situation_type
      ? prisma.situationType.findUnique({
          where: { operatorId_slug: { operatorId, slug: props.situation_type as string } },
          select: { id: true, slug: true },
        })
      : Promise.resolve(null),
  ]);

  if (visibleDomains !== "all" && props.domain) {
    if (!visibleDomains.includes(props.domain)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  // Meeting request resolution
  if (situationType?.slug === "meeting_request" && body.meetingDecision) {
    try {
      const result = await handleMeetingRequestResolution(
        id, body.meetingDecision as string, (body.resolutionData || {}) as Record<string, unknown>,
      );
      return NextResponse.json({ id, meetingDecision: body.meetingDecision, ...result });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 400 });
    }
  }

  // Parse action plan once (reused in edit, approve, and side-effect paths)
  const actionPlan = parseActionPlan(page.content);

  // ── Edit & Approve flow ─────────────────────────────────────────────────
  if (typeof body.editInstruction === "string" && (body.editInstruction as string).trim()) {
    const instruction = (body.editInstruction as string).trim();

    // Emit correction signal (fire-and-forget)
    emitCorrectionSignal(operatorId, id, instruction, {
      proposedAction: JSON.stringify(actionPlan),
      reasoning: null,
      situationType: situationType ? { slug: situationType.slug } : null,
    }).catch(() => {});

    // Wiki page: set status to detected, append timeline
    await updatePageWithLock(operatorId, page.slug, (current) => ({
      properties: { ...(current.properties ?? {}), status: "detected" },
      content: appendTimelineEntry(current.content, "Edit instruction received, re-reasoning"),
    }));

    enqueueWorkerJob("reason_situation", operatorId, {
      situationId: id, wikiPageSlug: page.slug,
    }).catch((err) =>
      console.error(`[situations-api] Failed to enqueue re-reasoning for ${id}:`, err),
    );
    return NextResponse.json({ id, status: "edit_submitted", message: "Edit instruction saved. Revised proposal will appear shortly." });
  }

  // ── Status changes ─────────────────────────────────��────────────────────
  const wikiPropUpdates: Record<string, unknown> = {};
  let timelineEntry: string | null = null;

  if (body.status !== undefined) {
    const status = body.status as string;
    wikiPropUpdates.status = status;

    if (status === "resolved" || status === "closed") {
      const now = new Date();
      wikiPropUpdates.resolved_at = now.toISOString();
      if (body.outcome !== undefined) wikiPropUpdates.outcome = body.outcome;
      timelineEntry = status === "resolved" ? "Resolved" : "Closed";
    }

    if (status === "approved") {
      timelineEntry = `Approved by ${user.email ?? user.name ?? "user"}`;

      // Dispatch wiki-first step execution
      if (actionPlan.steps.length > 0) {
        enqueueWorkerJob("approve_situation_step", operatorId, {
          wikiPageSlug: page.slug,
          stepOrder: 1,
          userId: user.id,
          action: "approve",
        }).catch(err =>
          console.error(`[situation-patch] Failed to enqueue step approve for ${id}:`, err),
        );
      }
    }

    if (status === "rejected" || status === "dismissed") {
      timelineEntry = status === "rejected" ? "Rejected" : "Dismissed";
    }

    // SituationType side effects
    if (situationType) {
      if (status === "rejected") {
        handleRejectionSideEffects(operatorId, situationType.id, user.id).catch(
          (err) => console.error(`[situation-patch] Rejection side effects failed:`, err),
        );
      }
      if (status === "approved") {
        handleApprovalSideEffects(operatorId, situationType.id, user.id).catch(
          (err) => console.error(`[situation-patch] Approval side effects failed:`, err),
        );
      }
    }
  }

  // Assignment
  if (body.assignedPageSlug !== undefined) {
    if (body.assignedPageSlug !== null) {
      const assignedPage = await prisma.knowledgePage.findFirst({
        where: { operatorId, slug: body.assignedPageSlug as string, scope: "operator" },
        select: { slug: true },
      });
      if (!assignedPage) {
        return NextResponse.json({ error: "Assigned page not found" }, { status: 400 });
      }
    }
    wikiPropUpdates.assigned_to = body.assignedPageSlug;
  }

  // ── Write wiki page (source of truth) ─────────────────────────────────────
  const hasWikiUpdates = Object.keys(wikiPropUpdates).length > 0 || timelineEntry;
  if (hasWikiUpdates) {
    await updatePageWithLock(operatorId, page.slug, (current) => {
      const mergedProps = { ...(current.properties ?? {}), ...wikiPropUpdates };
      const content = timelineEntry
        ? appendTimelineEntry(current.content, timelineEntry)
        : undefined;
      return { properties: mergedProps, ...(content ? { content } : {}) };
    });
  }

  firePatchSideEffects(operatorId, id, body, situationType?.slug ?? null, JSON.stringify(actionPlan));

  const status = body.status as string | undefined;
  return NextResponse.json({ id, status: status ?? props.status });
}

// ── Side-effect helpers ─────────────────────────────────────────────────────

/** Fire all post-PATCH side effects (fire-and-forget). */
function firePatchSideEffects(
  operatorId: string,
  id: string,
  body: Record<string, unknown>,
  situationTypeSlug: string | null,
  proposedActionJson: string | null,
) {
  const status = body.status as string | undefined;

  if (status === "resolved") {
    checkInsightExtractionTrigger(operatorId, null).catch(console.error);
  }

  if (status === "resolved" || status === "closed") {
    import("@/lib/billing-events")
      .then((m) => m.emitSituationBillingEvent(id))
      .catch(console.error);
  }

  if (status === "approved" || status === "rejected" || status === "dismissed") {
    updateWikiOutcomeSignals(id, status).catch((err) =>
      console.error(`[situation-patch] Wiki outcome signals failed for ${id}:`, err),
    );

    enqueueWorkerJob("reflect_on_outcome", operatorId, {
      situationId: id,
      outcome: status,
      feedback: (body.feedback ?? body.feedbackText ?? null) as string | null,
    }).catch((err) =>
      console.error(`[situation-patch] Failed to enqueue reflection for ${id}:`, err),
    );

    prisma.contextEvaluation.updateMany({
      where: { situationId: id, operatorId, outcome: null },
      data: { outcome: status, resolvedAt: new Date() },
    }).catch(() => {});

    emitSystemIntelligenceSignals(operatorId, id, status, {
      reasoning: null,
      proposedAction: proposedActionJson,
      editInstruction: null,
      situationType: situationTypeSlug ? { slug: situationTypeSlug } : null,
    }, body).catch(() => {});
  }
}

async function handleRejectionSideEffects(
  _operatorId: string,
  situationTypeId: string,
  _userId: string,
) {
  const st = await prisma.situationType.findUnique({ where: { id: situationTypeId } });
  if (st) {
    const newProposed = st.totalProposed + 1;
    await prisma.situationType.update({
      where: { id: situationTypeId },
      data: {
        totalProposed: newProposed,
        consecutiveApprovals: 0,
        approvalRate: newProposed > 0 ? st.totalApproved / newProposed : 0,
        dismissedCount: { increment: 1 },
      },
    }).catch(() => {});
  }
}

async function handleApprovalSideEffects(
  _operatorId: string,
  situationTypeId: string,
  _userId: string,
) {
  const st = await prisma.situationType.findUnique({ where: { id: situationTypeId } });
  if (st) {
    const newProposed = st.totalProposed + 1;
    const newApproved = st.totalApproved + 1;
    await prisma.situationType.update({
      where: { id: situationTypeId },
      data: {
        totalProposed: newProposed,
        totalApproved: newApproved,
        consecutiveApprovals: st.consecutiveApprovals + 1,
        approvalRate: newProposed > 0 ? newApproved / newProposed : 0,
        confirmedCount: { increment: 1 },
      },
    }).catch(() => {});
  }
}

async function emitCorrectionSignal(
  operatorId: string,
  situationId: string,
  editInstruction: string,
  situation: { proposedAction: string | null; reasoning: string | null; situationType: { slug: string } | null },
) {
  const { emitSystemSignal } = await import("@/lib/system-intelligence-signals");
  const evals = await prisma.contextEvaluation.findMany({
    where: { situationId, operatorId },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { contextSections: true, citedSections: true },
  });

  const sections = Array.isArray(evals[0]?.contextSections) ? evals[0].contextSections as any[] : [];
  const cited = Array.isArray(evals[0]?.citedSections) ? evals[0].citedSections as any[] : [];
  const citedSlugs = cited.map((c: any) => c.id || c.slug).filter(Boolean);

  const systemPagesCited = sections
    .filter((s: any) => (s.source === "system" || s.type === "system_wiki_page") && citedSlugs.includes(s.slug || s.id))
    .map((s: any) => ({ slug: s.slug || s.id, title: s.title }));

  let originalPlan: unknown = null;
  try { originalPlan = situation.proposedAction ? JSON.parse(situation.proposedAction) : null; } catch {}

  let reasoningAnalysis: string | null = null;
  if (situation.reasoning) {
    try { reasoningAnalysis = JSON.parse(situation.reasoning).analysis?.slice(0, 1000) ?? null; } catch {}
  }

  const payload = {
    situationId,
    editInstruction,
    originalPlan,
    reasoningAnalysis,
    allSystemPagesCited: systemPagesCited.map((p: any) => p.slug),
  };

  if (systemPagesCited.length > 0) {
    for (const page of systemPagesCited) {
      await emitSystemSignal({
        operatorId,
        signalType: "correction_signal",
        systemPageSlug: page.slug,
        systemPageTitle: page.title,
        situationTypeSlug: situation.situationType?.slug ?? undefined,
        payload,
      });
    }
  } else {
    await emitSystemSignal({
      operatorId,
      signalType: "correction_signal",
      situationTypeSlug: situation.situationType?.slug ?? undefined,
      payload: { ...payload, noSystemPagesInContext: true },
    });
  }
}

async function emitSystemIntelligenceSignals(
  operatorId: string,
  situationId: string,
  outcome: string,
  situation: { reasoning: string | null; proposedAction: string | null; editInstruction: string | null; situationType: { slug: string } | null } | null,
  body: Record<string, unknown>,
) {
  const { emitSystemSignal } = await import("@/lib/system-intelligence-signals");
  const evals = await prisma.contextEvaluation.findMany({
    where: { situationId, operatorId },
    select: { contextSections: true, citedSections: true },
  });

  let reasoningAnalysis: string | null = null;
  let proposedAction: unknown = null;
  if (situation?.reasoning) {
    try { reasoningAnalysis = JSON.parse(situation.reasoning).analysis?.slice(0, 1000) ?? null; } catch {}
  }
  if (situation?.proposedAction) {
    try { proposedAction = JSON.parse(situation.proposedAction); } catch {}
  }

  for (const eval_ of evals) {
    const sections = Array.isArray(eval_.contextSections) ? eval_.contextSections as any[] : [];
    const cited = Array.isArray(eval_.citedSections) ? eval_.citedSections as any[] : [];
    const citedIds = new Set(cited.map((c: any) => c.id));
    const systemSections = sections.filter((s: any) => s.type === "system_wiki_page" || s.source === "system");

    for (const section of systemSections) {
      const wasCited = citedIds.has(section.id || section.slug);
      if (wasCited && outcome === "approved") {
        await emitSystemSignal({
          operatorId,
          signalType: "positive_citation",
          systemPageSlug: section.slug || section.id,
          systemPageTitle: section.title,
          situationTypeSlug: situation?.situationType?.slug,
          payload: {
            situationId,
            outcome: "approved",
            wasEdited: !!situation?.editInstruction,
            allSystemPagesCited: systemSections.map((s: any) => s.slug || s.id),
          },
        });
      } else if (wasCited && (outcome === "rejected" || outcome === "dismissed")) {
        await emitSystemSignal({
          operatorId,
          signalType: "negative_citation",
          systemPageSlug: section.slug || section.id,
          systemPageTitle: section.title,
          situationTypeSlug: situation?.situationType?.slug,
          payload: {
            situationId,
            outcome,
            feedback: (body.feedback ?? null) as string | null,
            feedbackCategory: (body.feedbackCategory ?? null) as string | null,
            reasoningAnalysis,
            proposedAction,
            allSystemPagesCited: systemSections.map((s: any) => s.slug || s.id),
          },
        });
      }
    }
  }
}

