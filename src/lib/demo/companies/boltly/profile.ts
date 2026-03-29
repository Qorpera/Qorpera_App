// ── Boltly ApS — Company Profile & Static Data ─────────────────────────
// 12-person electrical contractor in greater Copenhagen. Danish locale.

import type { SyntheticEmployee, SyntheticConnector, SyntheticExternalCompany, SyntheticContact, SyntheticDeal, SyntheticInvoice, SyntheticSlackChannel } from "../../synthetic-types";
import type { CompanyProfile, ClutterConfig, EmployeeProfile } from "../generator/types";

// ── Employees ───────────────────────────────────────────────────────────

export const BOLTLY_EMPLOYEES: SyntheticEmployee[] = [
  { name: "Lars Bolt", email: "lars@boltly.dk", role: "admin", locale: "da" },
  { name: "Mikkel Rasmussen", email: "mikkel@boltly.dk", role: "member", locale: "da" },
  { name: "Sofie Jensen", email: "sofie@boltly.dk", role: "member", locale: "da" },
  { name: "Emil Madsen", email: "emil@boltly.dk", role: "member", locale: "da" },
  { name: "Trine Holst", email: "trine@boltly.dk", role: "member", locale: "da" },
  { name: "Kasper Holm", email: "kasper@boltly.dk", role: "member", locale: "da" },
  { name: "Anja Nielsen", email: "anja@boltly.dk", role: "member", locale: "da" },
  { name: "Henrik Bolt", email: "henrik@boltly.dk", role: "member", locale: "da" },
  { name: "Frederik Møller", email: "frederik@boltly.dk", role: "member", locale: "da" },
  { name: "Ida Sørensen", email: "ida@boltly.dk", role: "member", locale: "da" },
  { name: "Thomas Kjær", email: "thomas.k@boltly.dk", role: "member", locale: "da" },
  // NOTE: Jens Petersen (jens@boltly.dk) left ~3 months ago — NOT in employee list
  // but appears in story content as historical participant.
];

// ── Connectors ──────────────────────────────────────────────────────────

export const BOLTLY_CONNECTORS: SyntheticConnector[] = [
  { provider: "gmail", name: "Gmail (Lars)", assignedToEmployee: "lars@boltly.dk" },
  { provider: "gmail", name: "Gmail (Trine)", assignedToEmployee: "trine@boltly.dk" },
  { provider: "gmail", name: "Gmail (Thomas.K)", assignedToEmployee: "thomas.k@boltly.dk" },
  { provider: "google-calendar", name: "Kalender (Lars)", assignedToEmployee: "lars@boltly.dk" },
  { provider: "google-calendar", name: "Kalender (Trine)", assignedToEmployee: "trine@boltly.dk" },
  { provider: "google-drive", name: "Google Drive", assignedToEmployee: "lars@boltly.dk" },
  { provider: "e-conomic", name: "e-conomic" },
  { provider: "slack", name: "Slack" },
];

// ── External Companies ──────────────────────────────────────────────────

export const BOLTLY_COMPANIES: SyntheticExternalCompany[] = [
  { name: "Skovgaard Ejendomme", domain: "skovgaard-ejendomme.dk", industry: "Property Management", relationship: "client" },
  { name: "Rødovre Tandklinik", domain: "roedovre-tand.dk", industry: "Healthcare", relationship: "client" },
  { name: "Café Nørrebro", domain: "cafe-norrebro.dk", industry: "Hospitality", relationship: "client" },
  { name: "Vestegnens Boligforening", domain: "vestegnens-bolig.dk", industry: "Housing Association", relationship: "client" },
  { name: "Hansen & Larsen Arkitekter", domain: "hl-arkitekter.dk", industry: "Architecture", relationship: "partner" },
  { name: "EL-Grossisten Nord", domain: "el-grossisten.dk", industry: "Electrical Wholesale", relationship: "vendor" },
  { name: "Grøn Energi Rådgivning", domain: "groen-energi.dk", industry: "Energy Consulting", relationship: "partner" },
  { name: "Nygade Butikscenter", domain: "nygade-center.dk", industry: "Retail", relationship: "client" },
  { name: "Lund & Co Advokater", domain: "lundco.dk", industry: "Legal", relationship: "client" },
  { name: "Sikkerhedsstyrelsen", domain: "sikkerhedsstyrelsen.dk", industry: "Government", relationship: "vendor" },
];

// ── Contacts ────────────────────────────────────────────────────────────

