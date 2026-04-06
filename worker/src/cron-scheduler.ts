import { prisma } from "@/lib/db";
import { detectSituations } from "@/lib/situation-detector";
import { auditPreFilters } from "@/lib/situation-audit";
import { runScheduledInitiativeEvaluation } from "@/lib/initiative-reasoning";
import { extractInsights, getLastExtractionTime } from "@/lib/operational-knowledge";
import { computePriorityScores } from "@/lib/prioritization-engine";
import { processRecurringTasks } from "@/lib/recurring-tasks";
import { processSystemJobs } from "@/lib/system-job-reasoning";
import { startSyncScheduler, stopSyncScheduler } from "@/lib/sync-scheduler";
import { assembleInitiativesFromBookmarks } from "@/lib/wiki-bookmark-assembly";
import { checkSituationTimeouts } from "@/lib/situation-timeout-detector";

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

  // ── System Jobs: every 15 minutes ────────────────────────────────
  timers.push(
    setInterval(async () => {
      try {
        const result = await processSystemJobs();
        if (result.triggered > 0 || result.compressed > 0) {
          console.log(`[cron:system-jobs] Processed ${result.processed}, triggered ${result.triggered}, compressed ${result.compressed}, errors ${result.errors}`);
        }
      } catch (err) {
        console.error("[cron:system-jobs] Error:", err);
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

  // ── Wiki Strategic Scanner: every 2 hours (replaces old strategic-scan) ──
  // Reads synthesized wiki pages to identify patterns → routes to initiatives or situations
  // initiative-reasoning: handles goal-driven initiative evaluation (complementary, not redundant)
  // wiki-strategic-scanner: handles pattern-driven initiative discovery from wiki
  timers.push(
    setInterval(async () => {
      try {
        const operators = await prisma.operator.findMany({
          where: { isTestOperator: false },
          select: { id: true },
        });
        for (const op of operators) {
          try {
            const result = await assembleInitiativesFromBookmarks(op.id);
            if (result.initiativesCreated > 0) {
              console.log(`[cron:bookmark-assembly] Operator ${op.id}: ${result.initiativesCreated} initiatives from ${result.bookmarksReviewed} bookmarks`);
            }
          } catch (err) {
            console.error(`[cron:wiki-scanner] Operator ${op.id} failed:`, err);
          }
        }
      } catch (err) {
        console.error("[cron:wiki-scanner] Error:", err);
      }
    }, 2 * 60 * 60 * 1000),
  );

  // ── Calendar Scanner: every 4 hours ─────────────────────────────────
  timers.push(
    setInterval(async () => {
      try {
        const operators = await prisma.operator.findMany({
          where: { isTestOperator: false },
          select: { id: true },
        });
        for (const op of operators) {
          try {
            const { runCalendarScanner } = await import("@/lib/calendar-scanner");
            const result = await runCalendarScanner(op.id);
            if (result.syntheticSignalsSent > 0) {
              console.log(`[cron:calendar-scanner] Operator ${op.id}:`, result);
            }
          } catch (err) {
            console.error(`[cron:calendar-scanner] Operator ${op.id} failed:`, err);
          }
        }
      } catch (err) {
        console.error("[cron:calendar-scanner] Error:", err);
      }
    }, 4 * 60 * 60 * 1000),
  );

  // ── Situation Timeout Check: every 4 hours ───────────────────────────
  timers.push(
    setInterval(async () => {
      try {
        const operators = await prisma.operator.findMany({
          where: { isTestOperator: false },
          select: { id: true },
        });
        for (const op of operators) {
          try {
            const count = await checkSituationTimeouts(op.id);
            if (count > 0) console.log(`[cron:timeout-check] Operator ${op.id}: ${count} situations triggered`);
          } catch (err) {
            console.error(`[cron:timeout-check] Operator ${op.id} failed:`, err);
          }
        }
      } catch (err) {
        console.error("[cron:timeout-check] Error:", err);
      }
    }, 4 * 60 * 60 * 1000),
  );

  // ── Wiki Background Synthesis: every 4 hours ───────────────────────
  // Processes unprocessed data into wiki pages (incremental mode).
  timers.push(
    setInterval(async () => {
      try {
        const operators = await prisma.operator.findMany({
          where: { aiPaused: false },
          select: { id: true },
        });
        for (const op of operators) {
          try {
            const { runBackgroundSynthesis } = await import("@/lib/wiki-background-synthesis");
            const result = await runBackgroundSynthesis(op.id, { mode: "incremental" });
            if (result.pagesCreated > 0 || result.pagesUpdated > 0) {
              console.log(`[cron:wiki-synthesis] Operator ${op.id}: ${result.pagesCreated} created, ${result.pagesUpdated} updated`);
            }
          } catch (err) {
            console.error(`[cron:wiki-synthesis] Operator ${op.id} failed:`, err);
          }
        }
      } catch (err) {
        console.error("[cron:wiki-synthesis] Error:", err);
      }
    }, 4 * 60 * 60 * 1000),
  );

  // ── Sync Scheduler ──────────────────────────────────────────────────
  startSyncScheduler();

  console.log("[cron] Started: detection(15m), audit(24h), initiatives(4h), insights(24h), priorities(6h), stale-jobs(5m), recurring-tasks(15m), system-jobs(15m), sync-scheduler, retention(24h), strategic-scan(2h), calendar-scanner(4h), timeout-check(4h), wiki-synthesis(4h)");
}

export function stopCronScheduler() {
  stopSyncScheduler();
  for (const timer of timers) {
    clearInterval(timer);
  }
  timers.length = 0;
}
