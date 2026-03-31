import { prisma } from "@/lib/db";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";

const DEFAULT_TIMEOUT_DAYS = 3;

/**
 * Checks for situations in "monitoring" status where the last action cycle
 * completed more than N days ago without any new signal arriving.
 * Triggers re-reasoning with a timeout signal.
 */
export async function checkSituationTimeouts(operatorId: string): Promise<number> {
  const cutoff = new Date(Date.now() - DEFAULT_TIMEOUT_DAYS * 24 * 60 * 60 * 1000);

  const staleSituations = await prisma.situation.findMany({
    where: {
      operatorId,
      status: "monitoring",
    },
    include: {
      cycles: {
        where: { status: "completed" },
        orderBy: { completedAt: "desc" },
        take: 1,
      },
    },
  });

  let triggered = 0;

  for (const situation of staleSituations) {
    const lastCycle = situation.cycles[0];
    if (!lastCycle?.completedAt) continue;
    if (lastCycle.completedAt > cutoff) continue; // Not stale yet

    const daysSince = Math.floor(
      (Date.now() - lastCycle.completedAt.getTime()) / (24 * 60 * 60 * 1000)
    );

    await prisma.situation.update({
      where: { id: situation.id },
      data: {
        status: "detected",
        triggerEvidence: JSON.stringify({
          type: "timeout",
          lastCycleCompletedAt: lastCycle.completedAt.toISOString(),
          daysSinceLastAction: daysSince,
          lastCycleTrigger: lastCycle.triggerSummary,
        }),
        triggerSummary: `No response after ${daysSince} days`,
      },
    });

    await enqueueWorkerJob("reason_situation", operatorId, { situationId: situation.id });

    console.log(`[timeout-detector] Situation ${situation.id} timed out after ${daysSince} days`);
    triggered++;
  }

  return triggered;
}
