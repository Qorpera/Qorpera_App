import { PrismaClient } from "@prisma/client";
import {
  InitiativeDashboardSchema,
  type InitiativeDashboard,
} from "@/lib/initiative-dashboard-types";
import { injectDashboardSection } from "@/lib/initiative-reasoning";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run demo seed script in production environment.");
  console.error(
    "This script performs upsert operations that would overwrite real KnowledgePage rows.",
  );
  process.exit(1);
}

const prisma = new PrismaClient();

// Slugs the previous seed created. Deleted at the start of this run so the
// fixture set matches the new spec exactly (no stragglers from old runs).
const LEGACY_SLUGS = [
  "demo-dashboard-initiative",
  "demo-no-dashboard-initiative",
];

// ── Fixture 1 — demo-proposed-process (status=proposed) ──────────────────────

const FIXTURE_1_DASHBOARD: InitiativeDashboard = {
  cards: [
    {
      primitive: "impact_bar",
      span: 12,
      claim: "60–80% fewer unbudgeted hours per engagement",
      explanation:
        "Scope additions currently proceed without estimate or client signature. A change-order checkpoint converts informal expansion into budgeted work.",
      confidence: "medium",
      evidence: [
        {
          ref: "scope-creep-analysis",
          inferred: false,
          summary:
            "38 hrs/mo averaged across 3 active engagements last quarter",
        },
        {
          ref: null,
          inferred: true,
          summary:
            "Projected 8–15 hrs/mo based on change-order benchmarks in similar consultancies",
        },
      ],
      data: {
        baseline: { typicalValue: 38, unit: "hrs/mo" },
        projected: {
          typicalValue: 12,
          range: { low: 8, high: 15 },
          unit: "hrs/mo",
        },
        savings: {
          typicalValue: 26,
          unit: "hrs/mo",
          label: "recovered delivery capacity across active engagements",
        },
      },
    },
    {
      primitive: "process_flow",
      span: 12,
      claim: "5-step change-order workflow with two mandatory checkpoints",
      explanation:
        "Quantification precedes client signature, which precedes any billable work. Both checkpoints are non-skippable.",
      confidence: "high",
      evidence: [
        {
          ref: "change-order-workflow",
          inferred: false,
          summary: "Draft workflow spec attached to this initiative",
        },
      ],
      data: {
        steps: [
          { label: "Identify" },
          { label: "Quantify", checkpoint: true, note: "Estimate" },
          { label: "Client approval", checkpoint: true, note: "Signature" },
          { label: "Invoice update" },
          { label: "Track" },
        ],
      },
    },
    {
      primitive: "entity_set",
      span: 6,
      claim: "4 engagements with unbilled scope drift · last 90 days",
      explanation:
        "All four expanded mid-engagement without a written amendment. Ranked by unbilled hours.",
      confidence: "high",
      evidence: [
        {
          ref: "engagement-ledger",
          inferred: false,
          summary:
            "Time entries tagged 'scope-change' aggregated per engagement",
        },
      ],
      data: {
        subtitle: "from past 90 days",
        entities: [
          {
            name: "Hansen-Meier Industri",
            slug: "hansen-meier",
            flag: "bad",
            metric: "+82 hrs",
            metricFlag: "bad",
          },
          {
            name: "Nordsø Logistik",
            flag: "warn",
            metric: "+54 hrs",
            metricFlag: "warn",
          },
          {
            name: "Baltica Retail",
            flag: "warn",
            metric: "+31 hrs",
            metricFlag: "warn",
          },
          {
            name: "Orsa Møbler",
            flag: "neutral",
            metric: "+12 hrs",
          },
        ],
      },
    },
  ],
};

