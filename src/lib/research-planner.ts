import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { getExtractionStats } from "@/lib/evidence-registry";
import { extractJSON } from "@/lib/json-helpers";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Investigation {
  id: string; // Generated: "inv-001", "inv-002", etc.
  title: string; // "Invoicing Process and Pricing Consistency"
  hypothesis: string; // "There may be inconsistent pricing across quotes"
  strategicImportance: 1 | 2 | 3; // 1 = critical, 3 = useful
  investigationBudget: number; // Tool call budget (20-80)
  angle: string; // "financial", "operational", "relational", "strategic"
  evidenceToCheck: string[]; // Keywords/references to start from
  questionsToAnswer: string[]; // What this investigation should resolve
  expectedPageTypes: string[]; // Wiki page types this should produce
  dependencies: string[]; // Other investigation IDs that should complete first
}

export interface ResearchPlan {
  investigations: Investigation[];
  priorityOrder: string[]; // Investigation IDs in execution order
  estimatedDurationMinutes: number;
  estimatedCostCents: number;
  planningReasoning: string; // The planner's explanation of why these investigations
}

// ── Planner prompt ─────────────────────────────────────────────────────────────

const RESEARCH_PLANNER_PROMPT = `You are the research director for an organizational intelligence system. Your job is to determine what investigations would most improve understanding of this company.

You have:
1. An evidence registry summary — what claims, relationships, and contradictions were extracted from all data sources
2. An entity graph — departments, people, entity types
3. An inventory of connected data systems

Your task: produce a research plan — a ranked list of investigation hypotheses that will be executed by independent AI agents with access to all the company's data.

## Investigation Types to Consider

1. **Process investigations** — How does [X] work end-to-end? (invoicing, client onboarding, project delivery, hiring). Look for evidence of processes in email threads, documents, and repeated patterns.
2. **Relationship investigations** — What is the health/depth of relationships with key clients, vendors, or partners? Look for communication frequency, financial patterns, and commitment tracking.
3. **Financial investigations** — Revenue patterns, cost structures, pricing consistency, risk concentrations. Look for contradictions between quoted prices, invoice amounts, and contractual terms.
4. **Organizational investigations** — How do departments interact? Where are silos? Who are key-person dependencies? Look for cross-department communication patterns and decision bottlenecks.
5. **Strategic investigations** — What goals is the company pursuing? What strategic risks exist? Look for forward-looking statements, plans, and unresolved strategic questions.
6. **Contradiction investigations** — The evidence registry found conflicting claims. What's the truth? Prioritize contradictions that affect financial or operational understanding.
7. **Temporal investigations** — How has [X] changed over time? Is the trajectory positive or negative? Look for trends in communication volume, financial patterns, or relationship health.
8. **Gap investigations** — We have zero evidence about [X] but it's important for this type of company. What indirect signals might exist?

## Rules

- Generate 15-30 investigations ranked by strategic importance
- Each investigation must have a clear hypothesis — not just "learn about X" but "there may be a problem with X because we see Y"
- Assign tool call budgets proportional to complexity: simple fact-checking = 20, process tracing = 40, complex financial analysis = 60-80
- Group into priority tiers: Tier 1 runs first (5-8 investigations), Tier 2 runs after Tier 1 findings are available (8-12), Tier 3 fills gaps (5-10)
- Mark dependencies when one investigation needs another's findings
- Every investigation should produce at least one wiki page
- ALWAYS include contradiction investigations if contradictions exist
- Prefer investigations that combine multiple data sources over single-source investigations

Respond ONLY with JSON matching this schema:
{
  "investigations": [
    {
      "id": "inv-001",
      "title": "string",
      "hypothesis": "string",
      "strategicImportance": 1|2|3,
      "investigationBudget": 20-80,
      "angle": "financial|operational|relational|strategic|contradiction|temporal|gap",
      "evidenceToCheck": ["keyword or topic to start from"],
      "questionsToAnswer": ["specific question"],
      "expectedPageTypes": ["entity_profile", "process_description", "financial_pattern", etc.],
      "dependencies": ["inv-xxx"]
    }
  ],
  "priorityOrder": ["inv-001", "inv-002", ...],
  "estimatedDurationMinutes": number,
  "estimatedCostCents": number,
  "planningReasoning": "explanation of strategy"
}`;

// ── Planner ────────────────────────────────────────────────────────────────────

