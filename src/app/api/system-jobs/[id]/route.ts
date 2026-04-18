import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

  const refSlugs = [ownerSlug, domainSlug].filter((s): s is string => Boolean(s));
  const pageMap = new Map<string, string>();
  if (refSlugs.length > 0) {
    const refs = await prisma.knowledgePage.findMany({
      where: { operatorId, slug: { in: refSlugs }, scope: "operator" },
      select: { slug: true, title: true },
    });
    for (const r of refs) pageMap.set(r.slug, r.title);
  }

  const latestSummary = typeof props.latest_run_summary === "string" ? props.latest_run_summary : null;
  const latestStatus = typeof props.latest_run_status === "string" ? props.latest_run_status : null;

  return NextResponse.json({
    id: page.id,
    slug: page.slug,
    title: page.title,
    content: page.content,
    description: typeof props.description === "string" ? props.description : "",
    status: typeof props.status === "string" ? props.status : "active",
    schedule: typeof props.schedule === "string" ? props.schedule : "",
    scope: typeof props.scope === "string" ? props.scope : "domain",
    ownerPageSlug: ownerSlug,
    ownerName: ownerSlug ? pageMap.get(ownerSlug) ?? null : null,
    domainPageSlug: domainSlug,
    domainName: domainSlug ? pageMap.get(domainSlug) ?? null : null,
    lastRun: typeof props.last_run === "string" ? props.last_run : null,
    nextRun: typeof props.next_run === "string" ? props.next_run : null,
    trustLevel: typeof props.trust_level === "string" ? props.trust_level : null,
    autoApproveSteps: typeof props.auto_approve_steps === "boolean" ? props.auto_approve_steps : null,
    crossReferences: page.crossReferences,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
    latestRun: latestSummary || latestStatus ? {
      summary: latestSummary ?? "",
      status: latestStatus ?? "completed",
      needsReview: latestStatus === "awaiting_review",
    } : null,
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
