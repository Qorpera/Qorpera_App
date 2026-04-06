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

export interface PageStats {
  cited: number;
  approved: number;
  rejected: number;
  total: number;
}

/**
 * Get page effectiveness grouped by situation type name.
 * Returns the per-type Map and total eval count for routing decisions.
 */
export async function getPageEffectivenessPerType(operatorId: string): Promise<{
  typePageMap: Map<string, Map<string, PageStats>>;
  evalCount: number;
}> {
  const evals = await prisma.contextEvaluation.findMany({
    where: { operatorId, outcome: { not: null } },
    select: {
      contextSections: true,
      citedSections: true,
      outcome: true,
      situation: {
        select: { situationType: { select: { name: true } } },
      },
    },
  });

  const typePageMap = new Map<string, Map<string, PageStats>>();

  for (const eval_ of evals) {
    const typeName = eval_.situation?.situationType?.name ?? "unknown";
    if (!typePageMap.has(typeName)) typePageMap.set(typeName, new Map());
    const pageMap = typePageMap.get(typeName)!;

    const sections = eval_.contextSections as Array<{ type: string; id: string }>;
    const cited = eval_.citedSections as Array<{ type: string; id: string; citationCount: number }>;
    const citedIds = new Set(cited.filter(c => c.type === "wiki_page").map(c => c.id));

    for (const section of sections) {
      if (section.type !== "wiki_page") continue;
      const stats = pageMap.get(section.id) ?? { cited: 0, approved: 0, rejected: 0, total: 0 };
      stats.total++;
      if (citedIds.has(section.id)) {
        stats.cited++;
        if (eval_.outcome === "approved") stats.approved++;
        if (eval_.outcome === "rejected") stats.rejected++;
      }
      pageMap.set(section.id, stats);
    }
  }

  return { typePageMap, evalCount: evals.length };
}