export const BOLTLY_CONTACTS: SyntheticContact[] = [
  { name: "Peter Skovgaard", email: "peter@skovgaard-ejendomme.dk", company: "Skovgaard Ejendomme", title: "Driftschef", phone: "+45 28 91 44 02" },
  { name: "Anne Thorsen", email: "anne@roedovre-tand.dk", company: "Rødovre Tandklinik", title: "Klinikchef" },
  { name: "Jonas Nørby", email: "jonas@cafe-norrebro.dk", company: "Café Nørrebro", title: "Ejer" },
  { name: "Karen Holm", email: "karen@vestegnens-bolig.dk", company: "Vestegnens Boligforening", title: "Projektleder" },
  { name: "Thomas Hansen", email: "thomas@hl-arkitekter.dk", company: "Hansen & Larsen Arkitekter", title: "Partner" },
  { name: "Bent Nielsen", email: "bent@el-grossisten.dk", company: "EL-Grossisten Nord", title: "Salgskonsulent" },
  { name: "Lise Grøn", email: "lise@groen-energi.dk", company: "Grøn Energi Rådgivning", title: "Energikonsulent" },
  { name: "Martin Dall", email: "martin@nygade-center.dk", company: "Nygade Butikscenter", title: "Centerleder" },
  { name: "Maria Lund", email: "maria@lundco.dk", company: "Lund & Co Advokater", title: "Administrerende partner" },
  { name: "Niels Berthelsen", email: "niels@sikkerhedsstyrelsen.dk", company: "Sikkerhedsstyrelsen", title: "Sagsbehandler" },
  { name: "Henrik Skovgaard", email: "henrik@skovgaard-ejendomme.dk", company: "Skovgaard Ejendomme", title: "Ejendomsinspektør" },
  { name: "Camilla Grøn", email: "camilla@groen-energi.dk", company: "Grøn Energi Rådgivning", title: "Projektleder" },
];

// ── Deals ───────────────────────────────────────────────────────────────

export const BOLTLY_DEALS: SyntheticDeal[] = [
  { name: "Skovgaard serviceaftale 2026", company: "Skovgaard Ejendomme", contact: "Peter Skovgaard", stage: "closed-won", amount: 180000, createdDaysAgo: 90, lastActivityDaysAgo: 5 },
  { name: "Tandklinik LED-renovering", company: "Rødovre Tandklinik", contact: "Anne Thorsen", stage: "proposal", amount: 85000, createdDaysAgo: 14, lastActivityDaysAgo: 3 },
  { name: "Café nyinstallation", company: "Café Nørrebro", contact: "Jonas Nørby", stage: "negotiation", amount: 120000, createdDaysAgo: 30, lastActivityDaysAgo: 12 },
  { name: "Vestegnen blok 7 renovering", company: "Vestegnens Boligforening", contact: "Karen Holm", stage: "closed-won", amount: 340000, createdDaysAgo: 120, lastActivityDaysAgo: 8 },
  { name: "Nygade Center nødbelysning", company: "Nygade Butikscenter", contact: "Martin Dall", stage: "qualification", amount: 65000, createdDaysAgo: 7, lastActivityDaysAgo: 2 },
  { name: "Grøn Energi solcelle-samarbejde", company: "Grøn Energi Rådgivning", contact: "Lise Grøn", stage: "proposal", amount: 650000, createdDaysAgo: 21, lastActivityDaysAgo: 6 },
  { name: "Lund & Co kontor-elinstallation", company: "Lund & Co Advokater", contact: "Maria Lund", stage: "qualification", amount: 95000, createdDaysAgo: 5, lastActivityDaysAgo: 1 },
  { name: "Skovgaard nødbelysning opgange", company: "Skovgaard Ejendomme", contact: "Peter Skovgaard", stage: "closed-won", amount: 42000, createdDaysAgo: 60, lastActivityDaysAgo: 45 },
];

// ── Invoices ────────────────────────────────────────────────────────────

export const BOLTLY_INVOICES: SyntheticInvoice[] = [
  { number: "INV-2026-031", company: "Skovgaard Ejendomme", amount: 45000, status: "paid", issuedDaysAgo: 35 },
  { number: "INV-2026-032", company: "Vestegnens Boligforening", amount: 112500, status: "paid", issuedDaysAgo: 28 },
  { number: "INV-2026-033", company: "Skovgaard Ejendomme", amount: 15800, status: "overdue", issuedDaysAgo: 22, daysOverdue: 8 },
  { number: "INV-2026-034", company: "Café Nørrebro", amount: 8500, status: "sent", issuedDaysAgo: 12 },
  { number: "INV-2026-035", company: "Vestegnens Boligforening", amount: 87000, status: "overdue", issuedDaysAgo: 18, daysOverdue: 4 },
  { number: "INV-2026-036", company: "Nygade Butikscenter", amount: 22000, status: "draft", issuedDaysAgo: 2 },
  { number: "INV-2026-037", company: "Skovgaard Ejendomme", amount: 21000, status: "paid", issuedDaysAgo: 50 },
  { number: "INV-2026-038", company: "Vestegnens Boligforening", amount: 170000, status: "sent", issuedDaysAgo: 8 },
  { number: "INV-2026-039", company: "Café Nørrebro", amount: 35000, status: "draft", issuedDaysAgo: 1 },
];

