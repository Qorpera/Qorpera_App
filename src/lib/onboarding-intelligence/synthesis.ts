/**
 * Synthesis layer — transforms multi-agent findings into real database entities.
 *
 * After all agent rounds and organizer passes complete, this module:
 * 1. Loads all agent reports
 * 2. LLM call to produce unified company model
 * 3. Creates departments, people, relationships, situation types
 * 4. Sends email notification
 */

import { prisma } from "@/lib/db";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { HARDCODED_TYPE_DEFS } from "@/lib/hardcoded-type-defs";

// ── Company Model Types ──────────────────────────────────────────────────────

export interface CompanyModel {
  departments: Array<{
    name: string;
    description: string;
    confidence: "high" | "medium" | "low";
    suggestedLeadEmail?: string;
  }>;
  people: Array<{
    email: string;
    displayName: string;
    primaryDepartment: string;
    role: string;
    roleLevel: "ic" | "lead" | "manager" | "director" | "c_level";
    reportsToEmail?: string;
    profile?: string;
  }>;
  crossFunctionalPeople: Array<{
    email: string;
    departments: string[];
    evidence: string;
  }>;
  processes: Array<{
    name: string;
    description: string;
    department: string;
    ownerEmail?: string;
    frequency: string;
    steps: Array<{ order: number; actor: string; action: string }>;
  }>;
  keyRelationships: Array<{
    companyName?: string;
    contactName: string;
    contactEmail: string;
    type: "customer" | "prospect" | "partner" | "vendor";
    healthScore: "healthy" | "at_risk" | "cold" | "critical";
    primaryInternalContact: string;
  }>;
  financialSnapshot: {
    estimatedMonthlyRevenue?: number;
    currency: string;
    revenueTrend: string;
    overdueInvoiceCount: number;
    pipelineValue?: number;
    dataCompleteness: string;
  };
  situationTypeRecommendations: Array<{
    name: string;
    description: string;
    detectionMode: "structured" | "content" | "natural";
    detectionLogic: object;    // Schema depends on detectionMode — see SYNTHESIS_PROMPT
    department: string;
    severity: "high" | "medium" | "low";
    expectedFrequency: string;
  }>;
  strategicGoals: Array<{
    title: string;
    description: string;
    scope: "company" | "department";
    department?: string;        // Required if scope is "department", must match a department name
    measurableTarget?: string;  // Quantified target if mentioned (e.g., "30% revenue growth", "DSO under 35 days")
    deadline?: string;          // ISO date string if mentioned
    priority: 1 | 2 | 3;       // 1 = critical, 2 = important, 3 = aspirational
    source: string;             // Which document or communication this was extracted from
    confidence: "high" | "medium" | "low";
  }>;
  uncertaintyLog: Array<{
    question: string;
    context: string;
    possibleAnswers?: string[];
    department?: string;
    scope: "admin" | "department";
    targetEmail?: string;
  }>;
}

// ── Normalize LLM Output ─────────────────────────────────────────────────────

/**
 * Normalizes a raw LLM synthesis output into a valid CompanyModel.
 * Handles common schema drift: members nested inside departments instead of
 * top-level people array, missing fields, alternative key names, etc.
 */
