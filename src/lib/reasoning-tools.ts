import { prisma } from "@/lib/db";
import type { AITool } from "@/lib/ai-provider";
import { searchRawContent } from "@/lib/storage/raw-content-store";
import { loadCommunicationContext } from "@/lib/context-assembly";
import { getPageForEntity, searchPages, searchSystemPages, resolvePageSlug } from "@/lib/wiki-engine";
import { findContradictions, type EvidenceContradiction } from "@/lib/evidence-registry";

// ── Helpers ─────────────────────────────────────────────────────────────────

const MAX_RESULT_CHARS = 12_000; // ~3,000 tokens

function capResult(text: string): string {
  if (text.length <= MAX_RESULT_CHARS) return text;
  return text.slice(0, MAX_RESULT_CHARS) + "\n\n[Result truncated. Narrow your query for more specific results.]";
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Tool Definitions ────────────────────────────────────────────────────────

export const REASONING_TOOLS: AITool[] = [
  {
    name: "get_related_pages",
    description:
      "Get all pages linked from a wiki page via [[cross-references]]. Returns previews of each linked page. Use this to explore relationships and connections from a starting point.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Slug of the wiki page to get related pages for",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "get_activity_timeline",
    description:
      "Get recent activity for a person. Search by name, email, or wiki page slug. Returns activity summaries from the person's wiki page, or raw content search results as fallback.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Person name, email, or search term",
        },
        slug: {
          type: "string",
          description: "Optional: wiki page slug to get activity for directly",
        },
        days: {
          type: "number",
          description: "Number of days to look back (default 30)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_communications",
    description:
      "Semantic search over emails, Slack messages, and Teams messages. Returns relevant excerpts with sender, subject, timestamp, and relevance score.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query for semantic matching against communication content",
        },
        limit: {
          type: "number",
          description: "Maximum excerpts to return (default 8)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_documents",
    description:
      "Semantic search over uploaded documents, Drive files, spreadsheets, and slide presentations. Returns relevant chunks with source attribution.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query for semantic matching against document content",
        },
        limit: {
          type: "number",
          description: "Maximum chunks to return (default 8)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_cross_department_signals",
    description:
      "Discover cross-department connections for a person or topic by reading their wiki page and finding links to multiple department hubs.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Wiki page slug of the person or topic to analyze",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "get_prior_situations",
    description:
      "Load previously resolved or closed situations from the wiki, optionally filtered by situation type slug. Useful for understanding precedent and past outcomes.",
    parameters: {
      type: "object",
      properties: {
        situationTypeSlug: {
          type: "string",
          description: "Filter by situation type slug (e.g. 'situation-type-late-invoice')",
        },
        triggerPageSlug: {
          type: "string",
          description: "Wiki page slug to filter situations by",
        },
        limit: {
          type: "number",
          description: "Maximum situations to return (default 5)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_department_context",
    description:
      "Read a department's wiki page (domain hub). Returns the full department context from the wiki.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Department wiki page slug or name",
        },
      },
      required: ["slug"],
    },
  },
  {
    name: "get_org_structure",
    description:
      "Load the organizational structure from wiki pages. Returns company overview and department hubs.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_available_actions",
    description:
      "List enabled action capabilities (connector write-back actions) the AI can execute. Optionally filter by connector provider.",
    parameters: {
      type: "object",
      properties: {
        connectorProvider: {
          type: "string",
          description: "Filter by connector provider (e.g. 'google', 'slack', 'microsoft')",
        },
      },
      required: [],
    },
  },
  {
    name: "read_wiki_page",
    description:
      "Read a knowledge page. Pages contain synthesized intelligence — company-specific context (operator) or practitioner reference material (system). Pages contain cross-reference links written as [[page-slug]] — follow relevant links to navigate to related methodology guides, frameworks, and worked examples.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Page slug (from cross-references in other pages or from search_wiki results)",
        },
        subjectEntityId: {
          type: "string",
          description: "Alternative: find the wiki page for this entity ID",
        },
        pageType: {
          type: "string",
          description: "Optional: filter by page type (entity_profile, process_description, financial_pattern, communication_pattern, situation_pattern, domain_overview, topic_synthesis)",
        },
      },
      required: [],
    },
  },
  {
    name: "search_wiki",
    description:
      "Search the knowledge wiki. Use scope 'operator' for this company's specific knowledge (people, processes, financials, patterns). Use scope 'system' for practitioner reference material — benchmarks, regional practice specifics, empirical patterns, red flag heuristics. The system reference library is supplementary — consult it when you need specific thresholds or practitioner insights, not as a prerequisite to thinking. Use 'all' to search both layers.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query — topic, entity name, or concept to find wiki pages about",
        },
        scope: {
          type: "string",
          enum: ["operator", "system", "all"],
          description: "Which wiki to search. Default: operator",
        },
        pageType: {
          type: "string",
          description: "Optional: filter results by page type",
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default 5, max 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_evidence",
    description:
      "Search the evidence registry for specific claims, facts, numbers, or relationships. Returns structured extractions from raw data sources with confidence scores and source references. More precise than document search — returns individual claims, not document chunks.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query — a claim, topic, entity name, or number to find in evidence extractions",
        },
        sourceType: {
          type: "string",
          description: "Optional: filter to a specific source type (email, slack_message, drive_doc, file_upload, calendar_note)",
        },
        claimType: {
          type: "string",
          enum: ["fact", "commitment", "decision", "opinion", "question"],
          description: "Optional: filter to a specific claim type",
        },
        maxResults: {
          type: "number",
          description: "Maximum results (default 10, max 30)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_contradictions",
    description:
      "Get all detected contradictions in the evidence registry. Contradictions are cases where two data sources make conflicting claims. Use this to identify areas that need investigation or clarification.",
    parameters: {
      type: "object",
      properties: {
        entityName: {
          type: "string",
          description: "Optional: filter contradictions mentioning this entity",
        },
        maxResults: {
          type: "number",
          description: "Maximum contradictions to return (default 20, max 50)",
        },
      },
      required: [],
    },
  },
  {
    name: "read_full_content",
    description:
      "Read the complete content of a specific ContentChunk by ID. Use when evidence search returns a claim you need to see in full context — the complete email, document section, or message. Returns the full chunk content plus metadata.",
    parameters: {
      type: "object",
      properties: {
        chunkId: {
          type: "string",
          description: "ContentChunk ID to read in full",
        },
      },
      required: ["chunkId"],
    },
  },
  {
    name: "web_search",
    description:
      "Search the web for current information. Use for competitor monitoring, market intelligence, legal/regulatory changes, technology trends, pricing benchmarks, or any external information not available in the organizational wiki. Returns top search results with titles, URLs, and descriptions.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query — be specific and targeted" },
        freshness: { type: "string", enum: ["day", "week", "month"], description: "Optional: restrict to recent results" },
      },
      required: ["query"],
    },
  },
];

