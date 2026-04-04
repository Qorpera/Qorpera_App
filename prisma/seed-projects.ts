import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Projects data...");

  // Find first operator
  const operator = await prisma.operator.findFirst({ orderBy: { createdAt: "asc" } });
  if (!operator) throw new Error("No operator found. Run the main seed first.");
  const operatorId = operator.id;

  // Find first admin user
  const adminUser = await prisma.user.findFirst({
    where: { operatorId, role: { in: ["admin", "superadmin"] } },
    orderBy: { createdAt: "asc" },
  });
  if (!adminUser) throw new Error("No admin user found.");

  console.log(`Using operator: ${operator.displayName} (${operatorId})`);
  console.log(`Using admin: ${adminUser.name} (${adminUser.id})`);

  // ── Helper: find or create user ────────────────────────
  const passwordHash = await bcrypt.hash("Password1!", 12);

  async function findOrCreateUser(email: string, name: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return existing;
    return prisma.user.create({
      data: { operatorId, email, name, passwordHash, role: "member" },
    });
  }

  const sarah = await findOrCreateUser("sarah@example.com", "Sarah Mikkelsen");
  const erik = await findOrCreateUser("erik@example.com", "Erik Danielsen");
  const mia = await findOrCreateUser("mia@example.com", "Mia Lindberg");

  // ── ProjectTemplate (platform archetype) ───────────────
  const sections = [
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

  const template = await prisma.projectTemplate.upsert({
    where: { id: "tmpl-buyside-dd" },
    create: {
      id: "tmpl-buyside-dd",
      operatorId: null,
      name: "Buy-Side Due Diligence",
      category: "financial",
      description:
        "Comprehensive analysis of a target company for acquisition. Covers financial, commercial, legal, operational, and HR dimensions.",
      analysisFramework: sections,
      dataExpectations: [
        { provider: "economic", label: "Accounting system (e-conomic, Dinero, Billy)", required: true },
        { provider: "google-drive", label: "Document repository", required: true },
        { provider: "hubspot", label: "CRM system", required: false },
        { provider: "shopify", label: "E-commerce platform", required: false },
      ],
    },
    update: {},
  });
  console.log(`Template: ${template.name} (${template.id})`);

  // ── Project ────────────────────────────────────────────
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 16);

  const project = await prisma.project.upsert({
    where: { id: "proj-nordtech-dd" },
    create: {
      id: "proj-nordtech-dd",
      operatorId,
      templateId: template.id,
      name: "Acquisition DD \u2014 NordTech ApS",
      description: "Buy-side due diligence on NordTech ApS, a Danish SaaS company specializing in logistics management software.",
      status: "active",
      createdById: adminUser.id,
      dueDate,
    },
    update: {},
  });
  console.log(`Project: ${project.name} (${project.id})`);

  // ── ProjectMembers ─────────────────────────────────────
  const memberData = [
    { userId: adminUser.id, role: "owner" },
    { userId: sarah.id, role: "reviewer" },
    { userId: erik.id, role: "analyst" },
    { userId: mia.id, role: "analyst" },
  ];

  for (const m of memberData) {
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId: m.userId } },
      create: { projectId: project.id, userId: m.userId, role: m.role, addedById: adminUser.id },
      update: {},
    });
  }
  console.log(`Members: ${memberData.length} added`);

  // ── Deliverable content helpers ────────────────────────

  const revenueContent = {
    sections: [
      { type: "heading", level: 2, text: "Revenue Quality Assessment" },
      { type: "heading", level: 3, text: "Executive Summary" },
      {
        type: "paragraph",
        text: "NordTech ApS generated DKK 47.2M in revenue for FY2025, representing 23% YoY growth. Revenue is split between recurring SaaS subscriptions (72%) and professional services (28%). The SaaS component shows strong net revenue retention of 118%, driven by upsell into the enterprise tier. Professional services revenue is primarily implementation and training, with declining contribution over the analysis period.",
      },
      { type: "heading", level: 3, text: "Revenue Composition" },
      {
        type: "paragraph",
        text: "SaaS ARR stands at DKK 34.0M as of March 2026, up from DKK 27.6M twelve months prior. The company recognizes revenue ratably over subscription terms (typically 12-24 months). Professional services are recognized on a percentage-of-completion basis, though milestone documentation quality is inconsistent across engagements.",
      },
      {
        type: "risk",
        severity: "high",
        text: "Risk 1 \u2014 Customer concentration: Top 3 customers account for 61% of total ARR (DKK 20.7M). Loss of any single top-3 customer would materially impact revenue trajectory and EBITDA.",
      },
      {
        type: "evidence",
        text: "Evidence: e-conomic invoice data shows Maersk Logistics (DKK 9.2M), DSV Solutions (DKK 6.8M), and PostNord Danmark (DKK 4.7M) as top revenue contributors. Cross-referenced with HubSpot deal records.",
      },
      {
        type: "risk",
        severity: "medium",
        text: "Risk 2 \u2014 Revenue recognition methodology: Professional services use percentage-of-completion but milestone documentation is inconsistent. 4 of 12 active projects lack formal milestone sign-offs, creating audit exposure.",
      },
      {
        type: "evidence",
        text: "Evidence: Google Drive project folders reviewed. Missing milestone docs for projects PRJ-2025-08, PRJ-2025-11, PRJ-2026-01, PRJ-2026-03.",
      },
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
      {
        type: "paragraph",
        text: "Reported EBITDA for FY2025 is DKK 8.4M (17.8% margin). After normalization adjustments totaling DKK 2.1M, adjusted EBITDA stands at DKK 10.5M (22.2% margin). Key adjustments include founder salary normalization, one-time legal costs, and non-recurring recruitment expenses.",
      },
      { type: "completeness_ok", text: "P&L data: 36 months, complete and reconciled with e-conomic" },
      { type: "completeness_ok", text: "Adjustment documentation: All adjustments supported by source documents" },
    ],
  };

  const debtContent = {
    sections: [
      { type: "heading", level: 2, text: "Debt & Liabilities Review" },
      { type: "heading", level: 3, text: "Executive Summary" },
      {
        type: "paragraph",
        text: "Total outstanding debt is DKK 3.2M, consisting of a Vækstfonden growth loan (DKK 2.5M, maturing 2028) and a minor equipment lease (DKK 0.7M). No off-balance-sheet liabilities identified. Contingent liabilities are limited to standard warranty provisions.",
      },
      { type: "completeness_ok", text: "Loan agreements: All reviewed and terms confirmed" },
      { type: "completeness_ok", text: "Contingent liabilities: Legal review complete, no material exposure" },
    ],
  };

  const employeeContent = {
    sections: [
      { type: "heading", level: 2, text: "Employee & Key Person Risk" },
      { type: "heading", level: 3, text: "Executive Summary" },
      {
        type: "paragraph",
        text: "NordTech has 38 FTEs. The CTO (co-founder) is a key-person risk \u2014 sole architect of the core routing engine. Two senior developers have single-threaded knowledge of critical integrations. Retention is strong (92% annual) but no non-compete or IP assignment clauses exist for 6 early employees.",
      },
      {
        type: "risk",
        severity: "medium",
        text: "Risk 1 \u2014 Key person dependency: CTO holds undocumented knowledge of core routing algorithms. No succession plan or knowledge-base documentation exists.",
      },
      { type: "completeness_ok", text: "Employee roster: Complete, verified against payroll data" },
      { type: "completeness_gap", text: "Employment contracts: 32 of 38 reviewed (6 early employees missing IP clauses)" },
    ],
  };

  const workingCapitalContent = {
    sections: [
      { type: "heading", level: 2, text: "Working Capital Analysis" },
      { type: "heading", level: 3, text: "Executive Summary" },
      {
        type: "paragraph",
        text: "Normalized working capital is DKK 4.8M. Seasonal Q4 inventory spikes (recurring pattern over 3 years) inflate reported WC by approximately DKK 1.2M. Accounts receivable DSO is 42 days, in line with industry. Deferred revenue of DKK 8.1M represents pre-paid annual subscriptions.",
      },
      {
        type: "risk",
        severity: "low",
        text: "Risk 1 \u2014 Seasonal distortion: Q4 WC spike may affect purchase price adjustment if closing occurs in Q4.",
      },
      { type: "completeness_ok", text: "Balance sheet data: 36 months, complete" },
      { type: "completeness_gap", text: "Aged receivables breakdown: Available for last 18 months only" },
    ],
  };

  const customerConcentrationContent = {
    sections: [
      { type: "heading", level: 2, text: "Customer Concentration Analysis" },
      { type: "heading", level: 3, text: "Executive Summary" },
      {
        type: "paragraph",
        text: "Top 3 customers represent 61% of ARR. Maersk Logistics alone accounts for 27%. Contract terms vary: Maersk is on a 3-year agreement (expires Dec 2027), DSV on annual renewal, PostNord on 2-year (expires Aug 2026). Churn among remaining customers is low (4% annual gross churn).",
      },
      {
        type: "risk",
        severity: "high",
        text: "Risk 1 \u2014 Maersk dependency: Single customer = 27% of revenue. Maersk is currently evaluating in-house logistics tooling per internal communications.",
      },
      { type: "completeness_ok", text: "Customer revenue data: Complete, cross-referenced e-conomic and HubSpot" },
    ],
  };

  const contractContent = {
    sections: [
      { type: "heading", level: 2, text: "Contract Portfolio Review" },
      { type: "heading", level: 3, text: "Executive Summary" },
      {
        type: "paragraph",
        text: "49 active customer contracts reviewed. 47 located in data room. Standard terms include 90-day termination notice and auto-renewal. 3 enterprise contracts contain change-of-control clauses that may be triggered by the acquisition.",
      },
      {
        type: "risk",
        severity: "high",
        text: "Risk 1 \u2014 Change-of-control clauses: 3 contracts (Maersk, DSV, GLS) include change-of-control provisions allowing termination within 30 days of ownership change.",
      },
      {
        type: "risk",
        severity: "medium",
        text: "Risk 2 \u2014 Missing contract: Amendment referenced in contract #47 (June 2025) not found in data room.",
      },
      {
        type: "risk",
        severity: "low",
        text: "Risk 3 \u2014 Non-standard pricing: 5 contracts have legacy pricing significantly below current list prices.",
      },
      { type: "completeness_gap", text: "Contract documents: 47 of 49 located" },
    ],
  };

  // Shorter placeholder content for remaining deliverables
  const shortContent = (title: string, summary: string) => ({
    sections: [
      { type: "heading", level: 2, text: title },
      { type: "heading", level: 3, text: "Executive Summary" },
      { type: "paragraph", text: summary },
    ],
  });

  const taxContent = shortContent(
    "Tax Compliance Review",
    "NordTech is compliant with Danish corporate tax obligations. Effective tax rate of 22.3% aligns with statutory rate. R&D tax credits properly documented. One minor VAT filing discrepancy in Q2 2025 identified and corrected."
  );

  const regulatoryContent = shortContent(
    "Regulatory & License Audit",
    "NordTech holds required data processing certifications (ISO 27001, GDPR DPA with all customers). Software licenses are current. Two items flagged: expired penetration testing certification (due for renewal) and incomplete DPIA for new AI routing feature."
  );

  const vendorContent = shortContent(
    "Vendor Dependency Analysis",
    "18 material vendor relationships reviewed. AWS hosting (DKK 1.8M/year) is the largest. No single-source dependencies identified for critical operations. All vendor contracts reviewed \u2014 standard commercial terms, no unusual lock-in provisions."
  );

  // ── Deliverables ───────────────────────────────────────

  const deliverableDefs = [
    // Intelligence stage (5)
    {
      id: "del-tech-stack",
      title: "Technology Stack Assessment",
      templateSectionId: "tech-stack",
      stage: "intelligence",
      content: null,
      confidenceLevel: null,
      riskCount: 0,
      assignedToId: null,
      acceptedById: null,
    },
    {
      id: "del-ip-patent",
      title: "IP & Patent Analysis",
      templateSectionId: "ip-patent",
      stage: "intelligence",
      content: null,
      confidenceLevel: null,
      riskCount: 0,
      assignedToId: null,
      acceptedById: null,
    },
    {
      id: "del-tax-compliance",
      title: "Tax Compliance Review",
      templateSectionId: "tax-compliance",
      stage: "intelligence",
      content: taxContent,
      confidenceLevel: "high",
      riskCount: 1,
      assignedToId: null,
      acceptedById: null,
    },
    {
      id: "del-regulatory",
      title: "Regulatory & License Audit",
      templateSectionId: "regulatory-license",
      stage: "intelligence",
      content: regulatoryContent,
      confidenceLevel: "medium",
      riskCount: 2,
      assignedToId: null,
      acceptedById: null,
    },
    {
      id: "del-vendor",
      title: "Vendor Dependency Analysis",
      templateSectionId: "vendor-dependency",
      stage: "intelligence",
      content: vendorContent,
      confidenceLevel: "high",
      riskCount: 0,
      assignedToId: null,
      acceptedById: null,
    },
    // Workboard stage (4)
    {
      id: "del-revenue",
      title: "Revenue Quality Assessment",
      templateSectionId: "revenue-quality",
      stage: "workboard",
      content: revenueContent,
      confidenceLevel: "high",
      riskCount: 2,
      assignedToId: sarah.id,
      acceptedById: null,
    },
    {
      id: "del-contract",
      title: "Contract Portfolio Review",
      templateSectionId: "contract-portfolio",
      stage: "workboard",
      content: contractContent,
      confidenceLevel: "medium",
      riskCount: 3,
      assignedToId: erik.id,
      acceptedById: null,
    },
    {
      id: "del-customer",
      title: "Customer Concentration Analysis",
      templateSectionId: "customer-concentration",
      stage: "workboard",
      content: customerConcentrationContent,
      confidenceLevel: "high",
      riskCount: 1,
      assignedToId: adminUser.id,
      acceptedById: null,
    },
    {
      id: "del-ebitda",
      title: "EBITDA Normalization",
      templateSectionId: "ebitda-norm",
      stage: "workboard",
      content: ebitdaContent,
      confidenceLevel: "high",
      riskCount: 0,
      assignedToId: sarah.id,
      acceptedById: null,
    },
    // Deliverable stage (3)
    {
      id: "del-debt",
      title: "Debt & Liabilities Review",
      templateSectionId: "debt-liabilities",
      stage: "deliverable",
      content: debtContent,
      confidenceLevel: "high",
      riskCount: 0,
      assignedToId: null,
      acceptedById: adminUser.id,
    },
    {
      id: "del-employee",
      title: "Employee & Key Person Risk",
      templateSectionId: "employee-key-person",
      stage: "deliverable",
      content: employeeContent,
      confidenceLevel: "high",
      riskCount: 1,
      assignedToId: null,
      acceptedById: sarah.id,
    },
    {
      id: "del-working-capital",
      title: "Working Capital Analysis",
      templateSectionId: "working-capital",
      stage: "deliverable",
      content: workingCapitalContent,
      confidenceLevel: "medium",
      riskCount: 1,
      assignedToId: null,
      acceptedById: adminUser.id,
    },
  ];

  for (const d of deliverableDefs) {
    const acceptedAt = d.acceptedById ? new Date(Date.now() - Math.random() * 3 * 86400000) : null;
    await prisma.projectDeliverable.upsert({
      where: { id: d.id },
      create: {
        id: d.id,
        projectId: project.id,
        title: d.title,
        templateSectionId: d.templateSectionId,
        stage: d.stage,
        generationMode: "ai_generated",
        content: d.content ?? undefined,
        confidenceLevel: d.confidenceLevel,
        riskCount: d.riskCount,
        assignedToId: d.assignedToId,
        acceptedById: d.acceptedById,
        acceptedAt,
        completenessReport:
          d.stage !== "intelligence" || d.content
            ? {
                totalFields: 12,
                coveredFields: d.stage === "deliverable" ? 12 : d.content ? 10 : 0,
                coveragePercent: d.stage === "deliverable" ? 100 : d.content ? 83 : 0,
                gaps: d.riskCount > 0 ? ["Minor documentation gaps identified"] : [],
                sources: ["e-conomic", "Google Drive", "HubSpot"],
              }
            : undefined,
      },
      update: {},
    });
  }
  console.log(`Deliverables: ${deliverableDefs.length} created`);

  // ── Messages ───────────────────────────────────────────

  const messageData = [
    {
      userId: sarah.id,
      content:
        "Revenue recognition methodology \u2014 section 3.2. I disagree with the approach on deferred revenue. The target uses percentage-of-completion for professional services but their milestone documentation is inconsistent.",
    },
    {
      userId: erik.id,
      content:
        "Client clarification on earn-out structure. Got confirmation from NordTech CFO \u2014 the earn-out is tied to ARR targets over 24 months post-close, not EBITDA as initially documented.",
    },
    {
      userId: adminUser.id,
      content:
        "Working capital \u2014 seasonal adjustment needed. The Q4 inventory spike is recurring (3 consecutive years). We should normalize for seasonality in the WC analysis.",
    },
    {
      userId: mia.id,
      content:
        "Contract #47 \u2014 missing amendment. The referenced amendment from June 2025 is not in the data room. I\u2019ve asked the target company to provide it. Flagging for the contract portfolio review.",
    },
    {
      userId: sarah.id,
      content:
        "Customer concentration risk flag. Top 3 customers = 61% of revenue. This exceeds our 40% threshold. Recommend we model churn scenarios for the executive summary.",
    },
    {
      userId: erik.id,
      content:
        "Pending lawsuits \u2014 found references to two additional claims not in the legal folder. One appears to be an employment dispute, the other a vendor contract disagreement. Need legal to assess materiality.",
    },
  ];

  for (let i = 0; i < messageData.length; i++) {
    await prisma.projectMessage.create({
      data: {
        projectId: project.id,
        userId: messageData[i].userId,
        content: messageData[i].content,
        createdAt: new Date(Date.now() - (messageData.length - i) * 3600000),
      },
    });
  }
  console.log(`Messages: ${messageData.length} created`);

  // ── Notifications ──────────────────────────────────────

  const notificationData = [
    { type: "analysis_complete", content: "Technology stack assessment is 80% complete" },
    { type: "data_uploaded", content: "Client uploaded 3 new documents to data room" },
    { type: "risk_flagged", content: "High-risk flag: 2 contracts expire within 60 days" },
    { type: "deliverable_ready", content: "EBITDA normalization ready for acceptance" },
    { type: "stage_change", content: "Revenue quality assessment pulled into workboard by Sarah" },
  ];

  for (let i = 0; i < notificationData.length; i++) {
    await prisma.projectNotification.create({
      data: {
        projectId: project.id,
        type: notificationData[i].type,
        content: notificationData[i].content,
        createdAt: new Date(Date.now() - (notificationData.length - i) * 7200000),
      },
    });
  }
  console.log(`Notifications: ${notificationData.length} created`);

  // ── Connectors ─────────────────────────────────────────

  const connectorData = [
    { id: "pc-economic", label: "NordTech e-conomic", provider: "economic", status: "synced", syncedItemCount: 847 },
    { id: "pc-gdrive", label: "NordTech Google Drive", provider: "google-drive", status: "synced", syncedItemCount: 234 },
    { id: "pc-hubspot", label: "NordTech HubSpot", provider: "hubspot", status: "synced", syncedItemCount: 340 },
    { id: "pc-shopify", label: "NordTech Shopify", provider: "shopify", status: "syncing", syncedItemCount: 0 },
  ];

  for (const c of connectorData) {
    await prisma.projectConnector.upsert({
      where: { id: c.id },
      create: { projectId: project.id, ...c },
      update: {},
    });
  }
  console.log(`Connectors: ${connectorData.length} created`);

  console.log("\nProjects seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
