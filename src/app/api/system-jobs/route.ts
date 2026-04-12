import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CronExpressionParser } from "cron-parser";
import { buildSystemJobWikiContent } from "@/lib/system-job-wiki";

const JOB_INCLUDE = {
  runs: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { summary: true, importanceScore: true, status: true, createdAt: true },
  },
};

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  const jobs = await prisma.systemJob.findMany({
    where: { operatorId },
    orderBy: { createdAt: "desc" },
    include: JOB_INCLUDE,
  });

  // Resolve domain/owner names from wiki pages
  const domainSlugs = jobs.map(j => j.domainPageSlug).filter(Boolean) as string[];
  const ownerSlugs = jobs.map(j => j.ownerPageSlug).filter(Boolean) as string[];
  const allSlugs = [...new Set([...domainSlugs, ...ownerSlugs])];

  const pageMap = new Map<string, string>();
  if (allSlugs.length > 0) {
    const pages = await prisma.knowledgePage.findMany({
      where: { operatorId, slug: { in: allSlugs }, scope: "operator" },
      select: { slug: true, title: true },
    });
    for (const p of pages) pageMap.set(p.slug, p.title);
  }

  const items = jobs.map(j => ({
    id: j.id,
    title: j.title,
    description: j.description,
    scope: j.scope,
    domainPageSlug: j.domainPageSlug ?? null,
    ownerPageSlug: j.ownerPageSlug ?? null,
    domainName: j.domainPageSlug ? pageMap.get(j.domainPageSlug) ?? null : null,
    ownerName: j.ownerPageSlug ? pageMap.get(j.ownerPageSlug) ?? null : null,
    cronExpression: j.cronExpression,
    status: j.status,
    importanceThreshold: j.importanceThreshold,
    lastTriggeredAt: j.lastTriggeredAt?.toISOString() ?? null,
    nextTriggerAt: j.nextTriggerAt?.toISOString() ?? null,
    latestRun: j.runs[0] ? {
      summary: j.runs[0].summary,
      importanceScore: j.runs[0].importanceScore,
      status: j.runs[0].status,
      createdAt: j.runs[0].createdAt.toISOString(),
    } : null,
  }));

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveRole } = su;

  if (effectiveRole === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { title, description, cronExpression, domainPageSlug, ownerPageSlug, scope, importanceThreshold } = body;

  if (!title || !description || !cronExpression) {
    return NextResponse.json({ error: "title, description, and cronExpression are required" }, { status: 400 });
  }

  // Validate cron expression and compute next trigger
  let nextTriggerAt: Date;
  try {
    const interval = CronExpressionParser.parse(cronExpression);
    nextTriggerAt = interval.next().toDate();
  } catch {
    return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
  }

  // Create wiki page for this job
  const slug = `system-job-${Date.now()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
  const now = new Date();
  await prisma.knowledgePage.create({
    data: {
      operatorId,
      slug,
      title: `System Job: ${title}`,
      pageType: "system_job",
      scope: "operator",
      status: "verified",
      content: buildSystemJobWikiContent({ description, cronExpression, scope: scope ?? "domain", domainPageSlug, ownerPageSlug }),
      crossReferences: [domainPageSlug, ownerPageSlug].filter(Boolean) as string[],
      synthesisPath: "manual",
      synthesizedByModel: "manual",
      confidence: 1.0,
      contentTokens: 0,
      lastSynthesizedAt: now,
    },
  });

  const job = await prisma.systemJob.create({
    data: {
      operatorId,
      title,
      description,
      cronExpression,
      scope: scope ?? "domain",
      wikiPageSlug: slug,
      domainPageSlug: domainPageSlug ?? null,
      ownerPageSlug: ownerPageSlug ?? null,
      status: "active",
      source: "manual",
      importanceThreshold: importanceThreshold ?? 0.3,
      nextTriggerAt,
    },
  });

  return NextResponse.json({ id: job.id, title: job.title, wikiPageSlug: slug }, { status: 201 });
}
