import { callLLM } from "@/lib/ai-provider";
import { extractJSON } from "@/lib/json-helpers";

const REFINEMENT_MODEL = "claude-opus-4-6";

interface StepUncertainty {
  field: string;
  assumption: string;
  impact: "high" | "medium" | "low";
}

interface ActionStep {
  title: string;
  description: string;
  executionMode: string;
  actionCapabilityName?: string;
  params?: Record<string, unknown>;
  uncertainties?: StepUncertainty[];
}

interface RefinementResult {
  refinedSteps: Array<{
    stepIndex: number;
    paramUpdates?: Record<string, unknown> | null;
    descriptionUpdate?: string | null;
    remainingUncertainties: StepUncertainty[];
  }>;
}

/**
 * Sends flagged uncertainties back to Opus 4.6 for focused resolution.
 * The model tries harder to resolve each uncertainty from the evidence.
 * If it succeeds, it updates the step params. If it can't, it keeps the
 * uncertainty for human review.
 *
 * Only called when the reasoning output contains uncertainties.
 */
export async function refineUncertainties(
  actionBatch: ActionStep[],
  evidenceSummary: string,
  communicationContext: string | undefined,
  triggerEvidence: string | undefined,
  operatorId?: string,
): Promise<RefinementResult> {
  const stepsToRefine = actionBatch
    .map((s, i) => ({ index: i, ...s }))
    .filter(s => s.uncertainties && s.uncertainties.length > 0);

  if (stepsToRefine.length === 0) {
    return { refinedSteps: [] };
  }

  const contextParts = [
    `EVIDENCE SUMMARY:\n${evidenceSummary}`,
    triggerEvidence ? `TRIGGER CONTENT:\n${triggerEvidence}` : "",
    communicationContext ? `COMMUNICATION CONTEXT:\n${communicationContext.slice(0, 4000)}` : "",
  ].filter(Boolean).join("\n\n---\n\n");

  const stepsText = stepsToRefine.map(s => {
    const uncertaintyLines = (s.uncertainties ?? []).map((u, ui) =>
      `  ${ui}. [${u.impact}] ${u.field}: ${u.assumption}`
    ).join("\n");
    const paramsPreview = s.params ? JSON.stringify(s.params, null, 2).slice(0, 1000) : "none";
    return `STEP ${s.index}: "${s.title}"
  Mode: ${s.executionMode}
  Current params: ${paramsPreview}
  Uncertainties:
${uncertaintyLines}`;
  }).join("\n\n");

  const response = await callLLM({
    operatorId,
    instructions: `You are reviewing uncertainties that were flagged during action plan reasoning. For each uncertainty, focus specifically on that aspect and try to resolve it from the evidence.

For each uncertainty, do ONE of:

1. **RESOLVE** — You found sufficient evidence to determine the correct answer. Provide the corrected param value. The action plan will be updated with your correction.
2. **REMOVE** — On focused review, the original assumption is well-supported by the evidence. The uncertainty was overcautious. No changes needed.
3. **KEEP** — The evidence genuinely doesn't resolve this. It stays as a human-reviewable annotation.

Be rigorous:
- An email address appearing once in one email IS a genuine uncertainty
- An email address appearing in 5+ emails across the context should be REMOVED
- A deadline from a single forwarded message with no contract backup IS uncertain
- A deadline confirmed in a formal document AND referenced in follow-ups should be RESOLVED — use the confirmed value
- A person's role inferred from email signatures IS less certain than one from an org chart

Respond with ONLY valid JSON:
{
  "refinedSteps": [
    {
      "stepIndex": 0,
      "paramUpdates": { "body": "Updated email body with corrected deadline..." },
      "descriptionUpdate": null,
      "remainingUncertainties": [
        { "field": "cc", "assumption": "Not sure if accounting should be CC'd — only one email thread suggests it", "impact": "medium" }
      ]
    }
  ]
}

paramUpdates: fields to merge/overwrite in the step's params (only changed fields), or null if no changes.
descriptionUpdate: updated step description if the resolution changes what the step does, or null.
remainingUncertainties: uncertainties that could NOT be resolved. Empty array if all resolved or removed.`,
    messages: [{ role: "user", content: `${contextParts}\n\n---\n\nSTEPS WITH UNCERTAINTIES:\n${stepsText}` }],
    temperature: 0.1,
    maxTokens: 3000,
    aiFunction: "reasoning",
    model: REFINEMENT_MODEL,
  });

  try {
    const parsed = extractJSON(response.text);
    if (!parsed) {
      console.warn("[uncertainty-refiner] Failed to parse refinement result");
      return {
        refinedSteps: stepsToRefine.map(s => ({
          stepIndex: s.index,
          remainingUncertainties: s.uncertainties ?? [],
        })),
      };
    }

    const result = typeof parsed === "string" ? JSON.parse(parsed) : parsed;
    return result as RefinementResult;
  } catch (err) {
    console.error("[uncertainty-refiner] Parse error:", err);
    return {
      refinedSteps: stepsToRefine.map(s => ({
        stepIndex: s.index,
        remainingUncertainties: s.uncertainties ?? [],
      })),
    };
  }
}
