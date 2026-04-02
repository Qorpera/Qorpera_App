// ── Hansens Flødeis ApS — Company Profile & Static Data ─────────────────
// 13-person organic ice cream production & distribution in North Zealand. Danish locale.

import type { SyntheticEmployee, SyntheticConnector, SyntheticExternalCompany, SyntheticContact, SyntheticDeal, SyntheticInvoice, SyntheticSlackChannel } from "../../synthetic-types";
import type { CompanyProfile, ClutterConfig, EmployeeProfile } from "../generator/types";

// ── Employees ───────────────────────────────────────────────────────────

export const HANSENS_EMPLOYEES: SyntheticEmployee[] = [
  { name: "Rasmus Eibye", email: "rasmus@hansens-is.dk", role: "admin", locale: "da" },
  { name: "Anders Eibye", email: "anders@hansens-is.dk", role: "member", locale: "da" },
  { name: "Trine Damgaard", email: "trine@hansens-is.dk", role: "member", locale: "da" },
  { name: "Kim Søgaard", email: "kim.s@hansens-is.dk", role: "member", locale: "da" },
  { name: "Robert Larsen", email: "rlw@hansens-is.dk", role: "member", locale: "da" },
  { name: "Marie Gade", email: "marie@hansens-is.dk", role: "member", locale: "da" },
  { name: "Niels Brandt", email: "niels@hansens-is.dk", role: "member", locale: "da" },
  { name: "Lotte Friis", email: "lotte@hansens-is.dk", role: "member", locale: "da" },
  { name: "Jonas Kvist", email: "jonas.k@hansens-is.dk", role: "member", locale: "da" },
  { name: "Camilla Holt", email: "camilla@hansens-is.dk", role: "member", locale: "da" },
  { name: "Peter Holm", email: "peter.h@hansens-is.dk", role: "member", locale: "da" },
  { name: "Lars Winther", email: "lars.w@hansens-is.dk", role: "member", locale: "da" },
  { name: "Annemette Thomsen", email: "annemette@dsk-invest.dk", role: "member", locale: "da" },
];

// ── Connectors ──────────────────────────────────────────────────────────

export const HANSENS_CONNECTORS: SyntheticConnector[] = [
  { provider: "gmail", name: "Gmail (Rasmus)", assignedToEmployee: "rasmus@hansens-is.dk" },
  { provider: "gmail", name: "Gmail (Anders)", assignedToEmployee: "anders@hansens-is.dk" },
  { provider: "gmail", name: "Gmail (Trine)", assignedToEmployee: "trine@hansens-is.dk" },
  { provider: "gmail", name: "Gmail (Kim)", assignedToEmployee: "kim.s@hansens-is.dk" },
  { provider: "gmail", name: "Gmail (Marie)", assignedToEmployee: "marie@hansens-is.dk" },
  { provider: "google-calendar", name: "Kalender (Rasmus)", assignedToEmployee: "rasmus@hansens-is.dk" },
  { provider: "google-calendar", name: "Kalender (Trine)", assignedToEmployee: "trine@hansens-is.dk" },
  { provider: "google-drive", name: "Google Drive", assignedToEmployee: "rasmus@hansens-is.dk" },
  { provider: "e-conomic", name: "e-conomic" },
  { provider: "tracezilla", name: "TracEzilla" },
  { provider: "shipmondo", name: "Shipmondo" },
  { provider: "slack", name: "Slack" },
];

// ── External Companies ──────────────────────────────────────────────────

export const HANSENS_COMPANIES: SyntheticExternalCompany[] = [
  { name: "Coop Danmark", domain: "coop.dk", industry: "Retail", relationship: "client" },
  { name: "Salling Group", domain: "salling.dk", industry: "Retail", relationship: "client" },
  { name: "Dagrofa", domain: "dagrofa.dk", industry: "Retail", relationship: "client" },
  { name: "Nemlig.com", domain: "nemlig.com", industry: "Online Grocery", relationship: "client" },
  { name: "Svanholm Gods", domain: "svanholm.dk", industry: "Organic Farm", relationship: "vendor" },
  { name: "Friis Holm Chokolade", domain: "friisholm.com", industry: "Chocolate", relationship: "vendor" },
  { name: "sthlmicecream AB", domain: "sthlmicecream.se", industry: "Import/Distribution", relationship: "partner" },
  { name: "Den Sociale Kapitalfond", domain: "densocialekapitalfond.dk", industry: "Investment Fund", relationship: "partner" },
  { name: "Dansk Revision Hillerød", domain: "danskrevision.dk", industry: "Accounting", relationship: "vendor" },
  { name: "Mads Nørgaard Copenhagen", domain: "madsnorgaard.com", industry: "Fashion/Lifestyle", relationship: "partner" },
  { name: "GS1 Denmark", domain: "gs1.dk", industry: "Trade Standards", relationship: "vendor" },
  { name: "Joe and the Juice", domain: "joejuice.com", industry: "Foodservice", relationship: "client" },
  { name: "Sticks & Sushi", domain: "sticks.dk", industry: "Restaurant", relationship: "client" },
  { name: "Scandlines", domain: "scandlines.dk", industry: "Ferry/Transport", relationship: "client" },
  { name: "Frederikssund Kommune", domain: "frederikssund.dk", industry: "Municipality", relationship: "partner" },
  { name: "Fødevarestyrelsen", domain: "foedevarestyrelsen.dk", industry: "Food Authority", relationship: "vendor" },
];

