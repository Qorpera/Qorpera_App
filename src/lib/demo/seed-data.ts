// ── Demo Seed Data ───────────────────────────────────────────────────
// Pure data definitions for the test company generator.
// No database operations — those live in seed-runner.ts.

// ── Helpers ──────────────────────────────────────────────────────────

export function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 86_400_000);
}

export function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3_600_000);
}

// ── Company ──────────────────────────────────────────────────────────

export const COMPANY = {
  name: "Test Company",
  industry: "Digital Agency",
  orientationContext: JSON.stringify({
    businessDescription:
      "We're an 18-person Danish digital agency helping SMBs with web development, marketing, and business process automation. Our focus is on long-term client relationships and measurable results.",
    industry: "Digital Agency",
    teamSize: 18,
    domains: ["Salg", "Levering", "Marketing", "Økonomi & Admin"],
  }),
};

// ── Users ────────────────────────────────────────────────────────────

export const ADMIN_USER = {
  name: "Anders Vestergaard",
  email: "anders@testcompany.dk",
  password: "demo1234",
  role: "admin" as const,
  locale: "da",
};

export const MEMBER_USER = {
  name: "Mette Lindberg",
  email: "mette@testcompany.dk",
  password: "demo1234",
  role: "member" as const,
  locale: "da",
};

// ── Departments ──────────────────────────────────────────────────────

export type DepartmentDef = {
  name: string;
  entityTypeSlug: "organization" | "department";
  mapX: number;
  mapY: number;
  description: string;
};

export const DEPARTMENTS: DepartmentDef[] = [
  { name: "CompanyHQ", entityTypeSlug: "organization", mapX: 0, mapY: 0, description: "Company headquarters" },
  { name: "Salg", entityTypeSlug: "department", mapX: -200, mapY: 150, description: "Client acquisition and account management" },
  { name: "Levering", entityTypeSlug: "department", mapX: 0, mapY: 150, description: "Project delivery and client success" },
  { name: "Marketing", entityTypeSlug: "department", mapX: 200, mapY: 150, description: "Brand, content, and lead generation" },
  { name: "Økonomi & Admin", entityTypeSlug: "department", mapX: 400, mapY: 150, description: "Finance, invoicing, and administration" },
];

// ── Team Members ─────────────────────────────────────────────────────

export type TeamMemberDef = {
  name: string;
  email: string;
  role: string;
  department: string;
  /** Set when this person has a user account */
  userRole?: "admin" | "member";
};

export const TEAM_MEMBERS: TeamMemberDef[] = [
  // Salg (Sales) — 5 people
  { name: "Mette Lindberg", email: "mette@testcompany.dk", role: "Sales Lead", department: "Salg", userRole: "member" },
  { name: "Jakob Friis", email: "jakob@testcompany.dk", role: "Senior Account Manager", department: "Salg" },
  { name: "Sofie Bech", email: "sofie@testcompany.dk", role: "Account Manager", department: "Salg" },
  { name: "Oliver Kragh", email: "oliver@testcompany.dk", role: "Business Development", department: "Salg" },
  { name: "Ida Holm", email: "ida@testcompany.dk", role: "Sales Coordinator", department: "Salg" },
  // Levering (Delivery) — 5 people
  { name: "Thomas Nørgaard", email: "thomas@testcompany.dk", role: "Head of Delivery", department: "Levering" },
  { name: "Line Kjær", email: "line@testcompany.dk", role: "Senior Project Manager", department: "Levering" },
  { name: "Kasper Dahl", email: "kasper@testcompany.dk", role: "Developer Lead", department: "Levering" },
  { name: "Nanna Skov", email: "nanna@testcompany.dk", role: "UX Designer", department: "Levering" },
  { name: "Emil Bruun", email: "emil@testcompany.dk", role: "Junior Developer", department: "Levering" },
  // Marketing — 4 people
  { name: "Astrid Møller", email: "astrid@testcompany.dk", role: "Marketing Manager", department: "Marketing" },
  { name: "Frederik Lund", email: "frederik@testcompany.dk", role: "Content Creator", department: "Marketing" },
  { name: "Camilla Juhl", email: "camilla@testcompany.dk", role: "Digital Marketing Specialist", department: "Marketing" },
  { name: "Mikkel Rask", email: "mikkel@testcompany.dk", role: "Marketing Intern", department: "Marketing" },
  // Økonomi & Admin — 3 people + CEO
  { name: "Anders Vestergaard", email: "anders@testcompany.dk", role: "CEO/Founder", department: "Økonomi & Admin", userRole: "admin" },
  { name: "Louise Winther", email: "louise@testcompany.dk", role: "Finance Manager", department: "Økonomi & Admin" },
  { name: "Peter Steen", email: "peter@testcompany.dk", role: "Bookkeeper", department: "Økonomi & Admin" },
  { name: "Maria Thomsen", email: "maria@testcompany.dk", role: "Office Manager / Executive Assistant", department: "Økonomi & Admin" },
];