// ── Dispatch ────────────────────────────────────────────────────────────────

export async function executeReasoningTool(
  operatorId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    switch (toolName) {
      case "get_related_pages": return capResult(await executeGetRelatedPages(operatorId, args));
      case "get_activity_timeline": return capResult(await executeGetActivityTimeline(operatorId, args));
      case "search_communications": return capResult(await executeSearchCommunications(operatorId, args));
      case "search_documents": return capResult(await executeSearchDocuments(operatorId, args));
      case "get_cross_department_signals": return capResult(await executeGetCrossDepartmentSignals(operatorId, args));
      case "get_prior_situations": return capResult(await executeGetPriorSituations(operatorId, args));
      case "get_department_context": return capResult(await executeGetDomainContext(operatorId, args));
      case "get_org_structure": return capResult(await executeGetOrgStructure(operatorId));
      case "get_available_actions": return capResult(await executeGetAvailableActions(operatorId, args));
      case "read_wiki_page": return capResult(await executeReadWikiPage(operatorId, args));
      case "search_wiki": return capResult(await executeSearchWiki(operatorId, args));
      case "search_evidence": return capResult(await executeSearchEvidence(operatorId, args));
      case "get_contradictions": return capResult(await executeGetContradictions(operatorId, args));
      case "read_full_content": return capResult(await executeReadFullContent(operatorId, args));
      case "web_search": {
        const { webSearch, formatSearchResults } = await import("@/lib/web-search");
        const result = await webSearch(
          args.query as string,
          args.freshness ? { freshness: args.freshness as "day" | "week" | "month" } : undefined,
        );
        return capResult(formatSearchResults(result.results));
      }
      default: return `Unknown tool: "${toolName}". Available tools: ${REASONING_TOOLS.map(t => t.name).join(", ")}`;
    }
  } catch (err) {
    console.error(`[reasoning-tools] ${toolName} failed:`, err);
    return `Tool "${toolName}" encountered an error: ${err instanceof Error ? err.message : "unknown error"}. You may retry with different arguments or proceed with available evidence.`;
  }
}

