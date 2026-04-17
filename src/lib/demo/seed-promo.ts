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
    },
    ids: {
      adminUserId: adminUser.id,
      connectorIds,
      sitTypeIds,
    },
  };
}
