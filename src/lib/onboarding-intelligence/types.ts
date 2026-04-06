/**
 * Shared types for the onboarding intelligence system.
 */

// ── Tool System ──────────────────────────────────────────────────────────────

export interface ToolContext {
  operatorId: string;
  analysisId: string;
  /** Pre-loaded data from Round 0 (available to Round 1+ agents) */
  peopleRegistry?: PeopleRegistryEntry[];
  temporalIndex?: TemporalIndexEntry[];
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
}

export interface ToolCallResult {
  result: string;
  durationMs: number;
}

export interface ToolCallLogEntry {
  tool: string;
  args: Record<string, unknown>;
  resultSummary: string;
  durationMs: number;
  timestamp: string;
}

// ── Working Memory ───────────────────────────────────────────────────────────

export interface WorkingMemory {
  findings: string;
  hypotheses: string[];
  openQuestions: string[];
  investigationPlan: string;
  /** Pending tool results from the last iteration (fed back into next prompt) */
  pendingToolResults?: string;
}

// ── Agent LLM Response ───────────────────────────────────────────────────────

export interface AgentLLMResponse {
  action: "investigate" | "update_memory" | "done";
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
  }>;
  updatedMemory?: WorkingMemory;
  report?: Record<string, unknown>;
}

// ── Round 0 Pre-loaded Data ──────────────────────────────────────────────────

export interface PeopleRegistryEntry {
  entityId: string;
  displayName: string;
  email?: string;
  department?: string;
  role?: string;
}

export interface TemporalIndexEntry {
  date: string;
  eventType: string;
  summary: string;
  entityIds: string[];
}

// ── Synthesis Output ─────────────────────────────────────────────────────────

export interface SynthesisOutput {
  departments: Array<{
    name: string;
    headCount: number;
    keyPeople: string[];
    functions: string[];
  }>;
  people: Array<{
    name: string;
    email?: string;
    department?: string;
    role?: string;
    relationships: string[];
  }>;
  processes: Array<{
    name: string;
    department?: string;
    description: string;
    tools: string[];
  }>;
  relationships: Array<{
    from: string;
    to: string;
    type: string;
    strength: "strong" | "moderate" | "weak";
  }>;
  knowledgeInventory: Array<{
    topic: string;
    sources: string[];
    coverage: "comprehensive" | "partial" | "sparse";
  }>;
  financialBaseline?: {
    revenue?: string;
    keyMetrics: Record<string, string>;
    tools: string[];
  };
  situationRecommendations: Array<{
    name: string;
    description: string;
    department?: string;
    priority: "high" | "medium" | "low";
  }>;
}

// ── Progress ─────────────────────────────────────────────────────────────────

export interface ProgressMessage {
  timestamp: string;
  message: string;
  agentName?: string;
}

// ── Analysis Progress Response ───────────────────────────────────────────────

export interface AnalysisProgressResponse {
  status: "pending" | "analyzing" | "confirming" | "complete" | "failed" | "waiting_for_worker" | "worker_unavailable";
  message?: string;
  currentPhase: string;
  progressMessages: ProgressMessage[];
  estimatedMinutesRemaining?: number;
  contentChunkCount?: number;
  synthesisOutput?: SynthesisOutput;
  uncertaintyLog?: Record<string, unknown>;
  situationCount?: number;
  entityCount?: number;
  relationshipCount?: number;
  postSynthesisStatus?: string | null;
  wikiStats?: {
    totalPages: number;
    verifiedPages: number;
    byType: Record<string, number>;
    avgConfidence: number;
  };
  initiativeCount?: number;
}
