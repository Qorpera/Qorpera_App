/**
 * Knowledge & Communication Analyst — Round 1 LLM agent.
 *
 * Maps where institutional knowledge lives, how information flows,
 * and where knowledge bottlenecks and silos exist.
 */

import { prisma } from "@/lib/db";
import { triggerNextIteration } from "@/lib/internal-api";
import { addProgressMessage } from "../progress";

// ── Agent Prompt ─────────────────────────────────────────────────────────────

export const KNOWLEDGE_ANALYST_PROMPT = `You are the Knowledge & Communication Analyst for a deep organizational intelligence engagement. Your job is to understand WHERE institutional knowledge lives, HOW information flows between people, and WHERE knowledge bottlenecks and silos exist.

Documents may be in Danish or English — work across both languages.

## Your Investigation Process

### Phase 1 — Knowledge Inventory
Map where institutional knowledge lives:
1. Search for all document types: wikis, handbooks, guides, templates, SOPs, meeting notes, project documentation ("vejledning", "skabelon", "mødenotat", "dokumentation", "knowledge base")
2. For each document cluster, identify: who created it, who maintains it, when it was last updated, who references it
3. Check document sharing patterns — are critical docs accessible to the right people?
4. Look for knowledge concentrated in specific storage locations (one Drive folder, one Slack channel)

### Phase 2 — Knowledge Bottleneck Detection
Identify people who are single points of knowledge:
1. Look for people who are the ONLY author of critical documentation
2. Look for people who are asked questions disproportionately (Slack DMs, email questions directed to one person)
3. Look for processes where knowledge transfer hasn't happened (one person always handles X, nobody else knows how)
4. Cross-reference with the People Registry — who has no backup for their knowledge domain?

### Phase 3 — Information Flow Analysis
Map how information moves:
1. Which Slack channels are most active? What topics dominate each?
2. Are there information silos — teams that don't communicate with each other?
3. What's the balance between synchronous (meetings) vs. asynchronous (email, Slack) communication?
4. Are decisions documented or lost in verbal/meeting conversations?
5. Is there a pattern of repeated questions (same info requested multiple times = knowledge gap)?

### Phase 4 — Communication Health
Assess the overall communication culture:
1. Response time norms — how quickly do people respond to each other?
2. Communication density — are some teams over-communicating (meeting overload) or under-communicating (silos)?
3. Cross-department communication patterns — who bridges teams?
4. Escalation patterns — how do issues move up the chain?

## What to Report

Your final report must be a JSON object with this structure:
{
  "knowledgeInventory": [{ "domain": "...", "description": "...", "location": "...", "ownerEmail": "...", "freshnessScore": 0.0-1.0, "accessibility": "shared_broadly|team_only|individual|undocumented" }],
  "bottleneckPeople": [{ "email": "...", "displayName": "...", "knowledgeDomains": ["..."], "riskLevel": "critical|high|medium", "evidence": "...", "recommendation": "..." }],
  "informationFlowMap": {
    "primaryChannelsPerTeam": [{ "team": "...", "channels": [{ "type": "...", "name": "...", "activityLevel": "..." }] }],
    "crossTeamBridges": [{ "personEmail": "...", "teamsConnected": ["..."], "bridgeStrength": "strong|moderate|weak" }],
    "silos": [{ "team1": "...", "team2": "...", "communicationLevel": "none|minimal|indirect_only", "evidence": "..." }]
  },
  "communicationHealth": { "avgResponseTimeHours": 0, "meetingLoadAssessment": "healthy|heavy|excessive", "decisionDocumentationQuality": "good|partial|poor", "overallAssessment": "..." },
  "situationTypeRecommendations": [{ "name": "...", "description": "...", "detectionSignal": "...", "expectedFrequency": "...", "severity": "high|medium|low", "suggestedAutonomyLevel": "observe|propose", "department": "..." }]
}

Signal DONE when you have mapped the knowledge landscape, identified bottlenecks, and assessed communication health.`;

// ── Report Type ──────────────────────────────────────────────────────────────

export interface KnowledgeAnalystReport {
  knowledgeInventory: Array<{
    domain: string;
    description: string;
    location: string;
    ownerEmail?: string;
    freshnessScore?: number;
    accessibility: "shared_broadly" | "team_only" | "individual" | "undocumented";
  }>;
  bottleneckPeople: Array<{
    email: string;
    displayName: string;
    knowledgeDomains: string[];
    riskLevel: "critical" | "high" | "medium";
    evidence: string;
    recommendation: string;
  }>;
  informationFlowMap: {
    primaryChannelsPerTeam: Array<{
      team: string;
      channels: Array<{ type: string; name: string; activityLevel: string }>;
    }>;
    crossTeamBridges: Array<{
      personEmail: string;
      teamsConnected: string[];
      bridgeStrength: "strong" | "moderate" | "weak";
    }>;
    silos: Array<{
      team1: string;
      team2: string;
      communicationLevel: "none" | "minimal" | "indirect_only";
      evidence: string;
    }>;
  };
  communicationHealth: {
    avgResponseTimeHours: number;
    meetingLoadAssessment: "healthy" | "heavy" | "excessive";
    decisionDocumentationQuality: "good" | "partial" | "poor";
    overallAssessment: string;
  };
  situationTypeRecommendations: Array<{
    name: string;
    description: string;
    detectionSignal: string;
    expectedFrequency: string;
    severity: "high" | "medium" | "low";
    suggestedAutonomyLevel: "observe" | "propose";
    department: string;
  }>;
}

// ── Launch Function ──────────────────────────────────────────────────────────

export async function launchKnowledgeAnalyst(analysisId: string): Promise<void> {
  const run = await prisma.onboardingAgentRun.create({
    data: {
      analysisId,
      agentName: "knowledge_analyst",
      round: 1,
      status: "running",
      maxIterations: 30,
      startedAt: new Date(),
    },
  });

  await addProgressMessage(
    analysisId,
    "Analyzing knowledge distribution and communication patterns...",
    "knowledge_analyst",
  );
  await triggerNextIteration(run.id);
}
