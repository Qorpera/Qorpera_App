// ── Hansens Flødeis ApS — Company Profile & Static Data ─────────────────
// 13-person organic ice cream production & distribution in North Zealand. Danish locale.
// v3 expanded data: 20 companies, 22 contacts, 48 invoices, 10 deals, 6 Slack channels,
// 14 connectors, full operational config for generator.

import type { SyntheticEmployee, SyntheticConnector, SyntheticExternalCompany, SyntheticContact, SyntheticDeal, SyntheticInvoice, SyntheticSlackChannel } from "../../synthetic-types";
import type { CompanyProfile, ClutterConfig, EmployeeProfile } from "../generator/types";

// ── Employees (13 office-layer accounts) ───────────────────────────────

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

// ── Connectors (14) ────────────────────────────────────────────────────

export const HANSENS_CONNECTORS: SyntheticConnector[] = [
  { provider: "gmail", name: "Gmail (Rasmus)", assignedToEmployee: "rasmus@hansens-is.dk" },
  { provider: "gmail", name: "Gmail (Anders)", assignedToEmployee: "anders@hansens-is.dk" },
  { provider: "gmail", name: "Gmail (Trine)", assignedToEmployee: "trine@hansens-is.dk" },
  { provider: "gmail", name: "Gmail (Kim S)", assignedToEmployee: "kim.s@hansens-is.dk" },
  { provider: "gmail", name: "Gmail (Marie)", assignedToEmployee: "marie@hansens-is.dk" },
  { provider: "gmail", name: "Gmail (Robert)", assignedToEmployee: "rlw@hansens-is.dk" },
  { provider: "google-calendar", name: "Kalender (Rasmus)", assignedToEmployee: "rasmus@hansens-is.dk" },
  { provider: "google-calendar", name: "Kalender (Trine)", assignedToEmployee: "trine@hansens-is.dk" },
  { provider: "google-calendar", name: "Kalender (Marie)", assignedToEmployee: "marie@hansens-is.dk" },
  { provider: "google-drive", name: "Google Drive", assignedToEmployee: "rasmus@hansens-is.dk" },
  { provider: "economic", name: "e-conomic" },
  { provider: "tracezilla", name: "Tracezilla" },
  { provider: "shipmondo", name: "Shipmondo" },
  { provider: "slack", name: "Slack" },
];

// ── External Companies (20) ────────────────────────────────────────────

export const HANSENS_COMPANIES: SyntheticExternalCompany[] = [
  // Retail clients
  { name: "Coop Danmark", domain: "coop.dk", industry: "Retail", relationship: "client" },
  { name: "Salling Group", domain: "salling.dk", industry: "Retail", relationship: "client" },
  { name: "Dagrofa", domain: "dagrofa.dk", industry: "Retail", relationship: "client" },
  { name: "Nemlig.com", domain: "nemlig.com", industry: "Online Grocery", relationship: "client" },
  // Foodservice / OOH clients
  { name: "Joe and the Juice", domain: "joejuice.com", industry: "Foodservice", relationship: "client" },
  { name: "Sticks & Sushi", domain: "sticks.dk", industry: "Restaurant", relationship: "client" },
  { name: "Scandlines", domain: "scandlines.dk", industry: "Ferry/Transport", relationship: "client" },
  { name: "Roskilde Festival", domain: "rfrm.dk", industry: "Event", relationship: "client" },
  { name: "Irma / Coop Specialbutikker", domain: "irma.dk", industry: "Premium Retail", relationship: "client" },
  // Partners
  { name: "sthlmicecream AB", domain: "sthlmicecream.se", industry: "Import/Distribution", relationship: "partner" },
  { name: "Mads Nørgaard Copenhagen", domain: "madsnorgaard.com", industry: "Fashion/Lifestyle", relationship: "partner" },
  { name: "Den Sociale Kapitalfond", domain: "densocialekapitalfond.dk", industry: "Investment Fund", relationship: "partner" },
  { name: "Frederikssund Kommune", domain: "frederikssund.dk", industry: "Municipality", relationship: "partner" },
  // Vendors
  { name: "Svanholm Gods", domain: "svanholm.dk", industry: "Organic Farm", relationship: "vendor" },
  { name: "Friis Holm Chokolade", domain: "friisholm.com", industry: "Chocolate", relationship: "vendor" },
  { name: "Emballage Danmark", domain: "emballage.dk", industry: "Packaging", relationship: "vendor" },
  { name: "Palsgaard A/S", domain: "palsgaard.dk", industry: "Food Ingredients", relationship: "vendor" },
  { name: "Dansk Revision Hillerød", domain: "danskrevision.dk", industry: "Accounting", relationship: "vendor" },
  { name: "GS1 Denmark", domain: "gs1.dk", industry: "Trade Standards", relationship: "vendor" },
  { name: "Fødevarestyrelsen", domain: "fvst.dk", industry: "Food Authority", relationship: "vendor" },
];