// ── Cross-Department Memberships ─────────────────────────────────────

export const CROSS_DEPARTMENT: Array<{
  member: string;
  department: string;
  role: string;
}> = [
  { member: "Line Kjær", department: "Salg", role: "Client Handover Lead" },
  { member: "Anders Vestergaard", department: "Salg", role: "Key Account Sponsor" },
];

// ── Reports-to Hierarchy ─────────────────────────────────────────────

export const DEPARTMENT_HEADS: Record<string, string> = {
  Salg: "Mette Lindberg",
  Levering: "Thomas Nørgaard",
  Marketing: "Astrid Møller",
  "Økonomi & Admin": "Louise Winther",
};

export const CEO_NAME = "Anders Vestergaard";

// ── Placeholder Situation Types (full detection logic in Prompt 3) ───

export const PLACEHOLDER_SITUATION_TYPES: Array<{
  slug: string;
  name: string;
  description: string;
}> = [
  { slug: "overdue-invoice-followup", name: "Overdue Invoice Follow-up", description: "Detects overdue invoices requiring follow-up" },
  { slug: "deal-gone-quiet", name: "Deal Gone Quiet", description: "Flags deals with no recent activity" },
  { slug: "contract-renewal-approaching", name: "Contract Renewal Approaching", description: "Alerts when contract renewals are coming up" },
  { slug: "new-lead-qualification", name: "New Lead Qualification", description: "Qualifies incoming leads for sales follow-up" },
  { slug: "cross-sell-opportunity", name: "Cross-sell Opportunity", description: "Identifies cross-sell potential in existing accounts" },
  { slug: "client-meeting-prep", name: "Client Meeting Prep", description: "Prepares briefing materials before client meetings" },
];

// ── PersonalAutonomy Records ─────────────────────────────────────────

export type PersonalAutonomyDef = {
  person: string;
  situationTypeSlug: string;
  level: "supervised" | "notify" | "autonomous";
  approvalCount: number;
  rejectionCount: number;
};

export const PERSONAL_AUTONOMY: PersonalAutonomyDef[] = [
  { person: "Anders Vestergaard", situationTypeSlug: "overdue-invoice-followup", level: "autonomous", approvalCount: 25, rejectionCount: 1 },
  { person: "Anders Vestergaard", situationTypeSlug: "deal-gone-quiet", level: "autonomous", approvalCount: 22, rejectionCount: 0 },
  { person: "Anders Vestergaard", situationTypeSlug: "contract-renewal-approaching", level: "notify", approvalCount: 14, rejectionCount: 2 },
  { person: "Mette Lindberg", situationTypeSlug: "deal-gone-quiet", level: "notify", approvalCount: 12, rejectionCount: 1 },
  { person: "Mette Lindberg", situationTypeSlug: "new-lead-qualification", level: "notify", approvalCount: 10, rejectionCount: 0 },
  { person: "Mette Lindberg", situationTypeSlug: "cross-sell-opportunity", level: "notify", approvalCount: 8, rejectionCount: 1 },
  { person: "Thomas Nørgaard", situationTypeSlug: "client-meeting-prep", level: "supervised", approvalCount: 3, rejectionCount: 0 },
  { person: "Louise Winther", situationTypeSlug: "overdue-invoice-followup", level: "notify", approvalCount: 15, rejectionCount: 1 },
];

