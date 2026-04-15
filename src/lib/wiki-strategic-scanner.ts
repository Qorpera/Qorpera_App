/**
 * Wiki Strategic Scanner — multi-agent investigation system.
 *
 * 1-3 Opus investigator agents enter the wiki through different hubs,
 * form hypotheses, navigate the graph, search raw content, and propose
 * initiatives backed by evidence trails.
 *
 * 1 Opus strategic data agent ignores all communication and analyses
 * non-communication business data (financial records, documents,
 * calendar patterns, CRM data) for initiatives the wiki missed.
 *
 * 1 Opus evaluator filters, deduplicates, and approves proposals.
 *
 * Activity-aware: 3+1 agents when idle (< 5 active items), 1+1 when busy.
 */

import { prisma } from "@/lib/db";
import { callLLM, getModel, getThinkingBudget, getMaxOutputTokens } from "@/lib/ai-provider";
import type { AITool, LLMMessage } from "@/lib/ai-provider";
import { extractJSONAny } from "@/lib/json-helpers";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WikiScanReport {
  initiativesCreated: number;
  situationsCreated: number;
  patternsDetected: number;
  duplicatesSkipped: number;
  activityLevel: number;
  scanDepth: "deep" | "light";
  costCents: number;
  errors: string[];
}

interface InitiativeProposal {
  title: string;
  description: string;
  patternType: string;
  severity: "low" | "medium" | "high";
  confidence: number;
  evidence: Array<{ pageSlug: string; claim: string }>;
  ownerPageSlug: string | null;
  domainPageSlug: string | null;
  proposedAction: string;
  agentIndex: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function mapPatternType(type: string): string {
  const map: Record<string, string> = {
    process_gap: "policy_change",
    documentation_debt: "wiki_update",
    relationship_risk: "strategy_revision",
    automation_candidate: "system_job_creation",
    strategic_opportunity: "strategy_revision",
    quick_win: "general",
    knowledge_gap: "wiki_update",
    team_optimization: "resource_recommendation",
    missing_monitoring: "system_job_creation",
  };
  return map[type] || "general";
}

// ── Stage 1: Hub Assignment ────────────────────────────────────────────────────

async function assignHubs(operatorId: string, agentCount: number): Promise<string[][]> {
  const hubs = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      pageType: { in: ["company_overview", "domain_hub"] },
      status: { in: ["draft", "verified"] },
      synthesisPath: { not: "findings_archived" },
    },
    select: { slug: true, pageType: true },
  });

  const overviewSlug = hubs.find(h => h.pageType === "company_overview")?.slug;
  const domainSlugs = hubs.filter(h => h.pageType === "domain_hub").map(h => h.slug);

  const shuffled = [...domainSlugs].sort(() => Math.random() - 0.5);

  const assignments: string[][] = [];
  for (let i = 0; i < agentCount; i++) {
    const agentHubs: string[] = [];
    if (overviewSlug) agentHubs.push(overviewSlug);
    const idx1 = (i * 2) % Math.max(shuffled.length, 1);
    const idx2 = (i * 2 + 1) % Math.max(shuffled.length, 1);
    if (shuffled[idx1]) agentHubs.push(shuffled[idx1]);
    if (shuffled[idx2] && shuffled[idx2] !== shuffled[idx1]) agentHubs.push(shuffled[idx2]);
    assignments.push(agentHubs);
  }

  return assignments;
}

// ── Stage 2: Investigator Agent ────────────────────────────────────────────────

