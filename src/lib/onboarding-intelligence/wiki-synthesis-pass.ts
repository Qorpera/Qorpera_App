/**
 * Wiki Synthesis Pass (Pass 2) — three-stage multi-agent wiki synthesis,
 * then structure derivation from the wiki.
 *
 * Stage 1 (Skeleton): Single Opus agent writes hub pages.
 * Stage 2 (Domain Expansion): One Opus agent per hub, concurrent leaf pages.
 * Stage 3 (Cross-Reference Swarm): Sonnet agents knit [[links]] across pages.
 * Stage 4 (Structure Derivation): Creates SituationTypes from wiki pages, assigns map positions.
 */

import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { callLLM, getModel, getMaxOutputTokens, getThinkingBudget } from "@/lib/ai-provider";
import type { AITool, LLMMessage } from "@/lib/ai-provider";
import { extractJSONAny } from "@/lib/json-helpers";
import { searchRawContent } from "@/lib/storage/raw-content-store";
import {
  WIKI_STYLE_RULES,
  buildPropertyPrompt,
  buildSectionPrompt,
  validateProperties,
  getDefaultProperties,
  PAGE_SCHEMAS,
} from "@/lib/wiki/page-schemas";
import { renderPageForLLM } from "@/lib/wiki/page-renderer";

// ── Configuration ──────────────────────────────────────────────────────────────

const OPUS_MODEL = getModel("agenticReasoning"); // claude-opus-4-6
const SONNET_MODEL = "claude-sonnet-4-6";
const SKELETON_MAX_ITERATIONS = 30;
const DOMAIN_MAX_ITERATIONS = 50;
const XREF_CONCURRENCY = 5;
const DOMAIN_CONCURRENCY = 8; // max concurrent domain agents
const PERSON_PROFILE_CONCURRENCY = 5;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SynthesisPassReport {
  hubPagesWritten: number;
  leafPagesWritten: number;
  totalPagesWritten: number;
  crossReferencesAdded: number;
  departments: number;
  entityTypes: number;
  situationTypes: number;
  totalCostCents: number;
  durationMs: number;
  stages: {
    skeleton: { pages: number; costCents: number; durationMs: number };
    expansion: { pages: number; costCents: number; durationMs: number; agentsRun: number };
    personProfiles: { pages: number; costCents: number; durationMs: number };
    crossRef: { pagesUpdated: number; linksAdded: number; costCents: number; durationMs: number };
    derivation: { costCents: number; durationMs: number };
  };
  errors: string[];
}

interface DerivedStructure {
  departments: number;
  entityTypes: number;
  situationTypes: number;
  costCents: number;
  durationMs: number;
}

import { getDefaultVisibility } from "@/lib/wiki-visibility";

// ── Concurrency helper ─────────────────────────────────────────────────────────

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const executing: Promise<void>[] = [];
  for (const item of items) {
    const p = fn(item).then(() => {
      executing.splice(executing.indexOf(p), 1);
    });
    executing.push(p);
    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

// ── Shared Tool Implementations ────────────────────────────────────────────────

async function toolListFindingsPages(operatorId: string): Promise<string> {
  const pages = await prisma.knowledgePage.findMany({
    where: { operatorId, synthesisPath: "findings" },
    select: { slug: true, title: true, pageType: true, contentTokens: true },
    orderBy: { contentTokens: "desc" },
  });
  if (pages.length === 0) return "No findings pages found.";
  return pages
    .map((p) => `- ${p.slug}: "${p.title}" [${p.pageType}] (~${p.contentTokens} tokens)`)
    .join("\n");
}

async function toolReadFindingsPage(operatorId: string, slug: string): Promise<string> {
  const page = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug, synthesisPath: "findings" },
    select: { title: true, content: true, pageType: true },
  });
  if (!page) return `No findings page found with slug "${slug}"`;
  return `# ${page.title} [${page.pageType}]\n\n${page.content}`;
}

async function toolSearchRawContent(
  operatorId: string,
  query: string,
  sourceType?: string,
): Promise<string> {
  const results = await searchRawContent(operatorId, query, {
    limit: 10,
    sourceType,
  });

  if (results.length === 0) return "No matching content found.";

  // Load full content for each matched sourceId
  const sourceIds = [...new Set(results.map((r) => r.sourceId))];
  const rawItems = await prisma.rawContent.findMany({
    where: { operatorId, sourceId: { in: sourceIds }, rawBody: { not: null } },
    select: { sourceId: true, sourceType: true, rawBody: true, rawMetadata: true },
  });

  const bySourceId = new Map<string, { content: string; meta: Record<string, unknown>; sourceType: string }>();
  for (const raw of rawItems) {
    bySourceId.set(raw.sourceId, {
      content: raw.rawBody!,
      meta: (raw.rawMetadata ?? {}) as Record<string, unknown>,
      sourceType: raw.sourceType,
    });
  }

  return sourceIds
    .slice(0, 10)
    .map((sid) => {
      const item = bySourceId.get(sid);
      if (!item) return "";
      const meta = item.meta;
      const header = `Source: ${sid}\nType: ${item.sourceType}\nSubject: ${meta.subject || meta.fileName || "N/A"}\nFrom: ${meta.from || "N/A"}`;
      return `${header}\n${item.content.slice(0, 3000)}`;
    })
    .filter(Boolean)
    .join("\n\n════════════════════════════════════════\n\n");
}

async function toolReadRawEmail(operatorId: string, sourceId: string): Promise<string> {
  const raw = await prisma.rawContent.findFirst({
    where: { operatorId, sourceId, rawBody: { not: null } },
    select: { rawBody: true, rawMetadata: true },
  });
  if (!raw) return `No content found for sourceId "${sourceId}"`;
  const meta = (raw.rawMetadata ?? {}) as Record<string, unknown>;
  const header = `From: ${meta.from || "unknown"}\nTo: ${meta.to || "unknown"}\nSubject: ${meta.subject || "unknown"}\nDate: ${meta.date || "unknown"}`;
  return `${header}\n\n${raw.rawBody}`;
}

