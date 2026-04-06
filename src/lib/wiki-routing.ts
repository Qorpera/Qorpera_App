/**
 * Wiki routing map — learned semantic routing layer for the wiki index.
 *
 * Uses context evaluation telemetry to build a map of which wiki pages
 * are most useful for which situation types. Falls back to LLM heuristic
 * when telemetry is sparse (<10 resolved situations).
 */

import { prisma } from "@/lib/db";
import { getPageEffectivenessPerType } from "@/lib/context-evaluation";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSON } from "@/lib/json-helpers";

export interface RoutingEntry {
  situationPattern: string;
  recommendedPages: Array<{
    slug: string;
    title: string;
    pageType: string;
    relevanceReason: string;
    effectivenessScore: number;
  }>;
  avoidPages: string[];
}

export interface WikiRoutingMap {
  entries: RoutingEntry[];
  generatedAt: Date;
  basedOnEvaluations: number;
}

/**
 * Generate or refresh the wiki routing map.
 * Uses context evaluation telemetry to learn which pages help for which situations.
 * Falls back to LLM-based heuristic when telemetry is sparse.
 */
export async function generateRoutingMap(operatorId: string): Promise<WikiRoutingMap> {
  // 1. Get per-type page effectiveness from shared telemetry module
  const { typePageMap, evalCount } = await getPageEffectivenessPerType(operatorId);

  // 2. If we have enough telemetry (10+ resolved situations), build data-driven map
  if (evalCount >= 10) {
    const entries: RoutingEntry[] = [];

    for (const [typeName, pageMap] of typePageMap) {
      const pageScores = [...pageMap.entries()]
        .map(([slug, stats]) => ({
          slug,
          citationRate: stats.total > 0 ? stats.cited / stats.total : 0,
          approvalRate: stats.cited > 0 ? stats.approved / stats.cited : 0,
          score: stats.cited > 0 ? (stats.approved - stats.rejected) / stats.cited : 0,
          total: stats.total,
        }))
        .filter(p => p.total >= 2);

      const recommended = pageScores
        .filter(p => p.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      const avoid = pageScores
        .filter(p => p.score < 0 && p.total >= 3)
        .map(p => p.slug);

      if (recommended.length > 0) {
        const pageLookup = await prisma.knowledgePage.findMany({
          where: { operatorId, slug: { in: recommended.map(r => r.slug) } },
          select: { slug: true, title: true, pageType: true },
        });
        const titleMap = new Map(pageLookup.map(p => [p.slug, p]));

        entries.push({
          situationPattern: typeName,
          recommendedPages: recommended.map(r => ({
            slug: r.slug,
            title: titleMap.get(r.slug)?.title ?? r.slug,
            pageType: titleMap.get(r.slug)?.pageType ?? "unknown",
            relevanceReason: `Cited in ${Math.round(r.citationRate * 100)}% of cases, ${Math.round(r.approvalRate * 100)}% approval when cited`,
            effectivenessScore: r.score,
          })),
          avoidPages: avoid,
        });
      }
    }

    return { entries, generatedAt: new Date(), basedOnEvaluations: evalCount };
  }

  // 3. Sparse telemetry fallback — use LLM to generate heuristic routing
  const allPages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      status: { not: "quarantined" },
      pageType: { notIn: ["index", "log", "contradiction_log"] },
    },
    select: { slug: true, title: true, pageType: true },
  });

  const situationTypes = await prisma.situationType.findMany({
    where: { operatorId },
    select: { name: true, description: true },
  });

  if (allPages.length === 0 || situationTypes.length === 0) {
    return { entries: [], generatedAt: new Date(), basedOnEvaluations: 0 };
  }

  const model = getModel("wikiAnswerIntegration");
  const response = await callLLM({
    operatorId,
    instructions: `Given these wiki pages and situation types, suggest which pages are most relevant for each situation type. Respond with JSON: { "entries": [{ "situationPattern": "type name", "recommendedSlugs": ["slug1", "slug2"], "reasoning": "why" }] }`,
    messages: [{
      role: "user",
      content: `Pages:\n${allPages.map(p => `- ${p.slug}: ${p.title} (${p.pageType})`).join("\n")}\n\nSituation types:\n${situationTypes.map(t => `- ${t.name}: ${t.description}`).join("\n")}`,
    }],
    model,
    maxTokens: 4000,
  });

  const parsed = extractJSON(response.text);
  const rawEntries = Array.isArray(parsed?.entries) ? parsed.entries as Array<Record<string, unknown>> : [];
  const heuristicEntries: RoutingEntry[] = rawEntries.map((e) => ({
    situationPattern: e.situationPattern as string,
    recommendedPages: ((e.recommendedSlugs as string[]) ?? []).map((slug: string) => {
      const page = allPages.find(p => p.slug === slug);
      return {
        slug,
        title: page?.title ?? slug,
        pageType: page?.pageType ?? "unknown",
        relevanceReason: (e.reasoning as string) ?? "heuristic",
        effectivenessScore: 0,
      };
    }),
    avoidPages: [],
  }));

  return { entries: heuristicEntries, generatedAt: new Date(), basedOnEvaluations: 0 };
}