// ── Policy Rules ─────────────────────────────────────────────────────

export const POLICY_RULES: Array<{
  name: string;
  scope: string;
  scopeTargetId?: string;
  actionType: string;
  effect: string;
  conditions?: Record<string, unknown>;
  priority: number;
}> = [
  {
    name: "External emails above 50,000 DKK context require CEO approval",
    scope: "global",
    actionType: "execute",
    effect: "REQUIRE_APPROVAL",
    conditions: { context: "external_email", minAmount: 50000, currency: "DKK" },
    priority: 10,
  },
  {
    name: "Invoice disputes always require human review",
    scope: "entity_type",
    scopeTargetId: "invoice",
    actionType: "execute",
    effect: "REQUIRE_APPROVAL",
    conditions: { disputeRelated: true },
    priority: 20,
  },
  {
    name: "Client communications must include project reference",
    scope: "global",
    actionType: "execute",
    effect: "ALLOW",
    conditions: { advisory: true, requireProjectRef: true },
    priority: 5,
  },
  {
    name: "Automated Slack messages limited to internal channels",
    scope: "global",
    actionType: "execute",
    effect: "DENY",
    conditions: { channel: "slack", scope: "external" },
    priority: 15,
  },
  {
    name: "Contract modifications require Finance approval",
    scope: "entity_type",
    scopeTargetId: "deal",
    actionType: "execute",
    effect: "REQUIRE_APPROVAL",
    conditions: { modificationType: "contract" },
    priority: 25,
  },
];

// ── Source Connectors ────────────────────────────────────────────────

export type ConnectorDef = {
  provider: string;
  name: string;
  type: "personal" | "company";
  /** Which user account owns this connector (admin or member) */
  assignedToUser?: "admin";
  hoursAgo: number;
};

export const SOURCE_CONNECTORS: ConnectorDef[] = [
  { provider: "gmail", name: "Gmail", type: "personal", assignedToUser: "admin", hoursAgo: 2 },
  { provider: "google-calendar", name: "Google Calendar", type: "personal", assignedToUser: "admin", hoursAgo: 2 },
  { provider: "google-drive", name: "Google Drive", type: "personal", assignedToUser: "admin", hoursAgo: 3 },
  { provider: "hubspot", name: "HubSpot CRM", type: "company", hoursAgo: 1 },
  { provider: "e-conomic", name: "e-conomic", type: "company", hoursAgo: 4 },
  { provider: "slack", name: "Slack", type: "company", hoursAgo: 0.5 },
];

// ── Slack Channel Mappings ───────────────────────────────────────────

export const SLACK_CHANNEL_MAPPINGS: Array<{
  channelId: string;
  channelName: string;
  department: string;
}> = [
  { channelId: "C001SALG", channelName: "#salg", department: "Salg" },
  { channelId: "C002LEVER", channelName: "#levering", department: "Levering" },
  { channelId: "C003MKTG", channelName: "#marketing", department: "Marketing" },
  { channelId: "C004GEN", channelName: "#general", department: "CompanyHQ" },
];

// ── External Companies ──────────────────────────────────────────────

export type ExternalCompanyDef = {
  name: string;
  domain: string;
  industry: string;
  type: "client" | "partner";
  relationship: string;
  keyContact: string;
};