async function toolWriteWikiPage(
  operatorId: string,
  args: {
    slug: string;
    title: string;
    pageType: string;
    content: string;
    isHub: boolean;
    confidence: number;
    properties?: Record<string, unknown>;
    synthesizedByModel?: string;
  },
): Promise<string> {
  // ── Property validation & merge ──
  let mergedProperties: Record<string, unknown> | undefined;

  if (args.properties && PAGE_SCHEMAS[args.pageType]) {
    const validation = validateProperties(args.pageType, args.properties);
    if (!validation.valid) {
      return `Property validation failed for ${args.pageType}:\n${validation.errors.join("\n")}\nFix these and call write_wiki_page again.`;
    }

    // Strip runtime-owned keys the LLM shouldn't provide
    const strippedSynthesisProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args.properties)) {
      if (PAGE_SCHEMAS[args.pageType].properties[key]?.owner !== "runtime") {
        strippedSynthesisProps[key] = value;
      }
    }

    mergedProperties = { ...getDefaultProperties(args.pageType), ...strippedSynthesisProps };
  } else if (PAGE_SCHEMAS[args.pageType]) {
    mergedProperties = getDefaultProperties(args.pageType);
  }

  const crossRefs = [...args.content.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
  const contentTokens = Math.ceil(args.content.length / 4);
  const model = args.synthesizedByModel ?? OPUS_MODEL;

  const existing = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug: args.slug, scope: "operator" },
    select: { id: true, version: true },
  });

  if (existing) {
    await prisma.knowledgePage.update({
      where: { id: existing.id },
      data: {
        title: args.title,
        pageType: args.pageType,
        visibility: getDefaultVisibility(args.pageType),
        content: args.content,
        contentTokens,
        crossReferences: crossRefs,
        confidence: args.confidence,
        properties: mergedProperties ? mergedProperties as unknown as Prisma.InputJsonValue : undefined,
        version: existing.version + 1,
        synthesisPath: "onboarding",
        synthesizedByModel: model,
        lastSynthesizedAt: new Date(),
      },
    });
    return `Updated page "${args.title}" (v${existing.version + 1})`;
  }

  const page = await prisma.knowledgePage.create({
    data: {
      operatorId,
      scope: "operator",
      visibility: getDefaultVisibility(args.pageType),
      pageType: args.pageType,
      title: args.title,
      slug: args.slug,
      content: args.content,
      contentTokens,
      crossReferences: crossRefs,
      sources: [],
      sourceCount: 0,
      sourceTypes: ["onboarding"],
      status: "draft",
      confidence: args.confidence,
      properties: mergedProperties ? mergedProperties as unknown as Prisma.InputJsonValue : undefined,
      version: 1,
      synthesisPath: "onboarding",
      synthesizedByModel: model,
      lastSynthesizedAt: new Date(),
    },
  });
  return `Created page "${args.title}"`;
}

async function toolReadWikiPage(operatorId: string, slug: string): Promise<string> {
  const page = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug, scope: "operator", synthesisPath: "onboarding" },
    select: { title: true, content: true, pageType: true, properties: true, status: true, confidence: true, slug: true },
  });
  if (!page) return `No wiki page found with slug "${slug}"`;
  const rendered = await renderPageForLLM(operatorId, {
    title: page.title,
    pageType: page.pageType,
    slug: page.slug,
    content: page.content,
    properties: (page.properties as Record<string, unknown>) ?? null,
    activityContent: null,
    status: page.status ?? "draft",
    confidence: page.confidence ?? 0.5,
  });
  return rendered;
}

// ── Tool Definitions ───────────────────────────────────────────────────────────

const BASE_TOOLS: AITool[] = [
  {
    name: "list_findings_pages",
    description: "List all findings pages from the data analysis phase, sorted by size.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "read_findings_page",
    description: "Read the full content of a findings page by slug.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "The slug of the findings page to read" },
      },
      required: ["slug"],
    },
  },
  {
    name: "search_raw_content",
    description:
      "Search the company's raw content (emails, documents, messages) by semantic similarity. Returns full content for top matches.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        source_type: {
          type: "string",
          description: "Optional: filter by source type (email, drive_doc, slack_message, etc.)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "read_raw_email",
    description: "Read the full content of a specific email or document by its sourceId.",
    parameters: {
      type: "object",
      properties: {
        source_id: { type: "string", description: "The sourceId of the content to read" },
      },
      required: ["source_id"],
    },
  },
  {
    name: "write_wiki_page",
    description: "Create or update a wiki page. Use [[slug]] cross-references in content. Emit structured properties as JSON. Returns confirmation.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "URL-safe page slug (e.g. domain-engineering, person-sarah-chen)" },
        title: { type: "string", description: "Page title" },
        page_type: {
          type: "string",
          description: "Page type: company_overview, domain_hub, person_profile, process, project, situation_type, external_relationship, tool_system, external_contact, initiative, strategic_link, system_job, other",
        },
        properties: {
          type: "object",
          description: "Structured properties for this page type. See the property schema in your instructions for required and optional fields.",
        },
        content: { type: "string", description: "Full page content in markdown. Use [[slug]] for cross-references. Do NOT include a property table or index section — these are rendered automatically." },
        is_hub: { type: "boolean", description: "true for hub pages (company overview, department overviews)" },
        confidence: { type: "number", description: "Confidence 0-1 in the page content accuracy" },
      },
      required: ["slug", "title", "page_type", "properties", "content", "is_hub", "confidence"],
    },
  },
  {
    name: "read_wiki_page",
    description: "Read an already-written wiki page by slug.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "The slug of the wiki page to read" },
      },
      required: ["slug"],
    },
  },
];

// ── Simple Agentic Loop ────────────────────────────────────────────────────────

interface AgenticResult {
  costCents: number;
  iterations: number;
}

async function runSimpleAgenticLoop(params: {
  operatorId: string;
  systemPrompt: string;
  initialMessage: string;
  tools: AITool[];
  dispatchTool: (name: string, args: Record<string, unknown>) => Promise<string>;
  maxIterations: number;
  model: string;
  useThinking?: boolean;
}): Promise<AgenticResult> {
  const messages: LLMMessage[] = [{ role: "user", content: params.initialMessage }];
  let costCents = 0;
  let iterations = 0;
  const thinkingBudget = params.useThinking ? (getThinkingBudget("agenticReasoning") ?? 16_384) : undefined;
  const maxTokens = params.useThinking ? getMaxOutputTokens(params.model) : 16_384;

  while (iterations < params.maxIterations) {
    const response = await callLLM({
      instructions: params.systemPrompt,
      messages,
      tools: params.tools,
      model: params.model,
      operatorId: params.operatorId,
      temperature: 0.2,
      thinking: !!thinkingBudget,
      thinkingBudget,
      maxTokens,
    });

    costCents += response.apiCostCents;
    iterations++;

    // No tool calls → agent is done
    if (!response.toolCalls?.length) {
      break;
    }

    // Push assistant message with tool calls
    messages.push({
      role: "assistant",
      content: response.text || "",
      tool_calls: response.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    });

    // Execute each tool call
    for (const toolCall of response.toolCalls) {
      const result = await params.dispatchTool(toolCall.name, toolCall.arguments);
      messages.push({
        role: "tool",
        content: result,
        tool_call_id: toolCall.id,
        name: toolCall.name,
      });
    }
  }

  return { costCents, iterations };
}

