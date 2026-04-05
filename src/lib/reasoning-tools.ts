import { prisma } from "@/lib/db";
import type { AITool } from "@/lib/ai-provider";
import { getEntityContext, searchEntities } from "@/lib/entity-resolution";
import { searchAround, formatTraversalForAgent } from "@/lib/graph-traversal";
import { retrieveRelevantChunks } from "@/lib/rag/retriever";
import { embedChunks } from "@/lib/rag/embedder";
import {
  loadActivityTimeline,
  loadCommunicationContext,
  loadCrossDepartmentSignals,
  loadDepartmentContext,
  findRelevantDepartments,
} from "@/lib/context-assembly";
import { getWorkStreamContext } from "@/lib/workstreams";
import { getPageForEntity, searchPages, searchSystemPages } from "@/lib/wiki-engine";

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
    name: "lookup_entity",
    description:
      "Look up a single entity by name or ID. Returns full details: properties, relationships, recent mentions, and source system info.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Entity name, display name, or ID to look up",
        },
        typeSlug: {
          type: "string",
          description: "Optional entity type slug to narrow the search (e.g. 'contact', 'invoice', 'deal')",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_entities",
    description:
      "Search entities by keyword across names and property values. Returns a list of matching entities with key properties.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keyword (name or property value)",
        },
        typeSlug: {
          type: "string",
          description: "Filter by entity type slug (e.g. 'contact', 'company', 'invoice')",
        },
        category: {
          type: "string",
          description: "Filter by entity category",
          enum: ["foundational", "base", "internal", "digital", "external"],
        },
        limit: {
          type: "number",
          description: "Maximum results to return (default 10, max 50)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_around",
    description:
      "Graph traversal from a starting entity. Returns connected entities and relationships within the specified hop distance.",
    parameters: {
      type: "object",
      properties: {
        entityId: {
          type: "string",
          description: "Starting entity ID for graph traversal",
        },
        maxHops: {
          type: "number",
          description: "Maximum relationship hops from starting entity (default 1, max 3)",
        },
      },
      required: ["entityId"],
    },
  },
  {
    name: "get_activity_timeline",
    description:
      "Load behavioral activity timeline for an entity: email volume, meetings, Slack messages, document edits, and trend analysis over time.",
    parameters: {
      type: "object",
      properties: {
        entityId: {
          type: "string",
          description: "Entity ID to load activity for",
        },
        days: {
          type: "number",
          description: "Number of days to look back (default 30)",
        },
      },
      required: ["entityId"],
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
        entityId: {
          type: "string",
          description: "Optional entity ID to scope search to communications involving this entity",
        },
        departmentIds: {
          type: "array",
          items: { type: "string" },
          description: "Optional department IDs to scope search",
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
        departmentIds: {
          type: "array",
          items: { type: "string" },
          description: "Optional department IDs to scope search",
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
      "Load cross-department activity signals for an entity: email, meeting, and Slack activity broken down by department.",
    parameters: {
      type: "object",
      properties: {
        entityId: {
          type: "string",
          description: "Entity ID to analyze cross-department signals for",
        },
        days: {
          type: "number",
          description: "Number of days to look back (default 30)",
        },
      },
      required: ["entityId"],
    },
  },
  {
    name: "get_prior_situations",
    description:
      "Load previously resolved or closed situations, optionally filtered by type or trigger entity. Useful for understanding precedent and past outcomes.",
    parameters: {
      type: "object",
      properties: {
        situationTypeId: {
          type: "string",
          description: "Filter by situation type ID (also matches sibling types with the same archetype)",
        },
        triggerEntityId: {
          type: "string",
          description: "Filter to situations triggered by this entity",
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
      "Load department details: name, description, lead, and member count.",
    parameters: {
      type: "object",
      properties: {
        departmentId: {
          type: "string",
          description: "Department entity ID",
        },
      },
      required: ["departmentId"],
    },
  },
  {
    name: "find_departments_for_entity",
    description:
      "Find which departments are relevant for an entity based on its category, parent department, and relationship graph.",
    parameters: {
      type: "object",
      properties: {
        entityId: {
          type: "string",
          description: "Entity ID to find relevant departments for",
        },
      },
      required: ["entityId"],
    },
  },
  {
    name: "get_org_structure",
    description:
      "Load the organizational hierarchy: HQ, departments, and team members rendered as an ASCII tree with roles.",
    parameters: {
      type: "object",
      properties: {
        rootEntityName: {
          type: "string",
          description: "Optional entity name to use as tree root instead of the default HQ",
        },
      },
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
    name: "get_workstream_context",
    description:
      "Load workstream context for an entity: active workstreams containing situations related to this entity, with goals, status, and item details.",
    parameters: {
      type: "object",
      properties: {
        entityId: {
          type: "string",
          description: "Entity ID to find related workstreams for",
        },
      },
      required: ["entityId"],
    },
  },
  {
    name: "read_wiki_page",
    description:
      "Read a knowledge page from the organizational wiki. Wiki pages contain synthesized intelligence about entities, processes, patterns, and topics — richer and more cross-referenced than raw data lookups. Use this when you need deep context about an entity or topic.",
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
          description: "Optional: filter by page type (entity_profile, process_description, financial_pattern, communication_pattern, situation_pattern, department_overview, topic_synthesis)",
        },
      },
      required: [],
    },
  },
  {
    name: "search_wiki",
    description:
      "Search the organizational wiki for relevant knowledge pages. Use scope 'system' to search general professional knowledge and best practices, or 'all' to search both.",
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
];

// ── Dispatch ────────────────────────────────────────────────────────────────

export async function executeReasoningTool(
  operatorId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    switch (toolName) {
      case "lookup_entity": return capResult(await executeLookupEntity(operatorId, args));
      case "search_entities": return capResult(await executeSearchEntities(operatorId, args));
      case "search_around": return capResult(await executeSearchAround(operatorId, args));
      case "get_activity_timeline": return capResult(await executeGetActivityTimeline(operatorId, args));
      case "search_communications": return capResult(await executeSearchCommunications(operatorId, args));
      case "search_documents": return capResult(await executeSearchDocuments(operatorId, args));
      case "get_cross_department_signals": return capResult(await executeGetCrossDepartmentSignals(operatorId, args));
      case "get_prior_situations": return capResult(await executeGetPriorSituations(operatorId, args));
      case "get_department_context": return capResult(await executeGetDepartmentContext(operatorId, args));
      case "find_departments_for_entity": return capResult(await executeFindDepartmentsForEntity(operatorId, args));
      case "get_org_structure": return capResult(await executeGetOrgStructure(operatorId, args));
      case "get_available_actions": return capResult(await executeGetAvailableActions(operatorId, args));
      case "get_workstream_context": return capResult(await executeGetWorkstreamContext(operatorId, args));
      case "read_wiki_page": return capResult(await executeReadWikiPage(operatorId, args));
      case "search_wiki": return capResult(await executeSearchWiki(operatorId, args));
      default: return `Unknown tool: "${toolName}". Available tools: ${REASONING_TOOLS.map(t => t.name).join(", ")}`;
    }
  } catch (err) {
    console.error(`[reasoning-tools] ${toolName} failed:`, err);
    return `Tool "${toolName}" encountered an error: ${err instanceof Error ? err.message : "unknown error"}. You may retry with different arguments or proceed with available evidence.`;
  }
}

// ── Group A: Entity & Graph Tools ───────────────────────────────────────────
// Reuse copilot patterns from ai-copilot.ts, WITHOUT department scope filtering.
// The reasoning engine has full operator access.

async function executeLookupEntity(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const query = String(args.query ?? "");
  const typeSlug = args.typeSlug ? String(args.typeSlug) : undefined;
  const context = await getEntityContext(operatorId, query, typeSlug);
  if (!context) return `No entity found matching "${query}".`;

  const propsStr = Object.entries(context.properties)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");
  const relsStr = context.relationships
    .map((r) => `  ${r.direction === "from" ? "-->" : "<--"} [${r.relationshipType}] ${r.entityName}`)
    .join("\n");
  const mentionsStr = context.recentMentions.slice(0, 5)
    .map((m) => `  ${m.sourceType}/${m.sourceId}${m.snippet ? `: "${m.snippet}"` : ""}`)
    .join("\n");

  return [
    `Entity: ${context.displayName} [${context.typeName}]`,
    `ID: ${context.id}`,
    `Status: ${context.status}`,
    context.sourceSystem ? `Source: ${context.sourceSystem} (${context.externalId})` : null,
    propsStr ? `Properties:\n${propsStr}` : null,
    relsStr ? `Relationships:\n${relsStr}` : null,
    mentionsStr ? `Recent Mentions:\n${mentionsStr}` : null,
  ].filter(Boolean).join("\n");
}

async function executeSearchEntities(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const query = String(args.query ?? "");
  const typeSlug = args.typeSlug ? String(args.typeSlug) : undefined;
  const category = args.category ? String(args.category) : undefined;
  const limit = typeof args.limit === "number" ? args.limit : 10;
  let results = await searchEntities(operatorId, query, typeSlug, limit);

  if (category) {
    const ids = results.map((r) => r.id);
    const withCategory = await prisma.entity.findMany({
      where: { id: { in: ids }, category },
      select: { id: true },
    });
    const categoryIds = new Set(withCategory.map((e) => e.id));
    results = results.filter((r) => categoryIds.has(r.id));
  }

  if (results.length === 0) return `No entities found matching "${query}".`;

  return results.map((e) => {
    const props = Object.entries(e.properties).slice(0, 4)
      .map(([k, v]) => `${k}=${v}`).join(", ");
    return `- ${e.displayName} [${e.typeName}] (${e.id})${props ? ` {${props}}` : ""}`;
  }).join("\n");
}

async function executeSearchAround(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const entityId = String(args.entityId ?? "");
  const maxHops = typeof args.maxHops === "number" ? Math.min(args.maxHops, 3) : 1;

  const result = await searchAround(operatorId, entityId, maxHops);
  if (result.nodes.length === 0) return "No entities found in graph traversal.";

  return formatTraversalForAgent(result);
}

async function executeGetOrgStructure(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const rootEntityName = args.rootEntityName ? String(args.rootEntityName) : undefined;

  // Find root entity
  let root: { id: string; displayName: string } | null = null;
  if (rootEntityName) {
    root = await prisma.entity.findFirst({
      where: { operatorId, displayName: { contains: rootEntityName }, status: "active" },
      select: { id: true, displayName: true },
    });
  }
  if (!root) {
    root = await prisma.entity.findFirst({
      where: { operatorId, category: "foundational", entityType: { slug: "organization" }, status: "active" },
      select: { id: true, displayName: true },
    });
  }
  if (!root) return "No organization found. Complete onboarding first.";

  const departments = await prisma.entity.findMany({
    where: { operatorId, category: "foundational", entityType: { slug: "department" }, status: "active" },
    select: { id: true, displayName: true, description: true },
    orderBy: { displayName: "asc" },
  });

  if (departments.length === 0) return `${root.displayName}\n  (no departments)`;

  const lines: string[] = [root.displayName];

  for (let di = 0; di < departments.length; di++) {
    const dept = departments[di];
    const isLast = di === departments.length - 1;
    const prefix = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    const desc = dept.description ? ` — ${dept.description}` : "";
    lines.push(`${prefix}${dept.displayName}${desc}`);

    const homeMembers = await prisma.entity.findMany({
      where: { operatorId, parentDepartmentId: dept.id, category: "base", status: "active" },
      include: {
        propertyValues: { include: { property: { select: { slug: true } } } },
      },
      orderBy: { displayName: "asc" },
    });

    const crossRels = await prisma.relationship.findMany({
      where: {
        OR: [
          { toEntityId: dept.id, relationshipType: { slug: "department-member" }, fromEntity: { category: "base", status: "active" } },
          { fromEntityId: dept.id, relationshipType: { slug: "department-member" }, toEntity: { category: "base", status: "active" } },
        ],
      },
      select: { fromEntityId: true, toEntityId: true, metadata: true },
    });
    const homeMemberIds = new Set(homeMembers.map((m) => m.id));
    const crossIds = crossRels
      .map((r) => r.fromEntityId === dept.id ? r.toEntityId : r.fromEntityId)
      .filter((cid) => !homeMemberIds.has(cid));
    const crossMembers = crossIds.length > 0
      ? await prisma.entity.findMany({
          where: { id: { in: crossIds }, status: "active" },
          include: { propertyValues: { include: { property: { select: { slug: true } } } } },
          orderBy: { displayName: "asc" },
        })
      : [];

    const allMembers = [...homeMembers, ...crossMembers];
    for (let mi = 0; mi < allMembers.length; mi++) {
      const m = allMembers[mi];
      const mIsLast = mi === allMembers.length - 1;
      const mPrefix = mIsLast ? "└── " : "├── ";
      const crossRel = crossRels.find((r) => r.fromEntityId === m.id || r.toEntityId === m.id);
      const crossRole = crossRel?.metadata ? JSON.parse(crossRel.metadata as string).role : null;
      const role = crossRole || m.propertyValues.find((pv) => pv.property.slug === "role")?.value;
      const roleStr = role ? ` (${role})` : "";
      const crossTag = crossRel ? " [shared]" : "";
      lines.push(`${childPrefix}${mPrefix}${m.displayName}${roleStr}${crossTag}`);
    }
  }

  return lines.join("\n");
}

// ── Group B: Context Assembly Wrappers ──────────────────────────────────────

async function executeGetActivityTimeline(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const entityId = String(args.entityId ?? "");
  const days = typeof args.days === "number" ? args.days : 30;

  const timeline = await loadActivityTimeline(operatorId, entityId, [], days);

  if (timeline.buckets.length === 0) return `No activity found for entity ${entityId} in the last ${days} days.`;

  const lines: string[] = [
    `Activity Timeline (${days} days) — ${timeline.totalSignals} total signals — Trend: ${timeline.trend}`,
    "",
  ];

  for (const bucket of timeline.buckets) {
    const parts: string[] = [];
    if (bucket.emailSent > 0 || bucket.emailReceived > 0)
      parts.push(`email: ${bucket.emailSent} sent / ${bucket.emailReceived} received`);
    if (bucket.meetingsHeld > 0)
      parts.push(`meetings: ${bucket.meetingsHeld}${bucket.meetingMinutes > 0 ? ` (${bucket.meetingMinutes} min)` : ""}`);
    if (bucket.slackMessages > 0)
      parts.push(`slack: ${bucket.slackMessages}`);
    if (bucket.docsEdited > 0 || bucket.docsCreated > 0)
      parts.push(`docs: ${bucket.docsCreated} created / ${bucket.docsEdited} edited`);
    if (bucket.avgResponseTimeHours != null)
      parts.push(`avg response: ${bucket.avgResponseTimeHours.toFixed(1)}h`);

    if (parts.length > 0) {
      lines.push(`${bucket.period}: ${parts.join(" | ")}`);
    }
  }

  return lines.join("\n");
}

async function executeSearchCommunications(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const query = String(args.query ?? "");
  const entityId = args.entityId ? String(args.entityId) : undefined;
  const departmentIds = Array.isArray(args.departmentIds) ? args.departmentIds.map(String) : [];
  const limit = typeof args.limit === "number" ? args.limit : 8;

  // Pre-validate that embedding works before calling the heavier loader
  const [embedding] = await embedChunks([query]);
  if (!embedding) return "Could not process search query.";

  const comms = await loadCommunicationContext(operatorId, entityId ?? "", query, departmentIds, limit);

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
  const departmentIds = Array.isArray(args.departmentIds) ? args.departmentIds.map(String) : undefined;
  const limit = typeof args.limit === "number" ? args.limit : 8;

  const [embedding] = await embedChunks([query]);
  if (!embedding) return "Could not process search query.";

  const chunks = await retrieveRelevantChunks(operatorId, embedding, {
    limit,
    sourceTypes: ["document", "drive_file", "spreadsheet", "slide_presentation"],
    departmentIds,
    skipUserFilter: true,
  });

  if (chunks.length === 0) return `No documents found matching "${query}".`;

  const lines: string[] = [`Found ${chunks.length} document chunks:`];

  for (const chunk of chunks) {
    const sourceName = chunk.metadata && typeof chunk.metadata === "object" && "name" in chunk.metadata
      ? String(chunk.metadata.name)
      : chunk.sourceId;
    lines.push(`\n[${chunk.sourceType}] ${sourceName} — Score: ${chunk.score.toFixed(2)}`);
    lines.push(chunk.content.slice(0, 500));
  }

  return lines.join("\n");
}

async function executeGetCrossDepartmentSignals(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const entityId = String(args.entityId ?? "");
  const days = typeof args.days === "number" ? args.days : 30;

  const entity = await prisma.entity.findFirst({
    where: { id: entityId, operatorId },
    select: { category: true },
  });

  const signals = await loadCrossDepartmentSignals(
    operatorId, entityId, entity?.category ?? null, [], days,
  );

  if (signals.signals.length === 0) return `No cross-department signals found for entity ${entityId} in the last ${days} days.`;

  const lines: string[] = [`Cross-department signals (${days} days):`];

  for (const signal of signals.signals) {
    const parts: string[] = [];
    if (signal.emailCount > 0) parts.push(`${signal.emailCount} emails`);
    if (signal.meetingCount > 0) parts.push(`${signal.meetingCount} meetings`);
    if (signal.slackMentions > 0) parts.push(`${signal.slackMentions} slack mentions`);
    const lastActive = signal.lastActivityDate ? ` (last: ${signal.lastActivityDate})` : "";
    lines.push(`- ${signal.departmentName}: ${parts.join(", ")}${lastActive}`);
  }

  return lines.join("\n");
}

async function executeGetPriorSituations(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const situationTypeId = args.situationTypeId ? String(args.situationTypeId) : undefined;
  const triggerEntityId = args.triggerEntityId ? String(args.triggerEntityId) : undefined;
  const limit = typeof args.limit === "number" ? args.limit : 5;

  // If situationTypeId provided, also find sibling types with the same archetype
  let typeIds: string[] | undefined;
  if (situationTypeId) {
    const sourceType = await prisma.situationType.findFirst({
      where: { id: situationTypeId, operatorId },
      select: { archetypeSlug: true },
    });
    if (sourceType?.archetypeSlug) {
      const siblings = await prisma.situationType.findMany({
        where: { operatorId, archetypeSlug: sourceType.archetypeSlug },
        select: { id: true },
      });
      typeIds = siblings.map((s) => s.id);
    } else {
      typeIds = [situationTypeId];
    }
  }

  const situations = await prisma.situation.findMany({
    where: {
      operatorId,
      status: { in: ["resolved", "closed"] },
      ...(typeIds ? { situationTypeId: { in: typeIds } } : {}),
      ...(triggerEntityId ? { triggerEntityId } : {}),
    },
    include: {
      situationType: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  if (situations.length === 0) return "No prior resolved/closed situations found matching the criteria.";

  const lines: string[] = [`Found ${situations.length} prior situations:`];

  for (const s of situations) {
    const reasoning = s.reasoning ? String(s.reasoning).slice(0, 300) : "N/A";
    const action = s.actionTaken ? String(s.actionTaken).slice(0, 200) : "none";
    lines.push(`\n[${s.situationType.name}] Created: ${s.createdAt.toISOString().split("T")[0]}`);
    lines.push(`  Outcome: ${s.outcome ?? "unknown"}`);
    if (s.feedback) lines.push(`  Feedback: ${s.feedback} (rating: ${s.feedbackRating ?? "N/A"})`);
    lines.push(`  Reasoning: ${reasoning}`);
    lines.push(`  Action taken: ${action}`);
  }

  return lines.join("\n");
}

async function executeGetDepartmentContext(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const departmentId = String(args.departmentId ?? "");
  const dept = await loadDepartmentContext(operatorId, departmentId);

  const lines: string[] = [
    `Department: ${dept.name}`,
    dept.description ? `Description: ${dept.description}` : null,
    dept.lead ? `Lead: ${dept.lead.name} (${dept.lead.role})` : "Lead: none assigned",
    `Members: ${dept.memberCount}`,
  ].filter(Boolean) as string[];

  return lines.join("\n");
}

async function executeFindDepartmentsForEntity(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const entityId = String(args.entityId ?? "");

  const entity = await prisma.entity.findFirst({
    where: { id: entityId, operatorId },
    select: { category: true, parentDepartmentId: true },
  });

  const deptIds = await findRelevantDepartments(
    operatorId, entityId, entity?.category ?? null, entity?.parentDepartmentId ?? null,
  );

  if (deptIds.length === 0) return `No relevant departments found for entity ${entityId}.`;

  const depts = await prisma.entity.findMany({
    where: { id: { in: deptIds } },
    select: { id: true, displayName: true },
  });

  return depts.map((d) => `- ${d.displayName} (${d.id})`).join("\n");
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

async function executeGetWorkstreamContext(
  operatorId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const entityId = String(args.entityId ?? "");

  // Find situations triggered by this entity, then find workstreams containing them
  const situations = await prisma.situation.findMany({
    where: { operatorId, triggerEntityId: entityId },
    select: { id: true },
  });

  if (situations.length === 0) return `No workstreams found for entity ${entityId}.`;

  const situationIds = situations.map((s) => s.id);
  const wsItems = await prisma.workStreamItem.findMany({
    where: { itemType: "situation", itemId: { in: situationIds } },
    select: { workStreamId: true },
  });

  const uniqueWsIds = [...new Set(wsItems.map((i) => i.workStreamId))];
  if (uniqueWsIds.length === 0) return `No workstreams found for entity ${entityId}.`;

  const lines: string[] = [];

  for (const wsId of uniqueWsIds) {
    const ws = await getWorkStreamContext(wsId);
    if (!ws) continue;

    lines.push(`Workstream: ${ws.title}`);
    if (ws.description) lines.push(`  Description: ${ws.description}`);
    lines.push(`  Status: ${ws.status}`);
    if (ws.goal) lines.push(`  Goal: ${ws.goal.title}${ws.goal.description ? ` — ${ws.goal.description}` : ""}`);
    if (ws.items.length > 0) {
      lines.push(`  Items (${ws.items.length}):`);
      for (const item of ws.items) {
        lines.push(`    - [${item.type}] ${item.summary} (${item.status})`);
      }
    }
    if (ws.parent) lines.push(`  Parent: ${ws.parent.title} (${ws.parent.itemCount} items)`);
    lines.push("");
  }

  return lines.join("\n").trim();
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
    if (!page) return `No wiki page found for entity ${subjectEntityId}. Try using lookup_entity for raw data.`;

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
          where: { scope: "system", slug, status: { in: ["verified", "stale"] } },
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

  if (allResults.length === 0) return `No wiki pages found matching "${query}". Try raw data tools (search_entities, search_documents, search_communications).`;

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
