/**
 * Page schemas — single source of truth for wiki page type definitions.
 *
 * Defines property schemas, section menus, style rules, and helpers used
 * by the write tool, renderer, prompt builder, and validation.
 */

// ─── Types ──────────────────────────────────────────────

export type PropertyType = "string" | "number" | "boolean" | "date" | "enum" | "page_ref" | "page_ref[]" | "json";
export type PropertyOwner = "synthesis" | "runtime";

export interface PropertyDef {
  type: PropertyType;
  required: boolean;
  owner: PropertyOwner;
  default?: unknown;
  enumValues?: string[];
  description: string;
}

export interface PageSchema {
  pageType: string;
  description: string;
  sectionMenu: string[];
  properties: Record<string, PropertyDef>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Style Rules ────────────────────────────────────────

export const WIKI_STYLE_RULES = `## Writing Rules

Write pages as operational memory objects, not reports.

1. COMPRESSED FACTUAL STYLE. Short declarative lines. Tables for parallel facts.
   No rhetorical intros, narrative transitions, or consultant phrasing.
   Wrong: "Field Operations is the core revenue-generating function of Boltly ApS. This domain encompasses all on-site electrical installation..."
   Right: "Field Operations = core delivery function. Scope: on-site installation, renovation, inspection, maintenance, emergency repair."

2. ONE FACT, ONE HOME. Full detail on the canonical page. Other pages get a
   one-liner + [[cross-ref]]. Hub pages do NOT restate leaf-page content.

3. FACT FIRST. Each section opens with: status, owner, deadline, risk, dependency.
   Background description comes after operational facts.

4. NO INDEX SECTIONS in content. Do not write "## Pages in this Domain",
   "## Related Pages", or any table-of-contents listing child pages.
   Child-page indexes are auto-injected at render time.

5. NO TRANSIENT STATE on stable pages. Current cash balances, overdue days,
   trip counts, email volumes belong in situation_instance pages or
   activityContent, not in hub/profile/process content.

6. UNCERTAINTY AS TAGS, NOT PROSE. "role: unknown; needs verification" —
   not "She may be a new hire, part-time employee, or contractor."

7. FACT vs ASSESSMENT vs INFERENCE — labeled. Raw facts unmarked.
   Assessments prefix "Assessment:". Inferences prefix "Inference:".

8. NO INTERPRETIVE COMMENTARY on person profiles. "Shows professional maturity"
   or "Functional seniority above formal title" are synthesis inferences —
   they do not belong in profile content. Observations go in activityContent only.

9. PROPERTIES CARRY QUERYABLE STATE. The property table (emitted as JSON via
   the properties parameter) carries structured/queryable data. Content prose
   must NOT duplicate property values — it adds context and relationships
   that properties cannot capture.

10. SECTION STRUCTURE IS MANDATORY. Every page MUST include ALL sections
    listed in the section menu for its page type, in the specified order.
    Sections may be brief if limited data is available, but they must exist.
`;

// ─── Page Schemas ───────────────────────────────────────

const SITUATION_INSTANCE: PageSchema = {
  pageType: "situation_instance",
  description: "A detected situation requiring investigation and possible action.",
  sectionMenu: [
    "Trigger", "Context", "Investigation", "Action Plan", "Deliverables",
    "Timeline", "Playbook Reference", "Monitoring Notes", "Learnings", "Outcome Summary",
  ],
  properties: {
    status: { type: "enum", required: true, owner: "synthesis", enumValues: ["detected", "reasoning", "proposed", "approved", "executing", "monitoring", "resolved", "rejected"], description: "Current lifecycle stage" },
    severity: { type: "number", required: true, owner: "synthesis", description: "Impact severity 0\u20131" },
    confidence: { type: "number", required: true, owner: "synthesis", description: "Confidence in assessment 0\u20131" },
    situation_type: { type: "page_ref", required: true, owner: "synthesis", description: "Parent situation_type slug" },
    assigned_to: { type: "page_ref", required: false, owner: "synthesis", description: "Person responsible" },
    domain: { type: "page_ref", required: false, owner: "synthesis", description: "Department" },
    detected_at: { type: "date", required: true, owner: "synthesis", description: "When detected" },
    resolved_at: { type: "date", required: false, owner: "synthesis", description: "When resolved" },
    source: { type: "enum", required: true, owner: "synthesis", enumValues: ["detected", "manual", "retrospective"], description: "How the situation was created" },
    trigger_ref: { type: "string", required: false, owner: "synthesis", description: "RawContent ID" },
    autonomy_level: { type: "enum", required: false, owner: "synthesis", enumValues: ["supervised", "notify", "autonomous"], description: "Execution autonomy" },
    current_step: { type: "number", required: false, owner: "runtime", default: null, description: "Currently executing step number" },
    cycle_number: { type: "number", required: false, owner: "runtime", default: 1, description: "Re-evaluation cycle count" },
    outcome: { type: "enum", required: false, owner: "runtime", default: null, enumValues: ["positive", "negative", "neutral"], description: "Final outcome" },
  },
};

const SITUATION_TYPE: PageSchema = {
  pageType: "situation_type",
  description: "A recurring category of detectable business situation.",
  sectionMenu: [
    "Detection Criteria", "Playbook", "Responsible People", "Resolution Patterns",
    "Active Instances", "Recent Resolved", "Known Edge Cases",
  ],
  properties: {
    domain: { type: "page_ref", required: false, owner: "synthesis", description: "Primary department" },
    enabled: { type: "boolean", required: true, owner: "synthesis", default: true, description: "Whether detection is active" },
    autonomy_level: { type: "enum", required: true, owner: "runtime", default: "supervised", enumValues: ["supervised", "notify", "autonomous"], description: "Current execution autonomy" },
    approval_rate: { type: "number", required: true, owner: "runtime", default: 0, description: "Approval rate 0\u20131" },
    total_proposed: { type: "number", required: true, owner: "runtime", default: 0, description: "Total plans proposed" },
    total_approved: { type: "number", required: true, owner: "runtime", default: 0, description: "Total plans approved" },
    consecutive_approvals: { type: "number", required: true, owner: "runtime", default: 0, description: "Consecutive approvals streak" },
    detected_count: { type: "number", required: true, owner: "runtime", default: 0, description: "Total detections" },
    confirmed_count: { type: "number", required: true, owner: "runtime", default: 0, description: "Confirmed true detections" },
    dismissed_count: { type: "number", required: true, owner: "runtime", default: 0, description: "Dismissed false detections" },
    avg_resolution_hours: { type: "number", required: false, owner: "runtime", default: null, description: "Average resolution time in hours" },
    false_positive_rate: { type: "number", required: false, owner: "runtime", default: null, description: "False positive rate 0\u20131" },
  },
};

const PERSON_PROFILE: PageSchema = {
  pageType: "person_profile",
  description: "A person in the organization or closely associated with it.",
  sectionMenu: [
    "Role & Responsibilities", "Expertise & Strengths", "Active Situations",
    "Key Relationships", "Processes", "Performance Notes", "History Traces",
  ],
  properties: {
    role: { type: "string", required: true, owner: "synthesis", description: "Job title" },
    department: { type: "page_ref", required: true, owner: "synthesis", description: "Primary domain hub slug" },
    reports_to: { type: "page_ref", required: false, owner: "synthesis", description: "Manager's page slug" },
    email: { type: "string", required: false, owner: "synthesis", description: "Primary email address" },
    status: { type: "enum", required: true, owner: "synthesis", enumValues: ["active", "on_leave", "departed"], description: "Employment status" },
    typical_situation_types: { type: "page_ref[]", required: false, owner: "runtime", default: [], description: "Commonly assigned situation types" },
    active_situation_count: { type: "number", required: false, owner: "runtime", default: 0, description: "Currently active situations" },
    avg_resolution_hours: { type: "number", required: false, owner: "runtime", default: null, description: "Average resolution time in hours" },
    approval_rate: { type: "number", required: false, owner: "runtime", default: null, description: "Plan approval rate 0\u20131" },
  },
};

const DOMAIN_HUB: PageSchema = {
  pageType: "domain_hub",
  description: "A department or organizational unit.",
  sectionMenu: [
    "Overview", "Team", "Processes", "Tools & Systems",
    "Active Situations", "Key Relationships", "Performance & Patterns",
  ],
  properties: {
    department_type: { type: "string", required: false, owner: "synthesis", description: "\"department\", \"division\", \"team\", or \"unit\"" },
    lead: { type: "page_ref", required: false, owner: "synthesis", description: "Department lead's page slug" },
    member_count: { type: "number", required: false, owner: "synthesis", description: "Number of team members" },
    parent_domain: { type: "page_ref", required: false, owner: "synthesis", description: "Parent domain hub slug" },
    active_situation_count: { type: "number", required: false, owner: "runtime", default: 0, description: "Currently active situations in this domain" },
  },
};

const COMPANY_OVERVIEW: PageSchema = {
  pageType: "company_overview",
  description: "Top-level page describing the company.",
  sectionMenu: [
    "Company Description", "Organizational Structure", "Key People", "Business Model",
    "Strategic Priorities", "Key Systems & Tools", "External Relationships", "Regulatory & Compliance",
  ],
  properties: {
    industry: { type: "string", required: true, owner: "synthesis", description: "Primary industry" },
    company_size: { type: "string", required: false, owner: "synthesis", description: "\"micro\", \"small\", or \"medium\"" },
    employee_count: { type: "number", required: false, owner: "synthesis", description: "Approximate headcount" },
    founded: { type: "string", required: false, owner: "synthesis", description: "Year founded" },
    headquarters: { type: "string", required: false, owner: "synthesis", description: "Primary office location" },
    company_domain: { type: "string", required: false, owner: "synthesis", description: "Primary email domain" },
    fiscal_year_end: { type: "string", required: false, owner: "synthesis", description: "Fiscal year end month" },
  },
};

const EXTERNAL_CONTACT: PageSchema = {
  pageType: "external_contact",
  description: "A contact at an external organization.",
  sectionMenu: [
    "Background", "Relationship Context", "Key Interactions", "Internal Contacts", "Notes",
  ],
  properties: {
    organization: { type: "page_ref", required: false, owner: "synthesis", description: "External organization page slug" },
    role: { type: "string", required: false, owner: "synthesis", description: "Role at their organization" },
    email: { type: "string", required: false, owner: "synthesis", description: "Email address" },
    relationship_type: { type: "string", required: false, owner: "synthesis", description: "\"client_contact\", \"vendor_contact\", \"partner_contact\", or \"advisor\"" },
    primary_internal_contact: { type: "page_ref", required: false, owner: "synthesis", description: "Main point of contact internally" },
    status: { type: "enum", required: false, owner: "synthesis", enumValues: ["active", "inactive"], description: "Relationship status" },
    last_contact_date: { type: "date", required: false, owner: "runtime", default: null, description: "Date of last interaction" },
  },
};

const EXTERNAL_RELATIONSHIP: PageSchema = {
  pageType: "external_relationship",
  description: "A business relationship with an external organization.",
  sectionMenu: [
    "Overview", "Key Contacts", "Contract & Terms", "Financial Summary",
    "Communication Patterns", "Situation History", "Risk & Opportunities",
  ],
  properties: {
    relationship_type: { type: "enum", required: true, owner: "synthesis", enumValues: ["client", "vendor", "partner", "regulatory", "other"], description: "Type of business relationship" },
    status: { type: "enum", required: true, owner: "synthesis", enumValues: ["active", "inactive", "prospect", "churned"], description: "Current relationship status" },
    domain: { type: "page_ref", required: false, owner: "synthesis", description: "Owning department" },
    account_owner: { type: "page_ref", required: false, owner: "synthesis", description: "Account owner person slug" },
    contract_status: { type: "enum", required: false, owner: "synthesis", enumValues: ["active", "expired", "negotiating", "none"], description: "Contract status" },
    annual_value: { type: "string", required: false, owner: "synthesis", description: "Annual contract/revenue value" },
    risk_level: { type: "enum", required: false, owner: "synthesis", enumValues: ["low", "medium", "high"], description: "Assessed risk level" },
    contract_renewal_date: { type: "date", required: false, owner: "runtime", default: null, description: "Next contract renewal date" },
  },
};

const PROCESS: PageSchema = {
  pageType: "process",
  description: "A documented business process or workflow.",
  sectionMenu: [
    "Purpose", "Steps", "Roles & Responsibilities", "Tools & Systems",
    "Quality Criteria", "Common Issues", "Related Processes", "Situation Types", "Change History",
  ],
  properties: {
    owner: { type: "page_ref", required: false, owner: "synthesis", description: "Process owner person slug" },
    domain: { type: "page_ref", required: false, owner: "synthesis", description: "Owning department" },
    status: { type: "enum", required: true, owner: "synthesis", enumValues: ["active", "draft", "deprecated", "under_review"], description: "Process status" },
    frequency: { type: "string", required: false, owner: "synthesis", description: "\"daily\", \"weekly\", \"monthly\", \"on_demand\", or \"triggered\"" },
    criticality: { type: "enum", required: false, owner: "synthesis", enumValues: ["low", "medium", "high", "critical"], description: "Operational criticality" },
    related_tools: { type: "page_ref[]", required: false, owner: "synthesis", description: "Tool/system page slugs used in this process" },
    last_reviewed: { type: "date", required: false, owner: "runtime", default: null, description: "Date of last process review" },
  },
};

const PROJECT: PageSchema = {
  pageType: "project",
  description: "A bounded work initiative with defined scope and timeline.",
  sectionMenu: [
    "Objective", "Scope", "Team", "Deliverables",
    "Timeline & Milestones", "Risks & Issues", "Decisions", "Related Situations", "Status Updates",
  ],
  properties: {
    status: { type: "enum", required: true, owner: "synthesis", enumValues: ["proposed", "planned", "active", "paused", "completed", "cancelled"], description: "Project status" },
    owner: { type: "page_ref", required: true, owner: "synthesis", description: "Project owner person slug" },
    domain: { type: "page_ref", required: false, owner: "synthesis", description: "Owning department" },
    priority: { type: "enum", required: false, owner: "synthesis", enumValues: ["low", "medium", "high", "critical"], description: "Priority level" },
    start_date: { type: "date", required: false, owner: "synthesis", description: "Project start date" },
    target_date: { type: "date", required: false, owner: "synthesis", description: "Target completion date" },
    budget: { type: "string", required: false, owner: "synthesis", description: "Budget amount" },
    spawned_from: { type: "page_ref", required: false, owner: "synthesis", description: "Originating situation/initiative slug" },
    parent_project: { type: "page_ref", required: false, owner: "synthesis", description: "Parent project_portfolio slug, if this project sits inside a portfolio" },
    completed_date: { type: "date", required: false, owner: "runtime", default: null, description: "Actual completion date" },
    progress: { type: "number", required: false, owner: "runtime", default: null, description: "Progress percentage 0\u2013100" },
  },
};

const PROJECT_PORTFOLIO: PageSchema = {
  pageType: "project_portfolio",
  description: "A container that groups related projects into a coordinated workstream. Hub into child projects.",
  sectionMenu: [
    "Purpose & Scope", "Child Projects", "Team", "Timeline & Milestones",
    "Risks & Issues", "Decisions", "Status Updates",
  ],
  properties: {
    status: { type: "enum", required: true, owner: "synthesis", enumValues: ["planned", "active", "paused", "completed", "cancelled"], description: "Portfolio status" },
    owner: { type: "page_ref", required: true, owner: "synthesis", description: "Portfolio owner person slug" },
    domain: { type: "page_ref", required: false, owner: "synthesis", description: "Owning department" },
    priority: { type: "enum", required: false, owner: "synthesis", enumValues: ["low", "medium", "high", "critical"], description: "Priority level" },
    start_date: { type: "date", required: false, owner: "synthesis", description: "Portfolio start date" },
    target_date: { type: "date", required: false, owner: "synthesis", description: "Target completion date" },
    budget: { type: "string", required: false, owner: "synthesis", description: "Total portfolio budget" },
    spawned_from: { type: "page_ref", required: false, owner: "synthesis", description: "Originating situation/initiative slug" },
    completed_date: { type: "date", required: false, owner: "runtime", default: null, description: "Actual completion date" },
  },
};

const PROJECT_DELIVERABLE: PageSchema = {
  pageType: "project_deliverable",
  description: "A terminal artifact produced by a project — a report section, document, analysis, or asset. Hub for the deliverable's content, evidence, and review state.",
  sectionMenu: [
    "Objective", "Content", "Evidence & Sources", "Completeness",
    "Risks & Findings", "Review Status", "Decisions",
  ],
  properties: {
    status: { type: "enum", required: true, owner: "synthesis", enumValues: ["planned", "in_progress", "in_review", "accepted", "rejected"], description: "Deliverable review status" },
    stage: { type: "enum", required: true, owner: "synthesis", enumValues: ["intelligence", "workboard", "deliverable"], description: "Lifecycle stage" },
    parent_project: { type: "page_ref", required: true, owner: "synthesis", description: "Parent project slug" },
    assigned_to: { type: "page_ref", required: false, owner: "synthesis", description: "Assigned reviewer person slug" },
    generation_mode: { type: "enum", required: false, owner: "synthesis", enumValues: ["ai_generated", "human_authored", "ai_assisted"], description: "How this deliverable was produced" },
    confidence: { type: "enum", required: false, owner: "synthesis", enumValues: ["high", "medium", "low"], description: "Overall confidence in findings" },
    risk_count: { type: "number", required: false, owner: "synthesis", default: 0, description: "Number of risks identified in this deliverable" },
    accepted_by: { type: "page_ref", required: false, owner: "runtime", default: null, description: "Person who accepted this deliverable" },
    accepted_date: { type: "date", required: false, owner: "runtime", default: null, description: "Acceptance date" },
  },
};

const INITIATIVE: PageSchema = {
  pageType: "initiative",
  description: "A strategic proposal or improvement that may become a project.",
  sectionMenu: [
    "Trigger", "Evidence", "Investigation", "Proposal",
    "Primary Deliverable", "Downstream Effects", "Impact Assessment",
    "Alternatives Considered", "Timeline",
  ],
  properties: {
    status: {
      type: "enum",
      required: true,
      owner: "synthesis",
      enumValues: [
        "detected",
        "reasoning",
        "dismissed",
        "proposed",
        "accepted",
        "concerns_raised",
        "ready",
        "implementing",
        "implemented",
        "rejected",
        "deferred",
      ],
      description: "Initiative lifecycle status",
    },
    proposal_type: {
      type: "enum",
      required: false,
      owner: "synthesis",
      enumValues: ["wiki_update", "process_creation", "strategy_revision", "system_job_creation", "project_creation", "general"],
      description: "What kind of change this initiative proposes",
    },
    severity: {
      type: "enum",
      required: false,
      owner: "synthesis",
      enumValues: ["low", "medium", "high", "critical"],
      description: "How urgent / impactful",
    },
    owner: { type: "page_ref", required: false, owner: "synthesis", description: "Initiative owner person slug" },
    domain: { type: "page_ref", required: false, owner: "synthesis", description: "Owning department" },
    priority: { type: "enum", required: false, owner: "synthesis", enumValues: ["low", "medium", "high", "critical"], description: "Priority level" },
    proposed_date: { type: "date", required: true, owner: "synthesis", description: "Date proposed" },
    expected_impact: { type: "enum", required: false, owner: "synthesis", enumValues: ["low", "medium", "high", "transformative"], description: "Expected impact level" },
    effort_estimate: { type: "enum", required: false, owner: "synthesis", enumValues: ["trivial", "small", "medium", "large", "major"], description: "Estimated effort" },
    spawned_from: { type: "page_ref", required: false, owner: "synthesis", description: "Originating situation slug" },
    decision_date: { type: "date", required: false, owner: "runtime", default: null, description: "Date decision was made" },
  },
};

const STRATEGIC_LINK: PageSchema = {
  pageType: "strategic_link",
  description: "A strategic decision and its rationale, impact chain, and evaluation.",
  sectionMenu: [
    "Decision", "Context & Causes", "Reasoning", "Alternatives Considered",
    "Influence Chain", "Implementation", "Reassessment Triggers", "Outcome & Evaluation", "Related Decisions",
  ],
  properties: {
    decision_status: { type: "enum", required: true, owner: "synthesis", enumValues: ["proposed", "active", "superseded", "reversed", "under_review"], description: "Decision status" },
    decision_date: { type: "date", required: false, owner: "synthesis", description: "When the decision was made" },
    decision_maker: { type: "page_ref", required: false, owner: "synthesis", description: "Person who made the decision" },
    impact_scope: { type: "enum", required: false, owner: "synthesis", enumValues: ["company", "department", "process", "relationship"], description: "Scope of impact" },
    affected_domains: { type: "page_ref[]", required: false, owner: "synthesis", description: "Affected department slugs" },
    confidence: { type: "number", required: false, owner: "synthesis", description: "Confidence in decision 0\u20131" },
    reassessment_date: { type: "date", required: false, owner: "runtime", default: null, description: "Next reassessment date" },
    superseded_by: { type: "page_ref", required: false, owner: "runtime", default: null, description: "Slug of superseding decision" },
  },
};

const TOOL_SYSTEM: PageSchema = {
  pageType: "tool_system",
  description: "A software tool or system used in the organization.",
  sectionMenu: [
    "Description", "Users & Access", "Key Functions",
    "Integration Points", "Processes", "Known Issues", "Data & Content",
  ],
  properties: {
    tool_type: { type: "string", required: false, owner: "synthesis", description: "\"accounting\", \"crm\", \"erp\", \"communication\", \"project_management\", etc." },
    status: { type: "enum", required: true, owner: "synthesis", enumValues: ["active", "deprecated", "evaluating", "planned"], description: "Tool status" },
    owner: { type: "page_ref", required: false, owner: "synthesis", description: "Tool owner person slug" },
    domain: { type: "page_ref", required: false, owner: "synthesis", description: "Primary department" },
    vendor: { type: "string", required: false, owner: "synthesis", description: "Vendor name" },
    url: { type: "string", required: false, owner: "synthesis", description: "Tool URL" },
    connector_status: { type: "enum", required: false, owner: "runtime", default: null, enumValues: ["connected", "not_connected", "partial"], description: "Qorpera connector status" },
  },
};

const SYSTEM_JOB: PageSchema = {
  pageType: "system_job",
  description: "A scheduled or event-triggered automated agent. Config lives on this page; runs execute per its deliverable kind.",
  sectionMenu: [
    "Purpose", "Scope", "Method", "Output", "Recipients", "Configuration", "Execution History",
  ],
  properties: {
    // ── Lifecycle ──
    status: { type: "enum", required: true, owner: "synthesis", enumValues: ["active", "paused", "disabled", "draft"], description: "Job lifecycle status" },
    description: { type: "string", required: true, owner: "synthesis", description: "Short one-paragraph job description" },

    // ── Triggers (v2: array of cron and/or event entries) ──
    triggers: { type: "json", required: false, owner: "synthesis", description: "Array of trigger entries: {type:'cron',expression:string} | {type:'event',eventType:string,filter:object}" },
    schedule: { type: "string", required: false, owner: "synthesis", description: "Legacy cron string — kept for back-compat readout only; triggers is authoritative" },

    // ── Deliverable shape ──
    deliverable_kind: { type: "enum", required: true, owner: "synthesis", enumValues: ["report", "proposals", "edits", "mixed"], description: "What the job produces. Drives output schema and rendering." },
    trust_level: { type: "enum", required: true, owner: "synthesis", enumValues: ["observe", "propose", "act"], description: "Execution autonomy. observe=findings only. propose=initiatives require accept. act=initiatives auto-accept with receipt." },
    post_policy: { type: "enum", required: true, owner: "synthesis", enumValues: ["always", "importance_threshold", "actionable_only"], description: "When to publish a run's output" },
    importance_threshold: { type: "number", required: false, owner: "synthesis", description: "0–1 score gate, required when post_policy=importance_threshold" },

    // ── Scope / reach ──
    anchor_pages: { type: "json", required: false, owner: "synthesis", description: "Array of wiki page slugs always read first by the agent" },
    reach_mode: { type: "enum", required: false, owner: "synthesis", enumValues: ["pinned_only", "domain_bounded", "agentic"], description: "How the agent decides what else to read" },
    domain_scope: { type: "json", required: false, owner: "synthesis", description: "Array of domain slugs that bound agentic reach when reach_mode=domain_bounded" },

    // ── People ──
    owner: { type: "page_ref", required: false, owner: "synthesis", description: "Responsible person slug" },
    domain: { type: "page_ref", required: false, owner: "synthesis", description: "Primary domain/department" },
    recipients: { type: "json", required: false, owner: "synthesis", description: "Array of person slugs to notify when a deliverable is ready" },

    // ── Budget ──
    budget_soft_tool_calls: { type: "number", required: false, owner: "synthesis", description: "Soft tool-call budget for the agentic loop (default 15)" },
    budget_hard_tool_calls: { type: "number", required: false, owner: "synthesis", description: "Hard tool-call cap (default 25)" },
    dedup_window_runs: { type: "number", required: false, owner: "synthesis", description: "Number of prior runs to consider when deduping proposed outputs (default 3)" },

    // ── Permissions snapshot (runtime-owned, set on create; NOT live-joined to User — preserves audit trail if user deleted) ──
    creator_user_id_snapshot: { type: "string", required: false, owner: "runtime", description: "User ID snapshot at creation — preserves audit trail; not a live lookup" },
    creator_role_snapshot: { type: "enum", required: false, owner: "runtime", enumValues: ["member", "admin", "superadmin"], description: "Creator role at creation time — bounds trust_level at runtime" },

    // ── Runtime state (set by scheduler/reasoner) ──
    last_run: { type: "date", required: false, owner: "runtime", default: null, description: "Last execution timestamp" },
    next_run: { type: "date", required: false, owner: "runtime", default: null, description: "Next scheduled execution (null for event-only jobs)" },
    latest_run_summary: { type: "string", required: false, owner: "runtime", default: null, description: "One-line synopsis of most recent run" },
    latest_run_status: { type: "enum", required: false, owner: "runtime", default: null, enumValues: ["completed", "awaiting_review", "failed", "running", "compressed"], description: "Status of the most recent run" },

    // ── Legacy (kept for compat, unused in v2) ──
    auto_approve_steps: { type: "boolean", required: false, owner: "synthesis", description: "Deprecated — use trust_level=act instead" },
  },
};

const SYSTEM_JOB_RUN_REPORT: PageSchema = {
  pageType: "system_job_run_report",
  description: "A single run output for a report-kind system job. Child page of a system_job.",
  sectionMenu: ["Summary", "Key findings", "Recommendations", "Body"],
  properties: {
    parent_job_slug: { type: "page_ref", required: true, owner: "runtime", description: "Parent system_job slug" },
    run_date: { type: "date", required: true, owner: "runtime", description: "When this run occurred" },
    importance_score: { type: "number", required: false, owner: "runtime", description: "0–1 reasoner importance score" },
    tool_calls: { type: "number", required: false, owner: "runtime", description: "Tool-call count for this run" },
    cost_cents: { type: "number", required: false, owner: "runtime", description: "API cost in cents" },
  },
};

const OTHER: PageSchema = {
  pageType: "other",
  description: "Freeform page with no enforced structure.",
  sectionMenu: [],
  properties: {
    category: { type: "string", required: false, owner: "synthesis", description: "Content category" },
    domain: { type: "page_ref", required: false, owner: "synthesis", description: "Related department" },
    author: { type: "page_ref", required: false, owner: "synthesis", description: "Author person slug" },
    created_date: { type: "date", required: false, owner: "synthesis", description: "Date created" },
    relevance: { type: "enum", required: false, owner: "synthesis", enumValues: ["current", "historical", "reference"], description: "Content relevance" },
  },
};

export const PAGE_SCHEMAS: Record<string, PageSchema> = {
  situation_instance: SITUATION_INSTANCE,
  situation_type: SITUATION_TYPE,
  person_profile: PERSON_PROFILE,
  domain_hub: DOMAIN_HUB,
  company_overview: COMPANY_OVERVIEW,
  external_contact: EXTERNAL_CONTACT,
  external_relationship: EXTERNAL_RELATIONSHIP,
  process: PROCESS,
  project_portfolio: PROJECT_PORTFOLIO,
  project: PROJECT,
  project_deliverable: PROJECT_DELIVERABLE,
  initiative: INITIATIVE,
  strategic_link: STRATEGIC_LINK,
  tool_system: TOOL_SYSTEM,
  system_job: SYSTEM_JOB,
  system_job_run_report: SYSTEM_JOB_RUN_REPORT,
  other: OTHER,
};

// ─── Helpers ────────────────────────────────────────────

/** Returns only synthesis-owned properties for a page type. */
export function getSynthesisProperties(pageType: string): Record<string, PropertyDef> {
  const schema = PAGE_SCHEMAS[pageType];
  if (!schema) return {};
  const result: Record<string, PropertyDef> = {};
  for (const [key, def] of Object.entries(schema.properties)) {
    if (def.owner === "synthesis") result[key] = def;
  }
  return result;
}

/** Generates a prompt fragment telling the LLM what properties to emit. */
export function buildPropertyPrompt(pageType: string): string {
  const schema = PAGE_SCHEMAS[pageType];
  if (!schema) return "";

  const synthProps = Object.entries(schema.properties).filter(([, d]) => d.owner === "synthesis");
  const runtimeProps = Object.entries(schema.properties).filter(([, d]) => d.owner === "runtime");

  if (synthProps.length === 0) return "";

  const lines: string[] = [
    `When writing a ${pageType} page, include a "properties" JSON object with these fields:`,
  ];

  for (const [key, def] of synthProps) {
    const req = def.required ? "REQUIRED" : "optional";
    let typeHint: string = def.type;
    if (def.type === "enum" && def.enumValues) {
      typeHint = def.enumValues.join(" | ");
    } else if (def.type === "page_ref") {
      typeHint = "page_ref \u2014 must be an existing [[slug]]";
    } else if (def.type === "page_ref[]") {
      typeHint = "page_ref[] \u2014 array of existing [[slug]] values";
    }
    lines.push(`- ${key} (${typeHint}, ${req}): ${def.description}`);
  }

  if (runtimeProps.length > 0) {
    lines.push(`Do NOT include these system-managed fields: ${runtimeProps.map(([k]) => k).join(", ")}`);
  }

  return lines.join("\n");
}

/** Generates a prompt fragment listing exact section headings. */
export function buildSectionPrompt(pageType: string): string {
  const schema = PAGE_SCHEMAS[pageType];
  if (!schema || schema.sectionMenu.length === 0) return "";

  const lines: string[] = [
    "This page type MUST contain these sections as ## headings, in this exact order:",
  ];
  for (const heading of schema.sectionMenu) {
    lines.push(`## ${heading}`);
  }
  lines.push("");
  lines.push("Every section must be present. Content may be brief if data is limited, but the heading must exist.");

  return lines.join("\n");
}

/** Validates properties against the schema. */
export function validateProperties(
  pageType: string,
  props: Record<string, unknown>,
): ValidationResult {
  const schema = PAGE_SCHEMAS[pageType];
  if (!schema) return { valid: true, errors: [] };

  const errors: string[] = [];

  for (const [key, def] of Object.entries(schema.properties)) {
    if (def.owner !== "synthesis") continue;

    const val = props[key];

    // Required check
    if (def.required && (val === undefined || val === null)) {
      errors.push(`Missing required property: ${key}`);
      continue;
    }

    if (val === undefined || val === null) continue;

    // Enum check
    if (def.type === "enum" && def.enumValues) {
      if (!def.enumValues.includes(val as string)) {
        errors.push(`Invalid enum value for ${key}: "${val}" (allowed: ${def.enumValues.join(", ")})`);
      }
    }

    // Type checks
    if (def.type === "string" || def.type === "date" || def.type === "page_ref") {
      if (typeof val !== "string") {
        errors.push(`Property ${key} must be a string, got ${typeof val}`);
      }
    }
    if (def.type === "number" && typeof val !== "number") {
      errors.push(`Property ${key} must be a number, got ${typeof val}`);
    }
    if (def.type === "boolean" && typeof val !== "boolean") {
      errors.push(`Property ${key} must be a boolean, got ${typeof val}`);
    }
    if (def.type === "page_ref[]") {
      if (!Array.isArray(val) || !val.every((v) => typeof v === "string")) {
        errors.push(`Property ${key} must be a string array`);
      }
    }
  }

  // Warn about unknown/runtime keys
  for (const key of Object.keys(props)) {
    const def = schema.properties[key];
    if (!def) {
      errors.push(`Warning: unknown property "${key}" (not in ${pageType} schema)`);
    } else if (def.owner === "runtime") {
      errors.push(`Warning: runtime-owned property "${key}" should not be set by synthesis`);
    }
  }

  const valid = !errors.some((e) => !e.startsWith("Warning:"));
  return { valid, errors };
}

/** Returns runtime-owned properties with their default values. */
export function getDefaultProperties(pageType: string): Record<string, unknown> {
  const schema = PAGE_SCHEMAS[pageType];
  if (!schema) return {};
  const result: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(schema.properties)) {
    if (def.owner === "runtime" && def.default !== undefined) {
      result[key] = def.default;
    }
  }
  return result;
}

function snakeToTitle(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Renders properties as a compact markdown table. */
export function renderPropertyTable(
  pageType: string,
  props: Record<string, unknown>,
): string {
  const schema = PAGE_SCHEMAS[pageType];
  if (!schema) return "";

  const rows: string[] = [];

  for (const key of Object.keys(schema.properties)) {
    const val = props[key];
    if (val === undefined || val === null) continue;

    const def = schema.properties[key];
    const label = snakeToTitle(key);
    let display: string;

    if (def.type === "page_ref" && typeof val === "string") {
      display = `[[${val}]]`;
    } else if (def.type === "page_ref[]" && Array.isArray(val)) {
      if (val.length === 0) continue;
      display = val.map((v) => `[[${v}]]`).join(", ");
    } else if (def.type === "boolean") {
      display = val ? "Yes" : "No";
    } else {
      display = String(val);
    }

    rows.push(`| ${label} | ${display} |`);
  }

  if (rows.length === 0) return "";

  return ["| Property | Value |", "|---|---|", ...rows].join("\n");
}
