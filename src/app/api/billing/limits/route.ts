import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentPeriodSpendCents } from "@/lib/billing-events";

// ── GET /api/billing/limits ─────────────────────────────────────────────────

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const operator = await prisma.operator.findUnique({
    where: { id: su.operatorId },
  });
  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const currentSpendCents = await getCurrentPeriodSpendCents(
    su.operatorId,
    operator.budgetPeriodStart,
  );

  const percentUsed = operator.monthlyBudgetCents
    ? Math.round(((currentSpendCents / operator.monthlyBudgetCents) * 100) * 100) / 100
    : 0;

  // Rate limits: AppSettings if available, otherwise defaults
  const rateLimitKeys = ["rate_copilot_per_minute", "rate_concurrent_plans", "rate_detection_interval_minutes"];
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: rateLimitKeys }, operatorId: su.operatorId },
  });
  const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

  const rateLimits = {
    copilotPerMinute: parseInt(settingsMap.get("rate_copilot_per_minute") ?? "30", 10),
    concurrentExecutionPlans: parseInt(settingsMap.get("rate_concurrent_plans") ?? "10", 10),
    detectionSweepIntervalMinutes: parseInt(settingsMap.get("rate_detection_interval_minutes") ?? "60", 10),
  };

  // Free tier: only if billing status is free
  let freeTier: Record<string, number> | null = null;
  if (operator.billingStatus === "free") {
    const detectionDaysUsed = operator.freeDetectionStartedAt
      ? Math.floor((Date.now() - operator.freeDetectionStartedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    freeTier = {
      copilotBudgetCents: operator.freeCopilotBudgetCents,
      copilotUsedCents: operator.freeCopilotUsedCents,
      detectionSituationLimit: 50,
      detectionSituationCount: operator.freeDetectionSituationCount,
      detectionDayLimit: 30,
      detectionDaysUsed,
    };
  }

  return NextResponse.json({
    budget: {
      monthlyBudgetCents: operator.monthlyBudgetCents,
      budgetAlertThresholds: operator.budgetAlertThresholds ?? [],
      budgetHardStop: operator.budgetHardStop,
      currentSpendCents,
      budgetPeriodStart: operator.budgetPeriodStart?.toISOString() ?? null,
      percentUsed,
    },
    rateLimits,
    freeTier,
  });
}

// ── PATCH /api/billing/limits ───────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = su.user;
  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { monthlyBudgetCents, budgetAlertThresholds, budgetHardStop } = body as Record<string, unknown>;

  // Validate monthlyBudgetCents
  if (monthlyBudgetCents !== undefined) {
    if (monthlyBudgetCents !== null && (typeof monthlyBudgetCents !== "number" || !Number.isInteger(monthlyBudgetCents) || monthlyBudgetCents <= 0)) {
      return NextResponse.json({ error: "monthlyBudgetCents must be null or a positive integer" }, { status: 400 });
    }
  }

  // Validate budgetAlertThresholds
  if (budgetAlertThresholds !== undefined) {
    if (!Array.isArray(budgetAlertThresholds)) {
      return NextResponse.json({ error: "budgetAlertThresholds must be an array" }, { status: 400 });
    }
    if (budgetAlertThresholds.length > 5) {
      return NextResponse.json({ error: "budgetAlertThresholds max 5 entries" }, { status: 400 });
    }
    for (const t of budgetAlertThresholds) {
      if (typeof t !== "number" || t < 1 || t > 100) {
        return NextResponse.json({ error: "Each threshold must be a number between 1 and 100" }, { status: 400 });
      }
    }
    // Must be sorted ascending
    for (let i = 1; i < budgetAlertThresholds.length; i++) {
      if (budgetAlertThresholds[i] <= budgetAlertThresholds[i - 1]) {
        return NextResponse.json({ error: "budgetAlertThresholds must be sorted ascending" }, { status: 400 });
      }
    }
  }

  // Validate budgetHardStop
  if (budgetHardStop !== undefined && typeof budgetHardStop !== "boolean") {
    return NextResponse.json({ error: "budgetHardStop must be a boolean" }, { status: 400 });
  }

  // Build update
  const data: Record<string, unknown> = {};

  if (monthlyBudgetCents !== undefined) data.monthlyBudgetCents = monthlyBudgetCents;
  if (budgetAlertThresholds !== undefined) data.budgetAlertThresholds = budgetAlertThresholds;
  if (budgetHardStop !== undefined) data.budgetHardStop = budgetHardStop;

  // Reset alerts on any config change
  data.budgetAlertsSentThisPeriod = [];

  // Set budgetPeriodStart on first budget setup
  if (monthlyBudgetCents !== undefined && monthlyBudgetCents !== null) {
    const operator = await prisma.operator.findUnique({
      where: { id: su.operatorId },
      select: { budgetPeriodStart: true },
    });
    if (!operator?.budgetPeriodStart) {
      const now = new Date();
      data.budgetPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }

  await prisma.operator.update({
    where: { id: su.operatorId },
    data,
  });

  // Return fresh GET response
  const getResponse = await GET();
  return getResponse;
}