// ── Contacts (22) ──────────────────────────────────────────────────────

export const HANSENS_CONTACTS: SyntheticContact[] = [
  { name: "Henrik Pedersen", email: "henrik.p@coop.dk", company: "Coop Danmark", title: "Kategorichef Is" },
  { name: "Louise Bech", email: "louise.b@coop.dk", company: "Coop Danmark", title: "Supply Chain Coordinator" },
  { name: "Morten Vang", email: "morten@salling.dk", company: "Salling Group", title: "Indkøber Frost" },
  { name: "Pernille Skov", email: "pernille@dagrofa.dk", company: "Dagrofa", title: "Kategorichef" },
  { name: "Jakob Friis", email: "jakob@nemlig.com", company: "Nemlig.com", title: "Sortimentschef" },
  { name: "Karen Brygger", email: "karen@joejuice.com", company: "Joe and the Juice", title: "Procurement Manager" },
  { name: "Martin Dall", email: "martin@scandlines.dk", company: "Scandlines", title: "F&B Manager" },
  { name: "Anne Juul", email: "anne@rfrm.dk", company: "Roskilde Festival", title: "Partnership Manager" },
  { name: "Claes Odenman", email: "claes@sthlmicecream.se", company: "sthlmicecream AB", title: "Direktör" },
  { name: "Thomas Nørgaard", email: "thomas@madsnorgaard.com", company: "Mads Nørgaard Copenhagen", title: "Brand Manager" },
  { name: "Søren Vestergaard", email: "soeren@svanholm.dk", company: "Svanholm Gods", title: "Mejerichef" },
  { name: "Mikkel Friis Holm", email: "mikkel@friisholm.com", company: "Friis Holm Chokolade", title: "Grundlægger" },
  { name: "Brian from Emballage", email: "brian@emballage.dk", company: "Emballage Danmark", title: "Kundeansvarlig" },
  { name: "Stefan Lund", email: "stefan@palsgaard.dk", company: "Palsgaard A/S", title: "Salgskonsulent" },
  { name: "Lars Jannick Johansen", email: "ljj@densocialekapitalfond.dk", company: "Den Sociale Kapitalfond", title: "Managing Partner" },
  { name: "Annemette V. Thomsen", email: "avt@densocialekapitalfond.dk", company: "Den Sociale Kapitalfond", title: "Bestyrelsesformand" },
  { name: "Kim Rahbek Hansen", email: "krh@densocialekapitalfond.dk", company: "Den Sociale Kapitalfond", title: "Bestyrelsesmedlem" },
  { name: "Christian from DSK", email: "christian@densocialekapitalfond.dk", company: "Den Sociale Kapitalfond", title: "ESG Analyst" },
  { name: "Jens Møller", email: "jens@gs1.dk", company: "GS1 Denmark", title: "EDI Konsulent" },
  { name: "Nina Larsen", email: "nina@frederikssund.dk", company: "Frederikssund Kommune", title: "Jobcenter Konsulent" },
  { name: "Per Aagaard", email: "per@fvst.dk", company: "Fødevarestyrelsen", title: "Tilsynsførende" },
  { name: "Eva Winther", email: "eva@sticks.dk", company: "Sticks & Sushi", title: "Indkøber" },
];

// ── Deals (10) ─────────────────────────────────────────────────────────

