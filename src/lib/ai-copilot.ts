import { prisma } from "@/lib/db";
import { callLLM, streamLLM, type AIMessage, type AITool } from "@/lib/ai-provider";
import { getEntityContext, searchEntities } from "@/lib/entity-resolution";
import { searchAround, formatTraversalForAgent } from "@/lib/graph-traversal";
import { listEntityTypes } from "@/lib/entity-model-store";
import { getBusinessContext, formatBusinessContext } from "@/lib/business-context";
import { buildOrientationSystemPrompt } from "@/lib/orientation-prompts";

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
    name: "propose_action",
    description: "Create an action proposal that requires operator approval before execution. Use for create, update, or delete actions on entities.",
    parameters: {
      type: "object",
      properties: {
        actionType: { type: "string", description: "Action type: create_entity, update_entity, delete_entity" },
        description: { type: "string", description: "Human-readable description of the proposed action" },
        entityId: { type: "string", description: "Target entity ID (for update/delete)" },
        entityTypeSlug: { type: "string", description: "Entity type slug (for create)" },
        inputData: { type: "object", description: "Action input data" },
      },
      required: ["actionType", "description"],
    },
  },
  {
    name: "get_recommendations",
    description: "Fetch active recommendations for the operator, including data quality issues and operational insights.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (default 5)" },
      },
    },
  },
  {
    name: "create_situation_type",
    description: "Create a new situation type that the system will watch for. Use during orientation or anytime to define what operational scenarios matter.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable name" },
        slug: { type: "string", description: "Kebab-case identifier" },
        description: { type: "string", description: "Natural language description of the situation" },
        detectionLogic: {
          type: "object",
          description: "Detection configuration with mode (structured/natural/hybrid), structured rules, and/or naturalLanguage description",
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
      },
      required: ["name", "slug", "description", "detectionLogic"],
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

// ── System Prompt Builder ────────────────────────────────────────────────────

async function buildSystemPrompt(operatorId: string, userRole?: string): Promise<string> {
  const [entityTypes, pendingCount, govConfig, actionRules, businessCtx, situationTypes] = await Promise.all([
    listEntityTypes(operatorId),
    prisma.actionProposal.count({ where: { operatorId, status: "PENDING" } }),
    prisma.governanceConfig.findUnique({ where: { operatorId } }),
    prisma.actionRule.findMany({ where: { operatorId, enabled: true }, select: { name: true, triggerOn: true } }),
    getBusinessContext(operatorId),
    prisma.situationType.findMany({
      where: { operatorId, enabled: true },
      select: { name: true, slug: true, description: true, autonomyLevel: true },
    }),
  ]);

  const typesSummary = entityTypes
    .map((t) => `- ${t.name} (${t.slug}): ${t._count.entities} entities`)
    .join("\n");

  const governanceRules: string[] = [];
  if (govConfig) {
    if (govConfig.autoApproveReadActions) governanceRules.push("Read actions are auto-approved.");
    if (govConfig.requireApprovalAboveAmount) {
      governanceRules.push(`Actions above $${govConfig.requireApprovalAboveAmount} require approval.`);
    }
    governanceRules.push(`Max pending proposals: ${govConfig.maxPendingProposals}.`);
    governanceRules.push(`Approval expiry: ${govConfig.approvalExpiryHours}h.`);
  }

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

  return `You are the Qorpera AI co-pilot, an intelligent assistant for the operator's entity graph and governance workflow engine.
${businessSection}
ENTITY MODEL:
${typesSummary || "No entity types configured yet."}
${situationSection}
GOVERNANCE STATUS:
- Pending proposals awaiting review: ${pendingCount}
${governanceRules.length > 0 ? governanceRules.join("\n") : "Default governance settings active."}

ACTIVE POLICY RULES:
${policySummary}

ACTION RULES (${actionRules.length} enabled):
${actionRules.length > 0
  ? (() => {
      const mutation = actionRules.filter((r) => r.triggerOn === "mutation");
      const tick = actionRules.filter((r) => r.triggerOn === "tick");
      const lines: string[] = [];
      if (mutation.length > 0) lines.push(`On mutation: ${mutation.map((r) => r.name).join(", ")}`);
      if (tick.length > 0) lines.push(`On schedule: ${tick.map((r) => r.name).join(", ")}`);
      lines.push("Action rules automatically fire when entities are created/updated (mutation) or on scheduled ticks.");
      return lines.join("\n");
    })()
  : "No action rules configured."}

CAPABILITIES:
- Look up entities by name or ID to see their full context, properties, and relationships
- Search across entities by keyword
- Explore the entity graph to discover connections
- Propose actions (create, update, delete entities) that go through governance review
- Surface active recommendations for data quality and operational insights
- Create new situation types to define what the system should watch for

USER CONTEXT:
- Role: ${userRole || "admin"}
- ${(() => {
    const role = userRole || "admin";
    const descriptions: Record<string, string> = {
      admin: "Full access. Can manage all entities, types, policies, and governance settings.",
      supervisor: "Can view all situations, approve proposals, and manage entity data.",
      finance: "Focused on financial entities — invoices, payments, revenue data.",
      sales: "Focused on sales entities — deals, contacts, pipeline data.",
      support: "Focused on customer support — tickets, customer issues, resolution tracking.",
      viewer: "Read-only access. Can view entities and ask questions but cannot propose changes.",
    };
    return descriptions[role] || descriptions.admin;
  })()}
${userRole === "viewer" ? "\nIMPORTANT: The user has read-only access. Do NOT use the propose_action tool for this user. If they ask to make changes, explain that they need to contact an admin.\n" : ""}
GUIDELINES:
- Be concise and direct in responses
- When referencing entities, include their type and key properties
- For write operations, always use propose_action so the operator can review
- If the user asks about something that requires entity data, use the lookup or search tools first
- Format entity data clearly with properties and relationships
- When presenting graph traversal results, highlight the most relevant connections`;
}

