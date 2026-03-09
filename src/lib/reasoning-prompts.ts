import type { DepartmentContext, RAGReference, EntitySummary } from "@/lib/context-assembly";
import type { PermittedAction, BlockedAction } from "@/lib/policy-evaluator";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReasoningInput {
  situationType: { name: string; description: string; autonomyLevel: string };
  severity: number;
  confidence: number;

  triggerEntity: {
    displayName: string;
    type: string;
    category: string;
    properties: Record<string, string>;
  };

  departments: DepartmentContext[];
  departmentKnowledge: RAGReference[];

  relatedEntities: {
    base: EntitySummary[];
    digital: EntitySummary[];
    external: EntitySummary[];
  };

  recentEvents: Array<{ type: string; timestamp: string; payload: unknown }>;
  priorSituations: Array<{
    analysis?: string;
    outcome?: string;
    feedback?: string;
    actionTaken?: unknown;
    createdAt: string;
  }>;

  autonomyLevel: "supervised" | "notify" | "autonomous";
  permittedActions: PermittedAction[];
  blockedActions: BlockedAction[];

  businessContext: string | null;
}

// ── System Prompt ────────────────────────────────────────────────────────────

export function buildReasoningSystemPrompt(businessContext: string | null, companyName?: string): string {
  const bizSection = businessContext
    ? `\nBUSINESS CONTEXT:\n${businessContext}\n`
    : "";

  return `You are the AI operations agent for ${companyName || "this company"}. You analyze operational situations and recommend actions.
${bizSection}
BEHAVIOR:
- Be specific: reference actual data values (names, amounts, dates), not generic summaries.
- Be context-aware: if the entity has related records (open complaints, recent payments, etc.), acknowledge them in your analysis.
- Be outcome-informed: when prior similar situations exist, reference their outcomes with actual numbers and results.
- Be transparent: explain your full reasoning chain — what you observed, what it implies, and why you chose (or declined) an action.

OUTPUT FORMAT:
Respond with ONLY valid JSON (no markdown fences, no commentary). The JSON must match this schema exactly:
{
  "analysis": "string (substantive analysis of the situation, minimum 10 characters)",
  "consideredActions": [
    {
      "action": "action name",
      "pros": ["pro 1", "pro 2"],
      "cons": ["con 1"],
      "expectedOutcome": "what would happen if this action is taken"
    }
  ],
  "chosenAction": {
    "action": "action name (must match a permitted action)",
    "connector": "connector name",
    "params": { "param1": "value1" },
    "justification": "string (why this action, minimum 10 characters)"
  } or null if no action is appropriate,
  "confidence": 0.0 to 1.0,
  "missingContext": ["information that would improve this decision"] or null
}

IMPORTANT:
- "chosenAction" must reference an action from the PERMITTED ACTIONS list, or be null.
- If no permitted actions are available, set "chosenAction" to null and explain the constraint in your analysis.
- Even when "chosenAction" is null, "consideredActions" should still contain entries explaining what was evaluated and why nothing was chosen.
- "params" must contain valid parameters for the chosen action based on its input schema.`;
}

// ── User Prompt ──────────────────────────────────────────────────────────────

