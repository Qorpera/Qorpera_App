// Performance targets (verify manually after seeding):
// - Map overview (/map): loads in < 1 second
// - Department detail (/map/[id]): loads in < 2 seconds
// - Situation feed (/situations): loads in < 2 seconds
// - Learning dashboard (/learning): loads in < 2 seconds
// - RAG retrieval: < 100ms (if embeddings were real)
// - Situation detection full scan: < 30 seconds

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Constants ──────────────────────────────────────────────────────────

const DEPARTMENTS = [
  { name: "Engineering", desc: "Software development and infrastructure" },
  { name: "Marketing", desc: "Brand, growth, and demand generation" },
  { name: "Sales", desc: "Revenue generation and deal management" },
  { name: "Finance", desc: "Financial planning, accounting, and billing" },
  { name: "Support", desc: "Customer success and support operations" },
  { name: "HR", desc: "People operations and talent management" },
  { name: "Legal", desc: "Legal affairs and compliance" },
  { name: "Product", desc: "Product strategy and roadmap" },
  { name: "Design", desc: "UX/UI design and brand identity" },
  { name: "Operations", desc: "Business operations and logistics" },
];

const NAMES = [
  "Alice Chen", "Bob Martinez", "Carol Johnson", "David Kim", "Eve Patel",
  "Frank Robinson", "Grace Lee", "Hector Nguyen", "Irene Davis", "Jack Thompson",
  "Karen Wilson", "Leo Garcia", "Mia Anderson", "Noah Brown", "Olivia Taylor",
  "Paul Moore", "Quinn Jackson", "Rosa Martin", "Sam White", "Tina Harris",
  "Uma Clark", "Victor Lewis", "Wendy Hall", "Xavier Young", "Yuki Allen",
  "Zara King", "Adam Wright", "Beth Scott", "Carl Green", "Diana Baker",
  "Ethan Adams", "Fiona Nelson", "George Hill", "Helen Ramirez", "Ivan Campbell",
  "Julia Mitchell", "Kyle Roberts", "Laura Carter", "Mark Phillips", "Nina Evans",
  "Oscar Turner", "Penny Parker", "Ryan Collins", "Stella Edwards", "Tom Stewart",
  "Ursula Sanchez", "Vince Morris", "Wanda Rogers", "Xander Reed", "Yvonne Cook",
];

const ROLES = ["Lead", "Senior", "Junior", "Manager", "Specialist"];
const DEAL_STAGES = ["Qualification", "Proposal", "Negotiation", "Closed Won", "Closed Lost"];
const INVOICE_STATUSES = ["paid", "overdue", "pending"];
const INDUSTRIES = ["SaaS", "Healthcare", "Finance", "Retail", "Manufacturing", "Logistics", "Education", "Media"];

