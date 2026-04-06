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
import { upsertEntity, relateEntities } from "@/lib/entity-resolution";

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
    archetypeSlug: string | null;
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
  entityTypes: Array<{
    slug: string;
    name: string;
    description: string;
    category: "digital" | "external";
    properties: Array<{
      slug: string;
      name: string;
      dataType: string;
      identityRole?: string | null;
    }>;
  }>;
  uncertaintyLog: Array<{
    question: string;
    context: string;
    possibleAnswers?: string[];
    evidenceChecked?: string;
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

  const entityTypes = Array.isArray(model.entityTypes)
    ? (model.entityTypes as Array<Record<string, unknown>>).map(et => ({
        slug: (et.slug as string) ?? "",
        name: (et.name as string) ?? "",
        description: (et.description as string) ?? "",
        category: (et.category === "external" ? "external" : "digital") as "digital" | "external",
        properties: Array.isArray(et.properties)
          ? (et.properties as Array<Record<string, unknown>>).map(p => ({
              slug: (p.slug as string) ?? "",
              name: (p.name as string) ?? "",
              dataType: (p.dataType as string) ?? "string",
              identityRole: (p.identityRole as string) || null,
            }))
          : [],
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
    entityTypes,
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

// ── Synthesis Prompt V2 (structural focus, raw data input) ──────────────────

export const SYNTHESIS_PROMPT_V2 = `You are building a company model from raw organizational data. You are receiving:

- A People Registry: all discovered people with emails, roles, and departments (from directory APIs and communication analysis)
- Content samples: recent emails, documents, and communications with sender/subject/content
- Activity signals: behavioral pattern counts
- Communication patterns: top email senders by frequency
- Document and financial data samples
- Connected system inventory

YOUR PRIMARY JOB is structural mapping — getting departments, people assignment, entity types, and the uncertainty log RIGHT. These create the entity graph that everything else depends on. Be precise and conservative.

YOUR SECONDARY JOB is initial intelligence — processes, relationships, financial snapshot, goals, situation types. For these: only include what you can clearly evidence from the data. It is MUCH better to produce 3 well-evidenced situation types than 10 speculative ones. Wiki synthesis will analyze this same data in depth afterward, with full verification and source citation. Anything you get wrong here becomes a starting point the system has to correct later.

## Small Operations (1-3 people)

If the data shows only 1-3 internal team members:
- Do NOT force a department hierarchy. Use a single department like "Advisory" or "Operations" or whatever fits.
- Focus on EXTERNAL relationships — clients, counterparties, partner firms, collaborators. These are the organizational structure for a small operation.
- Map active engagements/deals/projects as the primary organizational unit, not departments.
- External collaborators who work on specific engagements (e.g., associates from a partner firm handling specific deals) should appear in keyRelationships with clear engagement-level context, not as cross-functional people.
- The situation types should focus on deal/engagement lifecycle events, not internal process issues.

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
    archetypeSlug: string | null;  // Best-matching archetype from the Archetype Taxonomy below, or null if none fit
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
  entityTypes: Array<{
    slug: string;           // lowercase-hyphenated identifier (e.g., "invoice", "project-site")
    name: string;           // Display name
    description: string;    // What this entity represents in this company
    category: "digital" | "external";  // "digital" for business objects, "external" for outside parties
    properties: Array<{
      slug: string;         // lowercase-hyphenated (e.g., "invoice-number")
      name: string;         // Display name
      dataType: "STRING" | "NUMBER" | "DATE" | "BOOLEAN";
      identityRole?: "email" | "domain" | "phone" | "reference_id" | null;
    }>;
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

Extract STRATEGIC goals from the raw data. These are deliberate organizational priorities — things the CEO would recognize as objectives the company is actively working toward.

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

## Entity Type Discovery

Based on the business objects referenced across the ingested content, propose entity types that the system should track. These are the nouns of the business — invoices, projects, shipments, orders, permits, whatever this specific company works with.

For each entity type, include:
- slug: lowercase-hyphenated identifier
- name: display name
- description: what this entity represents in this company
- category: "digital" for business objects, "external" for outside parties (companies, contacts)
- properties: the fields that matter for this entity type, with slugs, names, data types (STRING, NUMBER, DATE, BOOLEAN), and identityRole if the property uniquely identifies an instance (e.g., "reference_id" for invoice numbers, "email" for contacts)

Always include these universal types alongside any domain-specific ones:
- company (external) — with properties: name, industry, relationship-type
- contact (external) — with properties: name, email, phone, company, role

Then add domain-specific types based on what you see in the data. An electrician company might have: project-site, material-order, inspection. A logistics company might have: shipment, carrier, customs-declaration. A SaaS company might have: subscription, feature-request, support-ticket.

Propose 3-8 entity types total. Quality over quantity — only propose types you see evidence for in the actual content.

## Your Task

Produce a SINGLE JSON object matching the interface above:

1. **Maps organizational structure** from raw data (prefer documented org structure over behavioral inference)
2. **Merges overlapping findings** into unified entries (don't duplicate)
3. **Assigns every internal person to exactly one primary department** in the top-level \`people\` array (cross-functional people get a primary + listed in crossFunctionalPeople)
4. **Produces actionable situation type recommendations** synthesized from the data
5. **Discovers entity types** — the business objects this company works with, with properties
6. **Generates the uncertainty log** — specific questions for the CEO that the data couldn't answer
7. **Extracts strategic goals** from formal documents and leadership communications — few, important, CEO-recognizable

## Structural Classification Rules (MANDATORY)

These rules override behavioral inference when they conflict. They prevent misclassification of common organizational patterns:

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
- Situation type recommendations should be conservative — only recommend types with clear evidence in the raw data
- The uncertainty log should be formatted as direct questions: "Is Thomas the Finance team lead, or does he report to someone else?" — not agent jargon
- Include ALL internal people from the People Registry. If someone can't be confidently assigned, put them in an "Unassigned" group and flag in uncertainty log.
- Each uncertainty question MUST have a scope field:
  - scope: "admin" — strategic questions only the company owner/admin can answer (hiring plans, partnership decisions, pricing strategy, company-wide policies)
  - scope: "department" — operational questions a specific team member or department lead can answer (process details, tool configurations, individual workload, technical procedures)
  - When scope is "department", include targetEmail pointing to the person best equipped to answer, based on what the raw data shows about who handles that area
  - When in doubt, use "admin" — it's better to ask the admin an operational question than to miss a strategic one
- SELF-CHECK BEFORE GENERATING A QUESTION: For EACH potential uncertainty question, verify it cannot be answered from the raw data you are analyzing RIGHT NOW. If the People Registry shows who handles invoicing via directory data, do NOT ask "Who handles invoicing?" If email patterns clearly show reporting lines, do NOT ask about reporting lines. Only generate questions when:
  (a) The data contains genuinely CONTRADICTORY signals on a specific fact, OR
  (b) The data is completely SILENT on the topic — nothing found, OR
  (c) The question requires a STRATEGIC DECISION no amount of data analysis can answer (pricing policy, hiring plans, growth priorities, risk tolerance, succession planning)
- For EACH question in the uncertainty log, include an "evidenceChecked" field: a brief note of what the data DID show on this topic and WHY it remains a question. Example: "evidenceChecked": "Email from Thomas quotes 525 DKK/hr but document template shows 495 DKK/hr — cannot determine which is the authorized rate without admin input"
- If the data shows an answer with reasonable confidence but you aren't sure, DO NOT ask. State the answer in the company model and move on. The system will detect if it's wrong through operational monitoring.`;


// ── Raw Data Synthesis Input ─────────────────────────────────────────────────

/**
 * Builds synthesis input from raw database data.
 * Provides enough signal for structural mapping (departments, people, entity types)
 * and conservative intelligence estimates. Wiki synthesis handles depth later.
 */
export async function buildRawDataSynthesisInput(
  operatorId: string,
  peopleRegistry: Array<{
    displayName: string;
    email: string;
    isInternal: boolean;
    adminApiVerified: boolean;
    title?: string;
    department?: string;
  }>,
): Promise<string> {
  const parts: string[] = [];

  // 1. People Registry
  parts.push("## People Registry\n");
  const internal = peopleRegistry.filter(p => p.isInternal);
  const external = peopleRegistry.filter(p => !p.isInternal).slice(0, 50);
  parts.push(`### Internal (${internal.length} people)\n`);
  for (const p of internal) {
    const tags: string[] = [];
    if (p.adminApiVerified) tags.push("directory-verified");
    if (p.department) tags.push(`dept: ${p.department}`);
    if (p.title) tags.push(`title: ${p.title}`);
    parts.push(`- ${p.displayName} <${p.email}>${tags.length ? ` [${tags.join(", ")}]` : ""}`);
  }
  parts.push(`\n### External Contacts (${external.length} shown, ${peopleRegistry.filter(p => !p.isInternal).length} total)\n`);
  for (const p of external) {
    parts.push(`- ${p.displayName} <${p.email}>`);
  }

  // 2. Content Inventory
  const contentGroups = await prisma.contentChunk.groupBy({
    by: ["sourceType"],
    where: { operatorId },
    _count: true,
  });
  parts.push("\n## Content Inventory\n");
  for (const g of contentGroups) {
    parts.push(`- ${g.sourceType}: ${g._count} chunks`);
  }

  // 3. Content Samples (50 most recent)
  const recentChunks = await prisma.contentChunk.findMany({
    where: { operatorId },
    select: { sourceType: true, metadata: true, content: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  parts.push("\n## Content Samples (50 most recent)\n");
  for (const c of recentChunks) {
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    const sender = (meta.from ?? meta.authorEmail ?? "") as string;
    const subject = (meta.subject ?? "") as string;
    parts.push(`### ${c.sourceType}${sender ? ` | From: ${sender}` : ""}${subject ? ` | Subject: ${subject}` : ""}`);
    parts.push(c.content.slice(0, 500));
    parts.push("");
  }

  // 4. Activity Signal Summary
  const signalGroups = await prisma.activitySignal.groupBy({
    by: ["signalType"],
    where: { operatorId },
    _count: true,
  });
  parts.push("\n## Activity Signals\n");
  for (const g of signalGroups) {
    parts.push(`- ${g.signalType}: ${g._count}`);
  }

  // 5. Communication Patterns (top 20 senders)
  const emailChunks = await prisma.contentChunk.findMany({
    where: { operatorId, sourceType: { in: ["email", "gmail", "outlook"] } },
    select: { metadata: true },
  });
  const senderCounts = new Map<string, number>();
  for (const c of emailChunks) {
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    const sender = ((meta.from ?? meta.authorEmail ?? "") as string).toLowerCase();
    if (sender) senderCounts.set(sender, (senderCounts.get(sender) ?? 0) + 1);
  }
  const topSenders = [...senderCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (topSenders.length > 0) {
    parts.push("\n## Communication Patterns (top senders)\n");
    for (const [sender, count] of topSenders) {
      parts.push(`- ${sender}: ${count} emails`);
    }
  }

  // 6. Document Inventory
  const docChunks = await prisma.contentChunk.findMany({
    where: { operatorId, sourceType: { in: ["drive", "sharepoint", "document"] } },
    select: { metadata: true },
  });
  const docTitles = new Set<string>();
  for (const c of docChunks) {
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    const title = (meta.title ?? meta.fileName ?? meta.subject ?? "") as string;
    if (title) docTitles.add(title);
  }
  if (docTitles.size > 0) {
    const docs = [...docTitles].slice(0, 40);
    parts.push("\n## Document Inventory\n");
    for (const title of docs) {
      parts.push(`- ${title}`);
    }
  }

  // 7. Financial Data Samples
  const financialChunks = await prisma.contentChunk.findMany({
    where: {
      operatorId,
      OR: [
        { sourceType: { in: ["dinero", "economic", "stripe", "hubspot"] } },
        { content: { contains: "invoice", mode: "insensitive" } },
        { content: { contains: "faktura", mode: "insensitive" } },
      ],
    },
    select: { sourceType: true, content: true, metadata: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  if (financialChunks.length > 0) {
    parts.push("\n## Financial Data Samples\n");
    for (const c of financialChunks) {
      parts.push(`### ${c.sourceType}`);
      parts.push(c.content.slice(0, 500));
      parts.push("");
    }
  }

  // 8. Connector Inventory
  const connectors = await prisma.sourceConnector.findMany({
    where: { operatorId },
    select: { provider: true, status: true },
  });
  parts.push("\n## Connected Systems\n");
  for (const c of connectors) {
    parts.push(`- ${c.provider} (${c.status})`);
  }

  parts.push("\n---\n");
  parts.push(
    "Produce the company model. PRIORITY: Get departments, people assignment, and entity types RIGHT — " +
    "these are the structural foundation. For processes, relationships, financials, goals, and situation types: " +
    "only include what is CLEARLY evidenced in the data above. When uncertain, omit. " +
    "Wiki synthesis will add intelligence depth from this same data with full verification.",
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

// ── Entity Type Materialization ─────────────────────────────────────────────

/**
 * Creates LLM-discovered entity types and their properties.
 * Additive: if a type already exists (from hardcoded defs or prior run),
 * only missing properties are added.
 */
export async function createEntityTypesFromModel(
  operatorId: string,
  model: CompanyModel,
): Promise<void> {
  if (!model.entityTypes || model.entityTypes.length === 0) return;

  // Map LLM dataType strings to Prisma-compatible values
  const normalizeDataType = (dt: string): string => {
    const upper = dt.toUpperCase();
    if (["STRING", "NUMBER", "DATE", "BOOLEAN", "ENUM", "CURRENCY"].includes(upper)) return upper;
    // Handle lowercase LLM variants
    const map: Record<string, string> = { string: "STRING", number: "NUMBER", date: "DATE", boolean: "BOOLEAN" };
    return map[dt.toLowerCase()] ?? "STRING";
  };

  for (const et of model.entityTypes) {
    if (!et.slug || !et.name) continue;

    let entityType = await prisma.entityType.findFirst({
      where: { operatorId, slug: et.slug },
    });

    if (!entityType) {
      entityType = await prisma.entityType.create({
        data: {
          operatorId,
          slug: et.slug,
          name: et.name,
          description: et.description || "",
          defaultCategory: et.category || "digital",
        },
      });

      for (let i = 0; i < (et.properties || []).length; i++) {
        const p = et.properties[i];
        await prisma.entityProperty.create({
          data: {
            entityTypeId: entityType.id,
            slug: p.slug,
            name: p.name,
            dataType: normalizeDataType(p.dataType),
            identityRole: p.identityRole || null,
            displayOrder: i,
          },
        });
      }

      console.log(`[synthesis] Created entity type: ${et.name} (${et.slug}) with ${et.properties?.length || 0} properties`);
    } else {
      // Additive: ensure all properties exist
      const existingSlugs = new Set(
        (await prisma.entityProperty.findMany({
          where: { entityTypeId: entityType.id },
          select: { slug: true },
        })).map(p => p.slug)
      );

      for (const prop of (et.properties || [])) {
        if (!existingSlugs.has(prop.slug)) {
          await prisma.entityProperty.create({
            data: {
              entityTypeId: entityType.id,
              slug: prop.slug,
              name: prop.name,
              dataType: normalizeDataType(prop.dataType),
              identityRole: prop.identityRole || null,
            },
          });
        }
      }
    }
  }
}

// ── Key Relationships → External Entities ───────────────────────────────────

/**
 * Materializes keyRelationships from synthesis as external entities (companies, contacts)
 * and creates relationships between them and internal people.
 */
export async function createExternalEntitiesFromModel(
  operatorId: string,
  model: CompanyModel,
): Promise<void> {
  if (!model.keyRelationships || model.keyRelationships.length === 0) return;

  // Ensure company and contact entity types exist
  await ensureEntityType(operatorId, "company");
  await ensureEntityType(operatorId, "contact");

  for (const rel of model.keyRelationships) {
    // Create/find the company entity
    let companyEntityId: string | null = null;
    if (rel.companyName) {
      companyEntityId = await upsertEntity(operatorId, "company", {
        displayName: rel.companyName,
        properties: {
          "name": rel.companyName,
        },
      });
    }

    // Create/find the contact entity
    if (rel.contactName) {
      const contactProps: Record<string, string> = { "name": rel.contactName };
      if (rel.contactEmail) contactProps["email"] = rel.contactEmail;
      if (rel.companyName) contactProps["company"] = rel.companyName;

      const contactId = await upsertEntity(operatorId, "contact", {
        displayName: rel.contactName,
        properties: contactProps,
      });

      // Create relationship: contact works-at company
      if (contactId && companyEntityId) {
        await relateEntities(operatorId, contactId, companyEntityId, "works-at");
      }

      // Link internal person who manages this relationship
      if (rel.primaryInternalContact && companyEntityId) {
        const internalPerson = await findEntityByEmail(operatorId, rel.primaryInternalContact);
        if (internalPerson) {
          await relateEntities(operatorId, internalPerson.id, companyEntityId, "manages-relationship");
        } else {
          // Try display name match
          const byName = await prisma.entity.findFirst({
            where: { operatorId, displayName: { contains: rel.primaryInternalContact }, category: "base", status: "active" },
          });
          if (byName) {
            await relateEntities(operatorId, byName.id, companyEntityId, "manages-relationship");
          }
        }
      }
    }
  }

  console.log(`[synthesis] Materialized ${model.keyRelationships.length} key relationships as external entities`);
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
        archetypeSlug: rec.archetypeSlug ?? null,
      },
      update: {
        description: rec.description,
        detectionLogic: detectionLogicJson,
        archetypeSlug: rec.archetypeSlug ?? null,
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
      alertTitle: "Your operational map is ready",
      message: "Qorpera has finished analyzing your connected tools and built your company model. Review and confirm your organizational map to start receiving operational intelligence.",
      severity: "info",
      viewUrl: "/onboarding",
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
