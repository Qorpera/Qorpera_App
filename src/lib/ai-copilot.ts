import { prisma } from "@/lib/db";
import { callLLM, streamLLM, getModel, type AIMessage, type AITool, type LLMMessage } from "@/lib/ai-provider";
import { getEntityContext, searchEntities } from "@/lib/entity-resolution";
import { searchAround, formatTraversalForAgent } from "@/lib/graph-traversal";
import { listEntityTypes } from "@/lib/entity-model-store";
import { getBusinessContext, formatBusinessContext } from "@/lib/business-context";
import { buildOrientationSystemPrompt, buildDepartmentDataContext } from "@/lib/orientation-prompts";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";
import { getProvider } from "@/lib/connectors/registry";
import { decryptConfig, encryptConfig } from "@/lib/config-encryption";
import { HARDCODED_TYPE_DEFS } from "@/lib/hardcoded-type-defs";
import { canAccessEntity } from "@/lib/user-scope";
import { getWorkStreamContext, canMemberAccessWorkStream } from "@/lib/workstreams";

// ── Types ────────────────────────────────────────────────────────────────────

export type OrientationInfo = {
  sessionId: string;
  phase: "orienting";
} | null;

// ── Tool Definitions ─────────────────────────────────────────────────────────

const COPILOT_TOOLS: AITool[] = [
  {
    name: "lookup_entity",
    description: "Look up a specific entity by name or ID, returning its full context including properties, relationships, and recent mentions.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Entity name or ID to look up" },
        typeSlug: { type: "string", description: "Optional entity type slug to narrow the search" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_entities",
    description: "Search across all entities by keyword. Returns matching entities with their properties.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keyword" },
        typeSlug: { type: "string", description: "Optional entity type slug to filter by" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_around",
    description: "Explore the entity graph around a specific entity. Returns connected entities within a given number of hops.",
    parameters: {
      type: "object",
      properties: {
        entityId: { type: "string", description: "Starting entity ID" },
        maxHops: { type: "number", description: "Max relationship hops (default 2)" },
      },
      required: ["entityId"],
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
    name: "create_internal_entity",
    description: "Create an internal entity (team member, department, organization, process, etc.) in the knowledge graph. Optionally link it to other entities via relationships.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", description: "Entity type slug (e.g. team-member, department, organization, role, process)" },
        displayName: { type: "string", description: "Display name for the entity" },
        properties: { type: "object", description: "Key-value properties for the entity" },
        relationships: {
          type: "array",
          description: "Optional relationships to other entities",
          items: {
            type: "object",
            properties: {
              targetName: { type: "string", description: "Display name of the target entity" },
              relationshipType: { type: "string", description: "Relationship type slug (e.g. has-member, has-department, manages, reports-to)" },
            },
            required: ["targetName", "relationshipType"],
          },
        },
      },
      required: ["type", "displayName"],
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
        departmentName: {
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
    description: "Search uploaded documents across departments for relevant information. Use when the user asks about processes, policies, procedures, or any topic that might be covered in uploaded documents.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for" },
        departmentName: { type: "string", description: "Optional: limit search to a specific department" },
      },
      required: ["query"],
    },
  },
  {
    name: "create_situation_type",
    description: "Create a new situation type that the system will watch for. When creating a situation type, always specify which department it applies to using scopeDepartmentName. For example, if the user says 'overdue invoices are a problem in Finance', set scopeDepartmentName to 'Finance'.",
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
        scopeDepartmentName: { type: "string", description: "Name of the department to scope this situation type to. If provided without scopeEntityId, the department will be resolved by name." },
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
        departmentName: { type: "string", description: "Name of the department" },
      },
      required: ["departmentName"],
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
    name: "get_goals",
    description: "Get business goals. Use when the user asks about goals, objectives, targets, or what the company/department is working toward.",
    parameters: {
      type: "object",
      properties: {
        departmentId: { type: "string", description: "Filter to a specific department. Null returns HQ-level goals." },
        status: { type: "string", enum: ["active", "achieved", "paused"], description: "Goal status filter. Default: active." },
      },
    },
  },
  {
    name: "get_initiatives",
    description: "Get AI-proposed initiatives and their progress. Use when the user asks what the AI has proposed, what strategic work is happening, or about department AI activity.",
    parameters: {
      type: "object",
      properties: {
        departmentId: { type: "string", description: "Filter to a specific department." },
        status: { type: "string", enum: ["proposed", "approved", "executing", "completed", "rejected"], description: "Initiative status filter." },
        goalId: { type: "string", description: "Filter by parent goal ID." },
      },
    },
  },
  {
    name: "get_workstream",
    description: "Get details about a project or work stream. Use when the user asks about a specific project, grouped work, or 'what's happening with X'.",
    parameters: {
      type: "object",
      properties: {
        workStreamId: { type: "string", description: "Direct lookup by ID." },
        search: { type: "string", description: "Search by title if workStreamId not provided." },
      },
    },
  },
  {
    name: "get_delegations",
    description: "Get delegations — work assigned between AIs or from AI to humans. Use when the user asks 'what's been delegated to me', 'what tasks are assigned', or about AI-to-AI coordination.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "accepted", "completed", "returned"], description: "Delegation status filter." },
        assignedToMe: { type: "boolean", description: "If true, filter to delegations targeting the current user's AI entity or the user directly. Default: false." },
      },
    },
  },
  {
    name: "get_recurring_tasks",
    description: "Get recurring automated tasks. Use when the user asks 'what runs automatically', 'scheduled tasks', or about recurring work.",
    parameters: {
      type: "object",
      properties: {
        departmentId: { type: "string", description: "Filter to a specific department." },
        activeOnly: { type: "boolean", description: "Only show active tasks. Default: true." },
      },
    },
  },
  {
    name: "get_insights",
    description: "Get what the AI has learned from experience. Use when the user asks 'what has the AI learned', 'what works best for X', patterns, or effectiveness data.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search against insight descriptions (substring match)." },
        departmentId: { type: "string", description: "Filter by department." },
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
  situation: new Set(["get_recurring_tasks", "create_situation_type", "list_departments", "get_org_structure"]),
  initiative: new Set(["get_recurring_tasks", "get_delegations", "create_situation_type", "list_departments", "get_org_structure"]),
  workstream: new Set(["get_recurring_tasks", "create_situation_type", "list_departments", "get_org_structure"]),
};

export function getToolsForContext(contextType: string | null): typeof COPILOT_TOOLS {
  if (!contextType || !CONTEXT_EXCLUDED_TOOLS[contextType]) return COPILOT_TOOLS;
  const excluded = CONTEXT_EXCLUDED_TOOLS[contextType];
  return COPILOT_TOOLS.filter(t => !excluded.has(t.name));
}