const investigatorTools: AITool[] = [
  {
    name: "read_wiki_page",
    description: "Read a wiki page by slug. Use this to investigate hypotheses by reading person profiles, process docs, department overviews.",
    parameters: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
  },
  {
    name: "search_wiki",
    description: "Search wiki pages by keyword. Returns matching page slugs and previews.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "get_related_pages",
    description: "Get all pages cross-referenced from a wiki page. Use to explore connections from a person, department, or process.",
    parameters: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
  },
  {
    name: "search_raw_content",
    description: "Search the raw content archive (emails, documents, messages) for evidence. Use when the wiki doesn't have enough detail.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        source_type: { type: "string", description: "Optional: email, document, slack_message" },
      },
      required: ["query"],
    },
  },
  {
    name: "propose_initiative",
    description: "Submit an initiative proposal. Call this when you've found a genuine improvement opportunity with evidence.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Specific, actionable title" },
        description: { type: "string", description: "What the opportunity is and why it matters — 2-3 sentences" },
        pattern_type: { type: "string", description: "process_gap | documentation_debt | relationship_risk | automation_candidate | strategic_opportunity | quick_win | knowledge_gap | team_optimization | missing_monitoring" },
        severity: { type: "string", enum: ["low", "medium", "high"] },
        evidence: {
          type: "array",
          items: {
            type: "object",
            properties: {
              pageSlug: { type: "string" },
              claim: { type: "string" },
            },
            required: ["pageSlug", "claim"],
          },
        },
        owner_page_slug: { type: "string", description: "Person page slug who should own this, or empty" },
        domain_page_slug: { type: "string", description: "Domain hub slug this relates to, or empty" },
        proposed_action: { type: "string", description: "Concrete steps: what to do" },
      },
      required: ["title", "description", "pattern_type", "severity", "evidence", "proposed_action"],
    },
  },
];