const FIXTURE_1_CONTENT = `## Trigger

The delivery scanner flagged 4 engagements from the past quarter where final billed hours exceeded contract estimate by more than 20%. In every case the overrun traces to a scope addition that was discussed with the client but never written into the contract.

## Evidence

- [[scope-creep-analysis]]: 38 hrs/mo lost to unbilled work averaged across active engagements
- [[engagement-ledger]]: Hansen-Meier (+82 hrs), Nordsø (+54 hrs), Baltica (+31 hrs), Orsa (+12 hrs)
- [[change-order-workflow]]: proposed 5-step workflow with two signature checkpoints
- Pattern holds across 3 different engagement leads — not an individual-level issue

## Investigation

Discovery and initial contracts are tight. All four overruns begin 4–8 weeks into engagement, triggered by client asks that sound small ("can you also look at X?") but compound. The current workflow treats these as goodwill additions rather than contract amendments. The ledger shows this is not a one-off — it has happened on every engagement over 6 weeks in duration for the past two quarters.

Existing process docs don't mention change orders at all. Contract templates have no amendment section. Engagement leads report that inserting a signature step feels "heavy" when discussions are happening mid-meeting, which is why the status quo has persisted despite awareness.

## Proposal

1. Draft a Change Order Workflow as a new process page.
2. Add a mandatory change-order gate to all engagements above 4 hours of new scope.
3. Update contract templates with an amendment section referencing the workflow.
4. Run a 2-week pilot on Hansen-Meier (highest-drift engagement) before broader rollout.

## Primary Deliverable

A new \`process\` wiki page titled "Change Order Workflow" that defines the 5-step process: Identify → Quantify → Client approval (signature) → Invoice update → Track. Two checkpoints block work continuation until signed off. The page includes the specific form template, a communication script for engagement leads, and integration points with the invoicing pipeline.

## Downstream Effects

- **[[engagement-ledger]]** (tracking): Add "change-order" category for time entries so the scope-creep dashboard can track recovery.
- **[[contract-template]]** (document): Update the standard contract to reference the new workflow and include an amendment section.
- **[[invoicing-pipeline]]** (process): Add a line-item category for change-order billing so these hours show up distinctly on invoices.

## Impact Assessment

Expected to recover 60–80% of unbilled scope hours — roughly 22–30 hrs/mo across the current portfolio, worth approximately 45,000 DKK/mo in recovered billing at blended rate. Risk: clients may push back on the formality. Mitigation: pilot on one engagement first and soften to "acknowledgement" if a hard signature feels excessive.

## Alternatives Considered

- **Raise standard hourly rates** — rejected because it penalizes well-scoped engagements and does not address the drift pattern.
- **Tighter discovery scoping** — rejected because the drift happens mid-engagement, not at kickoff. Discovery is already tight.
- **Absorb and report quarterly** — rejected as status quo: produces visibility but no recovery.

## Timeline

- 2026-04-15 — Pattern detected by delivery scanner across 4 engagements
- 2026-04-17 — Change Order Workflow proposal drafted by reasoning engine
- (Next) 2026-04-22 — Workflow document finalized, pilot starts on Hansen-Meier
- (Planned) 2026-05-06 — Pilot review, rollout decision
`;

const FIXTURE_1_PROPS = {
  status: "proposed",
  proposal_type: "process_creation",
  primary_deliverable: {
    type: "wiki_create",
    targetPageSlug: "change-order-workflow",
    targetPageType: "process",
    title: "Change Order Workflow",
    description:
      "A 5-step workflow requiring client signature before any scope expansion begins billable work. Two mandatory checkpoints: quantification (estimate in writing) and client approval (signature).",
    rationale:
      "Converts informal mid-engagement asks into budgeted, signed work. Addresses the root cause of the drift — absence of a signature gate — rather than compensating downstream.",
    proposedContent: `## Purpose

Any addition to a contracted engagement must go through a quantified, signed change-order process before billable work begins.

## Scope

Applies to every active engagement. Triggers when any scope addition estimated above 4 hours is discussed with a client.

## Steps

1. **Identify** — Engagement lead flags the request as a scope change in the ledger.
2. **Quantify** (checkpoint) — Lead produces a written estimate with hours and cost.
3. **Client approval** (checkpoint) — Client signs the change-order form; work cannot begin until the signature returns.
4. **Invoice update** — Finance adds the change-order line item to the next invoice.
5. **Track** — Hours logged under the change-order category in the ledger for recovery reporting.

## Form template

Engagement code · scope summary · estimate hours · estimate cost · client signature block · invoice line reference.

## Communication script

"This feels like a useful addition. Let me send a quick change-order so we have it in writing — should come back to you within the hour."

## Integrations

Ledger: \`change-order\` category. Invoicing: dedicated line-item. Dashboard: recovery tracker.`,
    proposedProperties: null,
  },
  downstream_effects: null,
  severity: "high",
  priority: "high",
  expected_impact: "high",
  effort_estimate: "medium",
};

