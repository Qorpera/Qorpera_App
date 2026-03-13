import { NextResponse } from "next/server";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";

// ── Constants ────────────────────────────────────────────────────────

const COMPANY_NAME = "Nordic Digital Solutions";
const ADMIN_EMAIL = "demo@nordicdigital.com";
const ADMIN_PASSWORD = "NordicDemo2026!";
const ADMIN_NAME = "Nordic Admin";
const INDUSTRY = "Professional Services / Technology Consulting";
const ORIENTATION_CONTEXT = JSON.stringify({
  businessDescription:
    "We're a 15-person consultancy helping mid-market companies with digital transformation. Our biggest challenges are deal pipeline visibility, project delivery tracking, and making sure client relationships don't go cold between engagements.",
  industry: INDUSTRY,
  teamSize: 15,
  departments: ["Sales & Partnerships", "Delivery & Engineering", "Finance & Operations"],
});

// ── Helpers ──────────────────────────────────────────────────────────

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 86_400_000);
}

function dummyEmbedding(): string {
  // Returns a pgvector literal string like "[0.1,-0.2,...]"
  const arr = Array.from({ length: 1536 }, () =>
    Math.round((Math.random() * 2 - 1) * 100) / 100,
  );
  return `[${arr.join(",")}]`;
}

// ── Entity Type Definitions ─────────────────────────────────────────

const TYPE_DEFS: Array<{
  slug: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
  cat: string;
  props?: Array<{ slug: string; name: string; dataType: string; identityRole?: string }>;
}> = [
  {
    slug: "organization", name: "Organization", desc: "The top-level company entity",
    icon: "building-2", color: "#6366f1", cat: "foundational",
  },
  {
    slug: "department", name: "Department", desc: "Organizational department",
    icon: "users", color: "#8b5cf6", cat: "foundational",
  },
  {
    slug: "team-member", name: "Team Member", desc: "Internal team member",
    icon: "user-check", color: "#a855f7", cat: "base",
    props: [
      { slug: "email", name: "Email", dataType: "STRING", identityRole: "email" },
      { slug: "role", name: "Role", dataType: "STRING" },
      { slug: "phone", name: "Phone", dataType: "STRING", identityRole: "phone" },
    ],
  },
  {
    slug: "contact", name: "Contact", desc: "A person from CRM or payment systems",
    icon: "user", color: "#3b82f6", cat: "external",
    props: [
      { slug: "email", name: "Email", dataType: "STRING", identityRole: "email" },
      { slug: "phone", name: "Phone", dataType: "STRING", identityRole: "phone" },
      { slug: "job-title", name: "Job Title", dataType: "STRING" },
    ],
  },
  {
    slug: "company", name: "Company", desc: "An organization from CRM",
    icon: "building", color: "#8b5cf6", cat: "external",
    props: [
      { slug: "domain", name: "Domain", dataType: "STRING", identityRole: "domain" },
      { slug: "industry", name: "Industry", dataType: "STRING" },
      { slug: "revenue", name: "Revenue", dataType: "CURRENCY" },
      { slug: "employee-count", name: "Employee Count", dataType: "NUMBER" },
    ],
  },
  {
    slug: "deal", name: "Deal", desc: "A sales deal or opportunity",
    icon: "handshake", color: "#22c55e", cat: "digital",
    props: [
      { slug: "amount", name: "Amount", dataType: "CURRENCY" },
      { slug: "stage", name: "Stage", dataType: "STRING" },
      { slug: "close-date", name: "Close Date", dataType: "DATE" },
      { slug: "pipeline", name: "Pipeline", dataType: "STRING" },
    ],
  },
  {
    slug: "invoice", name: "Invoice", desc: "An invoice from billing systems",
    icon: "file-text", color: "#f59e0b", cat: "digital",
    props: [
      { slug: "amount", name: "Amount", dataType: "CURRENCY" },
      { slug: "status", name: "Status", dataType: "STRING" },
      { slug: "due-date", name: "Due Date", dataType: "DATE" },
      { slug: "currency", name: "Currency", dataType: "STRING" },
      { slug: "paid-date", name: "Paid Date", dataType: "DATE" },
      { slug: "amount-paid", name: "Amount Paid", dataType: "CURRENCY" },
    ],
  },
  {
    slug: "payment", name: "Payment", desc: "A payment transaction",
    icon: "credit-card", color: "#10b981", cat: "digital",
    props: [
      { slug: "amount", name: "Amount", dataType: "CURRENCY" },
      { slug: "currency", name: "Currency", dataType: "STRING" },
      { slug: "status", name: "Status", dataType: "STRING" },
      { slug: "payment-date", name: "Payment Date", dataType: "DATE" },
    ],
  },
  {
    slug: "project", name: "Project", desc: "A client project or engagement",
    icon: "folder-kanban", color: "#06b6d4", cat: "digital",
    props: [
      { slug: "status", name: "Status", dataType: "STRING" },
      { slug: "start-date", name: "Start Date", dataType: "DATE" },
      { slug: "end-date", name: "End Date", dataType: "DATE" },
      { slug: "budget", name: "Budget", dataType: "CURRENCY" },
    ],
  },
  {
    slug: "document", name: "Document", desc: "Uploaded document providing context",
    icon: "file-text", color: "#64748b", cat: "internal",
    props: [
      { slug: "document-type", name: "Document Type", dataType: "STRING" },
    ],
  },
];

const REL_TYPE_DEFS = [
  { slug: "department-member", name: "Department Member", from: "team-member", to: "department" },
  { slug: "contact-company", name: "Contact → Company", from: "contact", to: "company" },
  { slug: "deal-contact", name: "Deal → Contact", from: "deal", to: "contact" },
  { slug: "invoice-contact", name: "Invoice → Contact", from: "invoice", to: "contact" },
  { slug: "payment-invoice", name: "Payment → Invoice", from: "payment", to: "invoice" },
  { slug: "project-department", name: "Project → Department", from: "project", to: "department" },
];

// ── Team & Department Data ──────────────────────────────────────────

const DEPARTMENTS = [
  { name: "Sales & Partnerships", desc: "Revenue generation, client relationships, and partnership management", mapX: 200, mapY: 150 },
  { name: "Delivery & Engineering", desc: "Project delivery, software development, and technical operations", mapX: 550, mapY: 150 },
  { name: "Finance & Operations", desc: "Financial management, billing, and business operations", mapX: 375, mapY: 400 },
];

const TEAM_MEMBERS = [
  // Sales & Partnerships
  { name: "Erik Lindström", role: "Head of Sales", email: "erik.lindstrom@nordicdigital.com", phone: "+46 70 123 4501", dept: "Sales & Partnerships" },
  { name: "Anna Bergström", role: "Senior Account Executive", email: "anna.bergstrom@nordicdigital.com", phone: "+46 70 123 4502", dept: "Sales & Partnerships" },
  { name: "Lars Johansson", role: "Account Executive", email: "lars.johansson@nordicdigital.com", phone: "+46 70 123 4503", dept: "Sales & Partnerships" },
  { name: "Maja Nielsen", role: "Business Development Representative", email: "maja.nielsen@nordicdigital.com", phone: "+46 70 123 4504", dept: "Sales & Partnerships" },
  { name: "Sofia Dahl", role: "Partnerships Manager", email: "sofia.dahl@nordicdigital.com", phone: "+46 70 123 4505", dept: "Sales & Partnerships" },
  // Delivery & Engineering
  { name: "Henrik Olsson", role: "Head of Delivery", email: "henrik.olsson@nordicdigital.com", phone: "+46 70 123 4506", dept: "Delivery & Engineering" },
  { name: "Frida Eklund", role: "Senior Project Manager", email: "frida.eklund@nordicdigital.com", phone: "+46 70 123 4507", dept: "Delivery & Engineering" },
  { name: "Oscar Nyström", role: "Tech Lead", email: "oscar.nystrom@nordicdigital.com", phone: "+46 70 123 4508", dept: "Delivery & Engineering" },
  { name: "Emil Andersson", role: "Full Stack Developer", email: "emil.andersson@nordicdigital.com", phone: "+46 70 123 4509", dept: "Delivery & Engineering" },
  { name: "Klara Virtanen", role: "UX Designer", email: "klara.virtanen@nordicdigital.com", phone: "+46 70 123 4510", dept: "Delivery & Engineering" },
  { name: "Noah Pettersson", role: "DevOps Engineer", email: "noah.pettersson@nordicdigital.com", phone: "+46 70 123 4511", dept: "Delivery & Engineering" },
  { name: "Astrid Magnusson", role: "Junior Developer", email: "astrid.magnusson@nordicdigital.com", phone: "+46 70 123 4512", dept: "Delivery & Engineering" },
  // Finance & Operations
  { name: "Ingrid Svensson", role: "CFO / Head of Operations", email: "ingrid.svensson@nordicdigital.com", phone: "+46 70 123 4513", dept: "Finance & Operations" },
  { name: "Viktor Holmberg", role: "Finance Manager", email: "viktor.holmberg@nordicdigital.com", phone: "+46 70 123 4514", dept: "Finance & Operations" },
  { name: "Elsa Karlsson", role: "Office & Operations Coordinator", email: "elsa.karlsson@nordicdigital.com", phone: "+46 70 123 4515", dept: "Finance & Operations" },
];

