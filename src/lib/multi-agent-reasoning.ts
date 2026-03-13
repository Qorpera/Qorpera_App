import { callLLM } from "@/lib/ai-provider";
import type { ReasoningInput } from "@/lib/reasoning-prompts";
import type { ContextSectionMeta, EntitySummary } from "@/lib/context-assembly";
import { ReasoningOutputSchema, type ReasoningOutput } from "@/lib/reasoning-engine";

// ── Constants ────────────────────────────────────────────────────────────────

export const MULTI_AGENT_TOKEN_THRESHOLD = 12000;

// ── Types ────────────────────────────────────────────────────────────────────

interface SpecialistFinding {
  domain: string;
  summary: string;
  keyFindings: string[];
  riskFactors: string[];
  opportunities: string[];
  recommendedActions: string[];
  evidenceCited: string[];
  confidenceLevel: number;
  gapsIdentified: string[];
}

export interface MultiAgentResult {
  findings: SpecialistFinding[];
  coordinatorReasoning: ReasoningOutput;
  routingReason: string;
}

// ── Token Estimation ─────────────────────────────────────────────────────────

export function estimateContextTokens(contextSections: ContextSectionMeta[]): number {
  return contextSections.reduce((sum, s) => sum + s.tokenEstimate, 0);
}

export function shouldUseMultiAgent(contextSections: ContextSectionMeta[]): boolean {
  return estimateContextTokens(contextSections) > MULTI_AGENT_TOKEN_THRESHOLD;
}

// ── Prompt Section Formatters ────────────────────────────────────────────────

function formatEntitySection(input: ReasoningInput): string {
  const propsStr = Object.entries(input.triggerEntity.properties)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");
  return `ENTITY: ${input.triggerEntity.displayName} [${input.triggerEntity.type}, ${input.triggerEntity.category}]\n${propsStr || "  (no properties)"}`;
}

function formatBehavioralEvidence(input: ReasoningInput): string {
  const behaviorParts: string[] = [];

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

    const rtBucket = input.activityTimeline.buckets.find((b) => b.avgResponseTimeHours != null);
    if (rtBucket) {
      behaviorParts.push(`  Avg email response time: ${rtBucket.avgResponseTimeHours}h`);
    }
    behaviorParts.push(`  Trend: ${input.activityTimeline.trend}`);
  } else {
    behaviorParts.push(`Activity Timeline (${input.triggerEntity.displayName}):\n  No activity signals found for this entity in the last 30 days.`);
  }

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

  return `BEHAVIORAL EVIDENCE:\n\n${behaviorParts.join("\n")}`;
}

function formatCrossDepartmentSignals(input: ReasoningInput): string {
  if (input.crossDepartmentSignals.signals.length === 0) return "";
  const sigLines = input.crossDepartmentSignals.signals.map((s) => {
    const parts = [];
    if (s.emailCount > 0) parts.push(`${s.emailCount} emails`);
    if (s.meetingCount > 0) parts.push(`${s.meetingCount} meetings`);
    if (s.slackMentions > 0) parts.push(`${s.slackMentions} messages`);
    const lastAct = s.lastActivityDate ? ` Last activity: ${s.lastActivityDate}.` : "";
    return `  ${s.departmentName}: ${parts.join(", ")}.${lastAct}`;
  });
  return `CROSS-DEPARTMENT SIGNALS (other departments' interaction with ${input.triggerEntity.displayName}):\n${sigLines.join("\n")}`;
}

function formatRelatedEntities(input: ReasoningInput, categoryFilter?: string[]): string {
  const categoryGroups: { label: string; key: string; items: EntitySummary[] }[] = [
    { label: "People", key: "base", items: input.relatedEntities.base },
    { label: "Operational Data", key: "digital", items: input.relatedEntities.digital },
    { label: "External Parties", key: "external", items: input.relatedEntities.external },
  ];

  const filtered = categoryFilter
    ? categoryGroups.filter((g) => categoryFilter.includes(g.key))
    : categoryGroups;

  const entityParts = filtered
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
    return `RELATED ENTITIES:\n${entityParts.join("\n\n")}`;
  }
  return "";
}

function formatRecentEvents(input: ReasoningInput): string {
  if (input.recentEvents.length === 0) return "";
  const eventsStr = input.recentEvents
    .slice(0, 10)
    .map((e) => {
      const payloadStr = typeof e.payload === "object" && e.payload
        ? " — " + JSON.stringify(e.payload).slice(0, 200)
        : "";
      return `  - [${e.timestamp}] ${e.type}${payloadStr}`;
    })
    .join("\n");
  return `RECENT EVENTS:\n${eventsStr}`;
}

