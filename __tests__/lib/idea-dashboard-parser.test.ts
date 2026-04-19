import { describe, it, expect } from "vitest";
import { parseIdeaPage } from "@/lib/idea-page-parser";
import { injectDashboardSection } from "@/lib/idea-reasoning";
import { IdeaReasoningOutputSchema } from "@/lib/reasoning-types";
import type {
  IdeaDashboard,
  DashboardCard,
} from "@/lib/idea-dashboard-types";

// ── Fixtures ────────────────────────────────────────────────────────────────

const impactBarCard: DashboardCard = {
  primitive: "impact_bar",
  span: 12,
  claim: "60-80% fewer unbudgeted hours per engagement",
  explanation:
    "Scope additions currently proceed without estimate or client signature. A change-order checkpoint converts informal expansion into budgeted work.",
  confidence: "medium",
  evidence: [
    {
      ref: "scope-creep-analysis",
      inferred: false,
      summary: "38 hrs/month averaged across 3 engagements",
    },
  ],
  data: {
    baseline: { typicalValue: 38, unit: "hrs/mo" },
    projected: {
      typicalValue: 12,
      range: { low: 8, high: 15 },
      unit: "hrs/mo",
    },
  },
};

const entitySetCard: DashboardCard = {
  primitive: "entity_set",
  span: 6,
  claim: "3 engagements affected in the last 90 days",
  explanation:
    "All three overruns trace back to a scope change never written into the contract.",
  confidence: "high",
  evidence: [
    {
      ref: "engagement-ledger",
      inferred: false,
      summary: "Time entries tagged as scope-change hours",
    },
  ],
  data: {
    entities: [
      {
        name: "Hansen-Meier Industri",
        slug: "hansen-meier",
        flag: "warn",
        metric: "+82 hrs",
        metricFlag: "bad",
      },
      {
        name: "Nordso Logistik",
        slug: "nordso-logistik",
        flag: "warn",
        metric: "+54 hrs",
        metricFlag: "bad",
      },
    ],
  },
};

const processFlowCard: DashboardCard = {
  primitive: "process_flow",
  span: 12,
  claim: "6-step workflow with 2 mandatory checkpoints",
  explanation:
    "Client signature on step 4 is the binding checkpoint — work cannot begin on the expansion without it.",
  confidence: "high",
  evidence: [
    {
      ref: "change-order-workflow",
      inferred: false,
      summary: "Workflow specification being proposed",
    },
  ],
  data: {
    steps: [
      { label: "Identify" },
      { label: "Quantify" },
      { label: "Internal review", checkpoint: true, note: "Checkpoint" },
      { label: "Client approval", checkpoint: true, note: "Signature" },
      { label: "Invoice update" },
      { label: "Track" },
    ],
  },
};

const basePageContent = `## Trigger

Scanner detected scope creep across 3 engagements.

## Evidence

- [[scope-creep]]: 38 hrs/mo lost to unbilled work

## Investigation

Contracts lack a change-order process.

## Proposal

Introduce a mandatory checkpoint.`;

// ── Test suite 1: happy path round-trip ─────────────────────────────────────

describe("dashboard round-trip: happy path", () => {
  it("preserves a 3-card dashboard through inject + parse", () => {
    const dashboard: IdeaDashboard = {
      cards: [impactBarCard, entitySetCard, processFlowCard],
    };

    const enrichedContent = injectDashboardSection(basePageContent, dashboard);
    const parsed = parseIdeaPage(enrichedContent);

    expect(parsed.dashboard.cards).toEqual(dashboard.cards);
    expect(parsed.dashboard.failedCards).toEqual([]);
    expect(parsed.dashboard.fallback).toBeNull();
    expect(parsed.dashboard.parseError).toBeNull();
  });

  it("preserves a 1-card dashboard through inject + parse", () => {
    const dashboard: IdeaDashboard = { cards: [impactBarCard] };

    const enrichedContent = injectDashboardSection(basePageContent, dashboard);
    const parsed = parseIdeaPage(enrichedContent);

    expect(parsed.dashboard.cards).toEqual([impactBarCard]);
    expect(parsed.dashboard.failedCards).toEqual([]);
    expect(parsed.dashboard.fallback).toBeNull();
    expect(parsed.dashboard.parseError).toBeNull();
  });

  it("preserves a prose_only fallback dashboard through inject + parse", () => {
    const dashboard: IdeaDashboard = {
      cards: [],
      fallback: "prose_only",
    };

    const enrichedContent = injectDashboardSection(basePageContent, dashboard);
    const parsed = parseIdeaPage(enrichedContent);

    expect(parsed.dashboard.cards).toEqual([]);
    expect(parsed.dashboard.failedCards).toEqual([]);
    expect(parsed.dashboard.fallback).toBe("prose_only");
    expect(parsed.dashboard.parseError).toBeNull();
  });
});

