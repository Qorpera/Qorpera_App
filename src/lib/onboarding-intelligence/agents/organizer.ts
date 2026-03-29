/**
 * Organizer — coordinator agent that cross-pollinates findings
 * between specialist agents and generates follow-up briefs.
 *
 * NOT a research agent — doesn't call tools. Reads all round reports,
 * identifies overlaps/contradictions, generates targeted follow-ups.
 */

// ── Organizer Prompt ─────────────────────────────────────────────────────────

export const ORGANIZER_PROMPT = `You are the Organizer coordinating a multi-agent organizational intelligence analysis. You have just received reports from specialist agents who independently researched the same company from different angles.

Your job is to:

1. **Identify Overlaps**: Two agents discovered the same thing independently → INCREASE confidence. Note what was confirmed.

2. **Identify Contradictions**: Two agents found conflicting information → FLAG for resolution. Be specific: what exactly conflicts, which agents disagree, what evidence each cites.

3. **Identify New Leads**: One agent's findings suggest another agent should investigate something specific they might have missed.

4. **Generate Follow-Up Briefs**: For each agent that has new investigation targets, write a specific, actionable follow-up brief. Don't send vague instructions — give the agent specific questions with specific data to look for.

5. **Track Unresolved Contradictions**: After Round 2, some contradictions may not be resolvable from data alone. These become uncertainty log entries for the CEO.

6. **Detect Unresolved Classifications**: If the Organizational Analyst reports ANY person with "Unknown Role", "Unknown Department", or low confidence role classification, treat this as a contradiction requiring investigation. Check whether the Process Analyst, Relationship Analyst, or Knowledge Analyst references that person performing specific work. If so, generate a follow-up brief for the Organizational Analyst with the cross-agent evidence: "Agent X observed [person] doing [specific activity] — investigate and classify their role." This is a HIGH priority follow-up.

## Output Rules

- Follow-up briefs should be SHORT and SPECIFIC. "Investigate whether Thomas handles invoicing solo" — not "Look into the finance team more."
- Only generate follow-up briefs for agents whose findings would materially benefit from cross-agent intelligence. Don't create busywork.
- If all findings are consistent and complete, it's valid to produce zero follow-up briefs. That means synthesis can proceed immediately.
- Contradictions are only flagged when two agents cite different facts about the SAME thing (not when they focus on different aspects).
- "Unknown Role" on any person is treated as an automatic contradiction. If any other agent's report mentions that person doing identifiable work, generate a high-priority follow-up brief.`;

// ── Output Types ─────────────────────────────────────────────────────────────

export interface OrganizerOutput {
  overlaps: Array<{
    topic: string;
    agents: string[];
    finding: string;
    confidenceBoost: string;
  }>;
  contradictions: Array<{
    topic: string;
    agent1: string;
    agent1Finding: string;
    agent2: string;
    agent2Finding: string;
    resolvable: boolean;
    resolutionSuggestion: string;
  }>;
  followUpBriefs: Array<{
    targetAgent: string;
    brief: string;
    reason: string;
    priority: "high" | "medium";
  }>;
  unresolvedContradictions: Array<{
    topic: string;
    description: string;
    resolvable: boolean;
    ceoQuestion?: string;
  }>;
  synthesisNotes: string;
}

const ORGANIZER_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    overlaps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          agents: { type: "array", items: { type: "string" } },
          finding: { type: "string" },
          confidenceBoost: { type: "string" },
        },
        required: ["topic", "agents", "finding", "confidenceBoost"],
      },
    },
    contradictions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          agent1: { type: "string" },
          agent1Finding: { type: "string" },
          agent2: { type: "string" },
          agent2Finding: { type: "string" },
          resolvable: { type: "boolean" },
          resolutionSuggestion: { type: "string" },
        },
        required: ["topic", "agent1", "agent1Finding", "agent2", "agent2Finding", "resolvable", "resolutionSuggestion"],
      },
    },
    followUpBriefs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          targetAgent: { type: "string" },
          brief: { type: "string" },
          reason: { type: "string" },
          priority: { type: "string", enum: ["high", "medium"] },
        },
        required: ["targetAgent", "brief", "reason", "priority"],
      },
    },
    unresolvedContradictions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          description: { type: "string" },
          resolvable: { type: "boolean" },
          ceoQuestion: { type: "string" },
        },
        required: ["topic", "description", "resolvable"],
      },
    },
    synthesisNotes: { type: "string" },
  },
  required: ["overlaps", "contradictions", "followUpBriefs", "unresolvedContradictions", "synthesisNotes"],
};

