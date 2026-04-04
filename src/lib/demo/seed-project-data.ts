// ── Static Project Seed ─────────────────────────────────────────────────
// Creates a pre-built DD project with 12 deliverables, messages,
// notifications, and connectors. Uses actual operator users as team members.

import { prisma } from "@/lib/db";

// ── Cleanup for orphaned data from the old prisma/seed-projects.ts ──────

export async function cleanupBrokenProjectSeed(): Promise<void> {
  const brokenProject = await prisma.project.findUnique({
    where: { id: "proj-nordtech-dd" },
  });
  if (brokenProject) {
    await prisma.project.delete({ where: { id: "proj-nordtech-dd" } });
    console.log("[cleanup] Deleted orphaned project proj-nordtech-dd");
  }

  for (const email of ["sarah@example.com", "erik@example.com", "mia@example.com"]) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const hasSituations = await prisma.situation.count({
        where: { assignedUserId: user.id },
      });
      if (hasSituations === 0) {
        await prisma.user.delete({ where: { email } });
        console.log(`[cleanup] Deleted orphaned user ${email}`);
      } else {
        console.log(`[cleanup] Skipped ${email} — has associated data`);
      }
    }
  }
}

// ── Template sections ───────────────────────────────────────────────────

const TEMPLATE_SECTIONS = [
  { id: "revenue-quality", title: "Revenue Quality Assessment", order: 1, generationMode: "ai_generated" },
  { id: "ebitda-norm", title: "EBITDA Normalization", order: 2, generationMode: "ai_generated" },
  { id: "working-capital", title: "Working Capital Analysis", order: 3, generationMode: "ai_generated" },
  { id: "debt-liabilities", title: "Debt & Liabilities Review", order: 4, generationMode: "ai_generated" },
  { id: "customer-concentration", title: "Customer Concentration Analysis", order: 5, generationMode: "ai_generated" },
  { id: "contract-portfolio", title: "Contract Portfolio Review", order: 6, generationMode: "ai_generated" },
  { id: "employee-key-person", title: "Employee & Key Person Risk", order: 7, generationMode: "ai_generated" },
  { id: "tech-stack", title: "Technology Stack Assessment", order: 8, generationMode: "ai_generated" },
  { id: "tax-compliance", title: "Tax Compliance Review", order: 9, generationMode: "ai_generated" },
  { id: "regulatory-license", title: "Regulatory & License Audit", order: 10, generationMode: "ai_generated" },
  { id: "vendor-dependency", title: "Vendor Dependency Analysis", order: 11, generationMode: "ai_generated" },
  { id: "ip-patent", title: "IP & Patent Analysis", order: 12, generationMode: "ai_generated" },
];

// ── Deliverable content ─────────────────────────────────────────────────

const revenueContent = {
  sections: [
    { type: "heading", level: 2, text: "Revenue Quality Assessment" },
    { type: "heading", level: 3, text: "Executive Summary" },
    { type: "paragraph", text: "NordTech ApS generated DKK 47.2M in revenue for FY2025, representing 23% YoY growth. Revenue is split between recurring SaaS subscriptions (72%) and professional services (28%). The SaaS component shows strong net revenue retention of 118%, driven by upsell into the enterprise tier. Professional services revenue is primarily implementation and training, with declining contribution over the analysis period." },
    { type: "heading", level: 3, text: "Revenue Composition" },
    { type: "paragraph", text: "SaaS ARR stands at DKK 34.0M as of March 2026, up from DKK 27.6M twelve months prior. The company recognizes revenue ratably over subscription terms (typically 12-24 months). Professional services are recognized on a percentage-of-completion basis, though milestone documentation quality is inconsistent across engagements." },
    { type: "risk", severity: "high", text: "Risk 1 \u2014 Customer concentration: Top 3 customers account for 61% of total ARR (DKK 20.7M). Loss of any single top-3 customer would materially impact revenue trajectory and EBITDA." },
    { type: "evidence", text: "Evidence: e-conomic invoice data shows Maersk Logistics (DKK 9.2M), DSV Solutions (DKK 6.8M), and PostNord Danmark (DKK 4.7M) as top revenue contributors. Cross-referenced with HubSpot deal records." },
    { type: "risk", severity: "medium", text: "Risk 2 \u2014 Revenue recognition methodology: Professional services use percentage-of-completion but milestone documentation is inconsistent. 4 of 12 active projects lack formal milestone sign-offs, creating audit exposure." },
    { type: "evidence", text: "Evidence: Google Drive project folders reviewed. Missing milestone docs for projects PRJ-2025-08, PRJ-2025-11, PRJ-2026-01, PRJ-2026-03." },
    { type: "heading", level: 3, text: "Data Completeness" },
    { type: "completeness_ok", text: "Transaction data: 36 months of e-conomic data, complete" },
    { type: "completeness_ok", text: "Subscription records: All 127 active subscriptions verified against invoicing" },
    { type: "completeness_gap", text: "Contract documents: 47 of 49 customer contracts located (2 missing)" },
    { type: "completeness_gap", text: "Professional services milestones: 8 of 12 projects have complete documentation" },
  ],
};

