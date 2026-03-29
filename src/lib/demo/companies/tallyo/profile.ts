// ── Tallyo ApS — Company Profile & Static Data ─────────────────────────
// 25-person B2B SaaS company selling project management tools for
// creative agencies. Danish locale, heavy Slack/HubSpot usage.

import type { SyntheticEmployee, SyntheticConnector, SyntheticExternalCompany, SyntheticContact, SyntheticDeal, SyntheticInvoice, SyntheticSlackChannel } from "../../synthetic-types";
import type { CompanyProfile, ClutterConfig, EmployeeProfile } from "../generator/types";

// ── Employees (25) ──────────────────────────────────────────────────────

export const TALLYO_EMPLOYEES: SyntheticEmployee[] = [
  // Leadership
  { name: "Mads Kjeldsen", email: "mads@tallyo.dk", role: "admin", locale: "da" },
  { name: "Louise Dahl", email: "louise@tallyo.dk", role: "member", locale: "da" },
  { name: "Nikolaj Brandt", email: "nikolaj@tallyo.dk", role: "member", locale: "da" },

  // Engineering
  { name: "Simon Hviid", email: "simon@tallyo.dk", role: "member", locale: "da" },
  { name: "Camilla Rask", email: "camilla@tallyo.dk", role: "member", locale: "da" },
  { name: "Jakob Winther", email: "jakob@tallyo.dk", role: "member", locale: "da" },
  { name: "Maja Vestergaard", email: "maja@tallyo.dk", role: "member", locale: "da" },
  { name: "Rasmus Lind", email: "rasmus@tallyo.dk", role: "member", locale: "da" },
  { name: "Oliver Krogh", email: "oliver@tallyo.dk", role: "member", locale: "da" },
  { name: "Katrine Bech", email: "katrine@tallyo.dk", role: "member", locale: "da" },
  // Steen is listed as employee but is actually a freelance DevOps contractor
  { name: "Steen Gram", email: "steen@tallyo.dk", role: "member", locale: "da" },

  // Sales
  { name: "Anna Friis", email: "anna@tallyo.dk", role: "member", locale: "da" },
  { name: "Peter Mortensen", email: "peter.m@tallyo.dk", role: "member", locale: "da" },
  { name: "Fie Andersen", email: "fie@tallyo.dk", role: "member", locale: "da" },
  { name: "Christian Lund", email: "christian@tallyo.dk", role: "member", locale: "da" },
  { name: "Julie Hauge", email: "julie@tallyo.dk", role: "member", locale: "da" },

  // Customer Success
  { name: "Mathilde Holm", email: "mathilde@tallyo.dk", role: "member", locale: "da" },
  { name: "Emil Grønbech", email: "emil.g@tallyo.dk", role: "member", locale: "da" },
  { name: "Sara Juhl", email: "sara.j@tallyo.dk", role: "member", locale: "da" },
  { name: "Nanna Kirk", email: "nanna@tallyo.dk", role: "member", locale: "da" },

  // Marketing
  { name: "Freja Storm", email: "freja@tallyo.dk", role: "member", locale: "da" },
  { name: "Mikkel Aagaard", email: "mikkel.a@tallyo.dk", role: "member", locale: "da" },
  { name: "Sofie Thy", email: "sofie.t@tallyo.dk", role: "member", locale: "da" },

  // Operations
  { name: "Maria Bak", email: "maria@tallyo.dk", role: "member", locale: "da" },
  { name: "Pernille Krogh", email: "pernille@tallyo.dk", role: "member", locale: "da" },
];

// ── Connectors ──────────────────────────────────────────────────────────

export const TALLYO_CONNECTORS: SyntheticConnector[] = [
  { provider: "gmail", name: "Gmail (company-wide)" },
  { provider: "google-calendar", name: "Google Calendar (company-wide)" },
  { provider: "google-drive", name: "Google Drive (company-wide)" },
  { provider: "slack", name: "Slack" },
  { provider: "hubspot", name: "HubSpot CRM" },
];