// ── Group A: Wiki-based Tools ──────────────────────────────────────────────

async function executeGetRelatedPages(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const slug = String(args.slug ?? "");
  const page = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug, scope: "operator" },
    select: { crossReferences: true, title: true },
  });
  if (!page) return `Page "${slug}" not found.`;
  if (page.crossReferences.length === 0) return `Page "${page.title}" has no cross-references.`;

  const linked = await prisma.knowledgePage.findMany({
    where: { operatorId, slug: { in: page.crossReferences }, scope: "operator" },
    select: { slug: true, title: true, pageType: true, content: true },
  });

  if (linked.length === 0) return `Page "${page.title}" references ${page.crossReferences.length} pages, but none were found.`;

  return `## Pages linked from "${page.title}":\n\n` +
    linked.map(p => `- [[${p.slug}]] "${p.title}" [${p.pageType}]\n  ${p.content.slice(0, 200).replace(/\n/g, " ")}...`).join("\n\n");
}

async function executeGetOrgStructure(
  operatorId: string,
): Promise<string> {
  const hubs = await prisma.knowledgePage.findMany({
    where: { operatorId, scope: "operator", pageType: { in: ["company_overview", "domain_hub"] } },
    select: { slug: true, title: true, pageType: true, content: true },
    orderBy: { pageType: "asc" }, // company_overview first
  });

  if (hubs.length === 0) return "No organizational structure found in wiki.";

  return hubs.map(h => {
    const preview = h.content.slice(0, 500);
    return `## ${h.title} ([[${h.slug}]])\n${preview}...`;
  }).join("\n\n---\n\n");
}

// ── Group B: Context Assembly Wrappers ──────────────────────────────────────

async function executeGetActivityTimeline(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const query = String(args.query ?? "");
  const pageSlug = args.slug ? String(args.slug) : undefined;
  const days = typeof args.days === "number" ? args.days : 30;

  // 1. Resolve to a person page and read activity in one query if slug provided
  let page: { title: string; activityContent: string | null; activityUpdatedAt: Date | null } | null = null;

  if (pageSlug) {
    page = await prisma.knowledgePage.findFirst({
      where: { operatorId, slug: pageSlug, scope: "operator" },
      select: { title: true, activityContent: true, activityUpdatedAt: true },
    });
  }

  if (!page && query) {
    const resolvedSlug = await resolvePageSlug(operatorId, query, query);
    if (resolvedSlug) {
      page = await prisma.knowledgePage.findFirst({
        where: { operatorId, slug: resolvedSlug, scope: "operator" },
        select: { title: true, activityContent: true, activityUpdatedAt: true },
      });
    }
  }

  // 2. If we found a person page, read their activity section
  if (page?.activityContent) {
    const header = `Activity for ${page.title}${page.activityUpdatedAt ? ` (updated ${page.activityUpdatedAt.toISOString().split("T")[0]})` : ""}`;
    const trimmed = page.activityContent.length > 8000
      ? page.activityContent.slice(0, 8000) + "\n\n[... activity truncated, use search_communications for full details]"
      : page.activityContent;
    return `${header}\n\n${trimmed}`;
  }

  // 3. Fallback: search RawContent directly (no person page found, or activity section empty)
  const since = new Date(Date.now() - days * 86400000);
  const recent = await searchRawContent(operatorId, query, { limit: 15, since });

  if (recent.length === 0) return `No activity found for "${query}" in the last ${days} days.`;

  const lines: string[] = [`Activity for "${query}" (last ${days} days) — ${recent.length} items:`];
  for (const r of recent) {
    const meta = r.rawMetadata;
    const name = (meta.name as string) ?? (meta.subject as string) ?? (meta.fileName as string) ?? r.sourceId;
    lines.push(`\n[${r.sourceType}] ${r.occurredAt.toISOString().split("T")[0]} — ${name}`);
    lines.push((r.rawBody ?? "").slice(0, 200));
  }

  return lines.join("\n");
}

