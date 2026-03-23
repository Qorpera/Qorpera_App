/**
 * Agent tool registry: maps tool names to their schemas and handlers.
 *
 * Every agent can use every tool — specialization is in the prompts, not tool access.
 */

import type { AgentTool, ToolContext, ToolCallResult } from "../types";

import searchContent from "./search-content";
import searchEntities from "./search-entities";
import getEntityDetails from "./get-entity-details";
import searchActivity from "./search-activity";
import getCalendarPatterns from "./get-calendar-patterns";
import getEmailPatterns from "./get-email-patterns";
import getDocumentList from "./get-document-list";
import getContentByIds from "./get-content-by-ids";
import getFinancialData from "./get-financial-data";
import getCrmData from "./get-crm-data";
import getSlackChannels from "./get-slack-channels";

// ── Tool Map ─────────────────────────────────────────────────────────────────

const ALL_TOOLS: AgentTool[] = [
  searchContent,
  searchEntities,
  getEntityDetails,
  searchActivity,
  getCalendarPatterns,
  getEmailPatterns,
  getDocumentList,
  getContentByIds,
  getFinancialData,
  getCrmData,
  getSlackChannels,
];

const TOOL_MAP = new Map<string, AgentTool>(ALL_TOOLS.map((t) => [t.name, t]));

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the full tool set for an agent.
 * All agents currently share the same tools — specialization is prompt-based.
 */
export function getToolsForAgent(_agentName: string): AgentTool[] {
  return ALL_TOOLS;
}

/**
 * Execute a single tool call with timing.
 * Errors are caught and returned as error messages (never crash the iteration).
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const tool = TOOL_MAP.get(toolName);
  if (!tool) {
    return {
      result: `Error: Unknown tool "${toolName}". Available tools: ${ALL_TOOLS.map((t) => t.name).join(", ")}`,
      durationMs: 0,
    };
  }

  const start = Date.now();
  try {
    const result = await tool.handler(args, ctx);
    return { result, durationMs: Date.now() - start };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      result: `Error executing ${toolName}: ${message}`,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Format tools as function definitions for LLM tool calling.
 */
export function formatToolsForLLM(agentName: string) {
  return getToolsForAgent(agentName).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}