// ── Stage 1: Skeleton ──────────────────────────────────────────────────────────

async function runSkeletonStage(
  operatorId: string,
  totalBudget: number,
  onProgress?: (msg: string) => Promise<void>,
): Promise<{ hubSlugs: string[]; costCents: number; durationMs: number }> {
  const startTime = Date.now();
  await onProgress?.("Stage 1: Building company structure — writing hub pages...");

  const pagesWrittenBefore = await prisma.knowledgePage.count({
    where: { operatorId, synthesisPath: "onboarding", scope: "operator" },
  });

  const systemPrompt = `You are building the structural skeleton of a company wiki.

Your job: write the COMPANY OVERVIEW HUB and one DEPARTMENT HUB per functional area.

${WIKI_STYLE_RULES}

## Hub Page Purpose

A hub page is the entry point for a domain. It links DOWN to leaf pages that will be written later by domain agents. Hub pages should be dense, factual overviews — NOT comprehensive summaries that duplicate leaf page content. If a fact belongs on a person, process, or project page, the hub should cross-reference it with [[slug]], not restate it.

## company_overview

${buildPropertyPrompt("company_overview")}

${buildSectionPrompt("company_overview")}

## domain_hub

${buildPropertyPrompt("domain_hub")}

${buildSectionPrompt("domain_hub")}

## Key Rules

- Cross-reference people as [[person-firstname-lastname]], processes as [[process-name]], projects as [[project-name]], tools as [[tool-name]], external relationships as [[external-name]]
- Team section: ONE LINE per person. Format: "[[person-slug]] — Title". No descriptions, no summaries of their work.
- Processes section: ONE LINE per process. Format: "[[process-slug]] — brief purpose". No step-by-step.
- Do NOT write "## Pages in this Domain", "## Related Pages", or any index of child pages. These are auto-injected at render time.
- Do NOT duplicate information that belongs on leaf pages.

## Budget

Total wiki budget: ${totalBudget} pages. Write 3-10 hub pages (company overview + departments). The remaining budget goes to domain expansion agents.

## Process

1. Call list_findings_pages to see all available findings
2. Read each findings page
3. Decide how many departments/domains exist
4. Write the company-overview hub first (include properties!)
5. Write each department hub (include properties!)
6. When all hubs are written, end your turn`;

  const dispatchTool = async (name: string, args: Record<string, unknown>): Promise<string> => {
    switch (name) {
      case "list_findings_pages":
        return toolListFindingsPages(operatorId);
      case "read_findings_page":
        return toolReadFindingsPage(operatorId, args.slug as string);
      case "search_raw_content":
        return toolSearchRawContent(operatorId, args.query as string, args.source_type as string | undefined);
      case "read_raw_email":
        return toolReadRawEmail(operatorId, args.source_id as string);
      case "write_wiki_page":
        return toolWriteWikiPage(operatorId, {
          slug: args.slug as string,
          title: args.title as string,
          pageType: args.page_type as string,
          content: args.content as string,
          isHub: args.is_hub as boolean,
          confidence: (args.confidence as number) ?? 0.7,
          properties: args.properties as Record<string, unknown> | undefined,
        });
      case "read_wiki_page":
        return toolReadWikiPage(operatorId, args.slug as string);
      default:
        return `Unknown tool: "${name}"`;
    }
  };

  const result = await runSimpleAgenticLoop({
    operatorId,
    systemPrompt,
    initialMessage: "Begin building the company wiki skeleton. Start by listing the findings pages.",
    tools: BASE_TOOLS,
    dispatchTool,
    maxIterations: SKELETON_MAX_ITERATIONS,
    model: OPUS_MODEL,
    useThinking: true,
  });

  // Collect hub slugs
  const hubPages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      synthesisPath: "onboarding",
      scope: "operator",
      pageType: { in: ["company_overview", "domain_hub"] },
    },
    select: { slug: true },
  });
  const hubSlugs = hubPages.map((p) => p.slug);

  const pagesWrittenAfter = await prisma.knowledgePage.count({
    where: { operatorId, synthesisPath: "onboarding", scope: "operator" },
  });

  const durationMs = Date.now() - startTime;
  await onProgress?.(
    `Stage 1 complete: ${pagesWrittenAfter - pagesWrittenBefore} hub pages written (${hubSlugs.length} hubs, ${result.iterations} iterations, $${(result.costCents / 100).toFixed(2)})`,
  );

  return { hubSlugs, costCents: result.costCents, durationMs };
}

// ── Stage 2: Domain Expansion ──────────────────────────────────────────────────

async function calculateDomainWeights(
  operatorId: string,
  hubSlugs: string[],
): Promise<Record<string, number>> {
  // Weight by findings volume per domain
  const findingsPages = await prisma.knowledgePage.findMany({
    where: { operatorId, synthesisPath: "findings" },
    select: { slug: true, contentTokens: true },
  });

  const weights: Record<string, number> = {};
  let totalTokens = 0;

  for (const hubSlug of hubSlugs) {
    // Match findings pages to hubs by domain name overlap
    const domainName = hubSlug.replace(/^domain-/, "").replace(/-/g, " ");
    const matchingTokens = findingsPages
      .filter(
        (fp) =>
          fp.slug.includes(domainName.split(" ")[0]) ||
          fp.slug.includes(hubSlug.replace("domain-", "")),
      )
      .reduce((sum, fp) => sum + fp.contentTokens, 0);
    weights[hubSlug] = Math.max(matchingTokens, 1000); // minimum weight
    totalTokens += weights[hubSlug];
  }

  // Normalize to proportions
  if (totalTokens > 0) {
    for (const slug of hubSlugs) {
      weights[slug] = weights[slug] / totalTokens;
    }
  } else {
    const even = 1 / hubSlugs.length;
    for (const slug of hubSlugs) {
      weights[slug] = even;
    }
  }

  return weights;
}