export function normalizeCompanyModel(
  raw: Record<string, unknown>,
): CompanyModel {
  const model = raw as Partial<CompanyModel> & Record<string, unknown>;

  // ── Flatten departments[].members[] into top-level people[] ──
  let people = Array.isArray(model.people) ? model.people : [];

  if (people.length === 0 && Array.isArray(model.departments)) {
    for (const dept of model.departments as Array<Record<string, unknown>>) {
      const members = (dept.members ?? dept.people ?? []) as Array<Record<string, unknown>>;
      for (const m of members) {
        people.push({
          email: (m.email as string) ?? "",
          displayName: (m.displayName ?? m.name ?? "") as string,
          primaryDepartment: (dept.name as string) ?? "Unknown",
          role: (m.role ?? m.title ?? "Member") as string,
          roleLevel: (m.roleLevel ?? "ic") as "ic" | "lead" | "manager" | "director" | "c_level",
          reportsToEmail: m.reportsToEmail as string | undefined,
        });
      }
    }
  }

  // ── Resolve reporting relationships from separate array ──
  const relationships = (model.reportingRelationships ?? []) as Array<Record<string, unknown>>;
  if (relationships.length > 0 && people.some((p) => !p.reportsToEmail)) {
    for (const rel of relationships) {
      const reportEmail = (rel.report ?? rel.reportEmail) as string | undefined;
      const managerEmail = (rel.manager ?? rel.managerEmail) as string | undefined;
      if (!reportEmail || !managerEmail) continue;
      const person = people.find((p) => p.email === reportEmail);
      if (person && !person.reportsToEmail) {
        person.reportsToEmail = managerEmail;
      }
    }
  }

  // ── Clean department objects (strip members — they're now in people[]) ──
  const departments = (Array.isArray(model.departments) ? model.departments : []).map((d: Record<string, unknown>) => ({
    name: (d.name as string) ?? "Unknown",
    description: (d.description as string) ?? "",
    confidence: ((d.confidence as string) ?? "medium") as "high" | "medium" | "low",
    suggestedLeadEmail: d.suggestedLeadEmail as string | undefined,
  }));

  const strategicGoals = Array.isArray(model.strategicGoals)
    ? (model.strategicGoals as Array<Record<string, unknown>>).map(g => ({
        title: (g.title as string) ?? "",
        description: (g.description as string) ?? "",
        scope: ((g.scope as string) === "department" ? "department" : "company") as "company" | "department",
        department: g.department as string | undefined,
        measurableTarget: g.measurableTarget as string | undefined,
        deadline: g.deadline as string | undefined,
        priority: (typeof g.priority === "number" && [1, 2, 3].includes(g.priority) ? g.priority : 3) as 1 | 2 | 3,
        source: (g.source as string) ?? "unknown",
        confidence: (["high", "medium", "low"].includes(g.confidence as string) ? g.confidence : "medium") as "high" | "medium" | "low",
      }))
    : [];

  return {
    departments,
    people,
    crossFunctionalPeople: Array.isArray(model.crossFunctionalPeople) ? model.crossFunctionalPeople : [],
    processes: Array.isArray(model.processes) ? model.processes : [],
    keyRelationships: Array.isArray(model.keyRelationships) ? model.keyRelationships : [],
    financialSnapshot: (model.financialSnapshot as CompanyModel["financialSnapshot"]) ?? {
      currency: "DKK",
      revenueTrend: "unknown",
      overdueInvoiceCount: 0,
      dataCompleteness: "low",
    },
    situationTypeRecommendations: Array.isArray(model.situationTypeRecommendations) ? model.situationTypeRecommendations : [],
    strategicGoals,
    uncertaintyLog: Array.isArray(model.uncertaintyLog)
      ? model.uncertaintyLog.map((q: any) => ({
          ...q,
          scope: q.scope ?? "admin",
          targetEmail: q.targetEmail ?? null,
        }))
      : [],
  };
}

// ── Synthesis Prompt ─────────────────────────────────────────────────────────

