import type { PermittedAction, BlockedAction } from "@/lib/policy-evaluator";
import type { OrganizationalContextEntry } from "@/lib/context-assembly";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReasoningInput {
  situationType: { name: string; description: string; autonomyLevel: string };
  severity: number;
  confidence: number;

  triggerEntity: { displayName: string; properties: Record<string, string> };
  neighborhood: Array<{
    displayName: string;
    entityType: string;
    relationship: string;
    properties: Record<string, string>;
  }>;
  organizationalContext?: OrganizationalContextEntry[];
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

export function buildReasoningSystemPrompt(businessContext: string | null): string {
  const bizSection = businessContext
    ? `\nBUSINESS CONTEXT:\n${businessContext}\n`
    : "";

  return `You are the AI operations agent for this company. You analyze operational situations and recommend actions.
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
  sections.push(`ENTITY: ${input.triggerEntity.displayName}
${propsStr || "  (no properties)"}`);

  // CONTEXT
  const contextParts: string[] = [];

  if (input.neighborhood.length > 0) {
    const neighborStr = input.neighborhood
      .map((n) => {
        const nProps = Object.entries(n.properties)
          .slice(0, 5)
          .map(([k, v]) => `    ${k}: ${v}`)
          .join("\n");
        return `  - ${n.displayName} (${n.entityType}, ${n.relationship})${nProps ? "\n" + nProps : ""}`;
      })
      .join("\n");
    contextParts.push(`Related entities:\n${neighborStr}`);
  }

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
    contextParts.push(`Recent events:\n${eventsStr}`);
  }

  if (contextParts.length > 0) {
    sections.push(`CONTEXT:\n${contextParts.join("\n\n")}`);
  }

  // ORGANIZATIONAL CONTEXT
  if (input.organizationalContext && input.organizationalContext.length > 0) {
    const chain = input.organizationalContext
      .map((o) => `${o.displayName} (${o.type})`)
      .join(" → ");
    sections.push(`ORGANIZATIONAL CONTEXT:\n${chain}`);
  } else {
    sections.push("ORGANIZATIONAL CONTEXT:\nNo organizational context available. Upload team/org documents to improve routing and escalation.");
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
