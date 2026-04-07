import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CronExpressionParser } from "cron-parser";

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

  return NextResponse.json({
    id: job.id,
    title: job.title,
    description: job.description,
    scope: job.scope,
    scopeEntityId: job.scopeEntityId,
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

  const updated = await prisma.systemJob.update({ where: { id }, data });
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
