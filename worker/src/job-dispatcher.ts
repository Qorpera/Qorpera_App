import { reasonAboutSituation } from "@/lib/reasoning-engine";
import { reassessWorkStream } from "@/lib/workstream-reassessment";
import { advanceStep } from "@/lib/execution-engine";
import { detectSituations } from "@/lib/situation-detector";
import { evaluateContentForSituations, type CommunicationItem } from "@/lib/content-situation-detector";
import { generatePreFilter } from "@/lib/situation-prefilter";

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

  async advance_step(payload) {
    const { stepId, action, userId } = payload as { stepId: string; action: "approve" | "reject" | "skip"; userId: string };
    await advanceStep(stepId, action, userId);
  },

  async detect_situations(payload) {
    const { operatorId } = payload as { operatorId: string };
    await detectSituations(operatorId);
  },

  async evaluate_content(payload) {
    const { operatorId, items } = payload as { operatorId: string; items: CommunicationItem[] };
    await evaluateContentForSituations(operatorId, items);
  },

  async generate_prefilter(payload) {
    const { situationTypeId } = payload as { situationTypeId: string };
    await generatePreFilter(situationTypeId);
  },

  async extract_insights(payload) {
    const { operatorId, aiEntityId } = payload as {
      operatorId: string;
      aiEntityId: string;
    };
    const { extractInsights } = await import("@/lib/operational-knowledge");
    await extractInsights(operatorId, aiEntityId);
  },

  async audit_prefilters(payload) {
    const { operatorId } = payload as { operatorId: string };
    const { auditPreFilters } = await import("@/lib/situation-audit");
    await auditPreFilters(operatorId);
  },
};

export async function dispatchJob(jobType: string, payload: JobPayload): Promise<void> {
  const handler = handlers[jobType];
  if (!handler) {
    throw new Error(`Unknown job type: ${jobType}`);
  }
  await handler(payload);
}