async function dispatchInvestigatorTool(
  operatorId: string,
  name: string,
  args: Record<string, unknown>,
  proposals: InitiativeProposal[],
  agentIndex: number,
): Promise<string> {
  switch (name) {
    case "read_wiki_page": {
      const slug = args.slug as string;
      const page = await prisma.knowledgePage.findFirst({
        where: { operatorId, slug, scope: "operator", status: { in: ["draft", "verified"] } },
        select: { slug: true, title: true, pageType: true, content: true, crossReferences: true, confidence: true },
      });
      if (!page) return `Page [[${slug}]] not found.`;
      return `## ${page.title} [${page.pageType}] (confidence: ${page.confidence.toFixed(2)})\n\nCross-references: ${page.crossReferences.join(", ") || "none"}\n\n${page.content}`;
    }

    case "search_wiki": {
      const query = args.query as string;
      const pages = await prisma.knowledgePage.findMany({
        where: {
          operatorId,
          scope: "operator",
          status: { in: ["draft", "verified"] },
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { content: { contains: query, mode: "insensitive" } },
          ],
        },
        select: { slug: true, title: true, pageType: true },
        take: 10,
      });
      if (pages.length === 0) return `No wiki pages found for "${query}".`;
      return pages.map(p => `- [[${p.slug}]] ${p.title} (${p.pageType})`).join("\n");
    }

    case "get_related_pages": {
      const slug = args.slug as string;
      const page = await prisma.knowledgePage.findFirst({
        where: { operatorId, slug, scope: "operator" },
        select: { crossReferences: true },
      });
      if (!page || page.crossReferences.length === 0) return `No cross-references found for [[${slug}]].`;
      const related = await prisma.knowledgePage.findMany({
        where: { operatorId, slug: { in: page.crossReferences }, scope: "operator" },
        select: { slug: true, title: true, pageType: true },
      });
      return related.map(p => `- [[${p.slug}]] ${p.title} (${p.pageType})`).join("\n") || "No related pages found.";
    }

    case "search_raw_content": {
      const query = args.query as string;
      const sourceType = args.source_type as string | undefined;
      const where: Record<string, unknown> = {
        operatorId,
        rawBody: { contains: query, mode: "insensitive" },
      };
      if (sourceType) where.sourceType = sourceType;
      const items = await prisma.rawContent.findMany({
        where,
        select: { sourceType: true, sourceId: true, rawBody: true, rawMetadata: true },
        take: 5,
        orderBy: { occurredAt: "desc" },
      });
      if (items.length === 0) return `No raw content found for "${query}".`;
      return items.map(item => {
        const meta = typeof item.rawMetadata === "object" ? item.rawMetadata as Record<string, unknown> : {};
        const subject = meta.subject || meta.fileName || item.sourceId;
        return `[${item.sourceType}] ${subject}\n${(item.rawBody || "").slice(0, 500)}`;
      }).join("\n---\n");
    }

    case "propose_initiative": {
      proposals.push({
        title: args.title as string,
        description: args.description as string,
        patternType: args.pattern_type as string,
        severity: (args.severity as "low" | "medium" | "high") || "medium",
        confidence: 0.7,
        evidence: (args.evidence as Array<{ pageSlug: string; claim: string }>) || [],
        ownerPageSlug: (args.owner_page_slug as string) || null,
        domainPageSlug: (args.domain_page_slug as string) || null,
        proposedAction: args.proposed_action as string,
        agentIndex,
      });
      return `Initiative proposed: "${args.title}". ${proposals.length} total proposals so far. Continue investigating or stop if you've exhausted productive paths.`;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

async function runInvestigatorAgent(
  operatorId: string,
  hubSlugs: string[],
  agentIndex: number,
  existingInitiativeTitles: string[],
  agentCount: number,
): Promise<{ proposals: InitiativeProposal[]; costCents: number }> {
  const proposals: InitiativeProposal[] = [];
  let costCents = 0;

  const systemPrompt = `You are an organizational improvement investigator (#${agentIndex + 1} of ${agentCount}). Your job: navigate the company wiki, form hypotheses about gaps and opportunities, investigate them by following paths through the wiki, and propose specific initiatives.

## Your Starting Points

Enter the wiki through these hub pages:
${hubSlugs.map(s => `- [[${s}]]`).join("\n")}

Read these hubs first. Then form hypotheses and investigate.

## Investigation Method

1. READ a hub page — understand the domain, its team, processes, tools
2. FORM A HYPOTHESIS — "This department has 5 people but only 1 documented process — are there undocumented workflows?"
3. INVESTIGATE — follow cross-references to person pages, process pages, other domains. Search raw content for evidence the wiki missed.
4. DISCOVER — find the actual gap, risk, or opportunity. Ground it in specific evidence.
5. PROPOSE — call propose_initiative with a specific, actionable proposal backed by evidence.
6. REPEAT — form another hypothesis, investigate another angle.

## What to Look For

- Departments with people but few/no documented processes
- People who appear overloaded (referenced everywhere, many responsibilities)
- External relationships mentioned in emails but not documented in the wiki
- Recurring manual work that could be automated or systematized
- Cross-department handoffs that aren't captured as processes
- Knowledge living only in emails/documents that should be in the wiki
- Strategic opportunities visible from the company structure
- Quick wins: simple improvements someone could start today
- Missing situation types: operational risks that aren't being monitored
- Team gaps: responsibilities described in the wiki with no clear owner

## Existing Initiatives (do NOT duplicate)
${existingInitiativeTitles.length > 0 ? existingInitiativeTitles.map(t => `- ${t}`).join("\n") : "(none yet)"}

## Rules

- Every proposal MUST cite specific wiki pages or raw content as evidence
- No generic advice — "improve communication" is not an initiative
- Be specific — "Document the deployment process that Mark handles solo" IS an initiative
- Investigate at least 2-3 different angles from your assigned hubs before finishing
- When you've exhausted productive paths, stop. Don't force weak proposals.`;

  const messages: LLMMessage[] = [
    { role: "user", content: `Start investigating. Read your assigned hub pages: ${hubSlugs.map(s => `[[${s}]]`).join(", ")}` },
  ];

  const model = getModel("agenticReasoning");
  const thinkingBudget = getThinkingBudget("agenticReasoning") ?? 10_000;
  const maxTokens = getMaxOutputTokens(model);
  const MAX_ITERATIONS = 25;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await callLLM({
      instructions: systemPrompt,
      messages,
      tools: investigatorTools,
      model,
      operatorId,
      temperature: 0.3,
      thinking: true,
      thinkingBudget,
      maxTokens,
    });

    costCents += response.apiCostCents;

    if (!response.toolCalls?.length) break;

    messages.push({
      role: "assistant",
      content: response.text || "",
      tool_calls: response.toolCalls.map(tc => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    });

    for (const toolCall of response.toolCalls) {
      const result = await dispatchInvestigatorTool(operatorId, toolCall.name, toolCall.arguments, proposals, agentIndex);
      messages.push({
        role: "tool",
        content: result,
        tool_call_id: toolCall.id,
        name: toolCall.name,
      });
    }
  }

  return { proposals, costCents };
}

// ── Stage 2b: Strategic Data Agent ─────────────────────────────────────────────
// A dedicated agent that ignores all communication and focuses strictly on
// non-communication business data: financial records, documents, calendar
// patterns, CRM data.

const COMMUNICATION_SOURCE_TYPES = new Set([
  "email", "slack_message", "teams_message", "calendar_proactive",
]);

const strategicDataTools: AITool[] = [
  {
    name: "search_business_data",
    description: "Search non-communication raw content — documents, financial records, invoices, calendar events, CRM data. This EXCLUDES emails and chat messages. Use to find strategic patterns.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keyword to search for in business data" },
        source_type: { type: "string", description: "Optional filter: drive_doc, invoice, calendar_event, financial_record, file, document" },
      },
      required: ["query"],
    },
  },
  {
    name: "read_raw_item",
    description: "Read a specific raw content item by source ID.",
    parameters: {
      type: "object",
      properties: { source_id: { type: "string" } },
      required: ["source_id"],
    },
  },
  {
    name: "list_business_data_summary",
    description: "Get a summary of all non-communication content types and counts. Use this first to understand what business data is available.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "read_wiki_page",
    description: "Read a wiki page for organizational context. Use sparingly — your primary focus is raw business data, not the wiki.",
    parameters: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
  },
  {
    name: "propose_initiative",
    description: "Submit an initiative proposal grounded in business data evidence.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Specific, actionable title" },
        description: { type: "string", description: "What the opportunity is and why it matters" },
        pattern_type: { type: "string", description: "process_gap | documentation_debt | relationship_risk | automation_candidate | strategic_opportunity | quick_win | knowledge_gap | team_optimization | missing_monitoring" },
        severity: { type: "string", enum: ["low", "medium", "high"] },
        evidence: {
          type: "array",
          items: {
            type: "object",
            properties: {
              pageSlug: { type: "string", description: "Wiki page slug or 'raw:sourceId' for raw content citations" },
              claim: { type: "string" },
            },
            required: ["pageSlug", "claim"],
          },
        },
        owner_page_slug: { type: "string", description: "Person page slug who should own this, or empty" },
        domain_page_slug: { type: "string", description: "Domain hub slug this relates to, or empty" },
        proposed_action: { type: "string", description: "Concrete steps: what to do" },
      },
      required: ["title", "description", "pattern_type", "severity", "evidence", "proposed_action"],
    },
  },
];