// ── External Companies ──────────────────────────────────────────────────

export const TALLYO_COMPANIES: SyntheticExternalCompany[] = [
  { name: "Kreativ Bureau ApS", domain: "kreativbureau.dk", industry: "Creative Agency", relationship: "client" },
  { name: "NordAgentur", domain: "nordagentur.dk", industry: "Advertising Agency", relationship: "client" },
  { name: "MediaHuset A/S", domain: "mediahuset.dk", industry: "Media & Publishing", relationship: "client" },
  { name: "FlowAgency", domain: "flowagency.dk", industry: "Digital Agency", relationship: "partner" },
  { name: "ByteWorks ApS", domain: "byteworks.dk", industry: "Web Development", relationship: "client" },
  { name: "ScaleUp Ventures", domain: "scaleupventures.dk", industry: "Venture Capital", relationship: "partner" },
  { name: "Bright Studio", domain: "brightstudio.dk", industry: "Branding Agency", relationship: "client" },
  { name: "ProjektPartner", domain: "projektpartner.dk", industry: "Consulting", relationship: "client" },
  { name: "CodeAudit GmbH", domain: "codeaudit.de", industry: "Security Consulting", relationship: "vendor" },
  { name: "DesignKollektivet", domain: "designkollektivet.dk", industry: "Design Studio", relationship: "client" },
  { name: "DigitalDanmark A/S", domain: "digitaldanmark.dk", industry: "Digital Infrastructure", relationship: "partner" },
  { name: "AgencyStack", domain: "agencystack.io", industry: "SaaS", relationship: "vendor" },
  { name: "KreativLab", domain: "kreativlab.dk", industry: "Creative Agency", relationship: "client" },
  { name: "NorthStar Consulting", domain: "northstar-consulting.dk", industry: "Strategy Consulting", relationship: "client" },
  { name: "Reklamegruppen", domain: "reklamegruppen.dk", industry: "Advertising Agency", relationship: "client" },
];

// ── Contacts ────────────────────────────────────────────────────────────

export const TALLYO_CONTACTS: SyntheticContact[] = [
  // Kreativ Bureau — old champion (Lena) and new decision-maker (Tom)
  { name: "Lena Kristensen", email: "lena@kreativbureau.dk", company: "Kreativ Bureau ApS", title: "Digital Projektleder" },
  { name: "Tom Ager", email: "tom@kreativbureau.dk", company: "Kreativ Bureau ApS", title: "Creative Director" },

  { name: "Henrik Nord", email: "henrik@nordagentur.dk", company: "NordAgentur", title: "Managing Director" },
  { name: "Anders Bjørn", email: "anders@nordagentur.dk", company: "NordAgentur", title: "Account Manager" },

  { name: "Søren Hald", email: "soeren@mediahuset.dk", company: "MediaHuset A/S", title: "CTO" },
  { name: "Mette Friis", email: "mette@mediahuset.dk", company: "MediaHuset A/S", title: "Redaktionschef" },

  { name: "Jesper Flow", email: "jesper@flowagency.dk", company: "FlowAgency", title: "Grundlægger & Partner" },

  { name: "Karsten Ravn", email: "karsten@byteworks.dk", company: "ByteWorks ApS", title: "Lead Developer" },

  { name: "Victor Engel", email: "victor@scaleupventures.dk", company: "ScaleUp Ventures", title: "Partner" },
  { name: "Astrid Lykke", email: "astrid@scaleupventures.dk", company: "ScaleUp Ventures", title: "Associate" },

  { name: "Ida Bright", email: "ida@brightstudio.dk", company: "Bright Studio", title: "CEO" },

  { name: "Magnus Kvist", email: "magnus@projektpartner.dk", company: "ProjektPartner", title: "Managing Partner" },

  { name: "Klaus Weber", email: "klaus@codeaudit.de", company: "CodeAudit GmbH", title: "Lead Auditor" },

  { name: "Natasja Dahl", email: "natasja@designkollektivet.dk", company: "DesignKollektivet", title: "Kreativ Direktør" },

  { name: "Lars Bæk", email: "lars@digitaldanmark.dk", company: "DigitalDanmark A/S", title: "Partnership Manager" },

  { name: "Morten Krog", email: "morten@kreativlab.dk", company: "KreativLab", title: "Projektleder" },

  { name: "Birgitte Holm", email: "birgitte@northstar-consulting.dk", company: "NorthStar Consulting", title: "Partner" },

  { name: "Flemming Rask", email: "flemming@reklamegruppen.dk", company: "Reklamegruppen", title: "Administrerende direktør" },
];

