// ── Promo Demo Seed Runner ────────────────────────────────────────────
// Creates a demo-ready operator with pre-written wiki pages.
// Wiki-first: no Entity/Relationship records, no ExecutionPlan/Situation
// records. The situations list reads directly from KnowledgePage where
// pageType = "situation_instance".

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { encryptConfig } from "@/lib/config-encryption";
import { extractCrossReferences } from "@/lib/wiki-engine";
import { ALL_PROMO_PAGES } from "./seed-promo-pages";

// ── Config ────────────────────────────────────────────────────────────

const PROMO_COMPANY = {
  displayName: "Demo Company",
  companyName: "Demo Company",
  companyDomain: "company.dk",
};

const PROMO_ADMIN = {
  email: "demo@company.dk",
  name: "Anna Korsgaard",
  password: "demo1234",
  role: "admin",
  locale: "en",
  wikiPageSlug: "anna-korsgaard",
};

const PROMO_CONNECTORS: Array<{ provider: string; name: string; hoursAgo: number }> = [
  { provider: "google", name: "Google Workspace", hoursAgo: 2 },
  { provider: "microsoft", name: "Microsoft 365", hoursAgo: 3 },
  { provider: "hubspot", name: "HubSpot CRM", hoursAgo: 1 },
  { provider: "e-conomic", name: "e-conomic", hoursAgo: 4 },
  { provider: "slack", name: "Slack", hoursAgo: 2 },
  { provider: "jira", name: "Jira", hoursAgo: 6 },
];

const PROMO_SITUATION_TYPES: Array<{
  slug: string;
  name: string;
  description: string;
  detectedCount: number;
  confirmedCount: number;
}> = [
  {
    slug: "board-meeting-preparation",
    name: "Board Meeting Preparation",
    description:
      "Detected when a board meeting is scheduled within 5 days and no briefing document or agenda email has been prepared.",
    detectedCount: 3,
    confirmedCount: 3,
  },
  {
    slug: "client-inquiry-unanswered",
    name: "Client Inquiry Unanswered",
    description:
      "Detected when an inbound client email contains questions or action items and no response has been sent within 48 hours.",
    detectedCount: 7,
    confirmedCount: 6,
  },
  {
    slug: "monthly-report-deadline",
    name: "Monthly Report Deadline",
    description:
      "Detected when the monthly management reporting deadline is within 24 hours and no draft has been created.",
    detectedCount: 2,
    confirmedCount: 2,
  },
  {
    slug: "overdue-invoice-collection",
    name: "Overdue Invoice Collection",
    description:
      "Detected when invoices exceed payment terms by more than 14 days and the combined overdue amount exceeds 50K DKK.",
    detectedCount: 4,
    confirmedCount: 4,
  },
  {
    slug: "knowledge-transfer-required",
    name: "Knowledge Transfer Required",
    description:
      "Detected when an employee departure is confirmed and the departing person owns critical knowledge, relationships, or responsibilities that lack a documented successor.",
    detectedCount: 1,
    confirmedCount: 0,
  },
];

// ── Cleanup ───────────────────────────────────────────────────────────

/**
 * Remove any existing promo operator owned by the demo admin email.
 * Idempotent: safe to call when no existing operator exists.
 */
export async function cleanupPromoOperator(): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { email: PROMO_ADMIN.email },
    select: { operatorId: true },
  });
  if (!existing) return;

  const operatorId = existing.operatorId;

  await prisma.initiative.deleteMany({ where: { operatorId } });
  await prisma.knowledgePage.deleteMany({ where: { operatorId } });
  await prisma.situationType.deleteMany({ where: { operatorId } });
  await prisma.syncLog.deleteMany({ where: { connector: { operatorId } } });
  await prisma.sourceConnector.deleteMany({ where: { operatorId } });
  await prisma.orientationSession.deleteMany({ where: { operatorId } });
  await prisma.session.deleteMany({ where: { user: { operatorId } } });
  await prisma.user.deleteMany({ where: { operatorId } });
  await prisma.operator.delete({ where: { id: operatorId } });
}

// ── Helpers ───────────────────────────────────────────────────────────

function hoursAgoDate(h: number): Date {
  return new Date(Date.now() - h * 3_600_000);
}

function daysAgoDate(d: number): Date {
  return new Date(Date.now() - d * 86_400_000);
}

// ── Main Seed Function ────────────────────────────────────────────────