// Cross-department memberships: member name → extra department + role
const CROSS_DEPT = [
  { member: "Erik Lindström", dept: "Finance & Operations", role: "Revenue forecasting" },
  { member: "Henrik Olsson", dept: "Sales & Partnerships", role: "Technical pre-sales" },
];

// ── Client Data ─────────────────────────────────────────────────────

const CLIENT_COMPANIES = [
  { name: "Fjord Analytics", domain: "fjordanalytics.com", industry: "SaaS / Data Analytics", revenue: "8500000", employees: "45" },
  { name: "Bergen Logistics", domain: "bergenlogistics.no", industry: "Logistics / Supply Chain", revenue: "32000000", employees: "180" },
  { name: "Malmö Retail Group", domain: "malmoretail.se", industry: "Retail / E-commerce", revenue: "95000000", employees: "420" },
  { name: "Helsinki Health Tech", domain: "helsinkihealth.fi", industry: "Healthcare / Technology", revenue: "12000000", employees: "65" },
  { name: "Copenhagen Financial", domain: "copenhagenfinancial.dk", industry: "Financial Services", revenue: "280000000", employees: "850" },
];

const CLIENT_CONTACTS = [
  { name: "Hans Müller", email: "hans.muller@fjordanalytics.com", phone: "+47 900 11 001", title: "CTO", company: "Fjord Analytics" },
  { name: "Katarina Svensson", email: "katarina.s@fjordanalytics.com", phone: "+47 900 11 002", title: "VP Engineering", company: "Fjord Analytics" },
  { name: "Anders Berg", email: "anders.berg@bergenlogistics.no", phone: "+47 900 22 001", title: "CEO", company: "Bergen Logistics" },
  { name: "Mette Andersen", email: "mette.andersen@bergenlogistics.no", phone: "+47 900 22 002", title: "Operations Director", company: "Bergen Logistics" },
  { name: "Jonas Petersen", email: "jonas.p@malmoretail.se", phone: "+46 70 333 001", title: "Head of Digital", company: "Malmö Retail Group" },
  { name: "Lise Hansen", email: "lise.hansen@malmoretail.se", phone: "+46 70 333 002", title: "CTO", company: "Malmö Retail Group" },
  { name: "Mikko Lahtinen", email: "mikko.lahtinen@helsinkihealth.fi", phone: "+358 40 444 001", title: "CEO", company: "Helsinki Health Tech" },
  { name: "Päivi Korhonen", email: "paivi.k@helsinkihealth.fi", phone: "+358 40 444 002", title: "VP Product", company: "Helsinki Health Tech" },
  { name: "Niels Christensen", email: "niels.c@copenhagenfinancial.dk", phone: "+45 20 555 001", title: "CFO", company: "Copenhagen Financial" },
  { name: "Camilla Eriksson", email: "camilla.e@copenhagenfinancial.dk", phone: "+45 20 555 002", title: "Head of IT", company: "Copenhagen Financial" },
  { name: "Thomas Lindgren", email: "thomas.l@bergenlogistics.no", phone: "+47 900 22 003", title: "Procurement Manager", company: "Bergen Logistics" },
  { name: "Sanna Virtanen", email: "sanna.v@helsinkihealth.fi", phone: "+358 40 444 003", title: "Chief Medical Officer", company: "Helsinki Health Tech" },
];

const DEALS = [
  { name: "Fjord Analytics - Data Platform Modernization", amount: "85000", stage: "closed-won", closeDate: daysAgo(15).toISOString().slice(0, 10), contact: "Hans Müller" },
  { name: "Bergen Logistics - Route Optimization System", amount: "120000", stage: "negotiation", closeDate: daysAgo(-20).toISOString().slice(0, 10), contact: "Anders Berg" },
  { name: "Malmö Retail - E-commerce Replatform", amount: "95000", stage: "proposal", closeDate: daysAgo(-45).toISOString().slice(0, 10), contact: "Jonas Petersen" },
  { name: "Helsinki Health - Patient Portal V2", amount: "65000", stage: "closed-won", closeDate: daysAgo(30).toISOString().slice(0, 10), contact: "Mikko Lahtinen" },
  { name: "Copenhagen Financial - Compliance Dashboard", amount: "45000", stage: "discovery", closeDate: daysAgo(-60).toISOString().slice(0, 10), contact: "Niels Christensen" },
  { name: "Bergen Logistics - Warehouse IoT Phase 2", amount: "75000", stage: "closed-lost", closeDate: daysAgo(5).toISOString().slice(0, 10), contact: "Mette Andersen" },
  { name: "Fjord Analytics - ML Pipeline Setup", amount: "35000", stage: "negotiation", closeDate: daysAgo(-15).toISOString().slice(0, 10), contact: "Katarina Svensson" },
  { name: "Helsinki Health - Telemedicine Integration", amount: "15000", stage: "discovery", closeDate: daysAgo(-90).toISOString().slice(0, 10), contact: "Päivi Korhonen" },
];

const INVOICES = [
  { ref: "INV-2026-001", amount: "42500", status: "paid", dueDate: daysAgo(40).toISOString().slice(0, 10), paidDate: daysAgo(38).toISOString().slice(0, 10), deal: "Fjord Analytics - Data Platform Modernization" },
  { ref: "INV-2026-002", amount: "42500", status: "paid", dueDate: daysAgo(10).toISOString().slice(0, 10), paidDate: daysAgo(8).toISOString().slice(0, 10), deal: "Fjord Analytics - Data Platform Modernization" },
  { ref: "INV-2026-003", amount: "32500", status: "paid", dueDate: daysAgo(25).toISOString().slice(0, 10), paidDate: daysAgo(23).toISOString().slice(0, 10), deal: "Helsinki Health - Patient Portal V2" },
  { ref: "INV-2026-004", amount: "32500", status: "pending", dueDate: daysAgo(-5).toISOString().slice(0, 10), paidDate: null, deal: "Helsinki Health - Patient Portal V2" },
  { ref: "INV-2026-005", amount: "28500", status: "overdue", dueDate: daysAgo(18).toISOString().slice(0, 10), paidDate: null, deal: "Bergen Logistics - Route Optimization System" },
  { ref: "INV-2026-006", amount: "15000", status: "paid", dueDate: daysAgo(50).toISOString().slice(0, 10), paidDate: daysAgo(48).toISOString().slice(0, 10), deal: "Fjord Analytics - Data Platform Modernization" },
  { ref: "INV-2026-007", amount: "5000", status: "paid", dueDate: daysAgo(35).toISOString().slice(0, 10), paidDate: daysAgo(33).toISOString().slice(0, 10), deal: "Copenhagen Financial - Compliance Dashboard" },
  { ref: "INV-2026-008", amount: "45000", status: "pending", dueDate: daysAgo(-14).toISOString().slice(0, 10), paidDate: null, deal: "Malmö Retail - E-commerce Replatform" },
  { ref: "INV-2026-009", amount: "8500", status: "overdue", dueDate: daysAgo(7).toISOString().slice(0, 10), paidDate: null, deal: "Helsinki Health - Patient Portal V2" },
  { ref: "INV-2026-010", amount: "12000", status: "paid", dueDate: daysAgo(20).toISOString().slice(0, 10), paidDate: daysAgo(18).toISOString().slice(0, 10), deal: "Bergen Logistics - Route Optimization System" },
];

const PAYMENTS = [
  { ref: "PAY-001", amount: "42500", date: daysAgo(38).toISOString().slice(0, 10), invoice: "INV-2026-001" },
  { ref: "PAY-002", amount: "42500", date: daysAgo(8).toISOString().slice(0, 10), invoice: "INV-2026-002" },
  { ref: "PAY-003", amount: "32500", date: daysAgo(23).toISOString().slice(0, 10), invoice: "INV-2026-003" },
  { ref: "PAY-004", amount: "15000", date: daysAgo(48).toISOString().slice(0, 10), invoice: "INV-2026-006" },
  { ref: "PAY-005", amount: "5000", date: daysAgo(33).toISOString().slice(0, 10), invoice: "INV-2026-007" },
  { ref: "PAY-006", amount: "12000", date: daysAgo(18).toISOString().slice(0, 10), invoice: "INV-2026-010" },
];

const PROJECTS = [
  { name: "Fjord Analytics - Data Platform Modernization", status: "active", startDate: daysAgo(60).toISOString().slice(0, 10), endDate: daysAgo(-30).toISOString().slice(0, 10), budget: "85000", dept: "Delivery & Engineering" },
  { name: "Helsinki Health - Patient Portal V2", status: "at-risk", startDate: daysAgo(45).toISOString().slice(0, 10), endDate: daysAgo(-10).toISOString().slice(0, 10), budget: "65000", dept: "Delivery & Engineering" },
  { name: "Bergen Logistics - Route Optimization Discovery", status: "active", startDate: daysAgo(14).toISOString().slice(0, 10), endDate: daysAgo(-30).toISOString().slice(0, 10), budget: "25000", dept: "Delivery & Engineering" },
  { name: "Malmö Retail - E-commerce Replatform Planning", status: "planning", startDate: daysAgo(-7).toISOString().slice(0, 10), endDate: daysAgo(-120).toISOString().slice(0, 10), budget: "95000", dept: "Delivery & Engineering" },
  { name: "Copenhagen Financial - Compliance Dashboard Discovery", status: "active", startDate: daysAgo(7).toISOString().slice(0, 10), endDate: daysAgo(-21).toISOString().slice(0, 10), budget: "15000", dept: "Delivery & Engineering" },
];

