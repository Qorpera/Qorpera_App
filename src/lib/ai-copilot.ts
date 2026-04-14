import { prisma } from "@/lib/db";
import { callLLM, streamLLM, getModel, type AIMessage, type AITool, type LLMMessage } from "@/lib/ai-provider";
import { getBusinessContext, formatBusinessContext } from "@/lib/business-context";
import { buildOrientationSystemPrompt, buildDomainDataContext } from "@/lib/orientation-prompts";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";
import { getProvider } from "@/lib/connectors/registry";
import { decryptConfig, encryptConfig } from "@/lib/config-encryption";
import { canAccessEntity } from "@/lib/domain-scope";
import { buildSystemJobWikiContent } from "@/lib/system-job-wiki";

// ── Types ────────────────────────────────────────────────────────────────────

export type OrientationInfo = {
  sessionId: string;
  phase: "orienting";
} | null;

// ── Tool Definitions ─────────────────────────────────────────────────────────

const COPILOT_TOOLS: AITool[] = [
  {
    name: "get_related_pages",
    description: "Get all pages linked from a wiki page. Shows connections, relationships, and related context.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Wiki page slug to explore connections from" },
      },
      required: ["slug"],
    },
  },
  {
    name: "execute_connector_action",
    description: "Execute an action through a connected tool (e.g., send email via HubSpot, update a contact, change a deal stage). Use when proposing or executing a specific action in an external system.",
    parameters: {
      type: "object",
      properties: {
        action_name: { type: "string", description: "Name of the action capability (e.g., 'send_email', 'update_contact', 'create_note', 'update_deal_stage')" },
        params: { type: "object", description: "Parameters for the action, matching the action's input schema" },
      },
      required: ["action_name", "params"],
    },
  },
  {
    name: "create_wiki_page",
    description: "Create a new wiki page for a person, process, project, or other organizational object.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "URL-safe slug (e.g., person-mark-jensen, process-invoice-approval)" },
        title: { type: "string", description: "Page title" },
        page_type: { type: "string", enum: ["entity_profile", "process_description", "project", "domain_hub", "domain_overview", "topic_synthesis", "situation_type", "relationship_map"], description: "Page type" },
        content: { type: "string", description: "Page content in markdown. Use [[slug]] for cross-references to other pages." },
      },
      required: ["slug", "title", "page_type", "content"],
    },
  },
  {
    name: "set_situation_scope",
    description: "Scope a situation type to only fire for entities connected to a specific anchor entity within a given depth. Useful for limiting detection to a team, department, or region.",
    parameters: {
      type: "object",
      properties: {
        situationTypeSlug: { type: "string", description: "Slug of the situation type to scope" },
        scopeEntityName: { type: "string", description: "Display name of the anchor entity" },
        scopeDepth: { type: "number", description: "Max hops from anchor (default: unlimited)" },
      },
      required: ["situationTypeSlug", "scopeEntityName"],
    },
  },
  {
    name: "get_org_structure",
    description: "Get the organizational structure tree. Optionally start from a specific root entity, or discover all organization-type entities as roots.",
    parameters: {
      type: "object",
      properties: {
        rootEntityName: { type: "string", description: "Optional root entity name. If omitted, finds all organization-type entities." },
      },
    },
  },
  {
    name: "get_operational_briefing",
    description: "Get a summary of current operational status across departments. Shows active situations, pending actions, and key metrics grouped by department. Use when user asks 'how are things', 'what's the status', 'give me an update', 'any issues today'.",
    parameters: {
      type: "object",
      properties: {
        domainName: {
          type: "string",
          description: "Optional: focus on a specific department by name. If omitted, briefing covers all visible departments.",
        },
        period: {
          type: "string",
          enum: ["today", "week", "month"],
          description: "Time period to cover. Defaults to 'week'.",
        },
      },
    },
  },
  {
    name: "search_department_knowledge",
    description: "Search wiki pages within a department. Finds pages that cross-reference the department hub, optionally filtered by keyword.",
    parameters: {
      type: "object",
      properties: {
        department_slug: { type: "string", description: "Department wiki page slug (domain hub)" },
        query: { type: "string", description: "Optional: keyword to filter results" },
      },
      required: ["department_slug"],
    },
  },
  {
    name: "create_situation_type",
    description: "Create a new situation type that the system will watch for. When creating a situation type, always specify which department it applies to using scopeDomainName. For example, if the user says 'overdue invoices are a problem in Finance', set scopeDomainName to 'Finance'.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable name" },
        slug: { type: "string", description: "Kebab-case identifier" },
        description: { type: "string", description: "Natural language description of the situation" },
        detectionLogic: {
          type: "object",
          description: "Detection configuration. Must include mode (structured/natural/hybrid). For structured/hybrid: include structured.entityType (the entity type slug to scan, e.g. 'invoice', 'deal', 'contact') and structured.signals array. For natural: include naturalLanguage description of what to detect.",
          properties: {
            mode: { type: "string", description: "Detection mode: structured, natural, or hybrid" },
            structured: { type: "object", description: "Structured detection rules (signals, thresholds)" },
            naturalLanguage: { type: "string", description: "Natural language description of what to watch for" },
          },
        },
        responseStrategy: {
          type: "object",
          description: "Default response steps when this situation is detected",
        },
        scopeEntityId: { type: "string", description: "ID of the department entity to scope this situation type to" },
        scopeDomainName: { type: "string", description: "Name of the department to scope this situation type to. If provided without scopeEntityId, the department will be resolved by name." },
      },
      required: ["name", "slug", "description", "detectionLogic"],
    },
  },
  {
    name: "list_departments",
    description: "List all departments with member counts and connected data summary.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_department_context",
    description: "Get detailed context about a specific department including members, documents, connected data, and recent situations.",
    parameters: {
      type: "object",
      properties: {
        domainName: { type: "string", description: "Name of the department" },
      },
      required: ["domainName"],
    },
  },
  {
    name: "search_emails",
    description: "Search email content from Gmail and Outlook. Returns relevant email excerpts matching the query from all connected email accounts.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query — keywords, person names, topics, etc." },
        limit: { type: "number", description: "Max results (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_email_thread",
    description: "Get the full email thread by thread ID. Returns all messages in the thread in chronological order.",
    parameters: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "Gmail thread ID" },
      },
      required: ["threadId"],
    },
  },
  {
    name: "search_documents",
    description: "Search documents from Google Drive and OneDrive. Returns relevant excerpts from synced documents including Docs, Sheets, Slides, Word, Excel, and PowerPoint files.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_messages",
    description: "Search Slack and Microsoft Teams messages. Returns relevant message excerpts matching the query from connected workspaces and teams.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query — keywords, channel names, person names, topics" },
        limit: { type: "number", description: "Max results (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_message_thread",
    description: "Get a full message thread from Slack or Teams. Returns all messages in the thread in chronological order.",
    parameters: {
      type: "object",
      properties: {
        threadId: { type: "string", description: "Thread identifier (Slack thread_ts or Teams message ID)" },
        sourceType: { type: "string", description: "Source: 'slack_message' or 'teams_message'" },
      },
      required: ["threadId"],
    },
  },
  {
    name: "get_activity_summary",
    description: "Get a summary of recent activity for an entity or department. Shows email volume, meeting frequency, document activity, and trends over time. Use when user asks 'how's activity', 'what's been happening', 'show me trends'.",
    parameters: {
      type: "object",
      properties: {
        entityName: { type: "string", description: "Entity name to get activity for (person, company, department). If omitted, shows operator-wide summary." },
        days: { type: "number", description: "Number of days to look back (default 30)" },
      },
    },
  },
  {
    name: "get_initiatives",
    description: "Get AI-proposed initiatives and their progress. Use when the user asks what the AI has proposed, what strategic work is happening, or about department AI activity.",
    parameters: {
      type: "object",
      properties: {
        domainId: { type: "string", description: "Filter to a specific department." },
        status: { type: "string", enum: ["proposed", "approved", "executing", "completed", "rejected"], description: "Initiative status filter." },
      },
    },
  },
  {
    name: "create_system_job",
    description: "Create a new system job that runs on a schedule to monitor and analyze a specific area. Use when the user wants to set up automated monitoring, intelligence gathering, or periodic analysis.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title for the job" },
        description: { type: "string", description: "Detailed description of what this job monitors and investigates" },
        cronExpression: { type: "string", description: "Cron expression for schedule (e.g., '0 8 * * 1' for every Monday at 8am)" },
        scope: { type: "string", enum: ["domain", "company_wide"], description: "Scope of the job. Default: company_wide" },
        domainEntityId: { type: "string", description: "ID of the department (foundational entity) this job is scoped to. If not provided, uses the first available department." },
      },
      required: ["title", "description", "cronExpression"],
    },
  },
  {
    name: "get_insights",
    description: "Get what the AI has learned from experience. Use when the user asks 'what has the AI learned', 'what works best for X', patterns, or effectiveness data.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search against insight descriptions (substring match)." },
        domainId: { type: "string", description: "Filter by department." },
        insightType: { type: "string", enum: ["approach_effectiveness", "timing_pattern", "entity_preference", "escalation_pattern", "resolution_pattern"], description: "Filter by insight type." },
      },
    },
  },
  {
    name: "get_priorities",
    description: "Get the highest-priority items needing attention. Use when the user asks 'what should I work on', 'what's most urgent', 'priorities', or 'what needs attention'.",
    parameters: {
      type: "object",
      properties: {
        n: { type: "number", description: "Number of items to return (default 5, max 20)." },
      },
    },
  },
  {
    name: "search_wiki",
    description: "Search the knowledge wiki. Use scope 'operator' for this company's specific knowledge (people, processes, financials, patterns). Use scope 'system' for practitioner reference material — benchmarks, regional practice specifics, empirical patterns, red flag heuristics. The system reference library is supplementary — consult it when you need specific thresholds or practitioner insights. Use 'all' to search both layers.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query — topic, entity name, concept, or domain" },
        scope: { type: "string", enum: ["operator", "system", "all"], description: "Which knowledge layer. Default: operator" },
        limit: { type: "number", description: "Max results (default 5, max 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "read_wiki_page",
    description: "Read a knowledge page by slug. Pages contain synthesized intelligence — company-specific context (operator) or practitioner reference material (system). Cross-references like [[slug]] link to related pages.",
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Page slug from search_wiki results or cross-references in other pages" },
      },
      required: ["slug"],
    },
  },
  {
    name: "search_evidence",
    description: "Search the evidence registry for specific factual claims extracted from raw data sources. Returns individual claims with confidence scores and source attribution. More precise than document search.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query — a claim, entity name, number, or topic" },
        maxResults: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "web_search",
    description: "Search the web for current information — regulations, market data, company news, industry benchmarks, anything that changes over time. Use when you need facts you're not confident about or that might be more current than your training.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query — keep specific and concise" },
        freshness: { type: "string", enum: ["day", "week", "month"], description: "Optional: restrict to recent results" },
      },
      required: ["query"],
    },
  },
];