// ── Fixture 2 — demo-dismissed-wiki (status=dismissed) ───────────────────────

const FIXTURE_2_DASHBOARD: InitiativeDashboard = {
  cards: [
    {
      primitive: "conceptual_diagram",
      span: 12,
      claim: "Portfolio splits into three margin tiers, weighted toward low-margin foundation work",
      explanation:
        "Foundation-tier clients (<20% margin) make up more than half the portfolio but generate less than a quarter of profit. Tier framing would shift acquisition strategy.",
      confidence: "medium",
      evidence: [
        {
          ref: "client-ledger",
          inferred: false,
          summary:
            "Client P&L breakdown across 14 active engagements, last 12 months",
        },
        {
          ref: null,
          inferred: true,
          summary:
            "Tier thresholds are hypothesis — sample size of 14 is below the stability mark",
        },
      ],
      data: {
        variant: "tier_pyramid",
        tiers: [
          {
            label: "Strategic",
            count: 2,
            threshold: "≥35% margin",
            flag: "good",
          },
          {
            label: "Standard",
            count: 5,
            threshold: "20–35% margin",
            flag: "neutral",
          },
          {
            label: "Foundation",
            count: 7,
            threshold: "<20% margin",
            flag: "bad",
          },
        ],
      },
    },
    {
      primitive: "impact_bar",
      span: 6,
      claim: "Hypothetical lift if foundation tier rebalances: +6pp average margin",
      explanation:
        "Modeled scenario: if half of foundation-tier engagements are replaced with standard-tier work, blended margin improves from 19% to 25%. Highly speculative at current sample size.",
      confidence: "low",
      evidence: [
        {
          ref: null,
          inferred: true,
          summary: "Scenario model, no empirical basis in current portfolio data",
        },
      ],
      data: {
        baseline: { typicalValue: 19, unit: "%" },
        projected: {
          typicalValue: 25,
          range: { low: 21, high: 29 },
          unit: "%",
        },
      },
    },
  ],
};

const FIXTURE_2_CONTENT = `## Trigger

Client portfolio review flagged that more than half of active engagements operate below the 20% margin threshold the board set as a floor. A tier-based segmentation strategy was proposed to reshape acquisition and pricing toward higher-margin work.

## Evidence

- [[client-ledger]]: 14 active engagements — 7 below 20% margin, 5 between 20–35%, 2 above 35%
- [[pricing-policy]]: current policy does not differentiate by client tier (same rate card for all)
- Portfolio P&L flat for 3 quarters; margin has not improved despite 15% revenue growth

## Investigation

The skew is real. Foundation-tier engagements (<20% margin) make up 50% of the client count but only 23% of total profit. The reasoning engine considered whether to propose a tier-based pricing or acquisition strategy update. Investigation found two blockers.

First, the sample size is below the threshold the board set at last strategy review (50 active engagements before strategic rebalancing is considered). The current sample of 14 is too small to distinguish signal from noise. Second, Q3 planning is already scheduled with portfolio strategy on the agenda — resource-allocation decisions made now would likely be revisited in 8–10 weeks, after more data arrives.

## Proposal

The reasoning engine's draft was: update \`client-tier-strategy\` with a three-tier framework (Strategic, Standard, Foundation), reprice Foundation-tier work upward by 15–20%, and refocus new client acquisition toward the Standard and Strategic tiers.

## Primary Deliverable

An update to the client-tier-strategy wiki page defining the three tiers, threshold rules, per-tier pricing deltas, and acquisition weighting. The proposal would be operationalized by the sales and delivery teams.

## Downstream Effects

- **[[pricing-policy]]** (document): Would need tier-based rate cards.
- **[[acquisition-playbook]]** (process): Would need weighted targeting language.

## Impact Assessment

Modeled uplift is +6pp blended margin over 6–12 months if half of foundation-tier engagements rebalance. However, the modeling assumes stable win rate at higher price points — untested. Risk of revenue decline if foundation-tier clients refuse reprice.

## Alternatives Considered

- **Defer to Q3 planning review** — selected. Portfolio strategy is already on the agenda and the sample is below the decision threshold.
- **Reprice foundation tier immediately** — rejected as premature without Q3 context.
- **Drop foundation-tier acquisition entirely** — rejected as too aggressive given 50% of volume.

## Timeline

- 2026-04-03 — Portfolio margin dip flagged by finance scanner
- 2026-04-17 — Reasoning engine investigation concluded; dismissal recorded
- (Planned) 2026-07-01 — Q3 strategic planning cycle, portfolio strategy revisit
`;