export const EXTERNAL_COMPANIES: ExternalCompanyDef[] = [
  { name: "Nordlys Media ApS", domain: "nordlys.dk", industry: "Media & Publishing", type: "client", relationship: "retainer", keyContact: "Søren Fabricius" },
  { name: "Dansk Energi Partners", domain: "danskenergi.dk", industry: "Energy Consulting", type: "client", relationship: "project", keyContact: "Karen Holst" },
  { name: "Bygholm Consulting", domain: "bygholm.dk", industry: "Management Consulting", type: "client", relationship: "retainer", keyContact: "Henrik Bygholm" },
  { name: "GreenTech Nordic", domain: "greentech-nordic.dk", industry: "Sustainability & CleanTech", type: "client", relationship: "project", keyContact: "Anna Grøn" },
  { name: "Vestjysk Finans", domain: "vestjyskfinans.dk", industry: "Financial Services", type: "client", relationship: "prospect", keyContact: "Jens Matthiesen" },
  { name: "Baltic Digital Group", domain: "balticdigital.lv", industry: "Digital Services", type: "partner", relationship: "referral", keyContact: "Kristaps Bērziņš" },
  { name: "CloudNine Solutions", domain: "cloudnine.dk", industry: "Cloud Infrastructure", type: "partner", relationship: "technology", keyContact: "Martin Aarup" },
  { name: "Fjordview Ejendomme", domain: "fjordview.dk", industry: "Real Estate", type: "client", relationship: "dormant", keyContact: "Lise Fjord" },
  { name: "Roskilde Byg & Anlæg", domain: "roskildebyg.dk", industry: "Construction", type: "client", relationship: "project", keyContact: "Tom Andersen" },
  { name: "NextStep Education", domain: "nextstep-edu.dk", industry: "EdTech", type: "client", relationship: "prospect", keyContact: "Pernille Juul" },
  { name: "Aarhus Creative Hub", domain: "aarhuscreative.dk", industry: "Creative Agency", type: "client", relationship: "retainer", keyContact: "Simon Krogh" },
  { name: "Copenhagen Bikes A/S", domain: "copenhagenbikes.dk", industry: "Retail & E-commerce", type: "client", relationship: "project", keyContact: "Maja Winther" },
];

// ── CRM Contacts ────────────────────────────────────────────────────

export type ContactDef = {
  name: string;
  email: string;
  phone: string;
  title: string;
  company: string;
};

