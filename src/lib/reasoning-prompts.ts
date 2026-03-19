import type {
  DepartmentContext,
  RAGReference,
  EntitySummary,
  ActivityTimeline,
  CommunicationContext,
  CrossDepartmentContext,
  ConnectorCapability,
} from "@/lib/context-assembly";
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

  // v3 additions
  activityTimeline: ActivityTimeline;
  communicationContext: CommunicationContext;
  crossDepartmentSignals: CrossDepartmentContext;

  // v4: draft payload provider resolution
  connectorCapabilities: ConnectorCapability[];

  // v4 day 4: workstream + delegation context
  workStreamContext?: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    goal: { id: string; title: string; description: string } | null;
    items: Array<{ type: string; id: string; status: string; summary: string }>;
    parent: { id: string; title: string; description: string | null; itemCount: number } | null;
  } | null;
  delegationSource?: {
    id: string;
    instruction: string;
    context: unknown;
    fromAiEntityId: string;
    fromAiEntityName: string | null;
  } | null;
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
- Activity patterns (email frequency, meeting cadence, response times, communication trends)
- Communication excerpts (relevant emails, messages involving this entity)
- Cross-department signals (how other teams interact with this entity)
- Department knowledge (documents, playbooks, policies)
- Business context from the company
- Outcomes of prior similar situations
- Human feedback on previous decisions

If you cannot justify an action through the provided evidence, you MUST set actionPlan to null and explain what information is missing in the missingContext field. An unjustified action is worse than no action.

GOVERNANCE POLICIES ARE HARD BLOCKERS:
- BLOCKED actions are forbidden. Do not consider them under any circumstances.
- REQUIRE_APPROVAL actions must go through human review regardless of autonomy level.
- Policies are not guidelines — they are constraints that cannot be reasoned around.

REASONING PROCESS:
1. Analyze the situation using ONLY the evidence provided
2. Consider which permitted actions address the situation
3. For each potential action, identify the specific evidence that justifies it
4. If evidence supports an action AND the action is within policy → propose it in actionPlan
5. If evidence is insufficient → set actionPlan to null and flag missingContext
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
  "actionPlan": [
    {
      "title": "short step title",
      "description": "what this step should accomplish",
      "executionMode": "action | generate | human_task",
      "actionCapabilityName": "action name (for action mode, must match a permitted action)",
      "params": { "param1": "value1" }
    }
  ] or null,
  "confidence": 0.0 to 1.0,
  "missingContext": ["specific information that would improve this decision"] or null,
  "escalation": {
    "rationale": "why this needs strategic attention beyond the immediate response",
    "suggestedSteps": [same step format as actionPlan]
  } or null
}