export const HANSENS_DEALS: SyntheticDeal[] = [
  // Retail contracts (closed-won)
  { name: "Coop sommerprogram 2026", company: "Coop Danmark", contact: "Henrik Pedersen", stage: "closed-won", amount: 1200000, createdDaysAgo: 120, lastActivityDaysAgo: 5 },
  { name: "Salling Group sæsonaftale 2026", company: "Salling Group", contact: "Morten Vang", stage: "closed-won", amount: 850000, createdDaysAgo: 90, lastActivityDaysAgo: 10 },
  { name: "Dagrofa MENY forårsrestock", company: "Dagrofa", contact: "Pernille Skov", stage: "closed-won", amount: 280000, createdDaysAgo: 75, lastActivityDaysAgo: 18 },
  // Active pipeline
  { name: "Sverige ekspansion Q3", company: "sthlmicecream AB", contact: "Claes Odenman", stage: "negotiation", amount: 180000, createdDaysAgo: 21, lastActivityDaysAgo: 3 },
  { name: "Joe & Juice nyt sortiment", company: "Joe and the Juice", contact: "Karen Brygger", stage: "proposal", amount: 95000, createdDaysAgo: 14, lastActivityDaysAgo: 4 },
  { name: "Scandlines sommermenukort", company: "Scandlines", contact: "Martin Dall", stage: "qualification", amount: 65000, createdDaysAgo: 7, lastActivityDaysAgo: 2 },
  { name: "Mads Nørgaard Pop sæson 2", company: "Mads Nørgaard Copenhagen", contact: "Thomas Nørgaard", stage: "proposal", amount: 45000, createdDaysAgo: 10, lastActivityDaysAgo: 6 },
  { name: "Roskilde Festival 2026", company: "Roskilde Festival", contact: "Anne Juul", stage: "negotiation", amount: 120000, createdDaysAgo: 30, lastActivityDaysAgo: 8 },
  { name: "Irma premium sortiment", company: "Irma / Coop Specialbutikker", contact: "Henrik Pedersen", stage: "qualification", amount: 150000, createdDaysAgo: 5, lastActivityDaysAgo: 1 },
  // OOH pipeline (Robert's work)
  { name: "Ny café-kæde Kbh (Roberts)", company: "Joe and the Juice", stage: "qualification", amount: 35000, createdDaysAgo: 4, lastActivityDaysAgo: 1 },
];

// ── Invoices (48) ──────────────────────────────────────────────────────

