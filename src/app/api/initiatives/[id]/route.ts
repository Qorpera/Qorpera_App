import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { ExecutionStateSchema, ExecutionSummarySchema } from "@/lib/initiative-execution-types";

// ── GET ── Detail from wiki page (with legacy fallback) ──────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id } = await params;

  // Try wiki page first (slug or initiative_id property)
  const page = await prisma.knowledgePage.findFirst({
    where: {
      operatorId,
      pageType: "initiative",
      scope: "operator",
      OR: [
        { slug: id },
        { properties: { path: ["initiative_id"], equals: id } },
      ],
    },
    select: { slug: true, title: true, content: true, properties: true, createdAt: true, updatedAt: true },
  });

  if (page) {
    const props = (page.properties ?? {}) as Record<string, unknown>;

    // Resolve owner wiki page title
    let ownerName: string | null = null;
    const ownerSlug = (props.owner as string) ?? null;
    if (ownerSlug) {
      const ownerPage = await prisma.knowledgePage.findFirst({
        where: { operatorId, slug: ownerSlug, scope: "operator" },
        select: { title: true },
      });
      ownerName = ownerPage?.title ?? null;
    }

    // Resolve target page titles for primary_deliverable + downstream_effects
    const slugsToResolve = new Set<string>();
    const primary = props.primary_deliverable as { targetPageSlug?: string } | null;
    if (primary?.targetPageSlug) slugsToResolve.add(primary.targetPageSlug);
    const downstream = (props.downstream_effects ?? []) as Array<{ targetPageSlug?: string }>;
    for (const d of downstream) {
      if (d?.targetPageSlug) slugsToResolve.add(d.targetPageSlug);
    }

    const resolvedTargets: Record<string, string> = {};
    if (slugsToResolve.size > 0) {
      const targetPages = await prisma.knowledgePage.findMany({
        where: { operatorId, slug: { in: [...slugsToResolve] }, scope: "operator" },
        select: { slug: true, title: true },
      });
      for (const tp of targetPages) resolvedTargets[tp.slug] = tp.title;
    }

    // Load primary target page's current content for diff rendering (wiki_update only)
    let primaryTargetCurrentContent: string | null = null;
    let primaryTargetCurrentProperties: Record<string, unknown> | null = null;
    const primaryDeliverable = props.primary_deliverable as {
      type?: string;
      targetPageSlug?: string;
    } | null;
    if (primaryDeliverable?.type === "wiki_update" && primaryDeliverable.targetPageSlug) {
      const targetPage = await prisma.knowledgePage.findFirst({
        where: { operatorId, slug: primaryDeliverable.targetPageSlug, scope: "operator" },
        select: { content: true, properties: true },
      });
      if (targetPage) {
        primaryTargetCurrentContent = targetPage.content;
        primaryTargetCurrentProperties = targetPage.properties as Record<string, unknown> | null;
      }
    }

    // Load current content for downstream targets that aren't being created
    // (used for diff rendering in the downstream tabs)
    const downstreamCurrentContents: Record<string, { content: string; properties: Record<string, unknown> | null }> = {};
    const downstreamForCurrent = (props.downstream_effects ?? []) as Array<{ targetPageSlug?: string; changeType?: string }>;
    const updateSlugs = downstreamForCurrent
      .filter(de => de?.changeType !== "create")
      .map(de => de.targetPageSlug)
      .filter((s): s is string => typeof s === "string");
    if (updateSlugs.length > 0) {
      const pages = await prisma.knowledgePage.findMany({
        where: { operatorId, slug: { in: updateSlugs }, scope: "operator" },
        select: { slug: true, content: true, properties: true },
      });
      for (const tp of pages) {
        downstreamCurrentContents[tp.slug] = {
          content: tp.content,
          properties: tp.properties as Record<string, unknown> | null,
        };
      }
    }

    // Defensive parse of engine state on the way out — a stale row with a drifted
    // shape becomes null (UI falls back to pre-execution rendering) instead of crashing.
    let executionState: unknown = null;
    if (props.execution_state !== undefined && props.execution_state !== null) {
      const parsed = ExecutionStateSchema.safeParse(props.execution_state);
      if (parsed.success) {
        executionState = parsed.data;
      } else {
        console.warn(`[initiatives-api] execution_state schema validation failed for ${id}:`, parsed.error.message);
      }
    }
    let executionSummary: unknown = null;
    if (props.execution_summary !== undefined && props.execution_summary !== null) {
      const parsed = ExecutionSummarySchema.safeParse(props.execution_summary);
      if (parsed.success) {
        executionSummary = parsed.data;
      } else {
        console.warn(`[initiatives-api] execution_summary schema validation failed for ${id}:`, parsed.error.message);
      }
    }

    return NextResponse.json({
      id: page.slug,
      ownerPageSlug: ownerSlug,
      ownerName,
      proposalType: props.proposal_type ?? "general",
      triggerSummary: page.title || "Untitled initiative",
      status: props.status ?? "proposed",

      // Full markdown content — the UI parses sections
      content: page.content ?? "",

      // Structured deliverables from reasoning engine
      primaryDeliverable: props.primary_deliverable ?? null,
      downstreamEffects: props.downstream_effects ?? null,

      // Resolved target page titles — used for tab labels and changeset row labels
      resolvedTargetTitles: resolvedTargets,

      // Primary target's current content (for diff view on wiki_update)
      primaryTargetCurrentContent,
      primaryTargetCurrentProperties,

      // Downstream targets' current content (keyed by slug, for diff view on update/review)
      downstreamCurrentContents,

      // Execution engine state — Zod-validated; null on parse failure
      executionState,
      executionSummary,

      // Dismissal reason (when status === "dismissed")
      dismissalReason: (props.dismissal_reason as string) ?? null,

      // Scalar properties
      severity: (props.severity as string) ?? null,
      priority: (props.priority as string) ?? null,
      expectedImpact: (props.expected_impact as string) ?? null,
      effortEstimate: (props.effort_estimate as string) ?? null,

      // Meta
      investigatedAt: (props.investigated_at as string) ?? null,
      synthesizedByModel: (props.synthesized_by_model as string) ?? null,
      projectId: (props.project_id as string) ?? null,
      createdAt: page.createdAt.toISOString(),
      updatedAt: page.updatedAt.toISOString(),
    });
  }

  // Fallback: try Initiative table (legacy records)
  const initiative = await prisma.initiative.findFirst({
    where: { id, operatorId },
  });
  if (!initiative) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Resolve owner wiki page title
  let ownerName: string | null = null;
  if (initiative.ownerPageSlug) {
    const ownerPage = await prisma.knowledgePage.findFirst({
      where: { operatorId, slug: initiative.ownerPageSlug, scope: "operator" },
      select: { title: true },
    });
    ownerName = ownerPage?.title ?? null;
  }

  const parseJson = (val: unknown) => {
    if (!val) return null;
    if (typeof val === "object") return val;
    try { return JSON.parse(String(val)); } catch { return null; }
  };

  return NextResponse.json({
    id: initiative.id,
    aiEntityId: initiative.aiEntityId,
    ownerPageSlug: initiative.ownerPageSlug,
    ownerName,
    proposalType: initiative.proposalType,
    triggerSummary: initiative.triggerSummary,
    evidence: parseJson(initiative.evidence),
    proposal: parseJson(initiative.proposal),
    status: initiative.status,
    rationale: initiative.rationale,
    impactAssessment: initiative.impactAssessment,
    proposedProjectConfig: initiative.proposedProjectConfig,
    projectId: initiative.projectId,
    resolvedTargetTitles: {},
    createdAt: initiative.createdAt.toISOString(),
    updatedAt: initiative.updatedAt.toISOString(),
  });
}

