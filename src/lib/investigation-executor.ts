/**
 * Investigation executor — runs research plan investigations as parallel agentic loops.
 *
 * Each investigation is an independent agentic loop using runAgenticLoop(),
 * producing wiki pages from evidence-based findings.
 */

import { z } from "zod";
import { prisma } from "@/lib/db";
import { runAgenticLoop } from "@/lib/agentic-loop";
import type { ModelRoute } from "@/lib/ai-provider";

// ── Types ──────────────────────────────────────────────────────────────────────

/** Matches the Investigation interface stored as JSON in ResearchPlan.investigations */
interface Investigation {
  id: string;
  title: string;
  hypothesis: string;
  strategicImportance: 1 | 2 | 3;
  investigationBudget: number;
  angle: string;
  evidenceToCheck: string[];
  questionsToAnswer: string[];
  expectedPageTypes: string[];
  dependencies: string[];
}

export interface InvestigationResult {
  investigationId: string;
  title: string;
  status: "completed" | "failed";
  findings: Array<{
    claim: string;
    confidence: number;
    evidenceChain: Array<{ sourceChunkId: string; excerpt: string; role: string }>;
    implications: string;
  }>;
  contradictionsResolved: Array<{ original: string; resolution: string; evidence: string }>;
  contradictionsUnresolved: Array<{ description: string; possibleExplanations: string[]; dataNeeded: string }>;
  remainingQuestions: string[];
  wikiPages: Array<{ slug: string; pageType: string; title: string }>;
  toolCallCount: number;
  costCents: number;
  durationMs: number;
  error?: string;
}

export interface ExecutionReport {
  planId: string;
  investigationsTotal: number;
  investigationsCompleted: number;
  investigationsFailed: number;
  totalWikiPages: number;
  totalCostCents: number;
  totalDurationMs: number;
  results: InvestigationResult[];
}

// ── Zod output schema ──────────────────────────────────────────────────────────

const InvestigationOutputSchema = z.object({
  findings: z.array(z.object({
    claim: z.string(),
    confidence: z.number(),
    evidenceChain: z.array(z.object({
      sourceChunkId: z.string(),
      excerpt: z.string(),
      role: z.string(),
    })),
    implications: z.string(),
  })),
  contradictionsResolved: z.array(z.object({
    original: z.string(),
    resolution: z.string(),
    evidence: z.string(),
  })).optional().default([]),
  contradictionsUnresolved: z.array(z.object({
    description: z.string(),
    possibleExplanations: z.array(z.string()),
    dataNeeded: z.string(),
  })).optional().default([]),
  remainingQuestions: z.array(z.string()).optional().default([]),
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
    })).optional().default([]),
    reasoning: z.string().optional(),
  })).optional().default([]),
});

type InvestigationOutput = z.infer<typeof InvestigationOutputSchema>;

// ── System prompt builder ──────────────────────────────────────────────────────

