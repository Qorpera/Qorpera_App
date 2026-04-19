import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseExecutionHistory } from "@/lib/system-job-reasoning";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id } = await params;

  const page = await prisma.knowledgePage.findFirst({
    where: {
      operatorId,
      pageType: "system_job",
      scope: "operator",
      OR: [{ id }, { slug: id }],
    },
    select: {
      id: true,
      slug: true,
      title: true,
      content: true,
      properties: true,
      createdAt: true,
      updatedAt: true,
      crossReferences: true,
    },
  });

  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const props = (page.properties ?? {}) as Record<string, unknown>;
  const ownerSlug = typeof props.owner === "string" ? props.owner : null;
  const domainSlug = typeof props.domain === "string" ? props.domain : null;
  const recipientSlugs = Array.isArray(props.recipients)
    ? props.recipients.filter((r): r is string => typeof r === "string")
    : [];
  const anchorSlugs = Array.isArray(props.anchor_pages)
    ? props.anchor_pages.filter((r): r is string => typeof r === "string")
    : [];

  const refSlugs = [ownerSlug, domainSlug, ...recipientSlugs, ...anchorSlugs].filter(
    (s): s is string => Boolean(s),
  );
  const pageMap = new Map<string, string>();
  if (refSlugs.length > 0) {
    const refs = await prisma.knowledgePage.findMany({
      where: { operatorId, slug: { in: refSlugs }, scope: "operator" },
      select: { slug: true, title: true },
    });
    for (const r of refs) pageMap.set(r.slug, r.title);
  }

  const executionHistory = parseExecutionHistory(page.content, 20);

  // Linked ideas — broad query + in-code filter (safer than Prisma JSON-path equality).
  const linkedIdeasRaw = await prisma.knowledgePage.findMany({
    where: { operatorId, pageType: "idea", scope: "operator" },
    select: { id: true, slug: true, title: true, properties: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const linkedIdeas = linkedIdeasRaw
    .filter(i => {
      const ip = (i.properties ?? {}) as Record<string, unknown>;
      return ip.source_job_id === page.id || ip.source_job_slug === page.slug;
    })
    .map(i => {
      const ip = (i.properties ?? {}) as Record<string, unknown>;
      return {
        id: i.id,
        slug: i.slug,
        title: i.title,
        status: typeof ip.status === "string" ? ip.status : "proposed",
        proposalType: typeof ip.proposal_type === "string" ? ip.proposal_type : "general",
        autoAccepted: ip.auto_accepted === true,
        proposedAt:
          typeof ip.proposed_at === "string" ? ip.proposed_at : i.createdAt.toISOString(),
      };
    });

  // Run reports — same in-code filter approach.
  const runReportsRaw = await prisma.knowledgePage.findMany({
    where: { operatorId, pageType: "system_job_run_report", scope: "operator" },
    select: { slug: true, title: true, properties: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const runReports = runReportsRaw
    .filter(r => {
      const rp = (r.properties ?? {}) as Record<string, unknown>;
      return rp.parent_job_slug === page.slug;
    })
    .slice(0, 50)
    .map(r => {
      const rp = (r.properties ?? {}) as Record<string, unknown>;
      return {
        slug: r.slug,
        title: r.title,
        runDate:
          typeof rp.run_date === "string" ? rp.run_date : r.createdAt.toISOString(),
        importanceScore:
          typeof rp.importance_score === "number" ? rp.importance_score : null,
      };
    });

  const latestSummary =
    typeof props.latest_run_summary === "string" ? props.latest_run_summary : null;
  const latestStatus =
    typeof props.latest_run_status === "string" ? props.latest_run_status : null;

  return NextResponse.json({
    id: page.id,
    slug: page.slug,
    title: page.title,
    content: page.content,

    description: typeof props.description === "string" ? props.description : "",
    status: typeof props.status === "string" ? props.status : "active",

    triggers: Array.isArray(props.triggers) ? props.triggers : [],
    schedule: typeof props.schedule === "string" ? props.schedule : "",
    deliverableKind:
      typeof props.deliverable_kind === "string" ? props.deliverable_kind : "proposals",
    trustLevel: typeof props.trust_level === "string" ? props.trust_level : null,
    postPolicy: typeof props.post_policy === "string" ? props.post_policy : "always",
    importanceThreshold:
      typeof props.importance_threshold === "number" ? props.importance_threshold : null,

    anchorPages: anchorSlugs.map(slug => ({ slug, title: pageMap.get(slug) ?? slug })),
    reachMode: typeof props.reach_mode === "string" ? props.reach_mode : null,
    domainScope: Array.isArray(props.domain_scope) ? props.domain_scope : [],

    ownerPageSlug: ownerSlug,
    ownerName: ownerSlug ? pageMap.get(ownerSlug) ?? null : null,
    domainPageSlug: domainSlug,
    domainName: domainSlug ? pageMap.get(domainSlug) ?? null : null,
    recipients: recipientSlugs.map(slug => ({ slug, name: pageMap.get(slug) ?? slug })),

    budgetSoft:
      typeof props.budget_soft_tool_calls === "number" ? props.budget_soft_tool_calls : 15,
    budgetHard:
      typeof props.budget_hard_tool_calls === "number" ? props.budget_hard_tool_calls : 25,
    dedupWindowRuns:
      typeof props.dedup_window_runs === "number" ? props.dedup_window_runs : 3,

    creatorUserIdSnapshot:
      typeof props.creator_user_id_snapshot === "string"
        ? props.creator_user_id_snapshot
        : null,
    creatorRoleSnapshot:
      typeof props.creator_role_snapshot === "string" ? props.creator_role_snapshot : null,

    lastRun: typeof props.last_run === "string" ? props.last_run : null,
    nextRun: typeof props.next_run === "string" ? props.next_run : null,
    latestRun:
      latestSummary || latestStatus
        ? {
            summary: latestSummary ?? "",
            status: latestStatus ?? "completed",
            needsReview: latestStatus === "awaiting_review",
          }
        : null,

    executionHistory: executionHistory.map(e => ({
      runDate: e.runDate.toISOString(),
      status: e.status,
      importanceScore: e.importanceScore,
      summary: e.summary,
      proposedSlugs: e.proposedSlugs,
      reportSubPageSlug: e.reportSubPageSlug,
      editCount: e.editCount,
      toolCalls: e.toolCalls,
      costCents: e.costCents,
      errorMessage: e.errorMessage,
      trustBannerNote: e.trustBannerNote,
    })),
    linkedIdeas,
    runReports,

    crossReferences: page.crossReferences,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
  });
}

// TODO: PATCH/DELETE will be rewired in a future session to edit the underlying
// wiki page directly (properties + content) rather than mutating prisma.systemJob.
export async function PATCH(
  _req: NextRequest,
  _ctx: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(
    { error: "Not implemented. System job edits will move to wiki-page writes in a later session." },
    { status: 501 },
  );
}

export async function DELETE(
  _req: NextRequest,
  _ctx: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(
    { error: "Not implemented. System job deletion will move to wiki-page writes in a later session." },
    { status: 501 },
  );
}
