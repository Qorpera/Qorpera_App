// ── Nordisk Kapital A/S — Company Profile & Static Data ─────────────────
// 12-person M&A advisory boutique specializing in buy-side and sell-side DD.
// Google Workspace stack, bilingual DA/EN, HubSpot deal pipeline.

import type { SyntheticEmployee, SyntheticConnector, SyntheticExternalCompany, SyntheticContact, SyntheticDeal, SyntheticInvoice, SyntheticSlackChannel } from "../../synthetic-types";
import type { CompanyProfile, ClutterConfig, EmployeeProfile } from "../generator/types";

// ── Employees (12) ─────────────────────────────────────────────────────

export const NK_EMPLOYEES: SyntheticEmployee[] = [
  { name: "Henrik Vestergaard", email: "henrik@nordisk-kapital.dk", role: "admin", locale: "da" },
  { name: "Astrid Kjeldsen", email: "astrid@nordisk-kapital.dk", role: "admin", locale: "da" },
  { name: "Thomas Riber", email: "thomas@nordisk-kapital.dk", role: "member", locale: "da" },
  { name: "Line Bech", email: "line@nordisk-kapital.dk", role: "member", locale: "da" },
  { name: "Marcus Holm", email: "marcus@nordisk-kapital.dk", role: "member", locale: "da" },
  { name: "Sofie Brandt", email: "sofie@nordisk-kapital.dk", role: "member", locale: "da" },
  { name: "Kasper Møller", email: "kasper@nordisk-kapital.dk", role: "member", locale: "da" },
  { name: "Nadia Poulsen", email: "nadia@nordisk-kapital.dk", role: "member", locale: "da" },
  { name: "Mikkel Skov", email: "mikkel@nordisk-kapital.dk", role: "member", locale: "da" },
  { name: "Julie Winther", email: "julie@nordisk-kapital.dk", role: "member", locale: "da" },
  { name: "Dorthe Petersen", email: "dorthe@nordisk-kapital.dk", role: "member", locale: "da" },
  { name: "Jakob Friis", email: "jakob@nordisk-kapital.dk", role: "member", locale: "da" },
];

// ── Connectors ─────────────────────────────────────────────────────────

export const NK_CONNECTORS: SyntheticConnector[] = [
  { provider: "google-gmail", name: "Gmail (Henrik)", assignedToEmployee: "henrik@nordisk-kapital.dk" },
  { provider: "google-gmail", name: "Gmail (Astrid)", assignedToEmployee: "astrid@nordisk-kapital.dk" },
  { provider: "google-gmail", name: "Gmail (Thomas)", assignedToEmployee: "thomas@nordisk-kapital.dk" },
  { provider: "google-gmail", name: "Gmail (Line)", assignedToEmployee: "line@nordisk-kapital.dk" },
  { provider: "google-drive", name: "Google Drive (company)" },
  { provider: "google-calendar", name: "Calendar (Henrik)", assignedToEmployee: "henrik@nordisk-kapital.dk" },
  { provider: "google-calendar", name: "Calendar (Astrid)", assignedToEmployee: "astrid@nordisk-kapital.dk" },
  { provider: "google-calendar", name: "Calendar (Thomas)", assignedToEmployee: "thomas@nordisk-kapital.dk" },
  { provider: "google-calendar", name: "Calendar (Line)", assignedToEmployee: "line@nordisk-kapital.dk" },
  { provider: "slack", name: "Slack (NK workspace)" },
  { provider: "hubspot", name: "HubSpot CRM" },
];

// ── External Companies ─────────────────────────────────────────────────

export const NK_COMPANIES: SyntheticExternalCompany[] = [
  { name: "Danvik Industries A/S", domain: "danvik.dk", industry: "Manufacturing", relationship: "client" },
  { name: "NordTech ApS", domain: "nordtech.dk", industry: "SaaS / Logistics Software", relationship: "client" },
  { name: "Scandia Foods Group", domain: "scandiafoods.dk", industry: "Food Production", relationship: "client" },
  { name: "TechNordic Solutions", domain: "technordic.dk", industry: "IT Services", relationship: "client" },
  { name: "Roskilde Finans A/S", domain: "roskildefinans.dk", industry: "Private Equity", relationship: "client" },
  { name: "Vestjysk Energi A/S", domain: "vestjysk-energi.dk", industry: "Energy", relationship: "client" },
];