function formatDepartmentContext(input: ReasoningInput): string {
  if (input.departments.length > 0) {
    const deptStr = input.departments
      .map((d) => {
        const lines = [`  ${d.name}${d.description ? ` — ${d.description}` : ""}`];
        if (d.lead) lines.push(`    Lead: ${d.lead.name} (${d.lead.role})`);
        lines.push(`    Team size: ${d.memberCount}`);
        return lines.join("\n");
      })
      .join("\n");
    return `DEPARTMENT CONTEXT:\n${deptStr}`;
  }
  return "DEPARTMENT CONTEXT:\nNo department association found for this entity.";
}

function formatDepartmentKnowledge(input: ReasoningInput): string {
  const relevantKnowledge = input.departmentKnowledge.filter((r) => r.score > 0.3);
  if (relevantKnowledge.length > 0) {
    const knowledgeStr = relevantKnowledge
      .map((r) => `  From '${r.documentName}' (${r.departmentName}):\n    "${r.content}"`)
      .join("\n");
    return `DEPARTMENT KNOWLEDGE:\n${knowledgeStr}`;
  }
  return "DEPARTMENT KNOWLEDGE:\nNo relevant documents found.";
}

function formatPriorSituations(input: ReasoningInput): string {
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
    return `PRIOR SIMILAR SITUATIONS:\n${priorsStr}`;
  }
  return "PRIOR SIMILAR SITUATIONS:\nNo prior examples available.";
}

function formatPermittedActions(input: ReasoningInput): string {
  if (input.permittedActions.length > 0) {
    const actionsStr = input.permittedActions
      .map((a) => {
        const schema = a.inputSchema ? `\n    Input: ${JSON.stringify(a.inputSchema)}` : "";
        return `  - ${a.name} (${a.connector}): ${a.description}${schema}`;
      })
      .join("\n");
    return `PERMITTED ACTIONS:\n${actionsStr}`;
  }
  return "PERMITTED ACTIONS:\nNo actions are currently available. Set chosenAction to null and explain this constraint.";
}

function formatBlockedActions(input: ReasoningInput): string {
  if (input.blockedActions.length === 0) return "";
  const blockedStr = input.blockedActions
    .map((b) => `  - ${b.name}: ${b.reason}`)
    .join("\n");
  return `BLOCKED ACTIONS (cannot use these):\n${blockedStr}`;
}

function formatGovernance(input: ReasoningInput): string {
  const autonomyNote = input.autonomyLevel === "supervised"
    ? "Propose an action for human review."
    : "Select an action for immediate execution — your justification must be especially thorough since this will execute without prior approval.";
  return `GOVERNANCE:\nAutonomy level: ${input.autonomyLevel}\n${autonomyNote}`;
}

// ── Specialist Definitions ───────────────────────────────────────────────────

const SPECIALIST_FINDING_SCHEMA = `{
  "domain": "string",
  "summary": "string — 2-3 sentence executive summary",
  "keyFindings": ["string"],
  "riskFactors": ["string"],
  "opportunities": ["string"],
  "recommendedActions": ["string"],
  "evidenceCited": ["string — specific data points referenced"],
  "confidenceLevel": 0.0 to 1.0,
  "gapsIdentified": ["string — what info is missing from your domain"]
}`;

interface SpecialistAgent {
  name: string;
  domain: string;
  buildPrompt: (input: ReasoningInput, companyName?: string) => { system: string; user: string };
}

function situationHeader(input: ReasoningInput): string {
  return `SITUATION: ${input.situationType.name}\nDescription: ${input.situationType.description}\nSeverity: ${input.severity.toFixed(2)} (0=low, 1=critical)\nEntity: ${input.triggerEntity.displayName} [${input.triggerEntity.type}, ${input.triggerEntity.category}]`;
}

