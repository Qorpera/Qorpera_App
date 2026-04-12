import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOrchestrationFeeMultiplier } from "@/lib/billing/balance";

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function subMonths(d: Date, n: number): Date {
  const result = new Date(d);
  result.setMonth(result.getMonth() - n);
  return result;
}

function formatMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDaysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export async function GET(request: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { operatorId } = su;

  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
  });
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Parse query params
  const url = request.nextUrl;
  const granularity = url.searchParams.get("granularity") ?? "monthly";
  const now = new Date();

  let fromDate = startOfMonth(now);
  let toDate = endOfMonth(now);
  if (url.searchParams.get("from")) {
    const parsed = new Date(url.searchParams.get("from")!);
    if (isNaN(parsed.getTime())) return NextResponse.json({ error: "Invalid 'from' date" }, { status: 400 });
    fromDate = parsed;
  }
  if (url.searchParams.get("to")) {
    const parsed = new Date(url.searchParams.get("to")!);
    if (isNaN(parsed.getTime())) return NextResponse.json({ error: "Invalid 'to' date" }, { status: 400 });
    toDate = parsed;
  }

  const periodStart = startOfMonth(now);
  const periodEnd = endOfMonth(now);

  // --- Current period situation stats ---
  const situations = await prisma.situation.findMany({
    where: {
      operatorId,
      billedAt: { gte: periodStart, lte: periodEnd },
      billedCents: { not: null },
    },
    include: {
      situationType: { select: { autonomyLevel: true } },
    },
  });

  // Resolve departments via wiki page slugs
  const domainSlugs = [...new Set(situations.map((s) => s.domainPageSlug).filter(Boolean))] as string[];
  const deptNameMap = new Map<string, string>();
  if (domainSlugs.length > 0) {
    const pages = await prisma.knowledgePage.findMany({
      where: { operatorId, slug: { in: domainSlugs }, scope: "operator" },
      select: { slug: true, title: true },
    });
    for (const p of pages) deptNameMap.set(p.slug, p.title);
  }

  // Group by autonomy level
  const situationsByAutonomy: Record<string, { count: number; totalCents: number }> = {
    supervised: { count: 0, totalCents: 0 },
    notify: { count: 0, totalCents: 0 },
    autonomous: { count: 0, totalCents: 0 },
  };
  for (const s of situations) {
    const level = s.situationType.autonomyLevel;
    if (situationsByAutonomy[level]) {
      situationsByAutonomy[level].count++;
      situationsByAutonomy[level].totalCents += s.billedCents ?? 0;
    }
  }

  // Group by department (via domainPageSlug)
  const departmentUsage = new Map<string, { name: string; count: number; totalCents: number }>();
  for (const s of situations) {
    const slug = s.domainPageSlug;
    if (slug) {
      const name = deptNameMap.get(slug) ?? "Unknown";
      const existing = departmentUsage.get(slug) ?? { name, count: 0, totalCents: 0 };
      existing.count++;
      existing.totalCents += s.billedCents ?? 0;
      departmentUsage.set(slug, existing);
    }
  }

  // --- Copilot stats ---
  const copilotAgg = await prisma.copilotMessage.aggregate({
    where: {
      operatorId,
      createdAt: { gte: periodStart, lte: periodEnd },
      apiCostCents: { not: null },
    },
    _sum: { apiCostCents: true },
    _count: true,
  });

  // --- Historical months (last 12) — single query, group in memory ---
  const historyStart = startOfMonth(subMonths(now, 11));
  const allHistorical = await prisma.situation.findMany({
    where: {
      operatorId,
      billedAt: { gte: historyStart, lte: periodEnd },
      billedCents: { not: null },
    },
    select: {
      billedAt: true,
      billedCents: true,
      situationType: { select: { autonomyLevel: true } },
    },
  });

  const monthBuckets = new Map<string, { supervised: number; notify: number; autonomous: number; situationCount: number }>();
  for (const s of allHistorical) {
    if (!s.billedAt) continue;
    const key = formatMonth(s.billedAt);
    const bucket = monthBuckets.get(key) ?? { supervised: 0, notify: 0, autonomous: 0, situationCount: 0 };
    const level = s.situationType.autonomyLevel;
    if (level === "supervised" || level === "notify" || level === "autonomous") {
      bucket[level] += s.billedCents ?? 0;
    }
    bucket.situationCount++;
    monthBuckets.set(key, bucket);
  }

  const historicalMonths = [...monthBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({ month, ...data }));

  // --- Projection ---
  const daysInMonth = getDaysInMonth(now);
  const dayOfMonth = now.getDate();
  const currentTotalCents = Object.values(situationsByAutonomy).reduce((sum, a) => sum + a.totalCents, 0);
  const projectedMonthEndCents = Math.round(currentTotalCents * (daysInMonth / Math.max(dayOfMonth, 1)));

  // --- Daily breakdown (new, only when granularity=daily) ---
  let dailyBreakdown: Array<{ date: string; supervised: number; notify: number; autonomous: number; copilot: number; total: number }> | undefined;
  if (granularity === "daily") {
    const rangeSituations = await prisma.situation.findMany({
      where: {
        operatorId,
        billedAt: { gte: fromDate, lte: toDate },
        billedCents: { not: null },
      },
      select: {
        billedAt: true,
        billedCents: true,
        situationType: { select: { autonomyLevel: true } },
      },
    });

    const rangeCopilot = await prisma.copilotMessage.findMany({
      where: {
        operatorId,
        createdAt: { gte: fromDate, lte: toDate },
        apiCostCents: { not: null },
      },
      select: { createdAt: true, apiCostCents: true },
    });

    const dayBuckets = new Map<string, { supervised: number; notify: number; autonomous: number; copilot: number; total: number }>();

    for (const s of rangeSituations) {
      if (!s.billedAt) continue;
      const key = formatDate(s.billedAt);
      const bucket = dayBuckets.get(key) ?? { supervised: 0, notify: 0, autonomous: 0, copilot: 0, total: 0 };
      const cents = s.billedCents ?? 0;
      const level = s.situationType.autonomyLevel;
      if (level === "supervised" || level === "notify" || level === "autonomous") {
        bucket[level] += cents;
      }
      bucket.total += cents;
      dayBuckets.set(key, bucket);
    }

    for (const m of rangeCopilot) {
      const key = formatDate(m.createdAt);
      const bucket = dayBuckets.get(key) ?? { supervised: 0, notify: 0, autonomous: 0, copilot: 0, total: 0 };
      const cents = m.apiCostCents ?? 0;
      bucket.copilot += cents;
      bucket.total += cents;
      dayBuckets.set(key, bucket);
    }

    dailyBreakdown = [...dayBuckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));
  }

  // --- Per-employee attribution (new) ---
  const rangeSituationsForEmployees = await prisma.situation.findMany({
    where: {
      operatorId,
      billedAt: { gte: fromDate, lte: toDate },
      billedCents: { not: null },
      assignedUserId: { not: null },
    },
    select: { assignedUserId: true, billedCents: true },
  });

  const rangeCopilotForEmployees = await prisma.copilotMessage.findMany({
    where: {
      operatorId,
      createdAt: { gte: fromDate, lte: toDate },
      userId: { not: null },
    },
    select: { userId: true, apiCostCents: true },
  });

  const employeeMap = new Map<string, { situationCount: number; copilotMessages: number; totalBilledCents: number }>();

  for (const s of rangeSituationsForEmployees) {
    const uid = s.assignedUserId!;
    const existing = employeeMap.get(uid) ?? { situationCount: 0, copilotMessages: 0, totalBilledCents: 0 };
    existing.situationCount++;
    existing.totalBilledCents += s.billedCents ?? 0;
    employeeMap.set(uid, existing);
  }

  for (const m of rangeCopilotForEmployees) {
    const uid = m.userId!;
    const existing = employeeMap.get(uid) ?? { situationCount: 0, copilotMessages: 0, totalBilledCents: 0 };
    existing.copilotMessages++;
    existing.totalBilledCents += m.apiCostCents ?? 0;
    employeeMap.set(uid, existing);
  }

  // Resolve user names
  const userIds = [...employeeMap.keys()];
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const employees = [...employeeMap.entries()]
    .map(([userId, data]) => {
      const user = userMap.get(userId);
      return {
        userId,
        name: user?.name ?? "Unknown",
        email: user?.email ?? "",
        ...data,
      };
    })
    .sort((a, b) => b.totalBilledCents - a.totalBilledCents);

  // --- Onboarding cost (new) ---
  const onboardingRuns = await prisma.onboardingAgentRun.findMany({
    where: {
      analysis: { operatorId },
    },
    select: { costCents: true },
  });
  const onboardingCostCents = onboardingRuns.reduce((sum, r) => sum + (r.costCents ?? 0), 0);

  return NextResponse.json({
    operator: {
      billingStatus: operator.billingStatus,
      billingStartedAt: operator.billingStartedAt,
      orchestrationFeeMultiplier: getOrchestrationFeeMultiplier(operator),
      freeCopilotBudgetCents: operator.freeCopilotBudgetCents,
      freeCopilotUsedCents: operator.freeCopilotUsedCents,
      freeDetectionSituationCount: operator.freeDetectionSituationCount,
      freeDetectionStartedAt: operator.freeDetectionStartedAt,
    },
    currentPeriod: {
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
      situationsByAutonomy,
      copilotMessageCount: copilotAgg._count,
      copilotCostCents: copilotAgg._sum.apiCostCents ?? 0,
      totalBilledCents: currentTotalCents,
      projectedMonthEndCents,
    },
    domains: Array.from(departmentUsage.values()).sort((a, b) => b.totalCents - a.totalCents),
    historicalMonths,
    // New fields
    ...(dailyBreakdown && { dailyBreakdown }),
    employees,
    onboardingCostCents,
  });
}