export const HANSENS_INVOICES: SyntheticInvoice[] = [
  // ── Coop Danmark (8 invoices — largest customer ~40% of retail) ──────
  { number: "INV-2026-051", company: "Coop Danmark", amount: 312000, status: "paid", issuedDaysAgo: 110 },
  { number: "INV-2026-058", company: "Coop Danmark", amount: 198500, status: "paid", issuedDaysAgo: 95 },
  { number: "INV-2026-064", company: "Coop Danmark", amount: 285000, status: "paid", issuedDaysAgo: 78 },
  { number: "INV-2026-071", company: "Coop Danmark", amount: 142000, status: "paid", issuedDaysAgo: 60 },
  { number: "INV-2026-078", company: "Coop Danmark", amount: 198000, status: "paid", issuedDaysAgo: 45 },
  { number: "INV-2026-084", company: "Coop Danmark", amount: 265000, status: "sent", issuedDaysAgo: 22 },
  { number: "INV-2026-089", company: "Coop Danmark", amount: 385000, status: "sent", issuedDaysAgo: 12 },
  { number: "INV-2026-096", company: "Coop Danmark", amount: 52000, status: "draft", issuedDaysAgo: 1 },

  // ── Salling Group (6 invoices — ~25% of retail) ─────────────────────
  { number: "INV-2026-052", company: "Salling Group", amount: 175000, status: "paid", issuedDaysAgo: 108 },
  { number: "INV-2026-059", company: "Salling Group", amount: 98000, status: "paid", issuedDaysAgo: 92 },
  { number: "INV-2026-066", company: "Salling Group", amount: 210000, status: "paid", issuedDaysAgo: 72 },
  { number: "INV-2026-075", company: "Salling Group", amount: 145000, status: "paid", issuedDaysAgo: 52 },
  { number: "INV-2026-082", company: "Salling Group", amount: 188000, status: "sent", issuedDaysAgo: 28 },
  { number: "INV-2026-093", company: "Salling Group", amount: 210000, status: "draft", issuedDaysAgo: 2 },

  // ── Dagrofa (5 invoices — ~15% of retail) ───────────────────────────
  { number: "INV-2026-054", company: "Dagrofa", amount: 67500, status: "paid", issuedDaysAgo: 102 },
  { number: "INV-2026-062", company: "Dagrofa", amount: 82000, status: "paid", issuedDaysAgo: 85 },
  { number: "INV-2026-072", company: "Dagrofa", amount: 54000, status: "paid", issuedDaysAgo: 58 },
  { number: "INV-2026-080", company: "Dagrofa", amount: 67500, status: "overdue", issuedDaysAgo: 35, daysOverdue: 11 },
  { number: "INV-2026-088", company: "Dagrofa", amount: 48000, status: "sent", issuedDaysAgo: 15 },

  // ── Nemlig.com (4 invoices) ─────────────────────────────────────────
  { number: "INV-2026-056", company: "Nemlig.com", amount: 34200, status: "paid", issuedDaysAgo: 98 },
  { number: "INV-2026-065", company: "Nemlig.com", amount: 28500, status: "paid", issuedDaysAgo: 76 },
  { number: "INV-2026-074", company: "Nemlig.com", amount: 38700, status: "paid", issuedDaysAgo: 55 },
  { number: "INV-2026-086", company: "Nemlig.com", amount: 42100, status: "sent", issuedDaysAgo: 18 },

  // ── Foodservice / OOH (10 invoices) ─────────────────────────────────
  // Joe and the Juice
  { number: "INV-2026-053", company: "Joe and the Juice", amount: 28800, status: "paid", issuedDaysAgo: 105 },
  { number: "INV-2026-061", company: "Joe and the Juice", amount: 32400, status: "paid", issuedDaysAgo: 88 },
  { number: "INV-2026-070", company: "Joe and the Juice", amount: 35600, status: "paid", issuedDaysAgo: 62 },
  { number: "INV-2026-085", company: "Joe and the Juice", amount: 38200, status: "sent", issuedDaysAgo: 20 },
  // Sticks & Sushi
  { number: "INV-2026-055", company: "Sticks & Sushi", amount: 22000, status: "paid", issuedDaysAgo: 100 },
  { number: "INV-2026-068", company: "Sticks & Sushi", amount: 24500, status: "paid", issuedDaysAgo: 68 },
  { number: "INV-2026-083", company: "Sticks & Sushi", amount: 26800, status: "sent", issuedDaysAgo: 25 },
  // Scandlines
  { number: "INV-2026-057", company: "Scandlines", amount: 18500, status: "overdue", issuedDaysAgo: 96, daysOverdue: 8 },
  { number: "INV-2026-069", company: "Scandlines", amount: 15200, status: "paid", issuedDaysAgo: 65 },
  { number: "INV-2026-087", company: "Scandlines", amount: 19800, status: "sent", issuedDaysAgo: 16 },

  // ── Export — sthlmicecream AB (3 invoices) ──────────────────────────
  { number: "INV-2026-063", company: "sthlmicecream AB", amount: 32000, status: "paid", issuedDaysAgo: 82 },
  { number: "INV-2026-077", company: "sthlmicecream AB", amount: 45000, status: "sent", issuedDaysAgo: 48 },
  { number: "INV-2026-091", company: "sthlmicecream AB", amount: 58000, status: "sent", issuedDaysAgo: 8 },

  // ── Diverse småkunder — OOH kanal (12 invoices) ─────────────────────
  { number: "INV-2026-060", company: "Roskilde Festival", amount: 4200, status: "paid", issuedDaysAgo: 90 },
  { number: "INV-2026-067", company: "Roskilde Festival", amount: 6800, status: "paid", issuedDaysAgo: 70 },
  { number: "INV-2026-073", company: "Roskilde Festival", amount: 3500, status: "paid", issuedDaysAgo: 56 },
  { number: "INV-2026-076", company: "Roskilde Festival", amount: 5100, status: "paid", issuedDaysAgo: 50 },
  { number: "INV-2026-079", company: "Roskilde Festival", amount: 8200, status: "paid", issuedDaysAgo: 40 },
  { number: "INV-2026-081", company: "Roskilde Festival", amount: 4800, status: "overdue", issuedDaysAgo: 32, daysOverdue: 2 },
  { number: "INV-2026-090", company: "Roskilde Festival", amount: 7500, status: "sent", issuedDaysAgo: 14 },
  { number: "INV-2026-092", company: "Irma / Coop Specialbutikker", amount: 12400, status: "sent", issuedDaysAgo: 10 },
  { number: "INV-2026-094", company: "Irma / Coop Specialbutikker", amount: 3200, status: "sent", issuedDaysAgo: 6 },
  { number: "INV-2026-095", company: "Joe and the Juice", amount: 9800, status: "draft", issuedDaysAgo: 3 },
  { number: "INV-2026-097", company: "Scandlines", amount: 5500, status: "draft", issuedDaysAgo: 1 },
  { number: "INV-2026-098", company: "Roskilde Festival", amount: 15000, status: "draft", issuedDaysAgo: 0 },
];