async function executeSearchCommunications(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const query = String(args.query ?? "");
  const limit = typeof args.limit === "number" ? args.limit : 8;

  const comms = await loadCommunicationContext(operatorId, query, limit);

  if (comms.excerpts.length === 0) return `No communications found matching "${query}".`;

  const lines: string[] = [`Found ${comms.excerpts.length} communication excerpts:`];

  for (const excerpt of comms.excerpts) {
    const meta = excerpt.metadata;
    const header = [
      `[${excerpt.sourceType}]`,
      meta.subject ? `Subject: ${meta.subject}` : meta.channel ? `Channel: ${meta.channel}` : null,
      meta.sender ? `From: ${meta.sender}` : null,
      meta.timestamp ? `Date: ${meta.timestamp}` : null,
      meta.direction ? `(${meta.direction})` : null,
      `Score: ${excerpt.score.toFixed(2)}`,
    ].filter(Boolean).join(" | ");
    lines.push(`\n${header}`);
    lines.push(excerpt.content.slice(0, 500));
  }

  return lines.join("\n");
}

async function executeSearchDocuments(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const query = String(args.query ?? "");
  const limit = typeof args.limit === "number" ? args.limit : 8;

  const results = await searchRawContent(operatorId, query, { limit });

  if (results.length === 0) return `No documents found matching "${query}".`;

  const lines: string[] = [`Found ${results.length} documents:`];

  for (const r of results) {
    const meta = r.rawMetadata;
    const sourceName = (meta.name as string) ?? (meta.fileName as string) ?? r.sourceId;
    lines.push(`\n[${r.sourceType}] ${sourceName}`);
    lines.push((r.rawBody ?? "").slice(0, 500));
  }

  return lines.join("\n");
}

async function executeGetCrossDepartmentSignals(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const slug = String(args.slug ?? "");
  const page = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug, scope: "operator" },
    select: { title: true, crossReferences: true },
  });
  if (!page) return `Page "${slug}" not found.`;
  if (page.crossReferences.length === 0) return `Page "${page.title}" has no cross-references to departments.`;

  const hubs = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      slug: { in: page.crossReferences },
      scope: "operator",
      pageType: "domain_hub",
    },
    select: { slug: true, title: true, content: true },
  });

  if (hubs.length === 0) return `Page "${page.title}" has cross-references but none are department hubs.`;

  const lines: string[] = [`Cross-department connections for "${page.title}" — linked to ${hubs.length} department(s):`];
  for (const hub of hubs) {
    lines.push(`\n## ${hub.title} ([[${hub.slug}]])`);
    lines.push(hub.content.slice(0, 300).replace(/\n/g, " "));
  }

  return lines.join("\n");
}

async function executeGetPriorSituations(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const situationTypeSlug = args.situationTypeSlug ? String(args.situationTypeSlug) : undefined;
  const triggerPageSlug = args.triggerPageSlug ? String(args.triggerPageSlug) : undefined;
  const limit = typeof args.limit === "number" ? args.limit : 5;

  // Build AND conditions for JSONB property filters
  const propertyFilters: Array<{ properties: { path: string[]; equals: string } }> = [];
  if (situationTypeSlug) {
    propertyFilters.push({ properties: { path: ["situation_type"], equals: situationTypeSlug } });
  }
  if (triggerPageSlug) {
    propertyFilters.push({ properties: { path: ["trigger_page"], equals: triggerPageSlug } });
  }

  const pages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      pageType: "situation_instance",
      scope: "operator",
      ...(propertyFilters.length > 0 ? { AND: propertyFilters } : {}),
    },
    select: { slug: true, title: true, content: true, properties: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: limit * 2, // Fetch extra — status filter applied in JS (no JSONB "in" in Prisma)
  });

  // Filter to resolved/closed in JS (Prisma JSON path doesn't support "in" for status)
  const resolved = pages.filter(p => {
    const status = ((p.properties ?? {}) as Record<string, unknown>).status as string | undefined;
    return status === "resolved" || status === "closed";
  }).slice(0, limit);

  if (resolved.length === 0) return "No prior resolved situations found.";

  return resolved.map(p => {
    const pageProps = (p.properties ?? {}) as Record<string, unknown>;
    const outcomeMatch = p.content.match(/## Outcome Summary\n([\s\S]*?)(?=\n## |\n---|\Z)/);
    const outcome = outcomeMatch?.[1]?.trim()?.slice(0, 300) ?? "No outcome recorded";
    return `### [[${p.slug}]] ${p.title}\nResolved: ${(pageProps.resolved_at as string) ?? "unknown"}\n${outcome}`;
  }).join("\n\n");
}