// ── Contacts ───────────────────────────────────────────────────────────

export const NK_CONTACTS: SyntheticContact[] = [
  // Danvik Industries
  { name: "Jens Rasmussen", email: "jens.rasmussen@danvik.dk", company: "Danvik Industries A/S", title: "CEO" },
  { name: "Karen Ibsen", email: "karen.ibsen@danvik.dk", company: "Danvik Industries A/S", title: "CFO" },

  // NordTech ApS
  { name: "Anders Lindberg", email: "anders@nordtech.dk", company: "NordTech ApS", title: "CEO & Co-founder" },
  { name: "Morten Hauge", email: "morten@nordtech.dk", company: "NordTech ApS", title: "CTO & Co-founder" },
  { name: "Pia Thorsen", email: "pia@nordtech.dk", company: "NordTech ApS", title: "CFO" },

  // Scandia Foods
  { name: "Lars Eriksen", email: "lars.eriksen@scandiafoods.dk", company: "Scandia Foods Group", title: "CEO" },
  { name: "Birgit Munch", email: "birgit.munch@scandiafoods.dk", company: "Scandia Foods Group", title: "CFO" },

  // TechNordic
  { name: "Stefan Olsen", email: "stefan@technordic.dk", company: "TechNordic Solutions", title: "Managing Director" },

  // Roskilde Finans (PE client)
  { name: "Nikolaj Brink", email: "nikolaj.brink@roskildefinans.dk", company: "Roskilde Finans A/S", title: "Investment Director" },
  { name: "Camilla Frost", email: "camilla.frost@roskildefinans.dk", company: "Roskilde Finans A/S", title: "Partner" },
  { name: "Frederik Borg", email: "frederik.borg@roskildefinans.dk", company: "Roskilde Finans A/S", title: "Associate" },

  // Vestjysk Energi
  { name: "Ole Hansen", email: "ole.hansen@vestjysk-energi.dk", company: "Vestjysk Energi A/S", title: "CEO" },
];

// ── Deals ──────────────────────────────────────────────────────────────

export const NK_DEALS: SyntheticDeal[] = [
  { name: "NordTech Buy-Side DD", company: "Roskilde Finans A/S", contact: "Nikolaj Brink", stage: "negotiation", amount: 2400000, createdDaysAgo: 45, lastActivityDaysAgo: 1 },
  { name: "Danvik Sell-Side Advisory", company: "Danvik Industries A/S", contact: "Jens Rasmussen", stage: "negotiation", amount: 1800000, createdDaysAgo: 60, lastActivityDaysAgo: 3 },
  { name: "Scandia Foods DD", company: "Scandia Foods Group", contact: "Lars Eriksen", stage: "closed-won", amount: 1900000, createdDaysAgo: 120, lastActivityDaysAgo: 30 },
  { name: "TechNordic Scoping", company: "TechNordic Solutions", contact: "Stefan Olsen", stage: "qualification", amount: 1500000, createdDaysAgo: 14, lastActivityDaysAgo: 7 },
  { name: "Vestjysk Energi Assessment", company: "Vestjysk Energi A/S", contact: "Ole Hansen", stage: "qualification", amount: 2000000, createdDaysAgo: 10, lastActivityDaysAgo: 5 },
];

// ── Invoices ───────────────────────────────────────────────────────────

export const NK_INVOICES: SyntheticInvoice[] = [
  // NordTech DD monthly retainers (billed to Roskilde Finans)
  { number: "NK-2026-031", company: "Roskilde Finans A/S", amount: 400000, status: "paid", issuedDaysAgo: 60 },
  { number: "NK-2026-032", company: "Roskilde Finans A/S", amount: 400000, status: "paid", issuedDaysAgo: 30 },
  { number: "NK-2026-033", company: "Roskilde Finans A/S", amount: 400000, status: "sent", issuedDaysAgo: 3, dueDaysAgo: -27 },

  // Scandia Foods — completion invoice
  { number: "NK-2026-028", company: "Scandia Foods Group", amount: 1900000, status: "paid", issuedDaysAgo: 75 },

  // Danvik — initial retainer
  { number: "NK-2026-034", company: "Danvik Industries A/S", amount: 300000, status: "sent", issuedDaysAgo: 14, dueDaysAgo: -16 },
];