const ORIENTATION_TOOLS: AITool[] = [
  {
    name: "create_retrospective_situation",
    description: "Record a retrospective example of a past situation the user describes. Used during orientation to learn from past experiences.",
    parameters: {
      type: "object",
      properties: {
        situationTypeId: { type: "string", description: "ID of the situation type this is an example of" },
        entityDescription: { type: "string", description: "Describes the entity involved, e.g. 'Acme Corp invoice #1234'" },
        summary: { type: "string", description: "What happened in 1-2 sentences" },
        actionTaken: { type: "string", description: "What the user did" },
        outcome: { type: "string", description: "positive, negative, or neutral" },
        outcomeDetails: { type: "string", description: "More detail on the result" },
      },
      required: ["situationTypeId", "entityDescription", "summary", "actionTaken", "outcome"],
    },
  },
];

// ── Context-Scoped Tool Selection ────────────────────────────────────────────

const CONTEXT_EXCLUDED_TOOLS: Record<string, Set<string>> = {
  situation: new Set(["create_situation_type", "list_departments", "get_org_structure"]),
  initiative: new Set(["create_situation_type", "list_departments", "get_org_structure"]),
};

export function getToolsForContext(contextType: string | null): typeof COPILOT_TOOLS {
  if (!contextType || !CONTEXT_EXCLUDED_TOOLS[contextType]) return COPILOT_TOOLS;
  const excluded = CONTEXT_EXCLUDED_TOOLS[contextType];
  return COPILOT_TOOLS.filter(t => !excluded.has(t.name));
}

// ── System Prompt Builder ────────────────────────────────────────────────────

