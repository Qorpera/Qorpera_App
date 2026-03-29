// ── Tallyo ApS — Contradiction Content ──────────────────────────────────
// ~15 items that deliberately contradict other story items or reality.
// Each has a comment explaining the contradiction for test verification.

import type { SyntheticContent } from "../../synthetic-types";

function daysAgoDate(d: number): string {
  return new Date(Date.now() - d * 86400000).toISOString();
}

export const TALLYO_CONTRADICTIONS: SyntheticContent[] = [
  // ── C1: HubSpot shows NordAgentur as "Active" despite going cold ──
  // CONTRADICTS: Thread 2 — NordAgentur has no logins in 3 weeks, 2/15 seats active
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 5, content: "HubSpot Weekly Account Summary: NordAgentur — Status: Active. Plan: Team (15 seats). Health Score: Green. Last renewal: december 2025. Next renewal: juni 2026. Notes: 'Stabil kunde, ingen åbne issues.' Account owner: Emil Grønbech.", metadata: { from: "noreply@hubspot.com", to: "nikolaj@tallyo.dk", subject: "HubSpot: Weekly Account Health Summary", date: daysAgoDate(5) } },

  // ── C2: CRM contact list still shows Lena as Kreativ Bureau contact ──
  // CONTRADICTS: Thread 1 — Lena left 2 months ago, Tom Ager is the new contact
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 15, content: "Tallyo — Key Account Contact List (Q1 2026). Kreativ Bureau ApS: Primary contact: Lena Kristensen, Digital Projektleder, lena@kreativbureau.dk. 50 seats, Team plan. Renewal: maj 2026. Account owner: Anna Friis. NordAgentur: Primary contact: Henrik Nord, Managing Director. 15 seats. MediaHuset A/S: Primary contact: Mette Friis, Redaktionschef. 30 seats.", metadata: { fileName: "Key_Account_Contacts_Q1_2026.xlsx", author: "Fie Andersen", lastModified: daysAgoDate(15) } },

  // ── C3: Company handbook says Engineering reports to CTO ──
  // CONTRADICTS: Calendar shows Simon's 1:1 is with Mads (CEO), not Louise (CTO)
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 60, content: "Tallyo ApS — Medarbejderhåndbog 2026. Organisationsstruktur: CEO: Mads Kjeldsen. CTO: Louise Dahl — ansvarlig for Engineering og Product. VP Sales: Nikolaj Brandt — ansvarlig for Sales og Customer Success. Engineering Lead: Simon Hviid (rapporterer til CTO). Marketing Lead: Freja Storm (rapporterer til CEO). Operations: Maria Bak (rapporterer til CEO). HR: Pernille Krogh (rapporterer til CEO). Alle ingeniører rapporterer til Engineering Lead som rapporterer til CTO.", metadata: { fileName: "Tallyo_Medarbejderhaandbog_2026.pdf", author: "Pernille Krogh", lastModified: daysAgoDate(60) } },

  // ── C4: Mathilde's role description says "Customer Success Lead" ──
  // CONTRADICTS: Activity shows 60% sales outreach — her actual behavior is sales, not CS
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 45, content: "Stillingsbeskrivelse — Mathilde Holm. Titel: Customer Success Lead. Afdeling: Customer Success. Rapporterer til: Nikolaj Brandt, VP Sales. Ansvarsområder: Lede CS-teamet (Emil, Sara, Nanna). Sikre høj kundetilfredshed og NPS. Reducere churn. Onboarde nye kunder. Udforme QBRs for key accounts. KPI'er: NPS > 50, Churn < 5%, Onboarding completion > 90%.", metadata: { fileName: "Stillingsbeskrivelse_Mathilde_Holm.docx", author: "Pernille Krogh", lastModified: daysAgoDate(45) } },

  // ── C5: Employee directory lists Steen as full-time employee ──
  // CONTRADICTS: Steen is a freelance contractor — invoices monthly, no 1:1s, no HR record
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 30, content: "Tallyo ApS — Medarbejderoversigt (marts 2026). Engineering: Simon Hviid (Lead), Camilla Rask (Senior), Rasmus Lind (Backend), Oliver Krogh (Backend), Katrine Bech (Frontend), Jakob Winther (Junior), Maja Vestergaard (QA), Steen Gram (DevOps). I alt engineering: 8 fuldtidsansatte. Total medarbejdertal: 25.", metadata: { fileName: "Medarbejderoversigt_marts2026.xlsx", author: "Pernille Krogh", lastModified: daysAgoDate(30) } },

  // ── C6: Q1 revenue report shows 1.2M ARR ──
  // CONTRADICTS: HubSpot dashboard shows 1.35M — difference is FlowAgency reseller timing
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 10, content: "Q1 2026 Revenue Report — Tallyo ApS. Annual Recurring Revenue (ARR): 1.200.000 DKK. Monthly Recurring Revenue (MRR): 100.000 DKK. Kunde antal: 42. Net Revenue Retention: 112%. Gross churn: 3,8%. Ny ARR i Q1: 108.000 DKK. BEMÆRK: FlowAgency reseller-revenue (estimeret 150K) er ikke inkluderet — afventer kontraktfinalisering.", metadata: { fileName: "Q1_2026_Revenue_Report.xlsx", author: "Maria Bak", lastModified: daysAgoDate(10) } },

  // ── C7: Process doc says "All PRs reviewed within 24h" ──
  // CONTRADICTS: Thread 5 — 14 PRs pending, oldest is 8 days
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 90, content: "Tallyo Engineering Processes. Code Review Policy: Alle pull requests skal reviewes inden for 24 timer. Reviewer skal godkende eller give feedback samme dag. QA skal teste og godkende inden deploy. Deploy-cyklus: Daglig deployment via CI/CD pipeline. Hotfix-procedure: Kritiske bugs deployes inden for 4 timer. Testning: Alle PRs kræver grøn CI-build og QA-godkendelse.", metadata: { fileName: "Engineering_Processes.docx", author: "Simon Hviid", lastModified: daysAgoDate(90) } },

  // ── C8: Peter's HubSpot deals show 3 active worth 180K ──
  // CONTRADICTS: NorthStar politely declined (Thread 9) but deal is still "active"
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "HubSpot Pipeline Report — Peter Mortensen. Aktive deals: 1) ProjektPartner Team tier: 72.000 DKK (Proposal). 2) NorthStar Consulting Pro tier: 54.000 DKK (Qualification). 3) Reklamegruppen Team tier: 54.000 DKK (Proposal). Total pipeline: 180.000 DKK. Weighted value: 54.000 DKK.", metadata: { from: "noreply@hubspot.com", to: "nikolaj@tallyo.dk", subject: "HubSpot: Weekly Pipeline — Peter Mortensen", date: daysAgoDate(3) } },

  // ── C9: Simon's 1:1 is with Mads (CEO), not Louise (CTO) ──
  // CONTRADICTS: C3 org chart says Engineering reports to CTO
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 3, content: "Mads + Simon 1:1. Gennemgang af engineering priorities. MediaHuset hotfix er top priority. QA hiring — Mads vil have Marias budget-input først. Diskussion om tech debt sprint i Q2. Simon: Vi skal dedikere 20% af sprint-kapaciteten til tech debt.", metadata: { title: "Mads + Simon 1:1", attendees: ["mads@tallyo.dk", "simon@tallyo.dk"], date: daysAgoDate(3) } },

  // ── C10: Old team page says 20 employees ──
  // CONTRADICTS: Current headcount is 25
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 80, content: "Tallyo.dk — About Us page copy (DRAFT). Tallyo er et dansk SaaS-selskab med 20 dedikerede medarbejdere. Vi brænder for at hjælpe kreative bureauer med at strukturere deres projekter. Vores team består af erfarne udviklere, sælgere og customer success-specialister.", metadata: { fileName: "Website_About_Copy_DRAFT.docx", author: "Freja Storm", lastModified: daysAgoDate(80) } },

  // ── C11: Onboarding doc lists wrong VP Sales ──
  // CONTRADICTS: Nikolaj is VP Sales, but this old doc says "Anders Holm"
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 120, content: "Tallyo — New Employee Onboarding Checklist. Dag 1: Møde med CEO (Mads Kjeldsen). Dag 2: Introduktion til produkt med VP Sales (Anders Holm). Dag 3: Setup af værktøjer med IT (Steen Gram). Dag 4: Team-intro med din afdeling. Dag 5: Buddy-dag med erfaren kollega. Kontakt HR (Pernille) for spørgsmål.", metadata: { fileName: "Onboarding_Checklist.docx", author: "Pernille Krogh", lastModified: daysAgoDate(120) } },

  // ── C12: Camilla's 1:1 says "everything is fine" ──
  // CONTRADICTS: Thread 6 — declining engagement, skipping events, updated LinkedIn
  // (Already in stories.ts Thread 6 — the calendar note from 21 days ago)

  // ── C13: HubSpot health dashboard shows ByteWorks as "Green" ──
  // CONTRADICTS: Thread 10 — multiple support tickets, churn threat, 40% CS time
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 7, content: "HubSpot Customer Health Dashboard — Weekly. ByteWorks ApS: Health Score: Green ✅. Subscription: Starter (8 seats). Billing: Current. Support tickets (open): 0. Last NPS response: 7/10 (3 months ago). Account owner: Sara Juhl. Notes: 'Ingen aktive issues.'", metadata: { from: "noreply@hubspot.com", to: "mathilde@tallyo.dk", subject: "HubSpot: Customer Health Dashboard — Weekly", date: daysAgoDate(7) } },

  // ── C14: Marketing budget doc says 50K/month ──
  // CONTRADICTS: Maria's actual financial summary shows total burn of 180K (marketing is ~15K)
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 35, content: "Tallyo Marketing Budget — Q1 2026. Planlagt månedligt budget: 50.000 DKK. Fordeling: Digital annoncering: 25.000 DKK. Content produktion: 10.000 DKK. Events/webinars: 10.000 DKK. Tools & subscriptions: 5.000 DKK. BEMÆRK: Budgettet er PLANLAGT men ikke godkendt. Faktisk forbrug afviger.", metadata: { fileName: "Marketing_Budget_Q1_2026.xlsx", author: "Freja Storm", lastModified: daysAgoDate(35) } },

  // ── C15: Deal record shows FlowAgency as "Client" only ──
  // CONTRADICTS: FlowAgency is BOTH client AND reseller partner
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 12, content: "HubSpot Company Record — FlowAgency. Type: Client. Plan: Team (20 seats). Health: Green. Primary contact: Jesper Flow. Deals: 1 active subscription. Account owner: Nikolaj Brandt. Tags: 'creative-agency', 'copenhagen'. Notes: 'Stabil kunde, bruger Tallyo til intern projektledelse.'", metadata: { from: "noreply@hubspot.com", to: "nikolaj@tallyo.dk", subject: "HubSpot: Company Update — FlowAgency", date: daysAgoDate(12) } },
];
