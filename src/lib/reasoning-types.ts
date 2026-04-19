import { z } from "zod";
import { IdeaDashboardSchema } from "@/lib/idea-dashboard-types";

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
  actionSteps: z.array(ActionStepSchema).nullable().optional()
    .describe("Structured execution steps. The system uses this to write the Action Plan section on the wiki page. Each step must have executionMode, and action steps must have actionCapabilityName matching an available action exactly."),

});

export type WikiReasoningOutput = z.infer<typeof WikiReasoningOutputSchema>;

// ── Idea Reasoning Output ──────────────────────────────────────────────

/**
 * The idea reasoning engine writes the idea page directly.
 * The code handles status transitions, locking, and notifications.
 * The LLM decides valuable/dismissed and writes the complete enriched article.
 */
const IdeaPrimaryDeliverableSchema = z.object({
  type: z.enum(["wiki_update", "wiki_create", "document", "settings_change"]),
  targetPageSlug: z.string().optional().describe("For wiki_update: the existing page slug to modify. For wiki_create: the proposed new slug."),
  targetPageType: z.string().optional().describe("For wiki_create or wiki_update: the pageType (e.g., 'process', 'person_profile', 'domain_hub')."),
  title: z.string().describe("Short title for this deliverable"),
  description: z.string().describe("Concrete description of what the change is — not vague advice. For wiki_update: what sections change. For wiki_create: what the new page contains. For document: what document gets produced."),
  rationale: z.string().describe("Why this specific change addresses the idea"),

  // Populated by Phase 2 content generation pass (not Phase 1 LLM output).
  proposedContent: z.string().optional().describe("The actual content the user will review and approve. For wiki_update/wiki_create: the complete new page content following the target template. For document: the document body. For settings_change: a human-readable description of what will change. Populated by the Phase 2 generation pass; absent on dismissed ideas."),
  proposedProperties: z.record(z.unknown()).nullable().optional().describe("Property changes on the target page (for wiki_update/wiki_create) or config delta (for settings_change). Null or absent when no property changes are needed."),
});

const IdeaDownstreamEffectSchema = z.object({
  targetPageSlug: z.string().describe("The existing wiki page slug that may need to change"),
  targetPageType: z.string().describe("The pageType of the target page"),
  changeType: z.enum(["update", "create", "review"]).describe("update = existing page content changes; create = new page needs to be created; review = no write needed but someone should re-read"),
  summary: z.string().describe("One sentence: what changes on this page and why, given the primary deliverable"),
});

export const IdeaReasoningOutputSchema = z.object({
  // Quality gate
  isValuable: z.boolean().describe("Does deeper investigation confirm this idea is worth doing? False if redundant, too speculative, out of scope, already handled, or low expected impact."),
  dismissalReason: z.string().optional().describe("If isValuable is false, a 1-2 sentence explanation shown to the user in the 'all' filter. Required when isValuable=false."),

  // Enriched page content — the LLM writes the whole article
  pageContent: z.string().min(50).describe("Complete idea article body following the idea template. Starts with '## Trigger'. Must include Investigation, Proposal, Primary Deliverable, Downstream Effects, Impact Assessment, Alternatives Considered, and Timeline sections. For dismissed ideas, Investigation explains why dismissed and other sections may be brief or absent."),

  // Possibly refined title
  ideaTitle: z.string().optional().describe("Refined title if the original scanner title was vague or inaccurate. Leave blank to keep original."),

  // Updated properties
  properties: z.object({
    status: z.enum(["dismissed", "proposed"]).describe("Terminal status of reasoning: dismissed (not valuable) or proposed (awaiting user decision)"),
    proposal_type: z.enum(["wiki_update", "process_creation", "strategy_revision", "system_job_creation", "project_creation", "general"]).optional().describe("May refine the detection-time proposal_type if investigation reveals a different category"),
    severity: z.enum(["low", "medium", "high", "critical"]).optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    expected_impact: z.enum(["low", "medium", "high", "transformative"]).optional(),
    effort_estimate: z.enum(["trivial", "small", "medium", "large", "major"]).optional(),
  }),

  // Primary deliverable specification — null for dismissed ideas
  primaryDeliverable: IdeaPrimaryDeliverableSchema.nullable().describe("The single main change this idea proposes. Null when isValuable=false."),

  dashboard: IdeaDashboardSchema.nullable().describe("Structured dashboard payload rendered on the idea Overview tab. Null when isValuable=false. When isValuable=true, produce either { cards: [...] } with 2–4 cards, or { cards: [], fallback: 'prose_only' } when no quantifiable content is available. Aim for 2–4 cards that directly visualize the claim being made."),

  // Downstream effects — bullet-level only (Phase 4 investigates each in depth)
  downstreamEffects: z.array(IdeaDownstreamEffectSchema).optional().describe("Other pages that may need to change if the primary deliverable is implemented. Bullet-level identification only — Phase 4 will investigate each. Empty array is valid if no downstream effects."),

  // Cross-page knowledge updates discovered during investigation (same as situation reasoning)
  wikiUpdates: z.array(WikiUpdateSchema).optional().describe("Factual updates to other wiki pages discovered during investigation (e.g., a person's role has changed). Separate from primary deliverable / downstream effects."),
});

export type IdeaReasoningOutput = z.infer<typeof IdeaReasoningOutputSchema>;
export type IdeaPrimaryDeliverable = z.infer<typeof IdeaPrimaryDeliverableSchema>;
export type IdeaDownstreamEffect = z.infer<typeof IdeaDownstreamEffectSchema>;