// ── Document Content ────────────────────────────────────────────────

const DOCUMENTS: Array<{
  name: string;
  dept: string;
  docType: string;
  content: string;
}> = [
  // Sales & Partnerships
  {
    name: "Nordic Digital - Sales Team Structure.md",
    dept: "Sales & Partnerships",
    docType: "org-chart",
    content: `# Sales & Partnerships Team Structure

Erik Lindström leads the Sales & Partnerships team as Head of Sales, reporting directly to the CEO. The team is structured around two functions: direct sales and partnerships. Anna Bergström and Lars Johansson handle direct client sales as Senior Account Executive and Account Executive respectively, with Anna focusing on enterprise accounts and Lars managing the mid-market segment.

Maja Nielsen drives top-of-funnel as Business Development Representative, qualifying inbound leads and running outbound campaigns targeting Nordic mid-market companies. Sofia Dahl manages the partnerships function, maintaining relationships with technology vendors, implementation partners, and referral networks across the Nordics.

Henrik Olsson from Delivery also participates in technical pre-sales, joining discovery calls for complex engagements requiring architectural assessment.`,
  },
  {
    name: "Sales Process & Methodology.md",
    dept: "Sales & Partnerships",
    docType: "context",
    content: `# Sales Process & Methodology

Nordic Digital follows a consultative sales process with five stages: Discovery, Qualification, Proposal, Negotiation, and Close. Discovery calls are structured around understanding the client's digital maturity, current pain points, and strategic priorities. We never lead with technology — we lead with business outcomes.

Qualification uses the BANT framework adapted for consulting: Budget (is there allocated project budget or do we need to help build the business case?), Authority (are we talking to the decision maker or an influencer?), Need (is the pain acute enough to warrant external help?), and Timeline (is there a forcing function like a board deadline or competitive pressure?).

Proposals are built collaboratively with the Delivery team. Every proposal over €50,000 requires a technical review from Henrik or Oscar. We use fixed-price for well-defined scopes and time-and-materials for discovery and advisory engagements. Standard payment terms are 50% upfront, 50% on completion, with monthly billing for retainers.`,
  },
  {
    name: "Client Engagement Framework.md",
    dept: "Sales & Partnerships",
    docType: "context",
    content: `# Client Engagement Framework

Our client engagement model focuses on building long-term advisory relationships rather than one-off project delivery. Every client gets a named Account Executive as their primary relationship owner, supported by a delivery lead for active projects.

We run quarterly business reviews (QBRs) with all active clients to discuss project progress, upcoming initiatives, and industry trends. Between QBRs, the account executive maintains monthly touchpoints — a mix of informal check-ins, content sharing, and event invitations. The goal is to ensure no client goes more than 30 days without meaningful interaction.

Client health is tracked using three signals: engagement frequency (are they responding and meeting?), project satisfaction (NPS after each milestone), and pipeline activity (are we discussing next steps?). A "cooling" flag is raised when engagement drops below our 30-day threshold, triggering a proactive outreach sequence.`,
  },
  {
    name: "Partnership Program Overview.md",
    dept: "Sales & Partnerships",
    docType: "context",
    content: `# Partnership Program Overview

Nordic Digital maintains three tiers of partnerships: Technology Partners (vendors whose platforms we implement), Delivery Partners (specialized firms we subcontract to for niche skills), and Referral Partners (complementary consultancies and advisors).

Technology partnerships with HubSpot, Stripe, and Google Cloud provide us with deal registration, co-marketing opportunities, and early access to product roadmaps. These partnerships generate roughly 25% of our pipeline through vendor referrals. Sofia Dahl manages all partnership relationships and tracks referral revenue attribution.

Delivery partners are engaged for specialized work outside our core stack — native mobile development, data science, and infrastructure security audits. We maintain framework agreements with three Nordic firms to ensure rapid scaling when project demands exceed our internal capacity.`,
  },
  // Delivery & Engineering
  {
    name: "Engineering Team Structure.md",
    dept: "Delivery & Engineering",
    docType: "org-chart",
    content: `# Delivery & Engineering Team Structure

Henrik Olsson leads the Delivery & Engineering team as Head of Delivery, responsible for all client project delivery and engineering standards. The team combines project management and hands-on engineering under a single leadership structure to minimize handoff friction.

Frida Eklund serves as Senior Project Manager, owning the delivery timeline and client communication for all active projects. Oscar Nyström is Tech Lead, responsible for architecture decisions, code quality standards, and technical mentorship. Together they form the delivery leadership pair for each major engagement.

The engineering squad consists of Emil Andersson (Full Stack Developer), Klara Virtanen (UX Designer), Noah Pettersson (DevOps Engineer), and Astrid Magnusson (Junior Developer). Team members are assigned to projects based on skill requirements, with most engineers working on 1-2 projects simultaneously. Oscar and Emil handle the bulk of implementation work, while Klara ensures every deliverable meets our UX standards.`,
  },
  {
    name: "Project Delivery Playbook.md",
    dept: "Delivery & Engineering",
    docType: "context",
    content: `# Project Delivery Playbook

Every engagement follows our four-phase delivery model: Discover, Design, Deliver, and Operate. Discovery (1-2 weeks) produces a technical assessment and solution architecture. Design (2-4 weeks) produces wireframes, data models, and a detailed project plan. Deliver (4-16 weeks) is iterative development in 2-week sprints. Operate (ongoing) covers post-launch support and optimization.

Project health is tracked weekly using three metrics: scope adherence (are we building what was agreed?), timeline confidence (will we hit the milestone dates?), and budget burn rate (are we tracking to the estimated hours?). Projects are flagged "at-risk" when any metric deviates more than 15% from plan. At-risk projects get a weekly steering committee review with Henrik and the account executive.

Client communication follows a strict cadence: weekly status emails every Friday, bi-weekly demo sessions, and monthly steering committee calls. All project artifacts are stored in our shared workspace with the client. We never let a client be surprised — if there's a problem, they hear about it from us before they notice it themselves.`,
  },
  {
    name: "Technical Standards & Stack.md",
    dept: "Delivery & Engineering",
    docType: "context",
    content: `# Technical Standards & Stack

Our core technology stack is TypeScript across the full stack: Next.js for web applications, Node.js for backend services, and PostgreSQL for data storage. We use Tailwind CSS for styling, Prisma as our ORM, and deploy primarily to Vercel or AWS depending on client requirements.

All code must pass automated linting (ESLint + Prettier), type checking (strict TypeScript), and have meaningful test coverage for business logic. We target 80% coverage for utility libraries and API routes, with integration tests for critical user flows. Pull requests require at least one review from Oscar or another senior engineer.

For infrastructure, Noah maintains our standard deployment pipeline: GitHub Actions for CI/CD, PostgreSQL on Neon or RDS, Redis for caching and queues, and S3-compatible storage for file uploads. Every project gets a staging environment that mirrors production, and we use feature flags for gradual rollouts on larger engagements.`,
  },
  {
    name: "Code Review Guidelines.md",
    dept: "Delivery & Engineering",
    docType: "context",
    content: `# Code Review Guidelines

Code review is mandatory for all changes before merging to the main branch. Reviews should evaluate four dimensions: correctness (does it work?), clarity (can someone else understand it in six months?), performance (are there obvious bottlenecks?), and security (are inputs validated, are queries parameterized?).

Reviewers should provide constructive feedback. Use "nit:" for style preferences, "suggestion:" for improvements that aren't blocking, and "blocker:" for issues that must be fixed before merge. Every review should include at least one positive comment — we learn from what works well, not just from mistakes.

Turnaround time for reviews is 24 hours maximum. If a PR sits unreviewed for more than a day, ping the reviewer directly. For urgent fixes (production bugs, security patches), tag the PR as "urgent" and expect same-day review. Oscar is the final escalation point for any review disagreements.`,
  },
  // Finance & Operations
  {
    name: "Financial Processes & Controls.md",
    dept: "Finance & Operations",
    docType: "context",
    content: `# Financial Processes & Controls

Nordic Digital operates on a monthly financial close cycle. Ingrid Svensson as CFO owns the financial strategy, cash flow management, and board reporting. Viktor Holmberg manages day-to-day accounting, invoicing, and expense processing. All invoices are issued via Stripe Billing with net-30 payment terms unless otherwise negotiated.

Revenue recognition follows the percentage-of-completion method for fixed-price projects and straight-line for retainers. Time-and-materials engagements are billed monthly based on tracked hours. Any invoice over €25,000 requires Ingrid's explicit approval before sending. Overdue invoices trigger a three-step collection process: friendly reminder at 7 days, formal notice at 14 days, and escalation to the account executive at 21 days.

Cash flow forecasting is updated weekly using a rolling 13-week model that incorporates confirmed revenue, pipeline-weighted expected revenue, and committed expenses. Erik Lindström participates in the monthly revenue forecast meeting to provide pipeline visibility from the sales side.`,
  },
  {
    name: "Expense Policy.md",
    dept: "Finance & Operations",
    docType: "context",
    content: `# Expense Policy

All business expenses must be submitted within 30 days of the transaction via our expense tracking system. Receipts are required for any expense over €50. Department heads can approve expenses up to €2,000; anything above requires CFO approval from Ingrid.

Travel expenses follow these guidelines: economy class for flights under 4 hours, business class permitted for longer flights with manager pre-approval. Hotel budgets are €180/night for Nordic capitals and €150/night for other locations. Client entertainment expenses must include the client name, company, and business purpose.

Software and subscription purchases must be reviewed by Oscar (for engineering tools) or the relevant department head before committing. Annual subscriptions over €1,000 require a brief business case documenting the need, alternatives considered, and expected ROI. Elsa Karlsson maintains the subscription register and flags renewals 30 days before expiry.`,
  },
  {
    name: "Quarterly Reporting Template.md",
    dept: "Finance & Operations",
    docType: "context",
    content: `# Quarterly Reporting Template

Our quarterly business review covers five sections: Financial Performance, Pipeline & Revenue Forecast, Delivery Status, Team Capacity, and Strategic Initiatives. The report is prepared by Viktor with input from Erik (pipeline) and Henrik (delivery) and presented by Ingrid to the advisory board.

Financial Performance includes: revenue vs. target, gross margin by project type, operating expenses vs. budget, and cash position. Key metrics tracked quarter-over-quarter are average project margin (target: 55%), client retention rate (target: 90%), and revenue per consultant (target: €220K annualized).

The Pipeline & Revenue Forecast section shows weighted pipeline by stage, expected close dates, and quarter-end revenue projection with confidence intervals. Delivery Status summarizes active project health, utilization rates, and any scope or timeline risks. Team Capacity maps current allocation against the forward pipeline to identify hiring needs or bench risk.`,
  },
];

