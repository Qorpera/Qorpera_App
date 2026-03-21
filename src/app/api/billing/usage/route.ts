import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

function getDaysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { operatorId } = su;

  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
  });
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
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

  // Resolve departments via trigger entity
  const triggerEntityIds = situations.map((s) => s.triggerEntityId).filter(Boolean) as string[];
  const triggerEntities = triggerEntityIds.length > 0
    ? await prisma.entity.findMany({
        where: { id: { in: triggerEntityIds } },
        select: { id: true, parentDepartmentId: true },
      })
    : [];
  const entityDeptMap = new Map(triggerEntities.map((e) => [e.id, e.parentDepartmentId]));

  // Resolve department names
  const deptIds = [...new Set(triggerEntities.map((e) => e.parentDepartmentId).filter(Boolean))] as string[];
  const departments = deptIds.length > 0
    ? await prisma.entity.findMany({
        where: { id: { in: deptIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const deptNameMap = new Map(departments.map((d) => [d.id, d.displayName]));

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

  // Group by department
  const departmentUsage = new Map<string, { name: string; count: number; totalCents: number }>();
  for (const s of situations) {
    const deptId = s.triggerEntityId ? entityDeptMap.get(s.triggerEntityId) : null;
    if (deptId) {
      const name = deptNameMap.get(deptId) ?? "Unknown";
      const existing = departmentUsage.get(deptId) ?? { name, count: 0, totalCents: 0 };
      existing.count++;
      existing.totalCents += s.billedCents ?? 0;
      departmentUsage.set(deptId, existing);
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

  // --- Historical months (last 12) ---
  const historicalMonths: Array<{
    month: string;
    supervised: number;
    notify: number;
    autonomous: number;
    situationCount: number;
  }> = [];

  for (let i = 11; i >= 0; i--) {
    const mStart = startOfMonth(subMonths(now, i));
    const mEnd = endOfMonth(subMonths(now, i));

    const monthSituations = await prisma.situation.findMany({
      where: {
        operatorId,
        billedAt: { gte: mStart, lte: mEnd },
        billedCents: { not: null },
      },
      select: {
        billedCents: true,
        situationType: { select: { autonomyLevel: true } },
      },
    });

    if (monthSituations.length > 0) {
      const byLevel = { supervised: 0, notify: 0, autonomous: 0 };
      for (const s of monthSituations) {
        const level = s.situationType.autonomyLevel as keyof typeof byLevel;
        if (byLevel[level] !== undefined) {
          byLevel[level] += s.billedCents ?? 0;
        }
      }
      historicalMonths.push({
        month: formatMonth(mStart),
        ...byLevel,
        situationCount: monthSituations.length,
      });
    }
  }

  // --- Projection ---
  const daysInMonth = getDaysInMonth(now);
  const dayOfMonth = now.getDate();
  const currentTotalCents = Object.values(situationsByAutonomy).reduce((sum, a) => sum + a.totalCents, 0);
  const projectedMonthEndCents = Math.round(currentTotalCents * (daysInMonth / Math.max(dayOfMonth, 1)));

  return NextResponse.json({
    operator: {
      billingStatus: operator.billingStatus,
      billingStartedAt: operator.billingStartedAt,
      orchestrationFeeMultiplier: operator.orchestrationFeeMultiplier,
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
    departments: Array.from(departmentUsage.values()).sort((a, b) => b.totalCents - a.totalCents),
    historicalMonths,
  });
}
