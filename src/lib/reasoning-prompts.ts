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

/** Increment this whenever plan reasoning prompts change meaningfully. */
export const PLAN_REASONING_PROMPT_VERSION = 1;

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
  workStreamContexts?: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    goal: { id: string; title: string; description: string } | null;
    items: Array<{ type: string; id: string; status: string; summary: string }>;
    parent: { id: string; title: string; description: string | null; itemCount: number } | null;
  }>;
  delegationSource?: {
    id: string;
    instruction: string;
    context: unknown;
    fromAiEntityId: string;
    fromAiEntityName: string | null;
  } | null;

  // v3 day 6: operational knowledge
  operationalInsights?: Array<{
    insightType: string;
    description: string;
    confidence: number;
    promptModification: string | null;
    sampleSize: number;
  }>;
  actionCycles?: Array<{
    cycleNumber: number;
    triggerType: string;
    triggerSummary: string;
    steps: Array<{ title: string; completed: boolean; notes?: string }>;
  }>;
}

// ── Prior Outcome Aggregation (shared with multi-agent-reasoning) ───────────

type PriorSituation = ReasoningInput["priorSituations"][number];

export function formatPriorOutcomeStats(priors: PriorSituation[]): string {
  const negPattern = /negative|wrong|bad/i;
  const posOutcomePattern = /resolved|positive/i;
  const negOutcomePattern = /failed|negative/i;

  // Group by approach
  const groups = new Map<string, PriorSituation[]>();
  for (const p of priors) {
    const key = p.actionTaken
      ? JSON.stringify(p.actionTaken).slice(0, 100)
      : "no_action";
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  const lines: string[] = [];
  lines.push(`PRIOR OUTCOMES FOR THIS SITUATION TYPE:\nThis archetype has been handled ${priors.length} time(s) previously.\n`);

  for (const [approach, items] of groups) {
    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;
    const feedbackPoints = new Set<string>();

    for (const p of items) {
      const isPositive =
        (p.outcome && posOutcomePattern.test(p.outcome)) ||
        (p.feedback && !negPattern.test(p.feedback));
      const isNegative =
        (p.feedback && negPattern.test(p.feedback)) ||
        (p.outcome && negOutcomePattern.test(p.outcome));

      if (isNegative) negativeCount++;
      else if (isPositive) positiveCount++;
      else neutralCount++;

      if (p.feedback) feedbackPoints.add(p.feedback);
    }

    const successRate = positiveCount + negativeCount > 0
      ? Math.round((positiveCount / (positiveCount + negativeCount)) * 100)
      : null;

    const brief = approach === "no_action" ? "No action taken" : approach;
    lines.push(`Approach: ${brief}`);
    lines.push(`  Used ${items.length} time(s). ${successRate !== null ? `Success rate: ${successRate}%` : "No success/failure data."} (${positiveCount} positive, ${negativeCount} negative, ${neutralCount} no feedback).`);
    if (feedbackPoints.size > 0) {
      lines.push(`  Key feedback: ${[...feedbackPoints].join(" | ")}`);
    }
    lines.push("");
  }

  lines.push(`LEARNING INSTRUCTION:
Use these statistics to inform your approach. High success rate = proven approach worth replicating. Low success rate = historically underperformed, consider alternatives or identify what contextual differences might make it work this time. When feedback mentions specific patterns (timing, thresholds, tone), incorporate those learnings.`);

  return lines.join("\n");
}

// ── System Prompt ────────────────────────────────────────────────────────────

export function buildReasoningSystemPrompt(businessContext: string | null, companyName?: string): string {
  const bizSection = businessContext
    ? `\nBUSINESS CONTEXT:\n${businessContext}\n`
    : "";

  return `You are an independent operational analyst for ${companyName || "this company"}. Your value comes from accuracy and honest assessment, not from agreement with prior decisions or optimistic framing. If the situation does not warrant action, say so clearly.

You have full permission to conclude any of the following:
- "No action needed" — the situation does not require intervention
- "Insufficient data to act" — the available context is too thin for a confident recommendation
- "Monitor and reassess" — the signal is real but premature to act on
These are valid, valued outcomes. Do not force an action recommendation when none is warranted.
${bizSection}
CORE OPERATING PRINCIPLE:
You are collaborating with a human employee on handling this situation. Your job is to:
1. Analyze what happened and why it matters
2. Propose the ideal action plan — what SHOULD be done, step by step
3. For each step, indicate whether it requires human action or can be automated

You reason and propose ONLY from the evidence provided below. Every step you propose MUST be justified by specific evidence from the context sections.

ALWAYS PRODUCE AN ACTION PLAN. There is always something that should be done — even if it's just "Review this situation and decide how to respond." The plan should describe what the human and AI should do together. Plans where no automated actions are available are normal and expected — the value is in the analysis and recommended steps, not in automation.

Each step in the action plan has an executionMode:
- "action" — The system can execute this step automatically (send email, create task, etc.). Only use this when the step matches an available automated action listed below.
- "human_task" — The human needs to do this step. Describe clearly what they should do. This is the DEFAULT for any step that cannot be automated.
- "generate" — The system generates content (draft email, document, summary) for human review.

IMPORTANT: Do NOT let the available automated actions limit your plan. Design the ideal plan first. If the best action is "Call Martin Dall back immediately at 26 88 11 03", propose it as a human_task even though the system can't make phone calls. The human knows how to make calls — they need the AI to tell them it's the right thing to do and give them the number.

GOVERNANCE POLICIES ARE HARD BLOCKERS:
- BLOCKED actions are forbidden. Do not consider them under any circumstances.
- REQUIRE_APPROVAL actions must go through human review regardless of autonomy level.
- Policies are not guidelines — they are constraints that cannot be reasoned around.

REASONING PROCESS:
Before producing your analysis, identify and quote the specific data points from the context above that are relevant to this situation. Reference each quoted piece of evidence by its source section (e.g., [activity_timeline], [communication_context]). Then reason from the quoted evidence only. Do not reference information not present in the context sections above.

If the evidence is too thin to determine the right course of action, set the actionPlan to a single human_task step: "Review this situation — the available evidence is insufficient for a specific recommendation. [Explain what additional information would help.]"

1. Analyze the situation using ONLY the evidence provided
2. Design the ideal step-by-step plan — what SHOULD be done
3. For each step, check if it matches an available automated action → executionMode "action"
4. For steps without automation → executionMode "human_task" with clear instructions
5. Cite your evidence: reference specific entity properties, document excerpts, event data, or prior outcomes

OUTPUT FORMAT:
Respond with ONLY valid JSON (no markdown fences, no commentary):
{
  "situationTitle": "Short specific identifier — use invoice numbers, project names, email subjects. NOT just a person's name.",
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
      "title": "Step title",
      "description": "What this step does and why",
      "executionMode": "action" | "human_task" | "generate",
      "actionCapabilityName": "send_email",  // ONLY for executionMode "action" — must match an available automated action
      "params": {}  // ONLY for executionMode "action"
    }
  ],
  "confidence": 0.0 to 1.0,
  "missingContext": ["specific information that would improve this decision"] or null,
  "escalation": {
    "rationale": "why this needs strategic attention beyond the immediate response",
    "suggestedSteps": [same step format as actionPlan]
  } or null
}

CRITICAL RULES:
- "actionPlan" should NEVER be null. There is always at least one step the human can take.
- A single action is a one-element array. Multi-step plans have multiple elements.
- Each step with executionMode "action" MUST reference an available automated action via "actionCapabilityName".
- Steps with executionMode "generate" produce LLM-generated content (drafts, analysis, summaries).
- Steps with executionMode "human_task" assign work to a human (phone calls, meetings, physical tasks). This is the default.
- "escalation" is for situations that need strategic initiative beyond the immediate response. It creates a draft proposal for leadership review. Most situations do NOT need escalation. If recommending escalation to a manager or leadership, you must also state the strongest argument against escalating in the escalation rationale. This ensures escalation decisions are deliberate, not reflexive.
- "consideredActions" should list what was evaluated.
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
  if (input.workStreamContexts && input.workStreamContexts.length > 0) {
    const wsSections = input.workStreamContexts.map(ws => {
      const wsLines = [`  ### ${ws.title}`, `  Status: ${ws.status}`];
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
      return wsLines.join("\n");
    });
    sections.push(`WORKSTREAM CONTEXT:\nThis situation is part of the following work streams:\n\n${wsSections.join("\n\n")}\n\nIf this situation is related to an active WorkStream, include its ID in your response as "relatedWorkStreamId". This will link the situation to the ongoing project for unified tracking.`);
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

  // PRIOR SIMILAR SITUATIONS — aggregated statistics
  if (input.priorSituations.length > 0) {
    sections.push(formatPriorOutcomeStats(input.priorSituations));
  } else {
    sections.push("PRIOR SIMILAR SITUATIONS:\nNo prior examples available. This is the first time this situation type has been encountered.");
  }

  // PRIOR ACTION CYCLES FOR THIS SITUATION
  if (input.actionCycles && input.actionCycles.length > 0) {
    const cycleLines = input.actionCycles.map((cycle) => {
      const stepsStr = cycle.steps
        .map((s) => `    ${s.completed ? "✓" : "○"} ${s.title}${s.notes ? ` — ${s.notes}` : ""}`)
        .join("\n");
      return `  Cycle ${cycle.cycleNumber} (${cycle.triggerType}): ${cycle.triggerSummary}\n${stepsStr}`;
    }).join("\n\n");

    sections.push(
      `PRIOR ACTION CYCLES FOR THIS SITUATION:\n` +
      `This situation has been worked on before. Here is what was already done:\n\n` +
      `${cycleLines}\n\n` +
      `Your action plan should build on this history. Do NOT repeat steps that were already completed successfully. ` +
      `Focus only on what needs to happen NEXT given the current context and any new information (e.g., a response received, a timeout elapsed). ` +
      `Your plan should ONLY include steps that are decidable with current information. ` +
      `If the next step depends on an external response that hasn't arrived yet, do NOT include speculative future steps — the system will create a new cycle when that response arrives.`
    );
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

  // AVAILABLE AUTOMATED ACTIONS
  if (input.permittedActions.length > 0) {
    const actionLines = input.permittedActions.map(a => {
      const schema = a.inputSchema ? `\n    Input: ${JSON.stringify(a.inputSchema)}` : "";
      return `  - ${a.name}: ${a.description}${a.connector ? ` (via ${a.connector})` : ""}${schema}`;
    }).join("\n");
    sections.push(`AVAILABLE AUTOMATED ACTIONS (use executionMode "action" for steps matching these):\n${actionLines}\n\nFor steps that don't match any automated action, use executionMode "human_task" and describe clearly what the human should do.`);
  } else {
    sections.push(`AVAILABLE AUTOMATED ACTIONS: None currently connected.\n\nAll steps should use executionMode "human_task" or "generate". Describe each step clearly — the employee will execute them manually. The value of the plan is in knowing WHAT to do and in WHAT ORDER, not in automation.`);
  }

  // BLOCKED ACTIONS
  if (input.blockedActions.length > 0) {
    const blockedStr = input.blockedActions
      .map((b) => `  - ${b.name}: ${b.reason}`)
      .join("\n");
    sections.push(`BLOCKED ACTIONS (cannot use these):\n${blockedStr}`);
  }

  // OPERATIONAL KNOWLEDGE (v3 day 6)
  if (input.operationalInsights && input.operationalInsights.length > 0) {
    const insightLines = input.operationalInsights.map((i) =>
      `- [${i.insightType}] (confidence: ${i.confidence.toFixed(2)}, based on ${i.sampleSize} situations): ${i.description}`,
    );
    sections.push(`OPERATIONAL INSIGHTS:\n${insightLines.join("\n")}`);

    const directives = input.operationalInsights.filter((i) => i.promptModification);
    if (directives.length > 0) {
      const directiveLines = directives.map((i) =>
        `- ${i.promptModification} (confidence: ${i.confidence.toFixed(2)}, ${i.sampleSize} situations)`,
      );
      sections.push(`BEHAVIORAL DIRECTIVES (from operational experience):\n${directiveLines.join("\n")}`);
    }
  }

  // GOVERNANCE
  const autonomyNote = input.autonomyLevel === "autonomous"
    ? "Select an action for immediate execution — your justification must be especially thorough since this will execute without prior approval."
    : "Propose an action for human review.";
  sections.push(`GOVERNANCE:\nAutonomy level: ${input.autonomyLevel}\n${autonomyNote}`);

  return sections.join("\n\n");
}