export const SYNTHESIS_PROMPT = `You are compiling the output of a multi-agent organizational intelligence analysis into a single, coherent company model. You have reports from:

- People Discovery (algorithmic): Master list of all discovered people
- Temporal Analyst: Document freshness and timeline
- Organizational Analyst: Department structure, team composition, reporting lines
- Process Analyst: Operational processes, handoffs, bottlenecks
- Relationship Analyst: External relationships, health scores, risk flags
- Knowledge Analyst: Information flow, knowledge bottlenecks, silos
- Financial Analyst: Revenue, payments, pipeline, performance

Plus one or more Organizer reports with confirmed overlaps, resolved contradictions, and synthesis notes.

## Required Output Schema

Your response MUST be a single JSON object matching this exact TypeScript interface. Do NOT nest people inside departments — list ALL people in the top-level \`people\` array with their \`primaryDepartment\` field.

\`\`\`typescript
interface CompanyModel {
  departments: Array<{
    name: string;           // Department name (use company's own language)
    description: string;    // What this department does
    confidence: "high" | "medium" | "low";
    suggestedLeadEmail?: string;
  }>;
  people: Array<{           // ALL internal people — one entry per person
    email: string;
    displayName: string;
    primaryDepartment: string;  // Must match a department name above
    role: string;               // Job title or function
    roleLevel: "ic" | "lead" | "manager" | "director" | "c_level";
    reportsToEmail?: string;    // Email of direct manager (omit if unknown)
    profile?: string;               // 2-3 sentence summary of how this person works day-to-day
  }>;
  crossFunctionalPeople: Array<{
    email: string;
    departments: string[];
    evidence: string;
  }>;
  processes: Array<{
    name: string;
    description: string;
    department: string;
    ownerEmail?: string;
    frequency: string;
    steps: Array<{ order: number; actor: string; action: string }>;
  }>;
  keyRelationships: Array<{
    companyName?: string;
    contactName: string;
    contactEmail: string;
    type: "customer" | "prospect" | "partner" | "vendor";
    healthScore: "healthy" | "at_risk" | "cold" | "critical";
    primaryInternalContact: string;
  }>;
  financialSnapshot: {
    estimatedMonthlyRevenue?: number;
    currency: string;
    revenueTrend: string;
    overdueInvoiceCount: number;
    pipelineValue?: number;
    dataCompleteness: string;
  };
  situationTypeRecommendations: Array<{
    name: string;
    description: string;
    detectionMode: "structured" | "content" | "natural";
    detectionLogic: object;    // Schema depends on detectionMode — see below
    department: string;
    severity: "high" | "medium" | "low";
    expectedFrequency: string;
  }>;
  strategicGoals: Array<{
    title: string;                    // Concise goal statement (e.g., "Reduce average invoice payment time")
    description: string;              // Full context — what this goal means for the company
    scope: "company" | "department";  // Company-wide or department-specific
    department?: string;              // Department name (must match departments array). Required when scope is "department"
    measurableTarget?: string;        // Quantified target if available
    deadline?: string;                // ISO date if mentioned
    priority: 1 | 2 | 3;             // 1 = critical to survival/strategy, 2 = important for growth, 3 = aspirational improvement
    source: string;                   // Document or communication where this goal was found
    confidence: "high" | "medium" | "low";
  }>;
  uncertaintyLog: Array<{
    question: string;    // Direct question for the CEO
    context: string;
    possibleAnswers?: string[];
    department?: string;
    scope: "admin" | "department";  // "admin" = strategic/company-wide, "department" = operational/team-specific
    targetEmail?: string;    // For department-scoped: the employee best positioned to answer
  }>;
}
\`\`\`

## Detection Mode Selection (CRITICAL)

Each situation type must use the correct detection mode. The mode determines HOW detection works — using the wrong mode means the situation will never be detected.

### Mode 1: "structured" — Entity property checks
USE FOR: Situations detected by checking specific field values on a specific entity type.
EXAMPLES: Overdue invoices (invoice.status = "overdue"), expired contracts (contract.end-date < today), stale deals (deal.lastActivityDaysAgo > 30)
SCOPING: Scans ALL entities of the specified type operator-wide. Department scope determines who gets notified, NOT what gets scanned.
DETECTION LOGIC FORMAT:
{
  "mode": "structured",
  "structured": {
    "entityType": "invoice",      // Entity type slug to scan
    "signals": [
      { "field": "status", "condition": "equals", "value": "overdue" },
      { "field": "total-amount", "condition": "greater_than", "threshold": 5000 }
    ]
  }
}
Available conditions: "equals", "not_equals", "greater_than", "less_than", "days_past" (days since date field > threshold), "days_until" (days until date field < threshold), "contains", "is_empty", "is_not_empty"
Available entity types: "invoice", "deal", "contact", "company", "ticket", "conversation", "task"
IMPORTANT: Field names must match actual entity property slugs. Common slugs: "status", "total-amount", "due-date", "stage", "created-date", "priority"

### Mode 2: "content" — Communication-based detection
USE FOR: Situations detected from the content of emails, Slack/Teams messages, or documents. Things that happen in communication: client complaints, urgent requests, action items, escalations, approval requests, missed follow-ups mentioned in correspondence.
EXAMPLES: Client escalation (angry email), action required (request with deadline), emergency (urgent language), authorization notices, compliance reminders
SCOPING: Evaluates ALL incoming content operator-wide. Works retroactively on existing content AND on new content as it arrives.
DETECTION LOGIC FORMAT:
{
  "mode": "content",
  "description": "Emails or messages from regulatory authorities about license, certification, or authorization renewals, expirations, or compliance deadlines"
}
The description should be a clear natural language description of WHAT to look for in communications. The content evaluator LLM uses this to classify incoming content.

### Mode 3: "natural" — Strategic cross-entity reasoning
USE FOR: Situations that cannot be detected from a single entity or a single message. Requires reasoning across multiple entities, relationships, activity patterns, and content to identify strategic patterns, initiatives, or organizational health issues.
EXAMPLES: Cash flow risk (aggregation across multiple invoices + planned purchases), resource bottleneck (workload distribution across team), key person dependency (knowledge concentration analysis), pipeline vs capacity mismatch (sales pipeline compared against delivery capacity)
SCOPING: Reasons across the full company state — entity graph, activity patterns, content themes.
DETECTION LOGIC FORMAT:
{
  "mode": "natural",
  "naturalLanguage": "Clear natural language description of the strategic pattern to detect. Written as a paragraph, NOT as pseudo-SQL or field conditions. Example: 'The company has outstanding receivables from multiple clients that are significantly overdue, while upcoming project phases require material purchases that cannot be funded without those receivables being collected. This creates a liquidity risk that could delay project delivery.'"
}
IMPORTANT: Natural language descriptions must be genuine paragraphs describing the business situation, NOT field-level conditions like "status = overdue AND amount > X". If the situation CAN be expressed as field conditions, use structured mode instead.

### Mode Selection Rule
- Can it be expressed as field conditions on one entity type? → structured
- Is it detected from the content of communications? → content
- Does it require reasoning across multiple entities and patterns? → natural
- When in doubt between structured and content → structured (cheaper, faster, deterministic)
- When in doubt between content and natural → content (most situations have communication evidence)
- Natural should be RARE — typically 0-2 per company, reserved for strategic/aggregate patterns

## Strategic Goal Extraction (CRITICAL)

Extract STRATEGIC goals from the agent reports. These are deliberate organizational priorities — things the CEO would recognize as objectives the company is actively working toward.

### What IS a strategic goal:
- Revenue/growth targets mentioned in business plans, strategy documents, or board communications
- Operational KPIs referenced in management discussions (DSO targets, response time SLAs, quality benchmarks)
- Expansion plans (new markets, new products, new hires)
- Transformation initiatives (digitalization, process overhaul, organizational restructuring)
- Compliance or certification deadlines
- Explicit OKRs or KPIs found in documents

### What is NOT a strategic goal:
- Routine operational tasks ("process invoices weekly")
- Incidental purposes behind activities ("ordering lunch to boost morale")
- Individual employee objectives unless they represent department mandates
- Generic best practices ("improve communication")
- Anything the CEO would NOT recognize as a deliberate priority

### Extraction rules:
1. Prefer goals extracted from FORMAL documents (business plans, strategy memos, board presentations, annual reports) over informal communications
2. High confidence = stated explicitly in a strategic document. Medium = inferred from multiple signals (e.g., repeated emphasis in leadership communications). Low = inferred from operational patterns only.
3. A healthy company has 3-5 company-level goals and 1-3 per department. If you find more than 15 total goals, you are being too granular — consolidate or drop low-confidence items.
4. Every goal MUST have a \`source\` field identifying where you found it. If you can't cite a specific source, don't include the goal.
5. Company mission/vision statements are context, not goals — unless they contain specific measurable targets.
6. Department-scoped goals must reference a department from the departments array.

## Your Task

Produce a SINGLE JSON object matching the interface above:

1. **Resolves conflicts** between agents (use Organizer's resolution where available)
2. **Merges overlapping findings** into unified entries (don't duplicate)
3. **Assigns every internal person to exactly one primary department** in the top-level \`people\` array (cross-functional people get a primary + listed in crossFunctionalPeople)
4. **Produces actionable situation type recommendations** synthesized from all agents
5. **Generates the uncertainty log** — specific questions for the CEO that the data couldn't answer
6. **Extracts strategic goals** from formal documents and leadership communications — few, important, CEO-recognizable

## Structural Classification Rules (MANDATORY)

These rules override agent inference when they conflict. They prevent misclassification of common organizational patterns:

1. **The CEO, owner, director, or founder is ALWAYS in a "Leadership", "Management", or "Ledelse" department.** Even if they also handle administrative tasks, finance, or client work. A CEO who manages invoices is still a CEO in Leadership — not an administrator.
2. **A department must contain people who share the same primary function.** Do not group a CEO with bookkeepers just because they discuss finances. The CEO's primary function is leadership; the bookkeeper's primary function is administration.
3. **Apprentices and trainees belong in the department of their work, not in a separate "Training" department.** An electrician apprentice belongs in Field Operations alongside their mentor.
4. **Contractors and freelancers with internal email addresses should be assigned to the department matching their work but flagged in crossFunctionalPeople or a note.** Do not create a "Contractors" department.
5. **If an org chart document was found and is less than 6 months old, prefer its department structure over behavioral inference.** Only deviate when clear evidence shows the structure has changed (new departments, merged teams, departed leaders).
6. **One-person departments are acceptable** when that person has a distinct function (e.g., a solo sales hire, a solo project coordinator). Do not merge them into an unrelated department just to avoid small departments.
7. **When two runs of this analysis would produce different department structures because the evidence is ambiguous, prefer the structure that matches the company's own documented terminology.** If the company calls it "Kontor" in their documents, use "Kontor" — not "Administration" or "Office Operations."

## Dual-Routing Rule (MANDATORY)

A finding MUST appear in BOTH situationTypeRecommendations AND uncertaintyLog when it has both a monitoring component and a knowledge gap. These are two different purposes:

- situationTypeRecommendations = "what should the system continuously monitor and alert on?"
- uncertaintyLog = "what does the CEO need to tell us that the data couldn't answer?"

The same finding often has both. Examples:

- Expiring certification → situation type: "Monitor authorization expiry, alert 60 days before deadline" AND uncertainty: "Who is the backup person for authorization renewal if Lars is unavailable?"
- Cash flow risk → situation type: "Alert when outstanding receivables exceed X while material purchases are pending" AND uncertainty: "What is the company's cash reserve threshold before you consider it critical?"
- Key person dependency → situation type: "Monitor when critical knowledge holders are unavailable for >3 consecutive days" AND uncertainty: "Is there a succession plan or documentation process for Henrik's CAD-to-CNC pipeline?"
- Client relationship cooling → situation type: "Alert when communication frequency with key clients drops below historical baseline" AND uncertainty: "Are there any clients you're intentionally deprioritizing or planning to offboard?"

When in doubt about whether a finding belongs in both, include it in both. It is always better to monitor something AND ask about it than to only ask and lose the monitoring.

Do NOT reduce the number of situation type recommendations to avoid duplication — the lists serve different purposes and overlap is expected and correct.

## Critical Rules

- The \`people\` array is top-level — do NOT embed people inside department objects.
- Every department MUST have at least one person assigned to it via \`primaryDepartment\`.
- People assignment priority: documented org structure > CRM teams > calendar cluster analysis > email patterns
- Department names should use the language most commonly found in the company's own documents (Danish companies often use Danish dept names internally)
- Situation type recommendations should be deduplicated across agents — if three agents recommend invoice overdue detection, merge them into one recommendation
- The uncertainty log should be formatted as direct questions: "Is Thomas the Finance team lead, or does he report to someone else?" — not agent jargon
- Include ALL internal people from the People Registry. If someone can't be confidently assigned, put them in an "Unassigned" group and flag in uncertainty log.
- Each uncertainty question MUST have a scope field:
  - scope: "admin" — strategic questions only the company owner/admin can answer (hiring plans, partnership decisions, pricing strategy, company-wide policies)
  - scope: "department" — operational questions a specific team member or department lead can answer (process details, tool configurations, individual workload, technical procedures)
  - When scope is "department", include targetEmail pointing to the person best equipped to answer, based on the agent findings about who handles that area
  - When in doubt, use "admin" — it's better to ask the admin an operational question than to miss a strategic one`;


