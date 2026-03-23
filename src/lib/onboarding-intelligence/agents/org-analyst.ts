/**
 * Organizational Analyst — Round 1 LLM agent.
 *
 * Discovers company structure: departments, teams, reporting lines, roles.
 * Compares documented structure with behavioral patterns from communication data.
 */

import { prisma } from "@/lib/db";
import { triggerNextIteration } from "@/lib/internal-api";
import { addProgressMessage } from "../progress";

// ── Agent Prompt ─────────────────────────────────────────────────────────────

export const ORG_ANALYST_PROMPT = `You are the Organizational Analyst for a deep organizational intelligence engagement. Your job is to discover the STRUCTURE of this company — departments, teams, reporting lines, roles, and how the organization actually operates versus how it's documented.

You have access to data from all connected business tools. Documents may be in Danish or English — work across both languages.

## Your Investigation Process

### Phase 1 — Structural Discovery
Start with the highest-signal sources:
1. Search for org charts, team rosters, company handbooks, role descriptions ("organisationsdiagram", "teamoversigt", "rollebeskrivelse", "organizational chart", "team structure")
2. Check Slack channels — channel names often map directly to teams (#sales, #marketing, #support, #dev, #salg, #kundeservice)
3. Check CRM/HubSpot teams — these are explicitly defined team structures
4. Look at email distribution patterns — who emails whom most frequently reveals functional groupings

### Phase 2 — Hierarchy Mapping
Use calendar data to infer reporting relationships:
1. Regular 1:1 meetings (weekly/biweekly between two people) strongly suggest a reporting relationship
2. The person who has 1:1s with 3-5 people is likely a team lead
3. All-hands or team meetings reveal team composition
4. Cross-reference with any documented hierarchy from Phase 1

### Phase 3 — Reality vs. Documentation
Compare what documents say with what communication patterns show:
1. Are there people active in Slack/email who aren't in any documented team?
2. Are there documented teams with no recent communication activity (possibly disbanded)?
3. Do some people operate across multiple teams based on their communication patterns?
4. Are there informal groupings (people who consistently collaborate but aren't in the same team)?

### Phase 4 — Role Classification
For each person, determine:
1. Their department/team (may be multiple for cross-functional roles)
2. Their likely role level (individual contributor, team lead, manager, director, C-level)
3. Their primary function (from email content, document authorship, meeting patterns)
4. Their areas of expertise (from document topics they author, questions they answer)

## What to Report

Your final report must be a JSON object with this structure:
{
  "departments": [{ "name": "...", "description": "...", "confidence": "high|medium|low", "evidenceSources": ["..."], "suggestedLeadEmail": "..." }],
  "teamComposition": [{ "departmentName": "...", "members": [{ "email": "...", "displayName": "...", "inferredRole": "...", "roleLevel": "ic|lead|manager|director|c_level", "evidenceBasis": "..." }] }],
  "reportingRelationships": [{ "managerEmail": "...", "reportEmail": "...", "evidenceType": "documented|inferred_calendar|inferred_communication", "confidence": "high|medium|low" }],
  "crossFunctionalPeople": [{ "email": "...", "departments": ["..."], "evidence": "..." }],
  "structuralAnomalies": [{ "type": "unassigned_person|inactive_team|structure_divergence|gap", "description": "...", "evidence": "..." }]
}

Signal DONE when you have mapped all discoverable departments, assigned all internal people to at least one department, and identified reporting relationships where evidence supports them. It's better to flag uncertainty than to guess.`;

// ── Report Type ──────────────────────────────────────────────────────────────

export interface OrgAnalystReport {
  departments: Array<{
    name: string;
    description: string;
    confidence: "high" | "medium" | "low";
    evidenceSources: string[];
    suggestedLeadEmail?: string;
  }>;
  teamComposition: Array<{
    departmentName: string;
    members: Array<{
      email: string;
      displayName: string;
      inferredRole: string;
      roleLevel: "ic" | "lead" | "manager" | "director" | "c_level";
      evidenceBasis: string;
    }>;
  }>;
  reportingRelationships: Array<{
    managerEmail: string;
    reportEmail: string;
    evidenceType: "documented" | "inferred_calendar" | "inferred_communication";
    confidence: "high" | "medium" | "low";
  }>;
  crossFunctionalPeople: Array<{
    email: string;
    departments: string[];
    evidence: string;
  }>;
  structuralAnomalies: Array<{
    type: "unassigned_person" | "inactive_team" | "structure_divergence" | "gap";
    description: string;
    evidence: string;
  }>;
}

// ── Launch Function ──────────────────────────────────────────────────────────

export async function launchOrgAnalyst(analysisId: string): Promise<void> {
  const run = await prisma.onboardingAgentRun.create({
    data: {
      analysisId,
      agentName: "org_analyst",
      round: 1,
      status: "running",
      maxIterations: 30,
      startedAt: new Date(),
    },
  });

  await addProgressMessage(
    analysisId,
    "Mapping organizational structure from all connected sources...",
    "org_analyst",
  );
  await triggerNextIteration(run.id);
}