const FIXTURE_2_PROPS = {
  status: "dismissed",
  proposal_type: "wiki_update",
  primary_deliverable: {
    type: "wiki_update",
    targetPageSlug: "client-tier-strategy",
    targetPageType: "strategic_link",
    title: "Client tier segmentation strategy update",
    description:
      "Formalize a three-tier client framework (Strategic / Standard / Foundation) with margin thresholds, per-tier pricing deltas, and weighted acquisition targeting.",
    rationale:
      "Half of current engagements operate below the 20% margin threshold. A tier-based segmentation would give sales and delivery a shared language for portfolio shaping.",
    proposedContent: `## Segments

Clients fall into three tiers by realized margin over the last 12 months.

## Tier definitions

- **Strategic** (≥35% margin) — flagship engagements with repeatable retainer structures.
- **Standard** (20–35% margin) — steady-state project work, the backbone of the portfolio.
- **Foundation** (<20% margin) — introductory or high-variance engagements.

## Pricing approach

Foundation tier rate card moves up by 15–20% at next renewal. Standard and Strategic unchanged.

## Acquisition weighting

60% of prospecting effort toward Standard, 30% toward Strategic, 10% toward Foundation (with tighter scope gates).`,
    proposedProperties: null,
  },
  downstream_effects: null,
  severity: "medium",
  priority: "low",
  expected_impact: "medium",
  effort_estimate: "large",
  dismissal_reason:
    "Deprioritized this quarter — pattern validated but resource allocation pending Q3 planning cycle. Revisit when client portfolio data exceeds 50 active engagements.",
};

// ── Fixture 3 — demo-concerns-system (status=concerns_raised) ────────────────

const FIXTURE_3_DASHBOARD: InitiativeDashboard = {
  cards: [
    {
      primitive: "automation_loop",
      span: 12,
      claim: "Monthly KPI report cycle — 4-node flow replacing 38 hours of manual compilation",
      explanation:
        "Runs 1st of each month. Trust gradient: first two cycles route through operator approval before send; auto-sends after two clean cycles with anomaly-only escalation.",
      confidence: "high",
      evidence: [
        {
          ref: "reporting-time-audit",
          inferred: false,
          summary: "38 hrs/mo measured across 3 reporters over 4 months",
        },
        {
          ref: "reporting-template",
          inferred: false,
          summary:
            "Existing monthly format — 4 sections, data from 6 source systems",
        },
      ],
      data: {
        annotation:
          "First 2 cycles require operator approval before the Notify step. After 2 clean cycles, auto-sends with anomaly-only escalation.",
        nodes: [
          {
            icon: "trigger",
            title: "Trigger",
            sub: "1st of month\n09:00 CET",
          },
          {
            icon: "fetch",
            title: "Fetch",
            sub: "6 source systems\ne-conomic, Planday,\nHubSpot, Stripe,\nDinero, GSheets",
          },
          {
            icon: "compose",
            title: "Compose",
            sub: "4-section format\nflags deviations\n>15% vs 3-mo avg",
          },
          {
            icon: "notify",
            title: "Notify",
            sub: "4 recipients\nCEO, CFO, board,\ndelivery lead",
          },
        ],
      },
    },
    {
      primitive: "trend_or_distribution",
      span: 6,
      claim: "Manual reporting effort trending up 12 months running",
      explanation:
        "Hours spent compiling the monthly report have climbed 40% over the last year as source systems multiplied. Warning tint reflects the trajectory.",
      confidence: "medium",
      evidence: [
        {
          ref: "reporting-time-audit",
          inferred: false,
          summary: "Monthly hours logged under 'reporting' category",
        },
      ],
      data: {
        kind: "sparkline",
        headlineValue: 38,
        headlineUnit: "hrs",
        deltaLabel: "↑ from 27",
        flag: "warn",
        points: [27, 28, 26, 29, 30, 31, 32, 33, 34, 36, 37, 38],
        xAxisStart: "Apr 2025",
        xAxisEnd: "Mar 2026",
      },
    },
    {
      primitive: "trend_or_distribution",
      span: 6,
      claim: "Where the 38 hours go",
      explanation:
        "Data pull and formatting dominate the effort. Automation targets the primary slice — data pull — first.",
      confidence: "medium",
      evidence: [
        {
          ref: "reporting-time-audit",
          inferred: false,
          summary: "Task-level breakdown from reporter timesheets",
        },
      ],
      data: {
        kind: "donut",
        segments: [
          { label: "Data pull & aggregation", value: 14, flag: "primary" },
          { label: "Formatting & layout", value: 12, flag: "secondary" },
          { label: "Review & edit", value: 8, flag: "secondary" },
          { label: "Distribution", value: 4, flag: "tertiary" },
        ],
      },
    },
  ],
};