export const CRM_CONTACTS: ContactDef[] = [
  // Nordlys Media ApS
  { name: "Søren Fabricius", email: "soeren@nordlys.dk", phone: "+45 22 33 44 01", title: "CEO", company: "Nordlys Media ApS" },
  { name: "Katrine Nøhr", email: "katrine@nordlys.dk", phone: "+45 22 33 44 02", title: "Project Manager", company: "Nordlys Media ApS" },
  // Dansk Energi Partners
  { name: "Karen Holst", email: "karen@danskenergi.dk", phone: "+45 31 22 11 01", title: "CEO", company: "Dansk Energi Partners" },
  { name: "Lars Mikkelsen", email: "lars@danskenergi.dk", phone: "+45 31 22 11 02", title: "CTO", company: "Dansk Energi Partners" },
  { name: "Erik Damgaard", email: "erik@danskenergi.dk", phone: "+45 31 22 11 03", title: "Finance Director", company: "Dansk Energi Partners" },
  // Bygholm Consulting
  { name: "Henrik Bygholm", email: "henrik@bygholm.dk", phone: "+45 40 55 66 01", title: "Managing Director", company: "Bygholm Consulting" },
  { name: "Nina Brandt", email: "nina@bygholm.dk", phone: "+45 40 55 66 02", title: "Head of Digital", company: "Bygholm Consulting" },
  // GreenTech Nordic
  { name: "Anna Grøn", email: "anna@greentech-nordic.dk", phone: "+45 28 77 88 01", title: "CMO", company: "GreenTech Nordic" },
  { name: "Jonas Klint", email: "jonas@greentech-nordic.dk", phone: "+45 28 77 88 02", title: "IT Manager", company: "GreenTech Nordic" },
  // Vestjysk Finans
  { name: "Jens Matthiesen", email: "jens@vestjyskfinans.dk", phone: "+45 50 11 22 01", title: "CFO", company: "Vestjysk Finans" },
  { name: "Marie Jensen", email: "marie@vestjyskfinans.dk", phone: "+45 50 11 22 02", title: "Head of IT", company: "Vestjysk Finans" },
  // Baltic Digital Group
  { name: "Kristaps Bērziņš", email: "kristaps@balticdigital.lv", phone: "+371 2000 1001", title: "CEO", company: "Baltic Digital Group" },
  // CloudNine Solutions
  { name: "Martin Aarup", email: "martin@cloudnine.dk", phone: "+45 61 33 44 01", title: "CTO", company: "CloudNine Solutions" },
  // Fjordview Ejendomme
  { name: "Lise Fjord", email: "lise@fjordview.dk", phone: "+45 70 88 99 01", title: "Director", company: "Fjordview Ejendomme" },
  { name: "Peter Hjort", email: "peter@fjordview.dk", phone: "+45 70 88 99 02", title: "Operations Manager", company: "Fjordview Ejendomme" },
  // Roskilde Byg & Anlæg
  { name: "Tom Andersen", email: "tom@roskildebyg.dk", phone: "+45 42 55 66 01", title: "Owner", company: "Roskilde Byg & Anlæg" },
  // NextStep Education
  { name: "Pernille Juul", email: "pernille@nextstep-edu.dk", phone: "+45 33 44 55 01", title: "Head of Learning", company: "NextStep Education" },
  // Aarhus Creative Hub
  { name: "Simon Krogh", email: "simon@aarhuscreative.dk", phone: "+45 86 11 22 01", title: "Creative Director", company: "Aarhus Creative Hub" },
  { name: "Line Skov", email: "line.skov@aarhuscreative.dk", phone: "+45 86 11 22 02", title: "Project Lead", company: "Aarhus Creative Hub" },
  // Copenhagen Bikes A/S
  { name: "Maja Winther", email: "maja@copenhagenbikes.dk", phone: "+45 55 66 77 01", title: "CEO", company: "Copenhagen Bikes A/S" },
];

// ── Deals ───────────────────────────────────────────────────────────

export type DealDef = {
  name: string;
  company: string;
  stage: string;
  amount: number;
  owner: string;
  daysAgoCreated: number;
  closeDateDaysFromNow?: number;
};

export const DEALS: DealDef[] = [
  { name: "Nordlys Q2 Retainer Renewal", company: "Nordlys Media ApS", stage: "negotiation", amount: 180000, owner: "Mette Lindberg", daysAgoCreated: 21, closeDateDaysFromNow: 14 },
  { name: "Dansk Energi Website Redesign", company: "Dansk Energi Partners", stage: "closed-won", amount: 275000, owner: "Jakob Friis", daysAgoCreated: 60, closeDateDaysFromNow: -15 },
  { name: "Bygholm Digital Transformation", company: "Bygholm Consulting", stage: "proposal", amount: 420000, owner: "Mette Lindberg", daysAgoCreated: 14, closeDateDaysFromNow: 30 },
  { name: "GreenTech Onboarding Package", company: "GreenTech Nordic", stage: "closed-won", amount: 95000, owner: "Sofie Bech", daysAgoCreated: 30, closeDateDaysFromNow: -10 },
  { name: "Vestjysk Finans Portal", company: "Vestjysk Finans", stage: "proposal", amount: 340000, owner: "Oliver Kragh", daysAgoCreated: 10, closeDateDaysFromNow: 45 },
  { name: "Fjordview Reactivation Campaign", company: "Fjordview Ejendomme", stage: "discovery", amount: 0, owner: "Jakob Friis", daysAgoCreated: 5 },
  { name: "NextStep LMS Integration", company: "NextStep Education", stage: "discovery", amount: 0, owner: "Sofie Bech", daysAgoCreated: 7 },
  { name: "Aarhus Hub Expansion", company: "Aarhus Creative Hub", stage: "negotiation", amount: 150000, owner: "Mette Lindberg", daysAgoCreated: 21, closeDateDaysFromNow: 21 },
  { name: "Roskilde Final Deliverables", company: "Roskilde Byg & Anlæg", stage: "closed-won", amount: 65000, owner: "Jakob Friis", daysAgoCreated: 42, closeDateDaysFromNow: -7 },
  { name: "Copenhagen Bikes Phase 2", company: "Copenhagen Bikes A/S", stage: "closed-lost", amount: 120000, owner: "Oliver Kragh", daysAgoCreated: 30, closeDateDaysFromNow: -5 },
];