const specialists: SpecialistAgent[] = [
  {
    name: "Financial Analyst",
    domain: "financial",
    buildPrompt(input: ReasoningInput, companyName?: string) {
      const system = `You are a Financial Analyst specialist for ${companyName || "this company"}.

Your domain: monetary exposure, payment patterns, invoice health, deal status, financial risk assessment.

You are analyzing one dimension of a business situation. Other specialists handle communication patterns and compliance — focus only on financial evidence.

${situationHeader(input)}

Respond with ONLY valid JSON matching this schema:
${SPECIALIST_FINDING_SCHEMA}

CRITICAL: Cite specific financial data points from the evidence. Flag missing financial information in gapsIdentified.`;

      const sections = [
        formatEntitySection(input),
        formatRecentEvents(input),
        formatRelatedEntities(input, ["digital"]),
        input.businessContext ? `BUSINESS CONTEXT:\n${input.businessContext}` : "",
      ].filter(Boolean);

      return { system, user: sections.join("\n\n") };
    },
  },
  {
    name: "Communication Analyst",
    domain: "communication",
    buildPrompt(input: ReasoningInput, companyName?: string) {
      const system = `You are a Communication Analyst specialist for ${companyName || "this company"}.

Your domain: relationship health, communication trends, response patterns, engagement levels, red flags in message content, cross-department interaction patterns.

You are analyzing one dimension of a business situation. Other specialists handle financial data and compliance — focus only on communication and behavioral evidence.

${situationHeader(input)}

Respond with ONLY valid JSON matching this schema:
${SPECIALIST_FINDING_SCHEMA}

CRITICAL: Cite specific communication patterns, message excerpts, and activity trends. Flag missing behavioral data in gapsIdentified.`;

      const sections = [
        formatBehavioralEvidence(input),
        formatCrossDepartmentSignals(input),
        formatRelatedEntities(input, ["base"]),
      ].filter(Boolean);

      return { system, user: sections.join("\n\n") };
    },
  },
  {
    name: "Process/Compliance Analyst",
    domain: "compliance",
    buildPrompt(input: ReasoningInput, companyName?: string) {
      const system = `You are a Process/Compliance Analyst specialist for ${companyName || "this company"}.

Your domain: process compliance, playbook adherence, policy constraints, precedent analysis from prior situations, governance rules.

You are analyzing one dimension of a business situation. Other specialists handle financial data and communication patterns — focus only on process compliance and what prior situations teach us.

${situationHeader(input)}

Respond with ONLY valid JSON matching this schema:
${SPECIALIST_FINDING_SCHEMA}

CRITICAL: Reference specific playbook excerpts, policy rules, and prior situation outcomes. Flag missing process documentation in gapsIdentified.`;

      const sections = [
        formatDepartmentKnowledge(input),
        formatDepartmentContext(input),
        formatPriorSituations(input),
        formatPermittedActions(input),
        formatBlockedActions(input),
        formatGovernance(input),
      ].filter(Boolean);

      return { system, user: sections.join("\n\n") };
    },
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractJSON(text: string): Record<string, unknown> | null {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();
  try {
    const parsed = JSON.parse(jsonStr);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function fallbackFinding(domain: string): SpecialistFinding {
  return {
    domain,
    summary: "Analysis unavailable — specialist encountered an error",
    keyFindings: [],
    riskFactors: [],
    opportunities: [],
    recommendedActions: [],
    evidenceCited: [],
    confidenceLevel: 0,
    gapsIdentified: ["Specialist analysis failed — no data available for this domain"],
  };
}

// ── Parallel Specialist Execution ────────────────────────────────────────────

async function runSpecialists(
  input: ReasoningInput,
  companyName?: string,
): Promise<SpecialistFinding[]> {
  const calls = specialists.map(async (spec): Promise<SpecialistFinding> => {
    const { system, user } = spec.buildPrompt(input, companyName);
    const messages = [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ];

    const response = await callLLM(messages, {
      temperature: 0.2,
      maxTokens: 2048,
      aiFunction: "reasoning",
    });

    const parsed = extractJSON(response.content);
    if (!parsed) {
      console.warn(`[multi-agent] Failed to parse ${spec.name} response as JSON`);
      return fallbackFinding(spec.domain);
    }

    // Validate required fields loosely — LLMs may produce slight variations
    const finding = parsed as Record<string, unknown>;
    return {
      domain: spec.domain,
      summary: typeof finding.summary === "string" ? finding.summary : "No summary provided",
      keyFindings: Array.isArray(finding.keyFindings) ? finding.keyFindings.map(String) : [],
      riskFactors: Array.isArray(finding.riskFactors) ? finding.riskFactors.map(String) : [],
      opportunities: Array.isArray(finding.opportunities) ? finding.opportunities.map(String) : [],
      recommendedActions: Array.isArray(finding.recommendedActions) ? finding.recommendedActions.map(String) : [],
      evidenceCited: Array.isArray(finding.evidenceCited) ? finding.evidenceCited.map(String) : [],
      confidenceLevel: typeof finding.confidenceLevel === "number" ? finding.confidenceLevel : 0.5,
      gapsIdentified: Array.isArray(finding.gapsIdentified) ? finding.gapsIdentified.map(String) : [],
    };
  });

  const results = await Promise.allSettled(calls);

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`[multi-agent] ${specialists[i].name} failed:`, r.reason);
    return fallbackFinding(specialists[i].domain);
  });
}

// ── Coordinator Synthesis ────────────────────────────────────────────────────

async function coordinatorSynthesize(
  input: ReasoningInput,
  findings: SpecialistFinding[],
  companyName?: string,
): Promise<ReasoningOutput> {
  const systemPrompt = `You are the coordinating AI operations agent for ${companyName || "this company"}.

You have received analysis from three specialist agents who each examined a different dimension of a business situation. Your job is to synthesize their findings into a single coherent decision.

SPECIALIST DOMAINS:
- Financial Analyst: assessed monetary exposure, payment patterns, deal health
- Communication Analyst: assessed relationship health, communication trends, engagement
- Process/Compliance Analyst: checked policy compliance, playbook adherence, precedent

YOUR TASK:
1. Read all specialist findings
2. Identify where they agree, disagree, or have gaps
3. Weigh the evidence across domains
4. Decide on the best action (or no action if evidence is insufficient)
5. Produce the final decision in the required JSON format

GOVERNANCE POLICIES ARE HARD BLOCKERS:
- BLOCKED actions are forbidden. Do not consider them under any circumstances.
- REQUIRE_APPROVAL actions must go through human review regardless of autonomy level.
- Policies are not guidelines — they are constraints that cannot be reasoned around.

OUTPUT FORMAT:
Respond with ONLY valid JSON (no markdown fences, no commentary):
{
  "analysis": "string — synthesis of specialist findings, noting agreements/conflicts",
  "evidenceSummary": "string — the 3-5 key findings across all specialists",
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
    "justification": "string — MUST cite which specialist's findings support the decision"
  } or null,
  "confidence": 0.0 to 1.0,
  "missingContext": ["specific information that would improve this decision"] or null
}

CRITICAL: chosenAction MUST reference a PERMITTED action or be null. Cite which specialist's findings support the decision.`;

  // Build user prompt with specialist findings
  const findingSections = findings.map((f) => {
    const label = f.domain === "financial"
      ? "Financial Analyst"
      : f.domain === "communication"
        ? "Communication Analyst"
        : "Process/Compliance Analyst";
    return `=== ${label} ===
Summary: ${f.summary}
Key findings: ${f.keyFindings.join("; ") || "none"}
Risk factors: ${f.riskFactors.join("; ") || "none"}
Opportunities: ${f.opportunities.join("; ") || "none"}
Recommended actions: ${f.recommendedActions.join("; ") || "none"}
Evidence cited: ${f.evidenceCited.join("; ") || "none"}
Confidence: ${f.confidenceLevel}
Gaps: ${f.gapsIdentified.join("; ") || "none"}`;
  });

  const userSections = [
    situationHeader(input),
    `SPECIALIST FINDINGS:\n\n${findingSections.join("\n\n")}`,
    formatPermittedActions(input),
    formatBlockedActions(input),
    formatGovernance(input),
  ].filter(Boolean);

  const userPrompt = userSections.join("\n\n");

  // 2-attempt retry with validation (same pattern as single-pass)
  let rawResponse = "";
  let parseError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const messages = [
      { role: "system" as const, content: systemPrompt },
      {
        role: "user" as const,
        content: attempt === 0
          ? userPrompt
          : `${userPrompt}\n\nPREVIOUS ATTEMPT FAILED VALIDATION: ${parseError}\nPlease fix the JSON output to match the required schema exactly.`,
      },
    ];

    const response = await callLLM(messages, {
      temperature: 0.2,
      maxTokens: 4096,
      aiFunction: "reasoning",
    });
    rawResponse = response.content;

    const parsed = extractJSON(rawResponse);
    if (!parsed) {
      parseError = "Could not parse JSON from response";
      if (attempt === 0) continue;
      break;
    }

    const result = ReasoningOutputSchema.safeParse(parsed);
    if (!result.success) {
      parseError = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      if (attempt === 0) continue;
      break;
    }

    return result.data;
  }

  // Fallback if coordinator fails
  console.warn(`[multi-agent] Coordinator synthesis failed: ${parseError}`);
  return {
    analysis: `Multi-agent coordinator failed to produce valid output. Raw: ${rawResponse.slice(0, 500)}`,
    evidenceSummary: "Coordinator synthesis failed — specialist findings were collected but could not be synthesized.",
    consideredActions: [],
    chosenAction: null,
    confidence: 0,
    missingContext: ["Coordinator synthesis failed — manual review required"],
  };
}

// ── Main Entry Point ─────────────────────────────────────────────────────────

export async function runMultiAgentReasoning(
  input: ReasoningInput,
  contextSections: ContextSectionMeta[],
  companyName?: string,
): Promise<MultiAgentResult> {
  const findings = await runSpecialists(input, companyName);
  const coordinatorReasoning = await coordinatorSynthesize(input, findings, companyName);
  return {
    findings,
    coordinatorReasoning,
    routingReason: `Context estimated at ${estimateContextTokens(contextSections)} tokens (threshold: ${MULTI_AGENT_TOKEN_THRESHOLD})`,
  };
}