// ── Slack Channels ──────────────────────────────────────────────────────

export const BOLTLY_SLACK_CHANNELS: SyntheticSlackChannel[] = [
  { channelId: "C001GEN", channelName: "#general" },
  { channelId: "C002KON", channelName: "#kontoret" },
  { channelId: "C003VES", channelName: "#vestegnen" },
  { channelId: "C004MAT", channelName: "#materiale-bestilling" },
];

// ── Generator Profile ───────────────────────────────────────────────────

export const BOLTLY_PROFILE: CompanyProfile = {
  domain: "boltly.dk",
  name: "Boltly ApS",
  locale: "da",
  connectorProviders: ["gmail", "google-calendar", "google-drive", "e-conomic", "slack"],
  employees: [
    { email: "lars@boltly.dk", name: "Lars Bolt", role: "ceo", connectorProviders: ["gmail", "google-calendar", "google-drive"] },
    { email: "mikkel@boltly.dk", name: "Mikkel Rasmussen", role: "manager", connectorProviders: ["gmail"] },
    { email: "sofie@boltly.dk", name: "Sofie Jensen", role: "field_worker", connectorProviders: ["gmail"] },
    { email: "emil@boltly.dk", name: "Emil Madsen", role: "junior", connectorProviders: ["gmail"] },
    { email: "trine@boltly.dk", name: "Trine Holst", role: "admin", connectorProviders: ["gmail", "google-calendar", "e-conomic"] },
    { email: "kasper@boltly.dk", name: "Kasper Holm", role: "field_worker", connectorProviders: ["gmail"] },
    { email: "anja@boltly.dk", name: "Anja Nielsen", role: "admin", connectorProviders: ["e-conomic"] },
    { email: "henrik@boltly.dk", name: "Henrik Bolt", role: "manager", connectorProviders: ["gmail"] },
    { email: "frederik@boltly.dk", name: "Frederik Møller", role: "field_worker", connectorProviders: ["gmail"] },
    { email: "ida@boltly.dk", name: "Ida Sørensen", role: "junior", connectorProviders: ["gmail"] },
    { email: "thomas.k@boltly.dk", name: "Thomas Kjær", role: "sales", connectorProviders: ["gmail"] },
  ] satisfies EmployeeProfile[],
  externalContacts: [
    { name: "Peter Skovgaard", email: "peter@skovgaard-ejendomme.dk", company: "Skovgaard Ejendomme" },
    { name: "Anne Thorsen", email: "anne@roedovre-tand.dk", company: "Rødovre Tandklinik" },
    { name: "Jonas Nørby", email: "jonas@cafe-norrebro.dk", company: "Café Nørrebro" },
    { name: "Karen Holm", email: "karen@vestegnens-bolig.dk", company: "Vestegnens Boligforening" },
    { name: "Thomas Hansen", email: "thomas@hl-arkitekter.dk", company: "Hansen & Larsen Arkitekter" },
    { name: "Bent Nielsen", email: "bent@el-grossisten.dk", company: "EL-Grossisten Nord" },
    { name: "Lise Grøn", email: "lise@groen-energi.dk", company: "Grøn Energi Rådgivning" },
    { name: "Martin Dall", email: "martin@nygade-center.dk", company: "Nygade Butikscenter" },
    { name: "Maria Lund", email: "maria@lundco.dk", company: "Lund & Co Advokater" },
    { name: "Niels Berthelsen", email: "niels@sikkerhedsstyrelsen.dk", company: "Sikkerhedsstyrelsen" },
    { name: "Henrik Skovgaard", email: "henrik@skovgaard-ejendomme.dk", company: "Skovgaard Ejendomme" },
    { name: "Camilla Grøn", email: "camilla@groen-energi.dk", company: "Grøn Energi Rådgivning" },
  ],
};

export const BOLTLY_CLUTTER_CONFIG: ClutterConfig = {
  systemNotifications: 30,
  autoReplies: 15,
  marketingNewsletters: 10,
  transactional: 20,
  calendarAuto: 15,
  internalChatter: 10,
};
