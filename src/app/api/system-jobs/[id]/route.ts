import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CronExpressionParser } from "cron-parser";
import { buildSystemJobWikiContent } from "@/lib/system-job-wiki";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id } = await params;

  const job = await prisma.systemJob.findFirst({
    where: { id, operatorId },
    include: {
      runs: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          cycleNumber: true,
          status: true,
          summary: true,
          importanceScore: true,
          findings: true,
          proposedSituationCount: true,
          proposedInitiativeCount: true,
          durationMs: true,
          createdAt: true,
        },
      },
    },
  });

  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Resolve wiki page content and names
  const slugs = [job.wikiPageSlug, job.domainPageSlug, job.ownerPageSlug].filter(Boolean) as string[];
  const pageMap = new Map<string, { title: string; content: string }>();
  if (slugs.length > 0) {
    const pages = await prisma.knowledgePage.findMany({
      where: { operatorId, slug: { in: slugs }, scope: "operator" },
      select: { slug: true, title: true, content: true },
    });
    for (const p of pages) pageMap.set(p.slug, { title: p.title, content: p.content });
  }

  const wikiPage = job.wikiPageSlug ? pageMap.get(job.wikiPageSlug) : null;

  return NextResponse.json({
    id: job.id,
    title: job.title,
    description: job.description,
    scope: job.scope,
    domainPageSlug: job.domainPageSlug ?? null,
    ownerPageSlug: job.ownerPageSlug ?? null,
    domainName: job.domainPageSlug ? pageMap.get(job.domainPageSlug)?.title ?? null : null,
    ownerName: job.ownerPageSlug ? pageMap.get(job.ownerPageSlug)?.title ?? null : null,
    wikiPageSlug: job.wikiPageSlug ?? null,
    wikiPageContent: wikiPage?.content ?? null,
    cronExpression: job.cronExpression,
    status: job.status,
    importanceThreshold: job.importanceThreshold,
    lastTriggeredAt: job.lastTriggeredAt?.toISOString() ?? null,
    nextTriggerAt: job.nextTriggerAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    runs: job.runs.map(r => ({
      id: r.id,
      cycleNumber: r.cycleNumber,
      status: r.status,
      summary: r.summary,
      importanceScore: r.importanceScore,
      findings: r.findings,
      proposedSituationCount: r.proposedSituationCount,
      proposedInitiativeCount: r.proposedInitiativeCount,
      durationMs: r.durationMs,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveRole } = su;
  const { id } = await params;

  if (effectiveRole === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const existing = await prisma.systemJob.findFirst({ where: { id, operatorId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.importanceThreshold !== undefined) data.importanceThreshold = body.importanceThreshold;
  if (body.domainPageSlug !== undefined) data.domainPageSlug = body.domainPageSlug || null;
  if (body.ownerPageSlug !== undefined) data.ownerPageSlug = body.ownerPageSlug || null;
  if (body.status !== undefined && ["active", "paused", "deactivated"].includes(body.status)) {
    data.status = body.status;
  }
  if (body.cronExpression !== undefined) {
    try {
      const interval = CronExpressionParser.parse(body.cronExpression);
      data.cronExpression = body.cronExpression;
      data.nextTriggerAt = interval.next().toDate();
    } catch {
      return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
    }
  }

  const updated = await prisma.systemJob.update({
    where: { id },
    data,
  });

  // Sync wiki page content if title or description changed
  if (existing.wikiPageSlug && (body.description || body.title)) {
    const desc = body.description ?? existing.description;
    const ttl = body.title ?? existing.title;
    const cron = (data.cronExpression as string) ?? existing.cronExpression;
    const domSlug = (data.domainPageSlug as string | null) ?? existing.domainPageSlug;
    const ownSlug = (data.ownerPageSlug as string | null) ?? existing.ownerPageSlug;
    await prisma.knowledgePage.updateMany({
      where: { operatorId, slug: existing.wikiPageSlug },
      data: {
        title: `System Job: ${ttl}`,
        content: buildSystemJobWikiContent({ description: desc, cronExpression: cron, scope: updated.scope, domainPageSlug: domSlug, ownerPageSlug: ownSlug }),
        crossReferences: [domSlug, ownSlug].filter(Boolean) as string[],
      },
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveRole } = su;
  const { id } = await params;

  if (effectiveRole === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const existing = await prisma.systemJob.findFirst({ where: { id, operatorId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.systemJob.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
