import { reasonAboutSituation } from "@/lib/reasoning-engine";
import { reassessWorkStream } from "@/lib/workstream-reassessment";

type JobPayload = Record<string, unknown>;

const handlers: Record<string, (payload: JobPayload) => Promise<void>> = {
  async reason_situation(payload) {
    const { situationId } = payload as { situationId: string };
    await reasonAboutSituation(situationId);
  },

  async reassess_workstream(payload) {
    const { workStreamId, completedSourceId, completedSourceType } = payload as {
      workStreamId: string;
      completedSourceId: string;
      completedSourceType: string;
    };
    await reassessWorkStream(workStreamId, completedSourceId, completedSourceType);
  },
};

export async function dispatchJob(jobType: string, payload: JobPayload): Promise<void> {
  const handler = handlers[jobType];
  if (!handler) {
    throw new Error(`Unknown job type: ${jobType}`);
  }
  await handler(payload);
}