// ── Slack Channels (6) ─────────────────────────────────────────────────

export const HANSENS_SLACK_CHANNELS: SyntheticSlackChannel[] = [
  { channelId: "C001GEN", channelName: "#general" },
  { channelId: "C002PROD", channelName: "#produktion" },
  { channelId: "C003SALG", channelName: "#salg" },
  { channelId: "C004LAGER", channelName: "#lager-logistik" },
  { channelId: "C005KVALITET", channelName: "#kvalitet" },
  { channelId: "C006LEDELSE", channelName: "#ledelse" },
];

// ── Generator Profile ──────────────────────────────────────────────────

export const HANSENS_PROFILE: CompanyProfile = {
  domain: "hansens-is.dk",
  name: "Hansens Flødeis ApS",
  locale: "da",
  connectorProviders: ["gmail", "google-calendar", "google-drive", "economic", "tracezilla", "shipmondo", "slack", "pleo"],
  employees: [
    { email: "rasmus@hansens-is.dk", name: "Rasmus Eibye", role: "ceo", connectorProviders: ["gmail", "google-calendar", "google-drive", "tracezilla"] },
    { email: "anders@hansens-is.dk", name: "Anders Eibye", role: "sales", connectorProviders: ["gmail", "google-calendar"] },
    { email: "trine@hansens-is.dk", name: "Trine Damgaard", role: "manager", connectorProviders: ["gmail", "google-calendar", "tracezilla"] },
    { email: "kim.s@hansens-is.dk", name: "Kim Søgaard", role: "sales", connectorProviders: ["gmail"] },
    { email: "rlw@hansens-is.dk", name: "Robert Larsen", role: "sales", connectorProviders: ["gmail"] },
    { email: "marie@hansens-is.dk", name: "Marie Gade", role: "admin", connectorProviders: ["gmail", "economic", "tracezilla"] },
    { email: "niels@hansens-is.dk", name: "Niels Brandt", role: "manager", connectorProviders: ["gmail", "tracezilla", "shipmondo"] },
    { email: "lotte@hansens-is.dk", name: "Lotte Friis", role: "admin", connectorProviders: ["gmail", "tracezilla"] },
    { email: "jonas.k@hansens-is.dk", name: "Jonas Kvist", role: "admin", connectorProviders: ["gmail", "shipmondo", "tracezilla"] },
    { email: "camilla@hansens-is.dk", name: "Camilla Holt", role: "sales", connectorProviders: ["gmail"] },
    { email: "peter.h@hansens-is.dk", name: "Peter Holm", role: "admin", connectorProviders: ["gmail", "economic", "tracezilla"] },
    { email: "lars.w@hansens-is.dk", name: "Lars Winther", role: "junior", connectorProviders: ["gmail"] },
    { email: "annemette@dsk-invest.dk", name: "Annemette Thomsen", role: "manager", connectorProviders: ["gmail"] },
  ] satisfies EmployeeProfile[],
  externalContacts: [
    { name: "Henrik Pedersen", email: "henrik.p@coop.dk", company: "Coop Danmark" },
    { name: "Louise Bech", email: "louise.b@coop.dk", company: "Coop Danmark" },
    { name: "Morten Vang", email: "morten@salling.dk", company: "Salling Group" },
    { name: "Pernille Skov", email: "pernille@dagrofa.dk", company: "Dagrofa" },
    { name: "Jakob Friis", email: "jakob@nemlig.com", company: "Nemlig.com" },
    { name: "Karen Brygger", email: "karen@joejuice.com", company: "Joe and the Juice" },
    { name: "Martin Dall", email: "martin@scandlines.dk", company: "Scandlines" },
    { name: "Anne Juul", email: "anne@rfrm.dk", company: "Roskilde Festival" },
    { name: "Claes Odenman", email: "claes@sthlmicecream.se", company: "sthlmicecream AB" },
    { name: "Thomas Nørgaard", email: "thomas@madsnorgaard.com", company: "Mads Nørgaard Copenhagen" },
    { name: "Søren Vestergaard", email: "soeren@svanholm.dk", company: "Svanholm Gods" },
    { name: "Mikkel Friis Holm", email: "mikkel@friisholm.com", company: "Friis Holm Chokolade" },
    { name: "Brian from Emballage", email: "brian@emballage.dk", company: "Emballage Danmark" },
    { name: "Stefan Lund", email: "stefan@palsgaard.dk", company: "Palsgaard A/S" },
    { name: "Lars Jannick Johansen", email: "ljj@densocialekapitalfond.dk", company: "Den Sociale Kapitalfond" },
    { name: "Annemette V. Thomsen", email: "avt@densocialekapitalfond.dk", company: "Den Sociale Kapitalfond" },
    { name: "Kim Rahbek Hansen", email: "krh@densocialekapitalfond.dk", company: "Den Sociale Kapitalfond" },
    { name: "Christian from DSK", email: "christian@densocialekapitalfond.dk", company: "Den Sociale Kapitalfond" },
    { name: "Jens Møller", email: "jens@gs1.dk", company: "GS1 Denmark" },
    { name: "Nina Larsen", email: "nina@frederikssund.dk", company: "Frederikssund Kommune" },
    { name: "Per Aagaard", email: "per@fvst.dk", company: "Fødevarestyrelsen" },
    { name: "Eva Winther", email: "eva@sticks.dk", company: "Sticks & Sushi" },
  ],
};