async function executeGetDomainContext(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const slug = String(args.slug ?? "");
  let page = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug, scope: "operator", pageType: "domain_hub" },
    select: { slug: true, title: true, content: true },
  });

  if (!page) {
    page = await prisma.knowledgePage.findFirst({
      where: { operatorId, scope: "operator", pageType: "domain_hub", title: { contains: slug, mode: "insensitive" } },
      select: { slug: true, title: true, content: true },
    });
  }

  if (!page) return `Department "${slug}" not found in wiki.`;
  return `# ${page.title}\n\n${page.content}`;
}

async function executeGetAvailableActions(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const connectorProvider = args.connectorProvider ? String(args.connectorProvider) : undefined;

  const capabilities = await prisma.actionCapability.findMany({
    where: {
      operatorId,
      enabled: true,
      ...(connectorProvider ? { connector: { provider: connectorProvider } } : {}),
    },
    include: {
      connector: { select: { provider: true } },
    },
  });

  if (capabilities.length === 0) return "No enabled action capabilities found.";

  const lines: string[] = [`${capabilities.length} available actions:`];

  for (const cap of capabilities) {
    const schema = cap.inputSchema as Record<string, unknown> | null;
    let paramSummary = "";
    if (schema && typeof schema === "object" && "properties" in schema) {
      const props = schema.properties as Record<string, { type?: string }>;
      paramSummary = Object.entries(props)
        .map(([name, def]) => `${name}: ${def?.type ?? "unknown"}`)
        .join(", ");
    }
    const provider = cap.connector?.provider ?? "unknown";
    lines.push(`- ${cap.name} [${provider}]: ${cap.description ?? ""}${paramSummary ? ` (params: ${paramSummary})` : ""}`);
  }

  return lines.join("\n");
}

// ── Group D: Wiki Tools ───────────────────────────────────────────────────

async function executeReadWikiPage(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const slug = args.slug ? String(args.slug) : undefined;
  const subjectEntityId = args.subjectEntityId ? String(args.subjectEntityId) : undefined;
  const pageType = args.pageType ? String(args.pageType) : undefined;

  // Route 1: by entity ID
  if (subjectEntityId) {
    const page = await getPageForEntity(operatorId, subjectEntityId);
    if (!page) return `No wiki page found for entity ${subjectEntityId}. Try search_wiki instead.`;

    const statusNote = page.status !== "verified"
      ? `\n\nNote: This page is ${page.status} — information may be outdated or unverified.`
      : "";

    return `Wiki page: ${page.slug} (confidence: ${page.confidence.toFixed(2)})${statusNote}\n\n${page.content}`;
  }

  // Route 2: by slug (try operator-scoped, then system-scoped)
  if (slug) {
    let page = await prisma.knowledgePage.findUnique({
      where: { operatorId_slug: { operatorId, slug } },
      select: { content: true, status: true, confidence: true, slug: true, title: true, pageType: true, id: true, scope: true },
    });
    // Fallback: try system-scoped page (gated by intelligenceAccess)
    if (!page) {
      const operator = await prisma.operator.findUnique({
        where: { id: operatorId },
        select: { intelligenceAccess: true },
      });
      if (operator?.intelligenceAccess) {
        page = await prisma.knowledgePage.findFirst({
          where: { scope: "system", slug, status: { in: ["verified", "stale"] }, OR: [{ stagingStatus: null }, { stagingStatus: "approved" }] },
          select: { content: true, status: true, confidence: true, slug: true, title: true, pageType: true, id: true, scope: true },
        });
      }
    }

    if (!page) return `No wiki page found with slug "${slug}".`;
    if (page.status === "quarantined") return `Wiki page "${slug}" is quarantined (unreliable). Use raw data tools instead.`;

    // Increment use count (fire-and-forget)
    prisma.knowledgePage.update({
      where: { id: page.id },
      data: { reasoningUseCount: { increment: 1 } },
    }).catch(() => {});

    const statusNote = page.status !== "verified"
      ? `\n\nNote: This page is ${page.status} — information may be outdated or unverified.`
      : "";

    return `Wiki page: ${page.title} [${page.pageType}] (confidence: ${page.confidence.toFixed(2)})${statusNote}\n\n${page.content}`;
  }

  // Route 3: by pageType only (return first match)
  if (pageType) {
    const page = await prisma.knowledgePage.findFirst({
      where: { operatorId, scope: "operator", pageType, status: { in: ["verified", "stale"] } },
      orderBy: { confidence: "desc" },
      select: { content: true, status: true, confidence: true, slug: true, title: true, pageType: true },
    });

    if (!page) return `No wiki page of type "${pageType}" found.`;
    return `Wiki page: ${page.title} [${page.pageType}] (confidence: ${page.confidence.toFixed(2)})\n\n${page.content}`;
  }

  return "Please provide a slug, subjectEntityId, or pageType to read a wiki page.";
}