async function buildSystemPrompt(operatorId: string, userRole?: string, scopeInfo?: { userName?: string; domainName?: string; visibleDomains: string[] | "all" }, injectedContext?: string): Promise<string> {
  const visibleDomains = scopeInfo?.visibleDomains;
  const situationScopeWhere = visibleDomains && visibleDomains !== "all"
    ? { OR: [{ situationType: { scopeEntityId: { in: visibleDomains } } }, { situationType: { scopeEntityId: null } }] }
    : {};
  const situationTypeScopeWhere = visibleDomains && visibleDomains !== "all"
    ? { OR: [{ scopeEntityId: { in: visibleDomains } }, { scopeEntityId: null }] }
    : {};

  const [entityTypes, businessCtx, situationTypes, unreadNotifCount, pendingSituations, deptContext] = await Promise.all([
    prisma.entityType.findMany({
      where: { operatorId },
      include: { _count: { select: { entities: true } } },
      orderBy: { name: "asc" },
    }),
    getBusinessContext(operatorId),
    prisma.situationType.findMany({
      where: { operatorId, enabled: true, ...situationTypeScopeWhere },
      select: { name: true, slug: true, description: true, autonomyLevel: true },
    }),
    prisma.notification.count({ where: { operatorId, read: false } }),
    prisma.knowledgePage.findMany({
      where: {
        operatorId,
        pageType: "situation_instance",
        scope: "operator",
        NOT: { properties: { path: ["status"], string_contains: "resolved" } },
      },
      select: { title: true, properties: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }).then(pages => pages
      .filter(p => {
        const props = (p.properties ?? {}) as Record<string, unknown>;
        const status = props.status as string | undefined;
        return !status || ["proposed", "detected"].includes(status);
      })
      .slice(0, 5)
      .map(p => {
        const props = (p.properties ?? {}) as Record<string, unknown>;
        return {
          status: (props.status as string) ?? "detected",
          severity: Number(props.severity ?? 0.5),
          situationType: { name: (props.situation_type as string) ?? "unknown" },
        };
      })
    ),
    buildDomainDataContext(operatorId, visibleDomains),
  ]);

  const typesSummary = entityTypes
    .map((t) => `- ${t.name} (${t.slug}): ${t._count.entities} entities`)
    .join("\n");

  const policyRules = await prisma.policyRule.findMany({
    where: { operatorId, enabled: true },
    select: { name: true, scope: true, actionType: true, effect: true },
    take: 10,
  });

  const policySummary = policyRules.length > 0
    ? policyRules.map((r) => `- "${r.name}": ${r.effect} on ${r.actionType} (${r.scope})`).join("\n")
    : "No custom policy rules configured.";

  const businessSection = businessCtx
    ? `\nBUSINESS CONTEXT (learned during onboarding):\n${formatBusinessContext(businessCtx)}\n`
    : "";

  const situationSection = situationTypes.length > 0
    ? `\nACTIVE SITUATION TYPES (${situationTypes.length} watching):\n${situationTypes.map((s) => `- ${s.name} (${s.slug}): ${s.description} [${s.autonomyLevel}]`).join("\n")}\n`
    : "";

  const scopeNote = visibleDomains && visibleDomains !== "all"
    ? "\nIMPORTANT: You have limited visibility. Only discuss departments and data you can see. If asked about other departments, say you don't have visibility into that area."
    : "";

  const deptSection = deptContext
    ? `\nORGANIZATIONAL STRUCTURE:\n${deptContext}${scopeNote}\n`
    : "";

  // Scoped user framing
  let scopeFraming = "- Visibility: Full access across all departments.";
  if (scopeInfo && scopeInfo.visibleDomains !== "all" && scopeInfo.domainName) {
    scopeFraming = `- Department: ${scopeInfo.domainName}\n- Visibility: You are assisting ${scopeInfo.userName || "a user"} who works in the ${scopeInfo.domainName} department. Focus your responses on matters relevant to their department.`;
  }

  const contextSection = injectedContext ? `\n${injectedContext}\n` : "";

  return `You are the Qorpera AI co-pilot, an intelligent assistant for the operator's entity graph and governance workflow engine.
${contextSection}${businessSection}${deptSection}
ENTITY MODEL:
${typesSummary || "No entity types configured yet."}
${situationSection}
ACTIVE POLICY RULES:
${policySummary}

CURRENT STATUS:
- Unread notifications: ${unreadNotifCount}
${pendingSituations.length > 0
  ? `- Pending situations:\n${pendingSituations.map((s) => `  - ${s.situationType.name} (${s.status})`).join("\n")}`
  : "- No pending situations."}
${unreadNotifCount > 0 ? "When the user greets you or asks how things are going, proactively mention pending situations that need their attention." : ""}

CAPABILITIES:
- Use search_wiki and read_wiki_page to find information about people, departments, processes, and other organizational objects. Each person, department, and process has their own wiki page.
- Use get_related_pages to explore connections from any wiki page via [[cross-references]]
- Create new wiki pages for people, processes, projects with create_wiki_page
- Search department knowledge: find wiki pages within a specific department
- List departments and get detailed department context
- Get operational briefings: use when user asks "how are things", "what's happening", "give me an update"
- Execute connector actions (e.g., send email, update contact, change deal stage in HubSpot)
- Search emails: use when user asks about emails or correspondence (searches Gmail + Outlook)
- Get email thread: retrieve the full conversation for a specific thread ID
- Search documents: use when user asks about documents, files, spreadsheets, or presentations (searches Google Drive + OneDrive)
- Search messages: use when user asks about Slack or Teams conversations, channel discussions, or internal chat
- Get message thread: retrieve the full thread from Slack or Teams by thread ID
- Get activity summary: use when user asks about activity levels, trends, communication volume, or what's been happening
- Get initiatives: use when user asks about objectives, targets, strategic work, or AI proposals
- Get work streams: use when user asks about projects, grouped work, or progress
- Get insights: use when user asks what the AI has learned, best approaches, or effectiveness patterns
- Get priorities: use when user asks what needs attention, what's most urgent, or what to work on next
- Create new situation types scoped to specific departments

KNOWLEDGE SOURCES:
You have access to two knowledge layers via search_wiki and read_wiki_page:
1. **Company knowledge** (search_wiki scope "operator") — Synthesized intelligence about THIS specific company. Entity profiles, processes, behavioral patterns. Use when the user asks about their company.
2. **Reference library** (search_wiki scope "system") — Practitioner reference material: benchmarks, regional practice specifics (especially Danish/Nordic), empirical patterns, red flag heuristics. Consult when you need specific thresholds or practitioner insights to supplement your own expertise.

When answering company questions: search company knowledge first, then consult reference material if you need specific benchmarks or thresholds.
When answering domain questions: use your own expertise, then consult the reference library for specifics like Danish practice, empirical patterns, or industry benchmarks.
When recommending actions: combine company knowledge for the specifics with reference material for practitioner benchmarks when relevant.

You also have search_evidence for precise factual claims extracted from raw data — use when you need specific numbers, dates, or verified facts.

USER CONTEXT:
- Role: ${userRole || "admin"}
${scopeFraming}
- ${(() => {
    const role = userRole || "admin";
    const descriptions: Record<string, string> = {
      admin: "Full access. Can manage all entities, types, policies, and governance settings.",
      member: "Scoped access. Can view and interact with entities in assigned departments only.",
    };
    return descriptions[role] || descriptions.admin;
  })()}
GUIDELINES:
- You are a senior chief of staff briefing leadership. Be direct, concise, and opinionated about priorities.
- Keep responses to 4-7 lines for initial answers. Summarize and prioritize. Never open with a full breakdown.
- Start with the most important insight or headline. Then briefly mention 2-3 other items that need attention.
- Use natural prose for conversational responses and summaries. When listing 3+ specific items (entities, action steps, situation details), use bullet points — they're faster to scan. But never START a response with bullets. Always lead with a sentence that frames what follows.
- After your summary, offer to go deeper on a specific item. End with a focused follow-up question, not a generic menu of options.
- When the user asks to go deeper on a specific topic, THEN provide the full detail — entities involved, evidence, recommended actions.
- Do not use markdown headers (##) in conversational responses. Use bold (**text**) sparingly for emphasis on key names or numbers only.
- Never start a response with a list. Always start with a sentence.
- Match the user's energy — if they ask a quick question, give a quick answer. If they ask for analysis, provide depth.
- Reference specific entities, people, and numbers from the data. Never be vague when you have concrete information.
- When recommending actions, be specific: "Send Erik a reminder about the Meridian invoice" not "Consider following up on overdue invoices."`;
}

// ── Tool Execution ───────────────────────────────────────────────────────────

// ── Scope Helper ──────────────────────────────────────────────────────────

async function getVisibleAiEntityIds(
  visibleDomains: string[],
  operatorId: string,
): Promise<string[]> {
  const entities = await prisma.entity.findMany({
    where: {
      operatorId,
      entityType: { slug: { in: ["ai-agent", "domain-ai", "hq-ai"] } },
      OR: [
        { primaryDomainId: { in: visibleDomains } },
        { ownerDomainId: { in: visibleDomains } },
      ],
    },
    select: { id: true },
  });
  return entities.map(e => e.id);
}

/**
 * Check if any participant in a set of RawContent items belongs to a visible department.
 * Returns true if the user has access (admin, or at least one participant in scope).
 */
async function checkParticipantScope(
  operatorId: string,
  rawItems: Array<{ rawMetadata: unknown }>,
  visibleDomains: string[] | "all" | undefined,
): Promise<boolean> {
  if (!visibleDomains || visibleDomains === "all") return true;
  if (rawItems.length === 0) return true;

  // Extract all participant emails from rawMetadata
  const emails = new Set<string>();
  for (const r of rawItems) {
    const meta = (r.rawMetadata ?? {}) as Record<string, unknown>;
    for (const field of ["from", "to", "cc", "sender", "authorEmail"]) {
      const val = meta[field];
      if (typeof val === "string") {
        for (const part of val.split(/[,;]\s*/)) {
          const trimmed = part.trim().toLowerCase();
          if (trimmed.includes("@")) emails.add(trimmed);
        }
      } else if (Array.isArray(val)) {
        for (const v of val) {
          if (typeof v === "string" && v.includes("@")) emails.add(v.trim().toLowerCase());
        }
      }
    }
  }

  if (emails.size === 0) return true; // No participants to check — allow

  // Find entities matching participant emails that belong to a visible department
  const matchingEntities = await prisma.entity.findMany({
    where: {
      operatorId,
      propertyValues: {
        some: {
          property: { identityRole: "email" },
          value: { in: [...emails] },
        },
      },
      primaryDomainId: { in: visibleDomains },
    },
    select: { id: true },
    take: 1,
  });

  return matchingEntities.length > 0;
}

export async function executeTool(
  operatorId: string,
  toolName: string,
  args: Record<string, unknown>,
  orientationSessionId?: string,
  visibleDomains?: string[] | "all",
  userId?: string,
): Promise<string> {
  const domainVisFilter = visibleDomains && visibleDomains !== "all" ? { id: { in: visibleDomains } } : {};
  switch (toolName) {
    case "get_related_pages": {
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

      return `Pages linked from "${page.title}":\n\n` +
        linked.map(p => `- [[${p.slug}]] "${p.title}" [${p.pageType}]\n  ${p.content.slice(0, 200).replace(/\n/g, " ")}...`).join("\n\n");
    }

    case "execute_connector_action": {
      const actionName = String(args.action_name ?? "");
      const actionParams = (args.params ?? {}) as Record<string, unknown>;

      const capability = await prisma.actionCapability.findFirst({
        where: { operatorId, name: actionName, enabled: true },
      });
      if (!capability) return `Action not available: ${actionName}`;
      if (!capability.connectorId) return "No connector linked to this action.";

      const connector = await prisma.sourceConnector.findFirst({
        where: { id: capability.connectorId, operatorId, deletedAt: null },
      });
      if (!connector) return "Connector not found for this action.";

      const provider = getProvider(connector.provider);
      if (!provider?.executeAction) return `Provider "${connector.provider}" does not support actions.`;

      const config = decryptConfig(connector.config || "{}") as Record<string, any>;
      const result = await provider.executeAction(config, actionName, actionParams);

      // Persist config in case tokens were refreshed
      await prisma.sourceConnector.update({
        where: { id: connector.id },
        data: { config: encryptConfig(config) },
      });

      if (result.success) {
        return `Action "${actionName}" executed successfully.${result.result ? ` Result: ${JSON.stringify(result.result)}` : ""}`;
      }
      return `Action "${actionName}" failed: ${result.error}`;
    }

    // ── Wiki Tools ──────────────────────────────────────────────────────────

    case "create_wiki_page": {
      const slug = String(args.slug ?? "");
      const title = String(args.title ?? "");
      const pageType = String(args.page_type ?? "entity_profile");
      const content = String(args.content ?? "");

      if (!slug || !title || !content) return "Please provide slug, title, and content.";

      const crossRefs = [...content.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1]);

      try {
        await prisma.knowledgePage.create({
          data: {
            operatorId,
            slug,
            title,
            pageType,
            content,
            scope: "operator",
            status: "draft",
            confidence: 0.5,
            synthesisPath: "copilot",
            synthesizedByModel: "copilot",
            lastSynthesizedAt: new Date(),
            crossReferences: crossRefs,
          },
        });
      } catch (e: any) {
        if (e?.code === "P2002") return `A wiki page with slug "${slug}" already exists. Use a different slug.`;
        throw e;
      }

      return `Created wiki page "${title}" ([[${slug}]]) [${pageType}] with ${crossRefs.length} cross-reference(s).`;
    }

    case "set_situation_scope": {
      const slug = String(args.situationTypeSlug ?? "");
      const scopeEntityName = String(args.scopeEntityName ?? "");
      const scopeDepth = typeof args.scopeDepth === "number" ? args.scopeDepth : null;

      const st = await prisma.situationType.findFirst({
        where: { operatorId, slug },
      });
      if (!st) return `Situation type "${slug}" not found.`;

      const scopeEntity = await prisma.entity.findFirst({
        where: { operatorId, displayName: { contains: scopeEntityName }, status: "active" },
        select: { id: true, displayName: true },
      });
      if (!scopeEntity) return `Entity "${scopeEntityName}" not found.`;

      await prisma.situationType.update({
        where: { id: st.id },
        data: { scopeEntityId: scopeEntity.id, scopeDepth },
      });

      return `Scoped "${st.name}" to entity "${scopeEntity.displayName}" (ID: ${scopeEntity.id})${scopeDepth !== null ? `, max ${scopeDepth} hops` : ""}.`;
    }

    case "get_org_structure": {
      // Load CompanyHQ
      const hq = await prisma.entity.findFirst({
        where: { operatorId, category: "foundational", entityType: { slug: "organization" }, status: "active" },
        select: { id: true, displayName: true },
      });

      if (!hq) return "No organization found. Complete onboarding first.";

      // Load departments (filtered by visibility)
      const departments = await prisma.entity.findMany({
        where: { operatorId, category: "foundational", entityType: { slug: "domain" }, status: "active", ...domainVisFilter },
        select: { id: true, displayName: true, description: true },
        orderBy: { displayName: "asc" },
      });

      if (departments.length === 0) {
        return `${hq.displayName}\n  (no departments)`;
      }

      const lines: string[] = [hq.displayName];

      for (let di = 0; di < departments.length; di++) {
        const dept = departments[di];
        const isLast = di === departments.length - 1;
        const prefix = isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
        const childPrefix = isLast ? "    " : "\u2502   ";

        const desc = dept.description ? ` \u2014 ${dept.description}` : "";
        lines.push(`${prefix}${dept.displayName}${desc}`);

        // Load home members
        const homeMembers = await prisma.entity.findMany({
          where: { operatorId, primaryDomainId: dept.id, category: "base", status: "active" },
          include: {
            propertyValues: { include: { property: { select: { slug: true } } } },
          },
          orderBy: { displayName: "asc" },
        });

        // Load cross-department members
        const crossRels = await prisma.relationship.findMany({
          where: {
            OR: [
              { toEntityId: dept.id, relationshipType: { slug: "domain-member" }, fromEntity: { category: "base", status: "active" } },
              { fromEntityId: dept.id, relationshipType: { slug: "domain-member" }, toEntity: { category: "base", status: "active" } },
            ],
          },
          select: { fromEntityId: true, toEntityId: true, metadata: true },
        });
        const homeMemberIds = new Set(homeMembers.map(m => m.id));
        const crossIds = crossRels
          .map(r => r.fromEntityId === dept.id ? r.toEntityId : r.fromEntityId)
          .filter(cid => !homeMemberIds.has(cid));
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
          const mPrefix = mIsLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
          const crossRel = crossRels.find(r => r.fromEntityId === m.id || r.toEntityId === m.id);
          const crossRole = crossRel?.metadata ? JSON.parse(crossRel.metadata).role : null;
          const role = crossRole || m.propertyValues.find(pv => pv.property.slug === "role")?.value;
          const roleStr = role ? ` (${role})` : "";
          const crossTag = crossRel ? " [shared]" : "";
          lines.push(`${childPrefix}${mPrefix}${m.displayName}${roleStr}${crossTag}`);
        }
      }

      return lines.join("\n");
    }

    // ── Orientation + Situation Tools ───────────────────────────────────────────────

    case "create_situation_type": {
      const name = String(args.name ?? "");
      const slug = String(args.slug ?? "");
      const description = String(args.description ?? "");
      const detectionLogic = args.detectionLogic ?? { mode: "natural", naturalLanguage: description };
      const responseStrategy = args.responseStrategy ?? null;
      let scopeEntityId = args.scopeEntityId ? String(args.scopeEntityId) : null;
      const scopeDomainName = args.scopeDomainName ? String(args.scopeDomainName) : null;

      // Resolve department name to entity ID if needed
      if (scopeDomainName && !scopeEntityId) {
        const dept = await prisma.entity.findFirst({
          where: {
            operatorId,
            category: "foundational",
            displayName: { contains: scopeDomainName },
            entityType: { slug: "domain" },
            status: "active",
          },
        });
        if (dept) scopeEntityId = dept.id;
      }

      // Verify visibility
      if (scopeEntityId && visibleDomains !== "all" && visibleDomains && !visibleDomains.includes(scopeEntityId)) {
        return "You don't have visibility into that department.";
      }

      const situationType = await prisma.situationType.upsert({
        where: { operatorId_slug: { operatorId, slug } },
        update: {
          name,
          description,
          detectionLogic: JSON.stringify(detectionLogic),
          responseStrategy: responseStrategy ? JSON.stringify(responseStrategy) : null,
          ...(scopeEntityId ? { scopeEntityId } : {}),
        },
        create: {
          operatorId,
          name,
          slug,
          description,
          detectionLogic: JSON.stringify(detectionLogic),
          responseStrategy: responseStrategy ? JSON.stringify(responseStrategy) : null,
          autonomyLevel: "supervised",
          ...(scopeEntityId ? { scopeEntityId } : {}),
        },
      });

      // Update orientation session context if in orientation
      if (orientationSessionId) {
        const session = await prisma.orientationSession.findUnique({
          where: { id: orientationSessionId },
        });
        if (session) {
          const ctx = session.context ? JSON.parse(session.context) : {};
          const types = Array.isArray(ctx.situationTypes) ? ctx.situationTypes : [];
          types.push({ id: situationType.id, name, slug, description });
          ctx.situationTypes = types;
          await prisma.orientationSession.update({
            where: { id: orientationSessionId },
            data: { context: JSON.stringify(ctx) },
          });
        }
      }

      // Generate pre-filter for natural/hybrid modes (async on worker)
      const dl = detectionLogic as Record<string, unknown>;
      if (dl.mode === "natural" || dl.mode === "hybrid") {
        enqueueWorkerJob("generate_prefilter", operatorId, {
          situationTypeId: situationType.id,
        }).catch(() => {});
      }

      const scopeNote = scopeEntityId
        ? ` Scoped to ${scopeDomainName || "domain"} (${scopeEntityId}).`
        : "";
      return `Created situation type "${name}" (${slug}, ID: ${situationType.id}).${scopeNote} It will run in supervised mode — I'll always ask before taking any action.`;
    }

    case "create_retrospective_situation": {
      const situationTypeId = String(args.situationTypeId ?? "");
      const summary = String(args.summary ?? "");
      const actionTaken = String(args.actionTaken ?? "");
      const outcome = String(args.outcome ?? "neutral");
      const outcomeDetails = args.outcomeDetails ? String(args.outcomeDetails) : null;

      const { createId } = await import("@paralleldrive/cuid2");
      const situationId = createId();

      const stRow = await prisma.situationType.findUnique({
        where: { id: situationTypeId },
        select: { name: true, slug: true },
      });

      const slug = `retro-${situationId.slice(0, 8)}-${summary.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
      await prisma.knowledgePage.create({
        data: {
          operatorId,
          slug,
          title: `Retrospective: ${summary.slice(0, 120)}`,
          pageType: "situation_instance",
          scope: "operator",
          status: "verified",
          content: `## Summary\n\n${summary}\n\n## Action Taken\n\n${actionTaken}\n\n## Outcome\n\n${outcome}${outcomeDetails ? `\n\n${outcomeDetails}` : ""}`,
          contentTokens: Math.ceil((summary.length + actionTaken.length) / 4),
          properties: {
            situation_id: situationId,
            status: "resolved",
            severity: 0.5,
            confidence: 1.0,
            situation_type: stRow?.slug ?? "unknown",
            detected_at: new Date().toISOString(),
            source: "retrospective",
            outcome,
          },
          synthesisPath: "copilot",
          synthesizedByModel: "copilot",
          confidence: 1.0,
          lastSynthesizedAt: new Date(),
        },
      });

      return `Recorded retrospective example (ID: ${situationId}): "${summary}" — outcome: ${outcome}. This helps me learn from your past experience.`;
    }

    case "list_departments": {
      const departments = await prisma.entity.findMany({
        where: { operatorId, category: "foundational", entityType: { slug: "domain" }, status: "active", ...domainVisFilter },
        select: { id: true, displayName: true, description: true },
        orderBy: { displayName: "asc" },
      });

      if (departments.length === 0) return "No departments found.";

      const results: string[] = [];
      for (const dept of departments) {
        const [memberCount, digitalCount, docCount] = await Promise.all([
          prisma.entity.count({ where: { primaryDomainId: dept.id, category: "base", status: "active" } }),
          prisma.entity.count({ where: { primaryDomainId: dept.id, category: "digital", status: "active" } }),
          prisma.internalDocument.count({ where: { domainId: dept.id, operatorId, status: { not: "replaced" } } }),
        ]);

        let line = `- ${dept.displayName} (ID: ${dept.id})`;
        if (dept.description) line += ` — ${dept.description}`;
        line += `\n    ${memberCount} people, ${digitalCount} synced entities, ${docCount} documents`;
        results.push(line);
      }

      return results.join("\n");
    }

    case "get_department_context": {
      const name = String(args.domainName ?? args.department_name ?? "");
      const dept = await prisma.entity.findFirst({
        where: {
          operatorId,
          category: "foundational",
          displayName: { contains: name },
          status: "active",
          ...domainVisFilter,
        },
        select: { id: true, displayName: true, description: true },
      });

      if (!dept) return `Department "${name}" not found or not accessible.`;

      // Home members
      const homeMembers = await prisma.entity.findMany({
        where: { operatorId, primaryDomainId: dept.id, category: "base", status: "active" },
        include: { propertyValues: { include: { property: { select: { slug: true } } } } },
        orderBy: { displayName: "asc" },
      });

      // Cross-department members + digital entities via department-member relationships
      const deptMemberRels = await prisma.relationship.findMany({
        where: {
          OR: [
            { fromEntityId: dept.id, relationshipType: { slug: "domain-member" } },
            { toEntityId: dept.id, relationshipType: { slug: "domain-member" } },
          ],
        },
        select: { fromEntityId: true, toEntityId: true, metadata: true },
      });
      const linkedIds = deptMemberRels.map(r => r.fromEntityId === dept.id ? r.toEntityId : r.fromEntityId);
      const homeMemberIds = new Set(homeMembers.map(m => m.id));
      const crossPersonIds = linkedIds.filter(lid => !homeMemberIds.has(lid));
      const crossPersonMembers = crossPersonIds.length > 0
        ? await prisma.entity.findMany({
            where: { id: { in: crossPersonIds }, category: "base", status: "active" },
            include: { propertyValues: { include: { property: { select: { slug: true } } } } },
            orderBy: { displayName: "asc" },
          })
        : [];
      const members = [...homeMembers, ...crossPersonMembers];

      // Documents
      const docs = await prisma.internalDocument.findMany({
        where: { domainId: dept.id, operatorId, status: { not: "replaced" } },
        select: { fileName: true, documentType: true, embeddingStatus: true },
      });

      let digitalSummary = "None";
      if (linkedIds.length > 0) {
        const digitalEntities = await prisma.entity.findMany({
          where: { id: { in: linkedIds }, category: "digital", status: "active" },
          include: { entityType: { select: { name: true } } },
        });
        const countByType = new Map<string, number>();
        for (const e of digitalEntities) {
          countByType.set(e.entityType.name, (countByType.get(e.entityType.name) ?? 0) + 1);
        }
        if (countByType.size > 0) {
          digitalSummary = [...countByType.entries()].map(([t, c]) => `${c} ${t}`).join(", ");
        }
      }

      // Active situations from wiki pages
      const activeSitPages = await prisma.knowledgePage.findMany({
        where: {
          operatorId,
          pageType: "situation_instance",
          scope: "operator",
          NOT: { properties: { path: ["status"], string_contains: "resolved" } },
        },
        select: { properties: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      const activeSits = activeSitPages
        .filter(p => {
          const props = (p.properties ?? {}) as Record<string, unknown>;
          const status = props.status as string | undefined;
          return status && ["detected", "proposed", "reasoning", "executing", "auto_executing"].includes(status);
        })
        .slice(0, 10)
        .map(p => {
          const props = (p.properties ?? {}) as Record<string, unknown>;
          return { situationType: { name: (props.situation_type as string) ?? "unknown" }, status: (props.status as string) ?? "detected" };
        });

      const lines: string[] = [
        `Department: ${dept.displayName}`,
        dept.description ? `Purpose: ${dept.description}` : "",
        "",
        `Team (${members.length}):`,
        ...members.map(m => {
          const crossRel = deptMemberRels.find(r => r.fromEntityId === m.id || r.toEntityId === m.id);
          const crossRole = crossRel?.metadata ? JSON.parse(crossRel.metadata).role : null;
          const role = crossRole || m.propertyValues.find(pv => pv.property.slug === "role")?.value;
          const email = m.propertyValues.find(pv => pv.property.slug === "email")?.value;
          let line = `  - ${m.displayName}`;
          if (role) line += ` (${role})`;
          if (email) line += ` <${email}>`;
          if (crossRel) line += ` [shared member]`;
          return line;
        }),
        "",
        `Connected Data: ${digitalSummary}`,
        "",
        `Documents (${docs.length}):`,
        ...docs.map(d => `  - ${d.fileName} [${d.documentType}] (${d.embeddingStatus})`),
        "",
        `Active Situations (${activeSits.length}):`,
        ...(activeSits.length > 0
          ? activeSits.map(s => `  - ${s.situationType.name} (${s.status})`)
          : ["  None"]),
      ].filter(l => l !== undefined);

      return lines.join("\n");
    }

    case "get_operational_briefing": {
      const deptName = args.domainName ? String(args.domainName) : null;
      const period = String(args.period || "week");

      const now = new Date();
      const periodStart = new Date(now);
      if (period === "today") periodStart.setHours(0, 0, 0, 0);
      else if (period === "week") periodStart.setDate(now.getDate() - 7);
      else periodStart.setDate(now.getDate() - 30);

      const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      let targetDepts: Array<{ id: string; displayName: string; description: string | null }>;

      if (deptName) {
        const dept = await prisma.entity.findFirst({
          where: {
            operatorId, category: "foundational", entityType: { slug: "domain" },
            displayName: { contains: deptName },
            status: "active",
            ...domainVisFilter,
          },
          select: { id: true, displayName: true, description: true },
        });
        if (!dept) return `Department "${deptName}" not found or not accessible.`;
        targetDepts = [dept];
      } else {
        targetDepts = await prisma.entity.findMany({
          where: {
            operatorId, category: "foundational", entityType: { slug: "domain" },
            status: "active", ...domainVisFilter,
          },
          select: { id: true, displayName: true, description: true },
          orderBy: { displayName: "asc" },
        });
      }

      if (targetDepts.length === 0) return "No departments found.";

      // Build scope filter for execution plans
      const planScopeFilter: Record<string, unknown> = {
        operatorId,
        status: { in: ["pending", "approved", "executing"] },
      };
      if (visibleDomains && visibleDomains !== "all") {
        planScopeFilter.OR = [
          {
            sourceType: "situation",
            situation: {
              OR: [
                { situationType: { scopeEntityId: { in: visibleDomains } } },
                { situationType: { scopeEntityId: null } },
              ],
            },
          },
          { sourceType: "initiative" },
          { sourceType: { in: ["recurring", "delegation"] } },
        ];
      }

      // Build initiative scope filter
      const initScopeFilter: Record<string, unknown> = { operatorId };

      // Resolve visible AI entity IDs (used by delegation, insight, recurring scopes)
      let briefingAiIds: string[] | null = null;
      let briefingDelegationScoped = false;
      if (visibleDomains && visibleDomains !== "all") {
        briefingAiIds = await getVisibleAiEntityIds(visibleDomains as string[], operatorId);
        briefingDelegationScoped = true;
      }

      // Build delegation scope filter
      const delegationScopeFilter: Record<string, unknown> = { operatorId };
      if (briefingDelegationScoped && briefingAiIds && briefingAiIds.length > 0) {
        delegationScopeFilter.OR = [
          { fromAiEntityId: { in: briefingAiIds } },
          { toAiEntityId: { in: briefingAiIds } },
        ];
      }

      // Build insight scope filter
      const insightScopeFilter: Record<string, unknown> = {
        operatorId,
        status: "active",
        createdAt: { gte: sevenDaysAgo },
      };
      if (visibleDomains && visibleDomains !== "all") {
        const insightOrClauses: Record<string, unknown>[] = [
          { shareScope: "operator" },
        ];
        if (briefingAiIds && briefingAiIds.length > 0) {
          insightOrClauses.push({ shareScope: "department", aiEntityId: { in: briefingAiIds } });
        }
        // Personal insights for the current user's AI entity
        if (userId) {
          const userAi = await prisma.entity.findFirst({
            where: { operatorId, ownerUserId: userId, entityType: { slug: "ai-agent" } },
            select: { id: true },
          });
          if (userAi) {
            insightOrClauses.push({ shareScope: "personal", aiEntityId: userAi.id });
          }
        }
        insightScopeFilter.OR = insightOrClauses;
      }

      // Build recurring tasks scope filter
      const recurringScope: Record<string, unknown> = {
        operatorId,
        status: "active",
        nextTriggerAt: { lte: twentyFourHoursFromNow, gte: now },
      };
      if (visibleDomains && visibleDomains !== "all") {
        if (briefingAiIds && briefingAiIds.length > 0) {
          recurringScope.aiEntityId = { in: briefingAiIds };
        } else {
          // No visible AI entities — recurring section will be empty
          recurringScope.id = "__impossible__";
        }
      }

      // Query all sections in parallel
      // Load all situation wiki pages for the period, then bucket by department
      const allSituationPages = await prisma.knowledgePage.findMany({
        where: {
          operatorId,
          pageType: "situation_instance",
          scope: "operator",
          createdAt: { gte: periodStart },
        },
        select: { title: true, properties: true, crossReferences: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      const situationPagesMapped = allSituationPages.map(p => {
        const props = (p.properties ?? {}) as Record<string, unknown>;
        return {
          status: (props.status as string) ?? "detected",
          severity: Number(props.severity ?? 0.5),
          situationType: { name: (props.situation_type as string) ?? "unknown" },
          domain: (props.domain as string) ?? null,
          crossRefs: p.crossReferences as string[],
        };
      });

      const [
        situationsByDept,
        unscopedSituations,
        priorityPlans,
        executingInitiatives,
        proposedInitiatives,
        pendingDelegations,
        humanDelegations,
        watchingFollowUps,
        urgentFollowUps,
        recentInsights,
      ] = await Promise.all([
        // Situations by department (from wiki pages)
        Promise.resolve(targetDepts.map(dept => {
          // Match by domain cross-reference
          const situations = situationPagesMapped.filter(s =>
            s.crossRefs?.includes(dept.id) || s.domain === dept.id
          );
          return { dept, situations };
        })),
        // Unscoped situations (no domain reference)
        Promise.resolve(situationPagesMapped.filter(s => !s.domain && (!s.crossRefs || s.crossRefs.length === 0))),
        // Priority plans (ExecutionPlan table dropped — return empty)
        Promise.resolve([] as Array<{ id: string; sourceType: string; sourceId: string; priorityScore: number | null; currentStepOrder: number; priorityOverride: { overrideType: string; snoozeUntil: Date | null } | null; steps: Array<{ title: string; sequenceOrder: number }> }>),
        // Executing initiatives count (wiki pages)
        prisma.knowledgePage.count({
          where: { operatorId, pageType: "initiative", scope: "operator",
            properties: { path: ["status"], equals: "executing" } },
        }),
        // Proposed initiatives awaiting approval (wiki pages)
        prisma.knowledgePage.count({
          where: { operatorId, pageType: "initiative", scope: "operator",
            properties: { path: ["status"], equals: "proposed" } },
        }),
        // Delegations removed (model dropped v0.3.17)
        Promise.resolve(0),
        Promise.resolve(0),
        // FollowUp table dropped — return 0
        Promise.resolve(0),
        // FollowUp table dropped — return empty
        Promise.resolve([] as Array<{ id: string; triggerAt: Date }>),
        // Recent insights (last 7 days)
        prisma.operationalInsight.findMany({
          where: insightScopeFilter,
          orderBy: { confidence: "desc" },
          take: 3,
          select: { description: true, confidence: true, insightType: true },
        }),
      ]);

      // Build situation sections (existing logic)
      const sections: string[] = [];

      for (const { dept, situations } of situationsByDept) {
        const active = situations.filter(s => ["detected", "proposed", "reasoning", "auto_executing", "executing"].includes(s.status)).length;
        const resolved = situations.filter(s => s.status === "resolved").length;
        const pending = situations.filter(s => s.status === "proposed");

        let section = `${dept.displayName}${dept.description ? ` — ${dept.description}` : ""}`;
        section += `\n  Situations (${period}): ${situations.length} total (${active} active, ${resolved} resolved)`;

        if (pending.length > 0) {
          section += `\n  Needs attention:`;
          for (const s of pending.slice(0, 3)) {
            section += `\n    - ${s.situationType.name} (severity: ${s.severity.toFixed(1)})`;
          }
          if (pending.length > 3) section += `\n    ... and ${pending.length - 3} more`;
        }

        if (situations.length === 0) {
          section += `\n  All clear — no situations detected.`;
        }

        sections.push(section);
      }

      if (unscopedSituations.length > 0) {
        sections.push(`Global (no department scope): ${unscopedSituations.length} situations`);
      }

      // Resolve priority plan titles (ExecutionPlan dropped — priorityPlans is empty)
      const priTitleMap = new Map<string, string>();

      // Build priority section
      let prioritySection = "";
      if (priorityPlans.length > 0) {
        const items = priorityPlans.map(p => {
          const currentStep = p.steps.find(s => s.sequenceOrder === p.currentStepOrder);
          const isPinned = p.priorityOverride?.overrideType === "pin";
          const title = priTitleMap.get(p.sourceId) ?? p.sourceType;
          return `    - [${p.sourceType}] ${title} (score: ${p.priorityScore ?? 0}${isPinned ? ", PINNED" : ""})${currentStep ? ` — next: ${currentStep.title}` : ""}`;
        });
        prioritySection = `\n  Priority items (top ${priorityPlans.length}):\n${items.join("\n")}`;
      }

      // Build new sections
      const initiativeSection = `\n  Initiatives: ${executingInitiatives} executing, ${proposedInitiatives} awaiting approval`;

      const delegationSection = pendingDelegations + humanDelegations > 0
        ? `\n  Delegations: ${pendingDelegations} pending approval, ${humanDelegations} human tasks in progress`
        : `\n  Delegations: none pending`;

      const followUpSection = watchingFollowUps > 0
        ? `\n  Follow-ups: ${watchingFollowUps} watching${urgentFollowUps.length > 0 ? `, ${urgentFollowUps.length} triggering within 24h` : ""}`
        : `\n  Follow-ups: none active`;

      const recentInsightCount = recentInsights.length;
      let insightSection = `\n  Recently learned: ${recentInsightCount} new insight${recentInsightCount !== 1 ? "s" : ""} this week`;
      if (recentInsights.length > 0) {
        insightSection += ` — most notable: "${recentInsights[0].description.slice(0, 100)}" (confidence: ${recentInsights[0].confidence.toFixed(2)})`;
      }

      const header = deptName
        ? `Operational briefing for ${deptName} (${period}):`
        : `Operational briefing across ${targetDepts.length} departments (${period}):`;

      return `${header}\n\n${sections.join("\n\n")}${prioritySection}${initiativeSection}${delegationSection}${followUpSection}${insightSection}`;
    }

    case "search_department_knowledge": {
      const departmentSlug = String(args.department_slug ?? args.department ?? "");
      const query = args.query ? String(args.query) : undefined;

      if (!departmentSlug) return "Please provide a department_slug.";

      if (query) {
        const pages = await prisma.knowledgePage.findMany({
          where: {
            operatorId,
            scope: "operator",
            crossReferences: { has: departmentSlug },
            OR: [
              { content: { contains: query, mode: "insensitive" } },
              { title: { contains: query, mode: "insensitive" } },
            ],
          },
          select: { slug: true, title: true, pageType: true, content: true },
        });
        if (pages.length === 0) return `No pages matching "${query}" in department "${departmentSlug}".`;
        return pages.map(p => `- [[${p.slug}]] "${p.title}" [${p.pageType}]\n  ${p.content.slice(0, 200).replace(/\n/g, " ")}...`).join("\n\n");
      }

      const pages = await prisma.knowledgePage.findMany({
        where: {
          operatorId,
          scope: "operator",
          crossReferences: { has: departmentSlug },
        },
        select: { slug: true, title: true, pageType: true },
      });
      if (pages.length === 0) return `No wiki pages found referencing department "${departmentSlug}".`;
      return pages.map(p => `- [[${p.slug}]] "${p.title}" [${p.pageType}]`).join("\n");
    }

    case "search_emails": {
      const query = String(args.query ?? "");
      if (!query) return "Please provide a search query.";
      const limit = typeof args.limit === "number" ? args.limit : 5;

      // Resolve visible department IDs for scoping
      let searchDeptIds: string[] = [];
      const depts = await prisma.entity.findMany({
        where: {
          operatorId, category: "foundational", entityType: { slug: "domain" },
          ...domainVisFilter,
        },
        select: { id: true },
      });
      searchDeptIds = depts.map(d => d.id);

      if (searchDeptIds.length === 0) return "No departments available to search.";

      try {
        const { retrieveRelevantChunks } = await import("@/lib/rag/retriever");
        const { embedChunks } = await import("@/lib/rag/embedder");
        const [queryEmbedding] = await embedChunks([query]);
        if (!queryEmbedding) return "Email search is not available — embeddings may not be configured.";

        const results = await retrieveRelevantChunks(operatorId, queryEmbedding, {
          sourceTypes: ["email"],
          limit,
          domainIds: searchDeptIds.length > 0 ? searchDeptIds : undefined,
          userId: userId ?? undefined,
          skipUserFilter: false,
        });

        if (results.length === 0) return "No emails found matching this query.";
        return results
          .map((r) => {
            const m = r.metadata || {};
            const from = m.from || "unknown";
            const to = Array.isArray(m.to) ? m.to.join(", ") : m.to || "unknown";
            const date = m.date ? new Date(m.date as string).toLocaleDateString() : "unknown";
            const subject = m.subject || "(no subject)";
            const direction = m.direction || "unknown";
            const threadId = m.threadId || "";
            return `From: ${from} | To: ${to} | Date: ${date} | ${direction}\nSubject: ${subject}${threadId ? ` | Thread: ${threadId}` : ""}\n${r.content.slice(0, 500)}`;
          })
          .join("\n\n---\n\n");
      } catch {
        return "Email search is not available — embeddings may not be configured.";
      }
    }

    case "search_documents": {
      const query = String(args.query ?? "");
      if (!query) return "Please provide a search query.";
      const limit = typeof args.limit === "number" ? args.limit : 5;

      // Resolve visible department IDs for scoping
      const docDepts = await prisma.entity.findMany({
        where: {
          operatorId, category: "foundational", entityType: { slug: "domain" },
          ...domainVisFilter,
        },
        select: { id: true },
      });
      const docDeptIds = docDepts.map(d => d.id);

      if (docDeptIds.length === 0) return "No departments available to search.";

      try {
        const { retrieveRelevantChunks } = await import("@/lib/rag/retriever");
        const { embedChunks } = await import("@/lib/rag/embedder");
        const [queryEmbedding] = await embedChunks([query]);
        if (!queryEmbedding) return "Document search is not available — embeddings may not be configured.";

        const results = await retrieveRelevantChunks(operatorId, queryEmbedding, {
          sourceTypes: ["drive_doc", "uploaded_doc"],
          limit,
          domainIds: docDeptIds.length > 0 ? docDeptIds : undefined,
          includeParentContext: true,
          userId: userId ?? undefined,
          skipUserFilter: false,
        });

        if (results.length === 0) return "No documents found matching this query.";

        return results
          .map((r) => {
            const m = r.metadata || {};
            const isSummary = m.isDocumentSummary === true;
            const fileName = (m.fileName as string) || "Unknown";

            if (isSummary) {
              return `Document Overview: ${fileName}\n${r.content.slice(0, 600)}`;
            }

            const mimeType = (m.mimeType as string) || "";
            const modifiedTime = m.modifiedTime ? new Date(m.modifiedTime as string).toLocaleDateString() : "unknown";
            const sectionTitle = m.sectionTitle ? ` | Section: ${m.sectionTitle}` : "";
            const chunkInfo = m.chunkTotal ? ` | Part ${r.chunkIndex} of ${m.chunkTotal}` : "";
            const sheetName = m.sheetName ? ` (Sheet: ${m.sheetName})` : "";
            return `File: ${fileName}${sheetName}${sectionTitle}${chunkInfo} | Type: ${mimeType} | Modified: ${modifiedTime} | Relevance: ${r.score.toFixed(2)}\n${r.content.slice(0, 500)}`;
          })
          .join("\n\n---\n\n");
      } catch {
        return "Document search is not available — embeddings may not be configured.";
      }
    }

    case "search_messages": {
      const query = String(args.query ?? "");
      if (!query) return "Please provide a search query.";
      const limit = typeof args.limit === "number" ? args.limit : 5;

      // Resolve visible department IDs for scoping
      const msgDepts = await prisma.entity.findMany({
        where: {
          operatorId, category: "foundational", entityType: { slug: "domain" },
          ...domainVisFilter,
        },
        select: { id: true },
      });
      const msgDeptIds = msgDepts.map(d => d.id);

      if (msgDeptIds.length === 0) return "No departments available to search.";

      try {
        const { retrieveRelevantChunks } = await import("@/lib/rag/retriever");
        const { embedChunks } = await import("@/lib/rag/embedder");
        const [queryEmbedding] = await embedChunks([query]);
        if (!queryEmbedding) return "Message search is not available — embeddings may not be configured.";

        const results = await retrieveRelevantChunks(operatorId, queryEmbedding, {
          sourceTypes: ["slack_message", "teams_message"],
          limit,
          domainIds: msgDeptIds.length > 0 ? msgDeptIds : undefined,
          userId: userId ?? undefined,
          skipUserFilter: false,
        });

        if (results.length === 0) return "No messages found matching this query.";

        return results
          .map((r) => {
            const m = r.metadata || {};
            const channelName = (m.channelName as string) || (m.teamName ? `${m.teamName}/${m.channelName}` : "unknown");
            const authorEmail = (m.authorEmail as string) || "unknown";
            let timestamp = "unknown";
            if (m.timestamp) {
              const tsStr = m.timestamp as string;
              // Slack timestamps are epoch floats (e.g. "1710000000.000100"), Teams are ISO strings
              const parsed = tsStr.includes("T")
                ? new Date(tsStr)
                : new Date(parseFloat(tsStr) * 1000);
              if (!isNaN(parsed.getTime())) timestamp = parsed.toLocaleDateString();
            }
            const isThread = m.isThread ? " (thread)" : "";
            const source = r.sourceType === "teams_message" ? "Teams" : "Slack";
            return `[${source}] #${channelName} | ${authorEmail} | ${timestamp}${isThread}\n${r.content.slice(0, 500)}`;
          })
          .join("\n\n---\n\n");
      } catch {
        return "Message search is not available — embeddings may not be configured.";
      }
    }

    case "get_message_thread": {
      const threadId = String(args.threadId ?? "");
      if (!threadId) return "Please provide a thread ID.";
      const sourceType = (args.sourceType as string) || "slack_message";

      // Department scope: resolve visible departments for filtering
      const msgThreadDepts = await prisma.entity.findMany({
        where: {
          operatorId, category: "foundational", entityType: { slug: "domain" },
          ...domainVisFilter,
        },
        select: { id: true },
      });
      const msgThreadDeptIds = new Set(msgThreadDepts.map(d => d.id));

      try {
        // Query RawContent that match the thread
        let rawItems = await prisma.rawContent.findMany({
          where: {
            operatorId,
            sourceType,
            rawBody: { not: null },
            rawMetadata: sourceType === "slack_message"
              ? { path: ["threadTs"], equals: threadId }
              : { path: ["messageId"], equals: threadId },
          },
          select: { rawBody: true, rawMetadata: true, sourceId: true },
          orderBy: { occurredAt: "asc" },
          take: 20,
        });

        // Also check for standalone messages where sourceId matches
        if (rawItems.length === 0) {
          rawItems = await prisma.rawContent.findMany({
            where: {
              operatorId,
              sourceType,
              sourceId: threadId,
              rawBody: { not: null },
            },
            select: { rawBody: true, rawMetadata: true, sourceId: true },
            orderBy: { occurredAt: "asc" },
            take: 20,
          });
        }

        if (rawItems.length === 0) return "No messages found for this thread ID.";

        // Department scope: check if any participant belongs to user's visible departments
        const hasAccess = await checkParticipantScope(operatorId, rawItems, visibleDomains);
        if (!hasAccess) {
          return "I don't have visibility into that message thread's department.";
        }

        return rawItems
          .map((r) => (r.rawBody ?? "").slice(0, 1000))
          .join("\n\n---\n\n");
      } catch {
        return "Failed to retrieve message thread.";
      }
    }

    case "get_activity_summary": {
      const entityName = args.entityName ? String(args.entityName) : undefined;
      const days = typeof args.days === "number" ? args.days : 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const priorStart = new Date(since.getTime() - days * 24 * 60 * 60 * 1000);

      // Resolve entity filter if entityName provided
      let entityFilter: { actorEntityId?: string } = {};
      let entityLabel = "operator-wide";
      if (entityName) {
        const { searchEntities: searchEnt } = await import("@/lib/entity-resolution");
        const matches = await searchEnt(operatorId, entityName, undefined, 1);
        if (matches.length > 0) {
          entityFilter = { actorEntityId: matches[0].id };
          entityLabel = matches[0].displayName;
        } else {
          return `No entity found matching "${entityName}".`;
        }
      }

      // Resolve visible department IDs for scope filtering
      let scopeDeptIds: Set<string> | null = null;
      if (visibleDomains && visibleDomains !== "all") {
        const actDepts = await prisma.entity.findMany({
          where: {
            operatorId, category: "foundational", entityType: { slug: "domain" },
            ...domainVisFilter,
          },
          select: { id: true },
        });
        scopeDeptIds = new Set(actDepts.map(d => d.id));
        if (scopeDeptIds.size === 0) return "No departments available for activity summary.";
      }

      // ActivitySignal table dropped — read from person page activityContent
      if (entityFilter.actorEntityId) {
        const personPage = await prisma.knowledgePage.findFirst({
          where: { operatorId, pageType: "person_profile", scope: "operator",
            properties: { path: ["entity_id"], equals: entityFilter.actorEntityId } },
          select: { activityContent: true },
        });
        if (personPage?.activityContent) {
          return `Activity Summary for ${entityLabel} (last ${days} days):\n\n${personPage.activityContent.slice(0, 2000)}`;
        }
      }
      // Fallback: return empty summary
      const rawCurrent: Array<{ signalType: string; domainIds: string | null; metadata: string | null }> = [];
      const rawPrior: Array<{ signalType: string; domainIds: string | null }> = [];

      // Department scope filter helper
      function inScope(deptIdsJson: string | null): boolean {
        if (!scopeDeptIds) return true; // admin sees all
        if (!deptIdsJson) return true; // signals without department routing are visible
        try {
          const dIds: string[] = JSON.parse(deptIdsJson);
          return dIds.length === 0 || dIds.some(d => scopeDeptIds!.has(d));
        } catch { return true; }
      }

      const scopedCurrent = rawCurrent.filter(s => inScope(s.domainIds));
      const scopedPrior = rawPrior.filter(s => inScope(s.domainIds));

      // Aggregate by signalType
      const currentMap = new Map<string, number>();
      for (const s of scopedCurrent) currentMap.set(s.signalType, (currentMap.get(s.signalType) || 0) + 1);
      const priorMap = new Map<string, number>();
      for (const s of scopedPrior) priorMap.set(s.signalType, (priorMap.get(s.signalType) || 0) + 1);

      function trend(type: string): string {
        const curr = currentMap.get(type) || 0;
        const prev = priorMap.get(type) || 0;
        if (prev === 0) return curr > 0 ? " (new)" : "";
        const pct = Math.round(((curr - prev) / prev) * 100);
        if (pct > 0) return ` (\u2191${pct}% vs prior ${days}d)`;
        if (pct < 0) return ` (\u2193${Math.abs(pct)}% vs prior ${days}d)`;
        return " (flat)";
      }

      const emailSent = currentMap.get("email_sent") || 0;
      const emailReceived = currentMap.get("email_received") || 0;
      const meetingsHeld = currentMap.get("meeting_held") || 0;
      const docsEdited = currentMap.get("doc_edited") || 0;
      const docsCreated = currentMap.get("doc_created") || 0;
      const docsShared = currentMap.get("doc_shared") || 0;

      // Average response time (from already-fetched scoped signals)
      let avgResponseTime = "";
      const rtSignals = scopedCurrent
        .filter(s => s.signalType === "email_response_time")
        .slice(0, 100);
      if (rtSignals.length > 0) {
        const hours = rtSignals
          .map(s => {
            try {
              const m = s.metadata ? JSON.parse(s.metadata) : {};
              return m.responseTimeHours as number;
            } catch { return null; }
          })
          .filter((h): h is number => h !== null);
        if (hours.length > 0) {
          const avg = hours.reduce((a, b) => a + b, 0) / hours.length;
          avgResponseTime = `\n- Response time: avg ${avg.toFixed(1)} hours`;
        }
      }

      const lines = [
        `Activity Summary for ${entityLabel} (last ${days} days):`,
        `- Emails: ${emailSent} sent${trend("email_sent")}, ${emailReceived} received${trend("email_received")}`,
        `- Meetings: ${meetingsHeld} held${trend("meeting_held")}`,
        `- Documents: ${docsEdited} edited${trend("doc_edited")}, ${docsCreated} created${trend("doc_created")}, ${docsShared} shared`,
        avgResponseTime,
      ].filter(Boolean);

      // Add all other signal types not covered above
      const covered = new Set(["email_sent", "email_received", "meeting_held", "doc_edited", "doc_created", "doc_shared", "email_response_time", "meeting_frequency"]);
      for (const [type, count] of currentMap) {
        if (!covered.has(type)) {
          lines.push(`- ${type.replace(/_/g, " ")}: ${count}`);
        }
      }

      return lines.join("\n");
    }

    // ── Phase 3 Tools ──────────────────────────────────────────────────────

    case "get_initiatives": {
      const status = args.status ? String(args.status) : undefined;

      const where: Record<string, unknown> = { operatorId, pageType: "initiative", scope: "operator" };
      if (status) where.properties = { path: ["status"], equals: status };

      const pages = await prisma.knowledgePage.findMany({
        where,
        select: { slug: true, title: true, properties: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      if (pages.length === 0) return "No initiatives found matching those criteria.";

      return JSON.stringify(pages.map(p => {
        const props = (p.properties ?? {}) as Record<string, unknown>;
        return {
          id: p.slug,
          title: p.title.slice(0, 200),
          rationale: p.title.slice(0, 200),
          status: (props.status as string) ?? "proposed",
          proposalType: (props.proposal_type as string) ?? "general",
        };
      }));
    }

    case "create_system_job": {
      if (userId) {
        const caller = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
        if (caller?.role === "member") return "Admin access required to create system jobs.";
      }
      const title = String(args.title ?? "");
      const description = String(args.description ?? "");
      const cronExpression = String(args.cronExpression ?? "0 8 * * 1");
      const scope = String(args.scope ?? "company_wide");

      if (!title || !description) return "Title and description are required.";

      try {
        const { CronExpressionParser } = await import("cron-parser");
        const interval = CronExpressionParser.parse(cronExpression);
        const nextTriggerAt = interval.next().toDate();

        // Create wiki page for this job
        const slug = `system-job-${Date.now()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
        const now = new Date();
        await prisma.knowledgePage.create({
          data: {
            operatorId,
            slug,
            title: `System Job: ${title}`,
            pageType: "system_job",
            scope: "operator",
            status: "verified",
            content: buildSystemJobWikiContent({ description, cronExpression, scope }),
            crossReferences: [],
            synthesisPath: "manual",
            synthesizedByModel: "manual",
            confidence: 1.0,
            contentTokens: 0,
            lastSynthesizedAt: now,
          },
        });

        const job = await prisma.systemJob.create({
          data: {
            operatorId,
            title,
            description,
            cronExpression,
            wikiPageSlug: slug,
            scope,
            status: "active",
            source: "manual",
            importanceThreshold: 0.3,
            nextTriggerAt,
          },
        });

        return `System job "${title}" created successfully (ID: ${job.id}). Wiki page created at [[${slug}]]. It will first run ${nextTriggerAt.toISOString().split("T")[0]}. Schedule: ${cronExpression}. You can view and manage it on the System Jobs page.`;
      } catch (err) {
        return `Failed to create system job: ${err instanceof Error ? err.message : "Unknown error"}`;
      }
    }

    case "get_insights": {
      const query = args.query ? String(args.query) : undefined;
      const domainId = args.domainId ? String(args.domainId) : undefined;
      const insightType = args.insightType ? String(args.insightType) : undefined;

      const where: Record<string, unknown> = { operatorId, status: "active" };
      if (insightType) where.insightType = insightType;
      if (domainId) where.domainId = domainId;

      // Scope by shareScope
      if (visibleDomains && visibleDomains !== "all") {
        // Find user's AI entity
        const userAiEntities = await prisma.entity.findMany({
          where: {
            operatorId,
            entityType: { slug: "ai-agent" },
            primaryDomainId: { in: visibleDomains },
          },
          select: { id: true },
        });
        const userAiIds = userAiEntities.map(e => e.id);

        // Dept AI entities
        const deptAiEntities = await prisma.entity.findMany({
          where: {
            operatorId,
            entityType: { slug: { in: ["domain-ai", "hq-ai"] } },
            OR: [
              { primaryDomainId: { in: visibleDomains } },
              { ownerDomainId: { in: visibleDomains } },
            ],
          },
          select: { id: true },
        });

        where.OR = [
          { shareScope: "operator" },
          { shareScope: "department", aiEntityId: { in: [...userAiIds, ...deptAiEntities.map(e => e.id)] } },
          ...(userAiIds.length > 0 ? [{ shareScope: "personal", aiEntityId: { in: userAiIds } }] : []),
        ];
      }

      if (query) {
        where.description = { contains: query, mode: "insensitive" };
      }

      const insights = await prisma.operationalInsight.findMany({
        where,
        orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
        take: 15,
      });

      if (insights.length === 0) return "No insights found matching those criteria.";

      return JSON.stringify(insights.map(i => ({
        id: i.id,
        insightType: i.insightType,
        description: i.description.slice(0, 200),
        confidence: i.confidence,
        sampleSize: (() => { try { return JSON.parse(i.evidence).sampleSize; } catch { return null; } })(),
        shareScope: i.shareScope,
        promptModification: i.promptModification?.slice(0, 200) ?? null,
        createdAt: i.createdAt.toISOString(),
      })));
    }

    case "get_priorities": {
      // ExecutionPlan table dropped — return empty
      return "No priority items found. (Priority queue migrated to wiki-based workflow.)";
    }

    case "get_email_thread": {
      const threadId = String(args.threadId ?? "");
      if (!threadId) return "Please provide a thread ID.";

      // Department scope: resolve visible departments for filtering
      const threadDepts = await prisma.entity.findMany({
        where: {
          operatorId, category: "foundational", entityType: { slug: "domain" },
          ...domainVisFilter,
        },
        select: { id: true },
      });
      const threadDeptIds = new Set(threadDepts.map(d => d.id));

      // Find RawContent for this email thread via metadata threadId
      const rawEmails = await prisma.rawContent.findMany({
        where: {
          operatorId,
          sourceType: "email",
          rawBody: { not: null },
          rawMetadata: { path: ["threadId"], equals: threadId },
        },
        select: { sourceId: true, rawBody: true, rawMetadata: true },
        orderBy: { occurredAt: "asc" },
      });

      if (rawEmails.length === 0) {
        return "No emails found for this thread ID.";
      }

      // Department scope: check if any participant belongs to user's visible departments
      const hasThreadAccess = await checkParticipantScope(operatorId, rawEmails, visibleDomains);
      if (!hasThreadAccess) {
        return "I don't have visibility into that email thread's department.";
      }

      // Build body lookup from raw content
      const chunksBySourceId = new Map<string, string>();
      for (const r of rawEmails) {
        chunksBySourceId.set(r.sourceId, r.rawBody ?? "");
      }

      // Fetch events only for the known message IDs in this thread
      const messageIds = [...new Set(rawEmails.map((r) => r.sourceId))];
      let threadEvents: Array<{ eventType: string; payload: string; createdAt: Date }> = [];

      if (messageIds.length > 0) {
        // Query events matching these specific message external IDs
        const events = await prisma.event.findMany({
          where: {
            operatorId,
            source: "gmail",
            eventType: { in: ["email.sent", "email.received"] },
          },
          orderBy: { createdAt: "asc" },
          take: 500,
        });
        threadEvents = events.filter((e) => {
          try {
            const payload = JSON.parse(e.payload);
            return payload.threadId === threadId;
          } catch { return false; }
        });
      }

      if (threadEvents.length === 0 && rawEmails.length === 0) {
        return `No messages found for thread ${threadId}.`;
      }

      // If we have events, format from event data (richer metadata)
      if (threadEvents.length > 0) {
        const formatted = threadEvents.map((e) => {
          const p = JSON.parse(e.payload);
          const from = Array.isArray(p.from) ? p.from.map((f: { email: string; name?: string }) => f.name ? `${f.name} <${f.email}>` : f.email).join(", ") : p.from;
          const to = Array.isArray(p.to) ? p.to.map((t: { email: string; name?: string }) => t.name ? `${t.name} <${t.email}>` : t.email).join(", ") : p.to;
          const cc = p.cc && Array.isArray(p.cc) && p.cc.length > 0
            ? `\nCc: ${p.cc.map((c: { email: string; name?: string }) => c.name ? `${c.name} <${c.email}>` : c.email).join(", ")}`
            : "";
          const date = p.timestamp ? new Date(p.timestamp).toLocaleString() : "unknown";
          const body = chunksBySourceId.get(p.externalId)?.slice(0, 500) || p.snippet || "";
          return `[${p.direction?.toUpperCase() || e.eventType}] ${date}\nFrom: ${from}\nTo: ${to}${cc}\nSubject: ${p.subject}\n\n${body}`;
        });
        return `Thread ${threadId} (${threadEvents.length} messages):\n\n${formatted.join("\n\n---\n\n")}`;
      }

      // Fallback: format from raw content alone
      const formatted = rawEmails.map((r) => {
        const m = (r.rawMetadata ?? {}) as Record<string, unknown>;
        return `[${((m.direction as string) || "unknown").toUpperCase()}] ${m.date ? new Date(m.date as string).toLocaleString() : "unknown"}\nFrom: ${m.from || "unknown"} | To: ${Array.isArray(m.to) ? (m.to as string[]).join(", ") : m.to || "unknown"}\nSubject: ${m.subject || "(no subject)"}\n\n${(r.rawBody ?? "").slice(0, 500)}`;
      });
      return `Thread ${threadId} (${formatted.length} messages):\n\n${formatted.join("\n\n---\n\n")}`;
    }

    case "search_wiki": {
      const query = String(args.query ?? "");
      if (!query) return "Please provide a search query.";
      const scopeParam = args.scope ? String(args.scope) : "operator";
      const limit = typeof args.limit === "number" ? Math.min(args.limit, 10) : 5;

      const { searchPages: sp, searchSystemPages: ssp } = await import("@/lib/wiki-engine");
      const perLayerLimit = scopeParam === "all" ? Math.ceil(limit / 2) : limit;

      const operatorResults = (scopeParam === "operator" || scopeParam === "all")
        ? await sp(operatorId, query, { limit: perLayerLimit }).catch(() => [])
        : [];

      let systemResults: typeof operatorResults = [];
      if (scopeParam === "system" || scopeParam === "all") {
        const op = await prisma.operator.findUnique({
          where: { id: operatorId },
          select: { intelligenceAccess: true },
        });
        if (op?.intelligenceAccess) {
          systemResults = await ssp(query, { limit: perLayerLimit }).catch(() => []);
        }
      }

      // Interleave results so both layers are represented
      const all: typeof operatorResults = [];
      const maxLen = Math.max(operatorResults.length, systemResults.length);
      for (let i = 0; i < maxLen && all.length < limit; i++) {
        if (i < operatorResults.length) all.push(operatorResults[i]);
        if (i < systemResults.length && all.length < limit) all.push(systemResults[i]);
      }
      if (all.length === 0) return `No wiki pages found matching "${query}".`;

      return all.map(r => {
        const scopeTag = "scope" in r && r.scope === "system" ? " [system expertise]" : "";
        return `- ${r.title} [${r.pageType}]${scopeTag} (slug: ${r.slug}, confidence: ${r.confidence.toFixed(2)})\n  ${r.contentPreview}`;
      }).join("\n\n") + "\n\nUse read_wiki_page with a slug to read the full page.";
    }

    case "read_wiki_page": {
      const slug = String(args.slug ?? "");
      if (!slug) return "Please provide a page slug.";

      // Try operator-scoped first
      let page = await prisma.knowledgePage.findUnique({
        where: { operatorId_slug: { operatorId, slug } },
        select: { content: true, status: true, confidence: true, slug: true, title: true, pageType: true, id: true },
      });

      // Fallback to system-scoped (gated)
      if (!page) {
        const op = await prisma.operator.findUnique({
          where: { id: operatorId },
          select: { intelligenceAccess: true },
        });
        if (op?.intelligenceAccess) {
          page = await prisma.knowledgePage.findFirst({
            where: { scope: "system", slug, status: { in: ["verified", "stale"] }, OR: [{ stagingStatus: null }, { stagingStatus: "approved" }] },
            select: { content: true, status: true, confidence: true, slug: true, title: true, pageType: true, id: true },
          });
        }
      }

      if (!page) return `No wiki page found with slug "${slug}".`;
      if (page.status === "quarantined") return `Wiki page "${slug}" is quarantined (unreliable).`;

      // Increment use count (fire-and-forget)
      prisma.knowledgePage.update({
        where: { id: page.id },
        data: { reasoningUseCount: { increment: 1 } },
      }).catch(() => {});

      const statusNote = page.status !== "verified"
        ? `\n\nNote: This page is ${page.status} — may be outdated.`
        : "";

      return `Wiki page: ${page.title} [${page.pageType}] (confidence: ${page.confidence.toFixed(2)})${statusNote}\n\n${page.content}`;
    }

    case "web_search": {
      const query = String(args.query ?? "");
      if (!query) return "Please provide a search query.";
      try {
        const { webSearch, formatSearchResults } = await import("@/lib/web-search");
        const result = await webSearch(
          query,
          args.freshness ? { freshness: args.freshness as "day" | "week" | "month" } : undefined,
        );
        return formatSearchResults(result.results);
      } catch (err) {
        return `Web search failed: ${err instanceof Error ? err.message : "unknown error"}`;
      }
    }

    case "search_evidence": {
      const query = String(args.query ?? "");
      if (!query) return "Please provide a search query.";
      const maxResults = typeof args.maxResults === "number" ? Math.min(args.maxResults, 20) : 10;

      const rows = await prisma.$queryRaw<Array<{
        id: string; sourceChunkId: string; sourceType: string; extractions: unknown; extractedAt: Date;
      }>>`
        SELECT ee.id, ee."sourceChunkId", ee."sourceType", ee.extractions, ee."extractedAt"
        FROM "EvidenceExtraction" ee
        WHERE ee."operatorId" = ${operatorId}
          AND ee.extractions::text ILIKE ${`%${query}%`}
        ORDER BY ee."extractedAt" DESC
        LIMIT ${maxResults}
      `;

      if (rows.length === 0) return `No evidence found matching "${query}".`;

      const queryLower = query.toLowerCase();
      const lines: string[] = [`Found evidence in ${rows.length} extractions:`];
      for (const row of rows) {
        const claims = Array.isArray(row.extractions) ? row.extractions : [];
        const matching = claims.filter((c: any) =>
          c.claim?.toLowerCase().includes(queryLower) ||
          c.entities?.some((e: string) => e.toLowerCase().includes(queryLower))
        );
        if (matching.length === 0) continue;
        lines.push(`\n[${row.sourceType}] Chunk: ${row.sourceChunkId} (${row.extractedAt.toISOString().split("T")[0]})`);
        for (const c of matching) {
          lines.push(`  - [${c.type}] (${(c.confidence * 100).toFixed(0)}%) ${c.claim}`);
        }
      }
      return lines.join("\n");
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}

// ── Chat (Streaming) ─────────────────────────────────────────────────────────

export async function chat(
  operatorId: string,
  userMessage: string,
  history: AIMessage[],
  userRole?: string,
  orientation?: OrientationInfo,
  scopeInfo?: { userName?: string; domainName?: string; visibleDomains: string[] | "all" },
  userId?: string,
  contextInfo?: { contextType: string; contextText: string } | null,
  locale?: string,
): Promise<ReadableStream & { totalApiCostCents: number }> {
  // Build system prompt — orientation-aware or normal
  let systemPrompt: string;
  if (orientation) {
    const session = await prisma.orientationSession.findUnique({
      where: { id: orientation.sessionId },
    });
    if (session) {
      systemPrompt = await buildOrientationSystemPrompt(operatorId, session);
    } else {
      systemPrompt = await buildSystemPrompt(operatorId, userRole, scopeInfo, contextInfo?.contextText);
    }
  } else {
    systemPrompt = await buildSystemPrompt(operatorId, userRole, scopeInfo, contextInfo?.contextText);
  }

  // Locale directive — instruct AI to respond in user's preferred language
  if (locale === "da") {
    systemPrompt += "\n\nIMPORTANT: The user's preferred language is Danish. Respond in Danish. Use natural Danish business language. Keep technical terms in English where Danish professionals would naturally use them (e.g., 'dashboard', 'email', 'sync'). Do not translate product names like 'Qorpera' or connector names.";
  }

  // Select tools — orientation mode gets extra tools, context mode gets scoped tools
  const contextType = contextInfo?.contextType ?? null;
  const tools = orientation
    ? [...COPILOT_TOOLS, ...ORIENTATION_TOOLS]
    : getToolsForContext(contextType);
  const allowedToolNames = new Set(tools.map(t => t.name));

  // Build LLM messages — system prompt goes to instructions, not messages
  const llmHistory: LLMMessage[] = history
    .filter((m): m is AIMessage & { role: "user" | "assistant" | "tool" } => m.role !== "system")
    .map((m) => ({ ...m, role: m.role as "user" | "assistant" | "tool" }));
  const initialMessages: LLMMessage[] = [
    ...llmHistory,
    { role: "user", content: userMessage },
  ];

  const costTracker = { totalApiCostCents: 0 };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        let currentMessages = [...initialMessages];
        let maxIterations = 5;

        while (maxIterations > 0) {
          maxIterations--;

          const aiFn = orientation ? "orientation" as const : "copilot" as const;
          const response = await callLLM({
            instructions: systemPrompt,
            messages: currentMessages,
            tools,
            temperature: 0.3,
            aiFunction: aiFn,
            model: getModel("copilot"),
            operatorId,
            webSearch: true,
            thinking: true,
          });

          costTracker.totalApiCostCents += response.apiCostCents;

          if (!response.toolCalls?.length) {
            if (response.text) {
              controller.enqueue(encoder.encode(response.text));
            } else {
              for await (const chunk of streamLLM({
                instructions: systemPrompt,
                messages: currentMessages,
                temperature: 0.3,
                aiFunction: aiFn,
                model: getModel("copilot"),
                operatorId,
                webSearch: true,
                thinking: true,
              })) {
                controller.enqueue(encoder.encode(chunk));
              }
            }
            break;
          }

          // Add assistant message WITH tool_calls preserved
          currentMessages.push({
            role: "assistant",
            content: response.text || "",
            tool_calls: response.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            })),
          });

          // Execute each tool and add results as proper tool messages
          for (const toolCall of response.toolCalls) {
            // Defense in depth: don't execute tools not in the allowed set
            if (!allowedToolNames.has(toolCall.name)) {
              currentMessages.push({
                role: "tool",
                content: `Tool "${toolCall.name}" is not available in this context.`,
                tool_call_id: toolCall.id,
                name: toolCall.name,
              });
              continue;
            }
            const result = await executeTool(
              operatorId,
              toolCall.name,
              toolCall.arguments,
              orientation?.sessionId,
              scopeInfo?.visibleDomains ?? "all",
              userId,
            );
            currentMessages.push({
              role: "tool",
              content: result,
              tool_call_id: toolCall.id,
              name: toolCall.name,
            });
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const errStack = err instanceof Error ? err.stack : undefined;
        const errCause = err instanceof Error && err.cause ? String(err.cause) : undefined;
        console.error("[copilot] Chat error:", { message: errMsg, cause: errCause, stack: errStack });
        let detail = errMsg;
        if (errCause) detail += ` (cause: ${errCause})`;
        controller.enqueue(encoder.encode(`Error: ${detail}`));
      } finally {
        controller.close();
      }
    },
  });

  return Object.assign(stream, { get totalApiCostCents() { return costTracker.totalApiCostCents; } });
}