// ── Clutter Config ─────────────────────────────────────────────────────

export const HANSENS_CLUTTER_CONFIG: ClutterConfig = {
  systemNotifications: 45,
  autoReplies: 25,
  marketingNewsletters: 15,
  transactional: 35,
  calendarAuto: 25,
  internalChatter: 20,
};

// ── Operational Config ─────────────────────────────────────────────────
// Config for the operational content generator (Tracezilla, Shipmondo,
// Slack ops, routine emails, Pleo expenses, calendar ops).
// Type will be imported from generator/operational-templates.ts when available.

export const HANSENS_OPERATIONAL_CONFIG = {
  tracezillaOrders: {
    customers: [
      { name: "Coop Danmark", products: ["Vanille 500ml", "Chokolade 500ml", "Jordbær 500ml", "O'Payo 6-pak", "Islagkage"], frequency: "weekly" as const, avgOrderSize: 250 },
      { name: "Salling Group", products: ["Vanille 500ml", "Chokolade 500ml", "Salt Karamel 500ml", "O'Payo 6-pak"], frequency: "weekly" as const, avgOrderSize: 180 },
      { name: "Dagrofa", products: ["Vanille 500ml", "Chokolade 500ml"], frequency: "biweekly" as const, avgOrderSize: 80 },
      { name: "Nemlig.com", products: ["Vanille 500ml", "Chokolade 500ml", "Jordbær 500ml", "Lakrids 500ml"], frequency: "weekly" as const, avgOrderSize: 45 },
      { name: "Joe and the Juice", products: ["Softice-base Vanille 10L", "Softice-base Chokolade 10L"], frequency: "biweekly" as const, avgOrderSize: 30 },
      { name: "Sticks & Sushi", products: ["Vanille 500ml", "Chokolade 500ml"], frequency: "monthly" as const, avgOrderSize: 25 },
      { name: "Scandlines", products: ["Ispinde assorteret", "Softice-base 10L"], frequency: "monthly" as const, avgOrderSize: 40 },
      { name: "sthlmicecream AB", products: ["Vanille 500ml", "Chokolade 500ml", "Nørgaard Pop"], frequency: "monthly" as const, avgOrderSize: 60 },
    ],
    products: [
      { name: "Hansens Vanille Flødeis 500ml", sku: "HF-VAN-500", unit: "stk", organic: true },
      { name: "Hansens Chokolade Flødeis 500ml", sku: "HF-CHO-500", unit: "stk", organic: true },
      { name: "Hansens Jordbær Sorbet 500ml", sku: "HF-JOR-500", unit: "stk", organic: true },
      { name: "Hansens Salt Karamel 500ml", sku: "HF-SKA-500", unit: "stk", organic: true },
      { name: "Hansens Lakrids Flødeis 500ml", sku: "HF-LAK-500", unit: "stk", organic: true },
      { name: "Hansens O'Payo Ispinde 6-pak", sku: "HF-OPA-6PK", unit: "pak", organic: true },
      { name: "Hansens Nørgaard Pop Ispind", sku: "HF-NOP-1", unit: "stk", organic: true },
      { name: "Hansens Softice-base Vanille 10L", sku: "HF-SFV-10L", unit: "dunk", organic: true },
      { name: "Hansens Softice-base Chokolade 10L", sku: "HF-SFC-10L", unit: "dunk", organic: true },
      { name: "Hansens Islagkage Jordbær/Vanille", sku: "HF-ILK-JV", unit: "stk", organic: true },
    ],
    daysBack: 30,
  },
  tracezillaBatches: {
    products: [
      { name: "Vanille Flødeis 500ml", batchPrefix: "V", dailyVolume: 1200, unit: "stk" },
      { name: "Chokolade Flødeis 500ml", batchPrefix: "C", dailyVolume: 900, unit: "stk" },
      { name: "Jordbær Sorbet 500ml", batchPrefix: "J", dailyVolume: 600, unit: "stk" },
      { name: "Salt Karamel 500ml", batchPrefix: "SK", dailyVolume: 700, unit: "stk" },
      { name: "O'Payo Ispinde", batchPrefix: "O", dailyVolume: 1500, unit: "stk" },
      { name: "Softice-base Vanille 10L", batchPrefix: "SF", dailyVolume: 200, unit: "dunk" },
    ],
    milkSupplier: { name: "Svanholm Gods", lotPrefix: "SM" },
    daysBack: 30,
  },
  shipmondo: {
    routes: [
      { destination: "Coop Centrallager Albertslund", carrier: "GLS DK", frequency: "weekly" as const, palletRange: [10, 18] as [number, number] },
      { destination: "Salling Group DC Hasselager", carrier: "Frigo Transport", frequency: "weekly" as const, palletRange: [6, 12] as [number, number] },
      { destination: "Dagrofa Centrallager", carrier: "GLS DK", frequency: "biweekly" as const, palletRange: [3, 6] as [number, number] },
      { destination: "Nemlig.com Brøndby", carrier: "Egen kølbil", frequency: "weekly" as const, palletRange: [1, 3] as [number, number] },
      { destination: "sthlmicecream AB Stockholm", carrier: "DHL Express Frost", frequency: "monthly" as const, palletRange: [2, 4] as [number, number] },
    ],
    ownTruckRoutes: [
      { name: "OOH København", stops: ["Joe & Juice", "Sticks & Sushi", "Café Havnen", "Louisiana"], frequency: "weekly" as const },
      { name: "OOH Nordsjælland", stops: ["Ishuset Hornbæk", "Bakken", "Tivoli Friheden", "Diverse"], frequency: "weekly" as const },
    ],
    daysBack: 30,
  },
  slackOps: {
    channels: [
      { name: "#produktion", posters: ["niels@hansens-is.dk", "trine@hansens-is.dk"], templateType: "production" as const },
      { name: "#lager-logistik", posters: ["jonas.k@hansens-is.dk"], templateType: "logistics" as const },
      { name: "#kvalitet", posters: ["lotte@hansens-is.dk", "niels@hansens-is.dk"], templateType: "quality" as const },
      { name: "#salg", posters: ["rlw@hansens-is.dk", "kim.s@hansens-is.dk", "anders@hansens-is.dk"], templateType: "sales" as const },
      { name: "#general", posters: ["rasmus@hansens-is.dk", "trine@hansens-is.dk", "anders@hansens-is.dk"], templateType: "general" as const },
      { name: "#ledelse", posters: ["trine@hansens-is.dk", "marie@hansens-is.dk", "rasmus@hansens-is.dk", "anders@hansens-is.dk"], templateType: "general" as const },
    ],
    daysBack: 30,
  },
  routineEmails: {
    supplierEmails: [
      { name: "Svanholm Gods", email: "soeren@svanholm.dk", contactName: "Søren", topic: "mælkeleverance" },
      { name: "Friis Holm", email: "mikkel@friisholm.com", contactName: "Mikkel", topic: "chokolade" },
      { name: "Emballage Danmark", email: "brian@emballage.dk", contactName: "Brian", topic: "emballage" },
      { name: "Palsgaard", email: "stefan@palsgaard.dk", contactName: "Stefan", topic: "emulgator" },
    ],
    internalRoutines: [
      { from: "trine@hansens-is.dk", to: "rasmus@hansens-is.dk", topic: "driftsstatus", frequency: "weekly" as const },
      { from: "marie@hansens-is.dk", to: "rasmus@hansens-is.dk", topic: "økonomioverblik", frequency: "weekly" as const },
      { from: "niels@hansens-is.dk", to: "trine@hansens-is.dk", topic: "produktionsplan", frequency: "daily" as const },
      { from: "jonas.k@hansens-is.dk", to: "trine@hansens-is.dk", topic: "leveringsstatus", frequency: "daily" as const },
    ],
    daysBack: 30,
  },
  pleoExpenses: {
    categories: [
      { name: "Diesel kølbil", avgAmount: 850, frequency: 4, employees: ["jonas.k@hansens-is.dk"] },
      { name: "Leverandørfrokost", avgAmount: 450, frequency: 2, employees: ["anders@hansens-is.dk", "kim.s@hansens-is.dk"] },
      { name: "Feltbesøg transport/frokost", avgAmount: 350, frequency: 3, employees: ["rlw@hansens-is.dk"] },
      { name: "Prøvematerialer", avgAmount: 280, frequency: 2, employees: ["lotte@hansens-is.dk", "peter.h@hansens-is.dk"] },
      { name: "Fotografi/indhold", avgAmount: 1200, frequency: 1, employees: ["camilla@hansens-is.dk"] },
      { name: "Kontorudstyr", avgAmount: 500, frequency: 1, employees: ["marie@hansens-is.dk"] },
      { name: "Leverandørmesse", avgAmount: 800, frequency: 1, employees: ["peter.h@hansens-is.dk"] },
    ],
    daysBack: 30,
  },
  calendarOps: {
    recurring: [
      { title: "Ugentlig produktionsplanlægning", attendees: ["trine@hansens-is.dk", "niels@hansens-is.dk", "jonas.k@hansens-is.dk"], frequency: "weekly" as const },
      { title: "Salgsmøde — sæsonopdatering", attendees: ["anders@hansens-is.dk", "kim.s@hansens-is.dk", "rlw@hansens-is.dk", "camilla@hansens-is.dk"], frequency: "weekly" as const },
      { title: "Daglig morgenbriefing", attendees: ["trine@hansens-is.dk", "niels@hansens-is.dk"], frequency: "daily" as const },
      { title: "Kvalitetsgennemgang", attendees: ["lotte@hansens-is.dk", "niels@hansens-is.dk", "trine@hansens-is.dk"], frequency: "biweekly" as const },
      { title: "Økonomimøde", attendees: ["marie@hansens-is.dk", "rasmus@hansens-is.dk"], frequency: "monthly" as const },
    ],
    daysBack: 30,
  },
} as const;