const ebitdaContent = {
  sections: [
    { type: "heading", level: 2, text: "EBITDA Normalization" },
    { type: "heading", level: 3, text: "Executive Summary" },
    { type: "paragraph", text: "Reported EBITDA for FY2025 is DKK 8.4M (17.8% margin). After normalization adjustments totaling DKK 2.1M, adjusted EBITDA stands at DKK 10.5M (22.2% margin). Key adjustments include founder salary normalization, one-time legal costs, and non-recurring recruitment expenses." },
    { type: "completeness_ok", text: "P&L data: 36 months, complete and reconciled with e-conomic" },
    { type: "completeness_ok", text: "Adjustment documentation: All adjustments supported by source documents" },
  ],
};

const debtContent = {
  sections: [
    { type: "heading", level: 2, text: "Debt & Liabilities Review" },
    { type: "heading", level: 3, text: "Executive Summary" },
    { type: "paragraph", text: "Total outstanding debt is DKK 3.2M, consisting of a V\u00e6kstfonden growth loan (DKK 2.5M, maturing 2028) and a minor equipment lease (DKK 0.7M). No off-balance-sheet liabilities identified. Contingent liabilities are limited to standard warranty provisions." },
    { type: "completeness_ok", text: "Loan agreements: All reviewed and terms confirmed" },
    { type: "completeness_ok", text: "Contingent liabilities: Legal review complete, no material exposure" },
  ],
};

const employeeContent = {
  sections: [
    { type: "heading", level: 2, text: "Employee & Key Person Risk" },
    { type: "heading", level: 3, text: "Executive Summary" },
    { type: "paragraph", text: "NordTech has 38 FTEs. The CTO (co-founder) is a key-person risk \u2014 sole architect of the core routing engine. Two senior developers have single-threaded knowledge of critical integrations. Retention is strong (92% annual) but no non-compete or IP assignment clauses exist for 6 early employees." },
    { type: "risk", severity: "medium", text: "Risk 1 \u2014 Key person dependency: CTO holds undocumented knowledge of core routing algorithms. No succession plan or knowledge-base documentation exists." },
    { type: "completeness_ok", text: "Employee roster: Complete, verified against payroll data" },
    { type: "completeness_gap", text: "Employment contracts: 32 of 38 reviewed (6 early employees missing IP clauses)" },
  ],
};

const workingCapitalContent = {
  sections: [
    { type: "heading", level: 2, text: "Working Capital Analysis" },
    { type: "heading", level: 3, text: "Executive Summary" },
    { type: "paragraph", text: "Normalized working capital is DKK 4.8M. Seasonal Q4 inventory spikes (recurring pattern over 3 years) inflate reported WC by approximately DKK 1.2M. Accounts receivable DSO is 42 days, in line with industry. Deferred revenue of DKK 8.1M represents pre-paid annual subscriptions." },
    { type: "risk", severity: "low", text: "Risk 1 \u2014 Seasonal distortion: Q4 WC spike may affect purchase price adjustment if closing occurs in Q4." },
    { type: "completeness_ok", text: "Balance sheet data: 36 months, complete" },
    { type: "completeness_gap", text: "Aged receivables breakdown: Available for last 18 months only" },
  ],
};

const customerConcentrationContent = {
  sections: [
    { type: "heading", level: 2, text: "Customer Concentration Analysis" },
    { type: "heading", level: 3, text: "Executive Summary" },
    { type: "paragraph", text: "Top 3 customers represent 61% of ARR. Maersk Logistics alone accounts for 27%. Contract terms vary: Maersk is on a 3-year agreement (expires Dec 2027), DSV on annual renewal, PostNord on 2-year (expires Aug 2026). Churn among remaining customers is low (4% annual gross churn)." },
    { type: "risk", severity: "high", text: "Risk 1 \u2014 Maersk dependency: Single customer = 27% of revenue. Maersk is currently evaluating in-house logistics tooling per internal communications." },
    { type: "completeness_ok", text: "Customer revenue data: Complete, cross-referenced e-conomic and HubSpot" },
  ],
};

