import { prisma } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────────────────────

export type PriorityBreakdown = {
  urgency: number;
  impact: number;
  dependencies: number;
  staleness: number;
};

type ScoredPlan = {
  score: number;
  breakdown: PriorityBreakdown;
};

// ExecutionPlan table dropped — priority scoring now reads from wiki pages.
// These functions are kept as stubs for callers that haven't been migrated.

export async function computePriorityScores(
  _operatorId: string,
): Promise<{ updated: number }> {
  return { updated: 0 };
}

export async function computeSinglePlanPriority(
  _planId: string,
): Promise<number> {
  return 0;
}

export async function computePlanPriorityWithBreakdown(
  _planId: string,
): Promise<ScoredPlan> {
  return {
    score: 0,
    breakdown: { urgency: 0, impact: 0, dependencies: 0, staleness: 0 },
  };
}
