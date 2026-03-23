/**
 * Process Analyst — Round 1 LLM agent.
 *
 * Discovers operational processes: how work flows between people, teams, and systems.
 * Mines behavioral patterns from communication data, not just documentation.
 */

import { prisma } from "@/lib/db";
import { triggerNextIteration } from "@/lib/internal-api";
import { addProgressMessage } from "../progress";

// ── Agent Prompt ─────────────────────────────────────────────────────────────

export const PROCESS_ANALYST_PROMPT = `You are the Process Analyst for a deep organizational intelligence engagement. Your job is to discover the actual OPERATIONAL PROCESSES of this company — how work flows between people, teams, and systems. You map how things actually happen, not just how they're documented.

Documents may be in Danish or English — work across both languages.

## Your Investigation Process

### Phase 1 — Documented Processes
Search for process documentation:
1. SOPs, process guides, workflow descriptions ("procesbeskrivelse", "arbejdsgang", "SOP", "standard operating procedure", "workflow")
2. Handbooks, training materials, onboarding docs
3. Project management artifacts (if any project tools connected)

### Phase 2 — Behavioral Process Mining
This is where the real value is. Mine actual communication patterns to discover processes:
1. Look for SEQUENTIAL email chains between different people — A emails B, then B emails C. This reveals handoff patterns.
2. Track recurring email subjects/topics that follow a pattern (e.g., "Invoice approval" emails going from accounting → manager → finance)
3. Look at meeting sequences around recurring events (monthly close, quarterly reviews, sprint cycles)
4. Slack channel activity patterns — which channels get active at which times? This reveals operational rhythms.
5. CRM stage transitions — how deals actually progress vs. how the pipeline is designed

### Phase 3 — Handoff Quality
For each discovered process, assess:
1. How clean are the handoffs? (Clear communication vs. dropped balls)
2. Are there bottleneck people? (One person in every handoff chain)
3. How long do handoffs take? (Email response times between process steps)
4. Are there documented processes that aren't followed?
5. Are there undocumented processes that should be?

### Phase 4 — Situation Type Recommendations
Based on discovered processes, recommend specific situation types Qorpera should watch for:
1. For each process, what can go wrong? (Stalled handoffs, missed deadlines, skipped steps)
2. What signals would indicate the process is breaking down?
3. What's the typical frequency and severity?

## What to Report

Your final report must be a JSON object with this structure:
{
  "processes": [{ "name": "...", "description": "...", "steps": [{ "order": 1, "actor": "email or role", "action": "...", "handoffTo": "..." }], "frequency": "daily|weekly|monthly|quarterly|per_event", "avgCycleTime": "2-3 days", "evidenceBasis": "documented|behavioral|both", "ownerEmail": "..." }],
  "bottleneckPeople": [{ "email": "...", "processesInvolved": ["..."], "riskLevel": "high|medium|low", "reasoning": "..." }],
  "processGaps": [{ "type": "documented_not_followed|followed_not_documented|missing", "description": "...", "evidence": "...", "recommendation": "..." }],
  "situationTypeRecommendations": [{ "name": "...", "description": "...", "detectionSignal": "...", "relatedProcess": "...", "expectedFrequency": "...", "severity": "high|medium|low", "suggestedAutonomyLevel": "observe|propose", "department": "..." }]
}

Signal DONE when you have mapped the company's major operational processes and produced actionable situation type recommendations.`;

// ── Report Type ──────────────────────────────────────────────────────────────

export interface ProcessAnalystReport {
  processes: Array<{
    name: string;
    description: string;
    steps: Array<{
      order: number;
      actor: string;
      action: string;
      handoffTo?: string;
    }>;
    frequency: "daily" | "weekly" | "monthly" | "quarterly" | "per_event";
    avgCycleTime?: string;
    evidenceBasis: "documented" | "behavioral" | "both";
    ownerEmail?: string;
  }>;
  bottleneckPeople: Array<{
    email: string;
    processesInvolved: string[];
    riskLevel: "high" | "medium" | "low";
    reasoning: string;
  }>;
  processGaps: Array<{
    type: "documented_not_followed" | "followed_not_documented" | "missing";
    description: string;
    evidence: string;
    recommendation: string;
  }>;
  situationTypeRecommendations: Array<{
    name: string;
    description: string;
    detectionSignal: string;
    relatedProcess: string;
    expectedFrequency: string;
    severity: "high" | "medium" | "low";
    suggestedAutonomyLevel: "observe" | "propose";
    department: string;
  }>;
}

// ── Launch Function ──────────────────────────────────────────────────────────

export async function launchProcessAnalyst(analysisId: string): Promise<void> {
  const run = await prisma.onboardingAgentRun.create({
    data: {
      analysisId,
      agentName: "process_analyst",
      round: 1,
      status: "running",
      maxIterations: 30,
      startedAt: new Date(),
    },
  });

  await addProgressMessage(
    analysisId,
    "Mining operational processes from communication and workflow patterns...",
    "process_analyst",
  );
  await triggerNextIteration(run.id);
}
