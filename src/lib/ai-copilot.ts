import { prisma } from "@/lib/db";
import { callLLM, streamLLM, type AIMessage, type AITool } from "@/lib/ai-provider";
import { getEntityContext, searchEntities } from "@/lib/entity-resolution";
import { searchAround, formatTraversalForAgent } from "@/lib/graph-traversal";
import { listEntityTypes } from "@/lib/entity-model-store";
import { getBusinessContext, formatBusinessContext } from "@/lib/business-context";
import { buildOrientationSystemPrompt, buildDepartmentDataContext } from "@/lib/orientation-prompts";
import { generatePreFilter } from "@/lib/situation-prefilter";
import { getProvider } from "@/lib/connectors/registry";
import { HARDCODED_TYPE_DEFS } from "@/lib/hardcoded-type-defs";

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

async function buildSystemPrompt(operatorId: string, userRole?: string, scopeInfo?: { userName?: string; departmentName?: string; visibleDepts: string[] | "all" }): Promise<string> {
  const [entityTypes, businessCtx, situationTypes, unreadNotifCount, pendingSituations, deptContext] = await Promise.all([
    listEntityTypes(operatorId),
    getBusinessContext(operatorId),
    prisma.situationType.findMany({
      where: { operatorId, enabled: true },
      select: { name: true, slug: true, description: true, autonomyLevel: true },
    }),
    prisma.notification.count({ where: { operatorId, read: false } }),
    prisma.situation.findMany({
      where: { operatorId, status: { in: ["proposed", "detected"] } },
      include: { situationType: { select: { name: true } } },
      orderBy: { severity: "desc" },
      take: 5,
    }),
    buildDepartmentDataContext(operatorId),
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

  const deptSection = deptContext
    ? `\nORGANIZATIONAL STRUCTURE:\n${deptContext}\n`
    : "";

  // Scoped user framing
  let scopeFraming = "- Visibility: Full access across all departments.";
  if (scopeInfo && scopeInfo.visibleDepts !== "all" && scopeInfo.departmentName) {
    scopeFraming = `- Department: ${scopeInfo.departmentName}\n- Visibility: You are assisting ${scopeInfo.userName || "a user"} who works in the ${scopeInfo.departmentName} department. Focus your responses on matters relevant to their department.`;
  }

  return `You are the Qorpera AI co-pilot, an intelligent assistant for the operator's entity graph and governance workflow engine.
${businessSection}${deptSection}
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
- Propose actions (create, update, delete entities) that go through governance review
- Execute connector actions (e.g., send email, update contact, change deal stage in HubSpot)
- Create new situation types scoped to specific departments

USER CONTEXT:
- Role: ${userRole || "admin"}
${scopeFraming}
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

    case "execute_connector_action": {
      const actionName = String(args.action_name ?? "");
      const actionParams = (args.params ?? {}) as Record<string, unknown>;

      const capability = await prisma.actionCapability.findFirst({
        where: { operatorId, name: actionName, enabled: true },
      });
      if (!capability) return `Action not available: ${actionName}`;
      if (!capability.connectorId) return "No connector linked to this action.";

      const connector = await prisma.sourceConnector.findFirst({
        where: { id: capability.connectorId, operatorId },
      });
      if (!connector) return "Connector not found for this action.";

      const provider = getProvider(connector.provider);
      if (!provider?.executeAction) return `Provider "${connector.provider}" does not support actions.`;

      const config = JSON.parse(connector.config || "{}");
      const result = await provider.executeAction(config, actionName, actionParams);

      // Persist config in case tokens were refreshed
      await prisma.sourceConnector.update({
        where: { id: connector.id },
        data: { config: JSON.stringify(config) },
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

      // Load departments
      const departments = await prisma.entity.findMany({
        where: { operatorId, category: "foundational", entityType: { slug: "department" }, status: "active" },
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

        // Load members
        const members = await prisma.entity.findMany({
          where: { operatorId, parentDepartmentId: dept.id, category: "base", status: "active" },
          include: {
            propertyValues: { include: { property: { select: { slug: true } } } },
          },
          orderBy: { displayName: "asc" },
        });

        for (let mi = 0; mi < members.length; mi++) {
          const m = members[mi];
          const mIsLast = mi === members.length - 1;
          const mPrefix = mIsLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
          const role = m.propertyValues.find(pv => pv.property.slug === "role")?.value;
          const roleStr = role ? ` (${role})` : "";
          lines.push(`${childPrefix}${mPrefix}${m.displayName}${roleStr}`);
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

      // Generate pre-filter for natural/hybrid modes (fire-and-forget)
      const dl = detectionLogic as Record<string, unknown>;
      if (dl.mode === "natural" || dl.mode === "hybrid") {
        generatePreFilter(situationType.id).catch(() => {});
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
        where: { operatorId, category: "foundational", entityType: { slug: "department" }, status: "active" },
        select: { id: true, displayName: true, description: true },
        orderBy: { displayName: "asc" },
      });

      if (departments.length === 0) return "No departments found.";

      const results: string[] = [];
      for (const dept of departments) {
        const [memberCount, digitalCount, docCount, connectorCount] = await Promise.all([
          prisma.entity.count({ where: { parentDepartmentId: dept.id, category: "base", status: "active" } }),
          prisma.entity.count({ where: { parentDepartmentId: dept.id, category: "digital", status: "active" } }),
          prisma.internalDocument.count({ where: { departmentId: dept.id, operatorId, status: { not: "replaced" } } }),
          prisma.connectorDepartmentBinding.count({ where: { departmentId: dept.id } }),
        ]);

        let line = `- ${dept.displayName} (ID: ${dept.id})`;
        if (dept.description) line += ` — ${dept.description}`;
        line += `\n    ${memberCount} people, ${digitalCount} synced entities, ${docCount} documents, ${connectorCount} connectors`;
        results.push(line);
      }

      return results.join("\n");
    }

    case "get_department_context": {
      const departmentName = String(args.departmentName ?? "");
      const dept = await prisma.entity.findFirst({
        where: {
          operatorId,
          category: "foundational",
          displayName: { contains: departmentName },
          entityType: { slug: "department" },
          status: "active",
        },
        select: { id: true, displayName: true, description: true },
      });

      if (!dept) return `Department "${departmentName}" not found.`;

      // Members
      const members = await prisma.entity.findMany({
        where: { operatorId, parentDepartmentId: dept.id, category: "base", status: "active" },
        include: { propertyValues: { include: { property: { select: { slug: true } } } } },
        orderBy: { displayName: "asc" },
      });
      const memberLines = members.map(m => {
        const role = m.propertyValues.find(pv => pv.property.slug === "role")?.value;
        const email = m.propertyValues.find(pv => pv.property.slug === "email")?.value;
        let line = `  - ${m.displayName}`;
        if (role) line += ` (${role})`;
        if (email) line += ` <${email}>`;
        return line;
      });

      // Documents
      const docs = await prisma.internalDocument.findMany({
        where: { departmentId: dept.id, operatorId, status: { not: "replaced" } },
        select: { fileName: true, documentType: true, status: true },
      });
      const docLines = docs.map(d => `  - ${d.fileName} [${d.documentType}] (${d.status})`);

      // Digital entity counts
      const digitalCounts = await prisma.entity.groupBy({
        by: ["entityTypeId"],
        where: { operatorId, parentDepartmentId: dept.id, category: "digital", status: "active" },
        _count: true,
      });
      const typeIds = digitalCounts.map(c => c.entityTypeId);
      const types = typeIds.length > 0
        ? await prisma.entityType.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } })
        : [];
      const typeMap = new Map(types.map(t => [t.id, t.name]));

      // Recent situations
      const situations = await prisma.situation.findMany({
        where: {
          operatorId,
          situationType: { scopeEntityId: dept.id },
        },
        include: { situationType: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      });

      const sections: string[] = [
        `Department: ${dept.displayName}`,
        dept.description ? `Description: ${dept.description}` : null,
        `\nMembers (${members.length}):`,
        memberLines.length > 0 ? memberLines.join("\n") : "  (none)",
        `\nDocuments (${docs.length}):`,
        docLines.length > 0 ? docLines.join("\n") : "  (none)",
      ].filter((s): s is string => s !== null);

      if (digitalCounts.length > 0) {
        const countsStr = digitalCounts
          .map(c => `${c._count} ${typeMap.get(c.entityTypeId) || "items"}`)
          .join(", ");
        sections.push(`\nConnected data: ${countsStr}`);
      }

      if (situations.length > 0) {
        sections.push(`\nRecent situations:`);
        for (const s of situations) {
          sections.push(`  - ${s.situationType.name} (${s.status})`);
        }
      }

      return sections.join("\n");
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
      systemPrompt = await buildSystemPrompt(operatorId, userRole, scopeInfo);
    }
  } else {
    systemPrompt = await buildSystemPrompt(operatorId, userRole, scopeInfo);
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