async function runSingleDomainAgent(
  operatorId: string,
  hubSlug: string,
  budget: number,
  onProgress?: (msg: string) => Promise<void>,
): Promise<{ pagesWritten: number; costCents: number }> {
  // Read the hub page to get domain context
  const hub = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug: hubSlug, synthesisPath: "onboarding" },
    select: { title: true, content: true },
  });
  const domainName = hub?.title?.replace(" Hub", "").replace("Department: ", "") || hubSlug;

  // Track pages written by this agent
  let pagesWritten = 0;
  const plannedPages: Array<{ slug: string; title: string; pageType: string; done: boolean }> = [];

  const budgetWarning = (remaining: number) =>
    remaining <= 10
      ? "\n\nYOU ARE NEAR YOUR BUDGET LIMIT. Complete your most important unwritten pages. Do not start new discovery threads. Focus on polishing and ensuring coverage of the essentials."
      : "";

  const systemPrompt = `You are building leaf pages for the "${domainName}" domain. The department hub has already been written — read it for context.

${WIKI_STYLE_RULES}

## Your Job

Write ALL leaf pages for this domain:
- Process descriptions (pageType: process)
- Project pages (pageType: project)
- External relationship pages (pageType: external_relationship)
- Situation type pages (pageType: situation_type)
- Tool/system pages (pageType: tool_system)
- External contact pages (pageType: external_contact)

Do NOT write person_profile pages — those are handled by a separate pass.

## Page Type Schemas

Each page type has required properties and a mandatory section structure. When you call write_wiki_page, you MUST provide the correct properties JSON and follow the section menu exactly.

### process
${buildPropertyPrompt("process")}
${buildSectionPrompt("process")}

### project
${buildPropertyPrompt("project")}
${buildSectionPrompt("project")}

### external_relationship
${buildPropertyPrompt("external_relationship")}
${buildSectionPrompt("external_relationship")}

### situation_type
${buildPropertyPrompt("situation_type")}
${buildSectionPrompt("situation_type")}

### tool_system
${buildPropertyPrompt("tool_system")}
${buildSectionPrompt("tool_system")}

### external_contact
${buildPropertyPrompt("external_contact")}
${buildSectionPrompt("external_contact")}

## Cross-References

Use [[slug]] for anything that has or will have its own page:
- Department hub: [[${hubSlug}]]
- People: [[person-firstname-lastname]]
- Processes: [[process-name]]
- Other department hubs: [[domain-name]]

## Budget

You have ${budget} pages to write.${budgetWarning(budget)}

## Process

1. Read the hub page at [[${hubSlug}]]
2. Read relevant findings pages
3. Plan your pages with add_pages_to_plan
4. Write each page — always include properties JSON and follow the section menu
5. Mark each page complete when done`;

  // Domain-specific extra tools
  const domainTools: AITool[] = [
    ...BASE_TOOLS,
    {
      name: "add_pages_to_plan",
      description: "Register pages you plan to write for this domain. Helps track your progress.",
      parameters: {
        type: "object",
        properties: {
          pages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                slug: { type: "string" },
                title: { type: "string" },
                page_type: { type: "string" },
                reason: { type: "string" },
              },
              required: ["slug", "title", "page_type"],
            },
          },
        },
        required: ["pages"],
      },
    },
    {
      name: "mark_page_complete",
      description: "Mark a planned page as complete after writing it.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Slug of the completed page" },
        },
        required: ["slug"],
      },
    },
  ];

  const dispatchTool = async (name: string, args: Record<string, unknown>): Promise<string> => {
    switch (name) {
      case "list_findings_pages":
        return toolListFindingsPages(operatorId);
      case "read_findings_page":
        return toolReadFindingsPage(operatorId, args.slug as string);
      case "search_raw_content":
        return toolSearchRawContent(operatorId, args.query as string, args.source_type as string | undefined);
      case "read_raw_email":
        return toolReadRawEmail(operatorId, args.source_id as string);
      case "write_wiki_page": {
        if (pagesWritten >= budget) {
          return `Budget exhausted (${budget} pages). Cannot write more pages. Focus on completing your most important work.`;
        }
        const result = await toolWriteWikiPage(operatorId, {
          slug: args.slug as string,
          title: args.title as string,
          pageType: args.page_type as string,
          content: args.content as string,
          isHub: args.is_hub as boolean,
          confidence: (args.confidence as number) ?? 0.7,
          properties: args.properties as Record<string, unknown> | undefined,
        });
        pagesWritten++;
        return `${result}\n\n[Budget: ${pagesWritten}/${budget} pages used${budgetWarning(budget - pagesWritten)}]`;
      }
      case "read_wiki_page":
        return toolReadWikiPage(operatorId, args.slug as string);
      case "add_pages_to_plan": {
        const pages = args.pages as Array<{ slug: string; title: string; page_type: string; reason?: string }>;
        for (const p of pages) {
          plannedPages.push({ slug: p.slug, title: p.title, pageType: p.page_type, done: false });
        }
        return `Added ${pages.length} pages to plan. Total planned: ${plannedPages.length}, completed: ${plannedPages.filter((p) => p.done).length}`;
      }
      case "mark_page_complete": {
        const slug = args.slug as string;
        const planned = plannedPages.find((p) => p.slug === slug);
        if (planned) planned.done = true;
        const remaining = plannedPages.filter((p) => !p.done);
        return `Marked "${slug}" as complete. Remaining: ${remaining.length} pages (${remaining.map((p) => p.slug).join(", ")})`;
      }
      default:
        return `Unknown tool: "${name}"`;
    }
  };

  const result = await runSimpleAgenticLoop({
    operatorId,
    systemPrompt,
    initialMessage: `Begin building leaf pages for the "${domainName}" domain. Start by reading your hub page at [[${hubSlug}]], then read relevant findings.`,
    tools: domainTools,
    dispatchTool,
    maxIterations: DOMAIN_MAX_ITERATIONS,
    model: OPUS_MODEL,
    useThinking: true,
  });

  await onProgress?.(
    `Domain "${domainName}": ${pagesWritten} pages written (${result.iterations} iterations)`,
  );

  return { pagesWritten, costCents: result.costCents };
}

