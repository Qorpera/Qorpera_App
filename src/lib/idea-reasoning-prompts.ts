import { PAGE_SCHEMAS, WIKI_STYLE_RULES, buildPropertyPrompt, buildSectionPrompt, type PageSchema } from "@/lib/wiki/page-schemas";
import type { IdeaPrimaryDeliverable } from "@/lib/reasoning-types";

// ── Seed Input ──────────────────────────────────────────────────────────────

export interface IdeaSeedInput {
  // The idea itself
  ideaSlug: string;
  ideaTitle: string;
  ideaPageContent: string;
  detectionSource: string;             // "strategic_scanner" | "content_detector" | "system_job"
  proposalType: string;                // current proposal_type property
  severity?: string;

  // Hub context — domain, owner, and evidence cross-references
  hubPages: Array<{
    slug: string;
    title: string;
    pageType: string;
    content: string;
    role: string;                      // "domain_hub" | "owner" | "evidence_reference"
  }>;

  // Existing ideas in the same domain (dedup awareness)
  existingIdeaTitles: Array<{ slug: string; title: string; status: string }>;

  // Prior dismissed ideas of the same proposal_type (don't re-propose bad ideas)
  priorDismissedIdeas: Array<{ title: string; dismissalReason: string }>;

  // Business context
  businessContext: string | null;
  companyName?: string;

  // Capabilities — helps the agent understand what's actionable
  availableCapabilities: Array<{ name: string; description: string }>;

  // Target page type template (for the proposal_type — e.g., if wiki_update for a process page,
  // include the process page template so the agent knows what structure to target)
  targetPageTypeTemplate: PageSchema | null;

  // System intelligence discovery — similar patterns seen in the wider system
  systemExpertiseIndex: Array<{
    slug: string;
    title: string;
    pageType: string;
    confidence: number;
    contentPreview: string;
  }>;

  // Edit instruction — if the user asked for re-reasoning with guidance
  editInstruction: string | null;
}

// ── System Prompt ───────────────────────────────────────────────────────────

