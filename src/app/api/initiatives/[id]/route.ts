import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { recheckWorkStreamStatus } from "@/lib/workstreams";
import { createProjectFromInitiative } from "@/lib/initiative-project";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { id } = await params;

  const initiative = await prisma.initiative.findFirst({
    where: { id, operatorId },
  });
  if (!initiative) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const aiEntity = await prisma.entity.findFirst({
    where: { id: initiative.aiEntityId, operatorId },
    select: { displayName: true },
  });

  const parseJson = (val: unknown) => {
    if (!val) return null;
    if (typeof val === "object") return val;
    try { return JSON.parse(String(val)); } catch { return null; }
  };

  return NextResponse.json({
    id: initiative.id,
    aiEntityId: initiative.aiEntityId,
    aiEntityName: aiEntity?.displayName ?? null,
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

  const initiative = await prisma.initiative.findFirst({ where: { id, operatorId } });
  if (!initiative) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  if (body.status !== "approved" && body.status !== "rejected") {
    return NextResponse.json({ error: "Status must be 'approved' or 'rejected'" }, { status: 400 });
  }

  if (body.status === "rejected") {
    await prisma.initiative.update({ where: { id }, data: { status: "rejected" } });

    sendNotificationToAdmins({
      operatorId,
      type: "system_alert",
      title: `Initiative rejected: ${initiative.triggerSummary?.slice(0, 80) ?? "Unknown"}`,
      body: `The proposed initiative was rejected.`,
      sourceType: "initiative",
      sourceId: id,
    }).catch(() => {});

    triggerInitiativeWorkStreamRecheck(id);
    return NextResponse.json({ id, status: "rejected" });
  }

  // Approved: dispatch based on proposalType
  const proposalType = initiative.proposalType;
  const proposal = (typeof initiative.proposal === "object" && initiative.proposal !== null)
    ? initiative.proposal as Record<string, unknown>
    : {};

  switch (proposalType) {
    case "project_creation": {
      if (!initiative.proposedProjectConfig && initiative.proposal) {
        await prisma.initiative.update({
          where: { id },
          data: { proposedProjectConfig: initiative.proposal as Prisma.InputJsonValue },
        });
      }
      await prisma.initiative.update({ where: { id }, data: { status: "approved" } });
      let projectId: string | undefined;
      try {
        projectId = await createProjectFromInitiative(initiative.id, user.id);
      } catch (err) {
        console.error("[initiative-api] Failed to create project:", err);
      }
      triggerInitiativeWorkStreamRecheck(id);
      return NextResponse.json({ id, status: "completed", projectId });
    }

    case "system_job_creation": {
      await prisma.initiative.update({ where: { id }, data: { status: "approved" } });
      try {
        const aiEntity = await prisma.entity.findFirst({
          where: { operatorId, entityType: { slug: { in: ["ai-agent", "hq-ai"] } }, status: "active" },
          select: { id: true, primaryDomainId: true },
        });
        // Resolve domain: from proposal, AI entity's domain, or first foundational entity
        let domainEntityId: string | undefined = (proposal.domainEntityId as string) ?? aiEntity?.primaryDomainId ?? undefined;
        if (!domainEntityId) {
          const firstDomain = await prisma.entity.findFirst({
            where: { operatorId, category: "foundational", status: "active" },
            select: { id: true },
          });
          domainEntityId = firstDomain?.id ?? undefined;
        }
        if (!domainEntityId) {
          console.error("[initiative-api] No domain found for system job creation");
          return NextResponse.json({ id, status: "approved" });
        }
        const { CronExpressionParser } = await import("cron-parser");
        const cronExpr = (proposal.cronExpression as string) ?? "0 0 * * *";
        const interval = CronExpressionParser.parse(cronExpr);
        const job = await prisma.systemJob.create({
          data: {
            operatorId,
            aiEntityId: aiEntity?.id ?? initiative.aiEntityId,
            domainEntityId,
            title: (proposal.title as string) ?? "New System Job",
            description: (proposal.description as string) ?? "",
            cronExpression: cronExpr,
            scope: (proposal.scope as string) ?? "company_wide",
            status: "active",
            importanceThreshold: 0.3,
            nextTriggerAt: interval.next().toDate(),
          },
        });
        await prisma.initiative.update({ where: { id }, data: { status: "completed" } });
        return NextResponse.json({ id, status: "completed", systemJobId: job.id });
      } catch (err) {
        console.error("[initiative-api] Failed to create system job:", err);
        return NextResponse.json({ id, status: "approved" });
      }
    }

    case "autonomy_graduation": {
      await prisma.initiative.update({ where: { id }, data: { status: "approved" } });
      try {
        const typeName = proposal.situationTypeName as string;
        const newLevel = proposal.newAutonomyLevel as string;
        if (typeName && newLevel) {
          await prisma.situationType.updateMany({
            where: { operatorId, name: { equals: typeName, mode: "insensitive" } },
            data: { autonomyLevel: newLevel },
          });
          await prisma.initiative.update({ where: { id }, data: { status: "completed" } });
        }
      } catch (err) {
        console.error("[initiative-api] Failed to graduate autonomy:", err);
      }
      triggerInitiativeWorkStreamRecheck(id);
      return NextResponse.json({ id, status: "completed" });
    }

    default: {
      await prisma.initiative.update({ where: { id }, data: { status: "approved" } });
      triggerInitiativeWorkStreamRecheck(id);
      return NextResponse.json({ id, status: "approved" });
    }
  }
}

function triggerInitiativeWorkStreamRecheck(initiativeId: string) {
  prisma.workStreamItem.findMany({
    where: { itemType: "initiative", itemId: initiativeId },
    select: { workStreamId: true },
  }).then(items => {
    for (const item of items) {
      recheckWorkStreamStatus(item.workStreamId).catch(console.error);
    }
  }).catch(console.error);
}
