import { z } from "zod";

// ── Shared sub-schemas ──────────────────────────────────────────────────────

const ActionStepSchema = z.object({
  title: z.string().describe("Imperative verb + object, max 8 words. Example: 'Send payment reminder to Peter Skovgaard'"),
  description: z.string().describe("2-3 sentences: what to do and why. Not a recap of the analysis."),
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

const MonitoringCriteriaSchema = z.object({
  waitingFor: z.string(),
  expectedWithinDays: z.number(),
  followUpAction: z.string(),
});

const EscalationSchema = z.object({
  rationale: z.string(),
  suggestedSteps: z.array(ActionStepSchema),
});

const WikiUpdateSchema = z.object({
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
});

const AnalysisDocumentSchema = z.object({
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
});

// ── Legacy Reasoning Output ─────────────────────────────────────────────────

/** Normalize actionPlan → actionBatch for backward compat with old stored reasoning */
function normalizeActionBatch<T extends { actionBatch?: unknown; actionPlan?: unknown }>(data: T) {
  return {
    ...data,
    actionBatch: data.actionBatch ?? data.actionPlan ?? null,
  };
}

const ReasoningOutputBase = z.object({
  situationTitle: z.string().describe("Short, specific title identifying this situation. Use document numbers, project names, or specific subjects — not just person names. Examples: 'Invoice INV-2026-035 overdue', 'Nygade Center power outage — urgent dispatch', 'Emil cable type question (NOIKLX vs NYM)'").optional(),
  analysis: z.string().min(10).describe("1-2 sentences MAX. State the core finding and required action. No background or hedging."),
  evidenceSummary: z.string().min(10).describe("Numbered list of specific facts found during investigation. Each fact is one short sentence."),
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
  actionBatch: z.array(ActionStepSchema).nullable().optional(),
  actionPlan: z.array(ActionStepSchema).nullable().optional(), // backward compat — old reasoning stored this key
  afterBatch: z.enum(["resolve", "re_evaluate", "monitor"]).default("resolve"),
  reEvaluationReason: z.string().optional(),
  monitorDurationHours: z.number().optional(),
  confidence: z.number().min(0).max(1),
  missingContext: z.array(z.string()).nullable(),
  webSources: z.array(z.string()).optional(),  // URLs from web search results consulted during reasoning
  escalation: EscalationSchema.nullable().optional(),  // null/absent = no escalation
  resolutionType: z.enum(["self_resolving", "response_dependent", "informational"]).optional(),
  monitoringCriteria: MonitoringCriteriaSchema.nullable().optional(),
  relatedWorkStreamId: z.string().nullable().optional(),  // link situation to existing workstream
  wikiUpdates: z.array(WikiUpdateSchema).optional(),
  depthUpgrade: z.boolean().optional(), // request upgrade from standard → thorough
});

export const ReasoningOutputSchema = ReasoningOutputBase.transform(normalizeActionBatch);

export const DeepReasoningOutputSchema = ReasoningOutputBase.extend({
  analysisDocument: AnalysisDocumentSchema.optional().nullable(),
}).transform(normalizeActionBatch);

export type ReasoningOutput = z.infer<typeof ReasoningOutputSchema>;
export type DeepReasoningOutput = z.infer<typeof DeepReasoningOutputSchema>;
export type ActionStep = z.infer<typeof ActionStepSchema>;

// ── Wiki-First Reasoning Output ──────────────────────────────────────────────

/**
 * The reasoning engine writes the situation page directly.
 * The code prepends the title and property table; the LLM writes the article body.
 * executionSteps is a temporary sidecar for ExecutionPlan creation (removed in Session 3).
 */
export const WikiReasoningOutputSchema = z.object({
  pageContent: z.string().min(50).describe("Complete article body following the situation_instance template. Starts with ## Trigger. Includes all relevant sections."),

  properties: z.object({
    status: z.enum(["detected", "reasoning", "proposed", "approved", "executing", "monitoring", "resolved", "rejected"]),
    severity: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    situation_type: z.string(),
    detected_at: z.string(),
    source: z.enum(["detected", "manual", "retrospective"]),
    trigger_ref: z.string().optional(),
    assigned_to: z.string().optional().describe("Page slug of the person responsible"),
    domain: z.string().optional().describe("Page slug of the department"),
    resolved_at: z.string().optional(),
    current_step: z.number().optional(),
    autonomy_level: z.enum(["supervised", "notify", "autonomous"]).optional(),
    cycle_number: z.number().optional(),
    outcome: z.enum(["positive", "negative", "neutral"]).optional(),
  }),

  situationTitle: z.string().optional().describe("Short, specific title. Use document numbers, project names, subjects — not just person names."),
  afterBatch: z.enum(["resolve", "re_evaluate", "monitor"]).default("resolve"),
  reEvaluationReason: z.string().optional(),
  monitorDurationHours: z.number().optional(),
  escalation: EscalationSchema.nullable().optional(),
  resolutionType: z.enum(["self_resolving", "response_dependent", "informational"]).optional(),
  monitoringCriteria: MonitoringCriteriaSchema.nullable().optional(),
  wikiUpdates: z.array(WikiUpdateSchema).optional(),
  depthUpgrade: z.boolean().optional(),
  analysisDocument: AnalysisDocumentSchema.optional().nullable(),
});

export type WikiReasoningOutput = z.infer<typeof WikiReasoningOutputSchema>;
