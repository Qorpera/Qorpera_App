// ── Meridian Teknik A/S — Company Profile & Static Data ─────────────────
// 35-person industrial components manufacturer and distributor.
// Microsoft 365 stack, bilingual (DA/EN/DE), heavy e-conomic usage.

import type { SyntheticEmployee, SyntheticConnector, SyntheticExternalCompany, SyntheticContact, SyntheticDeal, SyntheticInvoice, SyntheticSlackChannel } from "../../synthetic-types";
import type { CompanyProfile, ClutterConfig, EmployeeProfile } from "../generator/types";

// ── Employees (35) ──────────────────────────────────────────────────────

export const MERIDIAN_EMPLOYEES: SyntheticEmployee[] = [
  // Leadership (4)
  { name: "Jørgen Lund", email: "jorgen@meridian-teknik.dk", role: "admin", locale: "da" },
  { name: "Birgitte Holm", email: "birgitte@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Torben Krogh", email: "torben@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Morten Bak", email: "morten@meridian-teknik.dk", role: "member", locale: "da" },

  // Sales (7 incl. Claus the freelance agent)
  { name: "Christian Dam", email: "christian@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Katja Nissen", email: "katja@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "René Vestergaard", email: "rene@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Ditte Laursen", email: "ditte@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Mikael Frost", email: "mikael@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Andreas Pihl", email: "andreas@meridian-teknik.dk", role: "member", locale: "da" },
  // Claus is independent agent/broker — has internal email but invoices monthly on commission
  { name: "Claus Lundberg", email: "claus@meridian-teknik.dk", role: "member", locale: "da" },

  // Production (10 — 3 named leads + 7 generic workers)
  { name: "Hanne Friis", email: "hanne@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Niels Thøgersen", email: "niels@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Per Jørgensen", email: "per@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Lars Henriksen", email: "lars.h@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Thomas Andersen", email: "thomas.a@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Erik Madsen", email: "erik.m@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Brian Sørensen", email: "brian@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Dennis Olsen", email: "dennis@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Kenneth Poulsen", email: "kenneth@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Jesper Møller", email: "jesper.m@meridian-teknik.dk", role: "member", locale: "da" },

  // Quality (3)
  { name: "Lone Dahl", email: "lone@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Martin Degn", email: "martin.d@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Søren Villadsen", email: "soeren.v@meridian-teknik.dk", role: "member", locale: "da" },

  // Logistics (4)
  { name: "Kim Larsen", email: "kim@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Thomas Jensen", email: "thomas.j@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Bo Nielsen", email: "bo@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Susanne Berg", email: "susanne@meridian-teknik.dk", role: "member", locale: "da" },

  // Admin/Finance (4)
  { name: "Tina Gram", email: "tina@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Anne-Marie Olsen", email: "annemarie@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Palle Svendsen", email: "palle@meridian-teknik.dk", role: "member", locale: "da" },

  { name: "Pia Damgaard", email: "pia@meridian-teknik.dk", role: "member", locale: "da" },

  // Engineering (3)
  { name: "Henrik Bjerregaard", email: "henrik.b@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Lasse Winther", email: "lasse@meridian-teknik.dk", role: "member", locale: "da" },
  { name: "Julie Rask", email: "julie@meridian-teknik.dk", role: "member", locale: "da" },
];

// ── Connectors ──────────────────────────────────────────────────────────

export const MERIDIAN_CONNECTORS: SyntheticConnector[] = [
  { provider: "microsoft-365-outlook", name: "Outlook (company-wide)" },
  { provider: "microsoft-365-onedrive", name: "OneDrive (company-wide)" },
  { provider: "microsoft-365-teams", name: "Teams (company-wide)" },
  { provider: "microsoft-365-calendar", name: "Outlook Calendar (company-wide)" },
  { provider: "e-conomic", name: "e-conomic" },
  { provider: "hubspot", name: "HubSpot CRM" },
];

// ── External Companies ──────────────────────────────────────────────────

export const MERIDIAN_COMPANIES: SyntheticExternalCompany[] = [
  // Bidirectional: both vendor AND client
  { name: "StålGruppen A/S", domain: "staalgruppen.dk", industry: "Steel Distribution", relationship: "partner" },

  // Major Danish industrial clients
  { name: "Danfoss A/S", domain: "danfoss.com", industry: "Industrial Components", relationship: "client" },
  { name: "Grundfos A/S", domain: "grundfos.com", industry: "Pump Manufacturing", relationship: "client" },
  { name: "Vestas Wind Systems A/S", domain: "vestas.com", industry: "Wind Energy", relationship: "client" },
  { name: "Novozymes A/S", domain: "novozymes.com", industry: "Biotechnology", relationship: "client" },
  { name: "FLSmidth A/S", domain: "flsmidth.com", industry: "Mining & Cement Equipment", relationship: "client" },

  // International
  { name: "Müller Maschinenbau GmbH", domain: "mueller-maschinenbau.de", industry: "Machine Building", relationship: "client" },
  { name: "Precision Components Ltd", domain: "precisioncomponents.co.uk", industry: "Precision Engineering", relationship: "client" },
  { name: "Nordic Tech Solutions AB", domain: "nordictechsolutions.se", industry: "Industrial Automation", relationship: "client" },

  // Vendors
  { name: "KUKA Robotics", domain: "kuka.com", industry: "Industrial Robotics", relationship: "vendor" },
  { name: "Sandvik Coromant", domain: "sandvik.coromant.com", industry: "Cutting Tools", relationship: "vendor" },
  { name: "DSV A/S", domain: "dsv.com", industry: "Freight & Logistics", relationship: "vendor" },
  { name: "Siemens AG", domain: "siemens.com", industry: "Industrial Automation", relationship: "vendor" },

  // Smaller clients
  { name: "Dansk Ventilation A/S", domain: "danskventilation.dk", industry: "HVAC Manufacturing", relationship: "client" },
  { name: "NorthPower Engineering", domain: "northpower.dk", industry: "Power Generation", relationship: "client" },
  { name: "Maritime Components ApS", domain: "maritimecomponents.dk", industry: "Marine Equipment", relationship: "client" },

  // Partners
  { name: "Bureau Veritas", domain: "bureauveritas.dk", industry: "Certification & Compliance", relationship: "partner" },
  { name: "Teknologisk Institut", domain: "teknologisk.dk", industry: "Research & Testing", relationship: "partner" },

  // Prospects
  { name: "Alfa Laval AB", domain: "alfalaval.com", industry: "Heat Transfer", relationship: "client" },
  { name: "Haldor Topsoe A/S", domain: "topsoe.com", industry: "Chemical Processing", relationship: "client" },
];

// ── Contacts ────────────────────────────────────────────────────────────

export const MERIDIAN_CONTACTS: SyntheticContact[] = [
  // StålGruppen — single contact for both sides
  { name: "Flemming Stål", email: "flemming@staalgruppen.dk", company: "StålGruppen A/S", title: "Indkøbs- og salgschef" },

  // Danfoss
  { name: "Charlotte Riis", email: "charlotte.riis@danfoss.com", company: "Danfoss A/S", title: "Strategic Procurement Manager" },
  { name: "Jens Overgaard", email: "jens.overgaard@danfoss.com", company: "Danfoss A/S", title: "Quality Engineer" },

  // Grundfos
  { name: "Peter Skou", email: "peter.skou@grundfos.com", company: "Grundfos A/S", title: "Component Buyer" },

  // Vestas
  { name: "Mette Abildgaard", email: "mette.abildgaard@vestas.com", company: "Vestas Wind Systems A/S", title: "Supply Chain Manager" },
  { name: "Lars Bonde", email: "lars.bonde@vestas.com", company: "Vestas Wind Systems A/S", title: "Procurement Director" },

  // FLSmidth
  { name: "Henrik Juul", email: "henrik.juul@flsmidth.com", company: "FLSmidth A/S", title: "Project Buyer" },

  // Müller — OLD contact (left) and NEW (cold, formal)
  { name: "Hans Weber", email: "h.weber@mueller-maschinenbau.de", company: "Müller Maschinenbau GmbH", title: "Einkaufsleiter" },
  { name: "Dr. Markus Schneider", email: "m.schneider@mueller-maschinenbau.de", company: "Müller Maschinenbau GmbH", title: "Leiter Beschaffung" },

  // Precision Components — CRM has old name "James Wilson" but email says "James Wilson-Park"
  { name: "James Wilson-Park", email: "james.wilson-park@precisioncomponents.co.uk", company: "Precision Components Ltd", title: "Purchasing Director" },

  // Nordic Tech Solutions (via Claus)
  { name: "Erik Lindqvist", email: "erik.lindqvist@nordictechsolutions.se", company: "Nordic Tech Solutions AB", title: "Inköpschef" },

  // Vendors
  { name: "Markus Lang", email: "markus.lang@kuka.com", company: "KUKA Robotics", title: "Account Manager Nordics" },
  { name: "Anna Sandström", email: "anna.sandstrom@sandvik.coromant.com", company: "Sandvik Coromant", title: "Sales Engineer" },
  { name: "Nikolaj Brix", email: "nikolaj.brix@dsv.com", company: "DSV A/S", title: "Key Account Manager" },

  // Smaller clients
  { name: "Carsten Warming", email: "carsten@danskventilation.dk", company: "Dansk Ventilation A/S", title: "Produktionschef" },
  { name: "Anette Friis", email: "anette@northpower.dk", company: "NorthPower Engineering", title: "Indkøber" },

  // Partners
  { name: "Philippe Moreau", email: "philippe.moreau@bureauveritas.com", company: "Bureau Veritas", title: "Lead Auditor" },

  // Novozymes
  { name: "Søren Dall", email: "soeren.dall@novozymes.com", company: "Novozymes A/S", title: "Technical Procurement" },

  // Prospects
  { name: "Gustav Nilsson", email: "gustav.nilsson@alfalaval.com", company: "Alfa Laval AB", title: "Supplier Development Manager" },
];

// ── Deals ───────────────────────────────────────────────────────────────

export const MERIDIAN_DEALS: SyntheticDeal[] = [
  { name: "Danfoss rammeaftale fornyelse 2026", company: "Danfoss A/S", contact: "Charlotte Riis", stage: "negotiation", amount: 6300000, createdDaysAgo: 60, lastActivityDaysAgo: 3 },
  { name: "Vestas framework opportunity", company: "Vestas Wind Systems A/S", contact: "Mette Abildgaard", stage: "qualification", amount: 8000000, createdDaysAgo: 14, lastActivityDaysAgo: 5 },
  { name: "FLSmidth projektordre Q2", company: "FLSmidth A/S", contact: "Henrik Juul", stage: "proposal", amount: 1200000, createdDaysAgo: 30, lastActivityDaysAgo: 8 },
  { name: "Grundfos pumpekomponenter", company: "Grundfos A/S", contact: "Peter Skou", stage: "closed-won", amount: 850000, createdDaysAgo: 45, lastActivityDaysAgo: 12 },
  { name: "Novozymes reaktordele", company: "Novozymes A/S", contact: "Søren Dall", stage: "closed-won", amount: 420000, createdDaysAgo: 90, lastActivityDaysAgo: 15 },
  { name: "Nordic Tech Solutions — Claus", company: "Nordic Tech Solutions AB", contact: "Erik Lindqvist", stage: "proposal", amount: 380000, createdDaysAgo: 25, lastActivityDaysAgo: 7 },
  { name: "Alfa Laval — Hannover lead", company: "Alfa Laval AB", contact: "Gustav Nilsson", stage: "qualification", amount: 500000, createdDaysAgo: 21, lastActivityDaysAgo: 21 },
  { name: "Precision Components quarterly", company: "Precision Components Ltd", contact: "James Wilson-Park", stage: "closed-won", amount: 290000, createdDaysAgo: 35, lastActivityDaysAgo: 10 },
  { name: "Dansk Ventilation serviceaftale", company: "Dansk Ventilation A/S", contact: "Carsten Warming", stage: "closed-won", amount: 180000, createdDaysAgo: 120, lastActivityDaysAgo: 20 },
];

// ── Invoices ────────────────────────────────────────────────────────────

export const MERIDIAN_INVOICES: SyntheticInvoice[] = [
  // Receivables — clients owe Meridian
  { number: "MT-2026-0401", company: "Danfoss A/S", amount: 525000, status: "paid", issuedDaysAgo: 35 },
  { number: "MT-2026-0402", company: "Danfoss A/S", amount: 480000, status: "sent", issuedDaysAgo: 10 },
  { number: "MT-2026-0403", company: "FLSmidth A/S", amount: 310000, status: "overdue", issuedDaysAgo: 55, daysOverdue: 25 },
  { number: "MT-2026-0404", company: "StålGruppen A/S", amount: 145000, status: "overdue", issuedDaysAgo: 42, daysOverdue: 12 },
  { number: "MT-2026-0405", company: "Grundfos A/S", amount: 212000, status: "paid", issuedDaysAgo: 28 },
  { number: "MT-2026-0406", company: "Precision Components Ltd", amount: 145000, status: "sent", issuedDaysAgo: 14 },
  { number: "MT-2026-0407", company: "Novozymes A/S", amount: 210000, status: "overdue", issuedDaysAgo: 48, daysOverdue: 18 },
  { number: "MT-2026-0408", company: "Dansk Ventilation A/S", amount: 45000, status: "paid", issuedDaysAgo: 30 },
  { number: "MT-2026-0409", company: "Nordic Tech Solutions AB", amount: 95000, status: "sent", issuedDaysAgo: 7 },
  { number: "MT-2026-0410", company: "NorthPower Engineering", amount: 78000, status: "overdue", issuedDaysAgo: 40, daysOverdue: 10 },

  // Payables — Meridian owes vendors (tracked as draft/sent from vendor perspective)
  { number: "SG-2026-0112", company: "StålGruppen A/S", amount: 89000, status: "overdue", issuedDaysAgo: 38, daysOverdue: 8 },
  { number: "DSV-2026-3847", company: "DSV A/S", amount: 67000, status: "sent", issuedDaysAgo: 12 },
  { number: "KUKA-2026-NOR-089", company: "KUKA Robotics", amount: 340000, status: "sent", issuedDaysAgo: 20 },
];

// ── Slack/Teams Channels ────────────────────────────────────────────────

export const MERIDIAN_SLACK_CHANNELS: SyntheticSlackChannel[] = [
  { channelId: "T200GEN", channelName: "#general" },
  { channelId: "T200SAL", channelName: "#salg" },
  { channelId: "T200PRD", channelName: "#produktion" },
  { channelId: "T200KVA", channelName: "#kvalitet" },
  { channelId: "T200LOG", channelName: "#logistik" },
  { channelId: "T200LED", channelName: "#ledelse" },
  { channelId: "T200ITS", channelName: "#it-support" },
  { channelId: "T200KAN", channelName: "#kantine" },
];

// ── Generator Profile ───────────────────────────────────────────────────

export const MERIDIAN_PROFILE: CompanyProfile = {
  domain: "meridian-teknik.dk",
  name: "Meridian Teknik A/S",
  locale: "da",
  connectorProviders: ["microsoft-365-outlook", "microsoft-365-onedrive", "microsoft-365-teams", "microsoft-365-calendar", "e-conomic", "hubspot"],
  employees: [
    // Leadership
    { email: "jorgen@meridian-teknik.dk", name: "Jørgen Lund", role: "ceo", connectorProviders: ["microsoft-365-outlook", "microsoft-365-calendar", "microsoft-365-onedrive"] },
    { email: "birgitte@meridian-teknik.dk", name: "Birgitte Holm", role: "manager", connectorProviders: ["microsoft-365-outlook", "microsoft-365-calendar", "e-conomic"] },
    { email: "torben@meridian-teknik.dk", name: "Torben Krogh", role: "manager", connectorProviders: ["microsoft-365-outlook", "microsoft-365-calendar", "hubspot"] },
    { email: "morten@meridian-teknik.dk", name: "Morten Bak", role: "manager", connectorProviders: ["microsoft-365-outlook", "microsoft-365-calendar"] },

    // Sales
    { email: "christian@meridian-teknik.dk", name: "Christian Dam", role: "sales", connectorProviders: ["microsoft-365-outlook", "hubspot"] },
    { email: "katja@meridian-teknik.dk", name: "Katja Nissen", role: "sales", connectorProviders: ["microsoft-365-outlook", "hubspot"] },
    { email: "rene@meridian-teknik.dk", name: "René Vestergaard", role: "sales", connectorProviders: ["microsoft-365-outlook", "hubspot"] },
    { email: "ditte@meridian-teknik.dk", name: "Ditte Laursen", role: "sales", connectorProviders: ["microsoft-365-outlook", "hubspot"] },
    { email: "mikael@meridian-teknik.dk", name: "Mikael Frost", role: "sales", connectorProviders: ["microsoft-365-outlook", "hubspot"] },
    { email: "andreas@meridian-teknik.dk", name: "Andreas Pihl", role: "sales", connectorProviders: ["microsoft-365-outlook", "hubspot"] },
    { email: "claus@meridian-teknik.dk", name: "Claus Lundberg", role: "sales", connectorProviders: ["microsoft-365-teams"] },

    // Production (leads)
    { email: "hanne@meridian-teknik.dk", name: "Hanne Friis", role: "admin", connectorProviders: ["microsoft-365-outlook"] },
    { email: "niels@meridian-teknik.dk", name: "Niels Thøgersen", role: "field_worker", connectorProviders: ["microsoft-365-outlook"] },
    { email: "per@meridian-teknik.dk", name: "Per Jørgensen", role: "field_worker", connectorProviders: ["microsoft-365-outlook"] },

    // Production workers (minimal digital footprint)
    { email: "lars.h@meridian-teknik.dk", name: "Lars Henriksen", role: "field_worker", connectorProviders: [] },
    { email: "thomas.a@meridian-teknik.dk", name: "Thomas Andersen", role: "field_worker", connectorProviders: [] },
    { email: "erik.m@meridian-teknik.dk", name: "Erik Madsen", role: "field_worker", connectorProviders: [] },
    { email: "brian@meridian-teknik.dk", name: "Brian Sørensen", role: "field_worker", connectorProviders: [] },
    { email: "dennis@meridian-teknik.dk", name: "Dennis Olsen", role: "field_worker", connectorProviders: [] },
    { email: "kenneth@meridian-teknik.dk", name: "Kenneth Poulsen", role: "field_worker", connectorProviders: [] },
    { email: "jesper.m@meridian-teknik.dk", name: "Jesper Møller", role: "field_worker", connectorProviders: [] },

    // Quality
    { email: "lone@meridian-teknik.dk", name: "Lone Dahl", role: "manager", connectorProviders: ["microsoft-365-outlook", "microsoft-365-onedrive"] },
    { email: "martin.d@meridian-teknik.dk", name: "Martin Degn", role: "field_worker", connectorProviders: ["microsoft-365-outlook"] },
    { email: "soeren.v@meridian-teknik.dk", name: "Søren Villadsen", role: "field_worker", connectorProviders: ["microsoft-365-outlook"] },

    // Logistics
    { email: "kim@meridian-teknik.dk", name: "Kim Larsen", role: "admin", connectorProviders: ["microsoft-365-outlook", "microsoft-365-calendar"] },
    { email: "thomas.j@meridian-teknik.dk", name: "Thomas Jensen", role: "field_worker", connectorProviders: ["microsoft-365-outlook"] },
    { email: "bo@meridian-teknik.dk", name: "Bo Nielsen", role: "field_worker", connectorProviders: ["microsoft-365-outlook"] },
    { email: "susanne@meridian-teknik.dk", name: "Susanne Berg", role: "admin", connectorProviders: ["microsoft-365-outlook"] },

    // Admin/Finance
    { email: "tina@meridian-teknik.dk", name: "Tina Gram", role: "admin", connectorProviders: ["microsoft-365-outlook", "e-conomic"] },
    { email: "annemarie@meridian-teknik.dk", name: "Anne-Marie Olsen", role: "admin", connectorProviders: ["microsoft-365-outlook"] },
    { email: "palle@meridian-teknik.dk", name: "Palle Svendsen", role: "engineer", connectorProviders: ["microsoft-365-outlook"] },
    { email: "pia@meridian-teknik.dk", name: "Pia Damgaard", role: "admin", connectorProviders: ["microsoft-365-outlook"] },

    // Engineering
    { email: "henrik.b@meridian-teknik.dk", name: "Henrik Bjerregaard", role: "engineer", connectorProviders: ["microsoft-365-outlook", "microsoft-365-onedrive"] },
    { email: "lasse@meridian-teknik.dk", name: "Lasse Winther", role: "junior", connectorProviders: ["microsoft-365-outlook"] },
    { email: "julie@meridian-teknik.dk", name: "Julie Rask", role: "junior", connectorProviders: ["microsoft-365-outlook", "microsoft-365-onedrive"] },
  ] satisfies EmployeeProfile[],
  externalContacts: [
    { name: "Flemming Stål", email: "flemming@staalgruppen.dk", company: "StålGruppen A/S" },
    { name: "Charlotte Riis", email: "charlotte.riis@danfoss.com", company: "Danfoss A/S" },
    { name: "Peter Skou", email: "peter.skou@grundfos.com", company: "Grundfos A/S" },
    { name: "Mette Abildgaard", email: "mette.abildgaard@vestas.com", company: "Vestas Wind Systems A/S" },
    { name: "Henrik Juul", email: "henrik.juul@flsmidth.com", company: "FLSmidth A/S" },
    { name: "Dr. Markus Schneider", email: "m.schneider@mueller-maschinenbau.de", company: "Müller Maschinenbau GmbH" },
    { name: "James Wilson-Park", email: "james.wilson-park@precisioncomponents.co.uk", company: "Precision Components Ltd" },
    { name: "Erik Lindqvist", email: "erik.lindqvist@nordictechsolutions.se", company: "Nordic Tech Solutions AB" },
    { name: "Nikolaj Brix", email: "nikolaj.brix@dsv.com", company: "DSV A/S" },
    { name: "Carsten Warming", email: "carsten@danskventilation.dk", company: "Dansk Ventilation A/S" },
    { name: "Gustav Nilsson", email: "gustav.nilsson@alfalaval.com", company: "Alfa Laval AB" },
    { name: "Philippe Moreau", email: "philippe.moreau@bureauveritas.com", company: "Bureau Veritas" },
  ],
};

export const MERIDIAN_CLUTTER_CONFIG: ClutterConfig = {
  systemNotifications: 40,
  autoReplies: 20,
  marketingNewsletters: 15,
  transactional: 35,
  calendarAuto: 25,
  internalChatter: 20,
};