// ── Test suite 2: no dashboard section ──────────────────────────────────────

describe("dashboard parse: no section", () => {
  it("returns an empty-but-valid ParsedDashboard when the page has no ## Dashboard section", () => {
    const parsed = parseIdeaPage(basePageContent);

    expect(parsed.dashboard.cards).toEqual([]);
    expect(parsed.dashboard.failedCards).toEqual([]);
    expect(parsed.dashboard.fallback).toBeNull();
    expect(parsed.dashboard.parseError).toBeNull();
  });
});

// ── Test suite 3: malformed JSON ────────────────────────────────────────────

describe("dashboard parse: malformed json", () => {
  it("reports parseError starting with 'invalid json' when JSON is broken", () => {
    const content = `## Trigger

something

## Dashboard

\`\`\`json
{ not valid json
\`\`\`

## Investigation

prose`;

    const parsed = parseIdeaPage(content);

    expect(parsed.dashboard.parseError).not.toBeNull();
    expect(parsed.dashboard.parseError?.startsWith("invalid json")).toBe(true);
    expect(parsed.dashboard.cards).toEqual([]);
  });
});

// ── Test suite 4: missing json block ────────────────────────────────────────

describe("dashboard parse: no json block", () => {
  it("reports parseError 'no json block in dashboard section' when the section contains only prose", () => {
    const content = `## Trigger

t

## Dashboard

some prose here, no code block

## Investigation

prose`;

    const parsed = parseIdeaPage(content);

    expect(parsed.dashboard.parseError).toBe(
      "no json block in dashboard section",
    );
    expect(parsed.dashboard.cards).toEqual([]);
  });
});

// ── Test suite 5: per-card graceful failure ─────────────────────────────────

describe("dashboard parse: per-card graceful failure", () => {
  it("keeps valid cards and collects failures when one card has an invalid primitive", () => {
    const rawJson = {
      cards: [
        impactBarCard,
        {
          primitive: "frobnicator",
          span: 6,
          claim: "A claim that should survive to failedCards.claim",
          explanation: "An explanation that should survive to failedCards.explanation",
          confidence: "high",
          evidence: [],
          data: {},
        },
        entitySetCard,
      ],
    };

    const content = `## Trigger

t

## Dashboard

\`\`\`json
${JSON.stringify(rawJson, null, 2)}
\`\`\`

## Investigation

prose`;

    const parsed = parseIdeaPage(content);

    expect(parsed.dashboard.parseError).toBeNull();
    expect(parsed.dashboard.cards).toHaveLength(2);
    expect(parsed.dashboard.cards).toEqual([impactBarCard, entitySetCard]);
    expect(parsed.dashboard.failedCards).toHaveLength(1);
    expect(parsed.dashboard.failedCards[0].index).toBe(1);
    expect(parsed.dashboard.failedCards[0].claim).toBe(
      "A claim that should survive to failedCards.claim",
    );
    expect(parsed.dashboard.failedCards[0].explanation).toBe(
      "An explanation that should survive to failedCards.explanation",
    );
    expect(parsed.dashboard.failedCards[0].error.length).toBeGreaterThan(0);
  });

  it("keeps valid cards and collects failure when one card is missing the data field", () => {
    const rawJson = {
      cards: [
        impactBarCard,
        {
          primitive: "impact_bar",
          span: 12,
          claim: "Missing data field card — claim recovered",
          explanation: "Missing data field card — explanation recovered",
          confidence: "medium",
          evidence: [],
          // data intentionally omitted
        },
      ],
    };

    const content = `## Trigger

t

## Dashboard

\`\`\`json
${JSON.stringify(rawJson, null, 2)}
\`\`\`

## Investigation

prose`;

    const parsed = parseIdeaPage(content);

    expect(parsed.dashboard.parseError).toBeNull();
    expect(parsed.dashboard.cards).toEqual([impactBarCard]);
    expect(parsed.dashboard.failedCards).toHaveLength(1);
    expect(parsed.dashboard.failedCards[0].claim).toBe(
      "Missing data field card — claim recovered",
    );
    expect(parsed.dashboard.failedCards[0].explanation).toBe(
      "Missing data field card — explanation recovered",
    );
    expect(parsed.dashboard.failedCards[0].error.length).toBeGreaterThan(0);
  });
});

