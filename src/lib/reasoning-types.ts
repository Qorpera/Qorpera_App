import { z } from "zod";

const ActionStepSchema = z.object({
  title: z.string(),
  description: z.string(),
  executionMode: z.enum(["action", "generate", "human_task"]),
  actionCapabilityName: z.string().optional(),  // matches ActionCapability.name
  assignedUserId: z.string().optional(),
  params: z.record(z.any()).optional(),
});

export const ReasoningOutputSchema = z.object({
  analysis: z.string().min(10),
  evidenceSummary: z.string().min(10),
  consideredActions: z.array(z.object({
    action: z.string(),
    evidenceFor: z.array(z.string()),
    evidenceAgainst: z.array(z.string()),
    expectedOutcome: z.string(),
  })),
  actionPlan: z.array(ActionStepSchema).nullable(),  // null = no action, array = ordered steps (can be length 1)
  confidence: z.number().min(0).max(1),
  missingContext: z.array(z.string()).nullable(),
  escalation: z.object({
    rationale: z.string(),
    suggestedSteps: z.array(ActionStepSchema),
  }).nullable().optional(),  // null/absent = no escalation
});

export type ReasoningOutput = z.infer<typeof ReasoningOutputSchema>;
export type ActionStep = z.infer<typeof ActionStepSchema>;