const FIXTURE_3_CONTENT = `## Trigger

Operations flagged that the monthly KPI report consumes ~38 hours of reporter time each month across 3 contributors, and that the effort has grown 40% year over year as source systems multiplied. A dedicated system job was proposed to automate the compile-and-distribute phase.

## Evidence

- [[reporting-time-audit]]: 38 hrs/mo measured, 3 reporters, 4-month observation window
- [[reporting-template]]: existing 4-section format, 6 source systems feeding in
- Hours spent on reporting: 27 → 38 hrs/mo over last 12 months (40% growth)

## Investigation

The format is stable and has not changed in more than a year. Data pull and formatting account for 26 of the 38 hours — these are mechanical tasks. Review and distribution account for the rest; those benefit from human judgement and are left to the operator.

Connected systems cover most of the input surface: e-conomic, Planday, HubSpot, and Stripe are stable and queryable. Dinero and Google Sheets are connected read-only with partial coverage — the sheets in particular have occasional column drift that the automation would need to detect and skip.

Trust gradient plan: first two cycles require operator approval before send. After two clean cycles (no blocking errors, no anomaly escalations the reporter had to override), the job auto-sends with anomaly-only escalation.

## Proposal

1. Create a new \`system_job\` page with the full specification, trigger schedule, and trust-gradient plan.
2. Update \`reporting-template\` to reference the system job's output format and anomaly-flag convention.
3. Run the first two cycles in supervised mode. Audit before auto-promotion.

## Primary Deliverable

A new \`system_job\` wiki page titled "Monthly KPI Reporting System Job" defining the trigger (1st of month, 09:00 CET), fetch plan (6 source systems), compose rules (4 sections with anomaly flags at >15% deviation from 3-month average), notify list (4 recipients), and trust-gradient parameters.

## Downstream Effects

- **[[reporting-template]]** (process_description): Reference the system job's output format alongside the human-compiled template; note the anomaly-flag convention.

## Impact Assessment

Automation recovers 22–30 hrs/mo of reporter capacity, freeing the three contributors to work on analysis rather than compilation. Risk surfaced by reasoning: unstable source systems (Dinero, GSheets) could fail silently and produce reports with missing data. Blocking concern raised during preview — see below.

## Alternatives Considered

- **Automate distribution only** — rejected as low-value; distribution is 4 of 38 hours.
- **Contract the report out** — rejected as it does not solve the growing trend.
- **Reduce report scope** — rejected; the board specifically asked for the current sections.

## Timeline

- 2026-04-10 — Reporting time audit completed by operations
- 2026-04-17 — System job proposal generated; downstream review raised concerns
- (Blocked) — Source-system health precheck required before auto-promotion past supervised mode
`;

const FIXTURE_3_EXECUTION_STATE = {
  startedAt: new Date().toISOString(),
  totalCostCents: 142,
  primary: {
    status: "generated",
    error: null,
    appliedSlug: null,
  },
  downstream: [
    {
      changeId: "downstream-0",
      effect: {
        targetPageSlug: "reporting-template",
        targetPageType: "process_description",
        changeType: "update",
        summary:
          "Reference the system job's output format alongside the human-compiled template; note the anomaly-flag convention.",
      },
      status: "generated",
      proposedContent:
        "## Output format\n\nThe automated monthly KPI report follows the same 4-section structure as the legacy template, with the addition of an Anomaly Flags column in each section. Values deviating more than 15% from the trailing 3-month average are flagged. The report otherwise preserves the legacy voice, ordering, and headings.\n\n## Manual vs automated\n\nThe system job produces the compile-and-distribute phase. Review and editorial adjustments remain the reporter's responsibility.",
      proposedProperties: null,
      concerns: [
        {
          source: "llm",
          targetChangeId: "downstream-0",
          description:
            "The 15% anomaly threshold is stated on both the system job page and this template. If the threshold changes, both pages must update in lock-step — easy to drift.",
          severity: "warning",
          recommendation:
            "Keep the threshold in one place (system job config) and have the template reference it by link rather than restating the number.",
        },
      ],
      model: "seed",
      costCents: 71,
      error: null,
      appliedSlug: null,
    },
  ],
  crossConcerns: [
    {
      source: "llm",
      targetChangeId: null,
      description:
        "The proposed automation assumes all 6 source systems are connected and stable. Today, Dinero and Google Sheets are connected read-only and have partial coverage. Failure modes are not specified — the job may silently produce reports with missing data.",
      severity: "blocking",
      recommendation:
        "Before promoting past supervised mode, require a source-health precheck that fails the run if any of the 6 sources is unreachable or returns fewer records than expected.",
    },
  ],
  completedAt: null,
};

