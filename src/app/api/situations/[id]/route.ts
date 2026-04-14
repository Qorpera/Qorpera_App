import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkGraduation, checkDemotion, checkPersonalGraduation, checkPersonalDemotion } from "@/lib/autonomy-graduation";
import { resumeAfterSituationResolution } from "@/lib/execution-engine";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";
import { handleMeetingRequestResolution } from "@/lib/meeting-coordination";
import { getVisibleDomainIds, getVisibleDomainSlugs } from "@/lib/domain-scope";
import { recheckWorkStreamStatus } from "@/lib/workstreams";
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
       AND properties->>'situation_id' = $2
     LIMIT 1`,
    operatorId, id,
  );

  if (wikiRows.length > 0) {
    return handleWikiFirstResponse(wikiRows[0], su, operatorId, id);
  }

  // ── Legacy fallback (pre-migration situations) ────────────────────────────
  return handleLegacyResponse(su, operatorId, id);
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

// ── Legacy detail handler (Situation table) ─────────────────────────────────
async function handleLegacyResponse(
  su: SessionUser,
  operatorId: string,
  id: string,
) {
  const situation = await prisma.situation.findFirst({
    where: { id, operatorId },
    include: { situationType: true },
  });

  if (!situation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Scope check: deny if situation's type is scoped to a department the user can't see
  const visibleDomains = await getVisibleDomainIds(operatorId, su.effectiveUserId);
  if (visibleDomains !== "all") {
    const scopeDept = situation.situationType?.scopeEntityId;
    if (scopeDept && !visibleDomains.includes(scopeDept)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  let contextSnapshot = null;
  try { contextSnapshot = situation.contextSnapshot ? JSON.parse(situation.contextSnapshot) : null; } catch { contextSnapshot = null; }

  let triggerEvidence = null;
  try { triggerEvidence = situation.triggerEvidence ? JSON.parse(situation.triggerEvidence) : null; } catch { triggerEvidence = null; }

  let triggerPage = null;
  if (situation.triggerPageSlug) {
    const page = await prisma.knowledgePage.findFirst({
      where: { operatorId, slug: situation.triggerPageSlug, scope: "operator" },
      select: { slug: true, title: true, pageType: true, content: true, crossReferences: true, confidence: true },
    });
    if (page) {
      triggerPage = page;
    }
  }

  return NextResponse.json({
    id: situation.id,
    situationType: {
      id: situation.situationType.id,
      name: situation.situationType.name,
      slug: situation.situationType.slug,
      description: situation.situationType.description,
      autonomyLevel: situation.situationType.autonomyLevel,
    },
    severity: situation.severity,
    confidence: situation.confidence,
    status: situation.status,
    source: situation.source,
    triggerEntityId: situation.triggerEntityId,
    triggerPageSlug: situation.triggerPageSlug,
    triggerPage,
    triggerEventId: situation.triggerEventId,
    contextSnapshot,
    triggerEvidence,
    triggerSummary: situation.triggerSummary ?? null,
    resumeSummary: situation.resumeSummary ?? null,
    domainPageSlug: situation.domainPageSlug,
    assignedPageSlug: situation.assignedPageSlug,
    investigationDepth: situation.investigationDepth,
    analysisDocument: situation.analysisDocument ?? null,
    reasoning: situation.reasoning ? JSON.parse(situation.reasoning) : null,
    proposedAction: situation.proposedAction ? JSON.parse(situation.proposedAction) : null,
    executionPlanId: situation.executionPlanId,
    actionTaken: situation.actionTaken ? JSON.parse(situation.actionTaken) : null,
    outcome: situation.outcome,
    outcomeDetails: situation.outcomeDetails,
    feedback: situation.feedback,
    feedbackRating: situation.feedbackRating,
    feedbackCategory: situation.feedbackCategory,
    editInstruction: situation.editInstruction,
    resolvedAt: situation.resolvedAt?.toISOString() ?? null,
    createdAt: situation.createdAt.toISOString(),
    cycles: await prisma.situationCycle.findMany({
      where: { situationId: situation.id },
      orderBy: { cycleNumber: "asc" },
      select: {
        id: true,
        cycleNumber: true,
        triggerType: true,
        triggerSummary: true,
        cycleSummary: true,
        status: true,
        completedAt: true,
        createdAt: true,
        executionPlan: {
          select: {
            id: true,
            status: true,
            steps: {
              orderBy: { sequenceOrder: "asc" },
              select: {
                id: true,
                title: true,
                description: true,
                executionMode: true,
                status: true,
                assignedUserId: true,
                outputResult: true,
                executedAt: true,
              },
            },
          },
        },
      },
    }),
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
       AND properties->>'situation_id' = $2
     LIMIT 1`,
    operatorId, id,
  );

  if (wikiPage.length > 0) {
    return handleWikiFirstPatch(wikiPage[0], su, operatorId, id, body);
  }

  // ── Legacy fallback ───────────────────────────────────────────────────────
  return handleLegacyPatch(su, operatorId, id, body);
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

  // Domain scoping + thin record (parallel — independent queries)
  const [visibleDomains, thinSituation] = await Promise.all([
    getVisibleDomainSlugs(operatorId, su.effectiveUserId),
    prisma.situation.findFirst({
      where: { id, operatorId },
      include: { situationType: { select: { scopeEntityId: true, slug: true, id: true } } },
    }),
  ]);

  if (visibleDomains !== "all" && props.domain) {
    if (!visibleDomains.includes(props.domain)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  // Meeting request resolution — uses thin record's situationType
  if (thinSituation?.situationType?.slug === "meeting_request" && body.meetingDecision) {
    try {
      const result = await handleMeetingRequestResolution(
        id, body.meetingDecision as string, (body.resolutionData || {}) as Record<string, unknown>,
      );
      if (result.resolved) {
        resumeAfterSituationResolution(id).catch(err =>
          console.error(`[situation-patch] Resume after meeting resolution failed:`, err),
        );
      }
      return NextResponse.json({ id, meetingDecision: body.meetingDecision, ...result });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 400 });
    }
  }

  // ── Edit & Approve flow ─────────────────────────────────────────────────
  if (typeof body.editInstruction === "string" && (body.editInstruction as string).trim()) {
    const instruction = (body.editInstruction as string).trim();

    // Emit correction signal (fire-and-forget, reads thin record)
    if (thinSituation?.proposedAction) {
      emitCorrectionSignal(operatorId, id, instruction, thinSituation).catch(() => {});
    }

    // Wiki page: set status to detected, append timeline
    await updatePageWithLock(operatorId, page.slug, (current) => ({
      properties: { ...(current.properties ?? {}), status: "detected" },
      content: appendTimelineEntry(current.content, "Edit instruction received, re-reasoning"),
    }));

    // Thin record update (fire-and-forget)
    prisma.situation.update({
      where: { id },
      data: { editInstruction: instruction, status: "detected" },
    }).catch((err) => console.error(`[situation-patch] Thin record edit update failed:`, err));

    enqueueWorkerJob("reason_situation", operatorId, {
      situationId: id, wikiPageSlug: page.slug,
    }).catch((err) =>
      console.error(`[situations-api] Failed to enqueue re-reasoning for ${id}:`, err),
    );
    return NextResponse.json({ id, status: "edit_submitted", message: "Edit instruction saved. Revised proposal will appear shortly." });
  }

  // ── Status changes ──────────────────────────────────────────────────────
  const thinUpdates: Record<string, unknown> = {};
  const wikiPropUpdates: Record<string, unknown> = {};
  let timelineEntry: string | null = null;

  if (body.status !== undefined) {
    const status = body.status as string;
    wikiPropUpdates.status = status;
    thinUpdates.status = status;

    if (status === "resolved" || status === "closed") {
      const now = new Date();
      wikiPropUpdates.resolved_at = now.toISOString();
      if (body.outcome !== undefined) wikiPropUpdates.outcome = body.outcome;
      thinUpdates.resolvedAt = now;
      timelineEntry = status === "resolved" ? "Resolved" : "Closed";
    }

    if (status === "approved") {
      timelineEntry = `Approved by ${user.email ?? user.name ?? "user"}`;
      thinUpdates.assignedUserId = user.id;

      // Dispatch wiki-first step execution
      const plan = parseActionPlan(page.content);
      if (plan.steps.length > 0) {
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

    // SituationType + autonomy side effects (use thin record's situationTypeId)
    if (thinSituation) {
      if (status === "rejected") {
        handleRejectionSideEffects(operatorId, thinSituation.situationTypeId, user.id).catch(
          (err) => console.error(`[situation-patch] Rejection side effects failed:`, err),
        );
      }
      if (status === "approved") {
        handleApprovalSideEffects(operatorId, thinSituation.situationTypeId, user.id).catch(
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
    thinUpdates.assignedPageSlug = body.assignedPageSlug;
  }

  // Feedback fields → thin record (for side effects that read these)
  if (body.feedback !== undefined) thinUpdates.feedback = body.feedback;
  if (body.feedbackRating !== undefined) thinUpdates.feedbackRating = body.feedbackRating;
  if (body.feedbackCategory !== undefined) thinUpdates.feedbackCategory = body.feedbackCategory;
  if (body.outcome !== undefined) thinUpdates.outcome = body.outcome;
  if (body.outcomeDetails !== undefined) thinUpdates.outcomeDetails = JSON.stringify(body.outcomeDetails);
  if (body.outcomeNote !== undefined) thinUpdates.outcomeDetails = JSON.stringify({ note: body.outcomeNote });

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

  // ── Write thin Situation record (for side effects) ────────────────────────
  if (Object.keys(thinUpdates).length > 0) {
    prisma.situation.update({ where: { id }, data: thinUpdates }).catch((err) =>
      console.error(`[situation-patch] Thin record update failed for ${id}:`, err),
    );
  }

  firePatchSideEffects(operatorId, id, body, thinSituation);

  const status = body.status as string | undefined;
  return NextResponse.json({ id, status: status ?? props.status });
}

// ── Side-effect helpers ─────────────────────────────────────────────────────

/** Fire all post-PATCH side effects (fire-and-forget). Used by both wiki-first and legacy paths. */
function firePatchSideEffects(
  operatorId: string,
  id: string,
  body: Record<string, unknown>,
  situation: { assignedUserId: string | null; reasoning: string | null; proposedAction: string | null; editInstruction: string | null; situationType: { slug: string } | null } | null,
) {
  const status = body.status as string | undefined;

  if (status) {
    prisma.workStreamItem.findMany({
      where: { itemType: "situation", itemId: id },
      select: { workStreamId: true },
    }).then(items => {
      for (const item of items) {
        recheckWorkStreamStatus(item.workStreamId).catch(console.error);
      }
    }).catch(console.error);
  }

  if (status === "resolved") {
    checkInsightExtractionTrigger(operatorId, situation?.assignedUserId ?? null).catch(console.error);
  }

  if (status === "resolved" || status === "closed" || status === "dismissed") {
    resumeAfterSituationResolution(id).catch(err =>
      console.error(`[situation-patch] Resume after resolution failed for ${id}:`, err),
    );
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

    emitSystemIntelligenceSignals(operatorId, id, status, situation, body).catch(() => {});
  }
}

async function handleRejectionSideEffects(
  operatorId: string,
  situationTypeId: string,
  userId: string,
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
  checkDemotion(situationTypeId).catch((err) =>
    console.error(`[situation-patch] Demotion check failed:`, err),
  );

  const aiEntity = await prisma.entity.findFirst({
    where: { ownerUserId: userId, operatorId, status: "active" },
    select: { id: true },
  });
  if (aiEntity) {
    const pa = await prisma.personalAutonomy.findUnique({
      where: { situationTypeId_aiEntityId: { situationTypeId, aiEntityId: aiEntity.id } },
    });
    if (pa) {
      const newProposed = pa.totalProposed + 1;
      await prisma.personalAutonomy.update({
        where: { id: pa.id },
        data: {
          totalProposed: newProposed,
          consecutiveApprovals: 0,
          approvalRate: newProposed > 0 ? pa.totalApproved / newProposed : 0,
        },
      });
      checkPersonalDemotion(pa.id).catch((err) =>
        console.error(`[situation-patch] Personal demotion check failed:`, err),
      );
    }
  }
}

async function handleApprovalSideEffects(
  operatorId: string,
  situationTypeId: string,
  userId: string,
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
  checkGraduation(situationTypeId).catch((err) =>
    console.error(`[situation-patch] Graduation check failed:`, err),
  );

  const aiEntity = await prisma.entity.findFirst({
    where: { ownerUserId: userId, operatorId, status: "active" },
    select: { id: true },
  });
  if (aiEntity) {
    let pa = await prisma.personalAutonomy.findUnique({
      where: { situationTypeId_aiEntityId: { situationTypeId, aiEntityId: aiEntity.id } },
    });
    if (!pa) {
      pa = await prisma.personalAutonomy.create({
        data: {
          operatorId,
          situationTypeId,
          aiEntityId: aiEntity.id,
          totalProposed: 1,
          totalApproved: 1,
          consecutiveApprovals: 1,
          approvalRate: 1.0,
        },
      });
    } else {
      const newProposed = pa.totalProposed + 1;
      const newApproved = pa.totalApproved + 1;
      pa = await prisma.personalAutonomy.update({
        where: { id: pa.id },
        data: {
          totalProposed: newProposed,
          totalApproved: newApproved,
          consecutiveApprovals: pa.consecutiveApprovals + 1,
          approvalRate: newProposed > 0 ? newApproved / newProposed : 0,
        },
      });
    }
    checkPersonalGraduation(pa.id).catch((err) =>
      console.error(`[situation-patch] Personal graduation check failed:`, err),
    );
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

// ── Legacy PATCH handler ────────────────────────────────────────────────────
async function handleLegacyPatch(
  su: SessionUser,
  operatorId: string,
  id: string,
  body: Record<string, unknown>,
) {
  const { user } = su;

  const situation = await prisma.situation.findFirst({
    where: { id, operatorId },
    include: { situationType: { select: { scopeEntityId: true, slug: true, id: true } } },
  });

  if (!situation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Scope check
  const patchVisibleDepts = await getVisibleDomainIds(operatorId, su.effectiveUserId);
  if (patchVisibleDepts !== "all") {
    const scopeDept = situation.situationType?.scopeEntityId;
    if (scopeDept && !patchVisibleDepts.includes(scopeDept)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  // Meeting request resolution
  if (situation.situationType?.slug === "meeting_request" && body.meetingDecision) {
    try {
      const result = await handleMeetingRequestResolution(
        id, body.meetingDecision as string, (body.resolutionData || {}) as Record<string, unknown>,
      );
      if (result.resolved) {
        resumeAfterSituationResolution(id).catch(err =>
          console.error(`[situation-patch] Resume after meeting resolution failed:`, err),
        );
      }
      return NextResponse.json({ id, meetingDecision: body.meetingDecision, ...result });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 400 });
    }
  }

  // Edit & Approve flow
  if (typeof body.editInstruction === "string" && (body.editInstruction as string).trim()) {
    if (situation.proposedAction) {
      emitCorrectionSignal(operatorId, id, (body.editInstruction as string).trim(), situation).catch(() => {});
    }

    await prisma.situation.update({
      where: { id },
      data: {
        editInstruction: (body.editInstruction as string).trim(),
        status: "detected",
      },
    });
    enqueueWorkerJob("reason_situation", operatorId, { situationId: id }).catch((err) =>
      console.error(`[situations-api] Failed to enqueue re-reasoning for ${id}:`, err),
    );
    return NextResponse.json({ id, status: "edit_submitted", message: "Edit instruction saved. Revised proposal will appear shortly." });
  }

  const updates: Record<string, unknown> = {};

  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === "resolved" || body.status === "closed") {
      updates.resolvedAt = new Date();
    }
    if (body.status === "rejected") {
      handleRejectionSideEffects(operatorId, situation.situationTypeId, user.id).catch(
        (err) => console.error(`[situation-patch] Rejection side effects failed:`, err),
      );
    }
    if (body.status === "approved") {
      handleApprovalSideEffects(operatorId, situation.situationTypeId, user.id).catch(
        (err) => console.error(`[situation-patch] Approval side effects failed:`, err),
      );
      updates.assignedUserId = user.id;
    }
  }
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
    updates.assignedPageSlug = body.assignedPageSlug;
  }
  if (body.feedback !== undefined) updates.feedback = body.feedback;
  if (body.feedbackRating !== undefined) updates.feedbackRating = body.feedbackRating;
  if (body.feedbackCategory !== undefined) updates.feedbackCategory = body.feedbackCategory;
  if (body.outcome !== undefined) updates.outcome = body.outcome;
  if (body.outcomeDetails !== undefined) updates.outcomeDetails = JSON.stringify(body.outcomeDetails);
  if (body.outcomeNote !== undefined) updates.outcomeDetails = JSON.stringify({ note: body.outcomeNote });

  const updated = await prisma.situation.update({
    where: { id },
    data: updates,
  });

  // Route approval through execution plan
  if (body.status === "approved") {
    const situationWithPlan = await prisma.situation.findUnique({
      where: { id },
      select: { executionPlanId: true },
    });

    if (situationWithPlan?.executionPlanId) {
      const nextStep = await prisma.executionStep.findFirst({
        where: { planId: situationWithPlan.executionPlanId, status: "awaiting_approval" },
        orderBy: { sequenceOrder: "asc" },
      });
      if (nextStep) {
        await prisma.executionStep.updateMany({
          where: {
            planId: situationWithPlan.executionPlanId,
            executionMode: "action",
            assignedUserId: null,
          },
          data: { assignedUserId: user.id },
        });

        enqueueWorkerJob("advance_step", operatorId, {
          stepId: nextStep.id,
          action: "approve",
          userId: user.id,
        }).catch(err =>
          console.error(`[situation-patch] Failed to enqueue step advance for ${id}:`, err),
        );
      }
    }
  }

  firePatchSideEffects(operatorId, id, body as Record<string, unknown>, situation);

  return NextResponse.json({ id: updated.id, status: updated.status });
}
