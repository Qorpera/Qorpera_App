/**
 * Context evaluation telemetry — tracks which wiki pages and evidence claims
 * actually help reasoning, enabling feedback loops for semantic retrieval,
 * trust levels, and auto-rollback.
 */

import { prisma } from "@/lib/db";

/**
 * Get effectiveness scores for wiki pages based on citation rates and outcomes.
 * Pages that are cited frequently AND lead to approved outcomes score highest.
 */
export async function getPageEffectiveness(operatorId: string): Promise<Array<{
  slug: string;
  timesInContext: number;
  timesCited: number;
  citationRate: number;
  approvedWhenCited: number;
  rejectedWhenCited: number;
  effectivenessScore: number;
}>> {
  const evals = await prisma.contextEvaluation.findMany({
    where: { operatorId, outcome: { not: null } },
    select: { contextSections: true, citedSections: true, outcome: true },
  });

  const pageStats = new Map<string, {
    timesInContext: number;
    timesCited: number;
    approvedWhenCited: number;
    rejectedWhenCited: number;
  }>();

  for (const eval_ of evals) {
    const sections = eval_.contextSections as Array<{ type: string; id: string }>;
    const cited = eval_.citedSections as Array<{ type: string; id: string; citationCount: number }>;
    const citedIds = new Set(cited.filter(c => c.type === "wiki_page").map(c => c.id));

    for (const section of sections) {
      if (section.type !== "wiki_page") continue;
      const stats = pageStats.get(section.id) ?? { timesInContext: 0, timesCited: 0, approvedWhenCited: 0, rejectedWhenCited: 0 };
      stats.timesInContext++;
      if (citedIds.has(section.id)) {
        stats.timesCited++;
        if (eval_.outcome === "approved") stats.approvedWhenCited++;
        if (eval_.outcome === "rejected") stats.rejectedWhenCited++;
      }
      pageStats.set(section.id, stats);
    }
  }

  return [...pageStats.entries()]
    .map(([slug, stats]) => ({
      slug,
      ...stats,
      citationRate: stats.timesInContext > 0 ? stats.timesCited / stats.timesInContext : 0,
      effectivenessScore: stats.timesCited > 0
        ? (stats.approvedWhenCited - stats.rejectedWhenCited) / stats.timesCited
        : 0,
    }))
    .sort((a, b) => b.effectivenessScore - a.effectivenessScore);
}
