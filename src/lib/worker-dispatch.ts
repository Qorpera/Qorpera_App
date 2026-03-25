import { prisma } from "@/lib/db";

/**
 * Enqueue a job for the Bastion worker to execute.
 * Returns immediately — the worker picks it up within 5 seconds.
 */
export async function enqueueWorkerJob(
  jobType: string,
  operatorId: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const job = await prisma.workerJob.create({
    data: {
      jobType,
      operatorId,
      payload: payload as any,
    },
  });
  return job.id;
}