async function executeSearchWiki(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const query = String(args.query ?? "");
  const pageType = args.pageType ? String(args.pageType) : undefined;
  const scopeParam = args.scope ? String(args.scope) : "operator";
  const limit = typeof args.limit === "number" ? Math.min(args.limit, 10) : 5;

  if (!query) return "Please provide a search query.";

  // Operator-scoped search
  const operatorResults = (scopeParam === "operator" || scopeParam === "all")
    ? await searchPages(operatorId, query, { pageType, limit })
    : [];

  // System-scoped search (check intelligenceAccess gate)
  let systemResults: typeof operatorResults = [];
  if (scopeParam === "system" || scopeParam === "all") {
    const operator = await prisma.operator.findUnique({
      where: { id: operatorId },
      select: { intelligenceAccess: true },
    });
    if (operator?.intelligenceAccess) {
      systemResults = await searchSystemPages(query, { pageType, limit });
    }
  }

  const allResults = [...operatorResults, ...systemResults].slice(0, limit);

  if (allResults.length === 0) return `No wiki pages found matching "${query}". Try raw data tools (search_documents, search_communications, search_evidence).`;

  const lines: string[] = [`Found ${allResults.length} wiki pages:`];

  for (const r of allResults) {
    const statusTag = r.status !== "verified" ? ` [${r.status}]` : "";
    const scopeTag = "scope" in r && r.scope === "system" ? " [system]" : "";
    lines.push(`\n### ${r.title} [${r.pageType}]${statusTag}${scopeTag}`);
    lines.push(`Slug: ${r.slug} | Confidence: ${r.confidence.toFixed(2)}`);
    lines.push(r.contentPreview);
  }

  lines.push(`\nUse read_wiki_page with a slug to read the full page.`);

  return lines.join("\n");
}

// ── Group E: Evidence Registry Tools ──────────────────────────────────────────