CRITICAL RULES:
- "actionPlan" is an ordered array of steps, or null if no action is warranted.
- A single action is a one-element array. Multi-step plans have multiple elements.
- Each step with executionMode "action" MUST reference a PERMITTED action via "actionCapabilityName".
- Steps with executionMode "generate" produce LLM-generated content (drafts, analysis, summaries).
- Steps with executionMode "human_task" assign work to a human (phone calls, meetings, physical tasks).
- If no evidence supports any action, actionPlan MUST be null. This is the correct, safe response.
- "escalation" is for situations that need strategic initiative beyond the immediate response. It creates a draft proposal for leadership review. Most situations do NOT need escalation.
- "consideredActions" should still list what was evaluated even when actionPlan is null.
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

  // BEHAVIORAL EVIDENCE (v3)
  {
    const behaviorParts: string[] = [];

    // Activity Timeline
    const nonEmptyBuckets = input.activityTimeline.buckets.filter(
      (b) =>
        b.emailSent + b.emailReceived + b.meetingsHeld + b.slackMessages + b.docsEdited + b.docsCreated > 0,
    );
    if (nonEmptyBuckets.length > 0) {
      const bucketLines = nonEmptyBuckets.map((b) => {
        const parts = [];
        if (b.emailSent + b.emailReceived > 0) parts.push(`Email: ${b.emailSent} sent, ${b.emailReceived} received`);
        if (b.meetingsHeld > 0) parts.push(`Meetings: ${b.meetingsHeld} (${b.meetingMinutes} min total)`);
        if (b.slackMessages > 0) parts.push(`Messages: ${b.slackMessages}`);
        if (b.docsEdited + b.docsCreated > 0) parts.push(`Docs: ${b.docsEdited} edited, ${b.docsCreated} created`);
        return `  ${b.period}: ${parts.join(". ")}.`;
      });
      behaviorParts.push(`Activity Timeline (${input.triggerEntity.displayName}):\n${bucketLines.join("\n")}`);

      // Response time from any bucket
      const rtBucket = input.activityTimeline.buckets.find((b) => b.avgResponseTimeHours != null);
      if (rtBucket) {
        behaviorParts.push(`  Avg email response time: ${rtBucket.avgResponseTimeHours}h`);
      }
      behaviorParts.push(`  Trend: ${input.activityTimeline.trend}`);
    } else {
      behaviorParts.push(`Activity Timeline (${input.triggerEntity.displayName}):\n  No activity signals found for this entity in the last 30 days.`);
    }

    // Communication excerpts
    if (input.communicationContext.excerpts.length > 0) {
      const excerptLines = input.communicationContext.excerpts.slice(0, 8).map((e) => {
        const sender = e.metadata.sender ?? "unknown";
        const subject = e.metadata.subject ?? "no subject";
        const ts = e.metadata.timestamp ?? "";
        const channel = e.metadata.channel ? ` #${e.metadata.channel}` : "";
        const header = e.sourceType === "email"
          ? `[email] ${sender} — "${subject}" (${ts})`
          : `[${e.sourceType}] ${sender}${channel} (${ts})`;
        return `  ${header}\n    "${e.content.slice(0, 300)}"`;
      });
      const breakdown = Object.entries(input.communicationContext.sourceBreakdown)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      excerptLines.push(`  (${breakdown})`);
      behaviorParts.push(`\nRecent Communications:\n${excerptLines.join("\n")}`);
    }

    sections.push(`BEHAVIORAL EVIDENCE:\n\n${behaviorParts.join("\n")}`);
  }

  // WORKSTREAM CONTEXT
  if (input.workStreamContext) {
    const ws = input.workStreamContext;
    const wsLines = [`  Title: ${ws.title}`, `  Status: ${ws.status}`];
    if (ws.description) wsLines.push(`  Description: ${ws.description}`);
    if (ws.goal) wsLines.push(`  Goal: ${ws.goal.title} — ${ws.goal.description}`);
    if (ws.items.length > 0) {
      wsLines.push(`  Related work (${ws.items.length} items):`);
      for (const item of ws.items) {
        wsLines.push(`    - [${item.type}] ${item.summary} (${item.status})`);
      }
    }
    if (ws.parent) {
      wsLines.push(`  Part of: ${ws.parent.title} (${ws.parent.itemCount} items)`);
    }
    sections.push(`WORKSTREAM CONTEXT:\nThis situation is part of an active workstream:\n${wsLines.join("\n")}`);
  }

  // DELEGATION SOURCE
  if (input.delegationSource) {
    const del = input.delegationSource;
    const contextStr = del.context ? `\nContext: ${JSON.stringify(del.context)}` : "";
    sections.push(`DELEGATION SOURCE:\nThis situation was delegated from ${del.fromAiEntityName ?? del.fromAiEntityId}.\nInstruction: "${del.instruction}"${contextStr}`);
  }

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

  // CROSS-DEPARTMENT SIGNALS (v3)
  if (input.crossDepartmentSignals.signals.length > 0) {
    const sigLines = input.crossDepartmentSignals.signals.map((s) => {
      const parts = [];
      if (s.emailCount > 0) parts.push(`${s.emailCount} emails`);
      if (s.meetingCount > 0) parts.push(`${s.meetingCount} meetings`);
      if (s.slackMentions > 0) parts.push(`${s.slackMentions} messages`);
      const lastAct = s.lastActivityDate ? ` Last activity: ${s.lastActivityDate}.` : "";
      return `  ${s.departmentName}: ${parts.join(", ")}.${lastAct}`;
    });
    sections.push(`CROSS-DEPARTMENT SIGNALS (other departments' interaction with ${input.triggerEntity.displayName}):\n${sigLines.join("\n")}`);
  }

  // CONNECTED TOOLS
  if (input.connectorCapabilities.length > 0) {
    const toolLines = input.connectorCapabilities
      .map((c) => `- ${c.type} (${c.provider}, ${c.scope})`)
      .join("\n");
    sections.push(`CONNECTED TOOLS:\nThe following tools are active for this operator:\n${toolLines}\n\nWhen drafting payloads, use ONLY providers that are connected. For email: use "gmail" if google gmail is connected, "outlook" if microsoft outlook is connected. For documents/spreadsheets: use "google_drive" if google is connected, "onedrive" if microsoft is connected. For messaging: use "slack" or "teams" based on what's connected.`);
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
    sections.push("PERMITTED ACTIONS:\nNo actions are currently available. Set actionPlan to null and explain this constraint.");
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
