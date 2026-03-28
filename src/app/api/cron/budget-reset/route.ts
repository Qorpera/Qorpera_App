import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Daily cron: reset budget period for operators whose budgetPeriodStart
 * is in a previous calendar month.
 */
export async function GET() {
  const now = new Date();

  const operators = await prisma.operator.findMany({
    where: { budgetPeriodStart: { not: null } },
    select: { id: true, budgetPeriodStart: true },
  });

  let resetCount = 0;

  for (const op of operators) {
    const periodStart = new Date(op.budgetPeriodStart!);
    if (now.getMonth() !== periodStart.getMonth() || now.getFullYear() !== periodStart.getFullYear()) {
      await prisma.operator.update({
        where: { id: op.id },
        data: {
          budgetAlertsSentThisPeriod: [],
          budgetPeriodStart: new Date(now.getFullYear(), now.getMonth(), 1),
        },
      });
      resetCount++;
    }
  }

  return NextResponse.json({ ok: true, resetCount });
}