// ── Slack Channels ─────────────────────────────────────────────────────

export const NK_SLACK_CHANNELS: SyntheticSlackChannel[] = [
  { channelId: "NK001GEN", channelName: "#general" },
  { channelId: "NK002DEA", channelName: "#deals" },
  { channelId: "NK003FIN", channelName: "#financial-dd" },
  { channelId: "NK004COM", channelName: "#commercial-dd" },
  { channelId: "NK005LEG", channelName: "#legal-review" },
  { channelId: "NK006RND", channelName: "#random" },
];

// ── Generator Profile ──────────────────────────────────────────────────

export const NK_PROFILE: CompanyProfile = {
  domain: "nordisk-kapital.dk",
  name: "Nordisk Kapital A/S",
  locale: "da",
  connectorProviders: ["google-gmail", "google-drive", "google-calendar", "slack", "hubspot"],
  employees: [
    { email: "henrik@nordisk-kapital.dk", name: "Henrik Vestergaard", role: "ceo", connectorProviders: ["google-gmail", "google-calendar", "google-drive", "hubspot"] },
    { email: "astrid@nordisk-kapital.dk", name: "Astrid Kjeldsen", role: "manager", connectorProviders: ["google-gmail", "google-calendar", "google-drive"] },
    { email: "thomas@nordisk-kapital.dk", name: "Thomas Riber", role: "manager", connectorProviders: ["google-gmail", "google-calendar", "google-drive", "hubspot"] },
    { email: "line@nordisk-kapital.dk", name: "Line Bech", role: "manager", connectorProviders: ["google-gmail", "google-calendar", "google-drive"] },
    { email: "marcus@nordisk-kapital.dk", name: "Marcus Holm", role: "engineer", connectorProviders: ["google-drive", "slack"] },
    { email: "sofie@nordisk-kapital.dk", name: "Sofie Brandt", role: "engineer", connectorProviders: ["google-drive", "slack"] },
    { email: "kasper@nordisk-kapital.dk", name: "Kasper Møller", role: "junior", connectorProviders: ["google-drive", "slack"] },
    { email: "nadia@nordisk-kapital.dk", name: "Nadia Poulsen", role: "junior", connectorProviders: ["google-drive", "slack"] },
    { email: "mikkel@nordisk-kapital.dk", name: "Mikkel Skov", role: "junior", connectorProviders: ["google-drive", "slack"] },
    { email: "julie@nordisk-kapital.dk", name: "Julie Winther", role: "junior", connectorProviders: ["google-drive", "slack"] },
    { email: "dorthe@nordisk-kapital.dk", name: "Dorthe Petersen", role: "admin", connectorProviders: ["google-gmail"] },
    { email: "jakob@nordisk-kapital.dk", name: "Jakob Friis", role: "admin", connectorProviders: ["google-drive", "slack"] },
  ] satisfies EmployeeProfile[],
  externalContacts: [
    { name: "Nikolaj Brink", email: "nikolaj.brink@roskildefinans.dk", company: "Roskilde Finans A/S" },
    { name: "Camilla Frost", email: "camilla.frost@roskildefinans.dk", company: "Roskilde Finans A/S" },
    { name: "Jens Rasmussen", email: "jens.rasmussen@danvik.dk", company: "Danvik Industries A/S" },
    { name: "Karen Ibsen", email: "karen.ibsen@danvik.dk", company: "Danvik Industries A/S" },
    { name: "Anders Lindberg", email: "anders@nordtech.dk", company: "NordTech ApS" },
    { name: "Pia Thorsen", email: "pia@nordtech.dk", company: "NordTech ApS" },
    { name: "Lars Eriksen", email: "lars.eriksen@scandiafoods.dk", company: "Scandia Foods Group" },
    { name: "Stefan Olsen", email: "stefan@technordic.dk", company: "TechNordic Solutions" },
    { name: "Ole Hansen", email: "ole.hansen@vestjysk-energi.dk", company: "Vestjysk Energi A/S" },
  ],
};

export const NK_CLUTTER_CONFIG: ClutterConfig = {
  systemNotifications: 15,
  autoReplies: 8,
  marketingNewsletters: 10,
  transactional: 12,
  calendarAuto: 15,
  internalChatter: 10,
};
