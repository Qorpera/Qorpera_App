import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { createProjectFromInitiative } from "@/lib/initiative-project";

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

    return NextResponse.json({
      id: page.slug,
      aiEntityId: null,
      ownerPageSlug: ownerSlug,
      ownerName,
      proposalType: props.proposal_type ?? "general",
      triggerSummary: page.title,
      status: props.status ?? "proposed",
      rationale: (props.rationale as string) ?? null,
      impactAssessment: (props.impact_assessment as string) ?? null,
      evidence: props.evidence ?? null,
      proposal: props.project_config ?? null,
      proposedProjectConfig: props.project_config ?? null,
      projectId: (props.project_id as string) ?? null,
      content: page.content,
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
    createdAt: initiative.createdAt.toISOString(),
    updatedAt: initiative.updatedAt.toISOString(),
  });
}

// ── PATCH ── Approve/reject via wiki page ────────────────────────────────────

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
  if (body.status !== "approved" && body.status !== "rejected") {
    return NextResponse.json({ error: "Status must be 'approved' or 'rejected'" }, { status: 400 });
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
    const props = (page.properties ?? {}) as Record<string, unknown>;
    const { updatePageWithLock } = await import("@/lib/wiki-engine");

    if (body.status === "rejected") {
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

    // Approved — dispatch based on proposal type
    const proposalType = props.proposal_type as string | undefined;

    if (proposalType === "project_creation") {
      let projectId: string | undefined;
      try {
        // createProjectFromInitiative handles wiki page lookup, project creation,
        // and marks the wiki page as completed with project_id
        projectId = await createProjectFromInitiative(page.slug, user.id);
      } catch (err) {
        console.error("[initiative-api] Failed to create project:", err);
        await updatePageWithLock(operatorId, page.slug, (p) => ({
          properties: { ...(p.properties ?? {}), status: "approved" },
        }));
        return NextResponse.json({ id: page.slug, status: "approved" });
      }

      return NextResponse.json({ id: page.slug, status: "completed", projectId });
    }

    if (proposalType === "system_job_creation") {
      await updatePageWithLock(operatorId, page.slug, (p) => ({
        properties: { ...(p.properties ?? {}), status: "approved" },
      }));

      try {
        const { CronExpressionParser } = await import("cron-parser");
        const { buildSystemJobWikiContent } = await import("@/lib/system-job-wiki");
        const cronExpr = (props.cron_expression as string) ?? "0 0 * * *";
        const interval = CronExpressionParser.parse(cronExpr);
        const title = page.title;
        const description = (props.description as string) ?? page.content.slice(0, 500);
        const scope = (props.scope as string) ?? "company_wide";
        const domainPageSlug = (props.domain as string) ?? null;

        const jobSlug = `system-job-${Date.now()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
        const now = new Date();
        await prisma.knowledgePage.create({
          data: {
            operatorId,
            slug: jobSlug,
            title: `System Job: ${title}`,
            pageType: "system_job",
            scope: "operator",
            status: "verified",
            content: buildSystemJobWikiContent({ description, cronExpression: cronExpr, scope, domainPageSlug }),
            crossReferences: domainPageSlug ? [domainPageSlug] : [],
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
            cronExpression: cronExpr,
            scope,
            wikiPageSlug: jobSlug,
            domainPageSlug,
            status: "active",
            source: "initiative",
            importanceThreshold: 0.3,
            nextTriggerAt: interval.next().toDate(),
          },
        });

        await updatePageWithLock(operatorId, page.slug, (p) => ({
          properties: { ...(p.properties ?? {}), status: "completed", system_job_id: job.id },
        }));

        return NextResponse.json({ id: page.slug, status: "completed", systemJobId: job.id });
      } catch (err) {
        console.error("[initiative-api] Failed to create system job:", err);
        return NextResponse.json({ id: page.slug, status: "approved" });
      }
    }

    // Default: generic approval
    await updatePageWithLock(operatorId, page.slug, (p) => ({
      properties: { ...(p.properties ?? {}), status: "approved" },
    }));

    return NextResponse.json({ id: page.slug, status: "approved" });
  }

  // Fallback: try legacy Initiative table
  const initiative = await prisma.initiative.findFirst({ where: { id, operatorId } });
  if (!initiative) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Legacy handling — keep minimal for existing records
  await prisma.initiative.update({ where: { id }, data: { status: body.status } });
  return NextResponse.json({ id, status: body.status });
}
