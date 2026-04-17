import { z } from "zod";

// ── Shared enums ────────────────────────────────────────────────────────────

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const FlagSchema = z.enum(["neutral", "good", "warn", "bad"]);
export type Flag = z.infer<typeof FlagSchema>;

export const SpanSchema = z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(12)]);
export type Span = z.infer<typeof SpanSchema>;

// A single quantified number with optional uncertainty range
export const QuantifiedValueSchema = z.object({
  typicalValue: z.number().describe("The representative numeric value."),
  range: z.object({
    low: z.number(),
    high: z.number(),
  }).optional().describe("Optional uncertainty range. When present, low <= typicalValue <= high should generally hold."),
  unit: z.string().describe("Unit string, e.g. 'hrs/mo', '%', '€', 'clients'. Keep it short — renders inline next to the number."),
});
export type QuantifiedValue = z.infer<typeof QuantifiedValueSchema>;

// A single evidence citation backing a claim
export const EvidenceRefSchema = z.object({
  ref: z.string().nullable().describe("Wiki page slug backing this evidence item, e.g. 'scope-creep-analysis'. Null for inferred items that have no grounding source."),
  inferred: z.boolean().describe("True when this item is a model inference without a grounding wiki page. When true, ref is typically null."),
  summary: z.string().describe("One-line summary of what this evidence says or what was inferred. Rendered on hover/expand."),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

// ── Base card fields (shared by all primitive cards) ────────────────────────

const BaseCardFields = {
  span: SpanSchema,
  claim: z.string().min(5).describe("Sentence-form title of the card. Example: '60–80% fewer unbudgeted hours per engagement'. Must state the claim, not a label. Not a question, not a heading like 'Impact Analysis'."),
  explanation: z.string().min(10).describe("1–2 sentences explaining the claim in plain language. Rendered below the visual."),
  confidence: ConfidenceSchema,
  evidence: z.array(EvidenceRefSchema).min(0).max(6).describe("Evidence items backing the card's quantified claims. Can be empty for fully qualitative cards but prefer at least one."),
};

// ── Primitive 1: impact_bar ─────────────────────────────────────────────────

export const ImpactBarDataSchema = z.object({
  baseline: QuantifiedValueSchema.describe("The current state — what the metric is today."),
  projected: QuantifiedValueSchema.describe("The proposed or projected state after the initiative is implemented."),
  savings: z.object({
    typicalValue: z.number(),
    range: z.object({ low: z.number(), high: z.number() }).optional(),
    unit: z.string(),
    label: z.string().describe("One-line context for the savings figure, e.g. 'recovered capacity across 3 engagements'."),
  }).optional().describe("Optional prominent savings/delta figure. Omit when baseline/projected tells the story directly."),
});

export const ImpactBarCardSchema = z.object({
  primitive: z.literal("impact_bar"),
  ...BaseCardFields,
  data: ImpactBarDataSchema,
});

// ── Primitive 2: entity_set ─────────────────────────────────────────────────

export const EntitySetDataSchema = z.object({
  entities: z.array(z.object({
    name: z.string().describe("Display name of the entity, e.g. 'Hansen-Meier Industri' or 'Sofie Nielsen · Delivery'."),
    slug: z.string().optional().describe("Wiki page slug for this entity if it has one. Enables click-through."),
    flag: FlagSchema.describe("Semantic state of this entity. 'bad' = problem entity, 'warn' = attention needed, 'good' = positive, 'neutral' = neither. Used for dot color."),
    metric: z.string().optional().describe("Optional short metric displayed on the right, e.g. '+82 hrs' or '12%' or 'CEO'. Keep under 12 chars."),
    metricFlag: FlagSchema.optional().describe("Optional flag controlling the color of the metric text. When omitted, metric renders in neutral."),
    subtitle: z.string().optional().describe("Optional second line under the name. Rarely used — the name should be self-sufficient."),
  })).min(1).max(10),
  subtitle: z.string().optional().describe("Optional caption under the card title, e.g. 'from past 90 days' or 'current receivers'."),
});

export const EntitySetCardSchema = z.object({
  primitive: z.literal("entity_set"),
  ...BaseCardFields,
  data: EntitySetDataSchema,
});

// ── Primitive 3: process_flow ───────────────────────────────────────────────

export const ProcessFlowDataSchema = z.object({
  steps: z.array(z.object({
    label: z.string().describe("Short name for the step, 1–3 words. Example: 'Internal review'."),
    checkpoint: z.boolean().optional().describe("When true, renders as a highlighted checkpoint (warn-tinted)."),
    note: z.string().optional().describe("Optional small caption under the label, e.g. 'Signature' or 'Approval'."),
  })).min(2).max(10),
});

export const ProcessFlowCardSchema = z.object({
  primitive: z.literal("process_flow"),
  ...BaseCardFields,
  data: ProcessFlowDataSchema,
});

// ── Primitive 4: automation_loop ────────────────────────────────────────────

export const AutomationLoopNodeIconSchema = z.enum([
  "trigger", "fetch", "compose", "notify", "execute", "verify",
]);

export const AutomationLoopDataSchema = z.object({
  nodes: z.array(z.object({
    icon: AutomationLoopNodeIconSchema,
    title: z.string().describe("Node label, e.g. 'TRIGGER' or 'FETCH'. Renders uppercase."),
    sub: z.string().describe("Multi-line subtitle with specifics, e.g. '1st of month\\n09:00 CET'. Newlines are preserved."),
  })).min(2).max(6),
  annotation: z.string().optional().describe("Optional callout below the diagram, typically used for trust-gradient notes or conditions."),
});

export const AutomationLoopCardSchema = z.object({
  primitive: z.literal("automation_loop"),
  ...BaseCardFields,
  data: AutomationLoopDataSchema,
});

// ── Primitive 5: conceptual_diagram (with internal variant discriminator) ───

// v1 ships with a single variant: tier_pyramid.
// Future variants (matrix_2x2, cluster, flow) extend this union.
export const TierPyramidDataSchema = z.object({
  variant: z.literal("tier_pyramid"),
  tiers: z.array(z.object({
    label: z.string().describe("Tier name, e.g. 'Strategic', 'Standard', 'Foundation'."),
    count: z.number().int().nonnegative().describe("Number of entities in this tier."),
    threshold: z.string().describe("Human-readable threshold rule, e.g. '≥35% margin' or '<20%'."),
    flag: FlagSchema.describe("Semantic color for this tier: 'good' = top/healthy, 'neutral' = middle, 'bad' = attention tier."),
  })).min(2).max(5).describe("Ordered top-to-bottom. First entry renders smallest, last renders widest."),
});

export const ConceptualDiagramDataSchema = z.discriminatedUnion("variant", [
  TierPyramidDataSchema,
  // Future variants added here. Each must have a unique 'variant' literal.
]);

export const ConceptualDiagramCardSchema = z.object({
  primitive: z.literal("conceptual_diagram"),
  ...BaseCardFields,
  data: ConceptualDiagramDataSchema,
});

// ── Primitive 6: trend_or_distribution (with internal kind discriminator) ───

export const SparklineDataSchema = z.object({
  kind: z.literal("sparkline"),
  headlineValue: z.number().describe("The big number displayed above the sparkline."),
  headlineUnit: z.string().describe("Unit for the headline, e.g. 'hrs' or '%'."),
  deltaLabel: z.string().optional().describe("Short caption next to the headline, e.g. '↑ from 20' or 'cumulative'."),
  points: z.array(z.number()).min(2).max(52).describe("Data points in chronological order. Min 2 (start + end), typical 6–13 (monthly / weekly)."),
  xAxisStart: z.string().describe("Label for the leftmost point, e.g. 'Apr 2025' or 'Discovery'."),
  xAxisEnd: z.string().describe("Label for the rightmost point, e.g. 'Apr 2026' or 'Q3 (projected)'."),
  flag: z.enum(["warn", "neutral"]).optional().describe("Optional semantic color for the line. Warn when the trend is the problem being surfaced."),
});

export const DonutDataSchema = z.object({
  kind: z.literal("donut"),
  segments: z.array(z.object({
    label: z.string().describe("Legend label for this segment."),
    value: z.number().nonnegative().describe("Numeric value. Rendered as-is; all segments together form the total."),
    flag: z.enum(["primary", "secondary", "tertiary"]).describe("Visual prominence: 'primary' is the focal segment (what the initiative addresses), 'secondary' and 'tertiary' fade into gray."),
  })).min(2).max(8),
});

export const TrendOrDistributionDataSchema = z.discriminatedUnion("kind", [
  SparklineDataSchema,
  DonutDataSchema,
]);

export const TrendOrDistributionCardSchema = z.object({
  primitive: z.literal("trend_or_distribution"),
  ...BaseCardFields,
  data: TrendOrDistributionDataSchema,
});

// ── Top-level dashboard schema ──────────────────────────────────────────────

export const DashboardCardSchema = z.discriminatedUnion("primitive", [
  ImpactBarCardSchema,
  EntitySetCardSchema,
  ProcessFlowCardSchema,
  AutomationLoopCardSchema,
  ConceptualDiagramCardSchema,
  TrendOrDistributionCardSchema,
]);
export type DashboardCard = z.infer<typeof DashboardCardSchema>;

export const InitiativeDashboardSchema = z.object({
  cards: z.array(DashboardCardSchema).min(0).max(6).describe("Ordered dashboard cards. Zero cards is valid when combined with fallback='prose_only'. Max 6 to enforce restraint."),
  fallback: z.enum(["prose_only"]).optional().describe("Set to 'prose_only' when the engine judges no quantified or structural content is available to visualize. When set, cards should be empty."),
});
export type InitiativeDashboard = z.infer<typeof InitiativeDashboardSchema>;

// Refinements applied post-schema. Keep as a separate export so callers can
// choose whether to validate coherence strictly or accept a lenient structural match.
export const InitiativeDashboardSchemaStrict = InitiativeDashboardSchema.refine(
  (d) => !(d.fallback === "prose_only" && d.cards.length > 0),
  { message: "When fallback is 'prose_only', cards must be empty." },
).refine(
  (d) => d.fallback === "prose_only" || d.cards.length >= 2,
  { message: "When cards are present, require at least 2 cards (sessionspec: 2–4 typical)." },
);
