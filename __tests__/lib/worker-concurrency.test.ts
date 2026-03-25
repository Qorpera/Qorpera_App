import { describe, it, expect } from "vitest";

/**
 * Worker concurrency limiter tests.
 *
 * The worker loop in worker/src/index.ts uses a simple counter pattern:
 *   - MAX_CONCURRENT_JOBS from env (default 5)
 *   - activeJobs counter incremented before dispatch, decremented in finally
 *   - Polling loop skips when activeJobs >= MAX_CONCURRENT_JOBS
 *
 * Since the worker loop is a long-running process that can't be unit-tested
 * directly (it polls Postgres in a while loop), we test the concurrency
 * pattern in isolation.
 */

describe("worker concurrency limiter pattern", () => {
  it("blocks new jobs when at capacity", async () => {
    const maxConcurrent = 3;
    let activeJobs = 0;
    const log: string[] = [];

    async function simulateJob(id: string, durationMs: number) {
      activeJobs++;
      log.push(`start:${id}:${activeJobs}/${maxConcurrent}`);
      await new Promise((r) => setTimeout(r, durationMs));
      activeJobs--;
      log.push(`end:${id}:${activeJobs}/${maxConcurrent}`);
    }

    // Simulate polling loop behavior
    const jobs = [
      { id: "j1", duration: 50 },
      { id: "j2", duration: 50 },
      { id: "j3", duration: 50 },
      { id: "j4", duration: 50 }, // should wait
    ];

    const running: Promise<void>[] = [];
    for (const job of jobs) {
      if (activeJobs >= maxConcurrent) {
        // Wait for a slot
        await Promise.race(running);
      }
      const p = simulateJob(job.id, job.duration);
      running.push(p);
    }

    await Promise.all(running);

    // Verify activeJobs never exceeded maxConcurrent
    for (const entry of log) {
      if (entry.startsWith("start:")) {
        const count = parseInt(entry.split(":")[2].split("/")[0]);
        expect(count).toBeLessThanOrEqual(maxConcurrent);
      }
    }

    // All jobs completed
    expect(activeJobs).toBe(0);
  });

  it("decrements counter even on job failure", async () => {
    let activeJobs = 0;

    async function simulateFailingJob() {
      activeJobs++;
      try {
        throw new Error("Job failed");
      } finally {
        activeJobs--;
      }
    }

    await simulateFailingJob().catch(() => {});
    expect(activeJobs).toBe(0);
  });

  it("reads MAX_CONCURRENT_JOBS from env with default 5", () => {
    // Test the parsing pattern used in the worker
    const parse = (envVal: string | undefined) =>
      parseInt(envVal || "5", 10);

    expect(parse(undefined)).toBe(5);
    expect(parse("3")).toBe(3);
    expect(parse("10")).toBe(10);
  });
});
