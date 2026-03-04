import { prisma } from "@/lib/db";
import { callLLM, streamLLM, type AIMessage, type AITool } from "@/lib/ai-provider";
import { getOemEntityContext, searchOemEntities } from "@/lib/oem-entity-resolution";
import { searchAround, formatTraversalForAgent } from "@/lib/graph-traversal";
import { listEntityTypes } from "@/lib/entity-model-store";

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
];

// ── System Prompt Builder ────────────────────────────────────────────────────

async function buildSystemPrompt(operatorId: string): Promise<string> {
  const [entityTypes, pendingCount, govConfig, actionRules] = await Promise.all([
    listEntityTypes(operatorId),
    prisma.actionProposal.count({ where: { operatorId, status: "PENDING" } }),
    prisma.governanceConfig.findUnique({ where: { operatorId } }),
    prisma.actionRule.findMany({ where: { operatorId, enabled: true }, select: { name: true, triggerOn: true } }),
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

  return `You are the Qorpera AI co-pilot, an intelligent assistant for the operator's entity graph and governance workflow engine.

ENTITY MODEL:
${typesSummary || "No entity types configured yet."}

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
): Promise<string> {
  switch (toolName) {
    case "lookup_entity": {
      const query = String(args.query ?? "");
      const typeSlug = args.typeSlug ? String(args.typeSlug) : undefined;
      const context = await getOemEntityContext(operatorId, query, typeSlug);
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
      const results = await searchOemEntities(operatorId, query, typeSlug, limit);

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

    default:
      return `Unknown tool: ${toolName}`;
  }
}

// ── Chat (Streaming) ─────────────────────────────────────────────────────────

export async function chat(
  operatorId: string,
  userMessage: string,
  history: AIMessage[],
): Promise<ReadableStream> {
  const systemPrompt = await buildSystemPrompt(operatorId);

  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        // First call — may produce tool calls
        let currentMessages = [...messages];
        let maxIterations = 5;

        while (maxIterations > 0) {
          maxIterations--;

          const response = await callLLM(currentMessages, { tools: COPILOT_TOOLS, temperature: 0.3 });

          if (!response.toolCalls?.length) {
            // No tool calls — stream the final response
            if (response.content) {
              // Content was already returned non-streaming from the tool-calling round.
              // Stream it out character-by-character to maintain streaming UX.
              controller.enqueue(encoder.encode(response.content));
            } else {
              // Fallback: do a streaming call without tools for the final response
              for await (const chunk of streamLLM(currentMessages, { temperature: 0.3 })) {
                controller.enqueue(encoder.encode(chunk));
              }
            }
            break;
          }

          // Execute tool calls and add results to message history
          currentMessages.push({
            role: "assistant",
            content: response.content || `[Calling tools: ${response.toolCalls.map((t) => t.name).join(", ")}]`,
          });

          for (const toolCall of response.toolCalls) {
            const result = await executeTool(operatorId, toolCall.name, toolCall.arguments);
            currentMessages.push({
              role: "user",
              content: `[Tool result for ${toolCall.name}]:\n${result}`,
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