const contractContent = {
  sections: [
    { type: "heading", level: 2, text: "Contract Portfolio Review" },
    { type: "heading", level: 3, text: "Executive Summary" },
    { type: "paragraph", text: "49 active customer contracts reviewed. 47 located in data room. Standard terms include 90-day termination notice and auto-renewal. 3 enterprise contracts contain change-of-control clauses that may be triggered by the acquisition." },
    { type: "risk", severity: "high", text: "Risk 1 \u2014 Change-of-control clauses: 3 contracts (Maersk, DSV, GLS) include change-of-control provisions allowing termination within 30 days of ownership change." },
    { type: "risk", severity: "medium", text: "Risk 2 \u2014 Missing contract: Amendment referenced in contract #47 (June 2025) not found in data room." },
    { type: "risk", severity: "low", text: "Risk 3 \u2014 Non-standard pricing: 5 contracts have legacy pricing significantly below current list prices." },
    { type: "completeness_gap", text: "Contract documents: 47 of 49 located" },
  ],
};

function shortContent(title: string, summary: string) {
  return {
    sections: [
      { type: "heading", level: 2, text: title },
      { type: "heading", level: 3, text: "Executive Summary" },
      { type: "paragraph", text: summary },
    ],
  };
}

const taxContent = shortContent("Tax Compliance Review", "NordTech is compliant with Danish corporate tax obligations. Effective tax rate of 22.3% aligns with statutory rate. R&D tax credits properly documented. One minor VAT filing discrepancy in Q2 2025 identified and corrected.");
const regulatoryContent = shortContent("Regulatory & License Audit", "NordTech holds required data processing certifications (ISO 27001, GDPR DPA with all customers). Software licenses are current. Two items flagged: expired penetration testing certification (due for renewal) and incomplete DPIA for new AI routing feature.");
const vendorContent = shortContent("Vendor Dependency Analysis", "18 material vendor relationships reviewed. AWS hosting (DKK 1.8M/year) is the largest. No single-source dependencies identified for critical operations. All vendor contracts reviewed \u2014 standard commercial terms, no unusual lock-in provisions.");

// ── Completeness report builder ─────────────────────────────────────────

function makeCompletenessReport(stage: string, riskCount: number, confidence: string) {
  const isDeliverable = stage === "deliverable";
  return {
    sections: [
      { name: "Financial data", status: "complete", detail: "36 months of e-conomic transaction data ingested and reconciled", itemCount: 847, confidence: "high" as const },
      { name: "Customer contracts", status: isDeliverable ? "complete" : "partial", detail: isDeliverable ? "All 49 contracts reviewed" : "47 of 49 contracts located", itemCount: isDeliverable ? 49 : 47, confidence: isDeliverable ? "high" as const : "medium" as const },
      { name: "Document repository", status: "complete", detail: "234 documents from Google Drive analyzed", itemCount: 234, confidence: "high" as const },
      { name: "CRM records", status: "complete", detail: "340 HubSpot records cross-referenced", itemCount: 340, confidence: "high" as const },
    ],
    contradictions: [],
    overallConfidence: confidence,
    analyzedSources: isDeliverable ? 4 : 3,
    totalSources: 4,
    coveragePercent: isDeliverable ? 100 : stage === "workboard" ? 85 : 70,
  };
}

// ── Messages ────────────────────────────────────────────────────────────

const MESSAGE_TEMPLATES = [
  "Revenue recognition methodology \u2014 section 3.2. I disagree with the approach on deferred revenue. The target uses percentage-of-completion for professional services but their milestone documentation is inconsistent.",
  "Client clarification on earn-out structure. Got confirmation from NordTech CFO \u2014 the earn-out is tied to ARR targets over 24 months post-close, not EBITDA as initially documented.",
  "Working capital \u2014 seasonal adjustment needed. The Q4 inventory spike is recurring (3 consecutive years). We should normalize for seasonality in the WC analysis.",
  "Contract #47 \u2014 missing amendment. The referenced amendment from June 2025 is not in the data room. I\u2019ve asked the target company to provide it. Flagging for the contract portfolio review.",
  "Customer concentration risk flag. Top 3 customers = 61% of revenue. This exceeds our 40% threshold. Recommend we model churn scenarios for the executive summary.",
  "Pending lawsuits \u2014 found references to two additional claims not in the legal folder. One appears to be an employment dispute, the other a vendor contract disagreement. Need legal to assess materiality.",
];

// ── Main seed function ──────────────────────────────────────────────────