export async function runPromoSeed(operatorId: string) {
  // ─── User + Session + OrientationSession ──────────────────────────
  const pwHash = await hashPassword(PROMO_ADMIN.password);

  const adminUser = await prisma.user.create({
    data: {
      operatorId,
      email: PROMO_ADMIN.email,
      name: PROMO_ADMIN.name,
      passwordHash: pwHash,
      role: PROMO_ADMIN.role,
      locale: PROMO_ADMIN.locale,
      emailVerified: true,
      wikiPageSlug: PROMO_ADMIN.wikiPageSlug,
    },
  });

  await createSession(adminUser.id);

  await prisma.orientationSession.create({
    data: {
      operatorId,
      phase: "active",
      completedAt: daysAgoDate(21),
    },
  });

  // ─── Source Connectors ────────────────────────────────────────────
  const encConfig = encryptConfig({ simulated: true });
  const connectorIds: Record<string, string> = {};
  for (const c of PROMO_CONNECTORS) {
    const connector = await prisma.sourceConnector.create({
      data: {
        operatorId,
        provider: c.provider,
        name: c.name,
        status: "active",
        healthStatus: "healthy",
        config: encConfig,
        lastSyncAt: hoursAgoDate(c.hoursAgo),
        lastHealthCheck: hoursAgoDate(c.hoursAgo),
      },
    });
    connectorIds[c.provider] = connector.id;
  }

  // ─── Situation Types ──────────────────────────────────────────────
  const sitTypeIds: Record<string, string> = {};
  for (const st of PROMO_SITUATION_TYPES) {
    const created = await prisma.situationType.create({
      data: {
        operatorId,
        slug: st.slug,
        name: st.name,
        description: st.description,
        detectionLogic: JSON.stringify({ mode: "promo" }),
        autonomyLevel: "supervised",
        enabled: true,
        detectedCount: st.detectedCount,
        confirmedCount: st.confirmedCount,
        wikiPageSlug: st.slug,
      },
    });
    sitTypeIds[st.slug] = created.id;
  }

  // ─── Wiki Pages (KnowledgePage) ───────────────────────────────────
  let pageCount = 0;
  const pagesByType: Record<string, number> = {};
  for (const page of ALL_PROMO_PAGES) {
    const crossReferences = extractCrossReferences(page.content);
    const contentTokens = Math.ceil(page.content.length / 4);

    // Situation pages carry their own confidence in properties; everything
    // else uses the standard seeded confidence.
    const propsConfidence = (page.properties as { confidence?: unknown }).confidence;
    const confidence =
      typeof propsConfidence === "number" && propsConfidence >= 0 && propsConfidence <= 1
        ? propsConfidence
        : 0.9;

    await prisma.knowledgePage.create({
      data: {
        operatorId,
        scope: "operator",
        visibility: "operator",
        pageType: page.pageType,
        slug: page.slug,
        title: page.title,
        content: page.content,
        contentTokens,
        crossReferences,
        properties: page.properties as unknown as Prisma.InputJsonValue,
        status: "verified",
        trustLevel: "established",
        confidence,
        synthesisPath: "onboarding",
        synthesizedByModel: "promo-seed",
        lastSynthesizedAt: new Date(),
        sources: [],
        sourceCount: 0,
        sourceTypes: [],
        version: 1,
      },
      select: { id: true },
    });

    pageCount++;
    pagesByType[page.pageType] = (pagesByType[page.pageType] ?? 0) + 1;
  }

  // ─── Initiatives (3 proposed) ────────────────────────────────────
  const initiativeCreatedAt = new Date(Date.now() - 2 * 86_400_000);
  const initiativeSeeds: Array<{
    proposalType: string;
    triggerSummary: string;
    evidence: Array<{ source: string; claim: string }>;
    proposal: { summary: string; actions: string[] };
    rationale: string;
    impactAssessment: string;
    ownerPageSlug: string;
    domainPageSlug: string;
  }> = [
    {
      proposalType: "strategy_revision",
      triggerSummary: "Client profitability below margin threshold on 3 engagements",
      evidence: [
        { source: "e-conomic + project tracking", claim: "Greenfield operational review: billed 420K, actual cost 390K — margin 7.1% vs 25% target" },
        { source: "e-conomic + project tracking", claim: "Meridian redesign: 40 hours unbudgeted scope creep, effective margin dropped to 11%" },
        { source: "e-conomic + project tracking", claim: "Northwave optimization: on track at 22% margin but below 25% threshold due to senior consultant rate" },
      ],
      proposal: {
        summary: "Three active engagements are operating below the 25% margin threshold. Recommend: (1) Renegotiate Meridian scope with formal change order to recover 40 unbudgeted hours, (2) Adjust Greenfield Phase 2 pricing to reflect actual delivery costs, (3) Review Northwave staffing mix — replace senior hours with mid-level where methodology is established.",
        actions: [
          "Draft change order for Meridian with 40-hour scope addition at standard rates",
          "Update Greenfield Phase 2 proposal pricing before renewal conversation",
          "Review Northwave resource allocation with Sofie Nielsen",
        ],
      },
      rationale: "Three engagements below margin threshold detected from cross-referencing billing data with project time tracking. Combined margin gap represents approximately 180K DKK in annual margin erosion if patterns continue to new engagements.",
      impactAssessment: "Estimated margin recovery: 120-180K DKK annually. Meridian change order alone would recover 60K. No client relationship risk if handled as standard commercial process.",
      ownerPageSlug: "anna-korsgaard",
      domainPageSlug: "finance",
    },
    {
      proposalType: "process_creation",
      triggerSummary: "Monthly reporting costs 38 hours/month — 60% automatable",
      evidence: [
        { source: "Activity signals + calendar", claim: "Lars Eriksen spends ~6 hours/month on financial data gathering from e-conomic — data is available via connected API" },
        { source: "Activity signals + calendar", claim: "Sofie Nielsen spends ~3 hours/month compiling project status — data exists in project tracking and wiki" },
        { source: "Activity signals + calendar", claim: "Martin Bach spends ~3 hours/month on pipeline summary — data is current in HubSpot connector" },
        { source: "Wiki process page", claim: "Monthly reporting process page documents 12 hours total effort, 2 of last 4 reports delivered late" },
      ],
      proposal: {
        summary: "The monthly management report consumes 38 hours/month across 3 people (12 hours direct + 26 hours of coordination and waiting). 60% of the effort is manual data gathering from systems that are already connected to Qorpera. Propose creating an automated report compilation system job that pulls financial, project, and pipeline data and generates a draft report for human review.",
        actions: [
          "Create a system job that runs on the 8th of each month",
          "Auto-compile financial summary from e-conomic connector",
          "Auto-compile project status from wiki and delivery data",
          "Auto-compile pipeline summary from HubSpot connector",
          "Generate draft report in standard format for Lars to review",
        ],
      },
      rationale: "Pattern detected: same 3 people manually gather data from the same 4 connected systems every month. The data gathering is fully automatable — only the analysis commentary requires human judgment. Current process causes consistent delays (50% late delivery rate).",
      impactAssessment: "Time savings: ~23 hours/month (60% of 38 hours). Reliability improvement: reports delivered on time every month. Cost savings: approximately 28K DKK/month in recovered productive hours.",
      ownerPageSlug: "lars-eriksen",
      domainPageSlug: "finance",
    },
    {
      proposalType: "process_creation",
      triggerSummary: "Recurring delivery delays on same project type — scope creep pattern detected",
      evidence: [
        { source: "Situation history", claim: "Meridian redesign delayed 8 days due to UX scope additions approved without change order" },
        { source: "Historical project data", claim: "2 of 3 website/digital projects in the last 12 months experienced similar scope creep in the UX phase" },
        { source: "Wiki process analysis", claim: "No formal change order process exists — scope additions are approved verbally by project managers" },
      ],
      proposal: {
        summary: "Website and digital projects consistently experience scope creep during the UX phase, causing delivery delays. The root cause is the absence of a formal change order process — project managers approve client scope additions without documenting cost or timeline impact. Propose implementing a mandatory change order workflow: any scope addition must be documented with hours estimate, timeline impact, and client sign-off before work begins.",
        actions: [
          "Create a change order template and process page in the wiki",
          "Add a scope change checkpoint to the project delivery process",
          "Brief project managers (Thomas Wind, Sofie Nielsen) on the new workflow",
          "Retroactively apply to Meridian engagement — draft change order for the 40 unbudgeted hours",
        ],
      },
      rationale: "Pattern detected across 3 projects over 12 months: UX-phase scope creep without formal change orders leads to delivery delays and margin erosion. The Meridian case is the latest instance of a recurring pattern, not an isolated incident.",
      impactAssessment: "Expected reduction in delivery delays: 60-80% for affected project types. Margin protection: prevents unbudgeted scope additions (estimated 40-80 hours per project). No client friction — change orders are standard commercial practice.",
      ownerPageSlug: "sofie-nielsen",
      domainPageSlug: "delivery",
    },
  ];

  for (const init of initiativeSeeds) {
    await prisma.initiative.create({
      data: {
        operatorId,
        proposalType: init.proposalType,
        triggerSummary: init.triggerSummary,
        evidence: init.evidence as unknown as Prisma.InputJsonValue,
        proposal: init.proposal as unknown as Prisma.InputJsonValue,
        status: "proposed",
        rationale: init.rationale,
        impactAssessment: init.impactAssessment,
        ownerPageSlug: init.ownerPageSlug,
        domainPageSlug: init.domainPageSlug,
        createdAt: initiativeCreatedAt,
      },
    });
  }

  // ─── Return Stats ─────────────────────────────────────────────────
  return {
    success: true,
    operator: {
      id: operatorId,
      companyName: PROMO_COMPANY.companyName,
      companyDomain: PROMO_COMPANY.companyDomain,
    },
    credentials: {
      admin: {
        email: PROMO_ADMIN.email,
        password: PROMO_ADMIN.password,
        name: PROMO_ADMIN.name,
        role: PROMO_ADMIN.role,
      },
    },
    stats: {
      users: 1,
      connectors: PROMO_CONNECTORS.length,
      situationTypes: PROMO_SITUATION_TYPES.length,
      wikiPages: pageCount,
      pagesByType,
      initiatives: initiativeSeeds.length,
    },
    ids: {
      adminUserId: adminUser.id,
      connectorIds,
      sitTypeIds,
    },
  };
}