// ── Deals ───────────────────────────────────────────────────────────────

export const TALLYO_DEALS: SyntheticDeal[] = [
  // Kreativ Bureau — renewal at risk
  { name: "Kreativ Bureau årsfornyelse", company: "Kreativ Bureau ApS", contact: "Tom Ager", stage: "negotiation", amount: 225000, currency: "DKK", createdDaysAgo: 30, lastActivityDaysAgo: 5 },

  // Peter.M's deals — 1 actually dead but still "active" in CRM
  { name: "ProjektPartner — Team tier", company: "ProjektPartner", contact: "Magnus Kvist", stage: "proposal", amount: 72000, createdDaysAgo: 45, lastActivityDaysAgo: 30 },
  { name: "NorthStar Consulting — Pro tier", company: "NorthStar Consulting", contact: "Birgitte Holm", stage: "qualification", amount: 54000, createdDaysAgo: 60, lastActivityDaysAgo: 22 },
  { name: "Reklamegruppen — Team tier", company: "Reklamegruppen", contact: "Flemming Rask", stage: "proposal", amount: 54000, createdDaysAgo: 35, lastActivityDaysAgo: 14 },

  // Anna's deals — healthy pipeline
  { name: "DesignKollektivet expansion", company: "DesignKollektivet", contact: "Natasja Dahl", stage: "negotiation", amount: 96000, createdDaysAgo: 20, lastActivityDaysAgo: 2 },
  { name: "KreativLab — Team tier", company: "KreativLab", contact: "Morten Krog", stage: "closed-won", amount: 72000, createdDaysAgo: 40, lastActivityDaysAgo: 10 },

  // FlowAgency — reseller deal
  { name: "FlowAgency reseller aftale", company: "FlowAgency", contact: "Jesper Flow", stage: "closed-won", amount: 180000, createdDaysAgo: 90, lastActivityDaysAgo: 15 },

  // Bright Studio — new onboarding
  { name: "Bright Studio — Starter tier", company: "Bright Studio", contact: "Ida Bright", stage: "closed-won", amount: 36000, createdDaysAgo: 14, lastActivityDaysAgo: 3 },

  // ScaleUp Ventures (not a deal per se, but tracked as pipeline)
  { name: "ScaleUp Ventures — Seed round", company: "ScaleUp Ventures", contact: "Victor Engel", stage: "qualification", amount: 3000000, currency: "DKK", createdDaysAgo: 21, lastActivityDaysAgo: 7 },
];

// ── Invoices ────────────────────────────────────────────────────────────