// ── Route Handler ───────────────────────────────────────────────────

export async function POST() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (session.user.role !== "superadmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    // Idempotent: clean up existing
    const existing = await prisma.operator.findFirst({ where: { companyName: COMPANY_NAME } });
    if (existing) await cleanupOperator(existing.id);

    const result = await createTestCompany();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to create test company:", error);
    return NextResponse.json(
      { error: "Failed to create test company", details: String(error) },
      { status: 500 },
    );
  }
}

// ── Cleanup ─────────────────────────────────────────────────────────

async function cleanupOperator(operatorId: string) {
  // Break entity self-references to avoid circular FK issues
  await prisma.entity.updateMany({
    where: { operatorId },
    data: { parentDepartmentId: null, mergedIntoId: null },
  });

  // Delete in reverse dependency order
  await prisma.situationEvent.deleteMany({ where: { situation: { operatorId } } });
  await prisma.situation.deleteMany({ where: { operatorId } });
  await prisma.situationType.deleteMany({ where: { operatorId } });
  await prisma.notification.deleteMany({ where: { operatorId } });
  await prisma.copilotMessage.deleteMany({ where: { operatorId } });
  await prisma.orientationSession.deleteMany({ where: { operatorId } });
  await prisma.policyRule.deleteMany({ where: { operatorId } });
  await prisma.actionCapability.deleteMany({ where: { operatorId } });
  await prisma.event.deleteMany({ where: { operatorId } });
  await prisma.syncLog.deleteMany({ where: { connector: { operatorId } } });
  await prisma.sourceConnector.deleteMany({ where: { operatorId } });
  await prisma.contentChunk.deleteMany({ where: { operatorId } });
  await prisma.internalDocument.deleteMany({ where: { operatorId } });
  await prisma.entityMention.deleteMany({ where: { entity: { operatorId } } });
  await prisma.propertyValue.deleteMany({ where: { entity: { operatorId } } });
  await prisma.relationship.deleteMany({ where: { relationshipType: { operatorId } } });
  await prisma.relationshipType.deleteMany({ where: { operatorId } });
  await prisma.invite.deleteMany({ where: { operatorId } });
  await prisma.userScope.deleteMany({ where: { user: { operatorId } } });
  await prisma.session.deleteMany({ where: { user: { operatorId } } });
  await prisma.user.deleteMany({ where: { operatorId } });
  await prisma.entity.deleteMany({ where: { operatorId } });
  await prisma.entityProperty.deleteMany({ where: { entityType: { operatorId } } });
  await prisma.entityType.deleteMany({ where: { operatorId } });
  await prisma.operator.delete({ where: { id: operatorId } });
}

// ── Main Creation ───────────────────────────────────────────────────