function buildInvestigationSystemPrompt(
  investigation: Investigation,
  sharedFindings: string[],
  operatorContext: string,
  connectorToolNames: Set<string>,
): string {
  return `You are an organizational intelligence investigator. You have full access to a company's data through search and retrieval tools.

## Your Investigation

**Title:** ${investigation.title}
**Hypothesis:** ${investigation.hypothesis}
**Angle:** ${investigation.angle}
**Questions to Answer:**
${investigation.questionsToAnswer.map((q, i) => `${i + 1}. ${q}`).join("\n")}

**Starting Evidence Keywords:**
${investigation.evidenceToCheck.join(", ")}

## Company Context
${operatorContext}

${sharedFindings.length > 0 ? `## Findings from Prior Investigations
The following wiki pages were created by earlier investigations. Read them with read_wiki_page if relevant — don't re-investigate what's already established.
${sharedFindings.map(s => `- ${s}`).join("\n")}` : ""}

## Investigation Rules

1. **Every finding MUST have a complete evidence chain** — specific source chunk IDs, specific text excerpts. No finding without evidence.
2. **Follow contradictions to resolution.** If two sources disagree, find a third source or note it as unresolved with possible explanations.
3. **Trace commitments to outcomes.** If someone promised X, check if X happened.
4. **Look for patterns across time.** Single data points are weak. Repeated patterns are findings.
5. **When you've exhausted your evidence, stop.** Don't speculate beyond what the data shows.
6. **Your findings will be independently challenged by another model.** Make sure your evidence chains are airtight.
7. **Produce wiki pages** for knowledge worth preserving. Each page should be a standalone document with clear structure, source citations using [src:chunkId] format, and confidence indicators.

## Available Tools

Use these tools to investigate:
- **search_evidence** — search structured evidence claims (most precise)
- **get_evidence_for_entity** — all evidence about a specific person/company/project
- **get_contradictions** — find conflicting claims
- **read_full_content** — read complete source documents
- **search_communications** — semantic search over emails/messages
- **search_documents** — semantic search over documents
- **lookup_entity** — find entity details
- **search_entities** — find entities by name/type
- **search_around** — graph traversal from an entity
- **get_activity_timeline** — activity history for an entity
- **search_wiki** — search existing wiki pages
- **read_wiki_page** — read a specific wiki page
${connectorToolNames.size > 0 ? `- Live connector tools: ${[...connectorToolNames].join(", ")}` : ""}

## Output Format

Respond with JSON:
{
  "findings": [
    {
      "claim": "specific finding",
      "confidence": 0.0-1.0,
      "evidenceChain": [
        { "sourceChunkId": "chunk-id", "excerpt": "relevant text", "role": "primary evidence|corroboration|context" }
      ],
      "implications": "why this matters"
    }
  ],
  "contradictionsResolved": [...],
  "contradictionsUnresolved": [...],
  "remainingQuestions": [...],
  "wikiUpdates": [
    {
      "slug": "page-slug",
      "pageType": "entity_profile|process_description|financial_pattern|communication_pattern|topic_synthesis",
      "title": "Page Title",
      "updateType": "create|update",
      "content": "Full markdown content with [src:chunkId] citations",
      "sourceCitations": [{ "sourceType": "chunk", "sourceId": "chunk-id", "claim": "what this source proves" }],
      "reasoning": "why this page was created/updated"
    }
  ]
}`;
}

// ── Model route selection ──────────────────────────────────────────────────────

function getModelRouteForAngle(angle: string): ModelRoute {
  switch (angle) {
    case "financial":
    case "strategic":
    case "contradiction":
      return "investigationDeep";
    default:
      return "investigationStandard";
  }
}

// ── Single investigation runner ────────────────────────────────────────────────