export const TALLYO_INVOICES: SyntheticInvoice[] = [
  { number: "TAL-2026-101", company: "Kreativ Bureau ApS", amount: 18750, status: "paid", issuedDaysAgo: 35 },
  { number: "TAL-2026-102", company: "NordAgentur", amount: 9375, status: "paid", issuedDaysAgo: 35 },
  { number: "TAL-2026-103", company: "MediaHuset A/S", amount: 15000, status: "paid", issuedDaysAgo: 35 },
  { number: "TAL-2026-104", company: "FlowAgency", amount: 12500, status: "paid", issuedDaysAgo: 35 },
  { number: "TAL-2026-105", company: "ByteWorks ApS", amount: 4800, status: "overdue", issuedDaysAgo: 38, daysOverdue: 8 },
  { number: "TAL-2026-106", company: "Bright Studio", amount: 3000, status: "sent", issuedDaysAgo: 7 },
  { number: "TAL-2026-107", company: "DesignKollektivet", amount: 8000, status: "paid", issuedDaysAgo: 35 },
  { number: "TAL-2026-108", company: "KreativLab", amount: 6000, status: "paid", issuedDaysAgo: 28 },
  { number: "TAL-2026-109", company: "ByteWorks ApS", amount: 4800, status: "overdue", issuedDaysAgo: 68, daysOverdue: 38 },
  { number: "TAL-2026-110", company: "Kreativ Bureau ApS", amount: 18750, status: "sent", issuedDaysAgo: 5 },
  { number: "TAL-2026-111", company: "FlowAgency", amount: 15000, status: "sent", issuedDaysAgo: 5 },
  { number: "TAL-2026-112", company: "Reklamegruppen", amount: 6000, status: "paid", issuedDaysAgo: 35 },
];

// ── Slack Channels ──────────────────────────────────────────────────────

export const TALLYO_SLACK_CHANNELS: SyntheticSlackChannel[] = [
  { channelId: "C100GEN", channelName: "#general" },
  { channelId: "C100RND", channelName: "#random" },
  { channelId: "C100ENG", channelName: "#engineering" },
  { channelId: "C100SAL", channelName: "#sales" },
  { channelId: "C100CSM", channelName: "#customer-success" },
  { channelId: "C100MKT", channelName: "#marketing" },
  { channelId: "C100ALP", channelName: "#product-alpha" },
  { channelId: "C100BUG", channelName: "#bugs" },
  { channelId: "C100WIN", channelName: "#wins" },
];

// ── Generator Profile ───────────────────────────────────────────────────