async function runDomainExpansionStage(
  operatorId: string,
  hubSlugs: string[],
  totalBudget: number,
  pagesWrittenSoFar: number,
  onProgress?: (msg: string) => Promise<void>,
): Promise<{ pagesWritten: number; costCents: number; durationMs: number; agentsRun: number }> {
  const startTime = Date.now();
  await onProgress?.(`Stage 2: Expanding ${hubSlugs.length} domains in parallel...`);

  const remainingBudget = totalBudget - pagesWrittenSoFar;
  const domainWeights = await calculateDomainWeights(operatorId, hubSlugs);

  const perDomainBudget = hubSlugs.map((slug) => ({
    slug,
    budget: Math.max(10, Math.round(remainingBudget * (domainWeights[slug] ?? 1 / hubSlugs.length))),
  }));

  let totalPagesWritten = 0;
  let totalCost = 0;
  let agentsRun = 0;

  // Run all domain agents concurrently with controlled concurrency
  await runWithConcurrency(perDomainBudget, DOMAIN_CONCURRENCY, async ({ slug, budget }) => {
    try {
      const result = await runSingleDomainAgent(operatorId, slug, budget, onProgress);
      totalPagesWritten += result.pagesWritten;
      totalCost += result.costCents;
      agentsRun++;
    } catch (err) {
      console.error(`[wiki-synthesis] Domain agent failed for ${slug}:`, err);
      agentsRun++;
    }
  });

  const durationMs = Date.now() - startTime;
  await onProgress?.(
    `Stage 2 complete: ${totalPagesWritten} leaf pages across ${agentsRun} domains ($${(totalCost / 100).toFixed(2)}, ${Math.round(durationMs / 1000)}s)`,
  );

  return { pagesWritten: totalPagesWritten, costCents: totalCost, durationMs, agentsRun };
}

// ═══ Stage 2b: Person Profile Pass (Sonnet) ═════════════════════════════════

async function runPersonProfilePass(
  operatorId: string,
  onProgress?: (msg: string) => Promise<void>,
): Promise<{ pagesWritten: number; costCents: number; durationMs: number }> {
  const startTime = Date.now();
  await onProgress?.("Stage 2b: Writing person profiles (Sonnet)...");

  // a) Load all person findings pages
  const personFindings = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      synthesisPath: "findings",
      OR: [
        { pageType: "findings_person" },
        { slug: { startsWith: "findings-person" } },
      ],
    },
    select: { slug: true, title: true, content: true },
  });

  if (personFindings.length === 0) {
    await onProgress?.("Stage 2b: No person findings found — skipping.");
    return { pagesWritten: 0, costCents: 0, durationMs: Date.now() - startTime };
  }

  // b) Load company overview and domain hub pages for context
  const contextPages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      synthesisPath: "onboarding",
      scope: "operator",
      pageType: { in: ["company_overview", "domain_hub"] },
    },
    select: { slug: true, title: true, content: true, pageType: true },
  });

  const contextSummary = contextPages
    .map((p) => `=== ${p.slug} (${p.pageType}) ===\n${p.content.slice(0, 2000)}`)
    .join("\n\n");

  const hubSlugs = contextPages
    .filter((p) => p.pageType === "domain_hub")
    .map((p) => `- [[${p.slug}]]: ${p.title}`)
    .join("\n");

  let totalPagesWritten = 0;
  let totalCost = 0;

  // c) For each person findings page, generate a profile via Sonnet
  await runWithConcurrency(personFindings, PERSON_PROFILE_CONCURRENCY, async (finding) => {
    try {
      const personName = finding.title
        .replace(/^Person Findings:\s*/i, "")
        .trim();
      const personSlug = finding.slug.replace(/^findings-/, "");
      const profileSlug = personSlug.startsWith("person-") ? personSlug : `person-${personSlug}`;

      const response = await callLLM({
        instructions: `You are writing a person_profile wiki page for a company knowledge base.

${WIKI_STYLE_RULES}

## Available Domain Hubs
${hubSlugs}

## Company Context
${contextSummary}

${buildPropertyPrompt("person_profile")}

${buildSectionPrompt("person_profile")}

## Instructions

Write a person_profile wiki page for ${personName}.

You MUST respond with a JSON object containing exactly two fields:
{
  "properties": { ... },   // structured properties per the schema above
  "content": "..."         // markdown content following the section menu
}

Content rules:
- Use [[person-slug]] wikilinks for colleagues
- Use [[domain-slug]] to place this person in their department
- Use [[process-slug]], [[project-slug]], [[tool-slug]] for any referenced items
- Dense, factual, no filler. No interpretive commentary ("shows professional maturity", "functional seniority above title").
- Every section from the section menu must be present as a ## heading.

Output ONLY the JSON object. No markdown code fences, no preamble.`,
        messages: [
          {
            role: "user",
            content: `Here are the findings for this person:\n\n${finding.content}`,
          },
        ],
        model: SONNET_MODEL,
        maxTokens: 4096,
      });

      totalCost += response.apiCostCents;

      if (response.text) {
        // Parse the JSON response
        let properties: Record<string, unknown> | undefined;
        let content = response.text;

        try {
          // Strip any accidental code fences
          const cleaned = response.text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
          const parsed = JSON.parse(cleaned);
          if (parsed.properties && typeof parsed.properties === "object") {
            properties = parsed.properties;
          }
          if (parsed.content && typeof parsed.content === "string") {
            content = parsed.content;
          }
        } catch {
          // If JSON parse fails, treat entire response as content (backward compat).
          // Leave properties undefined so toolWriteWikiPage applies getDefaultProperties().
          console.warn(`[wiki-synthesis] Person profile JSON parse failed for ${personName}, using raw text as content`);
          content = response.text;
          properties = undefined;
        }

        await toolWriteWikiPage(operatorId, {
          slug: profileSlug,
          title: personName,
          pageType: "person_profile",
          content,
          isHub: false,
          confidence: 0.75,
          properties,
          synthesizedByModel: SONNET_MODEL,
        });
        totalPagesWritten++;
      }
    } catch (err) {
      console.error(`[wiki-synthesis] Person profile failed for ${finding.slug}:`, err);
    }
  });

  const durationMs = Date.now() - startTime;
  await onProgress?.(
    `Stage 2b complete: ${totalPagesWritten} person profiles written ($${(totalCost / 100).toFixed(2)}, ${Math.round(durationMs / 1000)}s)`,
  );

  return { pagesWritten: totalPagesWritten, costCents: totalCost, durationMs };
}