async function runSingleInvestigation(
  operatorId: string,
  investigation: Investigation,
  sharedFindings: string[],
  operatorContext: string,
): Promise<InvestigationResult> {
  const startTime = Date.now();

  try {
    const { REASONING_TOOLS, executeReasoningTool } = await import("@/lib/reasoning-tools");
    const { getConnectorReadTools, executeConnectorReadTool } = await import("@/lib/connector-read-tools");

    const { tools: connectorTools, availableToolNames: connectorToolNames } =
      await getConnectorReadTools(operatorId);

    const allTools = [...REASONING_TOOLS, ...connectorTools];

    const dispatchTool = async (toolName: string, args: Record<string, unknown>): Promise<string> => {
      if (connectorToolNames.has(toolName)) {
        return executeConnectorReadTool(operatorId, toolName, args);
      }
      return executeReasoningTool(operatorId, toolName, args);
    };

    const modelRoute = getModelRouteForAngle(investigation.angle);

    const systemPrompt = buildInvestigationSystemPrompt(
      investigation,
      sharedFindings,
      operatorContext,
      connectorToolNames,
    );

    const seedContext = `Begin your investigation of: "${investigation.title}"

Hypothesis: ${investigation.hypothesis}

Start by searching the evidence registry for: ${investigation.evidenceToCheck.join(", ")}

Then expand your investigation to answer all questions listed in your instructions.`;

    const result = await runAgenticLoop<InvestigationOutput>({
      operatorId,
      contextId: `investigation-${investigation.id}`,
      contextType: "investigation",
      cycleNumber: 0,
      systemPrompt,
      seedContext,
      tools: allTools,
      dispatchTool,
      outputSchema: InvestigationOutputSchema as z.ZodSchema<InvestigationOutput>,
      softBudget: Math.floor(investigation.investigationBudget * 0.7),
      hardBudget: investigation.investigationBudget,
      modelRoute,
    });

    const output = result.output;

    // Process wiki updates
    const createdPages: Array<{ slug: string; pageType: string; title: string }> = [];
    if (output.wikiUpdates && output.wikiUpdates.length > 0) {
      const { processWikiUpdates } = await import("@/lib/wiki-engine");
      await processWikiUpdates({
        operatorId,
        updates: output.wikiUpdates.map(u => ({
          slug: u.slug,
          pageType: u.pageType,
          title: u.title,
          subjectEntityId: u.subjectEntityId,
          updateType: u.updateType,
          content: u.content,
          sourceCitations: u.sourceCitations ?? [],
          reasoning: u.reasoning ?? "",
        })),
        synthesisPath: "investigation",
        synthesizedByModel: result.modelId,
      });
      createdPages.push(...output.wikiUpdates.map(u => ({
        slug: u.slug, pageType: u.pageType, title: u.title,
      })));
    }

    return {
      investigationId: investigation.id,
      title: investigation.title,
      status: "completed",
      findings: output.findings,
      contradictionsResolved: output.contradictionsResolved ?? [],
      contradictionsUnresolved: output.contradictionsUnresolved ?? [],
      remainingQuestions: output.remainingQuestions ?? [],
      wikiPages: createdPages,
      toolCallCount: result.toolCallCount,
      costCents: result.apiCostCents,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    console.error(`[investigation] ${investigation.id} "${investigation.title}" failed:`, err);
    return {
      investigationId: investigation.id,
      title: investigation.title,
      status: "failed",
      findings: [],
      contradictionsResolved: [],
      contradictionsUnresolved: [],
      remainingQuestions: [],
      wikiPages: [],
      toolCallCount: 0,
      costCents: 0,
      durationMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Tier-based orchestrator ────────────────────────────────────────────────────

export async function executeResearchPlan(
  operatorId: string,
  planId: string,
  options?: {
    concurrency?: number;
    onProgress?: (msg: string) => Promise<void>;
  },
): Promise<ExecutionReport> {
  const concurrency = options?.concurrency ?? 5;
  const progress = options?.onProgress ?? (async () => {});

  // Load plan — verify it belongs to this operator before proceeding
  const plan = await prisma.researchPlan.findFirstOrThrow({
    where: { id: planId, operatorId },
    select: { investigations: true, priorityOrder: true },
  });

  await prisma.researchPlan.update({
    where: { id: planId },
    data: { status: "executing" },
  });

  const investigations = plan.investigations as unknown as Investigation[];
  const priorityOrder = plan.priorityOrder as unknown as string[];

  // Load operator context
  const operator = await prisma.operator.findUniqueOrThrow({
    where: { id: operatorId },
    select: { companyName: true, industry: true },
  });
  const operatorContext = `Company: ${operator.companyName ?? "Unknown"}, Industry: ${operator.industry ?? "Unknown"}`;

  // Group by priority tier (strategicImportance: 1=critical, 2=important, 3=useful)
  const tiers = new Map<number, Investigation[]>();
  for (const inv of investigations) {
    const tier = inv.strategicImportance;
    if (!tiers.has(tier)) tiers.set(tier, []);
    tiers.get(tier)!.push(inv);
  }

  // Sort tiers: 1 (critical) first
  const sortedTiers = [...tiers.entries()].sort((a, b) => a[0] - b[0]);

  const report: ExecutionReport = {
    planId,
    investigationsTotal: investigations.length,
    investigationsCompleted: 0,
    investigationsFailed: 0,
    totalWikiPages: 0,
    totalCostCents: 0,
    totalDurationMs: 0,
    results: [],
  };

  const startTime = Date.now();
  const completedPageSlugs: string[] = [];

  for (const [tier, tierInvestigations] of sortedTiers) {
    await progress(`Starting Tier ${tier}: ${tierInvestigations.length} investigations (${concurrency} concurrent)`);

    // Sort by priority order within tier
    const orderedInvestigations = tierInvestigations.sort((a, b) => {
      const aIndex = priorityOrder.indexOf(a.id);
      const bIndex = priorityOrder.indexOf(b.id);
      return aIndex - bIndex;
    });

    // Split into ready (deps met) and waiting (deps unmet)
    const completed = new Set(report.results.filter(r => r.status === "completed").map(r => r.investigationId));
    const ready: Investigation[] = [];
    const waiting: Investigation[] = [];
    for (const inv of orderedInvestigations) {
      const unmetDeps = inv.dependencies.filter(d => !completed.has(d));
      if (unmetDeps.length === 0) {
        ready.push(inv);
      } else {
        waiting.push(inv);
      }
    }

    // Run a batch with bounded concurrency using a slot-based approach
    const runBatch = async (batch: Investigation[]) => {
      const executing = new Set<Promise<void>>();
      for (const inv of batch) {
        const p = runSingleInvestigation(operatorId, inv, [...completedPageSlugs], operatorContext)
          .then(async (result) => {
            report.results.push(result);
            report.totalCostCents += result.costCents;
            report.totalWikiPages += result.wikiPages.length;
            if (result.status === "completed") {
              report.investigationsCompleted++;
              completedPageSlugs.push(...result.wikiPages.map(wp => wp.slug));
            } else {
              report.investigationsFailed++;
            }
            const progressMsg =
              `[${report.investigationsCompleted + report.investigationsFailed}/${report.investigationsTotal}] ` +
              `${result.status === "completed" ? "✓" : "✗"} ${result.title} — ` +
              `${result.wikiPages.length} pages, $${(result.costCents / 100).toFixed(2)}`;
            await progress(progressMsg);

            // Persist progress for UI polling
            await prisma.researchPlan.update({
              where: { id: planId },
              data: {
                completedCount: report.investigationsCompleted,
                failedCount: report.investigationsFailed,
                totalWikiPages: report.totalWikiPages,
                progressMessage: progressMsg,
              },
            });
          })
          .finally(() => { executing.delete(p); });
        executing.add(p);
        if (executing.size >= concurrency) {
          await Promise.race(executing);
        }
      }
      await Promise.all(executing);
    };

    await runBatch(ready);

    // Run dependent investigations after ready batch completes
    if (waiting.length > 0) {
      await progress(`Running ${waiting.length} dependent investigations...`);
      await runBatch(waiting);
    }
  }

  report.totalDurationMs = Date.now() - startTime;

  // Update plan status
  await prisma.researchPlan.update({
    where: { id: planId },
    data: {
      status: report.investigationsFailed === report.investigationsTotal ? "failed" : "completed",
      actualCostCents: report.totalCostCents,
    },
  });

  await progress(
    `Research complete: ${report.investigationsCompleted}/${report.investigationsTotal} investigations, ` +
    `${report.totalWikiPages} wiki pages, $${(report.totalCostCents / 100).toFixed(2)} ` +
    `in ${Math.round(report.totalDurationMs / 60000)}min`,
  );

  // ── Post-investigation: adversarial challenge + gap analysis ──
  // Runs AFTER all investigations complete (sequential, not parallel with them).
  // Non-fatal — investigation pages remain valid even if this fails.
  if (report.investigationsCompleted > 0) {
    try {
      const { runAdversarialChallenge } = await import("@/lib/adversarial-challenge");
      const adversarialReport = await runAdversarialChallenge(operatorId, {
        onProgress: progress,
      });

      const { runGapAnalysis } = await import("@/lib/gap-analysis");
      const gapReport = await runGapAnalysis(operatorId, adversarialReport, {
        onProgress: progress,
      });

      await prisma.researchPlan.update({
        where: { id: planId },
        data: {
          adversarialReport: adversarialReport as any,
          gapAnalysisReport: gapReport as any,
          questionsForHuman: gapReport.questionsForHuman as any,
          coverageScore: gapReport.coverageScore,
        },
      });
    } catch (err) {
      console.error("[research] Adversarial/gap analysis failed:", err);
    }
  }

  return report;
}