// ── Contacts ────────────────────────────────────────────────────────────

export const HANSENS_CONTACTS: SyntheticContact[] = [
  { name: "Henrik Pedersen", email: "henrik.p@coop.dk", company: "Coop Danmark", title: "Kategorichef Is" },
  { name: "Morten Vang", email: "morten@salling.dk", company: "Salling Group", title: "Indkøber Frost" },
  { name: "Claes Odenman", email: "claes@sthlmicecream.se", company: "sthlmicecream AB", title: "Direktør" },
  { name: "Lars Jannick Johansen", email: "ljj@densocialekapitalfond.dk", company: "Den Sociale Kapitalfond", title: "Managing Partner" },
  { name: "Annemette V. Thomsen", email: "avt@densocialekapitalfond.dk", company: "Den Sociale Kapitalfond", title: "Bestyrelsesformand" },
  { name: "Kim Rahbek Hansen", email: "krh@densocialekapitalfond.dk", company: "Den Sociale Kapitalfond", title: "Bestyrelsesmedlem" },
  { name: "Søren from Svanholm", email: "soeren@svanholm.dk", company: "Svanholm Gods", title: "Mejerichef" },
  { name: "Mikkel Friis Holm", email: "mikkel@friisholm.com", company: "Friis Holm Chokolade", title: "Grundlægger" },
  { name: "Thomas Nørgaard", email: "thomas@madsnorgaard.com", company: "Mads Nørgaard Copenhagen", title: "Brand Manager" },
  { name: "Jens from GS1", email: "jens@gs1.dk", company: "GS1 Denmark", title: "Konsulent" },
  { name: "Karen Brygger", email: "karen@joejuice.com", company: "Joe and the Juice", title: "Procurement" },
  { name: "Martin Dall", email: "martin@scandlines.dk", company: "Scandlines", title: "F&B Manager" },
  { name: "Nina Larsen", email: "nina@frederikssund.dk", company: "Frederikssund Kommune", title: "Jobcenter" },
];

// ── Deals ───────────────────────────────────────────────────────────────

export const HANSENS_DEALS: SyntheticDeal[] = [
  { name: "Coop sommerprogram 2026", company: "Coop Danmark", contact: "Henrik Pedersen", stage: "closed-won", amount: 1200000, createdDaysAgo: 120, lastActivityDaysAgo: 5 },
  { name: "Salling Group sæsonaftale", company: "Salling Group", contact: "Morten Vang", stage: "closed-won", amount: 850000, createdDaysAgo: 90, lastActivityDaysAgo: 10 },
  { name: "Sverige ekspansion Q3", company: "sthlmicecream AB", contact: "Claes Odenman", stage: "negotiation", amount: 180000, createdDaysAgo: 21, lastActivityDaysAgo: 3 },
  { name: "Joe & Juice nyt sortiment", company: "Joe and the Juice", contact: "Karen Brygger", stage: "proposal", amount: 95000, createdDaysAgo: 14, lastActivityDaysAgo: 4 },
  { name: "Scandlines sommermenukort", company: "Scandlines", contact: "Martin Dall", stage: "qualification", amount: 65000, createdDaysAgo: 7, lastActivityDaysAgo: 2 },
  { name: "Mads Nørgaard Pop sæson 2", company: "Mads Nørgaard Copenhagen", contact: "Thomas Nørgaard", stage: "proposal", amount: 45000, createdDaysAgo: 10, lastActivityDaysAgo: 6 },
];

// ── Invoices ────────────────────────────────────────────────────────────

export const HANSENS_INVOICES: SyntheticInvoice[] = [
  { number: "INV-2026-087", company: "Coop Danmark", amount: 285000, status: "paid", issuedDaysAgo: 45 },
  { number: "INV-2026-088", company: "Salling Group", amount: 142000, status: "paid", issuedDaysAgo: 38 },
  { number: "INV-2026-089", company: "Coop Danmark", amount: 198000, status: "sent", issuedDaysAgo: 18, dueDaysAgo: -12 },
  { number: "INV-2026-090", company: "Dagrofa", amount: 67500, status: "overdue", issuedDaysAgo: 25, daysOverdue: 11 },
  { number: "INV-2026-091", company: "Nemlig.com", amount: 34200, status: "paid", issuedDaysAgo: 30 },
  { number: "INV-2026-092", company: "Joe and the Juice", amount: 28800, status: "sent", issuedDaysAgo: 10, dueDaysAgo: -20 },
  { number: "INV-2026-093", company: "Salling Group", amount: 210000, status: "draft", issuedDaysAgo: 2 },
  { number: "INV-2026-094", company: "Scandlines", amount: 18500, status: "overdue", issuedDaysAgo: 22, daysOverdue: 8 },
  { number: "INV-2026-095", company: "sthlmicecream AB", amount: 45000, status: "sent", issuedDaysAgo: 15, dueDaysAgo: -15 },
  { number: "INV-2026-096", company: "Coop Danmark", amount: 52000, status: "draft", issuedDaysAgo: 1 },
];

