import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const operator = await prisma.operator.findUnique({
    where: { id: su.operatorId },
    select: {
      billingStatus: true,
      billingStartedAt: true,
      orchestrationFeeMultiplier: true,
      freeCopilotBudgetCents: true,
      freeCopilotUsedCents: true,
      freeDetectionStartedAt: true,
      freeDetectionSituationCount: true,
    },
  });

  if (!operator) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    billingStatus: operator.billingStatus,
    billingStartedAt: operator.billingStartedAt,
    orchestrationFeeMultiplier: operator.orchestrationFeeMultiplier,
    copilot: {
      budgetCents: operator.freeCopilotBudgetCents,
      usedCents: operator.freeCopilotUsedCents,
      remainingCents: Math.max(0, operator.freeCopilotBudgetCents - operator.freeCopilotUsedCents),
    },
    detection: {
      startedAt: operator.freeDetectionStartedAt,
      situationCount: operator.freeDetectionSituationCount,
      situationCap: 50,
      daysCap: 30,
    },
  });
}