// ── Build Synthesis Input ────────────────────────────────────────────────────

export function buildSynthesisInput(
  reports: Array<{ agent: string; round: number; report: unknown }>,
): string {
  const parts: string[] = ["## All Agent Reports\n"];

  // Group by round
  const byRound = new Map<number, typeof reports>();
  for (const r of reports) {
    const list = byRound.get(r.round) || [];
    list.push(r);
    byRound.set(r.round, list);
  }

  for (const [round, roundReports] of [...byRound.entries()].sort((a, b) => a[0] - b[0])) {
    parts.push(`### Round ${round}\n`);
    for (const { agent, report } of roundReports) {
      const name = agent
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      parts.push(`#### ${name}\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`);
    }
  }

  parts.push(
    "\nProduce the unified company model. Merge findings, resolve conflicts, " +
      "deduplicate situation type recommendations, and generate the uncertainty log.",
  );

  return parts.join("\n");
}

// ── Entity Creation ──────────────────────────────────────────────────────────

export async function createEntitiesFromModel(
  operatorId: string,
  model: CompanyModel,
): Promise<void> {
  // 1. Ensure required entity types exist
  const deptTypeId = await ensureEntityType(operatorId, "department");
  const teamMemberTypeId = await ensureEntityType(operatorId, "team-member");

  // 2. Create departments
  const departmentMap = new Map<string, string>(); // name → entityId

  for (const dept of model.departments ?? []) {
    let deptEntity = await prisma.entity.findFirst({
      where: {
        operatorId,
        displayName: dept.name,
        entityTypeId: deptTypeId,
        status: "active",
      },
    });

    if (!deptEntity) {
      deptEntity = await prisma.entity.create({
        data: {
          operatorId,
          entityTypeId: deptTypeId,
          displayName: dept.name,
          category: "foundational",
          sourceSystem: "onboarding-intelligence",
        },
      });
    }

    departmentMap.set(dept.name, deptEntity.id);
  }

  // Pre-fetch relationship types (avoid N+1 queries inside the loop)
  const deptMemberTypeId = await ensureRelationshipType(
    operatorId, "department-member", "Department Member", deptTypeId, teamMemberTypeId,
  );

  // 3. Create people and assign to departments
  for (const person of model.people ?? []) {
    const deptEntityId = departmentMap.get(person.primaryDepartment);
    if (!deptEntityId) continue;

    let personEntity = await findEntityByEmail(operatorId, person.email);

    if (!personEntity) {
      personEntity = await prisma.entity.create({
        data: {
          operatorId,
          entityTypeId: teamMemberTypeId,
          displayName: person.displayName,
          category: "base",
          parentDepartmentId: deptEntityId,
          sourceSystem: "onboarding-intelligence",
        },
      });

      // Set email identity property
      const emailProp = await prisma.entityProperty.findFirst({
        where: { entityTypeId: teamMemberTypeId, identityRole: "email" },
      });
      if (emailProp) {
        await prisma.propertyValue.create({
          data: { entityId: personEntity.id, propertyId: emailProp.id, value: person.email },
        });
      }
    } else if (!personEntity.parentDepartmentId) {
      await prisma.entity.update({
        where: { id: personEntity.id },
        data: { parentDepartmentId: deptEntityId },
      });
    }

    // Set role property
    if (person.role) {
      const roleProp = await prisma.entityProperty.findFirst({
        where: { entityTypeId: personEntity.entityTypeId, slug: "role" },
      });
      if (roleProp) {
        await prisma.propertyValue.upsert({
          where: { entityId_propertyId: { entityId: personEntity.id, propertyId: roleProp.id } },
          create: { entityId: personEntity.id, propertyId: roleProp.id, value: person.role },
          update: { value: person.role },
        });
      }
    }

    // Create department-member relationship
    await prisma.relationship.upsert({
      where: {
        relationshipTypeId_fromEntityId_toEntityId: {
          relationshipTypeId: deptMemberTypeId,
          fromEntityId: deptEntityId,
          toEntityId: personEntity.id,
        },
      },
      create: {
        relationshipTypeId: deptMemberTypeId,
        fromEntityId: deptEntityId,
        toEntityId: personEntity.id,
      },
      update: {},
    });
  }

  // 4. Create reporting relationships
  const reportsToType = await ensureRelationshipType(
    operatorId, "reports-to", "Reports To", teamMemberTypeId, teamMemberTypeId,
  );

  for (const person of (model.people ?? []).filter((p) => p.reportsToEmail)) {
    const reportEntity = await findEntityByEmail(operatorId, person.email);
    const managerEntity = await findEntityByEmail(operatorId, person.reportsToEmail!);

    if (reportEntity && managerEntity) {
      await prisma.relationship.upsert({
        where: {
          relationshipTypeId_fromEntityId_toEntityId: {
            relationshipTypeId: reportsToType,
            fromEntityId: reportEntity.id,
            toEntityId: managerEntity.id,
          },
        },
        create: {
          relationshipTypeId: reportsToType,
          fromEntityId: reportEntity.id,
          toEntityId: managerEntity.id,
        },
        update: {},
      });
    }
  }
}