// ── Stage 3: Cross-Reference Swarm ─────────────────────────────────────────────

async function runCrossReferenceSwarm(
  operatorId: string,
  onProgress?: (msg: string) => Promise<void>,
): Promise<{ pagesUpdated: number; linksAdded: number; costCents: number; durationMs: number }> {
  const startTime = Date.now();
  await onProgress?.("Stage 3: Linking pages together with cross-references...");

  // Load all wiki pages
  const allPages = await prisma.knowledgePage.findMany({
    where: { operatorId, synthesisPath: "onboarding", scope: "operator" },
    select: { id: true, slug: true, title: true, content: true, pageType: true },
    orderBy: { contentTokens: "desc" },
  });

  if (allPages.length === 0) {
    return { pagesUpdated: 0, linksAdded: 0, costCents: 0, durationMs: Date.now() - startTime };
  }

  // Build page index (slug, title, preview)
  const pageIndex = allPages.map((p) => ({
    slug: p.slug,
    title: p.title,
    preview: p.content.slice(0, 100).replace(/\n/g, " "),
  }));

  const pageIndexStr = pageIndex
    .map((p) => `- [[${p.slug}]]: "${p.title}" — ${p.preview}`)
    .join("\n");

  // Split into batches (smaller batches for large wikis to fit output tokens)
  const xrefBatchSize = allPages.length > 200 ? 10 : 20;
  const batches: typeof allPages[] = [];
  for (let i = 0; i < allPages.length; i += xrefBatchSize) {
    batches.push(allPages.slice(i, i + xrefBatchSize));
  }

  let totalPagesUpdated = 0;
  let totalLinksAdded = 0;
  let totalCost = 0;

  await runWithConcurrency(batches, XREF_CONCURRENCY, async (batch) => {
    try {
      const batchContent = batch
        .map((p) => `=== PAGE: ${p.slug} ===\n${p.content}\n=== END PAGE ===`)
        .join("\n\n");

      const response = await callLLM({
        instructions: `You are adding cross-reference links to wiki pages. You have access to the full page index below.

Page Index (all pages in this wiki):
${pageIndexStr}

Your Pages (add [[links]] to these):
${batchContent}

Instructions:
1. For EACH page above, scan the content for mentions of people, processes, projects, tools, departments, or concepts that have their own page in the index.
2. Replace plain-text mentions with [[slug]] links. Example: "Sarah Chen leads the team" → "[[person-sarah-chen]] leads the team"
3. Do NOT change the substance of any page — only add links.
4. Ensure the "## Related Pages" section at the bottom lists the most important cross-references (5-15 links). If one doesn't exist, add one.
5. Do NOT re-link things that are already [[linked]].

Respond with ONLY JSON:
{
  "updates": [
    {
      "slug": "the-page-slug",
      "content": "the full updated page content with [[links]] added",
      "linksAdded": 5
    }
  ]
}`,
        messages: [{ role: "user", content: "Add cross-reference links to the pages above." }],
        model: SONNET_MODEL,
        maxTokens: 65_536,
      });

      totalCost += response.apiCostCents;

      const parsed = extractJSONAny(response.text) as { updates?: Array<{ slug: string; content: string; linksAdded: number }> } | null;
      if (parsed?.updates && Array.isArray(parsed.updates)) {
        for (const update of parsed.updates) {
          if (!update.slug || !update.content) continue;
          const page = batch.find((p) => p.slug === update.slug);
          if (!page) continue;

          const crossRefs = [...update.content.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
          await prisma.knowledgePage.update({
            where: { id: page.id },
            data: {
              content: update.content,
              contentTokens: Math.ceil(update.content.length / 4),
              crossReferences: crossRefs,
              lastSynthesizedAt: new Date(),
            },
          });
          totalPagesUpdated++;
          totalLinksAdded += update.linksAdded || 0;
        }
      }
    } catch (err) {
      console.error("[wiki-synthesis] Cross-reference batch failed:", err);
    }
  });

  const durationMs = Date.now() - startTime;
  await onProgress?.(
    `Stage 3 complete: ${totalLinksAdded} links added across ${totalPagesUpdated} pages ($${(totalCost / 100).toFixed(2)})`,
  );

  return { pagesUpdated: totalPagesUpdated, linksAdded: totalLinksAdded, costCents: totalCost, durationMs };
}

// ── Stage 4: Structure Derivation ──────────────────────────────────────────────

async function deriveStructureFromWiki(
  operatorId: string,
  onProgress?: (msg: string) => Promise<void>,
): Promise<DerivedStructure> {
  const startTime = Date.now();
  await onProgress?.("Stage 4: Creating situation types and assigning map positions...");

  let costCents = 0;
  let situationTypes = 0;

  // ── 1. Create SituationType records from situation_type wiki pages ──────────

  const sitTypePages = await prisma.knowledgePage.findMany({
    where: { operatorId, pageType: "situation_type", scope: "operator" },
    select: { title: true, content: true, slug: true },
  });

  for (const page of sitTypePages) {
    // Minimal LLM call to extract detection config from page content
    const response = await callLLM({
      instructions: `Extract detection configuration from this situation type wiki page. Respond with ONLY JSON:
{
  "detectionMode": "structured" | "content" | "natural",
  "detectionLogic": { "mode": "...", "naturalLanguage": "..." },
  "severity": "high" | "medium" | "low",
  "archetypeSlug": "string or null"
}

If the page describes specific entity property conditions, use "structured".
If it describes communication patterns to watch for, use "content".
Otherwise use "natural" with a naturalLanguage description of what to detect.`,
      messages: [{ role: "user", content: `# ${page.title}\n\n${page.content.slice(0, 4000)}` }],
      model: SONNET_MODEL,
      maxTokens: 1000,
    });

    costCents += response.apiCostCents;

    const parsed = extractJSONAny(response.text) as {
      detectionMode?: string;
      detectionLogic?: Record<string, unknown>;
      severity?: string;
      archetypeSlug?: string | null;
    } | null;

    const detectionLogic = parsed?.detectionLogic
      ? JSON.stringify(parsed.detectionLogic)
      : JSON.stringify({ mode: "natural", naturalLanguage: page.content.slice(0, 500) });

    const sitSlug = page.slug
      .replace(/^situation-type-/, "")
      .replace(/^sit-/, "");

    await prisma.situationType.upsert({
      where: { operatorId_slug: { operatorId, slug: sitSlug } },
      create: {
        operatorId,
        slug: sitSlug,
        name: page.title.replace(/^Situation Type:\s*/i, ""),
        description: page.content.slice(0, 2000),
        detectionLogic,
        autonomyLevel: "supervised",
        wikiPageSlug: page.slug,
        archetypeSlug: parsed?.archetypeSlug ?? null,
      },
      update: {
        description: page.content.slice(0, 2000),
        detectionLogic,
        wikiPageSlug: page.slug,
        archetypeSlug: parsed?.archetypeSlug ?? null,
      },
    });

    situationTypes++;
  }

  // ── 2. Assign map positions to wiki pages ──────────────────────────────────

  const allPages = await prisma.knowledgePage.findMany({
    where: { operatorId, scope: "operator", mapX: null },
    select: { id: true, slug: true, pageType: true, crossReferences: true },
  });

  // Identify company hub and department hubs separately
  const companyHub = allPages.find(
    (p) => p.slug.includes("company-overview") || p.pageType === "index",
  );
  const hubPages = allPages.filter(
    (p) => p.id !== companyHub?.id && (p.pageType === "domain_overview" || p.pageType.includes("overview")),
  );

  // Company overview at center
  if (companyHub) {
    await prisma.knowledgePage.update({
      where: { id: companyHub.id },
      data: { mapX: 0, mapY: 0 },
    });
  }

  // Department hubs evenly spaced in a circle
  const hubRadius = 400;
  const hubAngleStep = hubPages.length > 0 ? (2 * Math.PI) / hubPages.length : 0;
  const hubPositions = new Map<string, { x: number; y: number }>();

  for (let i = 0; i < hubPages.length; i++) {
    const hub = hubPages[i];
    const angle = hubAngleStep * i - Math.PI / 2; // start from top
    const x = Math.round(hubRadius * Math.cos(angle));
    const y = Math.round(hubRadius * Math.sin(angle));
    await prisma.knowledgePage.update({
      where: { id: hub.id },
      data: { mapX: x, mapY: y },
    });
    hubPositions.set(hub.slug, { x, y });
  }

  // Leaf pages clustered around their department hub
  const leafPages = allPages.filter(
    (p) => p.id !== companyHub?.id && !hubPages.includes(p) && p.pageType !== "situation_type",
  );
  const externalPages = leafPages.filter((p) => p.pageType.includes("external"));
  const internalLeaves = leafPages.filter((p) => !p.pageType.includes("external"));

  // Internal leaves: cluster around their domain hub
  const leafRadius = 150;
  const domainLeafCounters = new Map<string, number>();

  for (const leaf of internalLeaves) {
    // Find parent hub position via crossReferences
    let parentPos: { x: number; y: number } | undefined;
    for (const ref of leaf.crossReferences) {
      parentPos = hubPositions.get(ref);
      if (parentPos) break;
    }
    if (!parentPos) {
      // Try slug prefix matching
      const slugPrefix = leaf.slug.split("-").slice(0, 2).join("-");
      parentPos = hubPositions.get(slugPrefix);
    }
    if (!parentPos && hubPages.length > 0) {
      // Fallback: assign to first hub
      parentPos = hubPositions.get(hubPages[0].slug);
    }
    if (!parentPos) parentPos = { x: 0, y: 0 };

    const key = `${parentPos.x}:${parentPos.y}`;
    const idx = domainLeafCounters.get(key) ?? 0;
    domainLeafCounters.set(key, idx + 1);

    const leafAngle = (2 * Math.PI * idx) / Math.max(8, idx + 1);
    const jitter = 30 + (idx % 3) * 20;
    const x = Math.round(parentPos.x + (leafRadius + jitter) * Math.cos(leafAngle));
    const y = Math.round(parentPos.y + (leafRadius + jitter) * Math.sin(leafAngle));

    await prisma.knowledgePage.update({
      where: { id: leaf.id },
      data: { mapX: x, mapY: y },
    });
  }

  // External pages: outer ring
  const outerRadius = 700;
  const extAngleStep = externalPages.length > 0 ? (2 * Math.PI) / externalPages.length : 0;
  for (let i = 0; i < externalPages.length; i++) {
    const angle = extAngleStep * i;
    const x = Math.round(outerRadius * Math.cos(angle));
    const y = Math.round(outerRadius * Math.sin(angle));
    await prisma.knowledgePage.update({
      where: { id: externalPages[i].id },
      data: { mapX: x, mapY: y },
    });
  }

  // Count departments from hub pages
  const departments = hubPages.length;

  await onProgress?.(
    `Stage 4 complete: ${situationTypes} situation types, ${allPages.length} pages positioned, ${departments} department hubs`,
  );

  return {
    departments,
    entityTypes: 0,
    situationTypes,
    costCents,
    durationMs: Date.now() - startTime,
  };
}

// ── Domain Membership Reconciliation ──────────────────────────────────────────

async function reconcileDomainMembership(operatorId: string): Promise<number> {
  // Load all domain_hub pages
  const hubs = await prisma.knowledgePage.findMany({
    where: { operatorId, scope: "operator", pageType: "domain_hub" },
    select: { slug: true, crossReferences: true },
  });

  let updatedCount = 0;

  for (const hub of hubs) {
    // Find person slugs in this hub's cross-references
    const personSlugs = (hub.crossReferences as string[]).filter(
      (ref) => ref.startsWith("person-"),
    );

    for (const personSlug of personSlugs) {
      const personPage = await prisma.knowledgePage.findFirst({
        where: { operatorId, scope: "operator", slug: personSlug, pageType: "person_profile" },
        select: { id: true, crossReferences: true },
      });
      if (!personPage) continue;

      const refs = personPage.crossReferences as string[];
      if (refs.includes(hub.slug)) continue;

      // Add the hub slug to the person's cross-references
      await prisma.knowledgePage.update({
        where: { id: personPage.id },
        data: { crossReferences: [...refs, hub.slug] },
      });
      updatedCount++;
    }
  }

  return updatedCount;
}

// ── Main Entry Point ───────────────────────────────────────────────────────────

export async function runWikiSynthesisPass(
  operatorId: string,
  options?: {
    onProgress?: (msg: string) => Promise<void>;
    analysisId?: string;
  },
): Promise<SynthesisPassReport> {
  const startTime = Date.now();
  const progress = options?.onProgress ?? (async () => {});
  const errors: string[] = [];

  // Calculate page budget from people registry
  let employeeCount = 10; // fallback
  try {
    const analysis = options?.analysisId
      ? await prisma.onboardingAnalysis.findUnique({
          where: { id: options.analysisId },
          select: { id: true },
        })
      : await prisma.onboardingAnalysis.findFirst({
          where: { operatorId },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
    if (analysis) {
      const peopleRun = await prisma.onboardingAgentRun.findFirst({
        where: { analysisId: analysis.id, agentName: "people_discovery", status: "complete" },
        orderBy: { completedAt: "desc" },
        select: { report: true },
      });
      if (peopleRun?.report && Array.isArray(peopleRun.report)) {
        const registry = peopleRun.report as Array<{ isInternal?: boolean }>;
        employeeCount = registry.filter(p => p.isInternal).length || 10;
      }
    }
  } catch { /* use fallback */ }

  const totalBudget = Math.max(300, employeeCount * 8);
  await progress(`Wiki synthesis starting — budget: ${totalBudget} pages for ${employeeCount} employees`);

  // Stage 1: Skeleton
  let skeleton: { hubSlugs: string[]; costCents: number; durationMs: number };
  try {
    skeleton = await runSkeletonStage(operatorId, totalBudget, options?.onProgress);
  } catch (err) {
    const msg = `Stage 1 failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[wiki-synthesis] ${msg}`);
    errors.push(msg);
    skeleton = { hubSlugs: [], costCents: 0, durationMs: 0 };
  }

  const hubPagesWritten = skeleton.hubSlugs.length;
  let totalCost = skeleton.costCents;

  // Stage 2: Domain Expansion
  let expansion: { pagesWritten: number; costCents: number; durationMs: number; agentsRun: number };
  try {
    expansion = await runDomainExpansionStage(
      operatorId,
      skeleton.hubSlugs,
      totalBudget,
      hubPagesWritten,
      options?.onProgress,
    );
  } catch (err) {
    const msg = `Stage 2 failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[wiki-synthesis] ${msg}`);
    errors.push(msg);
    expansion = { pagesWritten: 0, costCents: 0, durationMs: 0, agentsRun: 0 };
  }
  totalCost += expansion.costCents;

  // Stage 2b: Person Profile Pass (Sonnet)
  let personProfiles: { pagesWritten: number; costCents: number; durationMs: number };
  try {
    personProfiles = await runPersonProfilePass(operatorId, options?.onProgress);
  } catch (err) {
    const msg = `Stage 2b failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[wiki-synthesis] ${msg}`);
    errors.push(msg);
    personProfiles = { pagesWritten: 0, costCents: 0, durationMs: 0 };
  }
  totalCost += personProfiles.costCents;

  // Stage 3: Cross-Reference Swarm
  let crossRef: { pagesUpdated: number; linksAdded: number; costCents: number; durationMs: number };
  try {
    crossRef = await runCrossReferenceSwarm(operatorId, options?.onProgress);
  } catch (err) {
    const msg = `Stage 3 failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[wiki-synthesis] ${msg}`);
    errors.push(msg);
    crossRef = { pagesUpdated: 0, linksAdded: 0, costCents: 0, durationMs: 0 };
  }
  totalCost += crossRef.costCents;

  // Reconcile bidirectional domain membership links
  try {
    const reconciled = await reconcileDomainMembership(operatorId);
    if (reconciled > 0) {
      await progress(`Reconciled ${reconciled} person→hub back-links`);
    }
  } catch (err) {
    const msg = `Domain membership reconciliation failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[wiki-synthesis] ${msg}`);
    errors.push(msg);
  }

  // Stage 4: Structure Derivation
  let derivation: DerivedStructure;
  try {
    derivation = await deriveStructureFromWiki(operatorId, options?.onProgress);
  } catch (err) {
    const msg = `Stage 4 failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[wiki-synthesis] ${msg}`);
    errors.push(msg);
    derivation = { departments: 0, entityTypes: 0, situationTypes: 0, costCents: 0, durationMs: 0 };
  }
  totalCost += derivation.costCents;

  // Archive findings pages — they've been synthesized into proper wiki pages
  const archivedCount = await prisma.knowledgePage.updateMany({
    where: { operatorId, synthesisPath: "findings", status: "draft" },
    data: { status: "archived", synthesisPath: "findings_archived" },
  });
  if (archivedCount.count > 0) {
    console.log(`[wiki-synthesis] Archived ${archivedCount.count} findings pages`);
  }

  const totalPagesWritten = hubPagesWritten + expansion.pagesWritten + personProfiles.pagesWritten;
  const durationMs = Date.now() - startTime;

  await progress(
    `Wiki synthesis complete: ${totalPagesWritten} pages, ${crossRef.linksAdded} cross-references, ${derivation.departments} departments ($${(totalCost / 100).toFixed(2)}, ${Math.round(durationMs / 1000)}s)`,
  );

  return {
    hubPagesWritten,
    leafPagesWritten: expansion.pagesWritten + personProfiles.pagesWritten,
    totalPagesWritten,
    crossReferencesAdded: crossRef.linksAdded,
    departments: derivation.departments,
    entityTypes: derivation.entityTypes,
    situationTypes: derivation.situationTypes,
    totalCostCents: totalCost,
    durationMs,
    stages: {
      skeleton: {
        pages: hubPagesWritten,
        costCents: skeleton.costCents,
        durationMs: skeleton.durationMs,
      },
      expansion: {
        pages: expansion.pagesWritten,
        costCents: expansion.costCents,
        durationMs: expansion.durationMs,
        agentsRun: expansion.agentsRun,
      },
      personProfiles: {
        pages: personProfiles.pagesWritten,
        costCents: personProfiles.costCents,
        durationMs: personProfiles.durationMs,
      },
      crossRef: {
        pagesUpdated: crossRef.pagesUpdated,
        linksAdded: crossRef.linksAdded,
        costCents: crossRef.costCents,
        durationMs: crossRef.durationMs,
      },
      derivation: {
        costCents: derivation.costCents,
        durationMs: derivation.durationMs,
      },
    },
    errors,
  };
}
