import { PrismaClient } from "@prisma/client";
import { runAnalysisPipeline } from "./pipeline";
import { createHttpServer } from "./http-server";
import { dispatchJob } from "./job-dispatcher";
import { startCronScheduler, stopCronScheduler } from "./cron-scheduler";

const prisma = new PrismaClient();
const WORKER_PORT = parseInt(process.env.WORKER_PORT || "3100", 10);

let currentJobId: string | null = null;
let shuttingDown = false;

async function main() {
  // Start HTTP server for LLM proxy
  const server = createHttpServer();
  server.listen(WORKER_PORT, () => {
    console.log(`[worker] HTTP server listening on :${WORKER_PORT}`);
  });

  // Start background cron scheduler
  startCronScheduler();

  console.log("[worker] Qorpera Agent Worker started, polling for jobs...");

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, shutting down...`);
    shuttingDown = true;
    server.close();
    stopCronScheduler();
    if (currentJobId) {
      console.log(`[worker] Marking in-flight analysis ${currentJobId} as failed`);
      await prisma.onboardingAnalysis.update({
        where: { id: currentJobId },
        data: { status: "failed", failureReason: `Worker shutdown (${signal})`, completedAt: new Date() },
      }).catch((err) => console.error("[worker] Failed to mark job:", err));
    }
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  while (!shuttingDown) {
    let didWork = false;

    // ── Poll 1: Onboarding analysis ──────────────────────────────────────
    try {
      const analyses = await prisma.$queryRaw<Array<{ id: string }>>`
        UPDATE "OnboardingAnalysis"
        SET status = 'analyzing', "startedAt" = NOW(), "workerClaimedAt" = NOW()
        WHERE id = (
          SELECT id FROM "OnboardingAnalysis"
          WHERE status = 'pending' AND "workerClaimedAt" IS NULL
          ORDER BY "createdAt" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id
      `;

      if (analyses.length > 0) {
        const jobId = analyses[0].id;
        currentJobId = jobId;
        console.log(`[worker] Claimed analysis ${jobId}`);
        try {
          await runAnalysisPipeline(jobId, prisma);
        } catch (err) {
          console.error(`[worker] Analysis ${jobId} failed:`, err);
          await prisma.onboardingAnalysis.update({
            where: { id: jobId },
            data: { status: "failed", failureReason: String(err), completedAt: new Date() },
          });
        }
        currentJobId = null;
        didWork = true;
      }
    } catch (err) {
      console.error("[worker] Analysis poll error:", err);
    }

    // ── Poll 2: Worker job queue ─────────────────────────────────────────
    try {
      const jobs = await prisma.$queryRaw<Array<{ id: string; jobType: string; payload: string }>>`
        UPDATE "WorkerJob"
        SET status = 'running', "claimedAt" = NOW()
        WHERE id = (
          SELECT id FROM "WorkerJob"
          WHERE status = 'pending'
          ORDER BY "createdAt" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, "jobType", payload::text
      `;

      if (jobs.length > 0) {
        const job = jobs[0];
        console.log(`[worker] Claimed job ${job.id} (${job.jobType})`);
        try {
          const payload = typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload;
          await dispatchJob(job.jobType, payload);
          await prisma.workerJob.update({
            where: { id: job.id },
            data: { status: "completed", completedAt: new Date() },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[worker] Job ${job.id} (${job.jobType}) failed:`, message);
          await prisma.workerJob.update({
            where: { id: job.id },
            data: { status: "failed", error: message, completedAt: new Date() },
          });
        }
        didWork = true;
      }
    } catch (err) {
      console.error("[worker] Job poll error:", err);
    }

    // Only sleep if no work was done this cycle
    if (!didWork) {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

main().catch(console.error);