export async function seedProjectData(
  operatorId: string,
  options?: {
    projectType?: string;
    targetCompanyName?: string;
  },
): Promise<{ projectId: string; deliverableCount: number }> {
  const targetName = options?.targetCompanyName ?? "NordTech ApS";
  const prefix = operatorId.slice(0, 8);
  const projectId = `proj-${prefix}-dd`;

  console.log(`[seed-project] Seeding project data for operator ${operatorId}...`);

  // ── Find operator users ───────────────────────────────────────────

  const admins = await prisma.user.findMany({
    where: { operatorId, role: { in: ["admin", "superadmin"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  const members = await prisma.user.findMany({
    where: { operatorId, role: "member" },
    orderBy: { createdAt: "asc" },
    take: 2,
    select: { id: true, name: true },
  });

  if (admins.length === 0) {
    throw new Error("[seed-project] No admin users found for operator");
  }

  const owner = admins[0];
  const reviewer = admins[1] ?? members[0] ?? owner;
  const analyst1 = members[0] ?? owner;
  const analyst2 = members[1] ?? reviewer;

  // Role assignment order for messages: reviewer, analyst1, owner, analyst2, reviewer, analyst1
  const messageUserOrder = [reviewer, analyst1, owner, analyst2, reviewer, analyst1];

  // ── Upsert template ───────────────────────────────────────────────

  await prisma.projectTemplate.upsert({
    where: { id: "tmpl-buyside-dd" },
    create: {
      id: "tmpl-buyside-dd",
      operatorId: null,
      name: "Buy-Side Due Diligence",
      category: "financial",
      description: "Comprehensive analysis of a target company for acquisition. Covers financial, commercial, legal, operational, and HR dimensions.",
      analysisFramework: TEMPLATE_SECTIONS,
      dataExpectations: [
        { provider: "economic", label: "Accounting system (e-conomic, Dinero, Billy)", required: true },
        { provider: "google-drive", label: "Document repository", required: true },
        { provider: "hubspot", label: "CRM system", required: false },
        { provider: "shopify", label: "E-commerce platform", required: false },
      ],
    },
    update: {},
  });

  // ── Upsert project ────────────────────────────────────────────────

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 16);

  await prisma.project.upsert({
    where: { id: projectId },
    create: {
      id: projectId,
      operatorId,
      templateId: "tmpl-buyside-dd",
      name: `Acquisition DD \u2014 ${targetName}`,
      description: `Buy-side due diligence on ${targetName}, a Danish SaaS company specializing in logistics management software.`,
      status: "active",
      createdById: owner.id,
      dueDate,
    },
    update: {},
  });

  // ── Clean + recreate members, messages, notifications, connectors ──

  await prisma.projectMessage.deleteMany({ where: { projectId } });
  await prisma.projectNotification.deleteMany({ where: { projectId } });
  await prisma.projectConnector.deleteMany({ where: { projectId } });
  await prisma.projectMember.deleteMany({ where: { projectId } });

  const memberDefs: Array<{ userId: string; role: string }> = [];
  const usedIds = new Set<string>();
  for (const m of [
    { userId: owner.id, role: "owner" },
    { userId: reviewer.id, role: "reviewer" },
    { userId: analyst1.id, role: "analyst" },
    { userId: analyst2.id, role: "analyst" },
  ]) {
    if (!usedIds.has(m.userId)) {
      memberDefs.push(m);
      usedIds.add(m.userId);
    }
  }

  for (const m of memberDefs) {
    await prisma.projectMember.create({
      data: { projectId, userId: m.userId, role: m.role, addedById: owner.id },
    });
  }

  // ── Upsert deliverables ───────────────────────────────────────────

  const deliverableDefs = [
    // Intelligence (5)
    { slug: "tech-stack", title: "Technology Stack Assessment", section: "tech-stack", stage: "intelligence", content: null, confidence: null, risks: 0, assignee: null, acceptor: null },
    { slug: "ip-patent", title: "IP & Patent Analysis", section: "ip-patent", stage: "intelligence", content: null, confidence: null, risks: 0, assignee: null, acceptor: null },
    { slug: "tax-compliance", title: "Tax Compliance Review", section: "tax-compliance", stage: "intelligence", content: taxContent, confidence: "high", risks: 1, assignee: null, acceptor: null },
    { slug: "regulatory", title: "Regulatory & License Audit", section: "regulatory-license", stage: "intelligence", content: regulatoryContent, confidence: "medium", risks: 2, assignee: null, acceptor: null },
    { slug: "vendor", title: "Vendor Dependency Analysis", section: "vendor-dependency", stage: "intelligence", content: vendorContent, confidence: "high", risks: 0, assignee: null, acceptor: null },
    // Workboard (4)
    { slug: "revenue", title: "Revenue Quality Assessment", section: "revenue-quality", stage: "workboard", content: revenueContent, confidence: "high", risks: 2, assignee: reviewer, acceptor: null },
    { slug: "contract", title: "Contract Portfolio Review", section: "contract-portfolio", stage: "workboard", content: contractContent, confidence: "medium", risks: 3, assignee: analyst1, acceptor: null },
    { slug: "customer", title: "Customer Concentration Analysis", section: "customer-concentration", stage: "workboard", content: customerConcentrationContent, confidence: "high", risks: 1, assignee: owner, acceptor: null },
    { slug: "ebitda", title: "EBITDA Normalization", section: "ebitda-norm", stage: "workboard", content: ebitdaContent, confidence: "high", risks: 0, assignee: reviewer, acceptor: null },
    // Deliverable (3)
    { slug: "debt", title: "Debt & Liabilities Review", section: "debt-liabilities", stage: "deliverable", content: debtContent, confidence: "high", risks: 0, assignee: null, acceptor: owner },
    { slug: "employee", title: "Employee & Key Person Risk", section: "employee-key-person", stage: "deliverable", content: employeeContent, confidence: "high", risks: 1, assignee: null, acceptor: reviewer },
    { slug: "working-capital", title: "Working Capital Analysis", section: "working-capital", stage: "deliverable", content: workingCapitalContent, confidence: "medium", risks: 1, assignee: null, acceptor: owner },
  ];

  for (const d of deliverableDefs) {
    const delId = `del-${prefix}-${d.slug}`;
    const acceptedAt = d.acceptor ? new Date(Date.now() - Math.random() * 3 * 86400000) : null;

    await prisma.projectDeliverable.upsert({
      where: { id: delId },
      create: {
        id: delId,
        projectId,
        title: d.title,
        templateSectionId: d.section,
        stage: d.stage,
        generationMode: "ai_generated",
        content: d.content ?? undefined,
        confidenceLevel: d.confidence,
        riskCount: d.risks,
        assignedToId: d.assignee?.id ?? null,
        acceptedById: d.acceptor?.id ?? null,
        acceptedAt,
        completenessReport: d.content ? makeCompletenessReport(d.stage, d.risks, d.confidence ?? "medium") : undefined,
      },
      update: {},
    });
  }

  // ── Messages ──────────────────────────────────────────────────────

  for (let i = 0; i < MESSAGE_TEMPLATES.length; i++) {
    const user = messageUserOrder[i % messageUserOrder.length];
    await prisma.projectMessage.create({
      data: {
        projectId,
        userId: user.id,
        content: MESSAGE_TEMPLATES[i],
        createdAt: new Date(Date.now() - (MESSAGE_TEMPLATES.length - i) * 3600000),
      },
    });
  }

  // ── Notifications ─────────────────────────────────────────────────

  const notifications = [
    { type: "analysis_complete", content: "Technology stack assessment is 80% complete" },
    { type: "data_uploaded", content: "Client uploaded 3 new documents to data room" },
    { type: "risk_flagged", content: "High-risk flag: 2 contracts expire within 60 days" },
    { type: "deliverable_ready", content: "EBITDA normalization ready for acceptance" },
    { type: "stage_change", content: "Revenue quality assessment pulled into workboard" },
  ];

  for (let i = 0; i < notifications.length; i++) {
    await prisma.projectNotification.create({
      data: {
        projectId,
        type: notifications[i].type,
        content: notifications[i].content,
        createdAt: new Date(Date.now() - (notifications.length - i) * 7200000),
      },
    });
  }

  // ── Connectors (visual stubs) ─────────────────────────────────────

  const connectors = [
    { label: `${targetName} e-conomic`, provider: "economic", status: "synced", syncedItemCount: 847 },
    { label: `${targetName} Google Drive`, provider: "google-drive", status: "synced", syncedItemCount: 234 },
    { label: `${targetName} HubSpot`, provider: "hubspot", status: "synced", syncedItemCount: 340 },
    { label: `${targetName} Shopify`, provider: "shopify", status: "syncing", syncedItemCount: 0 },
  ];

  for (const c of connectors) {
    await prisma.projectConnector.create({
      data: { projectId, ...c },
    });
  }

  console.log(`[seed-project] Project ${projectId}: ${deliverableDefs.length} deliverables, ${MESSAGE_TEMPLATES.length} messages, ${notifications.length} notifications, ${connectors.length} connectors`);

  return { projectId, deliverableCount: deliverableDefs.length };
}