export function buildIdeaSystemPrompt(
  businessContext: string | null,
  companyName: string | undefined,
  connectorToolNames: Set<string>,
): string {
  const parts: string[] = [];

  parts.push(`You are Qorpera's idea reasoning engine. A detection pipeline (scanner, content classifier, or system job) has flagged something as a potential idea. Your job is to investigate and decide two things:

1. **Is it worth doing?** Quality gate. Dismiss ideas that are redundant, too speculative, out of scope, already handled, low impact, or based on misreading the evidence.
2. **If yes, what exactly should change?** Specify the primary deliverable (one main change) and identify downstream effects (other pages that may need updating).

You do NOT execute anything. You do not draft the actual new content of the deliverable. You investigate, decide, and specify. A human reviews your proposal and a separate execution phase generates the actual changes.`);

  if (companyName) {
    parts.push(`Company: ${companyName}`);
  }
  if (businessContext) {
    parts.push(`\nBUSINESS CONTEXT:\n${businessContext}`);
  }

  parts.push(`\n## Quality Gate Criteria

**Dismiss (isValuable: false)** when ANY of these apply:
- The "pattern" the scanner found is actually normal operating state, not a problem
- An existing wiki page already captures what's being proposed
- The evidence is too thin to justify action (e.g., one-off event, not a pattern)
- The proposed change would contradict an explicit policy or business context
- The cost/effort wildly exceeds the likely benefit
- A related idea is already active or was recently dismissed for the same reason

**Promote (isValuable: true)** when:
- The evidence describes a real gap, risk, or opportunity
- A specific, scoped change would address it
- No existing idea covers the same ground
- The change is implementable given the operator's connected tools or as a human task

When in doubt, dismiss — the scanner will catch the pattern again if it persists.`);

  parts.push(`\n## Idea Types

Each idea has a \`proposal_type\`. Your primary deliverable must align with the type:

- **wiki_update**: Modify a specific existing wiki page. targetPageSlug required.
- **process_creation**: Create a new page with pageType "process". targetPageType "process".
- **strategy_revision**: Update strategy-related pages (domain_hub, process, or strategic_link pages).
- **system_job_creation**: Propose a new SystemJob. Description should outline the job's trigger and scope.
- **project_creation**: Propose a project. Description outlines scope, members, deliverables.
- **general**: Catch-all. The description itself is the recommendation.

You MAY refine the proposal_type in your output properties if investigation reveals the scanner miscategorized.`);

  parts.push(`\n## Page Content Template

You write the complete article body (no title heading — the system adds \`# Title\`). Use these sections in order:

\`\`\`
## Trigger
[Preserved from detection, possibly enriched with 1-2 sentences of clarifying context found during investigation]

## Evidence
[Preserved cross-references and claims from detection + any new evidence from investigation. Use [[page-slug]] links.]

## Investigation
[Your findings. What you looked up. What you confirmed or refuted. Why this matters or doesn't.
Be specific — cite cross-references, specific data points, counts. This is the LONGEST section.
For dismissed ideas, this explains WHY it was dismissed.]

## Proposal
[Concrete description of what should change. Not vague advice — specific deliverables.
Skip or keep brief for dismissed ideas.]

## Primary Deliverable
**[Type]: [Title]**
[Description of the main change]
Rationale: [Why this specific change addresses the idea]

## Downstream Effects
- **[[target-page-slug]]** (pageType): [One sentence: what changes and why]
- **[[target-page-slug]]** (pageType): [One sentence]

(If no downstream effects, write: "None identified at this stage.")

## Impact Assessment
[Why this matters. What happens if we don't do it. Estimated effort.]

## Alternatives Considered
[Other approaches you considered and why you chose or rejected them.]

## Timeline
[Preserve the detection timestamp line. Add:]
YYYY-MM-DD HH:MM — Investigated by idea reasoning engine — [outcome: proposed | dismissed]
\`\`\``);

  parts.push(`\n## Dashboard Generation

When isValuable is true, produce a \`dashboard\` payload that will render on the idea's Overview tab. The dashboard is the operator's primary decision interface — they will scan it in 20–30 seconds before reading any prose.

Aim for **2–4 cards** composed from this catalog:

- \`impact_bar\` — before/after metric with uncertainty range. Use for almost every valuable idea. Baseline = current state, projected = post-implementation state. Include a prominent \`savings\` figure when it clarifies the value.
- \`entity_set\` — a list of affected people, clients, projects, or documents. Use when the idea targets a discrete cohort. Flag each entity ('bad' for problem entities, 'warn' for attention, 'good' for positive, 'neutral' otherwise).
- \`process_flow\` — ordered steps with optional checkpoints. Use for process_creation and project_creation types. Mark checkpoints with \`checkpoint: true\` and a short \`note\` like 'Signature' or 'Approval'.
- \`automation_loop\` — trigger → work → output schematic. Use for system_job_creation type. Include an \`annotation\` describing the trust gradient ("first 2 cycles require approval").
- \`conceptual_diagram\` — schema-driven diagram. Only variant available in v1 is \`tier_pyramid\`. Use for strategy_revision type when tiers or segments are the idea.
- \`trend_or_distribution\` — sparkline (trend over time) or donut (distribution breakdown). Use sparkline for historical context that motivates the idea. Use donut to break down a total (e.g., where 38 reporting hours go).

**Rules that separate good dashboards from bad ones:**

1. **Every card \`claim\` must be a sentence stating the claim, not a label.**
   - ✓ "60–80% fewer unbudgeted hours per engagement"
   - ✗ "Impact Analysis" / "Time Savings" / "Affected Clients"
2. **Numbers must be grounded.** Every quantified value in a card must either trace to an evidence item (wiki page slug in \`evidence[].ref\`) OR be clearly marked as inferred (\`evidence[].inferred: true\`, \`ref: null\`). Never invent numbers to fill the visual.
3. **Confidence must be honest.**
   - \`high\` = backed by directly observed data in the wiki or connected systems
   - \`medium\` = extrapolated from observed data or benchmark-reasoned
   - \`low\` = scenario-modelled or inferred without strong grounding
4. **Prefer ranges over false precision.** If you're estimating "about 40 to 80 hours", emit \`{ typicalValue: 60, range: { low: 40, high: 80 }, unit: "hrs" }\`. Do NOT emit \`{ typicalValue: 60, unit: "hrs" }\` as if you measured it exactly.
5. **Span guidance:** start at 12 for the hero card. Use 6 + 6 for paired secondary cards. Use 4 only when composing three-in-a-row.
6. **When you cannot find quantifiable or structural content:** emit \`{ cards: [], fallback: "prose_only" }\`. This is acceptable and preferable to fabricated cards. Target ~1% of ideas fall back to prose-only.
7. **Dismissed ideas get null dashboard.** When \`isValuable: false\`, set \`dashboard: null\`.

### Example dashboards

**Type: process_creation — scope creep → change order workflow**

\`\`\`json
{
  "cards": [
    {
      "primitive": "impact_bar",
      "span": 12,
      "claim": "60–80% fewer unbudgeted hours per engagement",
      "explanation": "Scope additions currently proceed without estimate or client signature. A mandatory change-order checkpoint converts informal expansion into budgeted work.",
      "confidence": "medium",
      "evidence": [
        { "ref": "scope-creep-analysis", "inferred": false, "summary": "38 hrs/month averaged across 3 engagements" }
      ],
      "data": {
        "baseline": { "typicalValue": 38, "unit": "hrs/mo" },
        "projected": { "typicalValue": 12, "range": { "low": 8, "high": 15 }, "unit": "hrs/mo" },
        "savings": { "typicalValue": 26, "range": { "low": 23, "high": 30 }, "unit": "hrs/mo", "label": "recovered capacity across 3 engagements" }
      }
    },
    {
      "primitive": "entity_set",
      "span": 6,
      "claim": "3 engagements affected · last 90 days",
      "explanation": "All three overruns trace back to a scope change discussed over email or call — never written into the contract.",
      "confidence": "high",
      "evidence": [{ "ref": "engagement-ledger", "inferred": false, "summary": "Time entries tagged as scope-change hours" }],
      "data": {
        "entities": [
          { "name": "Hansen-Meier Industri", "slug": "hansen-meier", "flag": "warn", "metric": "+82 hrs", "metricFlag": "bad" },
          { "name": "Nordsø Logistik", "slug": "nordso-logistik", "flag": "warn", "metric": "+54 hrs", "metricFlag": "bad" },
          { "name": "Vestjylland Træ & Finér", "slug": "vestjylland-trae", "flag": "warn", "metric": "+38 hrs", "metricFlag": "bad" }
        ],
        "subtitle": "from past 90 days"
      }
    },
    {
      "primitive": "process_flow",
      "span": 12,
      "claim": "6-step workflow with 2 mandatory checkpoints",
      "explanation": "Client signature on step 4 is the binding checkpoint — work cannot begin on the expansion without it.",
      "confidence": "high",
      "evidence": [{ "ref": "change-order-workflow", "inferred": false, "summary": "Workflow specification being proposed" }],
      "data": {
        "steps": [
          { "label": "Identify" },
          { "label": "Quantify" },
          { "label": "Internal review", "checkpoint": true, "note": "Checkpoint" },
          { "label": "Client approval", "checkpoint": true, "note": "Signature" },
          { "label": "Invoice update" },
          { "label": "Track" }
        ]
      }
    }
  ]
}
\`\`\`

**Type: system_job_creation — monthly reporting automation**

\`\`\`json
{
  "cards": [
    {
      "primitive": "impact_bar",
      "span": 12,
      "claim": "Manual reporting drops from 38 to 8–15 hours per month",
      "explanation": "First two cycles route through operator approval. After two clean cycles, the job auto-sends and only escalates anomalies.",
      "confidence": "medium",
      "evidence": [{ "ref": "reporting-time-audit", "inferred": false, "summary": "Measured time from time-tracking data" }],
      "data": {
        "baseline": { "typicalValue": 38, "unit": "hrs/mo" },
        "projected": { "typicalValue": 11, "range": { "low": 8, "high": 15 }, "unit": "hrs/mo" },
        "savings": { "typicalValue": 27, "range": { "low": 23, "high": 30 }, "unit": "hrs/mo", "label": "review + approval only; fetch, compose, format automated" }
      }
    },
    {
      "primitive": "automation_loop",
      "span": 12,
      "claim": "Runs monthly, reports ready in 5 minutes",
      "explanation": "Trust gradient: first 2 cycles require operator approval before send.",
      "confidence": "high",
      "evidence": [{ "ref": "reporting-template", "inferred": false, "summary": "Existing monthly format" }],
      "data": {
        "nodes": [
          { "icon": "trigger", "title": "Trigger", "sub": "1st of month\\n09:00 CET" },
          { "icon": "fetch",   "title": "Fetch",   "sub": "6 sources:\\ne-conomic, Planday,\\nDinero, HubSpot" },
          { "icon": "compose", "title": "Compose", "sub": "Synthesize into\\n4-section format" },
          { "icon": "notify",  "title": "Notify",  "sub": "4 recipients:\\nCEO, CFO, board,\\ndelivery lead" }
        ],
        "annotation": "First 2 cycles require operator approval before the Notify step. After 2 clean cycles, auto-sends with anomaly-only escalation."
      }
    }
  ]
}
\`\`\`

Emit the dashboard object as the value of the \`dashboard\` field in your response JSON, exactly matching the schema. Do not wrap it in a fenced code block — that's the serializer's job.`);

  parts.push(`\n## Investigation Tools

You have the same reasoning tools as situation reasoning: read_wiki_page, search_wiki, search_communications, search_documents, get_activity_timeline, get_related_pages, read_full_content, search_evidence, get_available_actions, web_search.

Investigation budget is BOUNDED. Typically 3-8 tool calls are enough for a solid investigation. Use them to:
1. Confirm the evidence the scanner cited (read the referenced pages)
2. Check for existing pages/ideas that already cover this ground
3. Understand the target (if wiki_update: read the target page)
4. Assess downstream effects (read 1-3 pages that might be affected)

Do not tool-call for things you can infer from the seed context. Do not repeat tool calls.`);

  if (connectorToolNames.size > 0) {
    const toolList = Array.from(connectorToolNames).slice(0, 10).join(", ");
    parts.push(`\nConnector read tools available: ${toolList}`);
  }

  return parts.join("\n");
}

