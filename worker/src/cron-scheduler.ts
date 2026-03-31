import { prisma } from "@/lib/db";
import { detectSituations } from "@/lib/situation-detector";
import { auditPreFilters } from "@/lib/situation-audit";
import { runScheduledInitiativeEvaluation } from "@/lib/initiative-reasoning";
import { extractInsights, getLastExtractionTime } from "@/lib/operational-knowledge";
import { computePriorityScores } from "@/lib/prioritization-engine";
import { processRecurringTasks } from "@/lib/recurring-tasks";
import { startSyncScheduler, stopSyncScheduler } from "@/lib/sync-scheduler";
import { runStrategicScan } from "@/lib/strategic-scan";

const timers: ReturnType<typeof setInterval>[] = [];

export function startCronScheduler() {
  // ── Situation Detection: every 15 minutes ──────────────────────────────
  timers.push(
    setInterval(async () => {
      try {
        const operators = await prisma.operator.findMany({
          where: { isTestOperator: false },
          select: { id: true },
        });
        for (const op of operators) {
          const results = await detectSituations(op.id);
          if (results.length > 0) {
            console.log(`[cron:detection] Operator ${op.id}: ${results.length} situations detected`);
          }
        }
      } catch (err) {
        console.error("[cron:detection] Error:", err);
      }
    }, 15 * 60 * 1000),
  );

  // ── Situation Audit: every 24 hours ────────────────────────────────────
  timers.push(
    setInterval(async () => {
      try {
        const operators = await prisma.operator.findMany({
          where: { isTestOperator: false },
          select: { id: true },
        });
        for (const op of operators) {
          const results = await auditPreFilters(op.id);
          const totalMisses = results.reduce((sum, r) => sum + r.missesFound, 0);
          const regens = results.filter((r) => r.filterRegenerated).length;
          if (totalMisses > 0 || regens > 0) {
            console.log(`[cron:audit] Operator ${op.id}: ${totalMisses} misses, ${regens} filters regenerated`);
          }
        }
      } catch (err) {
        console.error("[cron:audit] Error:", err);
      }
    }, 24 * 60 * 60 * 1000),
  );

  // ── Initiative Evaluation: every 4 hours ───────────────────────────────
  timers.push(
    setInterval(async () => {
      try {
        const result = await runScheduledInitiativeEvaluation();
        console.log("[cron:initiatives]", result);
      } catch (err) {
        console.error("[cron:initiatives] Error:", err);
      }
    }, 4 * 60 * 60 * 1000),
  );

  // ── Insight Extraction: daily ──────────────────────────────────────────
  timers.push(
    setInterval(async () => {
      try {
        const aiEntities = await prisma.entity.findMany({
          where: {
            entityType: { slug: { in: ["ai-agent", "department-ai", "hq-ai"] } },
            status: "active",
            operator: { isTestOperator: false },
          },
          select: { id: true, operatorId: true },
        });

        let processed = 0;
        for (const entity of aiEntities) {
          const operator = await prisma.operator.findUnique({
            where: { id: entity.operatorId },
            select: { createdAt: true },
          });
          if (!operator) continue;

          const operatorAgeDays = (Date.now() - operator.createdAt.getTime()) / (1000 * 60 * 60 * 24);
          const lastExtraction = await getLastExtractionTime(entity.id);

          if (operatorAgeDays <= 7) {
            if (lastExtraction && (Date.now() - lastExtraction.getTime()) < 20 * 60 * 60 * 1000) continue;
          } else {
            if (lastExtraction && (Date.now() - lastExtraction.getTime()) < 6 * 24 * 60 * 60 * 1000) continue;
          }

          try {
            await extractInsights(entity.operatorId, entity.id);
            processed++;
          } catch (err) {
            console.error(`[cron:insights] Entity ${entity.id} failed:`, err);
          }
        }

        if (processed > 0) {
          console.log(`[cron:insights] Processed ${processed} AI entities`);
        }
      } catch (err) {
        console.error("[cron:insights] Error:", err);
      }
    }, 24 * 60 * 60 * 1000),
  );

  // ── Priority Scoring: every 6 hours ────────────────────────────────────
  timers.push(
    setInterval(async () => {
      try {
        const operators = await prisma.operator.findMany({
          where: { isTestOperator: false },
          select: { id: true },
        });
        for (const op of operators) {
          await computePriorityScores(op.id).catch((err) =>
            console.error(`[cron:priorities] Operator ${op.id} failed:`, err),
          );
        }
      } catch (err) {
        console.error("[cron:priorities] Error:", err);
      }
    }, 6 * 60 * 60 * 1000),
  );

  // ── Stale Job Reaper: every 5 minutes ──────────────────────────────
  timers.push(
    setInterval(async () => {
      try {
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
        const stale = await prisma.workerJob.updateMany({
          where: {
            status: "pending",
            createdAt: { lt: thirtyMinAgo },
          },
          data: {
            status: "failed",
            error: "Job timed out — worker did not claim within 30 minutes",
            completedAt: new Date(),
          },
        });
        if (stale.count > 0) {
          console.warn(`[cron:stale-jobs] Marked ${stale.count} stale jobs as failed`);
        }
      } catch (err) {
        console.error("[cron:stale-jobs] Error:", err);
      }
    }, 5 * 60 * 1000),
  );

  // ── Recurring Tasks: every 15 minutes ───────────────────────────────
  timers.push(
    setInterval(async () => {
      try {
        const result = await processRecurringTasks();
        if (result.triggered > 0) {
          console.log(`[cron:recurring-tasks] Processed ${result.processed}, triggered ${result.triggered}, errors ${result.errors}`);
        }
      } catch (err) {
        console.error("[cron:recurring-tasks] Error:", err);
      }
    }, 15 * 60 * 1000),
  );

  // ── ActivitySignal Retention Cleanup: daily ───────────────────────
  timers.push(
    setInterval(async () => {
      try {
        const retentionDays = 90;
        const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
        const deleted = await prisma.activitySignal.deleteMany({
          where: { occurredAt: { lt: cutoff } },
        });
        if (deleted.count > 0) {
          console.log(`[cron:retention] Cleaned up ${deleted.count} old ActivitySignals`);
        }
      } catch (err) {
        console.error("[cron:retention] Error:", err);
      }
    }, 24 * 60 * 60 * 1000),
  );

  // ── Strategic Scan: every 2 hours ─────────────────────────────────
  timers.push(
    setInterval(async () => {
      try {
        const operators = await prisma.operator.findMany({
          where: { isTestOperator: false },
          select: { id: true },
        });
        for (const op of operators) {
          try {
            const result = await runStrategicScan(op.id);
            if (result.results.length > 0) {
              console.log(`[cron:strategic-scan] Operator ${op.id}: approach=${result.approach}, findings=${result.results.length}, initiatives=${result.initiativesCreated}`);
            }
          } catch (err) {
            console.error(`[cron:strategic-scan] Operator ${op.id} failed:`, err);
          }
        }
      } catch (err) {
        console.error("[cron:strategic-scan] Error:", err);
      }
    }, 2 * 60 * 60 * 1000),
  );

  // ── Sync Scheduler ──────────────────────────────────────────────────
  startSyncScheduler();

  console.log("[cron] Started: detection(15m), audit(24h), initiatives(4h), insights(24h), priorities(6h), stale-jobs(5m), recurring-tasks(15m), sync-scheduler, retention(24h), strategic-scan(2h)");
}

export function stopCronScheduler() {
  stopSyncScheduler();
  for (const timer of timers) {
    clearInterval(timer);
  }
  timers.length = 0;
}