// ── Invoices ────────────────────────────────────────────────────────

export type InvoiceDef = {
  ref: string;
  company: string;
  amount: number;
  status: "paid" | "pending" | "overdue";
  dueDateDaysAgo: number;
  paidDateDaysAgo?: number;
};

export const INVOICES: InvoiceDef[] = [
  { ref: "INV-2024-089", company: "Nordlys Media ApS", amount: 45000, status: "paid", dueDateDaysAgo: 35, paidDateDaysAgo: 33 },
  { ref: "INV-2024-090", company: "Dansk Energi Partners", amount: 68750, status: "overdue", dueDateDaysAgo: 12 },
  { ref: "INV-2024-091", company: "Bygholm Consulting", amount: 35000, status: "paid", dueDateDaysAgo: 21, paidDateDaysAgo: 19 },
  { ref: "INV-2024-092", company: "GreenTech Nordic", amount: 23750, status: "paid", dueDateDaysAgo: 14, paidDateDaysAgo: 12 },
  { ref: "INV-2024-093", company: "Roskilde Byg & Anlæg", amount: 16250, status: "pending", dueDateDaysAgo: -5 },
  { ref: "INV-2024-094", company: "Aarhus Creative Hub", amount: 37500, status: "overdue", dueDateDaysAgo: 8 },
  { ref: "INV-2024-095", company: "Nordlys Media ApS", amount: 45000, status: "pending", dueDateDaysAgo: -14 },
  { ref: "INV-2024-096", company: "Dansk Energi Partners", amount: 68750, status: "pending", dueDateDaysAgo: -21 },
];

// ── Tickets ─────────────────────────────────────────────────────────

export type TicketDef = {
  ref: string;
  company: string;
  subject: string;
  status: string;
  priority: string;
  assignedTo: string;
  daysAgoCreated: number;
};

export const TICKETS: TicketDef[] = [
  { ref: "TK-301", company: "Nordlys Media ApS", subject: "Login issues on staging environment", status: "open", priority: "medium", assignedTo: "Kasper Dahl", daysAgoCreated: 3 },
  { ref: "TK-302", company: "Dansk Energi Partners", subject: "Content not updating after deploy", status: "open", priority: "high", assignedTo: "Kasper Dahl", daysAgoCreated: 2 },
  { ref: "TK-303", company: "GreenTech Nordic", subject: "Onboarding guide request", status: "closed", priority: "low", assignedTo: "Nanna Skov", daysAgoCreated: 10 },
  { ref: "TK-304", company: "Bygholm Consulting", subject: "API rate limiting concerns", status: "open", priority: "medium", assignedTo: "Emil Bruun", daysAgoCreated: 4 },
  { ref: "TK-305", company: "Aarhus Creative Hub", subject: "Mobile responsiveness bug on product page", status: "escalated", priority: "high", assignedTo: "Thomas Nørgaard", daysAgoCreated: 1 },
];