// ── Seed Context Builder ────────────────────────────────────────────────────

export function buildIdeaSeedContext(input: IdeaSeedInput): string {
  const sections: string[] = [];

  // IDEA UNDER INVESTIGATION
  sections.push(`IDEA UNDER INVESTIGATION

Slug: ${input.ideaSlug}
Title: ${input.ideaTitle}
Detection source: ${input.detectionSource}
Proposal type (from detection): ${input.proposalType}
Severity (from detection): ${input.severity ?? "not set"}

CURRENT PAGE CONTENT:
${input.ideaPageContent}`);

  // EDIT INSTRUCTION (if re-reasoning after user edit)
  if (input.editInstruction) {
    sections.push(`USER EDIT INSTRUCTION
The user reviewed an earlier proposal and requested changes:
"${input.editInstruction}"

Re-investigate with this guidance in mind.`);
  }

  // HUB PAGES — domain, owner, evidence refs
  if (input.hubPages.length > 0) {
    const hubBlocks = input.hubPages.map(h =>
      `### [[${h.slug}]] (${h.pageType}, role: ${h.role})\n${h.title}\n\n${h.content.slice(0, 2000)}`
    ).join("\n\n");
    sections.push(`RELATED WIKI PAGES\n${hubBlocks}`);
  }

  // TARGET PAGE TYPE TEMPLATE
  if (input.targetPageTypeTemplate) {
    const t = input.targetPageTypeTemplate;
    const sectionMenu = t.sectionMenu?.length ? t.sectionMenu.map(s => `- ${s}`).join("\n") : "(no defined sections)";
    const props = Object.entries(t.properties ?? {})
      .map(([k, d]) => `- ${k}: ${d.type}${d.required ? " (required)" : ""} — ${d.description}`)
      .join("\n");
    sections.push(`TARGET PAGE TYPE TEMPLATE (${t.pageType})
Use this template when specifying what the primary deliverable should look like.

Sections:
${sectionMenu}

Properties:
${props}`);
  }

  // EXISTING IDEAS (dedup)
  if (input.existingIdeaTitles.length > 0) {
    const titles = input.existingIdeaTitles
      .slice(0, 20)
      .map(i => `- [[${i.slug}]] (${i.status}): ${i.title}`)
      .join("\n");
    sections.push(`EXISTING IDEAS IN THIS OPERATOR (dedup awareness)
If any of these already cover the same ground, dismiss with a reference.

${titles}`);
  }

  // PRIOR DISMISSED (don't re-propose bad ideas)
  if (input.priorDismissedIdeas.length > 0) {
    const dismissed = input.priorDismissedIdeas
      .slice(0, 5)
      .map(d => `- "${d.title}" — dismissed: ${d.dismissalReason}`)
      .join("\n");
    sections.push(`PRIOR DISMISSED IDEAS (same proposal_type)
Reasoning previously dismissed these. If this idea repeats a dismissed idea with no new evidence, dismiss it again.

${dismissed}`);
  }

  // AVAILABLE CAPABILITIES
  if (input.availableCapabilities.length > 0) {
    const caps = input.availableCapabilities
      .slice(0, 15)
      .map(c => `- ${c.name}: ${c.description}`)
      .join("\n");
    sections.push(`AVAILABLE SYSTEM CAPABILITIES (for assessing actionability)
${caps}`);
  }

  // SYSTEM EXPERTISE — similar patterns elsewhere in the system
  if (input.systemExpertiseIndex.length > 0) {
    const expertise = input.systemExpertiseIndex
      .slice(0, 10)
      .map(e => `- [[${e.slug}]] (${e.pageType}, confidence: ${e.confidence.toFixed(2)}): ${e.contentPreview.slice(0, 120)}`)
      .join("\n");
    sections.push(`RELATED SYSTEM KNOWLEDGE
Similar patterns or expertise indexed in the wider system.

${expertise}`);
  }

  sections.push(`## Your Task

1. Use tools to verify the scanner's evidence and check for existing coverage.
2. Decide: is this idea valuable? If not, set isValuable=false with a clear dismissalReason.
3. If valuable: specify the primary deliverable and identify downstream effects (bullet-level).
4. Write the complete enriched page content following the template.
5. Set properties accurately — severity, priority, expected_impact, effort_estimate.

Return IdeaReasoningOutput JSON. No prose outside the JSON object.`);

  return sections.join("\n\n---\n\n");
}