const FIXTURE_3_PROPS = {
  status: "concerns_raised",
  proposal_type: "system_job_creation",
  primary_deliverable: {
    type: "wiki_create",
    targetPageSlug: "monthly-kpi-reporting-system-job",
    targetPageType: "system_job",
    title: "Monthly KPI Reporting System Job",
    description:
      "System job that runs on the 1st of each month, fetches data from 6 source systems, composes the 4-section KPI report with anomaly flags, and distributes to 4 recipients. Supervised for first 2 cycles, then auto-send with escalation-only.",
    rationale:
      "Automates the mechanical 26-of-38 hours currently spent on data pull and formatting each month. Review and editorial judgement stay with the reporter.",
    proposedContent: `## Purpose

Compile and distribute the Monthly KPI Report without the 38 hours of manual effort.

## Trigger

1st of every month, 09:00 CET.

## Inputs

Six source systems: e-conomic, Planday, HubSpot, Stripe, Dinero, Google Sheets.

## Output

Four-section KPI report matching [[reporting-template]]. Each section includes an Anomaly Flags column for values deviating >15% from the trailing 3-month average.

## Recipients

CEO, CFO, Board, Delivery lead.

## Trust gradient

- Cycles 1–2: supervised. Operator approves before the Notify step.
- Cycles 3+: auto-send, escalation-only on anomaly flags or fetch failures.

## Source-health preflight

Every cycle begins with a preflight that checks all six sources. The cycle aborts and notifies the operator if any source is unreachable or returns fewer records than the trailing 3-month minimum.`,
    proposedProperties: null,
  },
  downstream_effects: [
    {
      targetPageSlug: "reporting-template",
      targetPageType: "process_description",
      changeType: "update",
      summary:
        "Reference the system job's output format alongside the human-compiled template; note the anomaly-flag convention.",
    },
  ],
  severity: "medium",
  priority: "medium",
  expected_impact: "high",
  effort_estimate: "medium",
  execution_state: FIXTURE_3_EXECUTION_STATE,
};

// ── Fixture 4 — demo-implemented-project (status=implemented) ────────────────

const FIXTURE_4_DASHBOARD: InitiativeDashboard = {
  cards: [
    {
      primitive: "entity_set",
      span: 6,
      claim: "Core project team for the Q2 engagement",
      explanation:
        "Three senior staff anchor the strategic planning work with Hansen-Meier. Partner sponsors the engagement; two leads run delivery.",
      confidence: "high",
      evidence: [
        {
          ref: "hansen-meier-engagement-history",
          inferred: false,
          summary: "Previous engagements with Hansen-Meier and who led them",
        },
      ],
      data: {
        entities: [
          {
            name: "Sofie Nielsen · Partner",
            slug: "sofie-nielsen",
            flag: "good",
            metric: "Sponsor",
          },
          {
            name: "Anders Lund · Delivery lead",
            slug: "anders-lund",
            flag: "good",
            metric: "Lead",
          },
          {
            name: "Maja Skov · Strategy",
            slug: "maja-skov",
            flag: "good",
            metric: "Lead",
          },
        ],
      },
    },
    {
      primitive: "process_flow",
      span: 6,
      claim: "4-phase project plan, April through mid-June",
      explanation:
        "Discovery and diagnosis set up the workshop, which drives the roadmap. Checkpoint at the workshop locks scope for execution.",
      confidence: "high",
      evidence: [
        {
          ref: "q2-strategic-planning-hansen-meier",
          inferred: false,
          summary: "Project page with schedule and milestone definitions",
        },
      ],
      data: {
        steps: [
          { label: "Discovery" },
          { label: "Diagnosis" },
          { label: "Workshop", checkpoint: true, note: "Lock scope" },
          { label: "Roadmap & handoff" },
        ],
      },
    },
  ],
};