// ── System Prompt Builder ────────────────────────────────────────────────────

async function buildSystemPrompt(operatorId: string, userRole?: string, scopeInfo?: { userName?: string; departmentName?: string; visibleDepts: string[] | "all" }, injectedContext?: string): Promise<string> {
  const visibleDepts = scopeInfo?.visibleDepts;
  const situationScopeWhere = visibleDepts && visibleDepts !== "all"
    ? { OR: [{ situationType: { scopeEntityId: { in: visibleDepts } } }, { situationType: { scopeEntityId: null } }] }
    : {};
  const situationTypeScopeWhere = visibleDepts && visibleDepts !== "all"
    ? { OR: [{ scopeEntityId: { in: visibleDepts } }, { scopeEntityId: null }] }
    : {};

  const [entityTypes, businessCtx, situationTypes, unreadNotifCount, pendingSituations, deptContext] = await Promise.all([
    listEntityTypes(operatorId),
    getBusinessContext(operatorId),
    prisma.situationType.findMany({
      where: { operatorId, enabled: true, ...situationTypeScopeWhere },
      select: { name: true, slug: true, description: true, autonomyLevel: true },
    }),
    prisma.notification.count({ where: { operatorId, read: false } }),
    prisma.situation.findMany({
      where: { operatorId, status: { in: ["proposed", "detected"] }, ...situationScopeWhere },
      include: { situationType: { select: { name: true } } },
      orderBy: { severity: "desc" },
      take: 5,
    }),
    buildDepartmentDataContext(operatorId, visibleDepts),
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

  const scopeNote = visibleDepts && visibleDepts !== "all"
    ? "\nIMPORTANT: You have limited visibility. Only discuss departments and data you can see. If asked about other departments, say you don't have visibility into that area."
    : "";

  const deptSection = deptContext
    ? `\nORGANIZATIONAL STRUCTURE:\n${deptContext}${scopeNote}\n`
    : "";

  // Scoped user framing
  let scopeFraming = "- Visibility: Full access across all departments.";
  if (scopeInfo && scopeInfo.visibleDepts !== "all" && scopeInfo.departmentName) {
    scopeFraming = `- Department: ${scopeInfo.departmentName}\n- Visibility: You are assisting ${scopeInfo.userName || "a user"} who works in the ${scopeInfo.departmentName} department. Focus your responses on matters relevant to their department.`;
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
- Look up entities by name or ID to see their full context, properties, and relationships
- Search across entities by keyword
- Explore the entity graph to discover connections
- List departments and get detailed department context
- Get operational briefings: use when user asks "how are things", "what's happening", "give me an update"
- Search department knowledge: use when user asks about policies, processes, or procedures
- Execute connector actions (e.g., send email, update contact, change deal stage in HubSpot)
- Search emails: use when user asks about emails or correspondence (searches Gmail + Outlook)
- Get email thread: retrieve the full conversation for a specific thread ID
- Search documents: use when user asks about documents, files, spreadsheets, or presentations (searches Google Drive + OneDrive)
- Search messages: use when user asks about Slack or Teams conversations, channel discussions, or internal chat
- Get message thread: retrieve the full thread from Slack or Teams by thread ID
- Get activity summary: use when user asks about activity levels, trends, communication volume, or what's been happening
- Get goals and initiatives: use when user asks about objectives, targets, strategic work, or AI proposals
- Get work streams: use when user asks about projects, grouped work, or progress
- Get delegations: use when user asks about assigned work, AI-to-AI coordination, or human tasks
- Get recurring tasks: use when user asks about scheduled or automated work
- Get insights: use when user asks what the AI has learned, best approaches, or effectiveness patterns
- Get priorities: use when user asks what needs attention, what's most urgent, or what to work on next
- Create new situation types scoped to specific departments

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
  visibleDepts: string[],
  operatorId: string,
): Promise<string[]> {
  const entities = await prisma.entity.findMany({
    where: {
      operatorId,
      entityType: { slug: { in: ["ai-agent", "department-ai", "hq-ai"] } },
      OR: [
        { parentDepartmentId: { in: visibleDepts } },
        { ownerDepartmentId: { in: visibleDepts } },
      ],
    },
    select: { id: true },
  });
  return entities.map(e => e.id);
}

export async function executeTool(
  operatorId: string,
  toolName: string,
  args: Record<string, unknown>,
  orientationSessionId?: string,
  visibleDepts?: string[] | "all",
  userId?: string,
): Promise<string> {
  const deptVisFilter = visibleDepts && visibleDepts !== "all" ? { id: { in: visibleDepts } } : {};
  switch (toolName) {
    case "lookup_entity": {
      const query = String(args.query ?? "");
      const typeSlug = args.typeSlug ? String(args.typeSlug) : undefined;
      const context = await getEntityContext(operatorId, query, typeSlug);
      if (!context) return `No entity found matching "${query}".`;

      // Scope check
      if (visibleDepts && visibleDepts !== "all") {
        const allowed = await canAccessEntity(context.id, visibleDepts, operatorId);
        if (!allowed) return `I don't have visibility into that entity's department.`;
      }

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

    case "search_entities": {
      const query = String(args.query ?? "");
      const typeSlug = args.typeSlug ? String(args.typeSlug) : undefined;
      const limit = typeof args.limit === "number" ? args.limit : 10;
      let results = await searchEntities(operatorId, query, typeSlug, limit);

      // Post-filter by department scope
      if (visibleDepts && visibleDepts !== "all") {
        const visibleSet = new Set(visibleDepts);
        results = results.filter((e: { parentDepartmentId?: string | null; category?: string; id?: string }) => {
          if (e.category === "foundational") return visibleSet.has(e.id || "");
          if (e.category === "external") return true;
          if (e.parentDepartmentId) return visibleSet.has(e.parentDepartmentId);
          return false;
        });
      }

      if (results.length === 0) return `No entities found matching "${query}".`;

      return results.map((e) => {
        const props = Object.entries(e.properties).slice(0, 4)
          .map(([k, v]) => `${k}=${v}`).join(", ");
        return `- ${e.displayName} [${e.typeName}] (${e.id})${props ? ` {${props}}` : ""}`;
      }).join("\n");
    }

    case "search_around": {
      const entityId = String(args.entityId ?? "");
      const maxHops = typeof args.maxHops === "number" ? args.maxHops : 2;

      // Scope check on the starting entity
      if (visibleDepts && visibleDepts !== "all") {
        const allowed = await canAccessEntity(entityId, visibleDepts, operatorId);
        if (!allowed) return `I don't have visibility into that entity's department.`;
      }

      const result = await searchAround(operatorId, entityId, maxHops);

      // Post-filter traversal results by department scope
      if (visibleDepts && visibleDepts !== "all" && result.nodes.length > 0) {
        const visibleSet = new Set(visibleDepts);
        const nodeIds = result.nodes.map((n) => n.id);
        const entities = await prisma.entity.findMany({
          where: { id: { in: nodeIds } },
          select: { id: true, parentDepartmentId: true, category: true },
        });
        const entityMap = new Map(entities.map((e) => [e.id, e]));
        const allowedIds = new Set(
          result.nodes
            .filter((n) => {
              const e = entityMap.get(n.id);
              if (!e) return false;
              if (e.category === "foundational") return visibleSet.has(e.id);
              if (e.category === "external") return true;
              if (e.parentDepartmentId) return visibleSet.has(e.parentDepartmentId);
              return false;
            })
            .map((n) => n.id),
        );
        result.nodes = result.nodes.filter((n) => allowedIds.has(n.id));
        result.edges = result.edges.filter((e) => allowedIds.has(e.source) && allowedIds.has(e.target));
      }

      if (result.nodes.length === 0) return "No entities found in graph traversal.";

      return formatTraversalForAgent(result);
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

    // ── Internal Entity Tools ───────────────────────────────────────────────

    case "create_internal_entity": {
      const typeSlug = String(args.type ?? "");
      const displayName = String(args.displayName ?? "");
      const properties = (args.properties ?? {}) as Record<string, string>;
      const relationships = Array.isArray(args.relationships) ? args.relationships as Array<{ targetName: string; relationshipType: string }> : [];

      // Find or create entity type
      let entityType = await prisma.entityType.findFirst({
        where: { operatorId, slug: typeSlug },
      });
      if (!entityType) {
        const def = HARDCODED_TYPE_DEFS[typeSlug];
        entityType = await prisma.entityType.create({
          data: {
            operatorId,
            slug: typeSlug,
            name: def?.name ?? typeSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            icon: def?.icon ?? "box",
            color: def?.color ?? "#a855f7",
            defaultCategory: def?.defaultCategory ?? "digital",
          },
        });
      }

      // Create entity
      const entity = await prisma.entity.create({
        data: {
          operatorId,
          entityTypeId: entityType.id,
          displayName,
          sourceSystem: "manual",
        },
      });

      // Create properties
      for (const [key, value] of Object.entries(properties)) {
        let prop = await prisma.entityProperty.findFirst({
          where: { entityTypeId: entityType.id, slug: key },
        });
        if (!prop) {
          prop = await prisma.entityProperty.create({
            data: {
              entityTypeId: entityType.id,
              slug: key,
              name: key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
              dataType: "STRING",
            },
          });
        }
        await prisma.propertyValue.create({
          data: { entityId: entity.id, propertyId: prop.id, value: String(value) },
        });
      }

      // Create relationships
      const relResults: string[] = [];
      for (const rel of relationships) {
        const target = await prisma.entity.findFirst({
          where: { operatorId, displayName: { contains: rel.targetName }, status: "active" },
          select: { id: true, displayName: true, entityTypeId: true },
        });
        if (!target) {
          relResults.push(`Target "${rel.targetName}" not found — skipped.`);
          continue;
        }
        const { relateEntities } = await import("@/lib/entity-resolution");
        await relateEntities(operatorId, entity.id, target.id, rel.relationshipType);
        relResults.push(`${displayName} --[${rel.relationshipType}]--> ${target.displayName}`);
      }

      return [
        `Created entity "${displayName}" [${typeSlug}] (ID: ${entity.id})`,
        relResults.length > 0 ? `Relationships:\n${relResults.map((r) => `  ${r}`).join("\n")}` : null,
      ].filter(Boolean).join("\n");
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
        where: { operatorId, category: "foundational", entityType: { slug: "department" }, status: "active", ...deptVisFilter },
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
          where: { operatorId, parentDepartmentId: dept.id, category: "base", status: "active" },
          include: {
            propertyValues: { include: { property: { select: { slug: true } } } },
          },
          orderBy: { displayName: "asc" },
        });

        // Load cross-department members
        const crossRels = await prisma.relationship.findMany({
          where: {
            OR: [
              { toEntityId: dept.id, relationshipType: { slug: "department-member" }, fromEntity: { category: "base", status: "active" } },
              { fromEntityId: dept.id, relationshipType: { slug: "department-member" }, toEntity: { category: "base", status: "active" } },
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
      const scopeDepartmentName = args.scopeDepartmentName ? String(args.scopeDepartmentName) : null;

      // Resolve department name to entity ID if needed
      if (scopeDepartmentName && !scopeEntityId) {
        const dept = await prisma.entity.findFirst({
          where: {
            operatorId,
            category: "foundational",
            displayName: { contains: scopeDepartmentName },
            entityType: { slug: "department" },
            status: "active",
          },
        });
        if (dept) scopeEntityId = dept.id;
      }

      // Verify visibility
      if (scopeEntityId && visibleDepts !== "all" && visibleDepts && !visibleDepts.includes(scopeEntityId)) {
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
        ? ` Scoped to ${scopeDepartmentName || "department"} (${scopeEntityId}).`
        : "";
      return `Created situation type "${name}" (${slug}, ID: ${situationType.id}).${scopeNote} It will run in supervised mode — I'll always ask before taking any action.`;
    }

    case "create_retrospective_situation": {
      const situationTypeId = String(args.situationTypeId ?? "");
      const entityDescription = String(args.entityDescription ?? "");
      const summary = String(args.summary ?? "");
      const actionTaken = String(args.actionTaken ?? "");
      const outcome = String(args.outcome ?? "neutral");
      const outcomeDetails = args.outcomeDetails ? String(args.outcomeDetails) : null;

      const situation = await prisma.situation.create({
        data: {
          operatorId,
          situationTypeId,
          source: "retrospective",
          status: "resolved",
          contextSnapshot: JSON.stringify({ entityDescription, summary }),
          actionTaken: JSON.stringify({ description: actionTaken }),
          outcome,
          outcomeDetails: outcomeDetails ? JSON.stringify({ details: outcomeDetails }) : null,
          resolvedAt: new Date(),
        },
      });

      return `Recorded retrospective example (ID: ${situation.id}): "${summary}" — outcome: ${outcome}. This helps me learn from your past experience.`;
    }

    case "list_departments": {
      const departments = await prisma.entity.findMany({
        where: { operatorId, category: "foundational", entityType: { slug: "department" }, status: "active", ...deptVisFilter },
        select: { id: true, displayName: true, description: true },
        orderBy: { displayName: "asc" },
      });

      if (departments.length === 0) return "No departments found.";

      const results: string[] = [];
      for (const dept of departments) {
        const [memberCount, digitalCount, docCount] = await Promise.all([
          prisma.entity.count({ where: { parentDepartmentId: dept.id, category: "base", status: "active" } }),
          prisma.entity.count({ where: { parentDepartmentId: dept.id, category: "digital", status: "active" } }),
          prisma.internalDocument.count({ where: { departmentId: dept.id, operatorId, status: { not: "replaced" } } }),
        ]);

        let line = `- ${dept.displayName} (ID: ${dept.id})`;
        if (dept.description) line += ` — ${dept.description}`;
        line += `\n    ${memberCount} people, ${digitalCount} synced entities, ${docCount} documents`;
        results.push(line);
      }

      return results.join("\n");
    }

    case "get_department_context": {
      const name = String(args.departmentName ?? args.department_name ?? "");
      const dept = await prisma.entity.findFirst({
        where: {
          operatorId,
          category: "foundational",
          displayName: { contains: name },
          status: "active",
          ...deptVisFilter,
        },
        select: { id: true, displayName: true, description: true },
      });

      if (!dept) return `Department "${name}" not found or not accessible.`;

      // Home members
      const homeMembers = await prisma.entity.findMany({
        where: { operatorId, parentDepartmentId: dept.id, category: "base", status: "active" },
        include: { propertyValues: { include: { property: { select: { slug: true } } } } },
        orderBy: { displayName: "asc" },
      });

      // Cross-department members + digital entities via department-member relationships
      const deptMemberRels = await prisma.relationship.findMany({
        where: {
          OR: [
            { fromEntityId: dept.id, relationshipType: { slug: "department-member" } },
            { toEntityId: dept.id, relationshipType: { slug: "department-member" } },
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
        where: { departmentId: dept.id, operatorId, status: { not: "replaced" } },
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

      // Active situations
      const activeSits = await prisma.situation.findMany({
        where: {
          operatorId,
          situationType: { scopeEntityId: dept.id },
          status: { in: ["detected", "proposed", "reasoning", "executing", "auto_executing"] },
        },
        include: { situationType: { select: { name: true } } },
        take: 10,
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
      const deptName = args.departmentName ? String(args.departmentName) : null;
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
            operatorId, category: "foundational", entityType: { slug: "department" },
            displayName: { contains: deptName },
            status: "active",
            ...deptVisFilter,
          },
          select: { id: true, displayName: true, description: true },
        });
        if (!dept) return `Department "${deptName}" not found or not accessible.`;
        targetDepts = [dept];
      } else {
        targetDepts = await prisma.entity.findMany({
          where: {
            operatorId, category: "foundational", entityType: { slug: "department" },
            status: "active", ...deptVisFilter,
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
      if (visibleDepts && visibleDepts !== "all") {
        planScopeFilter.OR = [
          {
            sourceType: "situation",
            situation: {
              OR: [
                { situationType: { scopeEntityId: { in: visibleDepts } } },
                { situationType: { scopeEntityId: null } },
              ],
            },
          },
          {
            sourceType: "initiative",
            initiative: { goal: { departmentId: { in: visibleDepts } } },
          },
          { sourceType: { in: ["recurring", "delegation"] } },
        ];
      }

      // Build initiative scope filter
      const initScopeFilter: Record<string, unknown> = { operatorId };
      if (visibleDepts && visibleDepts !== "all") {
        initScopeFilter.goal = {
          OR: [{ departmentId: { in: visibleDepts } }, { departmentId: null }],
        };
      }

      // Resolve visible AI entity IDs (used by delegation, insight, recurring scopes)
      let briefingAiIds: string[] | null = null;
      let briefingDelegationScoped = false;
      if (visibleDepts && visibleDepts !== "all") {
        briefingAiIds = await getVisibleAiEntityIds(visibleDepts as string[], operatorId);
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
      if (visibleDepts && visibleDepts !== "all") {
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
      if (visibleDepts && visibleDepts !== "all") {
        if (briefingAiIds && briefingAiIds.length > 0) {
          recurringScope.aiEntityId = { in: briefingAiIds };
        } else {
          // No visible AI entities — recurring section will be empty
          recurringScope.id = "__impossible__";
        }
      }

      // Query all sections in parallel
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
        recurringTasksDueToday,
      ] = await Promise.all([
        // Situations by department
        Promise.all(targetDepts.map(async (dept) => {
          const situations = await prisma.situation.findMany({
            where: {
              operatorId,
              createdAt: { gte: periodStart },
              situationType: { scopeEntityId: dept.id },
            },
            include: { situationType: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
          });
          return { dept, situations };
        })),
        // Unscoped situations
        prisma.situation.findMany({
          where: {
            operatorId, createdAt: { gte: periodStart },
            situationType: { scopeEntityId: null },
          },
          include: { situationType: { select: { name: true } } },
        }),
        // Top 5 priority items
        prisma.executionPlan.findMany({
          ...({ where: planScopeFilter }),
          orderBy: [{ priorityScore: "desc" }, { createdAt: "desc" }],
          take: 5,
          select: {
            id: true,
            sourceType: true,
            sourceId: true,
            priorityScore: true,
            currentStepOrder: true,
            priorityOverride: { select: { overrideType: true, snoozeUntil: true } },
            steps: { select: { title: true, sequenceOrder: true }, orderBy: { sequenceOrder: "asc" } },
          },
        }),
        // Executing initiatives count
        prisma.initiative.count({ where: { ...initScopeFilter, status: "executing" } }),
        // Proposed initiatives awaiting approval
        prisma.initiative.count({ where: { ...initScopeFilter, status: "proposed" } }),
        // Pending delegations (need admin approval) — 0 when scoped with no AI entities
        (briefingDelegationScoped && (!briefingAiIds || briefingAiIds.length === 0))
          ? Promise.resolve(0)
          : prisma.delegation.count({ where: { ...delegationScopeFilter, status: "pending" } }),
        // Human tasks awaiting completion
        (briefingDelegationScoped && (!briefingAiIds || briefingAiIds.length === 0))
          ? Promise.resolve(0)
          : prisma.delegation.count({ where: { ...delegationScopeFilter, status: "accepted", toUserId: { not: null } } }),
        // Active FollowUps count
        prisma.followUp.count({ where: { operatorId, status: "watching" } }),
        // FollowUps triggering within 24 hours
        prisma.followUp.findMany({
          where: {
            operatorId,
            status: "watching",
            triggerAt: { lte: twentyFourHoursFromNow, gte: now },
          },
          select: { id: true, triggerAt: true },
          take: 5,
        }),
        // Recent insights (last 7 days)
        prisma.operationalInsight.findMany({
          where: insightScopeFilter,
          orderBy: { confidence: "desc" },
          take: 3,
          select: { description: true, confidence: true, insightType: true },
        }),
        // Recurring tasks due in next 24 hours
        prisma.recurringTask.findMany({
          where: recurringScope,
          select: { title: true, nextTriggerAt: true },
          take: 5,
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

      // Resolve priority plan titles
      const priSitIds = priorityPlans.filter(p => p.sourceType === "situation").map(p => p.sourceId);
      const priInitIds = priorityPlans.filter(p => p.sourceType === "initiative").map(p => p.sourceId);
      const [priSits, priInits] = await Promise.all([
        priSitIds.length > 0
          ? prisma.situation.findMany({
              where: { id: { in: priSitIds }, operatorId },
              select: { id: true, situationType: { select: { name: true } } },
            })
          : [],
        priInitIds.length > 0
          ? prisma.initiative.findMany({
              where: { id: { in: priInitIds }, operatorId },
              select: { id: true, rationale: true },
            })
          : [],
      ]);
      const priTitleMap = new Map<string, string>();
      for (const s of priSits) priTitleMap.set(s.id, s.situationType.name);
      for (const i of priInits) priTitleMap.set(i.id, i.rationale.slice(0, 80));

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

      const recurringSection = recurringTasksDueToday.length > 0
        ? `\n  Recurring tasks due today: ${recurringTasksDueToday.map(t => t.title).join(", ")}`
        : `\n  Recurring tasks due today: none`;

      const header = deptName
        ? `Operational briefing for ${deptName} (${period}):`
        : `Operational briefing across ${targetDepts.length} departments (${period}):`;

      return `${header}\n\n${sections.join("\n\n")}${prioritySection}${initiativeSection}${delegationSection}${followUpSection}${insightSection}${recurringSection}`;
    }

    case "search_department_knowledge": {
      const query = String(args.query ?? "");
      if (!query) return "Please provide a search query.";

      let searchDeptIds: string[] = [];

      if (args.departmentName) {
        const dept = await prisma.entity.findFirst({
          where: {
            operatorId, category: "foundational", entityType: { slug: "department" },
            displayName: { contains: String(args.departmentName) },
            ...deptVisFilter,
          },
          select: { id: true },
        });
        if (dept) searchDeptIds = [dept.id];
        else return `Department "${args.departmentName}" not found or not accessible.`;
      } else {
        const depts = await prisma.entity.findMany({
          where: {
            operatorId, category: "foundational", entityType: { slug: "department" },
            ...deptVisFilter,
          },
          select: { id: true },
        });
        searchDeptIds = depts.map(d => d.id);
      }

      if (searchDeptIds.length === 0) return "No departments available to search.";

      try {
        const { retrieveRelevantContext } = await import("@/lib/rag/retriever");
        const results = await retrieveRelevantContext(query, operatorId, searchDeptIds, 5,
          userId ? { userId, skipUserFilter: false } : undefined);

        if (results.length === 0) return "No relevant documents found for this query.";

        return results
          .map(r => `From "${r.documentName}" (${r.departmentName}, relevance: ${r.score.toFixed(2)}):\n${r.content.slice(0, 500)}`)
          .join("\n\n---\n\n");
      } catch {
        return "Document search is not available — embeddings may not be configured.";
      }
    }

    case "search_emails": {
      const query = String(args.query ?? "");
      if (!query) return "Please provide a search query.";
      const limit = typeof args.limit === "number" ? args.limit : 5;

      // Resolve visible department IDs for scoping
      let searchDeptIds: string[] = [];
      const depts = await prisma.entity.findMany({
        where: {
          operatorId, category: "foundational", entityType: { slug: "department" },
          ...deptVisFilter,
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
          departmentIds: searchDeptIds.length > 0 ? searchDeptIds : undefined,
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
          operatorId, category: "foundational", entityType: { slug: "department" },
          ...deptVisFilter,
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
          departmentIds: docDeptIds.length > 0 ? docDeptIds : undefined,
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
          operatorId, category: "foundational", entityType: { slug: "department" },
          ...deptVisFilter,
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
          departmentIds: msgDeptIds.length > 0 ? msgDeptIds : undefined,
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
          operatorId, category: "foundational", entityType: { slug: "department" },
          ...deptVisFilter,
        },
        select: { id: true },
      });
      const msgThreadDeptIds = new Set(msgThreadDepts.map(d => d.id));

      try {
        // Query ContentChunks that match the thread
        const metadataFilter = sourceType === "slack_message"
          ? { path: ["threadTs"], equals: threadId }
          : { path: ["messageId"], equals: threadId };

        let chunks = await prisma.contentChunk.findMany({
          where: {
            operatorId,
            sourceType,
            metadata: metadataFilter,
          },
          select: { content: true, metadata: true, sourceId: true, departmentIds: true },
          orderBy: { createdAt: "asc" },
          take: 20,
        });

        // Also check for standalone messages where sourceId matches
        if (chunks.length === 0) {
          chunks = await prisma.contentChunk.findMany({
            where: {
              operatorId,
              sourceType,
              sourceId: threadId,
            },
            select: { content: true, metadata: true, sourceId: true, departmentIds: true },
            orderBy: { createdAt: "asc" },
            take: 20,
          });
        }

        if (chunks.length === 0) return "No messages found for this thread ID.";

        // Department scope check on chunks
        if (visibleDepts && visibleDepts !== "all" && msgThreadDeptIds.size > 0) {
          const beforeCount = chunks.length;
          chunks = chunks.filter((c) => {
            const dIds: string[] = c.departmentIds ? JSON.parse(c.departmentIds) : [];
            return dIds.length === 0 || dIds.some((d) => msgThreadDeptIds.has(d));
          });
          if (chunks.length === 0 && beforeCount > 0) {
            return "I don't have visibility into that message thread's department.";
          }
        }

        return chunks
          .map((c) => c.content.slice(0, 1000))
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
      if (visibleDepts && visibleDepts !== "all") {
        const actDepts = await prisma.entity.findMany({
          where: {
            operatorId, category: "foundational", entityType: { slug: "department" },
            ...deptVisFilter,
          },
          select: { id: true },
        });
        scopeDeptIds = new Set(actDepts.map(d => d.id));
        if (scopeDeptIds.size === 0) return "No departments available for activity summary.";
      }

      // Fetch raw signals (departmentIds is JSON, can't groupBy with scope filter)
      const rawCurrent = await prisma.activitySignal.findMany({
        where: { operatorId, occurredAt: { gte: since }, ...entityFilter },
        select: { signalType: true, departmentIds: true, metadata: true },
      });
      const rawPrior = await prisma.activitySignal.findMany({
        where: { operatorId, occurredAt: { gte: priorStart, lt: since }, ...entityFilter },
        select: { signalType: true, departmentIds: true },
      });

      // Department scope filter helper
      function inScope(deptIdsJson: string | null): boolean {
        if (!scopeDeptIds) return true; // admin sees all
        if (!deptIdsJson) return true; // signals without department routing are visible
        try {
          const dIds: string[] = JSON.parse(deptIdsJson);
          return dIds.length === 0 || dIds.some(d => scopeDeptIds!.has(d));
        } catch { return true; }
      }

      const scopedCurrent = rawCurrent.filter(s => inScope(s.departmentIds));
      const scopedPrior = rawPrior.filter(s => inScope(s.departmentIds));

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

    case "get_goals": {
      const departmentId = args.departmentId ? String(args.departmentId) : undefined;
      const status = args.status ? String(args.status) : "active";

      const where: Record<string, unknown> = { operatorId, status };
      if (departmentId) where.departmentId = departmentId;

      if (visibleDepts && visibleDepts !== "all") {
        where.OR = [
          { departmentId: { in: visibleDepts } },
          { departmentId: null },
        ];
      }

      const goals = await prisma.goal.findMany({
        where,
        include: { _count: { select: { initiatives: true } } },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      });

      if (goals.length === 0) return "No goals found matching those criteria.";

      return JSON.stringify(goals.map(g => ({
        id: g.id,
        title: g.title,
        description: g.description.slice(0, 200),
        priority: g.priority,
        status: g.status,
        deadline: g.deadline?.toISOString() ?? null,
        departmentId: g.departmentId,
        initiativeCount: g._count.initiatives,
      })));
    }

    case "get_initiatives": {
      const departmentId = args.departmentId ? String(args.departmentId) : undefined;
      const status = args.status ? String(args.status) : undefined;
      const goalId = args.goalId ? String(args.goalId) : undefined;

      const where: Record<string, unknown> = { operatorId };
      if (status) where.status = status;
      if (goalId) where.goalId = goalId;
      if (departmentId) where.goal = { departmentId };

      // Scope: initiatives where the goal's department is in visibleDepts, or HQ goals
      if (visibleDepts && visibleDepts !== "all") {
        where.goal = {
          ...(typeof where.goal === "object" ? where.goal as Record<string, unknown> : {}),
          OR: [
            { departmentId: { in: visibleDepts } },
            { departmentId: null },
          ],
        };
      }

      const initiatives = await prisma.initiative.findMany({
        where,
        include: {
          goal: { select: { title: true } },
          executionPlan: {
            select: {
              status: true,
              currentStepOrder: true,
              _count: { select: { steps: true } },
              steps: { where: { status: "completed" }, select: { id: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      if (initiatives.length === 0) return "No initiatives found matching those criteria.";

      // Resolve workstream titles
      const initIds = initiatives.map(i => i.id);
      const wsItems = initIds.length > 0
        ? await prisma.workStreamItem.findMany({
            where: { itemType: "initiative", itemId: { in: initIds } },
            select: { itemId: true, workStream: { select: { title: true } } },
          })
        : [];
      const wsMap = new Map(wsItems.map(w => [w.itemId, w.workStream.title]));

      return JSON.stringify(initiatives.map(i => ({
        id: i.id,
        title: i.rationale.slice(0, 200),
        rationale: i.rationale.slice(0, 200),
        status: i.status,
        goalTitle: i.goal?.title ?? null,
        planStatus: i.executionPlan?.status ?? null,
        stepsCompleted: i.executionPlan?.steps.length ?? 0,
        stepsTotal: i.executionPlan?._count.steps ?? 0,
        workStreamTitle: wsMap.get(i.id) ?? null,
      })));
    }

    case "get_workstream": {
      const workStreamId = args.workStreamId ? String(args.workStreamId) : undefined;
      const search = args.search ? String(args.search) : undefined;

      if (workStreamId) {
        const ctx = await getWorkStreamContext(workStreamId);
        if (!ctx) return "Work stream not found.";

        // Scope check using canMemberAccessWorkStream
        if (visibleDepts && visibleDepts !== "all" && userId) {
          const canAccess = await canMemberAccessWorkStream(userId, workStreamId, operatorId, visibleDepts as string[]);
          if (!canAccess) return "You don't have access to this project.";
        }

        // Load children count
        const childCount = await prisma.workStream.count({
          where: { parentWorkStreamId: workStreamId },
        });

        return JSON.stringify({
          id: ctx.id,
          title: ctx.title,
          description: ctx.description,
          status: ctx.status,
          goalTitle: ctx.goal?.title ?? null,
          items: ctx.items.map(i => ({ type: i.type, title: i.summary.slice(0, 200), status: i.status })),
          parentTitle: ctx.parent?.title ?? null,
          childCount,
        });
      }

      if (search) {
        const workstreams = await prisma.workStream.findMany({
          where: {
            operatorId,
            title: { contains: search, mode: "insensitive" },
          },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            goalId: true,
            _count: { select: { items: true, children: true } },
          },
          take: 10,
        });

        // Scope filter: workstream must contain an item linked to a visible department
        let filtered = workstreams;
        if (visibleDepts && visibleDepts !== "all" && userId) {
          const accessible: typeof workstreams = [];
          for (const ws of workstreams) {
            const canAccess = await canMemberAccessWorkStream(userId, ws.id, operatorId, visibleDepts as string[]);
            if (canAccess) accessible.push(ws);
          }
          filtered = accessible;
        }

        if (filtered.length === 0) return `No work streams found matching "${search}".`;

        return JSON.stringify(filtered.map(ws => ({
          id: ws.id,
          title: ws.title,
          description: ws.description?.slice(0, 200) ?? null,
          status: ws.status,
          itemCount: ws._count.items,
          childCount: ws._count.children,
        })));
      }

      return "Please provide either a workStreamId or a search term.";
    }

    case "get_delegations": {
      const status = args.status ? String(args.status) : undefined;
      const assignedToMe = args.assignedToMe === true;

      const where: Record<string, unknown> = { operatorId };
      if (status) where.status = status;

      if (assignedToMe) {
        if (!userId) return "No delegations found — user context not available.";

        // Find the current user's personal AI entity
        const userAiEntity = await prisma.entity.findFirst({
          where: { operatorId, ownerUserId: userId, entityType: { slug: "ai-agent" } },
          select: { id: true },
        });

        const orClauses: Record<string, unknown>[] = [];
        if (userAiEntity) {
          orClauses.push({ toAiEntityId: userAiEntity.id });
        }
        orClauses.push({ toUserId: userId });

        where.OR = orClauses;
      }

      // Scope filter (only when not assignedToMe — that path is already scoped to the user)
      if (visibleDepts && visibleDepts !== "all" && !assignedToMe) {
        const aiIds = await getVisibleAiEntityIds(visibleDepts as string[], operatorId);
        if (aiIds.length === 0) {
          return "No delegations found for your departments.";
        }
        where.OR = [
          { fromAiEntityId: { in: aiIds } },
          { toAiEntityId: { in: aiIds } },
        ];
      }

      const delegations = await prisma.delegation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      if (delegations.length === 0) return "No delegations found.";

      // Resolve entity names
      const entityIds = new Set<string>();
      for (const d of delegations) {
        entityIds.add(d.fromAiEntityId);
        if (d.toAiEntityId) entityIds.add(d.toAiEntityId);
      }
      const entities = entityIds.size > 0
        ? await prisma.entity.findMany({
            where: { id: { in: [...entityIds] } },
            select: { id: true, displayName: true },
          })
        : [];
      const nameMap = new Map(entities.map(e => [e.id, e.displayName]));

      // Resolve linked item titles
      const sitIds = delegations.map(d => d.situationId).filter(Boolean) as string[];
      const initIds = delegations.map(d => d.initiativeId).filter(Boolean) as string[];
      const [situations, inits] = await Promise.all([
        sitIds.length > 0
          ? prisma.situation.findMany({
              where: { id: { in: sitIds } },
              select: { id: true, situationType: { select: { name: true } } },
            })
          : [],
        initIds.length > 0
          ? prisma.initiative.findMany({
              where: { id: { in: initIds } },
              select: { id: true, rationale: true },
            })
          : [],
      ]);
      const sitTitleMap = new Map(situations.map(s => [s.id, s.situationType.name]));
      const initTitleMap = new Map(inits.map(i => [i.id, i.rationale.slice(0, 100)]));

      return JSON.stringify(delegations.map(d => ({
        id: d.id,
        instruction: d.instruction.slice(0, 200),
        status: d.status,
        sourceAiName: nameMap.get(d.fromAiEntityId) ?? "Unknown",
        targetName: d.toAiEntityId
          ? nameMap.get(d.toAiEntityId) ?? "Unknown AI"
          : d.toUserId ?? "Unknown User",
        type: d.toAiEntityId ? "ai-to-ai" : "ai-to-human",
        createdAt: d.createdAt.toISOString(),
        linkedItemTitle: d.situationId
          ? sitTitleMap.get(d.situationId) ?? null
          : d.initiativeId
            ? initTitleMap.get(d.initiativeId) ?? null
            : null,
      })));
    }

    case "get_recurring_tasks": {
      const departmentId = args.departmentId ? String(args.departmentId) : undefined;
      const activeOnly = args.activeOnly !== false; // default true

      const where: Record<string, unknown> = { operatorId };
      if (activeOnly) where.status = "active";

      // Scope by department via aiEntity
      let scopedAiIds: string[] | null = null;
      if (visibleDepts && visibleDepts !== "all") {
        scopedAiIds = await getVisibleAiEntityIds(visibleDepts as string[], operatorId);
        if (scopedAiIds.length === 0) return "No recurring tasks found.";
        where.aiEntityId = { in: scopedAiIds };
      }

      if (departmentId) {
        const deptAis = await prisma.entity.findMany({
          where: {
            operatorId,
            entityType: { slug: { in: ["ai-agent", "department-ai", "hq-ai"] } },
            OR: [
              { parentDepartmentId: departmentId },
              { ownerDepartmentId: departmentId },
            ],
          },
          select: { id: true },
        });
        const deptAiIds = deptAis.map(e => e.id);

        if (scopedAiIds) {
          // Member: intersect with already-scoped set
          const intersection = deptAiIds.filter(id => scopedAiIds!.includes(id));
          if (intersection.length === 0) return "No recurring tasks found for that department.";
          where.aiEntityId = { in: intersection };
        } else {
          // Admin: just use the departmentId filter
          where.aiEntityId = { in: deptAiIds };
        }
      }

      const tasks = await prisma.recurringTask.findMany({
        where,
        orderBy: { nextTriggerAt: "asc" },
        take: 20,
      });

      if (tasks.length === 0) return "No recurring tasks found.";

      // Resolve AI entity → department names
      const aiEntityIds = [...new Set(tasks.map(t => t.aiEntityId))];
      const aiEntities = aiEntityIds.length > 0
        ? await prisma.entity.findMany({
            where: { id: { in: aiEntityIds } },
            select: { id: true, parentDepartmentId: true, ownerDepartmentId: true },
          })
        : [];
      const deptIds = [...new Set(aiEntities.flatMap(e => [e.parentDepartmentId, e.ownerDepartmentId].filter(Boolean) as string[]))];
      const depts = deptIds.length > 0
        ? await prisma.entity.findMany({
            where: { id: { in: deptIds } },
            select: { id: true, displayName: true },
          })
        : [];
      const deptNameMap = new Map(depts.map(d => [d.id, d.displayName]));
      const aiToDept = new Map(aiEntities.map(e => [e.id, deptNameMap.get(e.ownerDepartmentId ?? e.parentDepartmentId ?? "") ?? "HQ"]));

      // Get last execution for each task
      const taskIds = tasks.map(t => t.id);
      const lastPlans = taskIds.length > 0
        ? await prisma.executionPlan.findMany({
            where: { sourceType: "recurring", sourceId: { in: taskIds } },
            orderBy: { createdAt: "desc" },
            distinct: ["sourceId"],
            select: { sourceId: true, status: true, createdAt: true },
          })
        : [];
      const lastPlanMap = new Map(lastPlans.map(p => [p.sourceId, p]));

      return JSON.stringify(tasks.map(t => {
        const lastPlan = lastPlanMap.get(t.id);
        return {
          id: t.id,
          title: t.title,
          cronExpression: t.cronExpression,
          nextTriggerAt: t.nextTriggerAt?.toISOString() ?? null,
          isActive: t.status === "active",
          autoApproveSteps: t.autoApproveSteps,
          lastExecutionStatus: lastPlan?.status ?? null,
          lastExecutionAt: lastPlan?.createdAt.toISOString() ?? null,
          departmentName: aiToDept.get(t.aiEntityId) ?? "HQ",
        };
      }));
    }

    case "get_insights": {
      const query = args.query ? String(args.query) : undefined;
      const departmentId = args.departmentId ? String(args.departmentId) : undefined;
      const insightType = args.insightType ? String(args.insightType) : undefined;

      const where: Record<string, unknown> = { operatorId, status: "active" };
      if (insightType) where.insightType = insightType;
      if (departmentId) where.departmentId = departmentId;

      // Scope by shareScope
      if (visibleDepts && visibleDepts !== "all") {
        // Find user's AI entity
        const userAiEntities = await prisma.entity.findMany({
          where: {
            operatorId,
            entityType: { slug: "ai-agent" },
            parentDepartmentId: { in: visibleDepts },
          },
          select: { id: true },
        });
        const userAiIds = userAiEntities.map(e => e.id);

        // Dept AI entities
        const deptAiEntities = await prisma.entity.findMany({
          where: {
            operatorId,
            entityType: { slug: { in: ["department-ai", "hq-ai"] } },
            OR: [
              { parentDepartmentId: { in: visibleDepts } },
              { ownerDepartmentId: { in: visibleDepts } },
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
      const n = Math.min(Math.max(typeof args.n === "number" ? args.n : 5, 1), 20);

      const where: Record<string, unknown> = {
        operatorId,
        status: { in: ["pending", "approved", "executing"] },
      };

      // Scope filter
      if (visibleDepts && visibleDepts !== "all") {
        where.OR = [
          {
            sourceType: "situation",
            situation: {
              OR: [
                { situationType: { scopeEntityId: { in: visibleDepts } } },
                { situationType: { scopeEntityId: null } },
              ],
            },
          },
          {
            sourceType: "initiative",
            initiative: {
              goal: { departmentId: { in: visibleDepts } },
            },
          },
          { sourceType: { in: ["recurring", "delegation"] } },
        ];
      }

      const plans = await prisma.executionPlan.findMany({
        where,
        orderBy: [{ priorityScore: "desc" }, { createdAt: "desc" }],
        take: n,
        select: {
          id: true,
          sourceType: true,
          sourceId: true,
          status: true,
          priorityScore: true,
          currentStepOrder: true,
          priorityOverride: { select: { overrideType: true, snoozeUntil: true } },
          steps: {
            select: { title: true, sequenceOrder: true },
            orderBy: { sequenceOrder: "asc" },
          },
        },
      });

      if (plans.length === 0) return "No priority items found.";

      // Resolve source titles
      const sitIds = plans.filter(p => p.sourceType === "situation").map(p => p.sourceId);
      const initIds = plans.filter(p => p.sourceType === "initiative").map(p => p.sourceId);
      const recurringIds = plans.filter(p => p.sourceType === "recurring").map(p => p.sourceId);

      const [sitNames, initNames, recurringNames] = await Promise.all([
        sitIds.length > 0
          ? prisma.situation.findMany({
              where: { id: { in: sitIds }, operatorId },
              select: { id: true, situationType: { select: { name: true } } },
            })
          : [],
        initIds.length > 0
          ? prisma.initiative.findMany({
              where: { id: { in: initIds }, operatorId },
              select: { id: true, rationale: true },
            })
          : [],
        recurringIds.length > 0
          ? prisma.recurringTask.findMany({
              where: { id: { in: recurringIds }, operatorId },
              select: { id: true, title: true },
            })
          : [],
      ]);

      const titleMap = new Map<string, string>();
      for (const s of sitNames) titleMap.set(s.id, s.situationType.name);
      for (const i of initNames) titleMap.set(i.id, i.rationale.slice(0, 100));
      for (const r of recurringNames) titleMap.set(r.id, r.title);

      return JSON.stringify(plans.map(p => {
        const currentStep = p.steps.find(s => s.sequenceOrder === p.currentStepOrder);
        const isPinned = p.priorityOverride?.overrideType === "pin";
        const isSnoozed = p.priorityOverride?.overrideType === "snooze"
          && p.priorityOverride.snoozeUntil
          && p.priorityOverride.snoozeUntil > new Date();
        return {
          planId: p.id,
          sourceType: p.sourceType,
          sourceTitle: titleMap.get(p.sourceId) ?? null,
          priorityScore: p.priorityScore,
          currentStep: currentStep?.title ?? null,
          isPinned,
          isSnoozed: !!isSnoozed,
          urgencyReason: isPinned ? "Pinned by user" : (isSnoozed ? "Snoozed" : null),
        };
      }));
    }

    case "get_email_thread": {
      const threadId = String(args.threadId ?? "");
      if (!threadId) return "Please provide a thread ID.";

      // Department scope: resolve visible departments for filtering
      const threadDepts = await prisma.entity.findMany({
        where: {
          operatorId, category: "foundational", entityType: { slug: "department" },
          ...deptVisFilter,
        },
        select: { id: true },
      });
      const threadDeptIds = new Set(threadDepts.map(d => d.id));

      // First, find ContentChunks for this thread (targeted query via sourceType + operator)
      // Use chunks to identify which message IDs belong to this thread
      const chunks = await prisma.contentChunk.findMany({
        where: { operatorId, sourceType: "email" },
        select: { sourceId: true, content: true, metadata: true, chunkIndex: true, departmentIds: true },
      });

      const threadChunks = chunks.filter((c) => {
        try {
          const meta = c.metadata ? JSON.parse(c.metadata) : {};
          return meta.threadId === threadId;
        } catch { return false; }
      });

      // Department scope check on chunks
      if (visibleDepts && visibleDepts !== "all" && threadDeptIds.size > 0) {
        const beforeCount = threadChunks.length;
        const filtered = threadChunks.filter((c) => {
          const dIds: string[] = c.departmentIds ? JSON.parse(c.departmentIds) : [];
          return dIds.length === 0 || dIds.some((d) => threadDeptIds.has(d));
        });
        if (filtered.length === 0 && beforeCount > 0) {
          return "I don't have visibility into that email thread's department.";
        }
      }

      // Build body lookup from first chunks
      const chunksBySourceId = new Map<string, string>();
      for (const c of threadChunks) {
        if (c.chunkIndex === 0) {
          chunksBySourceId.set(c.sourceId, c.content);
        }
      }

      // Fetch events only for the known message IDs in this thread
      const messageIds = [...new Set(threadChunks.map((c) => c.sourceId))];
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

      if (threadEvents.length === 0 && threadChunks.length === 0) {
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

      // Fallback: format from chunks alone
      const formatted = threadChunks
        .filter((c) => c.chunkIndex === 0)
        .map((c) => {
          const m = c.metadata ? JSON.parse(c.metadata) : {};
          return `[${(m.direction || "unknown").toUpperCase()}] ${m.date ? new Date(m.date).toLocaleString() : "unknown"}\nFrom: ${m.from || "unknown"} | To: ${Array.isArray(m.to) ? m.to.join(", ") : m.to || "unknown"}\nSubject: ${m.subject || "(no subject)"}\n\n${c.content.slice(0, 500)}`;
        });
      return `Thread ${threadId} (${formatted.length} messages):\n\n${formatted.join("\n\n---\n\n")}`;
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
  scopeInfo?: { userName?: string; departmentName?: string; visibleDepts: string[] | "all" },
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
              scopeInfo?.visibleDepts ?? "all",
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
