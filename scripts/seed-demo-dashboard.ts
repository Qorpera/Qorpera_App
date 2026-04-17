import { PrismaClient } from "@prisma/client";
import {
  InitiativeDashboardSchema,
  type InitiativeDashboard,
} from "@/lib/initiative-dashboard-types";
import { injectDashboardSection } from "@/lib/initiative-reasoning";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run demo dashboard update script in production.");
  console.error(
    "This script performs updates on seeded Demo Company initiatives.",
  );
  process.exit(1);
}

const prisma = new PrismaClient();

// Rows an earlier iteration of this script created under the wrong operator.
// They are dead data — deleted every run regardless of operator so the DB
// stays tidy if the script is re-run after operator drift.
const ORPHAN_SLUGS = [
  "demo-proposed-process",
  "demo-dismissed-wiki",
  "demo-concerns-system",
  "demo-implemented-project",
];

// Strips an existing `## Dashboard ... ` JSON block so we can re-inject a
// fresh one. Matches exactly what `injectDashboardSection` writes.
const DASHBOARD_BLOCK_REGEX =
  /## Dashboard\s*\n\n```json\n[\s\S]*?\n```\n+/;

// ── Dashboard: init-scope-creep-process ──────────────────────────────────────

const DASHBOARD_SCOPE_CREEP: InitiativeDashboard = {
  cards: [
    {
      primitive: "impact_bar",
      span: 6,
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
  ],
};

// ── Dashboard: init-client-profitability ─────────────────────────────────────

const DASHBOARD_PROFITABILITY: InitiativeDashboard = {
  cards: [
    {
      primitive: "conceptual_diagram",
      span: 6,
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

// ── Dashboard: init-reporting-automation ─────────────────────────────────────

const DASHBOARD_REPORTING: InitiativeDashboard = {
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

// ── Dashboard → slug mapping ────────────────────────────────────────────────

interface DashboardUpdate {
  slug: string;
  dashboard: InitiativeDashboard;
}

const UPDATES: DashboardUpdate[] = [
  { slug: "init-scope-creep-process", dashboard: DASHBOARD_SCOPE_CREEP },
  { slug: "init-reporting-automation", dashboard: DASHBOARD_REPORTING },
  { slug: "init-client-profitability", dashboard: DASHBOARD_PROFITABILITY },
];

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Clean up orphaned demo-* rows from any prior seed attempts, under any
  // operator. They were never connected to a real Demo Company session.
  const orphaned = await prisma.knowledgePage.deleteMany({
    where: { slug: { in: ORPHAN_SLUGS } },
  });
  if (orphaned.count > 0) {
    console.log(
      `Cleaned up ${orphaned.count} orphaned demo-* rows from previous seed attempts.`,
    );
  }

  // 2. Find the Demo Company operator by anchoring on a known-seeded page.
  // Safer than displayName lookup (which can collide across reseeds).
  const anchorPage = await prisma.knowledgePage.findFirst({
    where: { slug: "init-scope-creep-process", pageType: "initiative" },
  });
  if (!anchorPage || !anchorPage.operatorId) {
    console.error("Anchor page 'init-scope-creep-process' not found.");
    console.error(
      "This script assumes the baseline Demo Company seed has already run and created the init-* initiatives.",
    );
    process.exit(1);
  }
  const demoOperatorId = anchorPage.operatorId;
  console.log(`Targeting Demo Company operator: ${demoOperatorId}`);

  // 3. Inject (or replace) the dashboard section on each target initiative.
  let updatedCount = 0;
  for (const { slug, dashboard } of UPDATES) {
    // Self-check: every dashboard must satisfy the live schema.
    InitiativeDashboardSchema.parse(dashboard);

    const page = await prisma.knowledgePage.findFirst({
      where: { slug, operatorId: demoOperatorId, pageType: "initiative" },
      select: { id: true, content: true },
    });
    if (!page) {
      console.warn(
        `⚠ ${slug} not found under operator ${demoOperatorId} — skipping`,
      );
      continue;
    }

    const alreadyHasDashboard = page.content.includes("## Dashboard");
    if (alreadyHasDashboard) {
      console.log(`  ${slug}: already has ## Dashboard section — replacing in place`);
    } else {
      console.log(`  ${slug}: injecting ## Dashboard section`);
    }

    const stripped = alreadyHasDashboard
      ? page.content.replace(DASHBOARD_BLOCK_REGEX, "")
      : page.content;
    const newContent = injectDashboardSection(stripped, dashboard);

    await prisma.knowledgePage.update({
      where: { id: page.id },
      data: { content: newContent },
    });

    console.log(
      `✓ ${slug} — dashboard injected (${dashboard.cards.length} cards)`,
    );
    updatedCount += 1;
  }

  console.log(
    `\nUpdated ${updatedCount} demo initiatives. Visit Demo Company /initiatives to verify dashboards render.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
