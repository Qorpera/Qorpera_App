/**
 * Agent prompt registry — maps agent names to their specialized system prompts.
 */

import { TEMPORAL_ANALYST_PROMPT } from "./temporal-analyst";
import { ORG_ANALYST_PROMPT } from "./org-analyst";
import { PROCESS_ANALYST_PROMPT } from "./process-analyst";
import { RELATIONSHIP_ANALYST_PROMPT } from "./relationship-analyst";
import { KNOWLEDGE_ANALYST_PROMPT } from "./knowledge-analyst";
import { FINANCIAL_ANALYST_PROMPT } from "./financial-analyst";

const AGENT_PROMPTS: Record<string, string> = {
  temporal_analyst: TEMPORAL_ANALYST_PROMPT,
  org_analyst: ORG_ANALYST_PROMPT,
  process_analyst: PROCESS_ANALYST_PROMPT,
  relationship_analyst: RELATIONSHIP_ANALYST_PROMPT,
  knowledge_analyst: KNOWLEDGE_ANALYST_PROMPT,
  financial_analyst: FINANCIAL_ANALYST_PROMPT,
};

/**
 * Get the system prompt for an agent by name.
 * Returns undefined for unregistered agents (agent-runner uses generic fallback).
 */
export function getAgentPrompt(agentName: string): string | undefined {
  return AGENT_PROMPTS[agentName];
}