// ── Situation Type Creation ──────────────────────────────────────────────────

export async function createSituationTypesFromModel(
  operatorId: string,
  model: CompanyModel,
): Promise<void> {
  for (const rec of model.situationTypeRecommendations ?? []) {
    const slug = rec.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Find department for scoping
    const deptEntity = await prisma.entity.findFirst({
      where: {
        operatorId,
        displayName: rec.department,
        entityType: { slug: "department" },
        status: "active",
      },
    });

    // The LLM now returns detectionLogic as a structured object with the
    // correct mode already embedded (structured/content/natural).
    // Pass it through directly — the detection engine handles all three modes.
    const detectionLogicJson = typeof rec.detectionLogic === "object"
      ? JSON.stringify(rec.detectionLogic)
      : JSON.stringify({ mode: "natural", naturalLanguage: rec.detectionLogic });

    await prisma.situationType.upsert({
      where: { operatorId_slug: { operatorId, slug } },
      create: {
        operatorId,
        slug,
        name: rec.name,
        description: rec.description,
        detectionLogic: detectionLogicJson,
        autonomyLevel: "supervised",
        scopeEntityId: deptEntity?.id,
      },
      update: {
        description: rec.description,
        detectionLogic: detectionLogicJson,
      },
    });
  }
}

// ── Goal Creation ───────────────────────────────────────────────────────────