// ── PATCH ── Accept/reject via wiki page ─────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = await params;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json();
  const action = body.action as string | undefined;
  if (action !== "accept" && action !== "reject") {
    return NextResponse.json({ error: "action must be 'accept' or 'reject'" }, { status: 400 });
  }

  // Try wiki page first
  const page = await prisma.knowledgePage.findFirst({
    where: {
      operatorId,
      pageType: "initiative",
      scope: "operator",
      OR: [
        { slug: id },
        { properties: { path: ["initiative_id"], equals: id } },
      ],
    },
    select: { slug: true, title: true, content: true, properties: true, operatorId: true },
  });

  if (page) {
    const { updatePageWithLock } = await import("@/lib/wiki-engine");

    if (action === "reject") {
      await updatePageWithLock(operatorId, page.slug, (p) => ({
        properties: { ...(p.properties ?? {}), status: "rejected" },
      }));

      sendNotificationToAdmins({
        operatorId,
        type: "system_alert",
        title: `Initiative rejected: ${page.title.slice(0, 80)}`,
        body: "The proposed initiative was rejected.",
        sourceType: "wiki_page",
        sourceId: page.slug,
      }).catch(() => {});

      return NextResponse.json({ id: page.slug, status: "rejected" });
    }

    // Accept: transition to "accepted" and enqueue execution.
    // Execution engine (Session C) will generate the staged changeset.
    // For now: execute_initiative is a stub handler — initiative stays in "accepted" until Session C.
    await updatePageWithLock(operatorId, page.slug, (p) => ({
      properties: {
        ...(p.properties ?? {}),
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_by: user.id,
      },
    }));

    const { enqueueWorkerJob } = await import("@/lib/worker-dispatch");
    await enqueueWorkerJob("execute_initiative", operatorId, {
      operatorId,
      pageSlug: page.slug,
    }).catch(err => {
      console.error(`[initiative-api] Failed to enqueue execute_initiative for ${page.slug}:`, err);
    });

    return NextResponse.json({ id: page.slug, status: "accepted" });
  }

  // Fallback: legacy Initiative table — map action → legacy status
  const initiative = await prisma.initiative.findFirst({ where: { id, operatorId } });
  if (!initiative) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const legacyStatus = action === "accept" ? "approved" : "rejected";
  await prisma.initiative.update({ where: { id }, data: { status: legacyStatus } });
  return NextResponse.json({ id, status: legacyStatus });
}