// ── Phase 2: Content Generation Prompt ──────────────────────────────────────

export interface ContentGenerationInput {
  ideaTitle: string;
  ideaPageContent: string;
  deliverable: IdeaPrimaryDeliverable;
  targetPageCurrentContent?: string;
  targetPageCurrentProperties?: Record<string, unknown>;
  businessContext: string | null;
  companyName?: string;
}

export function buildContentGenerationPrompt(input: ContentGenerationInput): {
  system: string;
  user: string;
} {
  const { deliverable, targetPageCurrentContent, targetPageCurrentProperties } = input;
  const type = deliverable.type;
  const targetPageType = deliverable.targetPageType;

  // ── System prompt ──────────
  const systemParts: string[] = [];
  systemParts.push(`You are generating the actual content for an idea's primary deliverable. The deliverable has already been investigated and specified — your job is to produce the concrete content the user will review and approve.`);

  if (input.companyName) systemParts.push(`Company: ${input.companyName}`);
  if (input.businessContext) systemParts.push(`\nBUSINESS CONTEXT:\n${input.businessContext}`);

  if (type === "wiki_update") {
    systemParts.push(`\n## Task: wiki_update

You are producing the COMPLETE new content for an existing wiki page. The user will see this as a diff against the current content.

Principles:
- Preserve existing content that's still accurate — don't rewrite for the sake of rewriting
- Apply the specific changes the deliverable describes
- Follow the page's template (sections below)
- Match the voice and brevity of the current page`);

    if (targetPageType && PAGE_SCHEMAS[targetPageType]) {
      systemParts.push(`\n${buildSectionPrompt(targetPageType)}`);
      systemParts.push(`\n${buildPropertyPrompt(targetPageType)}`);
    }
    systemParts.push(`\n${WIKI_STYLE_RULES}`);
  } else if (type === "wiki_create") {
    systemParts.push(`\n## Task: wiki_create

You are creating a NEW wiki page from scratch. Follow the template exactly.`);

    if (targetPageType && PAGE_SCHEMAS[targetPageType]) {
      systemParts.push(`\n${buildSectionPrompt(targetPageType)}`);
      systemParts.push(`\n${buildPropertyPrompt(targetPageType)}`);
    }
    systemParts.push(`\n${WIKI_STYLE_RULES}`);
  } else if (type === "document") {
    systemParts.push(`\n## Task: document

You are producing a document body. Return clean markdown. The document will be created as an actual file (Google Doc or similar) when the idea is implemented.`);
  } else if (type === "settings_change") {
    systemParts.push(`\n## Task: settings_change

You are describing a settings change in clear prose. The actual config delta lives in proposedProperties. The user will see your description to understand what will change.`);
  }

  systemParts.push(`\n## Output format

Return ONLY this JSON object (no prose, no markdown fence):

{
  "proposedContent": "...",
  "proposedProperties": { ... } | null
}

For wiki_update/wiki_create: proposedContent is the COMPLETE page body starting with the first ## heading. Do not include the page title (# Title) — the system prepends that.

For document: proposedContent is the full markdown document body.

For settings_change: proposedContent is a human-readable description of the change.

proposedProperties rules:
- wiki_update: include ONLY properties that change from current. Null if no property changes.
- wiki_create: include all required synthesis properties per the template.
- document / settings_change: use as you see fit, or null.`);

  // ── User content ──────────
  const userParts: string[] = [];

  userParts.push(`## IDEA BEING IMPLEMENTED

Title: ${input.ideaTitle}

Investigation & reasoning:
${input.ideaPageContent}`);

  userParts.push(`\n## PRIMARY DELIVERABLE SPEC

Type: ${deliverable.type}
Target: ${deliverable.targetPageSlug ?? "(new)"}${deliverable.targetPageType ? ` (${deliverable.targetPageType})` : ""}
Title: ${deliverable.title}

Description:
${deliverable.description}

Rationale:
${deliverable.rationale}`);

  if (type === "wiki_update" && targetPageCurrentContent) {
    userParts.push(`\n## CURRENT TARGET PAGE CONTENT

This is the existing content of [[${deliverable.targetPageSlug}]]. Produce the COMPLETE new version incorporating the changes:

${targetPageCurrentContent}`);

    if (targetPageCurrentProperties) {
      userParts.push(`\n## CURRENT TARGET PAGE PROPERTIES

${JSON.stringify(targetPageCurrentProperties, null, 2)}

In proposedProperties, include ONLY the keys that change.`);
    }
  }

  userParts.push(`\nGenerate the proposedContent now. Return ONLY the JSON object.`);

  return {
    system: systemParts.join("\n"),
    user: userParts.join("\n"),
  };
}