const LOREM = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Curabitur pretium tincidunt lacus nec gravida. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo. Quisque sit amet est et sapien ullamcorper pharetra. Vestibulum erat wisi, condimentum sed, commodo vitae, ornare sit amet, wisi.`;

const SITUATION_DEFS = [
  { name: "Overdue Invoice", slug: "overdue-invoice", dept: "Finance", autonomy: "supervised" },
  { name: "Stalled Deal", slug: "stalled-deal", dept: "Sales", autonomy: "supervised" },
  { name: "High-Value Deal Review", slug: "high-value-deal", dept: "Sales", autonomy: "notify" },
  { name: "Customer Complaint", slug: "customer-complaint", dept: "Support", autonomy: "supervised" },
  { name: "Churn Risk Alert", slug: "churn-risk", dept: "Support", autonomy: "notify" },
  { name: "Budget Overrun", slug: "budget-overrun", dept: "Finance", autonomy: "supervised" },
  { name: "New Hire Onboarding", slug: "new-hire-onboard", dept: "HR", autonomy: "autonomous" },
  { name: "Contract Renewal Due", slug: "contract-renewal", dept: "Legal", autonomy: "notify" },
  { name: "Feature Request Surge", slug: "feature-request-surge", dept: "Product", autonomy: "notify" },
  { name: "Lead Score Spike", slug: "lead-score-spike", dept: "Marketing", autonomy: "autonomous" },
  { name: "Deploy Failure", slug: "deploy-failure", dept: "Engineering", autonomy: "supervised" },
  { name: "SLA Breach Warning", slug: "sla-breach", dept: "Support", autonomy: "supervised" },
  { name: "Expense Anomaly", slug: "expense-anomaly", dept: "Finance", autonomy: "notify" },
  { name: "Design Review Needed", slug: "design-review", dept: "Design", autonomy: "supervised" },
  { name: "Vendor Payment Due", slug: "vendor-payment", dept: "Operations", autonomy: "autonomous" },
  { name: "Pipeline Velocity Drop", slug: "pipeline-velocity", dept: "Sales", autonomy: "notify" },
  { name: "Compliance Deadline", slug: "compliance-deadline", dept: "Legal", autonomy: "supervised" },
  { name: "Campaign Performance", slug: "campaign-perf", dept: "Marketing", autonomy: "autonomous" },
  { name: "Incident Escalation", slug: "incident-escalation", dept: "Engineering", autonomy: "supervised" },
  { name: "Capacity Planning", slug: "capacity-planning", dept: "Operations", autonomy: "notify" },
];

// ── Helpers ──────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function pick<T>(arr: T[]): T {
  return arr[rand(0, arr.length - 1)];
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function pad(n: number, len: number): string {
  return String(n).padStart(len, "0");
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  // 1. Find operator
  const operator = await prisma.operator.findFirst();
  if (!operator) {
    console.error("No operator found. Log in to the app first to create one.");
    process.exit(1);
  }
  const operatorId = operator.id;
  console.log(`Using operator: ${operator.displayName} (${operatorId})`);

  // 2. Ensure entity types
  const typeDefs: Array<{ slug: string; name: string; desc: string; icon: string; color: string; cat: string; props?: Array<{ slug: string; name: string; dataType: string; identityRole?: string }> }> = [
    { slug: "department", name: "Department", desc: "Organizational department", icon: "building", color: "#a855f7", cat: "foundational" },
    { slug: "team-member", name: "Team Member", desc: "Person in the organization", icon: "user", color: "#3b82f6", cat: "base", props: [
      { slug: "email", name: "Email", dataType: "STRING", identityRole: "email" },
      { slug: "role", name: "Role", dataType: "STRING" },
      { slug: "phone", name: "Phone", dataType: "STRING" },
    ]},
    { slug: "contact", name: "Contact", desc: "External contact", icon: "user-circle", color: "#f59e0b", cat: "external", props: [
      { slug: "email", name: "Email", dataType: "STRING", identityRole: "email" },
      { slug: "phone", name: "Phone", dataType: "STRING" },
    ]},
    { slug: "company", name: "Company", desc: "External company", icon: "building-2", color: "#ef4444", cat: "external", props: [
      { slug: "domain", name: "Domain", dataType: "STRING", identityRole: "domain" },
      { slug: "industry", name: "Industry", dataType: "STRING" },
    ]},
    { slug: "deal", name: "Deal", desc: "Sales deal", icon: "handshake", color: "#10b981", cat: "digital", props: [
      { slug: "amount", name: "Amount", dataType: "CURRENCY" },
      { slug: "stage", name: "Stage", dataType: "STRING" },
      { slug: "close-date", name: "Close Date", dataType: "DATE" },
    ]},
    { slug: "invoice", name: "Invoice", desc: "Financial invoice", icon: "file-text", color: "#6366f1", cat: "digital", props: [
      { slug: "amount", name: "Amount", dataType: "CURRENCY" },
      { slug: "status", name: "Status", dataType: "STRING" },
      { slug: "due-date", name: "Due Date", dataType: "DATE" },
    ]},
    { slug: "document", name: "Document", desc: "Internal document", icon: "file", color: "#8b5cf6", cat: "internal", props: [
      { slug: "file-type", name: "File Type", dataType: "STRING" },
    ]},
  ];

  const typeMap = new Map<string, string>();
  const typePropMap = new Map<string, Map<string, string>>(); // typeSlug -> propSlug -> propId

  for (const td of typeDefs) {
    let et = await prisma.entityType.findFirst({ where: { operatorId, slug: td.slug } });
    if (!et) {
      et = await prisma.entityType.create({
        data: { operatorId, slug: td.slug, name: td.name, description: td.desc, icon: td.icon, color: td.color, defaultCategory: td.cat },
      });
      if (td.props) {
        for (let i = 0; i < td.props.length; i++) {
          const p = td.props[i];
          await prisma.entityProperty.create({
            data: { entityTypeId: et.id, slug: p.slug, name: p.name, dataType: p.dataType, identityRole: p.identityRole ?? null, displayOrder: i },
          });
        }
      }
    }
    typeMap.set(td.slug, et.id);

    // Load properties for this type
    const props = await prisma.entityProperty.findMany({ where: { entityTypeId: et.id }, select: { id: true, slug: true } });
    typePropMap.set(td.slug, new Map(props.map((p) => [p.slug, p.id])));
  }
  console.log("Entity types ready");

  // 3. Ensure relationship types
  const relDefs = [
    { slug: "department-member", name: "Department Member", from: "team-member", to: "department" },
    { slug: "contact-company", name: "Contact → Company", from: "contact", to: "company" },
    { slug: "deal-contact", name: "Deal → Contact", from: "deal", to: "contact" },
    { slug: "invoice-contact", name: "Invoice → Contact", from: "invoice", to: "contact" },
  ];

  const relTypeMap = new Map<string, string>();
  for (const rd of relDefs) {
    let rt = await prisma.relationshipType.findFirst({ where: { operatorId, slug: rd.slug } });
    if (!rt) {
      rt = await prisma.relationshipType.create({
        data: { operatorId, slug: rd.slug, name: rd.name, fromEntityTypeId: typeMap.get(rd.from)!, toEntityTypeId: typeMap.get(rd.to)! },
      });
    }
    relTypeMap.set(rd.slug, rt.id);
  }
  console.log("Relationship types ready");

  // 4. Create 10 departments (idempotent)
  const deptIds: string[] = [];
  for (let i = 0; i < DEPARTMENTS.length; i++) {
    const d = DEPARTMENTS[i];
    const row = Math.floor(i / 5);
    const col = i % 5;
    let entity = await prisma.entity.findFirst({
      where: { operatorId, displayName: d.name, category: "foundational" },
    });
    if (!entity) {
      entity = await prisma.entity.create({
        data: {
          operatorId, entityTypeId: typeMap.get("department")!, displayName: d.name,
          category: "foundational", description: d.desc, mapX: col * 250, mapY: row * 250,
        },
      });
    }
    deptIds.push(entity.id);
  }
  console.log(`Departments: ${deptIds.length}`);

  // 5. Create 50 team members (idempotent)
  const memberIds: string[] = [];
  const memberProps = typePropMap.get("team-member")!;
  for (let i = 0; i < 50; i++) {
    const deptIdx = Math.floor(i / 5);
    const name = NAMES[i];
    const [first, last] = name.split(" ");
    const email = `${first.toLowerCase()}.${last.toLowerCase()}@acme-test.com`;
    const role = ROLES[i % ROLES.length];

    let entity = await prisma.entity.findFirst({
      where: { operatorId, displayName: name, category: "base" },
    });
    if (!entity) {
      entity = await prisma.entity.create({
        data: {
          operatorId, entityTypeId: typeMap.get("team-member")!, displayName: name,
          category: "base", primaryDomainId: deptIds[deptIdx],
        },
      });
      const pvData: Array<{ entityId: string; propertyId: string; value: string }> = [];
      if (memberProps.has("email")) pvData.push({ entityId: entity.id, propertyId: memberProps.get("email")!, value: email });
      if (memberProps.has("role")) pvData.push({ entityId: entity.id, propertyId: memberProps.get("role")!, value: role });
      if (pvData.length > 0) await prisma.propertyValue.createMany({ data: pvData });
    }
    memberIds.push(entity.id);
  }
  console.log(`Team members: ${memberIds.length}`);

  // 6. Create 30 documents + 300 chunks (idempotent)
  const docTypeId = typeMap.get("document")!;
  let totalChunks = 0;
  let totalDocs = 0;
  for (let di = 0; di < deptIds.length; di++) {
    const deptName = DEPARTMENTS[di].name;
    const docNames = [`${deptName} Processes`, `${deptName} Playbook`, `${deptName} Guidelines`];
    for (const docName of docNames) {
      let entity = await prisma.entity.findFirst({
        where: { operatorId, displayName: docName, category: "internal" },
      });
      if (!entity) {
        entity = await prisma.entity.create({
          data: {
            operatorId, entityTypeId: docTypeId, displayName: docName,
            category: "internal", primaryDomainId: deptIds[di], sourceSystem: "document-upload",
          },
        });
        await prisma.internalDocument.create({
          data: {
            operatorId, fileName: `${docName}.txt`, mimeType: "text/plain",
            filePath: `/fake/${docName.replace(/ /g, "_")}.txt`,
            rawText: LOREM.repeat(4), documentType: "context",
            domainId: deptIds[di], entityId: entity.id,
            status: "extracted", embeddingStatus: "complete",
          },
        });
        const chunkData = Array.from({ length: 10 }, (_, ci) => ({
          operatorId, sourceType: "uploaded_doc", sourceId: entity!.id,
          entityId: entity!.id, domainIds: JSON.stringify([deptIds[di]]),
          chunkIndex: ci,
          content: `${docName} chunk ${ci}: ${LOREM.slice(0, 200)}`,
          tokenCount: rand(80, 150),
        }));
        await prisma.contentChunk.createMany({ data: chunkData });
        totalChunks += 10;
      } else {
        totalChunks += 0; // ContentChunk no longer created per-entity
      }
      totalDocs++;
    }
  }
  console.log(`Documents: ${totalDocs} (${totalChunks} chunks)`);

  // 7. Create 5,000 digital entities (idempotent — skip if deals already exist)
  const deptMemberRelTypeId = relTypeMap.get("department-member")!;
  const dealProps = typePropMap.get("deal")!;
  const invoiceProps = typePropMap.get("invoice")!;
  const dealIds: string[] = [];
  const invoiceIds: string[] = [];

  const existingDeals = await prisma.entity.findMany({
    where: { operatorId, sourceSystem: "stress-seed", entityTypeId: typeMap.get("deal")! },
    select: { id: true },
  });
  const existingInvoices = await prisma.entity.findMany({
    where: { operatorId, sourceSystem: "stress-seed", entityTypeId: typeMap.get("invoice")! },
    select: { id: true },
  });

  if (existingDeals.length >= 2500) {
    dealIds.push(...existingDeals.map((e) => e.id));
    console.log(`Deals: ${dealIds.length} (already exist)`);
  } else {
  // Batch deals
  for (let batch = 0; batch < 25; batch++) {
    const batchEntities = [];
    for (let j = 0; j < 100; j++) {
      const idx = batch * 100 + j;
      batchEntities.push({
        operatorId, entityTypeId: typeMap.get("deal")!,
        displayName: `Deal-${pad(idx + 1, 4)}`, category: "digital" as const,
        sourceSystem: "stress-seed",
      });
    }
    // createMany doesn't return IDs in SQLite, so use individual creates in a transaction
    const ids = await prisma.$transaction(
      batchEntities.map((d) => prisma.entity.create({ data: d, select: { id: true } }))
    );
    const newIds = ids.map((r) => r.id);
    dealIds.push(...newIds);

    // Properties + relationships
    const pvBatch: Array<{ entityId: string; propertyId: string; value: string }> = [];
    const relBatch: Array<{ relationshipTypeId: string; fromEntityId: string; toEntityId: string }> = [];
    for (let j = 0; j < newIds.length; j++) {
      const eid = newIds[j];
      const deptIdx = Math.floor((batch * 100 + j) / 250);
      if (dealProps.has("amount")) pvBatch.push({ entityId: eid, propertyId: dealProps.get("amount")!, value: String(rand(5000, 500000)) });
      if (dealProps.has("stage")) pvBatch.push({ entityId: eid, propertyId: dealProps.get("stage")!, value: pick(DEAL_STAGES) });
      if (dealProps.has("close-date")) pvBatch.push({ entityId: eid, propertyId: dealProps.get("close-date")!, value: daysAgo(rand(-60, 90)).toISOString().slice(0, 10) });
      relBatch.push({ relationshipTypeId: deptMemberRelTypeId, fromEntityId: eid, toEntityId: deptIds[deptIdx % 10] });
    }
    await prisma.propertyValue.createMany({ data: pvBatch });
    // Relationships — use individual creates to handle unique constraint
    for (const r of relBatch) {
      await prisma.relationship.create({ data: r }).catch(() => {});
    }
  }
  console.log(`Deals: ${dealIds.length}`);
  }

  if (existingInvoices.length >= 2500) {
    invoiceIds.push(...existingInvoices.map((e) => e.id));
    console.log(`Invoices: ${invoiceIds.length} (already exist)`);
  } else {
  // Batch invoices
  for (let batch = 0; batch < 25; batch++) {
    const batchEntities = [];
    for (let j = 0; j < 100; j++) {
      const idx = batch * 100 + j;
      batchEntities.push({
        operatorId, entityTypeId: typeMap.get("invoice")!,
        displayName: `INV-${pad(idx + 1, 4)}`, category: "digital" as const,
        sourceSystem: "stress-seed",
      });
    }
    const ids = await prisma.$transaction(
      batchEntities.map((d) => prisma.entity.create({ data: d, select: { id: true } }))
    );
    const newIds = ids.map((r) => r.id);
    invoiceIds.push(...newIds);

    const pvBatch: Array<{ entityId: string; propertyId: string; value: string }> = [];
    const relBatch: Array<{ relationshipTypeId: string; fromEntityId: string; toEntityId: string }> = [];
    for (let j = 0; j < newIds.length; j++) {
      const eid = newIds[j];
      const deptIdx = Math.floor((batch * 100 + j) / 250);
      if (invoiceProps.has("amount")) pvBatch.push({ entityId: eid, propertyId: invoiceProps.get("amount")!, value: String(rand(100, 50000)) });
      if (invoiceProps.has("status")) pvBatch.push({ entityId: eid, propertyId: invoiceProps.get("status")!, value: pick(INVOICE_STATUSES) });
      if (invoiceProps.has("due-date")) pvBatch.push({ entityId: eid, propertyId: invoiceProps.get("due-date")!, value: daysAgo(rand(-30, 60)).toISOString().slice(0, 10) });
      relBatch.push({ relationshipTypeId: deptMemberRelTypeId, fromEntityId: eid, toEntityId: deptIds[deptIdx % 10] });
    }
    await prisma.propertyValue.createMany({ data: pvBatch });
    for (const r of relBatch) {
      await prisma.relationship.create({ data: r }).catch(() => {});
    }
  }
  console.log(`Invoices: ${invoiceIds.length}`);
  }

  // 8. Create 500 external entities (idempotent)
  const contactProps = typePropMap.get("contact")!;
  const companyProps = typePropMap.get("company")!;
  const contactIds: string[] = [];
  const companyIds: string[] = [];

  const existingCompanies = await prisma.entity.findMany({
    where: { operatorId, sourceSystem: "stress-seed", entityTypeId: typeMap.get("company")! },
    select: { id: true },
  });
  if (existingCompanies.length >= 100) {
    companyIds.push(...existingCompanies.map((e) => e.id));
    console.log(`Companies: ${companyIds.length} (already exist)`);
  } else {
    for (let i = 0; i < 100; i++) {
      const entity = await prisma.entity.create({
        data: {
          operatorId, entityTypeId: typeMap.get("company")!,
          displayName: `Vendor ${pad(i + 1, 3)}`, category: "external", sourceSystem: "stress-seed",
        },
      });
      companyIds.push(entity.id);
      const pvData: Array<{ entityId: string; propertyId: string; value: string }> = [];
      if (companyProps.has("domain")) pvData.push({ entityId: entity.id, propertyId: companyProps.get("domain")!, value: `vendor${pad(i + 1, 3)}.com` });
      if (companyProps.has("industry")) pvData.push({ entityId: entity.id, propertyId: companyProps.get("industry")!, value: pick(INDUSTRIES) });
      if (pvData.length > 0) await prisma.propertyValue.createMany({ data: pvData });
    }
    console.log(`Companies: ${companyIds.length}`);
  }

  // Contacts
  const dealContactRelTypeId = relTypeMap.get("deal-contact")!;
  const contactCompanyRelTypeId = relTypeMap.get("contact-company")!;

  const existingContacts = await prisma.entity.findMany({
    where: { operatorId, sourceSystem: "stress-seed", entityTypeId: typeMap.get("contact")! },
    select: { id: true },
  });
  if (existingContacts.length >= 400) {
    contactIds.push(...existingContacts.map((e) => e.id));
    console.log(`Contacts: ${contactIds.length} (already exist)`);
  } else {
    for (let batch = 0; batch < 4; batch++) {
      const batchEntities = [];
      for (let j = 0; j < 100; j++) {
        const idx = batch * 100 + j;
        batchEntities.push({
          operatorId, entityTypeId: typeMap.get("contact")!,
          displayName: `Customer ${pad(idx + 1, 4)}`, category: "external" as const,
          sourceSystem: "stress-seed",
        });
      }
      const ids = await prisma.$transaction(
        batchEntities.map((d) => prisma.entity.create({ data: d, select: { id: true } }))
      );
      const newIds = ids.map((r) => r.id);
      contactIds.push(...newIds);

      const pvBatch: Array<{ entityId: string; propertyId: string; value: string }> = [];
      for (let j = 0; j < newIds.length; j++) {
        const idx = batch * 100 + j;
        const eid = newIds[j];
        if (contactProps.has("email")) pvBatch.push({ entityId: eid, propertyId: contactProps.get("email")!, value: `customer${pad(idx + 1, 4)}@example.com` });
        if (contactProps.has("phone")) pvBatch.push({ entityId: eid, propertyId: contactProps.get("phone")!, value: `+1-555-${pad(rand(1000, 9999), 4)}` });
      }
      await prisma.propertyValue.createMany({ data: pvBatch });

      // Link contacts to deals (1-3 each) and a company
      for (const cid of newIds) {
        const numDeals = rand(1, 3);
        for (let d = 0; d < numDeals; d++) {
          await prisma.relationship.create({
            data: { relationshipTypeId: dealContactRelTypeId, fromEntityId: pick(dealIds), toEntityId: cid },
          }).catch(() => {});
        }
        await prisma.relationship.create({
          data: { relationshipTypeId: contactCompanyRelTypeId, fromEntityId: cid, toEntityId: pick(companyIds) },
        }).catch(() => {});
      }
    }
    console.log(`Contacts: ${contactIds.length}`);
  }

  // 9. Create ~20 situation types (idempotent)
  const sitTypeIds: Array<{ id: string; deptId: string }> = [];
  for (const sd of SITUATION_DEFS) {
    const deptIdx = DEPARTMENTS.findIndex((d) => d.name === sd.dept);
    const scopeEntityId = deptIdx >= 0 ? deptIds[deptIdx] : null;
    let st = await prisma.situationType.findFirst({ where: { operatorId, slug: sd.slug } });
    if (!st) {
      const proposed = rand(10, 100);
      const approved = Math.floor(proposed * randFloat(0.5, 0.95));
      st = await prisma.situationType.create({
        data: {
          operatorId, slug: sd.slug, name: sd.name,
          description: `Detect ${sd.name.toLowerCase()} situations in ${sd.dept}`,
          detectionLogic: JSON.stringify({ signals: [sd.slug], threshold: 0.5 }),
          autonomyLevel: sd.autonomy, scopeEntityId,
          totalProposed: proposed, totalApproved: approved,
          approvalRate: proposed > 0 ? approved / proposed : 0,
          consecutiveApprovals: rand(0, 15),
        },
      });
    }
    sitTypeIds.push({ id: st.id, deptId: scopeEntityId ?? deptIds[0] });
  }
  console.log(`Situation types: ${sitTypeIds.length}`);

  // 10. Create ~100 situation wiki pages (idempotent — skip if pages already exist)
  const STATUSES = ["draft", "published", "published", "published", "published"];

  const existingPages = await prisma.knowledgePage.count({
    where: { operatorId, pageType: "situation_instance" },
  });

  let situationPageCount = existingPages;
  if (existingPages >= 100) {
    console.log(`Situation pages: ${existingPages} (already exist)`);
  } else {
  situationPageCount = 0;
  for (let i = 0; i < 100; i++) {
    const stInfo = pick(sitTypeIds);
    const status = pick(STATUSES);
    const createdAt = daysAgo(rand(0, 30));
    const triggerEntityId = pick([...dealIds.slice(0, 50), ...invoiceIds.slice(0, 50), ...contactIds.slice(0, 20)]);

    await prisma.knowledgePage.create({
      data: {
        operatorId,
        pageType: "situation_instance",
        scope: "operator",
        subjectEntityId: triggerEntityId,
        title: `Situation ${i + 1}: ${pick(SITUATION_DEFS).name}`,
        slug: `stress-situation-${i + 1}`,
        content: `## Analysis\n\nAutomated analysis for situation ${i + 1}. Detected pattern matching ${pick(SITUATION_DEFS).name.toLowerCase()}.`,
        contentTokens: 50,
        properties: {
          situation_id: `stress-sit-${i + 1}`,
          status,
          severity: randFloat(0.3, 0.9),
          confidence: randFloat(0.4, 0.95),
          situation_type: stInfo.id,
          detected_at: createdAt.toISOString(),
          source: "stress_seed",
        },
        confidence: randFloat(0.3, 1.0),
        sourceCount: 1,
        synthesisPath: "stress_seed",
        synthesizedByModel: "stress_seed",
        lastSynthesizedAt: createdAt,
        createdAt,
      },
    });
    situationPageCount++;
  }
  console.log(`Situation pages: ${situationPageCount}`);
  }

  // 10b. Create demo connectors + ActionCapabilities
  {
    const DEMO_CONNECTORS = [
      { provider: "google", name: "Gmail (Demo)" },
      { provider: "slack", name: "Slack (Demo)" },
    ];

    const DEMO_CAPABILITIES = [
      {
        name: "send_email",
        description: "Send an email to a recipient with subject and body",
        provider: "google",
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            to: { type: "string", description: "Recipient email address" },
            subject: { type: "string", description: "Email subject line" },
            body: { type: "string", description: "Email body (plain text or HTML)" },
            cc: { type: "string", description: "CC recipients (optional)" },
          },
          required: ["to", "subject", "body"],
        }),
        sideEffects: JSON.stringify(["sends_email"]),
      },
      {
        name: "reply_to_email",
        description: "Reply to an existing email thread",
        provider: "google",
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            threadId: { type: "string", description: "Email thread to reply to" },
            body: { type: "string", description: "Reply body" },
          },
          required: ["threadId", "body"],
        }),
        sideEffects: JSON.stringify(["sends_email"]),
      },
      {
        name: "create_calendar_event",
        description: "Create a calendar event or meeting with attendees",
        provider: "google",
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            title: { type: "string", description: "Event title" },
            startTime: { type: "string", description: "Start time (ISO 8601)" },
            endTime: { type: "string", description: "End time (ISO 8601)" },
            attendees: { type: "array", items: { type: "string" }, description: "Attendee email addresses" },
            description: { type: "string", description: "Event description" },
            location: { type: "string", description: "Event location" },
          },
          required: ["title", "startTime", "endTime"],
        }),
        sideEffects: JSON.stringify(["creates_calendar_event", "sends_invitation"]),
      },
      {
        name: "create_document",
        description: "Create a new document in Google Drive",
        provider: "google",
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            title: { type: "string", description: "Document title" },
            content: { type: "string", description: "Document content" },
            folderId: { type: "string", description: "Destination folder (optional)" },
          },
          required: ["title", "content"],
        }),
        sideEffects: JSON.stringify(["creates_document"]),
      },
      {
        name: "send_slack_message",
        description: "Send a message to a Slack channel or person",
        provider: "slack",
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            channel: { type: "string", description: "Channel name or person" },
            message: { type: "string", description: "Message text" },
          },
          required: ["channel", "message"],
        }),
        sideEffects: JSON.stringify(["sends_message"]),
      },
      {
        name: "create_task",
        description: "Create a task or to-do item assigned to a team member",
        provider: "internal",
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            title: { type: "string", description: "Task title" },
            description: { type: "string", description: "Task description" },
            assignee: { type: "string", description: "Person to assign the task to" },
            dueDate: { type: "string", description: "Due date (ISO 8601)" },
            priority: { type: "string", enum: ["low", "medium", "high"], description: "Task priority" },
          },
          required: ["title"],
        }),
        sideEffects: JSON.stringify(["creates_task"]),
      },
      {
        name: "create_reminder",
        description: "Create a follow-up reminder for a future date",
        provider: "internal",
        inputSchema: JSON.stringify({
          type: "object",
          properties: {
            title: { type: "string", description: "Reminder title" },
            date: { type: "string", description: "Reminder date (ISO 8601)" },
            note: { type: "string", description: "Additional context" },
          },
          required: ["title", "date"],
        }),
        sideEffects: JSON.stringify(["creates_reminder"]),
      },
    ];

    let capCount = 0;
    const connectorMap = new Map<string, string>();
    for (const conn of DEMO_CONNECTORS) {
      const existing = await prisma.sourceConnector.findFirst({
        where: { operatorId, provider: conn.provider, deletedAt: null },
      });
      if (existing) {
        connectorMap.set(conn.provider, existing.id);
      } else {
        const created = await prisma.sourceConnector.create({
          data: {
            operatorId,
            provider: conn.provider,
            name: conn.name,
            status: "active",
            config: JSON.stringify({ demo: true }),
          },
        });
        connectorMap.set(conn.provider, created.id);
      }
    }

    for (const cap of DEMO_CAPABILITIES) {
      const connectorId = connectorMap.get(cap.provider);
      if (!connectorId && cap.provider !== "internal") continue;

      const existing = await prisma.actionCapability.findFirst({
        where: { operatorId, name: cap.name },
      });
      if (existing) continue;

      await prisma.actionCapability.create({
        data: {
          operatorId,
          connectorId: connectorId ?? null,
          name: cap.name,
          description: cap.description,
          inputSchema: cap.inputSchema,
          sideEffects: cap.sideEffects,
          enabled: true,
          writeBackStatus: "enabled",
        },
      });
      capCount++;
    }

    // Backfill: enable writeBack on all demo capabilities that are still "pending"
    const demoConnectorIds = [...connectorMap.values()];
    if (demoConnectorIds.length > 0) {
      const backfilled = await prisma.actionCapability.updateMany({
        where: {
          operatorId,
          writeBackStatus: "pending",
          connectorId: { in: demoConnectorIds },
        },
        data: { writeBackStatus: "enabled" },
      });
      if (backfilled.count > 0) {
        console.log(`WriteBackStatus: backfilled ${backfilled.count} demo capabilities to "enabled"`);
      }
    }

    console.log(`ActionCapabilities: ${capCount} created`);
  }

  // 11. Summary
  const elapsed = Date.now() - startTime;
  console.log(`
Stress seed complete:
  Departments: ${deptIds.length}
  Team members: ${memberIds.length}
  Documents: 30 (${totalChunks} chunks)
  Digital entities: ${dealIds.length + invoiceIds.length}
  External entities: ${contactIds.length + companyIds.length}
  Situation types: ${sitTypeIds.length}
  Situation pages: ${situationPageCount}

Completed in ${(elapsed / 1000).toFixed(1)}s`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