// ── Tool Execution ───────────────────────────────────────────────────────────

async function executeTool(
  operatorId: string,
  toolName: string,
  args: Record<string, unknown>,
  orientationSessionId?: string,
): Promise<string> {
  switch (toolName) {
    case "lookup_entity": {
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

    case "search_entities": {
      const query = String(args.query ?? "");
      const typeSlug = args.typeSlug ? String(args.typeSlug) : undefined;
      const limit = typeof args.limit === "number" ? args.limit : 10;
      const results = await searchEntities(operatorId, query, typeSlug, limit);

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
      const result = await searchAround(operatorId, entityId, maxHops);

      if (result.nodes.length === 0) return "No entities found in graph traversal.";

      return formatTraversalForAgent(result);
    }

    case "propose_action": {
      const actionType = String(args.actionType ?? "");
      const description = String(args.description ?? "");
      const entityId = args.entityId ? String(args.entityId) : null;
      const entityTypeSlug = args.entityTypeSlug ? String(args.entityTypeSlug) : null;
      const inputData = args.inputData as Record<string, unknown> | undefined;

      const proposal = await prisma.actionProposal.create({
        data: {
          operatorId,
          actionType,
          description,
          entityId,
          entityTypeSlug,
          sourceAgent: "copilot",
          inputData: inputData ? JSON.stringify(inputData) : null,
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        },
      });

      return `Proposal created (ID: ${proposal.id}). Action: ${actionType}. Description: ${description}. Status: PENDING — awaiting operator review.`;
    }

    case "get_recommendations": {
      const limit = typeof args.limit === "number" ? args.limit : 5;
      const recs = await prisma.recommendation.findMany({
        where: { operatorId, status: "active" },
        orderBy: [{ priority: "desc" }, { confidence: "desc" }],
        take: limit,
      });

      if (recs.length === 0) return "No active recommendations at this time.";

      return recs.map((r) => {
        return `- [${r.priority.toUpperCase()}] ${r.title} (confidence: ${(r.confidence * 100).toFixed(0)}%)\n  ${r.description}`;
      }).join("\n");
    }

    // ── Orientation + Situation Tools ──────────────────────────────────────

    case "create_situation_type": {
      const name = String(args.name ?? "");
      const slug = String(args.slug ?? "");
      const description = String(args.description ?? "");
      const detectionLogic = args.detectionLogic ?? { mode: "natural", naturalLanguage: description };
      const responseStrategy = args.responseStrategy ?? null;

      const situationType = await prisma.situationType.upsert({
        where: { operatorId_slug: { operatorId, slug } },
        update: { name, description, detectionLogic: JSON.stringify(detectionLogic), responseStrategy: responseStrategy ? JSON.stringify(responseStrategy) : null },
        create: { operatorId, name, slug, description, detectionLogic: JSON.stringify(detectionLogic), responseStrategy: responseStrategy ? JSON.stringify(responseStrategy) : null, autonomyLevel: "supervised" },
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

      return `Created situation type "${name}" (${slug}, ID: ${situationType.id}). It will run in supervised mode — I'll always ask before taking any action.`;
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
): Promise<ReadableStream> {
  // Build system prompt — orientation-aware or normal
  let systemPrompt: string;
  if (orientation) {
    const session = await prisma.orientationSession.findUnique({
      where: { id: orientation.sessionId },
    });
    if (session) {
      systemPrompt = await buildOrientationSystemPrompt(operatorId, session);
    } else {
      systemPrompt = await buildSystemPrompt(operatorId, userRole);
    }
  } else {
    systemPrompt = await buildSystemPrompt(operatorId, userRole);
  }

  // Select tools — orientation mode gets extra tools
  const tools = orientation
    ? [...COPILOT_TOOLS, ...ORIENTATION_TOOLS]
    : COPILOT_TOOLS;

  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        let currentMessages = [...messages];
        let maxIterations = 5;

        while (maxIterations > 0) {
          maxIterations--;

          const response = await callLLM(currentMessages, { tools, temperature: 0.3 });

          if (!response.toolCalls?.length) {
            if (response.content) {
              controller.enqueue(encoder.encode(response.content));
            } else {
              for await (const chunk of streamLLM(currentMessages, { temperature: 0.3 })) {
                controller.enqueue(encoder.encode(chunk));
              }
            }
            break;
          }

          // Add assistant message WITH tool_calls preserved (for OpenAI protocol)
          currentMessages.push({
            role: "assistant",
            content: response.content || "",
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
            const result = await executeTool(
              operatorId,
              toolCall.name,
              toolCall.arguments,
              orientation?.sessionId,
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
        controller.enqueue(encoder.encode(`Error: ${errMsg}`));
      } finally {
        controller.close();
      }
    },
  });
}