export async function generateResearchPlan(
  operatorId: string,
  options?: {
    onProgress?: (msg: string) => Promise<void>;
  },
): Promise<ResearchPlan> {
  const progress = options?.onProgress ?? (async () => {});

  await progress("Building research planning context...");

  // 1. Evidence registry summary
  const stats = await getExtractionStats(operatorId);

  // Get top entity mentions from extractions
  const entityMentions = await prisma.$queryRaw<Array<{ entity: string; count: number }>>`
    SELECT entity, COUNT(*)::int as count FROM (
      SELECT jsonb_array_elements_text(
        jsonb_path_query_array(extractions::jsonb, '$[*].entities[*]')
      ) as entity
      FROM "EvidenceExtraction"
      WHERE "operatorId" = ${operatorId}
    ) sub
    GROUP BY entity
    ORDER BY count DESC
    LIMIT 30
  `;

  // Get contradiction summary
  const contradictionExtractions = await prisma.$queryRaw<
    Array<{ contradictions: unknown }>
  >`
    SELECT contradictions FROM "EvidenceExtraction"
    WHERE "operatorId" = ${operatorId}
    AND jsonb_array_length(contradictions::jsonb) > 0
    LIMIT 20
  `;
  const allContradictions = contradictionExtractions.flatMap((e) =>
    (
      Array.isArray(e.contradictions) ? e.contradictions : []
    ) as Array<{ claim: string; counterclaim: string }>,
  );

  // 2. Entity graph summary
  const departments = await prisma.entity.findMany({
    where: {
      operatorId,
      category: "foundational",
      entityType: { slug: "domain" },
      status: "active",
    },
    select: { displayName: true, id: true },
  });

  const entityTypes = await prisma.entityType.findMany({
    where: { operatorId },
    select: { slug: true, name: true, _count: { select: { entities: true } } },
  });

  const peopleCount = await prisma.entity.count({
    where: { operatorId, category: "base", status: "active" },
  });

  const externalCount = await prisma.entity.count({
    where: { operatorId, category: "external", status: "active" },
  });

  // 3. Connected systems
  const connectors = await prisma.sourceConnector.findMany({
    where: { operatorId, status: "active" },
    select: { provider: true, name: true },
  });

  // 4. Build the planning context
  const planningContext = `## Evidence Registry Summary

Total extractions: ${stats.totalExtractions}
Total claims: ${stats.totalClaims}
Total contradictions: ${stats.totalContradictions}
Source types: ${Object.entries(stats.bySourceType).map(([t, c]) => `${t}: ${c}`).join(", ")}

### Most-mentioned entities:
${entityMentions.map((e) => `- ${e.entity}: ${e.count} mentions`).join("\n")}

### Detected contradictions (${allContradictions.length} total):
${allContradictions.slice(0, 10).map((c) => `- CLAIM: "${c.claim}" vs COUNTERCLAIM: "${c.counterclaim}"`).join("\n")}
${allContradictions.length > 10 ? `... and ${allContradictions.length - 10} more` : ""}

## Entity Graph
Departments: ${departments.map((d) => d.displayName).join(", ") || "None identified"}
Entity types: ${entityTypes.map((t) => `${t.name} (${t._count.entities})`).join(", ")}
People (base entities): ${peopleCount}, External entities: ${externalCount}

## Connected Systems
${connectors.map((c) => `- ${c.provider}${c.name ? ` (${c.name})` : ""}`).join("\n") || "No active connectors"}

## Company Context
${departments.length === 0 ? "Small operation — may be a solo practitioner or small team. Focus on client relationships, engagement patterns, and financial health rather than internal organizational structure." : ""}`;

  await progress(
    `Planning investigations based on ${stats.totalClaims} claims and ${entityMentions.length} entities...`,
  );

  // 5. Call Opus for the research plan
  const model = getModel("researchPlanner");
  const response = await callLLM({
    operatorId,
    instructions: RESEARCH_PLANNER_PROMPT,
    messages: [{ role: "user", content: planningContext }],
    model,
    maxTokens: 65_536, // Anthropic API requires 65,536 when extended thinking is enabled
    thinking: true,
    thinkingBudget: 10_000,
  });

  const parsed = extractJSON(response.text);
  if (
    !parsed ||
    !Array.isArray((parsed as Record<string, unknown>).investigations)
  ) {
    throw new Error(
      `Research planner produced invalid output: ${response.text.slice(0, 200)}`,
    );
  }

  const raw = parsed as Record<string, unknown>;

  // 6. Validate and normalize
  const plan: ResearchPlan = {
    investigations: (raw.investigations as any[]).map(
      (inv: any, i: number) => ({
        id: inv.id || `inv-${String(i + 1).padStart(3, "0")}`,
        title: inv.title ?? "Untitled",
        hypothesis: inv.hypothesis ?? "",
        strategicImportance: [1, 2, 3].includes(inv.strategicImportance)
          ? inv.strategicImportance
          : 2,
        investigationBudget: Math.min(
          Math.max(inv.investigationBudget ?? 40, 10),
          80,
        ),
        angle: inv.angle ?? "operational",
        evidenceToCheck: Array.isArray(inv.evidenceToCheck)
          ? inv.evidenceToCheck
          : [],
        questionsToAnswer: Array.isArray(inv.questionsToAnswer)
          ? inv.questionsToAnswer
          : [],
        expectedPageTypes: Array.isArray(inv.expectedPageTypes)
          ? inv.expectedPageTypes
          : [],
        dependencies: Array.isArray(inv.dependencies) ? inv.dependencies : [],
      }),
    ),
    priorityOrder: Array.isArray(raw.priorityOrder)
      ? (raw.priorityOrder as string[])
      : [],
    estimatedDurationMinutes:
      (raw.estimatedDurationMinutes as number) ?? 30,
    estimatedCostCents: (raw.estimatedCostCents as number) ?? 2000,
    planningReasoning: (raw.planningReasoning as string) ?? "",
  };

  // Ensure all investigation IDs appear in priority order
  const idsInPlan = new Set(plan.investigations.map((i) => i.id));
  const idsInOrder = new Set(plan.priorityOrder);
  for (const id of idsInPlan) {
    if (!idsInOrder.has(id)) plan.priorityOrder.push(id);
  }

  await progress(
    `Research plan: ${plan.investigations.length} investigations across ${new Set(plan.investigations.map((i) => i.angle)).size} angles`,
  );

  return plan;
}