export const TALLYO_PROFILE: CompanyProfile = {
  domain: "tallyo.dk",
  name: "Tallyo ApS",
  locale: "da",
  connectorProviders: ["gmail", "google-calendar", "google-drive", "slack", "hubspot"],
  employees: [
    // Leadership
    { email: "mads@tallyo.dk", name: "Mads Kjeldsen", role: "ceo", connectorProviders: ["gmail", "google-calendar", "google-drive", "slack"] },
    { email: "louise@tallyo.dk", name: "Louise Dahl", role: "manager", connectorProviders: ["gmail", "google-calendar", "google-drive", "slack"] },
    { email: "nikolaj@tallyo.dk", name: "Nikolaj Brandt", role: "manager", connectorProviders: ["gmail", "google-calendar", "slack", "hubspot"] },

    // Engineering
    { email: "simon@tallyo.dk", name: "Simon Hviid", role: "manager", connectorProviders: ["gmail", "google-calendar", "slack"] },
    { email: "camilla@tallyo.dk", name: "Camilla Rask", role: "engineer", connectorProviders: ["gmail", "slack"] },
    { email: "jakob@tallyo.dk", name: "Jakob Winther", role: "junior", connectorProviders: ["gmail", "slack"] },
    { email: "maja@tallyo.dk", name: "Maja Vestergaard", role: "engineer", connectorProviders: ["gmail", "slack"] },
    { email: "rasmus@tallyo.dk", name: "Rasmus Lind", role: "engineer", connectorProviders: ["gmail", "slack"] },
    { email: "oliver@tallyo.dk", name: "Oliver Krogh", role: "engineer", connectorProviders: ["gmail", "slack"] },
    { email: "katrine@tallyo.dk", name: "Katrine Bech", role: "engineer", connectorProviders: ["gmail", "slack"] },
    { email: "steen@tallyo.dk", name: "Steen Gram", role: "engineer", connectorProviders: ["slack"] },

    // Sales
    { email: "anna@tallyo.dk", name: "Anna Friis", role: "sales", connectorProviders: ["gmail", "google-calendar", "hubspot"] },
    { email: "peter.m@tallyo.dk", name: "Peter Mortensen", role: "sales", connectorProviders: ["gmail", "google-calendar", "hubspot"] },
    { email: "fie@tallyo.dk", name: "Fie Andersen", role: "sales", connectorProviders: ["gmail", "hubspot"] },
    { email: "christian@tallyo.dk", name: "Christian Lund", role: "sales", connectorProviders: ["gmail", "hubspot"] },
    { email: "julie@tallyo.dk", name: "Julie Hauge", role: "sales", connectorProviders: ["gmail", "hubspot"] },

    // Customer Success
    { email: "mathilde@tallyo.dk", name: "Mathilde Holm", role: "sales", connectorProviders: ["gmail", "google-calendar", "hubspot", "slack"] },
    { email: "emil.g@tallyo.dk", name: "Emil Grønbech", role: "admin", connectorProviders: ["gmail", "slack"] },
    { email: "sara.j@tallyo.dk", name: "Sara Juhl", role: "admin", connectorProviders: ["gmail", "slack"] },
    { email: "nanna@tallyo.dk", name: "Nanna Kirk", role: "admin", connectorProviders: ["gmail", "slack"] },

    // Marketing
    { email: "freja@tallyo.dk", name: "Freja Storm", role: "manager", connectorProviders: ["gmail", "google-drive", "slack"] },
    { email: "mikkel.a@tallyo.dk", name: "Mikkel Aagaard", role: "engineer", connectorProviders: ["gmail", "slack"] },
    { email: "sofie.t@tallyo.dk", name: "Sofie Thy", role: "admin", connectorProviders: ["gmail", "slack"] },

    // Operations
    { email: "maria@tallyo.dk", name: "Maria Bak", role: "admin", connectorProviders: ["gmail", "google-drive"] },
    { email: "pernille@tallyo.dk", name: "Pernille Krogh", role: "admin", connectorProviders: ["gmail", "google-calendar"] },
  ] satisfies EmployeeProfile[],
  externalContacts: [
    { name: "Lena Kristensen", email: "lena@kreativbureau.dk", company: "Kreativ Bureau ApS" },
    { name: "Tom Ager", email: "tom@kreativbureau.dk", company: "Kreativ Bureau ApS" },
    { name: "Henrik Nord", email: "henrik@nordagentur.dk", company: "NordAgentur" },
    { name: "Anders Bjørn", email: "anders@nordagentur.dk", company: "NordAgentur" },
    { name: "Søren Hald", email: "soeren@mediahuset.dk", company: "MediaHuset A/S" },
    { name: "Jesper Flow", email: "jesper@flowagency.dk", company: "FlowAgency" },
    { name: "Karsten Ravn", email: "karsten@byteworks.dk", company: "ByteWorks ApS" },
    { name: "Victor Engel", email: "victor@scaleupventures.dk", company: "ScaleUp Ventures" },
    { name: "Astrid Lykke", email: "astrid@scaleupventures.dk", company: "ScaleUp Ventures" },
    { name: "Ida Bright", email: "ida@brightstudio.dk", company: "Bright Studio" },
    { name: "Magnus Kvist", email: "magnus@projektpartner.dk", company: "ProjektPartner" },
    { name: "Klaus Weber", email: "klaus@codeaudit.de", company: "CodeAudit GmbH" },
    { name: "Natasja Dahl", email: "natasja@designkollektivet.dk", company: "DesignKollektivet" },
    { name: "Morten Krog", email: "morten@kreativlab.dk", company: "KreativLab" },
    { name: "Birgitte Holm", email: "birgitte@northstar-consulting.dk", company: "NorthStar Consulting" },
    { name: "Flemming Rask", email: "flemming@reklamegruppen.dk", company: "Reklamegruppen" },
  ],
};

export const TALLYO_CLUTTER_CONFIG: ClutterConfig = {
  systemNotifications: 50,
  autoReplies: 15,
  marketingNewsletters: 10,
  transactional: 15,
  calendarAuto: 30,
  internalChatter: 40,
};