const FIXTURE_4_CONTENT = `## Trigger

A strategic planning conversation with Hansen-Meier during a routine retainer check-in surfaced an explicit opportunity: they asked whether we could lead a Q2 strategic planning engagement for them. This is a new scope, not a continuation of existing work.

## Evidence

- [[hansen-meier-engagement-history]]: 3 previous engagements, all delivered above plan, Sofie is the long-time relationship lead
- Strategic planning is their highest-tier work type (≥35% margin); fits the Strategic client profile
- Hansen-Meier budget preapproved for Q2 work by their CFO in the conversation

## Investigation

The opportunity is well-qualified: existing relationship, preapproved budget, clear scope (Q2 strategic planning), and a strategic-tier margin profile. The client asked for April start, mid-June delivery. Team availability was confirmed: Sofie sponsors, Anders runs delivery, Maja owns the strategy stream.

The engagement follows the firm's standard 4-phase strategic planning structure: Discovery → Diagnosis → Workshop → Roadmap. The workshop is the scope-locking checkpoint; any changes after that point flow through the Change Order Workflow (see [[change-order-workflow]]).

## Proposal

Stand up a project page for Q2 Strategic Planning with Hansen-Meier that captures the team, schedule, milestones, and budget. Update Hansen-Meier's engagement history to reflect the new engagement.

## Primary Deliverable

A new \`project\` wiki page titled "Q2 Strategic Planning Project with Hansen-Meier" covering: team composition, 4-phase schedule (April through mid-June), budget envelope, deliverables per phase, and the workshop checkpoint for scope lock.

## Downstream Effects

- **[[hansen-meier-engagement-history]]** (document): Add the Q2 engagement to their history with the new team composition.

## Impact Assessment

Strategic-tier engagement with an existing high-trust client. Low delivery risk given the relationship and the team's prior track record. Margin profile expected to match the firm's strategic tier average (≥35%).

## Alternatives Considered

- **Defer to Q3** — rejected as the client offered a firm Q2 window.
- **Run as a lighter retainer extension** — rejected because the scope is genuinely new work, not continuation.

## Timeline

- 2026-04-08 — Hansen-Meier Q2 planning opportunity surfaced in retainer check-in
- 2026-04-12 — Team assembled, scope agreed, project proposal drafted
- 2026-04-15 — Project page created; engagement history updated
- 2026-04-17 — Execution engine applied the project + history updates
`;

const FIXTURE_4_EXECUTION_SUMMARY = {
  completedAt: new Date().toISOString(),
  totalCostCents: 287,
  pagesModified: [
    "q2-strategic-planning-hansen-meier",
    "hansen-meier-engagement-history",
  ],
  skippedDownstream: [],
  failedDownstream: [],
};

const FIXTURE_4_PROPS = {
  status: "implemented",
  proposal_type: "project_creation",
  primary_deliverable: {
    type: "wiki_create",
    targetPageSlug: "q2-strategic-planning-hansen-meier",
    targetPageType: "project",
    title: "Q2 Strategic Planning Project with Hansen-Meier",
    description:
      "4-phase strategic planning engagement: Discovery, Diagnosis, Workshop (scope-lock checkpoint), Roadmap. Team: Sofie (Partner sponsor), Anders (Delivery lead), Maja (Strategy).",
    rationale:
      "Existing strategic-tier client, preapproved budget, firm Q2 window. Matches the firm's highest-margin engagement profile.",
    proposedContent: `## Client

Hansen-Meier Industri. See [[hansen-meier-engagement-history]] for relationship context.

## Team

- **Sofie Nielsen** — Partner, sponsor.
- **Anders Lund** — Delivery lead.
- **Maja Skov** — Strategy lead.

## Schedule

- Phase 1 (Discovery) — April 22 to May 2.
- Phase 2 (Diagnosis) — May 3 to May 20.
- Phase 3 (Workshop) — May 22. Checkpoint: scope lock.
- Phase 4 (Roadmap & handoff) — May 23 to June 13.

## Deliverables

- Diagnosis memo (end of Phase 2).
- Workshop materials and outcome record (Phase 3).
- Strategic roadmap and 12-month action plan (Phase 4).

## Budget

Strategic-tier envelope. Any scope change past the workshop checkpoint routes through the [[change-order-workflow]].`,
    proposedProperties: null,
  },
  downstream_effects: [
    {
      targetPageSlug: "hansen-meier-engagement-history",
      targetPageType: "document",
      changeType: "update",
      summary:
        "Add the Q2 strategic planning engagement to Hansen-Meier's relationship history with the new team composition.",
    },
  ],
  severity: "low",
  priority: "high",
  expected_impact: "high",
  effort_estimate: "large",
  execution_summary: FIXTURE_4_EXECUTION_SUMMARY,
};

