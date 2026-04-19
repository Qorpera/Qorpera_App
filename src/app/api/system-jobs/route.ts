import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(_req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  const pages = await prisma.knowledgePage.findMany({
    where: { operatorId, pageType: "system_job", scope: "operator" },
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
    orderBy: { createdAt: "desc" },
  });

  const refSlugs = new Set<string>();
  for (const p of pages) {
    const props = (p.properties ?? {}) as Record<string, unknown>;
    if (typeof props.owner === "string") refSlugs.add(props.owner);
    if (typeof props.domain === "string") refSlugs.add(props.domain);
  }

  const pageMap = new Map<string, string>();
  if (refSlugs.size > 0) {
    const refs = await prisma.knowledgePage.findMany({
      where: { operatorId, slug: { in: [...refSlugs] }, scope: "operator" },
      select: { slug: true, title: true },
    });
    for (const r of refs) pageMap.set(r.slug, r.title);
  }

  // Bucket pending initiatives by source_job_id using one broad query + in-code filter.
  // Avoids N+1 per-job counts and sidesteps the Prisma JSON-path `string_contains`
  // caveat (substring match on CUIDs would be semantically wrong even if unlikely).
  const TERMINAL_INIT_STATUSES = new Set(["accepted", "rejected", "failed"]);
  const allInitiatives = await prisma.knowledgePage.findMany({
    where: { operatorId, pageType: "initiative", scope: "operator" },
    select: { properties: true },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  const pendingByJobId = new Map<string, number>();
  for (const init of allInitiatives) {
    const ip = (init.properties ?? {}) as Record<string, unknown>;
    const status = typeof ip.status === "string" ? ip.status : "";
    const sourceJobId = typeof ip.source_job_id === "string" ? ip.source_job_id : null;
    if (!sourceJobId) continue;
    if (TERMINAL_INIT_STATUSES.has(status)) continue;
    pendingByJobId.set(sourceJobId, (pendingByJobId.get(sourceJobId) ?? 0) + 1);
  }

  const items = pages.map(p => {
    const props = (p.properties ?? {}) as Record<string, unknown>;
    const ownerSlug = typeof props.owner === "string" ? props.owner : null;
    const domainSlug = typeof props.domain === "string" ? props.domain : null;
    const latestSummary =
      typeof props.latest_run_summary === "string" ? props.latest_run_summary : null;
    const latestStatus =
      typeof props.latest_run_status === "string" ? props.latest_run_status : null;

    // Legacy schedule string — explicit prop wins; otherwise derive from first cron trigger.
    let schedule = typeof props.schedule === "string" ? props.schedule : "";
    if (!schedule && Array.isArray(props.triggers)) {
      const firstCron = props.triggers.find(
        t => t && typeof t === "object" && (t as { type?: unknown }).type === "cron",
      ) as { expression?: unknown } | undefined;
      if (firstCron && typeof firstCron.expression === "string") {
        schedule = firstCron.expression;
      }
    }

    return {
      id: p.id,
      slug: p.slug,
      title: p.title,

      description: typeof props.description === "string" ? props.description : "",
      status: typeof props.status === "string" ? props.status : "active",
      scope: typeof props.scope === "string" ? props.scope : "domain",
      ownerPageSlug: ownerSlug,
      ownerName: ownerSlug ? pageMap.get(ownerSlug) ?? null : null,
      domainPageSlug: domainSlug,
      domainName: domainSlug ? pageMap.get(domainSlug) ?? null : null,
      lastRun: typeof props.last_run === "string" ? props.last_run : null,
      nextRun: typeof props.next_run === "string" ? props.next_run : null,
      trustLevel: typeof props.trust_level === "string" ? props.trust_level : null,

      schedule,

      // v2 fields
      triggers: Array.isArray(props.triggers) ? props.triggers : [],
      deliverableKind:
        typeof props.deliverable_kind === "string" ? props.deliverable_kind : "proposals",
      postPolicy: typeof props.post_policy === "string" ? props.post_policy : "always",
      importanceThreshold:
        typeof props.importance_threshold === "number" ? props.importance_threshold : null,
      reachMode: typeof props.reach_mode === "string" ? props.reach_mode : null,

      // enriched
      pendingDecisionsCount: pendingByJobId.get(p.id) ?? 0,
      latestRun:
        latestSummary || latestStatus
          ? {
              summary: latestSummary ?? "",
              status: latestStatus ?? "completed",
              needsReview: latestStatus === "awaiting_review",
            }
          : null,
    };
  });

  return NextResponse.json({ items });
}

// TODO: Re-wire POST in a future session to create a system_job wiki page only.
// The previous implementation dual-wrote to prisma.systemJob + prisma.knowledgePage.
// The user-chat-driven "create new system job" flow will be rewired to write a
// wiki page exclusively; the worker migration away from prisma.systemJob is out
// of scope for this session.
export async function POST(_req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(
    { error: "Not implemented. System job creation will move to chat-driven wiki writes in a later session." },
    { status: 501 },
  );
}