async function executeSearchEvidence(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const query = String(args.query ?? "");
  const sourceType = args.sourceType ? String(args.sourceType) : undefined;
  const claimType = args.claimType ? String(args.claimType) : undefined;
  const maxResults = Math.min(typeof args.maxResults === "number" ? args.maxResults : 10, 30);

  // Use separate queries for with/without sourceType to keep parameterized safely
  const rows = sourceType
    ? await prisma.$queryRaw<Array<{ id: string; sourceChunkId: string; sourceType: string; extractions: unknown; extractedAt: Date }>>`
        SELECT ee.id, ee."sourceChunkId", ee."sourceType", ee.extractions, ee."extractedAt"
        FROM "EvidenceExtraction" ee
        WHERE ee."operatorId" = ${operatorId}
          AND ee."sourceType" = ${sourceType}
          AND ee.extractions::text ILIKE ${`%${query}%`}
        ORDER BY ee."extractedAt" DESC
        LIMIT ${maxResults}
      `
    : await prisma.$queryRaw<Array<{ id: string; sourceChunkId: string; sourceType: string; extractions: unknown; extractedAt: Date }>>`
        SELECT ee.id, ee."sourceChunkId", ee."sourceType", ee.extractions, ee."extractedAt"
        FROM "EvidenceExtraction" ee
        WHERE ee."operatorId" = ${operatorId}
          AND ee.extractions::text ILIKE ${`%${query}%`}
        ORDER BY ee."extractedAt" DESC
        LIMIT ${maxResults}
      `;

  if (rows.length === 0) return `No evidence found matching "${query}".`;

  // Post-process: filter to matching claims within each extraction
  const queryLower = query.toLowerCase();
  const lines: string[] = [`Found evidence in ${rows.length} extractions:`];

  for (const row of rows) {
    const claims = Array.isArray(row.extractions) ? row.extractions : [];
    const matchingClaims = claims.filter((c: any) => {
      const textMatch =
        c.claim?.toLowerCase().includes(queryLower) ||
        c.entities?.some((e: string) => e.toLowerCase().includes(queryLower));
      const typeMatch = !claimType || c.type === claimType;
      return textMatch && typeMatch;
    });

    if (matchingClaims.length === 0) continue;

    lines.push(`\n[${row.sourceType}] Chunk: ${row.sourceChunkId} (${row.extractedAt.toISOString().split("T")[0]})`);
    for (const c of matchingClaims) {
      const entities = c.entities?.length > 0 ? ` [${c.entities.join(", ")}]` : "";
      const nums = c.numbers?.length > 0
        ? ` | Numbers: ${c.numbers.map((n: any) => `${n.value} ${n.unit} (${n.context})`).join("; ")}`
        : "";
      lines.push(`  - [${c.type}] (${(c.confidence * 100).toFixed(0)}%) ${c.claim}${entities}${nums}`);
    }
  }

  return lines.join("\n");
}

async function executeGetContradictions(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const entityName = args.entityName ? String(args.entityName) : undefined;
  const maxResults = Math.min(typeof args.maxResults === "number" ? args.maxResults : 20, 50);

  let results = await findContradictions(operatorId);

  if (entityName) {
    const nameLower = entityName.toLowerCase();
    results = results.filter((e) => {
      const contras = e.contradictions as EvidenceContradiction[];
      return Array.isArray(contras) && contras.some(
        (c) =>
          c.claim.toLowerCase().includes(nameLower) ||
          c.counterclaim.toLowerCase().includes(nameLower),
      );
    });
  }

  results = results.slice(0, maxResults);

  if (results.length === 0) {
    return entityName
      ? `No contradictions found mentioning "${entityName}".`
      : "No contradictions detected in the evidence registry.";
  }

  const lines: string[] = [`Found contradictions in ${results.length} extractions:`];

  for (const row of results) {
    const contras = (row.contradictions as EvidenceContradiction[]) ?? [];
    lines.push(`\n[${row.sourceType}] Extraction: ${row.id}`);
    for (const c of contras) {
      if (entityName) {
        const nameLower = entityName.toLowerCase();
        if (
          !c.claim.toLowerCase().includes(nameLower) &&
          !c.counterclaim.toLowerCase().includes(nameLower)
        ) continue;
      }
      lines.push(`  Claim: "${c.claim}"`);
      lines.push(`  Contradicted by: "${c.counterclaim}"`);
      lines.push(`  Sources: ${c.claimSourceId} vs ${c.counterSourceId}`);
    }
  }

  return lines.join("\n");
}

async function executeReadFullContent(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const sourceId = String(args.chunkId ?? args.sourceId ?? "");

  const raw = await prisma.rawContent.findFirst({
    where: { operatorId, OR: [{ id: sourceId }, { sourceId }] },
    select: {
      sourceType: true,
      sourceId: true,
      rawBody: true,
      rawMetadata: true,
      occurredAt: true,
    },
  });

  if (!raw?.rawBody) return "Content not found or access denied.";

  const meta = (raw.rawMetadata ?? {}) as Record<string, unknown>;

  const header = [
    `Source: ${raw.sourceType}/${raw.sourceId}`,
    `Date: ${raw.occurredAt.toISOString().split("T")[0]}`,
    meta.subject ? `Subject: ${meta.subject}` : null,
    meta.from ? `From: ${meta.from}` : null,
    meta.channel ? `Channel: ${meta.channel}` : null,
    meta.fileName ? `File: ${meta.fileName}` : null,
  ].filter(Boolean).join(" | ");

  return `${header}\n\n${raw.rawBody}`;
}