async function createTestCompany() {
  // ─── 1. Operator ──────────────────────────────────────────────
  const operator = await prisma.operator.create({
    data: {
      displayName: COMPANY_NAME,
      companyName: COMPANY_NAME,
      industry: INDUSTRY,
      isTestOperator: true,
    },
  });
  const opId = operator.id;

  // ─── 2. Admin User ───────────────────────────────────────────
  const pwHash = await hashPassword(ADMIN_PASSWORD);
  await prisma.user.create({
    data: {
      operatorId: opId,
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      passwordHash: pwHash,
      role: "admin",
    },
  });

  // ─── 3. Orientation Session (completed) ──────────────────────
  await prisma.orientationSession.create({
    data: {
      operatorId: opId,
      phase: "active",
      context: ORIENTATION_CONTEXT,
      completedAt: daysAgo(28),
    },
  });

  // ─── 4. Entity Types + Properties ────────────────────────────
  const typeIds: Record<string, string> = {};
  const propIds: Record<string, Record<string, string>> = {};

  for (const td of TYPE_DEFS) {
    const et = await prisma.entityType.create({
      data: {
        operatorId: opId,
        slug: td.slug,
        name: td.name,
        description: td.desc,
        icon: td.icon,
        color: td.color,
        defaultCategory: td.cat,
      },
    });
    typeIds[td.slug] = et.id;
    propIds[td.slug] = {};

    if (td.props) {
      for (let i = 0; i < td.props.length; i++) {
        const p = td.props[i];
        const prop = await prisma.entityProperty.create({
          data: {
            entityTypeId: et.id,
            slug: p.slug,
            name: p.name,
            dataType: p.dataType,
            displayOrder: i,
            identityRole: p.identityRole ?? null,
          },
        });
        propIds[td.slug][p.slug] = prop.id;
      }
    }
  }

  // ─── 5. Relationship Types ───────────────────────────────────
  const relTypeIds: Record<string, string> = {};
  for (const rt of REL_TYPE_DEFS) {
    const rel = await prisma.relationshipType.create({
      data: {
        operatorId: opId,
        slug: rt.slug,
        name: rt.name,
        fromEntityTypeId: typeIds[rt.from],
        toEntityTypeId: typeIds[rt.to],
      },
    });
    relTypeIds[rt.slug] = rel.id;
  }

  // ─── 6. Departments ──────────────────────────────────────────
  const deptIds: Record<string, string> = {};
  for (const d of DEPARTMENTS) {
    const dept = await prisma.entity.create({
      data: {
        operatorId: opId,
        entityTypeId: typeIds["department"],
        displayName: d.name,
        category: "foundational",
        description: d.desc,
        mapX: d.mapX,
        mapY: d.mapY,
      },
    });
    deptIds[d.name] = dept.id;
  }

  // ─── 6b. CompanyHQ (organization entity) ───────────────────
  await prisma.entity.create({
    data: {
      operatorId: opId,
      entityTypeId: typeIds["organization"],
      displayName: COMPANY_NAME,
      category: "foundational",
      description: "Company headquarters — Nordic Digital Solutions",
      mapX: 0,
      mapY: 0,
    },
  });

  // ─── 7. Team Members + Department Relations ──────────────────
  const memberIds: Record<string, string> = {};
  for (const m of TEAM_MEMBERS) {
    const entity = await prisma.entity.create({
      data: {
        operatorId: opId,
        entityTypeId: typeIds["team-member"],
        displayName: m.name,
        category: "base",
        parentDepartmentId: deptIds[m.dept],
      },
    });
    memberIds[m.name] = entity.id;

    await prisma.propertyValue.createMany({
      data: [
        { entityId: entity.id, propertyId: propIds["team-member"]["email"], value: m.email },
        { entityId: entity.id, propertyId: propIds["team-member"]["role"], value: m.role },
        { entityId: entity.id, propertyId: propIds["team-member"]["phone"], value: m.phone },
      ],
    });

    // Primary department-member relationship
    await prisma.relationship.create({
      data: {
        relationshipTypeId: relTypeIds["department-member"],
        fromEntityId: entity.id,
        toEntityId: deptIds[m.dept],
        metadata: JSON.stringify({ role: m.role }),
      },
    });
  }

  // Cross-department memberships
  for (const cd of CROSS_DEPT) {
    await prisma.relationship.create({
      data: {
        relationshipTypeId: relTypeIds["department-member"],
        fromEntityId: memberIds[cd.member],
        toEntityId: deptIds[cd.dept],
        metadata: JSON.stringify({ role: cd.role, crossDepartment: true }),
      },
    });
  }

  // ─── 8. Documents + Chunks ───────────────────────────────────
  for (const doc of DOCUMENTS) {
    const docEntity = await prisma.entity.create({
      data: {
        operatorId: opId,
        entityTypeId: typeIds["document"],
        displayName: doc.name,
        category: "internal",
        parentDepartmentId: deptIds[doc.dept],
        sourceSystem: "document-upload",
      },
    });

    await prisma.propertyValue.create({
      data: {
        entityId: docEntity.id,
        propertyId: propIds["document"]["document-type"],
        value: doc.docType,
      },
    });

    const internalDoc = await prisma.internalDocument.create({
      data: {
        operatorId: opId,
        fileName: doc.name,
        mimeType: "text/markdown",
        filePath: `/demo/${doc.name.replace(/ /g, "_")}`,
        rawText: doc.content,
        status: "extracted",
        embeddingStatus: "complete",
        documentType: doc.docType === "org-chart" ? "org-chart" : "context",
        departmentId: deptIds[doc.dept],
        entityId: docEntity.id,
      },
    });

    // Split content into ~3 chunks
    const lines = doc.content.split("\n").filter((l) => l.trim());
    const chunkSize = Math.ceil(lines.length / 3);
    const chunks = [0, 1, 2].map((i) =>
      lines.slice(i * chunkSize, (i + 1) * chunkSize).join("\n"),
    );

    for (let idx = 0; idx < chunks.length; idx++) {
      const text = chunks[idx];
      const created = await prisma.contentChunk.create({
        data: {
          operatorId: opId,
          sourceType: "uploaded_doc",
          sourceId: internalDoc.id,
          entityId: docEntity.id,
          departmentIds: JSON.stringify([deptIds[doc.dept]]),
          chunkIndex: idx,
          content: text,
          tokenCount: Math.round(text.length / 4),
          metadata: JSON.stringify({ fileName: doc.name, documentType: doc.docType }),
        },
        select: { id: true },
      });
      const embStr = dummyEmbedding();
      await prisma.$executeRawUnsafe(
        `UPDATE "ContentChunk" SET embedding = $1::vector WHERE id = $2`,
        embStr,
        created.id,
      );
    }
  }

  // ─── 9. Connectors + Department Bindings ─────────────────────
  const connectors: Record<string, string> = {};

  const hubspot = await prisma.sourceConnector.create({
    data: {
      operatorId: opId,
      provider: "hubspot",
      name: "HubSpot CRM",
      status: "active",
      config: JSON.stringify({ portalId: "demo-nordic-12345", apiKey: "***" }),
      lastSyncAt: daysAgo(0),
    },
  });
  connectors["hubspot"] = hubspot.id;

  const stripe = await prisma.sourceConnector.create({
    data: {
      operatorId: opId,
      provider: "stripe",
      name: "Stripe Billing",
      status: "active",
      config: JSON.stringify({ accountId: "acct_demo_nordic", liveMode: false }),
      lastSyncAt: daysAgo(0),
    },
  });
  connectors["stripe"] = stripe.id;

  const sheets = await prisma.sourceConnector.create({
    data: {
      operatorId: opId,
      provider: "google-sheets",
      name: "Project Tracker Sheet",
      status: "active",
      config: JSON.stringify({ spreadsheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms", sheetName: "Active Projects" }),
      lastSyncAt: daysAgo(0),
    },
  });
  connectors["google-sheets"] = sheets.id;

  // ─── 10. External Entities: Companies ────────────────────────
  const companyIds: Record<string, string> = {};
  for (const c of CLIENT_COMPANIES) {
    const entity = await prisma.entity.create({
      data: {
        operatorId: opId,
        entityTypeId: typeIds["company"],
        displayName: c.name,
        category: "external",
        sourceSystem: "hubspot",
        externalId: `hs-company-${c.domain.split(".")[0]}`,
      },
    });
    companyIds[c.name] = entity.id;

    await prisma.propertyValue.createMany({
      data: [
        { entityId: entity.id, propertyId: propIds["company"]["domain"], value: c.domain },
        { entityId: entity.id, propertyId: propIds["company"]["industry"], value: c.industry },
        { entityId: entity.id, propertyId: propIds["company"]["revenue"], value: c.revenue },
        { entityId: entity.id, propertyId: propIds["company"]["employee-count"], value: c.employees },
      ],
    });
  }

  // ─── 11. External Entities: Contacts ─────────────────────────
  const contactIds: Record<string, string> = {};
  for (const c of CLIENT_CONTACTS) {
    const entity = await prisma.entity.create({
      data: {
        operatorId: opId,
        entityTypeId: typeIds["contact"],
        displayName: c.name,
        category: "external",
        sourceSystem: "hubspot",
        externalId: `hs-contact-${c.email.split("@")[0].replace(/\./g, "-")}`,
      },
    });
    contactIds[c.name] = entity.id;

    await prisma.propertyValue.createMany({
      data: [
        { entityId: entity.id, propertyId: propIds["contact"]["email"], value: c.email },
        { entityId: entity.id, propertyId: propIds["contact"]["phone"], value: c.phone },
        { entityId: entity.id, propertyId: propIds["contact"]["job-title"], value: c.title },
      ],
    });

    // Contact → Company relationship
    await prisma.relationship.create({
      data: {
        relationshipTypeId: relTypeIds["contact-company"],
        fromEntityId: entity.id,
        toEntityId: companyIds[c.company],
      },
    });
  }

  // ─── 12. Digital Entities: Deals ─────────────────────────────
  const dealIds: Record<string, string> = {};
  for (const d of DEALS) {
    const entity = await prisma.entity.create({
      data: {
        operatorId: opId,
        entityTypeId: typeIds["deal"],
        displayName: d.name,
        category: "digital",
        sourceSystem: "hubspot",
        externalId: `hs-deal-${d.name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 40)}`,
      },
    });
    dealIds[d.name] = entity.id;

    await prisma.propertyValue.createMany({
      data: [
        { entityId: entity.id, propertyId: propIds["deal"]["amount"], value: d.amount },
        { entityId: entity.id, propertyId: propIds["deal"]["stage"], value: d.stage },
        { entityId: entity.id, propertyId: propIds["deal"]["close-date"], value: d.closeDate },
        { entityId: entity.id, propertyId: propIds["deal"]["pipeline"], value: "default" },
      ],
    });

    // Deal → Contact relationship
    await prisma.relationship.create({
      data: {
        relationshipTypeId: relTypeIds["deal-contact"],
        fromEntityId: entity.id,
        toEntityId: contactIds[d.contact],
      },
    });

    // Digital entities link to departments via department-member relationship
    await prisma.relationship.create({
      data: {
        relationshipTypeId: relTypeIds["department-member"],
        fromEntityId: entity.id,
        toEntityId: deptIds["Sales & Partnerships"],
      },
    });
  }

  // ─── 13. Digital Entities: Invoices ──────────────────────────
  const invoiceIds: Record<string, string> = {};
  for (const inv of INVOICES) {
    const entity = await prisma.entity.create({
      data: {
        operatorId: opId,
        entityTypeId: typeIds["invoice"],
        displayName: inv.ref,
        category: "digital",
        sourceSystem: "stripe",
        externalId: `stripe-inv-${inv.ref.toLowerCase()}`,
      },
    });
    invoiceIds[inv.ref] = entity.id;

    const pvData = [
      { entityId: entity.id, propertyId: propIds["invoice"]["amount"], value: inv.amount },
      { entityId: entity.id, propertyId: propIds["invoice"]["status"], value: inv.status },
      { entityId: entity.id, propertyId: propIds["invoice"]["due-date"], value: inv.dueDate },
      { entityId: entity.id, propertyId: propIds["invoice"]["currency"], value: "EUR" },
    ];
    if (inv.paidDate) {
      pvData.push(
        { entityId: entity.id, propertyId: propIds["invoice"]["paid-date"], value: inv.paidDate },
        { entityId: entity.id, propertyId: propIds["invoice"]["amount-paid"], value: inv.amount },
      );
    }
    await prisma.propertyValue.createMany({ data: pvData });

    // Invoice → Contact (via the deal's contact)
    const deal = DEALS.find((dd) => dd.name === inv.deal);
    if (deal) {
      await prisma.relationship.create({
        data: {
          relationshipTypeId: relTypeIds["invoice-contact"],
          fromEntityId: entity.id,
          toEntityId: contactIds[deal.contact],
        },
      });
    }

    // Digital entity → department via department-member relationship
    await prisma.relationship.create({
      data: {
        relationshipTypeId: relTypeIds["department-member"],
        fromEntityId: entity.id,
        toEntityId: deptIds["Finance & Operations"],
      },
    });
  }

  // ─── 14. Digital Entities: Payments ──────────────────────────
  const paymentIds: Record<string, string> = {};
  for (const p of PAYMENTS) {
    const entity = await prisma.entity.create({
      data: {
        operatorId: opId,
        entityTypeId: typeIds["payment"],
        displayName: p.ref,
        category: "digital",
        sourceSystem: "stripe",
        externalId: `stripe-pay-${p.ref.toLowerCase()}`,
      },
    });
    paymentIds[p.ref] = entity.id;

    await prisma.propertyValue.createMany({
      data: [
        { entityId: entity.id, propertyId: propIds["payment"]["amount"], value: p.amount },
        { entityId: entity.id, propertyId: propIds["payment"]["currency"], value: "EUR" },
        { entityId: entity.id, propertyId: propIds["payment"]["status"], value: "completed" },
        { entityId: entity.id, propertyId: propIds["payment"]["payment-date"], value: p.date },
      ],
    });

    // Payment → Invoice relationship
    await prisma.relationship.create({
      data: {
        relationshipTypeId: relTypeIds["payment-invoice"],
        fromEntityId: entity.id,
        toEntityId: invoiceIds[p.invoice],
      },
    });

    // Digital entity → department via department-member relationship
    await prisma.relationship.create({
      data: {
        relationshipTypeId: relTypeIds["department-member"],
        fromEntityId: entity.id,
        toEntityId: deptIds["Finance & Operations"],
      },
    });
  }

  // ─── 15. Digital Entities: Projects ──────────────────────────
  const projectIds: Record<string, string> = {};
  for (const proj of PROJECTS) {
    const entity = await prisma.entity.create({
      data: {
        operatorId: opId,
        entityTypeId: typeIds["project"],
        displayName: proj.name,
        category: "digital",
        sourceSystem: "google-sheets",
        externalId: `sheet-proj-${proj.name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 40)}`,
      },
    });
    projectIds[proj.name] = entity.id;

    await prisma.propertyValue.createMany({
      data: [
        { entityId: entity.id, propertyId: propIds["project"]["status"], value: proj.status },
        { entityId: entity.id, propertyId: propIds["project"]["start-date"], value: proj.startDate },
        { entityId: entity.id, propertyId: propIds["project"]["end-date"], value: proj.endDate },
        { entityId: entity.id, propertyId: propIds["project"]["budget"], value: proj.budget },
      ],
    });

    // Project → Department relationship (semantic)
    await prisma.relationship.create({
      data: {
        relationshipTypeId: relTypeIds["project-department"],
        fromEntityId: entity.id,
        toEntityId: deptIds[proj.dept],
      },
    });

    // Digital entity → department via department-member relationship (scope routing)
    await prisma.relationship.create({
      data: {
        relationshipTypeId: relTypeIds["department-member"],
        fromEntityId: entity.id,
        toEntityId: deptIds[proj.dept],
      },
    });
  }

  // ─── 16. Situation Types ─────────────────────────────────────
  const sitTypeIds: Record<string, string> = {};

  const SITUATION_TYPES = [
    {
      slug: "overdue-invoice-followup", name: "Overdue Invoice Follow-up",
      desc: "Detects invoices that are overdue by more than 14 days and proposes follow-up actions",
      detection: {
        mode: "hybrid",
        structured: {
          entityType: "invoice",
          signals: [
            { field: "status", condition: "equals", value: "overdue" },
            { field: "due-date", condition: "days_past", threshold: 14 },
          ],
        },
        naturalLanguage: "Invoice that is overdue by more than 14 days and needs a follow-up reminder sent to the customer",
      },
      response: { action: "send_payment_reminder", channel: "email" },
      autonomy: "supervised", dept: "Finance & Operations",
    },
    {
      slug: "stale-deal-alert", name: "Stale Deal Alert",
      desc: "Flags deals in negotiation stage with no update for more than 21 days",
      detection: {
        mode: "hybrid",
        structured: {
          entityType: "deal",
          signals: [
            { field: "stage", condition: "equals", value: "negotiation" },
          ],
        },
        naturalLanguage: "Deal stuck in negotiation stage with no recent activity or updates for over 21 days",
      },
      response: { action: "notify_account_executive", channel: "internal" },
      autonomy: "supervised", dept: "Sales & Partnerships",
    },
    {
      slug: "client-relationship-cooling", name: "Client Relationship Cooling",
      desc: "Alerts when a client contact has had no meaningful interaction for over 30 days",
      detection: {
        mode: "natural",
        preFilter: {
          entityType: "contact",
          signals: [],
        },
        naturalLanguage: "Client contact with no meaningful interaction for over 30 days, indicating the relationship may be cooling and needs a touchpoint",
      },
      response: { action: "schedule_touchpoint", channel: "internal" },
      autonomy: "supervised", dept: "Sales & Partnerships",
    },
    {
      slug: "project-delivery-risk", name: "Project Delivery Risk",
      desc: "Flags projects that are at-risk or over budget, requiring delivery leadership attention",
      detection: {
        mode: "natural",
        preFilter: {
          entityType: "deal",
          signals: [],
        },
        naturalLanguage: "Project that is at-risk, over budget, or showing signs of delivery problems requiring leadership attention",
      },
      response: { action: "escalate_to_delivery_lead", channel: "internal" },
      autonomy: "supervised", dept: "Delivery & Engineering",
    },
    {
      slug: "large-invoice-approval", name: "Large Invoice Approval Required",
      desc: "Requires manual CFO approval for invoices exceeding €25,000 before sending",
      detection: {
        mode: "structured",
        structured: {
          entityType: "invoice",
          signals: [
            { field: "amount", condition: "greater_than", threshold: 25000 },
          ],
        },
      },
      response: { action: "route_to_cfo", channel: "internal" },
      autonomy: "supervised", dept: "Finance & Operations",
    },
    {
      slug: "new-deal-created", name: "New Deal Created",
      desc: "Notifies team when a new deal enters the discovery stage within the last 24 hours",
      detection: {
        mode: "hybrid",
        structured: {
          entityType: "deal",
          signals: [
            { field: "stage", condition: "equals", value: "discovery" },
          ],
        },
        naturalLanguage: "New deal that has entered the discovery stage within the last 24 hours",
      },
      response: { action: "notify_sales_team", channel: "internal" },
      autonomy: "notify", dept: "Sales & Partnerships",
      totalProposed: 12, totalApproved: 12, consecutiveApprovals: 12, approvalRate: 0.95,
    },
    {
      slug: "payment-received", name: "Payment Received",
      desc: "Automatically acknowledges completed payments and updates related records",
      detection: {
        mode: "structured",
        structured: {
          entityType: "payment",
          signals: [
            { field: "status", condition: "equals", value: "completed" },
          ],
        },
      },
      response: { action: "acknowledge_payment", channel: "system" },
      autonomy: "autonomous", dept: "Finance & Operations",
      totalProposed: 22, totalApproved: 22, consecutiveApprovals: 22, approvalRate: 0.98,
    },
    {
      slug: "project-milestone-reached", name: "Project Milestone Reached",
      desc: "Notifies stakeholders when a project milestone is completed",
      detection: {
        mode: "natural",
        preFilter: {
          entityType: "deal",
          signals: [],
        },
        naturalLanguage: "Project where a significant milestone has been completed and stakeholders should be notified",
      },
      response: { action: "notify_stakeholders", channel: "internal" },
      autonomy: "notify", dept: "Delivery & Engineering",
    },
  ];

  for (const st of SITUATION_TYPES) {
    const sitType = await prisma.situationType.create({
      data: {
        operatorId: opId,
        slug: st.slug,
        name: st.name,
        description: st.desc,
        detectionLogic: JSON.stringify(st.detection),
        responseStrategy: JSON.stringify(st.response),
        autonomyLevel: st.autonomy,
        scopeEntityId: deptIds[st.dept],
        enabled: true,
        totalProposed: (st as Record<string, unknown>).totalProposed as number ?? 0,
        totalApproved: (st as Record<string, unknown>).totalApproved as number ?? 0,
        consecutiveApprovals: (st as Record<string, unknown>).consecutiveApprovals as number ?? 0,
        approvalRate: (st as Record<string, unknown>).approvalRate as number ?? 0,
      },
    });
    sitTypeIds[st.slug] = sitType.id;
  }

  // ─── 17. Situations ──────────────────────────────────────────
  const situations = [
    // 3 Proposed (pending review)
    {
      typeSlug: "overdue-invoice-followup",
      trigger: invoiceIds["INV-2026-005"],
      severity: 0.8, confidence: 0.85,
      status: "proposed",
      context: { entity: "INV-2026-005", amount: 28500, daysOverdue: 18, client: "Bergen Logistics" },
      reasoning: {
        analysis: "Invoice INV-2026-005 for €28,500 has been overdue for 18 days. Bergen Logistics typically pays within 10 days of the due date. This deviation from their normal payment pattern suggests a potential issue — either the invoice was missed or there's a dispute.",
        consideredActions: ["Send automated payment reminder", "Escalate to account executive", "Wait for another week"],
        confidence: 0.85,
        missingContext: ["Recent support tickets from Bergen Logistics", "Any ongoing contract renegotiations"],
      },
      proposedAction: {
        action: "send_payment_reminder",
        justification: "Standard 14-day overdue follow-up. Bergen Logistics has no history of payment disputes, so a friendly reminder is the appropriate first step.",
        params: { recipient: "anders.berg@bergenlogistics.no", template: "overdue_reminder_friendly" },
      },
      createdAt: daysAgo(1),
    },
    {
      typeSlug: "stale-deal-alert",
      trigger: dealIds["Bergen Logistics - Route Optimization System"],
      severity: 0.6, confidence: 0.75,
      status: "proposed",
      context: { entity: "Bergen Logistics - Route Optimization System", amount: 120000, daysSinceUpdate: 25, stage: "negotiation" },
      reasoning: {
        analysis: "The Bergen Logistics Route Optimization deal (€120,000) has been in negotiation for 25 days without any recorded activity. The average negotiation duration for deals this size is 14 days. Anders Berg was last contacted 25 days ago.",
        consideredActions: ["Notify Erik to schedule check-in", "Send automated status request", "Mark as at-risk"],
        confidence: 0.75,
        missingContext: ["Whether Anders is on leave", "Any parallel conversations via phone/in-person"],
      },
      proposedAction: {
        action: "notify_account_executive",
        justification: "25 days without activity on a six-figure deal warrants immediate attention from Erik Lindström.",
        params: { notify: "erik.lindstrom@nordicdigital.com", dealName: "Bergen Logistics - Route Optimization System" },
      },
      createdAt: daysAgo(0),
    },
    {
      typeSlug: "large-invoice-approval",
      trigger: invoiceIds["INV-2026-008"],
      severity: 0.5, confidence: 0.95,
      status: "proposed",
      context: { entity: "INV-2026-008", amount: 45000, client: "Malmö Retail Group" },
      reasoning: {
        analysis: "Invoice INV-2026-008 for €45,000 exceeds the €25,000 threshold requiring CFO approval. This is a deposit invoice for the Malmö Retail E-commerce Replatform project, which is in the proposal stage.",
        consideredActions: ["Route to CFO for approval", "Hold until contract is signed"],
        confidence: 0.95,
        missingContext: [],
      },
      proposedAction: {
        action: "route_to_cfo",
        justification: "Company policy requires Ingrid Svensson's approval for all invoices exceeding €25,000.",
        params: { approver: "ingrid.svensson@nordicdigital.com", invoiceRef: "INV-2026-008" },
      },
      createdAt: daysAgo(2),
    },

    // 4 Approved (positive outcomes)
    {
      typeSlug: "payment-received",
      trigger: paymentIds["PAY-006"],
      severity: 0.1, confidence: 0.99,
      status: "resolved",
      context: { entity: "PAY-006", amount: 12000, client: "Bergen Logistics", invoice: "INV-2026-010" },
      reasoning: {
        analysis: "Payment of €12,000 received from Bergen Logistics for INV-2026-010 (Phase 1 closeout). Payment was made 2 days before the due date.",
        consideredActions: ["Update records and notify finance"],
        confidence: 0.99,
        missingContext: [],
      },
      proposedAction: { action: "acknowledge_payment", justification: "Routine payment acknowledgment", params: {} },
      actionTaken: { action: "acknowledge_payment", result: "success", executedAt: daysAgo(18).toISOString() },
      outcome: "positive",
      outcomeDetails: { resolved: "auto", note: "Payment recorded and deal status updated" },
      resolvedAt: daysAgo(18),
      createdAt: daysAgo(18),
    },
    {
      typeSlug: "new-deal-created",
      trigger: dealIds["Copenhagen Financial - Compliance Dashboard"],
      severity: 0.3, confidence: 0.95,
      status: "resolved",
      context: { entity: "Copenhagen Financial - Compliance Dashboard", amount: 45000, stage: "discovery" },
      reasoning: {
        analysis: "New deal created: Copenhagen Financial - Compliance Dashboard (€45,000). Niels Christensen (CFO) is the primary contact. This aligns with our target segment of Nordic financial services companies.",
        consideredActions: ["Notify sales team"],
        confidence: 0.95,
        missingContext: [],
      },
      proposedAction: { action: "notify_sales_team", justification: "New discovery-stage deal from a high-value prospect", params: {} },
      actionTaken: { action: "notify_sales_team", result: "success", executedAt: daysAgo(7).toISOString() },
      outcome: "positive",
      outcomeDetails: { resolved: "approved", note: "Erik and Anna notified, discovery call scheduled" },
      resolvedAt: daysAgo(7),
      createdAt: daysAgo(7),
    },
    {
      typeSlug: "client-relationship-cooling",
      trigger: contactIds["Mikko Lahtinen"],
      severity: 0.5, confidence: 0.7,
      status: "resolved",
      context: { entity: "Mikko Lahtinen", company: "Helsinki Health Tech", daysSilent: 32, lastInteraction: daysAgo(37).toISOString() },
      reasoning: {
        analysis: "Mikko Lahtinen (CEO, Helsinki Health Tech) has had no recorded interaction for 32 days. They have an active project (Patient Portal V2) and a pending invoice. The relationship should be warmer given the active engagement.",
        consideredActions: ["Schedule quarterly review call", "Send industry insight email", "Ask delivery team for informal update"],
        confidence: 0.7,
        missingContext: ["Whether Frida has had informal calls about the project"],
      },
      proposedAction: { action: "schedule_touchpoint", justification: "Active client with cooling engagement signals", params: { type: "quarterly_review" } },
      actionTaken: { action: "schedule_touchpoint", result: "success", executedAt: daysAgo(5).toISOString() },
      outcome: "positive",
      outcomeDetails: { resolved: "approved", note: "Erik scheduled a quarterly review call for next week" },
      resolvedAt: daysAgo(5),
      createdAt: daysAgo(5),
    },
    {
      typeSlug: "project-milestone-reached",
      trigger: projectIds["Fjord Analytics - Data Platform Modernization"],
      severity: 0.2, confidence: 0.9,
      status: "resolved",
      context: { entity: "Fjord Analytics - Data Platform Modernization", milestone: "Phase 1 Complete", budget: 85000 },
      reasoning: {
        analysis: "The Fjord Analytics Data Platform Modernization project has completed Phase 1 (data migration and schema redesign). The project is on track and within budget.",
        consideredActions: ["Notify stakeholders"],
        confidence: 0.9,
        missingContext: [],
      },
      proposedAction: { action: "notify_stakeholders", justification: "Milestone completion warrants team and client notification", params: {} },
      actionTaken: { action: "notify_stakeholders", result: "success", executedAt: daysAgo(10).toISOString() },
      outcome: "positive",
      outcomeDetails: { resolved: "approved", note: "Team notified, client sent milestone summary" },
      resolvedAt: daysAgo(10),
      createdAt: daysAgo(10),
    },

    // 2 Rejected
    {
      typeSlug: "stale-deal-alert",
      trigger: dealIds["Fjord Analytics - ML Pipeline Setup"],
      severity: 0.4, confidence: 0.6,
      status: "rejected",
      context: { entity: "Fjord Analytics - ML Pipeline Setup", amount: 35000, daysSinceUpdate: 22, stage: "negotiation" },
      reasoning: {
        analysis: "The Fjord Analytics ML Pipeline deal (€35,000) has been in negotiation for 22 days without recorded updates.",
        consideredActions: ["Notify Erik", "Send status check"],
        confidence: 0.6,
        missingContext: ["Holiday schedule for Fjord team"],
      },
      proposedAction: { action: "notify_account_executive", justification: "22 days without activity", params: {} },
      feedback: "Not severe enough — Katarina mentioned they're on summer planning break. Deal is progressing fine, expect response next week.",
      feedbackRating: 2,
      feedbackCategory: "detection_wrong",
      createdAt: daysAgo(3),
    },
    {
      typeSlug: "client-relationship-cooling",
      trigger: contactIds["Niels Christensen"],
      severity: 0.45, confidence: 0.65,
      status: "rejected",
      context: { entity: "Niels Christensen", company: "Copenhagen Financial", daysSilent: 35 },
      reasoning: {
        analysis: "Niels Christensen (CFO, Copenhagen Financial) has had no recorded interaction for 35 days despite having an active deal in discovery.",
        consideredActions: ["Schedule call", "Send email"],
        confidence: 0.65,
        missingContext: ["In-person meetings not logged in CRM"],
      },
      proposedAction: { action: "schedule_touchpoint", justification: "35 days of silence with active prospect", params: {} },
      feedback: "Already handled manually — met Niels at the FinTech Nordic conference last week. Need to log the interaction in HubSpot.",
      feedbackRating: 3,
      feedbackCategory: "missing_context",
      createdAt: daysAgo(6),
    },

    // 2 Auto-resolved
    {
      typeSlug: "payment-received",
      trigger: paymentIds["PAY-001"],
      severity: 0.1, confidence: 0.99,
      status: "resolved",
      context: { entity: "PAY-001", amount: 42500, invoice: "INV-2026-001" },
      reasoning: { analysis: "Payment €42,500 received for INV-2026-001.", consideredActions: ["Acknowledge"], confidence: 0.99, missingContext: [] },
      proposedAction: { action: "acknowledge_payment", justification: "Routine", params: {} },
      actionTaken: { action: "acknowledge_payment", result: "success", executedAt: daysAgo(38).toISOString() },
      outcome: "positive",
      outcomeDetails: { resolvedBy: "auto", note: "Autonomous payment acknowledgment" },
      resolvedAt: daysAgo(38),
      createdAt: daysAgo(38),
    },
    {
      typeSlug: "payment-received",
      trigger: paymentIds["PAY-005"],
      severity: 0.1, confidence: 0.99,
      status: "resolved",
      context: { entity: "PAY-005", amount: 5000, invoice: "INV-2026-007" },
      reasoning: { analysis: "Payment €5,000 received for INV-2026-007.", consideredActions: ["Acknowledge"], confidence: 0.99, missingContext: [] },
      proposedAction: { action: "acknowledge_payment", justification: "Routine", params: {} },
      actionTaken: { action: "acknowledge_payment", result: "success", executedAt: daysAgo(33).toISOString() },
      outcome: "positive",
      outcomeDetails: { resolvedBy: "auto", note: "Autonomous payment acknowledgment" },
      resolvedAt: daysAgo(33),
      createdAt: daysAgo(33),
    },

    // 2 With feedback/teaching
    {
      typeSlug: "client-relationship-cooling",
      trigger: contactIds["Camilla Eriksson"],
      severity: 0.5, confidence: 0.7,
      status: "resolved",
      context: { entity: "Camilla Eriksson", company: "Copenhagen Financial", daysSilent: 31 },
      reasoning: {
        analysis: "Camilla Eriksson (Head of IT, Copenhagen Financial) has had no recorded interaction for 31 days.",
        consideredActions: ["Schedule touchpoint", "Send thought leadership content"],
        confidence: 0.7,
        missingContext: [],
      },
      proposedAction: { action: "schedule_touchpoint", justification: "31 days silent for active prospect contact", params: {} },
      actionTaken: { action: "schedule_touchpoint", result: "success", executedAt: daysAgo(4).toISOString() },
      outcome: "positive",
      feedback: "Focus on clients with active projects first. Camilla is a secondary contact — prioritize Niels and contacts at Helsinki Health and Fjord instead.",
      feedbackRating: 4,
      resolvedAt: daysAgo(4),
      createdAt: daysAgo(4),
    },
    {
      typeSlug: "overdue-invoice-followup",
      trigger: invoiceIds["INV-2026-009"],
      severity: 0.6, confidence: 0.75,
      status: "resolved",
      context: { entity: "INV-2026-009", amount: 8500, daysOverdue: 7, client: "Helsinki Health Tech" },
      reasoning: {
        analysis: "Invoice INV-2026-009 for €8,500 is 7 days overdue from Helsinki Health Tech.",
        consideredActions: ["Send reminder", "Check with delivery team first"],
        confidence: 0.75,
        missingContext: ["Active support tickets"],
      },
      proposedAction: { action: "send_payment_reminder", justification: "7-day overdue invoice", params: {} },
      actionTaken: { action: "send_payment_reminder", result: "success", executedAt: daysAgo(2).toISOString() },
      outcome: "neutral",
      feedback: "Check support tickets before sending reminders — sometimes payment is held due to open issues. Helsinki Health has a scope concern on the Patient Portal project that might be causing the delay.",
      feedbackRating: 3,
      resolvedAt: daysAgo(2),
      createdAt: daysAgo(2),
    },

    // 2 Active (just detected)
    {
      typeSlug: "project-delivery-risk",
      trigger: projectIds["Helsinki Health - Patient Portal V2"],
      severity: 0.7, confidence: 0.6,
      status: "detected",
      context: { entity: "Helsinki Health - Patient Portal V2", status: "at-risk", reason: "scope creep", budget: 65000 },
      reasoning: null,
      proposedAction: null,
      createdAt: daysAgo(0),
    },
    {
      typeSlug: "stale-deal-alert",
      trigger: dealIds["Malmö Retail - E-commerce Replatform"],
      severity: 0.5, confidence: 0.55,
      status: "reasoning",
      context: { entity: "Malmö Retail - E-commerce Replatform", amount: 95000, stage: "proposal", daysSinceUpdate: 12 },
      reasoning: {
        analysis: "Analyzing the Malmö Retail E-commerce Replatform deal. The proposal was sent 12 days ago with no response yet...",
        consideredActions: [],
        confidence: 0.55,
        missingContext: ["Client feedback on proposal", "Competitor activity"],
      },
      proposedAction: null,
      createdAt: daysAgo(0),
    },
  ];

  for (const s of situations) {
    await prisma.situation.create({
      data: {
        operatorId: opId,
        situationTypeId: sitTypeIds[s.typeSlug],
        severity: s.severity,
        confidence: s.confidence,
        source: "detected",
        status: s.status,
        triggerEntityId: s.trigger,
        contextSnapshot: JSON.stringify(s.context),
        reasoning: s.reasoning ? JSON.stringify(s.reasoning) : null,
        proposedAction: s.proposedAction ? JSON.stringify(s.proposedAction) : null,
        actionTaken: (s as Record<string, unknown>).actionTaken
          ? JSON.stringify((s as Record<string, unknown>).actionTaken)
          : null,
        outcome: (s as Record<string, unknown>).outcome as string ?? null,
        outcomeDetails: (s as Record<string, unknown>).outcomeDetails
          ? JSON.stringify((s as Record<string, unknown>).outcomeDetails)
          : null,
        feedback: (s as Record<string, unknown>).feedback as string ?? null,
        feedbackRating: (s as Record<string, unknown>).feedbackRating as number ?? null,
        feedbackCategory: (s as Record<string, unknown>).feedbackCategory as string ?? null,
        resolvedAt: (s as Record<string, unknown>).resolvedAt as Date ?? null,
        createdAt: s.createdAt,
      },
    });
  }

  // ─── 18. Policy Rules ────────────────────────────────────────
  await prisma.policyRule.createMany({
    data: [
      {
        operatorId: opId,
        name: "Invoices over €25,000 require manual approval",
        scope: "entity_type",
        scopeTargetId: "invoice",
        actionType: "execute",
        effect: "REQUIRE_APPROVAL",
        conditions: JSON.stringify({ minAmount: 25000 }),
        priority: 10,
        enabled: true,
      },
      {
        operatorId: opId,
        name: "No automated client communications without deal owner review",
        scope: "global",
        scopeTargetId: null,
        actionType: "execute",
        effect: "REQUIRE_APPROVAL",
        conditions: JSON.stringify({ actionCategory: "client_communication" }),
        priority: 5,
        enabled: true,
      },
      {
        operatorId: opId,
        name: "Payment confirmations can be sent automatically",
        scope: "entity_type",
        scopeTargetId: "payment",
        actionType: "execute",
        effect: "ALLOW",
        conditions: null,
        priority: 15,
        enabled: true,
      },
    ],
  });

  // ─── 19. Notifications ──────────────────────────────────────
  await prisma.notification.createMany({
    data: [
      {
        operatorId: opId,
        title: "Overdue Invoice Detected",
        body: "INV-2026-005 from Bergen Logistics (€28,500) is 18 days overdue. A follow-up action has been proposed for your review.",
        sourceType: "situation",
        read: false,
        createdAt: daysAgo(1),
      },
      {
        operatorId: opId,
        title: "Policy Check: Large Invoice Requires Approval",
        body: "Invoice INV-2026-008 for Malmö Retail Group (€45,000) exceeds the €25,000 threshold. Routing to CFO for approval.",
        sourceType: "situation",
        read: false,
        createdAt: daysAgo(2),
      },
      {
        operatorId: opId,
        title: "Payment Received",
        body: "€12,000 payment received from Bergen Logistics for INV-2026-010 (Phase 1 closeout). Records updated automatically.",
        sourceType: "situation",
        read: true,
        createdAt: daysAgo(18),
      },
      {
        operatorId: opId,
        title: "Project At Risk",
        body: "Helsinki Health Patient Portal V2 has been flagged as at-risk due to scope creep. Review recommended.",
        sourceType: "situation",
        read: false,
        createdAt: daysAgo(0),
      },
      {
        operatorId: opId,
        title: "Connectors Healthy",
        body: "All 3 data connectors (HubSpot, Stripe, Google Sheets) are active and syncing normally.",
        sourceType: "system",
        read: true,
        createdAt: daysAgo(0),
      },
    ],
  });

  // ─── Diagnostics: per-department breakdown ──────────────────
  const diagnostic: Record<string, Record<string, number>> = {};

  for (const d of DEPARTMENTS) {
    const deptId = deptIds[d.name];

    const [members, documents, deptMemberRels] = await Promise.all([
      // Base entities with parentDepartmentId (team members)
      prisma.entity.count({
        where: { operatorId: opId, parentDepartmentId: deptId, category: "base" },
      }),
      // Internal documents
      prisma.internalDocument.count({
        where: { operatorId: opId, departmentId: deptId },
      }),
      // All department-member relationships TO this department (includes digital entities)
      prisma.relationship.count({
        where: {
          relationshipType: { operatorId: opId, slug: "department-member" },
          toEntityId: deptId,
        },
      }),
    ]);

    // Digital entities linked via department-member (subtract base members to get digital only)
    const digitalEntities = deptMemberRels - members;

    diagnostic[d.name] = {
      members,
      documents,
      digitalEntities,
      totalDeptMemberRels: deptMemberRels,
    };
  }

  // ─── Done ────────────────────────────────────────────────────
  return {
    success: true,
    operator: { id: opId, companyName: COMPANY_NAME },
    credentials: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    stats: {
      departments: DEPARTMENTS.length,
      teamMembers: TEAM_MEMBERS.length,
      documents: DOCUMENTS.length,
      connectors: 3,
      entities: {
        contacts: CLIENT_CONTACTS.length,
        companies: CLIENT_COMPANIES.length,
        deals: DEALS.length,
        invoices: INVOICES.length,
        payments: PAYMENTS.length,
        projects: PROJECTS.length,
      },
      situationTypes: SITUATION_TYPES.length,
      situations: situations.length,
      policyRules: 3,
      notifications: 5,
    },
    diagnostic,
  };
}
