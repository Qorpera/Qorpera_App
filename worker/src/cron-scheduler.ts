import { prisma } from "@/lib/db";
import { auditPreFilters } from "@/lib/situation-audit";
import { computePriorityScores } from "@/lib/prioritization-engine";

import { processSystemJobs } from "@/lib/system-job-reasoning";
import { startSyncScheduler, stopSyncScheduler } from "@/lib/sync-scheduler";
import { assembleInitiativesFromBookmarks } from "@/lib/wiki-bookmark-assembly";
import { checkSituationTimeouts } from "@/lib/situation-timeout-detector";

const timers: ReturnType<typeof setInterval>[] = [];

export function startCronScheduler() {
  // ── Content Detection Sweep: every 15 minutes ──────────────────────────
  timers.push(
    setInterval(async () => {
      try {
        const operators = await prisma.operator.findMany({
          where: { aiPaused: false, isTestOperator: false },
          select: { id: true },
        });
        for (const op of operators) {
          try {
            const { evaluateContentForSituations, isEligibleCommunication } = await import("@/lib/content-situation-detector");

            // Sweep unprocessed RawContent — catches anything sync-time detection missed
            const unprocessed = await prisma.rawContent.findMany({
              where: {
                operatorId: op.id,
                processedAt: null,
                sourceType: { in: ["email", "slack_message", "teams_message", "calendar_event"] },
                rawBody: { not: null },
              },
              select: { id: true, sourceType: true, sourceId: true, rawBody: true, rawMetadata: true },
              orderBy: { occurredAt: "desc" },
              take: 100,
            });

            if (unprocessed.length === 0) continue;

            // Filter eligible communications
            const items = unprocessed
              .filter(raw => {
                const meta = (raw.rawMetadata ?? {}) as Record<string, unknown>;
                return isEligibleCommunication({ sourceType: raw.sourceType, metadata: meta });
              })
              .map(raw => {
                const meta = (raw.rawMetadata ?? {}) as Record<string, unknown>;
                const emails: string[] = [];
                if (typeof meta.from === "string") emails.push(meta.from);
                if (Array.isArray(meta.to)) emails.push(...(meta.to as string[]));
                else if (typeof meta.to === "string") emails.push(...meta.to.split(/[,;]\s*/));
                if (Array.isArray(meta.cc)) emails.push(...(meta.cc as string[]));
                else if (typeof meta.cc === "string") emails.push(...meta.cc.split(/[,;]\s*/));
                return {
                  sourceType: raw.sourceType,
                  sourceId: raw.sourceId,
                  content: raw.rawBody!,
                  metadata: meta,
                  participantEmails: emails.length > 0 ? emails : undefined,
                };
              });

            if (items.length > 0) {
              const BATCH = 20;
              for (let i = 0; i < items.length; i += BATCH) {
                await evaluateContentForSituations(op.id, items.slice(i, i + BATCH));
              }
              console.log(`[cron:detection] Operator ${op.id}: evaluated ${items.length} unprocessed items`);
            }

            // Mark all fetched items as processed (including ineligible ones)
            await prisma.rawContent.updateMany({
              where: { id: { in: unprocessed.map(u => u.id) } },
              data: { processedAt: new Date() },
            });
          } catch (err) {
            console.error(`[cron:detection] Operator ${op.id} failed:`, err);
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
          where: { aiPaused: false, isTestOperator: false },
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

  // ── Insight Extraction: daily ──────────────────────────────────────────
  timers.push(
    setInterval(async () => {
      try {
        const operators = await prisma.operator.findMany({
          where: { isTestOperator: false },
          select: { id: true, createdAt: true },
        });

        for (const op of operators) {
          const lastInsight = await prisma.operationalInsight.findFirst({
            where: { operatorId: op.id },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          });

          const hoursSince = lastInsight
            ? (Date.now() - lastInsight.createdAt.getTime()) / (1000 * 60 * 60)
            : Infinity;

          // New operators (<7 days): every 20 hours. Established: every 6 days.
          const ageDays = (Date.now() - op.createdAt.getTime()) / (1000 * 60 * 60 * 24);
          const intervalHours = ageDays <= 7 ? 20 : 144;

          if (hoursSince < intervalHours) continue;

          try {
            const { extractOperatorInsights } = await import("@/lib/operational-knowledge");
            const result = await extractOperatorInsights(op.id);
            if (result.insightsCreated > 0) {
              console.log(`[cron:insights] Operator ${op.id}: ${result.insightsCreated} insights ($${(result.costCents / 100).toFixed(2)})`);
            }
          } catch (err) {
            console.error(`[cron:insights] Operator ${op.id} failed:`, err);
          }
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

  // ── Wiki Strategic Scanner: activity-aware interval ──
  // Checks activity level per operator and adjusts scan frequency:
  // < 5 active items → scan every 1 hour (deep, Opus)
  // >= 5 active items → scan every 4 hours (light, Sonnet)
  const SCANNER_CHECK_INTERVAL = 60 * 60 * 1000; // Check every hour
  timers.push(
    setInterval(async () => {
      try {
        const operators = await prisma.operator.findMany({
          where: { isTestOperator: false },
          select: { id: true },
        });
        for (const op of operators) {
          try {
            const { shouldRunScan, runWikiStrategicScan } = await import("@/lib/wiki-strategic-scanner");
            const shouldScan = await shouldRunScan(op.id);
            if (!shouldScan) continue;

            const result = await runWikiStrategicScan(op.id);
            if (result.initiativesCreated > 0 || result.situationsCreated > 0) {
              console.log(`[cron:wiki-scanner] Operator ${op.id}: ${result.initiativesCreated} initiatives, ${result.situationsCreated} situations (${result.scanDepth} scan)`);
            }
          } catch (err) {
            console.error(`[cron:wiki-scanner] Operator ${op.id} failed:`, err);
          }
        }
      } catch (err) {
        console.error("[cron:wiki-scanner] Error:", err);
      }
    }, SCANNER_CHECK_INTERVAL),
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

  // ── Living Research: every 2 hours ──────────────────────────────────
  // Extracts evidence from new data, assesses significance, updates wiki pages.
  // Replaces incremental background synthesis with investigation-quality updates.
  // (Background synthesis still runs via job handler for onboarding mode.)
  timers.push(
    setInterval(async () => {
      try {
        const operators = await prisma.operator.findMany({
          where: { aiPaused: false, isTestOperator: false },
          select: { id: true },
        });
        for (const op of operators) {
          try {
            const { runLivingResearch } = await import("@/lib/living-research");
            const result = await runLivingResearch(op.id);
            if (result.significantFindings > 0 || result.wikiPagesUpdated > 0) {
              console.log(
                `[cron:living-research] Operator ${op.id}: ${result.significantFindings} findings, ${result.wikiPagesUpdated} pages updated`,
              );
            }

            // Run bookmark assembly after living research if new bookmarks were created
            if (result.bookmarksEmitted > 0) {
              try {
                const assembly = await assembleInitiativesFromBookmarks(op.id);
                if (assembly.initiativesCreated > 0) {
                  console.log(
                    `[cron:living-research] Operator ${op.id}: ${assembly.initiativesCreated} initiatives from bookmarks`,
                  );
                }
              } catch (err) {
                console.error(`[cron:living-research] Bookmark assembly failed:`, err);
              }
            }
          } catch (err) {
            console.error(`[cron:living-research] Operator ${op.id} failed:`, err);
          }
        }
      } catch (err) {
        console.error("[cron:living-research] Error:", err);
      }
    }, 2 * 60 * 60 * 1000),
  );

  // ── Wiki Quality Monitor: every 12 hours ────────────────────────────
  // Checks page effectiveness from context evaluation telemetry.
  // Auto-rolls back pages with poor outcomes, flags challenged pages,
  // promotes pages with strong outcomes.
  timers.push(
    setInterval(async () => {
      try {
        const operators = await prisma.operator.findMany({
          where: { isTestOperator: false, aiPaused: false },
          select: { id: true },
        });
        for (const op of operators) {
          try {
            const { runQualityCheck } = await import("@/lib/wiki-quality-monitor");
            const result = await runQualityCheck(op.id);
            if (result.pagesRolledBack > 0 || result.pagesFlagged > 0 || result.pagesPromoted > 0) {
              console.log(
                `[cron:quality-monitor] Operator ${op.id}: ${result.pagesRolledBack} rolled back, ${result.pagesFlagged} flagged, ${result.pagesPromoted} promoted`,
              );
            }
          } catch (err) {
            console.error(`[cron:quality-monitor] Operator ${op.id} failed:`, err);
          }
        }
      } catch (err) {
        console.error("[cron:quality-monitor] Error:", err);
      }
    }, 12 * 60 * 60 * 1000),
  );

  // ── Document Intelligence Quality Loop: weekly ─────────────────────
  // Calculates composite quality scores for document-intelligence wiki pages,
  // selects few-shot examples, and proposes single prompt mutations.
  // Mutations start in "testing" status — not auto-deployed.
  timers.push(
    setInterval(async () => {
      try {
        const operators = await prisma.operator.findMany({
          where: { aiPaused: false, isTestOperator: false },
          select: { id: true },
        });
        for (const op of operators) {
          try {
            const { runOptimizationCycle } = await import(
              "@/lib/document-intelligence/quality-loop"
            );
            const result = await runOptimizationCycle(op.id);
            if (result.mutationProposed) {
              console.log(
                `[cron:quality-loop] Operator ${op.id}: proposed ${result.promptType} mutation — ${result.mutation}`,
              );
            }
          } catch (err) {
            console.error(`[cron:quality-loop] Operator ${op.id} failed:`, err);
          }
        }
      } catch (err) {
        console.error("[cron:quality-loop] Error:", err);
      }
    }, 7 * 24 * 60 * 60 * 1000),
  );

  // ── Activity Cleanup: every 6 hours ──────────────────────────────────
  timers.push(
    setInterval(async () => {
      try {
        const operators = await prisma.operator.findMany({
          where: { isTestOperator: false },
          select: { id: true },
        });
        for (const op of operators) {
          try {
            const { cleanActivityPages } = await import("@/lib/wiki-activity-pipeline");
            const result = await cleanActivityPages(op.id);
            if (result.entriesRemoved > 0 || result.entriesCompressed > 0) {
              console.log(
                `[cron:activity-cleanup] Operator ${op.id}: ${result.pagesCleanedUp} pages, ${result.entriesRemoved} removed, ${result.entriesCompressed} compressed`,
              );
            }
          } catch (err) {
            console.error(`[cron:activity-cleanup] Operator ${op.id} failed:`, err);
          }
        }
      } catch (err) {
        console.error("[cron:activity-cleanup] Error:", err);
      }
    }, 6 * 60 * 60 * 1000),
  );

  // ── Sync Scheduler ──────────────────────────────────────────────────
  startSyncScheduler();

  console.log("[cron] Started: detection(15m), audit(24h), insights(24h), priorities(6h), stale-jobs(5m), system-jobs(15m), sync-scheduler, retention(24h), strategic-scan(2h), calendar-scanner(4h), timeout-check(4h), living-research(2h), quality-monitor(12h), quality-loop(7d), activity-cleanup(6h)");
}

export function stopCronScheduler() {
  stopSyncScheduler();
  for (const timer of timers) {
    clearInterval(timer);
  }
  timers.length = 0;
}