export function buildReasoningUserPrompt(input: ReasoningInput): string {
  const sections: string[] = [];

  // SITUATION
  sections.push(`SITUATION: ${input.situationType.name}
Description: ${input.situationType.description}
Severity: ${input.severity.toFixed(2)} (0=low, 1=critical)
Detection confidence: ${input.confidence.toFixed(2)}`);

  // ENTITY
  const propsStr = Object.entries(input.triggerEntity.properties)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");
  sections.push(`ENTITY: ${input.triggerEntity.displayName} [${input.triggerEntity.type}, ${input.triggerEntity.category}]
${propsStr || "  (no properties)"}`);

  // DEPARTMENT CONTEXT
  if (input.departments.length > 0) {
    const deptStr = input.departments
      .map((d) => {
        const lines = [`  ${d.name}${d.description ? ` — ${d.description}` : ""}`];
        if (d.lead) lines.push(`    Lead: ${d.lead.name} (${d.lead.role})`);
        lines.push(`    Team size: ${d.memberCount}`);
        return lines.join("\n");
      })
      .join("\n");
    sections.push(`DEPARTMENT CONTEXT:\n${deptStr}`);
  } else {
    sections.push("DEPARTMENT CONTEXT:\nNo department association found for this entity.");
  }

  // DEPARTMENT KNOWLEDGE (RAG)
  const relevantKnowledge = input.departmentKnowledge.filter((r) => r.score > 0.3);
  if (relevantKnowledge.length > 0) {
    const knowledgeStr = relevantKnowledge
      .map((r) => `  From '${r.documentName}' (${r.departmentName}):\n    "${r.content}"`)
      .join("\n");
    sections.push(`DEPARTMENT KNOWLEDGE:\n${knowledgeStr}`);
  } else {
    sections.push("DEPARTMENT KNOWLEDGE:\nNo relevant documents found. Upload process docs, policies, or playbooks to departments for richer context.");
  }

  // RELATED ENTITIES — grouped by category
  const categoryGroups: { label: string; items: EntitySummary[] }[] = [
    { label: "People", items: input.relatedEntities.base },
    { label: "Operational Data", items: input.relatedEntities.digital },
    { label: "External Parties", items: input.relatedEntities.external },
  ];

  const entityParts = categoryGroups
    .filter((g) => g.items.length > 0)
    .map((g) => {
      const lines = g.items.map((n) => {
        const topProps = Object.entries(n.properties)
          .slice(0, 3)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        return `  - ${n.displayName} (${n.type}, ${n.relationship})${topProps ? ` — ${topProps}` : ""}`;
      });
      return `${g.label}:\n${lines.join("\n")}`;
    });

  if (entityParts.length > 0) {
    sections.push(`RELATED ENTITIES:\n${entityParts.join("\n\n")}`);
  }

  // RECENT EVENTS
  if (input.recentEvents.length > 0) {
    const eventsStr = input.recentEvents
      .slice(0, 10)
      .map((e) => {
        const payloadStr = typeof e.payload === "object" && e.payload
          ? " — " + JSON.stringify(e.payload).slice(0, 200)
          : "";
        return `  - [${e.timestamp}] ${e.type}${payloadStr}`;
      })
      .join("\n");
    sections.push(`RECENT EVENTS:\n${eventsStr}`);
  }

  // PRIOR SIMILAR SITUATIONS
  if (input.priorSituations.length > 0) {
    const priorsStr = input.priorSituations
      .map((p) => {
        const parts = [`  - ${p.createdAt}`];
        if (p.outcome) parts.push(`    Outcome: ${p.outcome}`);
        if (p.analysis) parts.push(`    Analysis: ${p.analysis.slice(0, 200)}`);
        if (p.feedback) parts.push(`    Feedback: ${p.feedback}`);
        if (p.actionTaken) parts.push(`    Action taken: ${JSON.stringify(p.actionTaken).slice(0, 200)}`);
        return parts.join("\n");
      })
      .join("\n");
    sections.push(`PRIOR SIMILAR SITUATIONS:\n${priorsStr}`);
  } else {
    sections.push("PRIOR SIMILAR SITUATIONS:\nNo prior examples available. This is the first time this situation type has been encountered.");
  }

  // PERMITTED ACTIONS
  if (input.permittedActions.length > 0) {
    const actionsStr = input.permittedActions
      .map((a) => {
        const schema = a.inputSchema ? `\n    Input: ${JSON.stringify(a.inputSchema)}` : "";
        return `  - ${a.name} (${a.connector}): ${a.description}${schema}`;
      })
      .join("\n");
    sections.push(`PERMITTED ACTIONS:\n${actionsStr}`);
  } else {
    sections.push("PERMITTED ACTIONS:\nNo actions are currently available. Set chosenAction to null and explain this constraint.");
  }

  // BLOCKED ACTIONS
  if (input.blockedActions.length > 0) {
    const blockedStr = input.blockedActions
      .map((b) => `  - ${b.name}: ${b.reason}`)
      .join("\n");
    sections.push(`BLOCKED ACTIONS (cannot use these):\n${blockedStr}`);
  }

  // GOVERNANCE
  const autonomyNote = input.autonomyLevel === "supervised"
    ? "Propose an action for human review."
    : "Select an action for immediate execution — your justification must be especially thorough since this will execute without prior approval.";
  sections.push(`GOVERNANCE:\nAutonomy level: ${input.autonomyLevel}\n${autonomyNote}`);

  return sections.join("\n\n");
}
