import { z } from "zod";

export const ReasoningOutputSchema = z.object({
  analysis: z.string().min(10),
  evidenceSummary: z.string().min(10),
  consideredActions: z.array(z.object({
    action: z.string(),
    evidenceFor: z.array(z.string()),
    evidenceAgainst: z.array(z.string()),
    expectedOutcome: z.string(),
  })),
  chosenAction: z.object({
    action: z.string(),
    connector: z.string(),
    params: z.record(z.any()),
    justification: z.string().min(10),
  }).nullable(),
  confidence: z.number().min(0).max(1),
  missingContext: z.array(z.string()).nullable(),
});

export type ReasoningOutput = z.infer<typeof ReasoningOutputSchema>;