export async function createGoalsFromModel(
  operatorId: string,
  model: CompanyModel,
): Promise<void> {
  const CONFIDENCE_MAP: Record<string, number> = { high: 0.9, medium: 0.7, low: 0.5 };

  for (const goal of model.strategicGoals ?? []) {
    if (!goal.title || !goal.description) continue;

    let departmentId: string | null = null;
    if (goal.scope === "department" && goal.department) {
      const dept = await prisma.entity.findFirst({
        where: {
          operatorId,
          displayName: goal.department,
          entityType: { slug: "department" },
          status: "active",
        },
        select: { id: true },
      });
      departmentId = dept?.id ?? null;
      // If department not found, skip department-scoped goal rather than making it HQ-level
      if (!departmentId) {
        console.warn(`[synthesis] Goal "${goal.title}" references unknown department "${goal.department}", skipping`);
        continue;
      }
    }

    // Dedup: check if a goal with similar title already exists
    const existing = await prisma.goal.findFirst({
      where: {
        operatorId,
        departmentId,
        title: goal.title,
        status: { not: "achieved" },
      },
    });
    if (existing) continue;

    await prisma.goal.create({
      data: {
        operatorId,
        departmentId,
        title: goal.title,
        description: goal.description,
        measurableTarget: goal.measurableTarget ?? null,
        priority: goal.priority,
        status: "active",
        deadline: (() => {
          if (!goal.deadline) return null;
          const d = new Date(goal.deadline);
          return isNaN(d.getTime()) ? null : d;
        })(),
        source: "synthesis",
        sourceReference: goal.source,
        extractionConfidence: CONFIDENCE_MAP[goal.confidence] ?? 0.7,
      },
    });
  }
}

