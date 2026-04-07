import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CronExpressionParser } from "cron-parser";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  const jobs = await prisma.systemJob.findMany({
    where: { operatorId },
    orderBy: { createdAt: "desc" },
    include: {
      runs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { summary: true, importanceScore: true, status: true, createdAt: true },
      },
    },
  });

  const items = jobs.map(j => ({
    id: j.id,
    title: j.title,
    description: j.description,
    scope: j.scope,
    scopeEntityId: j.scopeEntityId,
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
  const { title, description, cronExpression, scope, scopeEntityId, importanceThreshold } = body;

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

  // Find HQ AI entity for aiEntityId
  const hqAi = await prisma.entity.findFirst({
    where: { operatorId, entityType: { slug: { in: ["hq-ai", "ai-agent"] } }, status: "active" },
    select: { id: true },
  });

  if (!hqAi) {
    return NextResponse.json({ error: "No AI entity found. Complete onboarding first." }, { status: 400 });
  }

  const job = await prisma.systemJob.create({
    data: {
      operatorId,
      aiEntityId: hqAi.id,
      title,
      description,
      cronExpression,
      scope: scope ?? "company_wide",
      scopeEntityId: scopeEntityId ?? null,
      importanceThreshold: importanceThreshold ?? 0.3,
      status: "active",
      nextTriggerAt,
    },
  });

  return NextResponse.json(job, { status: 201 });
}