// ── Slack Channels ──────────────────────────────────────────────────────

export const HANSENS_SLACK_CHANNELS: SyntheticSlackChannel[] = [
  { channelId: "C001GEN", channelName: "#general" },
  { channelId: "C002PROD", channelName: "#produktion" },
  { channelId: "C003SALG", channelName: "#salg" },
  { channelId: "C004LAGER", channelName: "#lager-logistik" },
  { channelId: "C005KVALITET", channelName: "#kvalitet" },
];

// ── Generator Profile ───────────────────────────────────────────────────

export const HANSENS_PROFILE: CompanyProfile = {
  domain: "hansens-is.dk",
  name: "Hansens Flødeis ApS",
  locale: "da",
  connectorProviders: ["gmail", "google-calendar", "google-drive", "e-conomic", "tracezilla", "shipmondo", "slack"],
  employees: [
    { email: "rasmus@hansens-is.dk", name: "Rasmus Eibye", role: "ceo", connectorProviders: ["gmail", "google-calendar", "google-drive"] },
    { email: "anders@hansens-is.dk", name: "Anders Eibye", role: "manager", connectorProviders: ["gmail"] },
    { email: "trine@hansens-is.dk", name: "Trine Damgaard", role: "admin", connectorProviders: ["gmail", "google-calendar"] },
    { email: "kim.s@hansens-is.dk", name: "Kim Søgaard", role: "sales", connectorProviders: ["gmail"] },
    { email: "rlw@hansens-is.dk", name: "Robert Larsen", role: "manager", connectorProviders: [] },
    { email: "marie@hansens-is.dk", name: "Marie Gade", role: "admin", connectorProviders: ["gmail"] },
    { email: "niels@hansens-is.dk", name: "Niels Brandt", role: "junior", connectorProviders: [] },
    { email: "lotte@hansens-is.dk", name: "Lotte Friis", role: "junior", connectorProviders: [] },
    { email: "jonas.k@hansens-is.dk", name: "Jonas Kvist", role: "junior", connectorProviders: [] },
    { email: "camilla@hansens-is.dk", name: "Camilla Holt", role: "admin", connectorProviders: [] },
    { email: "peter.h@hansens-is.dk", name: "Peter Holm", role: "junior", connectorProviders: [] },
    { email: "lars.w@hansens-is.dk", name: "Lars Winther", role: "junior", connectorProviders: [] },
    { email: "annemette@dsk-invest.dk", name: "Annemette Thomsen", role: "manager", connectorProviders: [] },
  ] satisfies EmployeeProfile[],
  externalContacts: [
    { name: "Henrik Pedersen", email: "henrik.p@coop.dk", company: "Coop Danmark" },
    { name: "Morten Vang", email: "morten@salling.dk", company: "Salling Group" },
    { name: "Claes Odenman", email: "claes@sthlmicecream.se", company: "sthlmicecream AB" },
    { name: "Lars Jannick Johansen", email: "ljj@densocialekapitalfond.dk", company: "Den Sociale Kapitalfond" },
    { name: "Annemette V. Thomsen", email: "avt@densocialekapitalfond.dk", company: "Den Sociale Kapitalfond" },
    { name: "Kim Rahbek Hansen", email: "krh@densocialekapitalfond.dk", company: "Den Sociale Kapitalfond" },
    { name: "Søren from Svanholm", email: "soeren@svanholm.dk", company: "Svanholm Gods" },
    { name: "Mikkel Friis Holm", email: "mikkel@friisholm.com", company: "Friis Holm Chokolade" },
    { name: "Thomas Nørgaard", email: "thomas@madsnorgaard.com", company: "Mads Nørgaard Copenhagen" },
    { name: "Jens from GS1", email: "jens@gs1.dk", company: "GS1 Denmark" },
    { name: "Karen Brygger", email: "karen@joejuice.com", company: "Joe and the Juice" },
    { name: "Martin Dall", email: "martin@scandlines.dk", company: "Scandlines" },
    { name: "Nina Larsen", email: "nina@frederikssund.dk", company: "Frederikssund Kommune" },
  ],
};

export const HANSENS_CLUTTER_CONFIG: ClutterConfig = {
  systemNotifications: 40,
  autoReplies: 20,
  marketingNewsletters: 15,
  transactional: 30,
  calendarAuto: 20,
  internalChatter: 15,
};
