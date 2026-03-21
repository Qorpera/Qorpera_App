import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  detectAbsenceForUser,
  computeAndStoreStructuredSignals,
} from "@/lib/activity-absence";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find active operators (not aiPaused, not suspended)
  const operators = await prisma.operator.findMany({
    where: { aiPaused: false },
    select: { id: true },
  });

  let usersProcessed = 0;
  let situationsCreated = 0;
  let signalsStored = 0;
  let skippedInsufficientData = 0;

  for (const operator of operators) {
    // Get all non-suspended users for this operator that have an entity (needed for activity signal lookup)
    const users = await prisma.user.findMany({
      where: {
        operatorId: operator.id,
        accountSuspended: false,
        entityId: { not: null },
      },
      select: {
        id: true,
        name: true,
        entityId: true,
        operatorId: true,
      },
    });

    for (const user of users) {
      try {
        // Compute and store structured signals (always, even when no absence)
        const stored = await computeAndStoreStructuredSignals(
          operator.id,
          user.id,
          user.entityId!,
        );
        signalsStored += stored;

        // Run absence detection
        const result = await detectAbsenceForUser(operator.id, user);
        if (result === "insufficient_data") {
          skippedInsufficientData++;
        } else if (result === "situation_created") {
          situationsCreated++;
        }
        usersProcessed++;
      } catch (error) {
        console.error(
          `[activity-absence] Error processing user ${user.id}:`,
          error,
        );
      }
    }
  }

  return NextResponse.json({
    usersProcessed,
    situationsCreated,
    signalsStored,
    skippedInsufficientData,
    operatorsChecked: operators.length,
  });
}
