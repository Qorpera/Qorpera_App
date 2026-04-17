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

const DASHBOARD_SLUG = "demo-dashboard-initiative";
const PROSE_SLUG = "demo-no-dashboard-initiative";

// ── Fixture: six cards, one per primitive ─────────────────────────────────────

const DEMO_DASHBOARD: InitiativeDashboard = {
  cards: [
    // impact_bar — span 12, range on projected, savings block, confidence medium
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
          summary: "38 hrs/mo averaged across 3 active engagements last quarter",
        },
        {
          ref: null,
          inferred: true,
          summary:
            "Modeled 60–80% reduction based on similar change-order rollouts in comparable consultancies",
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

    // entity_set — span 6, 4 entities incl. one bad, one with slug, confidence high
    {
      primitive: "entity_set",
      span: 6,
      claim: "4 engagements affected in the last 90 days",
      explanation:
        "Every overrun traces to a scope change that was never written into the contract. Ranked by unbilled hours.",
      confidence: "high",
      evidence: [
        {
          ref: "engagement-ledger",
          inferred: false,
          summary:
            "Time entries tagged 'scope-change' aggregated by engagement over 90 days",
        },
        {
          ref: null,
          inferred: true,
          summary:
            "Attribution of overrun hours to scope events is inferred from time-entry notes",
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
            name: "Nordso Logistik",
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

    // conceptual_diagram / tier_pyramid — span 6, 3 tiers, confidence low (dimmer)
    {
      primitive: "conceptual_diagram",
      span: 6,
      claim: "Engagements cluster into three scope-risk tiers",
      explanation:
        "Risk tier is a heuristic: size × variable-scope signals. Foundation tier contracts absorb most creep.",
      confidence: "low",
      evidence: [
        {
          ref: "engagement-ledger",
          inferred: false,
          summary: "Engagement ledger with scope-change classification",
        },
        {
          ref: null,
          inferred: true,
          summary:
            "Tier thresholds are a working hypothesis — insufficient sample for confidence",
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

    // process_flow — span 12, 5 steps, one checkpoint with note, confidence medium
    {
      primitive: "process_flow",
      span: 12,
      claim: "5-step change-order workflow with client-signature checkpoint",
      explanation:
        "Signature at step 3 is the binding checkpoint — no expansion work begins without it.",
      confidence: "medium",
      evidence: [
        {
          ref: "change-order-workflow",
          inferred: false,
          summary: "Proposed workflow specification attached to this initiative",
        },
        {
          ref: null,
          inferred: true,
          summary:
            "Step ordering and checkpoint placement follow proposal-engineering norms",
        },
      ],
      data: {
        steps: [
          { label: "Identify" },
          { label: "Quantify" },
          { label: "Client approval", checkpoint: true, note: "Signature" },
          { label: "Invoice update" },
          { label: "Track" },
        ],
      },
    },

    // automation_loop — span 12, 4 nodes, with annotation, confidence medium
    {
      primitive: "automation_loop",
      span: 12,
      claim: "Monthly scope-delta digest to engagement leads",
      explanation:
        "Automation watches the time ledger for unbilled scope hours and nudges leads monthly.",
      confidence: "medium",
      evidence: [
        {
          ref: "automation-blueprint",
          inferred: false,
          summary: "Draft automation blueprint for the scope-delta reminder",
        },
        {
          ref: null,
          inferred: true,
          summary:
            "Send cadence of 1st-of-month chosen to align with invoice review",
        },
      ],
      data: {
        annotation:
          "Runs in supervised mode for the first 2 cycles, then promotes to notify mode after operator approval.",
        nodes: [
          {
            icon: "trigger",
            title: "Trigger",
            sub: "1st of month\n09:00 CET",
          },
          {
            icon: "fetch",
            title: "Fetch",
            sub: "Query time entries\nflagged 'scope-change'",
          },
          {
            icon: "compose",
            title: "Compose",
            sub: "Per-engagement digest\nwith totals + outliers",
          },
          {
            icon: "notify",
            title: "Notify",
            sub: "Email engagement\nleads + partner",
          },
        ],
      },
    },

    // trend_or_distribution / sparkline — span 6, 12 points, warn flag, confidence medium
    {
      primitive: "trend_or_distribution",
      span: 6,
      claim: "Unbilled scope hours trending up 12 months running",
      explanation:
        "The monthly total has doubled since last spring. Warning tint reflects the trajectory.",
      confidence: "medium",
      evidence: [
        {
          ref: "engagement-ledger",
          inferred: false,
          summary: "Monthly unbilled-hours aggregate from the engagement ledger",
        },
        {
          ref: null,
          inferred: true,
          summary:
            "Trend classification ('rising') is a visual read of the 12-month series",
        },
      ],
      data: {
        kind: "sparkline",
        headlineValue: 38,
        headlineUnit: "hrs",
        deltaLabel: "↑ from 20",
        flag: "warn",
        points: [20, 22, 19, 24, 26, 25, 29, 31, 30, 34, 36, 38],
        xAxisStart: "Apr 2025",
        xAxisEnd: "Mar 2026",
      },
    },
  ],
};

// ── Prose content shared by both initiatives ──────────────────────────────────

const PROSE_CONTENT = `## Trigger

Scanner detected scope creep across 4 active engagements.

## Evidence

- [[scope-creep-analysis]]: 38 hrs/mo lost to unbilled work
- [[engagement-ledger]]: affected engagements listed

## Investigation

Contracts run discovery at kickoff but don't include a change-order gate. When mid-engagement expansion requests arrive, delivery absorbs the extra hours as goodwill. Over the last 90 days this cost the partnership ~180 hours of unbilled capacity.

## Proposal

Introduce a mandatory change-order checkpoint before any scope addition lands on a developer's plate. The checkpoint is a single form that quantifies the ask, requires a client signature, and updates the invoice.

## Primary Deliverable

A new step in the contract workflow: any scope addition above 4 hours of estimated effort must be quantified, signed, and invoiced before work begins.

## Downstream Effects

- The scope-delta analyser needs to learn the new "change-order" status.
- The invoicing pipeline needs a new line-item category.
- Engagement leads need a 10-minute training on the form.

## Impact Assessment

Expected to recover 60–80% of unbilled scope hours (22–30 hrs/mo across current portfolio). The intervention is reversible — if clients push back, we can soften the signature step to acknowledgement.

## Alternatives Considered

1. **Raise engagement hourly rates** — blunt instrument; penalizes clients who don't scope-creep.
2. **Tighten discovery** — the bloat comes mid-engagement, not at kickoff.
3. **Absorb and report quarterly** — status quo; produces visibility but no recovery.

## Timeline

- Week 1: draft change-order form, review with operations.
- Week 2: update contract templates.
- Week 3: pilot on 1 active engagement.
- Week 4: roll out across all engagements.
`;

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Self-check: the fixture must validate against the live schema (including
  // the .max() bounds added in Phase 1). Fail loudly if the fixture drifted.
  const validation = InitiativeDashboardSchema.safeParse(DEMO_DASHBOARD);
  if (!validation.success) {
    console.error("Fixture does not satisfy InitiativeDashboardSchema:");
    console.error(JSON.stringify(validation.error.format(), null, 2));
    process.exit(1);
  }

  const operator = await prisma.operator.findFirst();
  if (!operator) {
    console.error(
      "No operator found. Run `npm run setup` or `npx tsx src/lib/seed.ts` first.",
    );
    process.exit(1);
  }
  const operatorId = operator.id;

  const withDashboard = injectDashboardSection(PROSE_CONTENT, validation.data);
  const now = new Date();

  const dashboardProps = {
    status: "proposed",
    proposal_type: "general",
  };

  const basePageData = {
    operatorId,
    pageType: "initiative",
    scope: "operator",
    synthesisPath: "seed:demo-dashboard",
    synthesizedByModel: "seed-script",
    lastSynthesizedAt: now,
  };

  await prisma.knowledgePage.upsert({
    where: { operatorId_slug: { operatorId, slug: DASHBOARD_SLUG } },
    create: {
      ...basePageData,
      slug: DASHBOARD_SLUG,
      title: "Demo: All six dashboard primitives",
      content: withDashboard,
      properties: dashboardProps,
    },
    update: {
      title: "Demo: All six dashboard primitives",
      content: withDashboard,
      properties: dashboardProps,
      lastSynthesizedAt: now,
    },
  });

  await prisma.knowledgePage.upsert({
    where: { operatorId_slug: { operatorId, slug: PROSE_SLUG } },
    create: {
      ...basePageData,
      slug: PROSE_SLUG,
      title: "Demo: Prose-only initiative (no dashboard)",
      content: PROSE_CONTENT,
      properties: dashboardProps,
    },
    update: {
      title: "Demo: Prose-only initiative (no dashboard)",
      content: PROSE_CONTENT,
      properties: dashboardProps,
      lastSynthesizedAt: now,
    },
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  console.log(`Seeded demo initiatives for operator "${operator.displayName}" (${operatorId}).`);
  console.log(`  ${base}/initiatives?id=${DASHBOARD_SLUG}`);
  console.log(`  ${base}/initiatives?id=${PROSE_SLUG}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
