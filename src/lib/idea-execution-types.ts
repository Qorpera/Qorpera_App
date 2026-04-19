import { z } from "zod";
import type { IdeaPrimaryDeliverable, IdeaDownstreamEffect } from "@/lib/reasoning-types";

export type ChangeApplyStatus = "pending" | "generating" | "generated" | "applying" | "applied" | "failed";

export interface PrimaryExecState {
  status: ChangeApplyStatus;
  error: string | null;
  appliedSlug: string | null;       // captured at apply time (document slugs are generated)
}

export interface DownstreamExecState {
  changeId: string;                 // `downstream-${idx}`
  effect: IdeaDownstreamEffect; // copy of the reasoning-engine spec
  status: ChangeApplyStatus;
  proposedContent: string | null;
  proposedProperties: Record<string, unknown> | null;
  concerns: ExecConcern[];
  model: string | null;
  costCents: number;
  error: string | null;
  appliedSlug: string | null;       // captured at apply time
}

export interface ExecConcern {
  source: "llm" | "programmatic";
  targetChangeId: string | null;    // null = cross-change
  description: string;
  severity: "warning" | "blocking";
  recommendation: string;
}

export interface ExecutionState {
  startedAt: string;
  totalCostCents: number;
  primary: PrimaryExecState;
  downstream: DownstreamExecState[];
  crossConcerns: ExecConcern[];     // programmatic/cross-change concerns
  completedAt: string | null;
}

/** LLM output schema for a downstream investigation */
export interface DownstreamLLMOutput {
  proposedContent: string;
  proposedProperties: Record<string, unknown> | null;
  concerns: Array<{
    description: string;
    severity: "warning" | "blocking";
    recommendation: string;
  }>;
}

export type { IdeaPrimaryDeliverable, IdeaDownstreamEffect };

// ── Runtime validation schema for resume ────────────────────────────────────

const ExecConcernSchema = z.object({
  source: z.enum(["llm", "programmatic"]),
  targetChangeId: z.string().nullable(),
  description: z.string(),
  severity: z.enum(["warning", "blocking"]),
  recommendation: z.string(),
});

const ChangeApplyStatusSchema = z.enum([
  "pending", "generating", "generated", "applying", "applied", "failed",
]);

const IdeaDownstreamEffectSchema = z.object({
  targetPageSlug: z.string(),
  targetPageType: z.string(),
  changeType: z.enum(["update", "create", "review"]),
  summary: z.string(),
});

const DownstreamExecStateSchema = z.object({
  changeId: z.string(),
  effect: IdeaDownstreamEffectSchema,
  status: ChangeApplyStatusSchema,
  proposedContent: z.string().nullable(),
  proposedProperties: z.record(z.unknown()).nullable(),
  concerns: z.array(ExecConcernSchema),
  model: z.string().nullable(),
  costCents: z.number(),
  error: z.string().nullable(),
  appliedSlug: z.string().nullable().default(null),
});

const PrimaryExecStateSchema = z.object({
  status: ChangeApplyStatusSchema,
  error: z.string().nullable(),
  appliedSlug: z.string().nullable().default(null),
});

export const ExecutionStateSchema = z.object({
  startedAt: z.string(),
  totalCostCents: z.number(),
  primary: PrimaryExecStateSchema,
  downstream: z.array(DownstreamExecStateSchema),
  crossConcerns: z.array(ExecConcernSchema),
  completedAt: z.string().nullable(),
});

export const ExecutionSummarySchema = z.object({
  completedAt: z.string().nullable(),
  totalCostCents: z.number(),
  pagesModified: z.array(z.string()),
  skippedDownstream: z.array(z.string()),
  failedDownstream: z.array(z.string()),
});

export type ExecutionSummary = z.infer<typeof ExecutionSummarySchema>;