async function dispatchStrategicDataTool(
  operatorId: string,
  name: string,
  args: Record<string, unknown>,
  proposals: InitiativeProposal[],
  agentIndex: number,
): Promise<string> {
  switch (name) {
    case "search_business_data": {
      const query = args.query as string;
      const sourceType = args.source_type as string | undefined;
      const where: Record<string, unknown> = {
        operatorId,
        rawBody: { contains: query, mode: "insensitive" },
        sourceType: sourceType
          ? sourceType
          : { notIn: [...COMMUNICATION_SOURCE_TYPES] },
      };
      const items = await prisma.rawContent.findMany({
        where,
        select: { sourceType: true, sourceId: true, rawBody: true, rawMetadata: true, occurredAt: true },
        take: 10,
        orderBy: { occurredAt: "desc" },
      });
      if (items.length === 0) return `No business data found for "${query}".`;
      return items.map(item => {
        const meta = typeof item.rawMetadata === "object" ? item.rawMetadata as Record<string, unknown> : {};
        const label = meta.subject || meta.fileName || meta.title || item.sourceId;
        const date = item.occurredAt?.toISOString().slice(0, 10) ?? "unknown";
        return `[${item.sourceType}] ${label} (${date})\n${(item.rawBody || "").slice(0, 600)}`;
      }).join("\n---\n");
    }

    case "read_raw_item": {
      const sourceId = args.source_id as string;
      const item = await prisma.rawContent.findFirst({
        where: { operatorId, sourceId },
        select: { sourceType: true, rawBody: true, rawMetadata: true, occurredAt: true },
      });
      if (!item) return `No content found with source ID "${sourceId}".`;
      const meta = typeof item.rawMetadata === "object" ? item.rawMetadata as Record<string, unknown> : {};
      return `[${item.sourceType}] ${meta.subject || meta.fileName || sourceId}\nDate: ${item.occurredAt?.toISOString() ?? "unknown"}\nMetadata: ${JSON.stringify(meta, null, 2).slice(0, 500)}\n\n${(item.rawBody || "").slice(0, 3000)}`;
    }

    case "list_business_data_summary": {
      const counts = await prisma.$queryRaw<Array<{ sourceType: string; count: bigint }>>`
        SELECT "sourceType", COUNT(*) as count
        FROM "RawContent"
        WHERE "operatorId" = ${operatorId}
          AND "sourceType" NOT IN ('email', 'slack_message', 'teams_message', 'calendar_proactive')
          AND "rawBody" IS NOT NULL
        GROUP BY "sourceType"
        ORDER BY count DESC
      `;
      if (counts.length === 0) return "No non-communication business data found.";
      const total = counts.reduce((sum, c) => sum + Number(c.count), 0);
      return `Business data summary (${total} total items):\n${counts.map(c => `- ${c.sourceType}: ${Number(c.count)} items`).join("\n")}\n\nUse search_business_data to explore specific types.`;
    }

    case "read_wiki_page": {
      const slug = args.slug as string;
      const page = await prisma.knowledgePage.findFirst({
        where: { operatorId, slug, scope: "operator", status: { in: ["draft", "verified"] } },
        select: { slug: true, title: true, pageType: true, content: true },
      });
      if (!page) return `Page [[${slug}]] not found.`;
      return `## ${page.title} [${page.pageType}]\n\n${(page.content || "").slice(0, 2000)}`;
    }

    case "propose_initiative": {
      proposals.push({
        title: args.title as string,
        description: args.description as string,
        patternType: args.pattern_type as string,
        severity: (args.severity as "low" | "medium" | "high") || "medium",
        confidence: 0.7,
        evidence: (args.evidence as Array<{ pageSlug: string; claim: string }>) || [],
        ownerPageSlug: (args.owner_page_slug as string) || null,
        domainPageSlug: (args.domain_page_slug as string) || null,
        proposedAction: args.proposed_action as string,
        agentIndex,
      });
      return `Initiative proposed: "${args.title}". Continue investigating or stop if done.`;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

async function runStrategicDataAgent(
  operatorId: string,
  existingInitiativeTitles: string[],
  agentCount: number,
): Promise<{ proposals: InitiativeProposal[]; costCents: number }> {
  const proposals: InitiativeProposal[] = [];
  let costCents = 0;

  // Check if there's any non-communication data at all
  const dataCount = await prisma.rawContent.count({
    where: {
      operatorId,
      sourceType: { notIn: [...COMMUNICATION_SOURCE_TYPES] },
      rawBody: { not: null },
    },
  });
  if (dataCount === 0) {
    console.log("[wiki-scanner] Strategic data agent: no non-communication data found, skipping");
    return { proposals, costCents: 0 };
  }

  const agentIndex = agentCount; // 4th agent gets the next index

  const systemPrompt = `You are a strategic business data analyst (#${agentIndex + 1} of ${agentCount + 1}). Unlike your peer investigators who analyze the company wiki, YOUR focus is the raw business data — financial records, documents, calendar patterns, CRM entries. You deliberately IGNORE all email and chat communication.

## Your Method

1. Start with list_business_data_summary to see what data types are available
2. Search across the available data for strategic patterns
3. Read the wiki sparingly — only for organizational context (who owns what, team structure)
4. Propose initiatives that are invisible from the wiki alone

## What to Look For

**Financial patterns:**
- Overdue invoices or aging receivables
- Recurring charges that seem unusually high or duplicated
- Revenue concentration risk (too much from one client)
- Budget variances or unexpected cost spikes
- Missing financial documentation (unsigned contracts, unrecorded expenses)

**Document gaps:**
- Policies that are outdated, incomplete, or missing entirely
- Contracts approaching renewal without review
- Compliance documentation that should exist but doesn't
- SOPs that exist only as tribal knowledge (referenced in titles but no content)

**Calendar & scheduling patterns:**
- Teams with excessive meeting load
- Recurring meetings with no documented outcomes
- Key people with availability conflicts or overcommitment
- Important deadlines visible in calendar but not tracked anywhere

**CRM & relationship health:**
- Deals stalled in pipeline for too long
- Contacts with no recent engagement
- Customer segments being neglected
- Upsell opportunities visible in usage/invoice data

## Existing Initiatives (do NOT duplicate)
${existingInitiativeTitles.length > 0 ? existingInitiativeTitles.map(t => `- ${t}`).join("\n") : "(none yet)"}

## Rules

- ONLY cite evidence from raw business data or wiki pages — never from emails/chat
- Use "raw:{sourceId}" in evidence pageSlug when citing raw content
- Be specific and quantitative when possible ("3 invoices overdue by 30+ days" not "some invoices are overdue")
- Focus on patterns the wiki-based investigators would miss
- When you've exhausted productive data paths, stop.`;

  const messages: LLMMessage[] = [
    { role: "user", content: "Start your analysis. Begin with list_business_data_summary to see what's available." },
  ];

  const model = getModel("agenticReasoning");
  const thinkingBudget = getThinkingBudget("agenticReasoning") ?? 10_000;
  const maxTokens = getMaxOutputTokens(model);
  const MAX_ITERATIONS = 25;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await callLLM({
      instructions: systemPrompt,
      messages,
      tools: strategicDataTools,
      model,
      operatorId,
      temperature: 0.3,
      thinking: true,
      thinkingBudget,
      maxTokens,
    });

    costCents += response.apiCostCents;

    if (!response.toolCalls?.length) break;

    messages.push({
      role: "assistant",
      content: response.text || "",
      tool_calls: response.toolCalls.map(tc => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    });

    for (const toolCall of response.toolCalls) {
      const result = await dispatchStrategicDataTool(operatorId, toolCall.name, toolCall.arguments, proposals, agentIndex);
      messages.push({
        role: "tool",
        content: result,
        tool_call_id: toolCall.id,
        name: toolCall.name,
      });
    }
  }

  return { proposals, costCents };
}

// ── Stage 3: Opus Evaluator ────────────────────────────────────────────────────

async function evaluateProposals(
  operatorId: string,
  allProposals: InitiativeProposal[],
  existingInitiativeTitles: string[],
  agentCount: number,
): Promise<{ approved: InitiativeProposal[]; costCents: number }> {
  if (allProposals.length === 0) return { approved: [], costCents: 0 };

  const proposalText = allProposals.map((p, i) => `
### Proposal ${i + 1} (Investigator #${p.agentIndex + 1}): ${p.title}
Type: ${p.patternType} | Severity: ${p.severity}
Description: ${p.description}
Evidence: ${p.evidence.map(e => `[[${e.pageSlug}]]: ${e.claim}`).join("; ")}
Owner: ${p.ownerPageSlug || "unassigned"} | Domain: ${p.domainPageSlug || "company-wide"}
Proposed Action: ${p.proposedAction}
`).join("\n");

  const response = await callLLM({
    operatorId,
    instructions: `You are evaluating initiative proposals from ${agentCount} independent investigators who analyzed a company's wiki. Each investigator entered through different wiki hubs and explored different paths. Your job: filter, deduplicate, and approve the best proposals.

PROPOSALS (${allProposals.length} total):
${proposalText}

EXISTING INITIATIVES (do NOT duplicate):
${existingInitiativeTitles.join("\n") || "(none)"}

For each proposal, decide: APPROVE or REJECT.

REJECT if:
- Duplicates an existing initiative or another proposal in this batch
- Evidence is weak or generic — not grounded in specific wiki content
- Proposed action is vague ("improve X") rather than actionable
- It's obvious advice that doesn't require wiki analysis

APPROVE if:
- Grounded in specific wiki evidence (cites real pages)
- Someone could start working on it today
- Addresses a genuine gap visible in the wiki

You may refine titles or descriptions for clarity.

Respond with ONLY JSON:
{
  "evaluated": [
    {
      "proposalIndex": 0,
      "decision": "approve",
      "reason": "Brief reason",
      "refinedTitle": "Optional cleaner title or null",
      "refinedDescription": "Optional cleaner description or null"
    }
  ]
}`,
    messages: [{ role: "user", content: "Evaluate these proposals." }],
    model: getModel("agenticReasoning"),
    maxTokens: 65_536,
    thinking: true,
    thinkingBudget: 16_384,
  });

  const parsed = extractJSONAny(response.text) as {
    evaluated?: Array<{
      proposalIndex: number;
      decision: string;
      refinedTitle?: string | null;
      refinedDescription?: string | null;
    }>;
  } | null;

  const approved: InitiativeProposal[] = [];
  if (parsed?.evaluated) {
    for (const eval_ of parsed.evaluated) {
      if (eval_.decision !== "approve") continue;
      const proposal = allProposals[eval_.proposalIndex];
      if (!proposal) continue;
      if (eval_.refinedTitle) proposal.title = eval_.refinedTitle;
      if (eval_.refinedDescription) proposal.description = eval_.refinedDescription;
      approved.push(proposal);
    }
  }

  return { approved, costCents: response.apiCostCents };
}

// ── Stage 4: Create Initiatives ────────────────────────────────────────────────

async function createInitiativeFromProposal(
  operatorId: string,
  proposal: InitiativeProposal,
): Promise<string> {
  const slug = `initiative-${Date.now()}-${proposal.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;

  const initiativeProps = {
    status: "proposed",
    proposal_type: mapPatternType(proposal.patternType),
    proposed_at: new Date().toISOString(),
    source: "strategic_scanner",
    domain: proposal.domainPageSlug ?? undefined,
    owner: proposal.ownerPageSlug ?? undefined,
    severity: proposal.severity,
    rationale: proposal.description,
    impact_assessment: `Severity: ${proposal.severity}\n\nEvidence:\n${proposal.evidence.map(e => `- [[${e.pageSlug}]]: ${e.claim}`).join("\n")}`,
    evidence: proposal.evidence,
  };

  const articleBody = [
    `## Trigger`,
    proposal.description,
    ``,
    `## Evidence`,
    ...proposal.evidence.map(e => `- [[${e.pageSlug}]]: ${e.claim}`),
    ``,
    `## Proposed Action`,
    proposal.proposedAction || proposal.description,
    ``,
    `## Timeline`,
    `${new Date().toISOString().slice(0, 16)} — Proposed by strategic scanner`,
  ].join("\n");

  const contentTokens = Math.ceil(articleBody.length / 4);
  const crossRefs = proposal.evidence.map(e => e.pageSlug).filter(Boolean);
  if (proposal.domainPageSlug) crossRefs.push(proposal.domainPageSlug);
  if (proposal.ownerPageSlug) crossRefs.push(proposal.ownerPageSlug);

  const page = await prisma.knowledgePage.create({
    data: {
      operatorId,
      slug,
      title: proposal.title,
      pageType: "initiative",
      scope: "operator",
      status: "draft",
      content: articleBody,
      contentTokens,
      crossReferences: [...new Set(crossRefs)],
      properties: initiativeProps as any,
      synthesisPath: "detection",
      synthesizedByModel: "strategic_scanner",
      confidence: 0.5,
      lastSynthesizedAt: new Date(),
    },
  });

  await prisma.evaluationLog.create({
    data: {
      operatorId,
      sourceType: "wiki_scanner",
      sourceId: slug,
      classification: "initiative_created",
      evaluatedAt: new Date(),
      metadata: {
        patternTitle: proposal.title,
        patternType: proposal.patternType,
        agentIndex: proposal.agentIndex,
        confidence: proposal.confidence,
      },
    },
  });

  sendNotificationToAdmins({
    operatorId,
    type: "initiative_proposed",
    title: `New initiative: ${proposal.title}`,
    body: proposal.description,
    sourceType: "wiki_scanner",
    sourceId: slug,
  }).catch(() => {});

  return page.id;
}

// ── Main Entry Point ───────────────────────────────────────────────────────────

export async function runWikiStrategicScan(operatorId: string): Promise<WikiScanReport> {
  const startTime = performance.now();
  const report: WikiScanReport = {
    initiativesCreated: 0,
    situationsCreated: 0,
    patternsDetected: 0,
    duplicatesSkipped: 0,
    activityLevel: 0,
    scanDepth: "light",
    costCents: 0,
    errors: [],
  };

  // Activity level determines agent count
  const activeSituations = await prisma.knowledgePage.count({
    where: {
      operatorId,
      pageType: "situation_instance",
      scope: "operator",
      OR: [
        { properties: { path: ["status"], equals: "detected" } },
        { properties: { path: ["status"], equals: "investigating" } },
        { properties: { path: ["status"], equals: "active" } },
        { properties: { path: ["status"], equals: "monitoring" } },
        { properties: { path: ["status"], equals: "proposed" } },
      ],
    },
  });
  const activeInitiatives = await prisma.knowledgePage.count({
    where: { operatorId, pageType: "initiative", scope: "operator",
      properties: { path: ["status"], string_contains: "proposed" } },
  });
  const activityLevel = activeSituations + activeInitiatives;
  const agentCount = activityLevel < 5 ? 3 : 1;
  report.activityLevel = activityLevel;
  report.scanDepth = activityLevel < 5 ? "deep" : "light";

  // Existing initiative titles for dedup
  const existing = await prisma.knowledgePage.findMany({
    where: { operatorId, pageType: "initiative", scope: "operator" },
    select: { title: true },
  });
  const existingTitles = existing.map(e => e.title);

  // Stage 1: Assign hubs
  const hubAssignments = await assignHubs(operatorId, agentCount);
  if (hubAssignments.every(a => a.length === 0)) {
    return report;
  }

  console.log(`[wiki-scanner] Starting ${agentCount} wiki investigator agents + 1 strategic data agent (activity: ${activityLevel})`);

  // Stage 2: Run wiki investigators + strategic data agent concurrently
  const allAgentPromises = [
    ...hubAssignments.map((hubs, i) =>
      runInvestigatorAgent(operatorId, hubs, i, existingTitles, agentCount),
    ),
    // 4th agent: strategic data analysis (non-communication raw content)
    runStrategicDataAgent(operatorId, existingTitles, agentCount),
  ];

  const agentResults = await Promise.allSettled(allAgentPromises);

  const allProposals: InitiativeProposal[] = [];
  const totalAgents = agentCount + 1; // wiki investigators + strategic data agent
  for (const result of agentResults) {
    if (result.status === "fulfilled") {
      allProposals.push(...result.value.proposals);
      report.costCents += result.value.costCents;
    } else {
      console.error("[wiki-scanner] Agent failed:", result.reason);
      report.errors.push(`Agent failed: ${result.reason}`);
    }
  }

  report.patternsDetected = allProposals.length;
  console.log(`[wiki-scanner] ${allProposals.length} proposals from ${totalAgents} agents`);

  if (allProposals.length === 0) {
    return report;
  }

  // Stage 3: Evaluate
  const evaluation = await evaluateProposals(operatorId, allProposals, existingTitles, totalAgents);
  report.costCents += evaluation.costCents;
  report.duplicatesSkipped = allProposals.length - evaluation.approved.length;

  // Stage 4: Create approved initiatives
  for (const proposal of evaluation.approved) {
    try {
      await createInitiativeFromProposal(operatorId, proposal);
      report.initiativesCreated++;
    } catch (err) {
      console.error(`[wiki-scanner] Failed to create initiative "${proposal.title}":`, err);
      report.errors.push(`Create failed: ${proposal.title}`);
    }
  }

  console.log(`[wiki-scanner] Complete: ${report.initiativesCreated} initiatives, ${report.duplicatesSkipped} rejected ($${(report.costCents / 100).toFixed(2)}, ${Math.round((performance.now() - startTime) / 1000)}s)`);

  return report;
}

// ── Activity-Aware Scan Scheduling ─────────────────────────────────────────────

export async function shouldRunScan(operatorId: string): Promise<boolean> {
  const activeSituations2 = await prisma.knowledgePage.count({
    where: {
      operatorId,
      pageType: "situation_instance",
      scope: "operator",
      OR: [
        { properties: { path: ["status"], equals: "detected" } },
        { properties: { path: ["status"], equals: "investigating" } },
        { properties: { path: ["status"], equals: "active" } },
        { properties: { path: ["status"], equals: "monitoring" } },
        { properties: { path: ["status"], equals: "proposed" } },
      ],
    },
  });
  const activeInitiatives = await prisma.knowledgePage.count({
    where: { operatorId, pageType: "initiative", scope: "operator",
      properties: { path: ["status"], string_contains: "proposed" } },
  });
  const activityLevel = activeSituations2 + activeInitiatives;

  const lastScan = await prisma.evaluationLog.findFirst({
    where: { operatorId, sourceType: "wiki_scanner" },
    orderBy: { evaluatedAt: "desc" },
    select: { evaluatedAt: true },
  });

  const hoursSinceLastScan = lastScan
    ? (Date.now() - lastScan.evaluatedAt.getTime()) / (1000 * 60 * 60)
    : Infinity;

  const interval = activityLevel < 5 ? 1 : 4;
  return hoursSinceLastScan >= interval;
}