// ── Fixture registry ─────────────────────────────────────────────────────────

interface Fixture {
  slug: string;
  title: string;
  dashboard: InitiativeDashboard;
  content: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: Record<string, any>;
}

const FIXTURES: Fixture[] = [
  {
    slug: "demo-proposed-process",
    title:
      "Recurring delivery delays on same project type — scope creep pattern detected",
    dashboard: FIXTURE_1_DASHBOARD,
    content: FIXTURE_1_CONTENT,
    properties: FIXTURE_1_PROPS,
  },
  {
    slug: "demo-dismissed-wiki",
    title:
      "Client portfolio margins below 20% threshold — tier strategy candidate",
    dashboard: FIXTURE_2_DASHBOARD,
    content: FIXTURE_2_CONTENT,
    properties: FIXTURE_2_PROPS,
  },
  {
    slug: "demo-concerns-system",
    title:
      "Monthly reporting automation — manual compilation consumes 38 hours per month",
    dashboard: FIXTURE_3_DASHBOARD,
    content: FIXTURE_3_CONTENT,
    properties: FIXTURE_3_PROPS,
  },
  {
    slug: "demo-implemented-project",
    title: "Client strategic planning engagement — new opportunity detected",
    dashboard: FIXTURE_4_DASHBOARD,
    content: FIXTURE_4_CONTENT,
    properties: FIXTURE_4_PROPS,
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const operator = await prisma.operator.findFirst();
  if (!operator) {
    console.error(
      "No operator found. Run `npm run setup` or `npx tsx src/lib/seed.ts` first.",
    );
    process.exit(1);
  }
  const operatorId = operator.id;

  // 1. Remove the old fixture rows so the seeded set matches the spec exactly.
  const deleted = await prisma.knowledgePage.deleteMany({
    where: { operatorId, slug: { in: LEGACY_SLUGS } },
  });
  if (deleted.count > 0) {
    console.log(`Deleted ${deleted.count} legacy demo row(s): ${LEGACY_SLUGS.join(", ")}`);
  }

  const now = new Date();
  const basePageData = {
    operatorId,
    pageType: "initiative",
    scope: "operator",
    synthesisPath: "seed:demo-dashboard",
    synthesizedByModel: "seed-script",
    lastSynthesizedAt: now,
  };

  // 2. Validate each dashboard, then upsert.
  for (const fixture of FIXTURES) {
    // Self-check: every fixture must satisfy the live schema. Throw loudly
    // on failure so the script doubles as a schema self-check.
    const validation = InitiativeDashboardSchema.parse(fixture.dashboard);
    console.log(
      `✓ ${fixture.slug} — dashboard validated (${validation.cards.length} card${validation.cards.length === 1 ? "" : "s"})`,
    );

    const contentWithDashboard = injectDashboardSection(
      fixture.content,
      validation,
    );

    await prisma.knowledgePage.upsert({
      where: { operatorId_slug: { operatorId, slug: fixture.slug } },
      create: {
        ...basePageData,
        slug: fixture.slug,
        title: fixture.title,
        content: contentWithDashboard,
        properties: fixture.properties,
      },
      update: {
        title: fixture.title,
        content: contentWithDashboard,
        properties: fixture.properties,
        lastSynthesizedAt: now,
      },
    });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  console.log(
    `\nSeeded ${FIXTURES.length} demo initiatives for operator "${operator.displayName}" (${operatorId}):`,
  );
  for (const fixture of FIXTURES) {
    console.log(`  ${base}/initiatives?id=${fixture.slug}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
