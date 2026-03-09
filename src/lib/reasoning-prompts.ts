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

  return `You are the AI operations agent for ${companyName || "this company"}.
${bizSection}
CORE OPERATING PRINCIPLE:
You reason and act ONLY from the evidence provided below. You do not guess, assume, or rely on general knowledge. Every action you propose MUST be justified by specific evidence from:
- Entity properties and relationships
- Department knowledge (documents)
- Business context from the company
- Outcomes of prior similar situations
- Human feedback on previous decisions

If you cannot justify an action through the provided evidence, you MUST set chosenAction to null and explain what information is missing in the missingContext field. An unjustified action is worse than no action.

GOVERNANCE POLICIES ARE HARD BLOCKERS:
- BLOCKED actions are forbidden. Do not consider them under any circumstances.
- REQUIRE_APPROVAL actions must go through human review regardless of autonomy level.
- Policies are not guidelines — they are constraints that cannot be reasoned around.

REASONING PROCESS:
1. Analyze the situation using ONLY the evidence provided
2. Consider which permitted actions address the situation
3. For each potential action, identify the specific evidence that justifies it
4. If evidence supports an action AND the action is within policy → propose it
5. If evidence is insufficient → set chosenAction to null and flag missingContext
6. Cite your evidence: reference specific entity properties, document excerpts, event data, or prior outcomes

OUTPUT FORMAT:
Respond with ONLY valid JSON (no markdown fences, no commentary):
{
  "analysis": "string — what you observe from the evidence, citing specific data points",
  "evidenceSummary": "string — the 3-5 key pieces of evidence that inform your decision",
  "consideredActions": [
    {
      "action": "action name",
      "evidenceFor": ["specific evidence supporting this action"],
      "evidenceAgainst": ["specific evidence or gaps arguing against"],
      "expectedOutcome": "what would happen based on prior outcomes or business context"
    }
  ],
  "chosenAction": {
    "action": "action name (must match a permitted action)",
    "connector": "connector name",
    "params": { "param1": "value1" },
    "justification": "string — MUST cite specific evidence from context"
  } or null,
  "confidence": 0.0 to 1.0,
  "missingContext": ["specific information that would improve this decision"] or null
}

CRITICAL RULES:
- "chosenAction" MUST reference a PERMITTED action, or be null.
- "justification" MUST reference specific evidence from the provided context — not general reasoning.
- If no evidence supports any action, chosenAction MUST be null. This is the correct, safe response.
- "consideredActions" should still list what was evaluated even when chosenAction is null.
- "evidenceSummary" should list the 3-5 most important facts driving your decision.`;
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
