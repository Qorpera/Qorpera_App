import { z } from "zod";

const ActionStepSchema = z.object({
  title: z.string(),
  description: z.string(),
  previewType: z.enum(["email", "document", "spreadsheet", "calendar_event", "slack_message", "crm_update", "ticket", "presentation", "generic"]).optional(),
  executionMode: z.enum(["action", "generate", "human_task", "await_situation"]),
  actionCapabilityName: z.string().optional(),  // matches ActionCapability.name
  assignedUserId: z.string().optional(),
  params: z.record(z.any()).optional(),
  uncertainties: z.array(z.object({
    field: z.string(),
    assumption: z.string(),
    impact: z.enum(["high", "medium", "low"]),
  })).optional(),
});

export const ReasoningOutputSchema = z.object({
  situationTitle: z.string().describe("Short, specific title identifying this situation. Use document numbers, project names, or specific subjects — not just person names. Examples: 'Invoice INV-2026-035 overdue', 'Nygade Center power outage — urgent dispatch', 'Emil cable type question (NOIKLX vs NYM)'").optional(),
  analysis: z.string().min(10),
  evidenceSummary: z.string().min(10),
  consideredActions: z.array(z.object({
    action: z.string(),
    evidenceFor: z.array(z.string()),
    evidenceAgainst: z.array(z.string()),
    expectedOutcome: z.string(),
  })),
  situationOwner: z.object({
    entityName: z.string(),
    entityRole: z.string().optional(),
    reasoning: z.string(),
  }).nullable().optional(),
  actionBatch: z.array(ActionStepSchema).nullable(),
  afterBatch: z.enum(["resolve", "re_evaluate", "monitor"]).default("resolve"),
  reEvaluationReason: z.string().optional(),
  monitorDurationHours: z.number().optional(),
  confidence: z.number().min(0).max(1),
  missingContext: z.array(z.string()).nullable(),
  webSources: z.array(z.string()).optional(),  // URLs from web search results consulted during reasoning
  escalation: z.object({
    rationale: z.string(),
    suggestedSteps: z.array(ActionStepSchema),
  }).nullable().optional(),  // null/absent = no escalation
  resolutionType: z.enum(["self_resolving", "response_dependent", "informational"]).optional(),
  monitoringCriteria: z.object({
    waitingFor: z.string(),
    expectedWithinDays: z.number(),
    followUpAction: z.string(),
  }).nullable().optional(),
  relatedWorkStreamId: z.string().nullable().optional(),  // link situation to existing workstream
  wikiUpdates: z.array(z.object({
    slug: z.string(),
    pageType: z.string(),
    title: z.string(),
    subjectEntityId: z.string().optional(),
    updateType: z.enum(["create", "update", "flag_contradiction"]),
    content: z.string(),
    sourceCitations: z.array(z.object({
      sourceType: z.enum(["chunk", "signal", "entity"]),
      sourceId: z.string(),
      claim: z.string(),
    })),
    reasoning: z.string(),
  })).optional(),
  depthUpgrade: z.boolean().optional(), // request upgrade from standard → thorough
});

export const DeepReasoningOutputSchema = ReasoningOutputSchema.extend({
  analysisDocument: z.object({
    sections: z.array(z.object({
      type: z.enum(["heading", "paragraph", "finding", "risk", "data_table", "recommendation", "gap"]),
      level: z.number().optional(),
      title: z.string().optional(),
      text: z.string(),
      severity: z.enum(["high", "medium", "low"]).optional(),
      confidence: z.number().optional(),
      sources: z.array(z.string()).optional(),
    })),
    overallConfidence: z.number(),
    investigationSummary: z.string(),
  }).optional().nullable(),
});

export type ReasoningOutput = z.infer<typeof ReasoningOutputSchema>;
export type DeepReasoningOutput = z.infer<typeof DeepReasoningOutputSchema>;
export type ActionStep = z.infer<typeof ActionStepSchema>;