// ── Email Notification ───────────────────────────────────────────────────────

export async function sendAnalysisCompleteEmail(operatorId: string): Promise<void> {
  await sendNotificationToAdmins({
    operatorId,
    type: "system_alert",
    title: "Your operational map is ready",
    body: "Qorpera has finished analyzing your connected tools and built your company model. Review and confirm your organizational map to start receiving operational intelligence.",
    linkUrl: "/onboarding",
    emailContext: {
      templateType: "system-alert",
      ctaText: "Review Your Map",
      ctaUrl: "/onboarding",
    },
  });

  await prisma.onboardingAnalysis.updateMany({
    where: { operatorId },
    data: { notifiedAt: new Date() },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function findEntityByEmail(operatorId: string, email: string) {
  const pv = await prisma.propertyValue.findFirst({
    where: {
      value: email.toLowerCase(),
      property: { identityRole: "email" },
      entity: { operatorId, status: "active" },
    },
    include: { entity: true },
  });
  return pv?.entity || null;
}

async function ensureEntityType(operatorId: string, slug: string): Promise<string> {
  const existing = await prisma.entityType.findFirst({
    where: { operatorId, slug },
  });
  if (existing) return existing.id;

  // Create from hardcoded definitions
  const def = HARDCODED_TYPE_DEFS[slug];
  if (!def) throw new Error(`No hardcoded definition for entity type: ${slug}`);

  const entityType = await prisma.entityType.create({
    data: {
      operatorId,
      slug: def.slug,
      name: def.name,
      description: def.description || "",
    },
  });

  // Create properties
  for (let i = 0; i < (def.properties || []).length; i++) {
    const prop = def.properties[i];
    await prisma.entityProperty.create({
      data: {
        entityTypeId: entityType.id,
        slug: prop.slug,
        name: prop.name,
        dataType: prop.dataType || "STRING",
        identityRole: prop.identityRole || null,
        displayOrder: i,
      },
    });
  }

  return entityType.id;
}

async function ensureRelationshipType(
  operatorId: string,
  slug: string,
  name: string,
  fromEntityTypeId: string,
  toEntityTypeId: string,
): Promise<string> {
  const existing = await prisma.relationshipType.findFirst({
    where: { operatorId, slug },
  });
  if (existing) return existing.id;

  const created = await prisma.relationshipType.create({
    data: { operatorId, slug, name, fromEntityTypeId, toEntityTypeId },
  });
  return created.id;
}
