import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CronExpressionParser } from "cron-parser";

type JobWithRelations = {
  id: string;
  title: string;
  description: string;
  scope: string;
  domainEntityId: string;
  assigneeEntityId: string | null;
  cronExpression: string;
  status: string;
  importanceThreshold: number;
  lastTriggeredAt: Date | null;
  nextTriggerAt: Date | null;
  domain: { id: string; displayName: string };
  assignee: { id: string; displayName: string } | null;
  runs: Array<{ summary: string | null; importanceScore: number | null; status: string; createdAt: Date }>;
};

function formatJobResponse(j: JobWithRelations) {
  return {
    id: j.id,
    title: j.title,
    description: j.description,
    scope: j.scope,
    domainEntityId: j.domainEntityId,
    domainName: j.domain.displayName,
    assigneeEntityId: j.assigneeEntityId,
    assigneeName: j.assignee?.displayName ?? null,
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
  };
}

const JOB_INCLUDE = {
  domain: { select: { id: true, displayName: true } },
  assignee: { select: { id: true, displayName: true } },
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

  return NextResponse.json({ items: jobs.map(formatJobResponse) });
}

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId, effectiveRole } = su;

  if (effectiveRole === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { title, description, cronExpression, domainEntityId, assigneeEntityId, scope, importanceThreshold } = body;

  if (!title || !description || !cronExpression || !domainEntityId) {
    return NextResponse.json({ error: "title, description, cronExpression, and domainEntityId are required" }, { status: 400 });
  }

  // Validate cron expression and compute next trigger
  let nextTriggerAt: Date;
  try {
    const interval = CronExpressionParser.parse(cronExpression);
    nextTriggerAt = interval.next().toDate();
  } catch {
    return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
  }

  // Validate domain belongs to operator
  const domain = await prisma.entity.findFirst({
    where: { id: domainEntityId, operatorId, category: "foundational", status: "active" },
  });
  if (!domain) {
    return NextResponse.json({ error: "Domain not found" }, { status: 400 });
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
      domainEntityId,
      assigneeEntityId: assigneeEntityId ?? null,
      scope: scope ?? "domain",
      importanceThreshold: importanceThreshold ?? 0.3,
      status: "active",
      nextTriggerAt,
    },
    include: JOB_INCLUDE,
  });

  return NextResponse.json(formatJobResponse(job), { status: 201 });
}