// ── Test suite 6: section ordering ──────────────────────────────────────────

describe("injectDashboardSection: section ordering", () => {
  it("places ## Dashboard between ## Evidence and ## Investigation", () => {
    const dashboard: IdeaDashboard = { cards: [impactBarCard] };
    const result = injectDashboardSection(basePageContent, dashboard);

    const evidenceIdx = result.indexOf("## Evidence");
    const dashboardIdx = result.indexOf("## Dashboard");
    const investigationIdx = result.indexOf("## Investigation");

    expect(evidenceIdx).toBeGreaterThanOrEqual(0);
    expect(dashboardIdx).toBeGreaterThanOrEqual(0);
    expect(investigationIdx).toBeGreaterThanOrEqual(0);
    expect(evidenceIdx).toBeLessThan(dashboardIdx);
    expect(dashboardIdx).toBeLessThan(investigationIdx);

    // Spacing regex: Dashboard heading must be preceded by exactly one blank line
    // and followed by exactly one blank line before the fenced JSON starts.
    expect(result).toMatch(/\n\n## Dashboard\n\n```json\n/);
  });

  it("appends ## Dashboard at the end when ## Investigation is absent", () => {
    const dashboard: IdeaDashboard = { cards: [impactBarCard] };
    const contentWithoutInvestigation = `## Trigger

t

## Evidence

- bullet`;

    const result = injectDashboardSection(
      contentWithoutInvestigation,
      dashboard,
    );

    const dashboardIdx = result.indexOf("## Dashboard");
    expect(dashboardIdx).toBeGreaterThanOrEqual(0);
    // Dashboard is appended at the end — nothing of substance after the closing fence.
    const tailStart = result.lastIndexOf("```");
    expect(tailStart).toBeGreaterThan(dashboardIdx);
    expect(result.slice(tailStart + 3).trim()).toBe("");
  });
});

// ── Test suite 7: E2E roundtrip ─────────────────────────────────────────────

describe("E2E roundtrip: IdeaReasoningOutput → inject → parse", () => {
  it("preserves a 2-card dashboard (impact_bar + entity_set) through validate → inject → parse", () => {
    const impactBar: DashboardCard = {
      primitive: "impact_bar",
      span: 12,
      claim: "60-80% fewer unbudgeted hours per engagement",
      explanation:
        "Scope additions currently proceed without estimate or signature. A change-order checkpoint converts informal expansion into budgeted work.",
      confidence: "medium",
      evidence: [
        {
          ref: "scope-creep-analysis",
          inferred: false,
          summary: "38 hrs/mo averaged across 3 engagements",
        },
        {
          ref: null,
          inferred: true,
          summary:
            "Assumed 60-80% reduction based on similar playbook deployments",
        },
      ],
      data: {
        baseline: { typicalValue: 38, unit: "hrs/mo" },
        projected: {
          typicalValue: 12,
          range: { low: 8, high: 15 },
          unit: "hrs/mo",
        },
      },
    };

    const entitySet: DashboardCard = {
      primitive: "entity_set",
      span: 6,
      claim: "3 engagements affected in the last 90 days",
      explanation:
        "All three overruns trace back to scope changes that were never written into the contract.",
      confidence: "high",
      evidence: [
        {
          ref: "engagement-ledger",
          inferred: false,
          summary:
            "Time entries tagged as scope-change hours across the portfolio",
        },
      ],
      data: {
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
            slug: "nordso-logistik",
            flag: "warn",
            metric: "+54 hrs",
            metricFlag: "warn",
          },
        ],
      },
    };

    const output = {
      isValuable: true,
      pageContent:
        "## Trigger\n\nScope creep detected across engagements.\n\n## Investigation\n\nContracts lack a change-order process.\n\n## Proposal\n\nIntroduce a mandatory checkpoint.",
      properties: { status: "proposed" as const },
      primaryDeliverable: null,
      dashboard: { cards: [impactBar, entitySet] },
    };

    const validated = IdeaReasoningOutputSchema.safeParse(output);
    expect(validated.success).toBe(true);
    if (!validated.success) return;

    const baseContent = `## Evidence

- [[scope-creep]]: 38 hrs/mo lost to unbilled work

## Investigation

Contracts lack a change-order process.`;

    const injected = injectDashboardSection(
      baseContent,
      validated.data.dashboard!,
    );
    const parsed = parseIdeaPage(injected);

    expect(parsed.dashboard.cards).toEqual(output.dashboard.cards);
    expect(parsed.dashboard.parseError).toBeNull();
    expect(parsed.dashboard.failedCards).toHaveLength(0);
  });
});
