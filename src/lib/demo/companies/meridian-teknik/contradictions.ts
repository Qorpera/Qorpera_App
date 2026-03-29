// ── Meridian Teknik A/S — Contradiction Content ─────────────────────────
// ~18 items encoding data inconsistencies across CRM, docs, and reality.
// Each has a comment explaining the contradiction for test verification.

import type { SyntheticContent } from "../../synthetic-types";

function daysAgoDate(d: number): string {
  return new Date(Date.now() - d * 86400000).toISOString();
}

export const MERIDIAN_CONTRADICTIONS: SyntheticContent[] = [
  // ── C1: HubSpot still shows Hans Weber as Müller contact ──
  // CONTRADICTS: Thread 1 — Hans left, Dr. Schneider is the new contact
  { sourceType: "email", connectorProvider: "microsoft-365-outlook", daysAgo: 5, content: "HubSpot Contact Record — Müller Maschinenbau GmbH. Primary contact: Hans Weber, Einkaufsleiter, h.weber@mueller-maschinenbau.de. Status: Active. Account owner: Katja Nissen. Last activity: 55 days ago. Deal: Müller Annual Framework — 450K DKK (Active). Notes: 'Stabil kunde, bestiller månedligt.'", metadata: { from: "noreply@hubspot.com", to: "katja@meridian-teknik.dk", subject: "HubSpot: Weekly Account Summary — Müller Maschinenbau", date: daysAgoDate(5) } },

  // ── C2: Morten's report says batch 447 "reworked, resolved" ──
  // CONTRADICTS: Thread 4 — 3 clients complained this week about the SAME tolerance issue
  // (Already in stories.ts Thread 4 — Morten's email saying "sagen er lukket")

  // ── C3: e-conomic has StålGruppen as vendor only ──
  // CONTRADICTS: StålGruppen is ALSO a client (Meridian sells surplus steel to them)
  { sourceType: "email", connectorProvider: "microsoft-365-outlook", daysAgo: 8, content: "e-conomic: Leverandøroversigt — marts 2026. StålGruppen A/S: Leverandørnr. L-0047. Kontakt: Flemming Stål. Kategori: Råmaterialer. Udeståender: 89.000 DKK (SG-2026-0112, forfald overskredet). Betalingshistorik: Gennemsnit 28 dage. Seneste levering: S355J2+N specialstål, 8 tons.", metadata: { from: "noreply@e-conomic.dk", to: "tina@meridian-teknik.dk", subject: "e-conomic: Leverandøroversigt marts 2026", date: daysAgoDate(8) } },

  // ── C4: Production spec sheet with DECIMAL ERROR ──
  // CONTRADICTS: Correct tolerance is ±0,05mm (Danish comma) but this doc says ±0,5mm
  // (TEN TIMES too large — critical error the agents should flag)
  { sourceType: "drive_doc", connectorProvider: "microsoft-365-onedrive", daysAgo: 30, content: "Produktspecifikation — Borediameter Ø32mm serie. Dokument: PS-2026-032. Materiale: AISI 4140. Tolerance borediameter: ±0,5mm. Overfladeruhed: Ra 1,6. Hærdning: HRC 28-32. Dimensioner: Se tegning DWG-032-A. Produktionsmaskine: CNC-3. Godkendt: Morten Bak, Produktionschef. Dato: februar 2026.", metadata: { fileName: "Produktspec_Borediameter_032_serie.pdf", author: "Morten Bak", lastModified: daysAgoDate(30) } },

  // ── C5: Org chart shows Engineering under Morten ──
  // CONTRADICTS: Calendar shows Henrik.B reports to Jørgen directly (1:1 with CEO)
  { sourceType: "drive_doc", connectorProvider: "microsoft-365-onedrive", daysAgo: 90, content: "Meridian Teknik A/S — Organisationsdiagram 2026. CEO: Jørgen Lund. Salgsdirektør: Torben Krogh → Sales team (Christian, Katja, René, Ditte, Mikael, Andreas). Produktionschef: Morten Bak → Production (Hanne, Niels, Per, + 7 operatører) + Engineering (Henrik.B, Lasse, Julie). Økonomichef: Birgitte Holm → Finance (Tina, Anne-Marie, Palle). QA Manager: Lone Dahl → Quality (Martin.D, Søren.V). Logistik: Kim Larsen → (Thomas.J, Bo, Susanne).", metadata: { fileName: "Organisationsdiagram_2026.pdf", author: "Anne-Marie Olsen", lastModified: daysAgoDate(90) } },

  // ── C6: HR headcount 35 vs payroll 34 ──
  // CONTRADICTS: Claus is commission-based, not on payroll
  { sourceType: "drive_doc", connectorProvider: "microsoft-365-onedrive", daysAgo: 15, content: "Meridian Teknik A/S — HR Personaleoversigt marts 2026. Samlet antal medarbejdere: 35. Heraf fuldtid: 33. Deltid: 2 (Anja Nielsen — OH WAIT, wrong company. Palle Svendsen ti/to, Claus Lundberg). Afdelingsfordeling: Ledelse 4, Salg 7, Produktion 10, Kvalitet 3, Logistik 4, Admin 4, Engineering 3. Lønomkostning/måned: 1.150.000 DKK.", metadata: { fileName: "Personaleoversigt_marts2026.xlsx", author: "Anne-Marie Olsen", lastModified: daysAgoDate(15) } },

  // ── C7: HubSpot shows Vestas deal in "Qualification" ──
  // CONTRADICTS: Vestas sent a formal RFP — this is further along than qualification
  { sourceType: "email", connectorProvider: "microsoft-365-outlook", daysAgo: 4, content: "HubSpot Pipeline Report — Top Deals. 1) Danfoss rammeaftale: 6.300K DKK (Negotiation). 2) Vestas framework: 8.000K DKK (Qualification). 3) FLSmidth Q2: 1.200K DKK (Proposal). 4) Nordic Tech: 380K DKK (Proposal). Total weighted pipeline: 4.200K DKK.", metadata: { from: "noreply@hubspot.com", to: "torben@meridian-teknik.dk", subject: "HubSpot: Weekly Pipeline Report", date: daysAgoDate(4) } },

  // ── C8: Q4 board report revenue 42M vs e-conomic 39.8M ──
  // CONTRADICTS: Timing/recognition difference between reports
  { sourceType: "drive_doc", connectorProvider: "microsoft-365-onedrive", daysAgo: 60, content: "Meridian Teknik A/S — Bestyrelsesrapport Q4 2025. Omsætning 2025: 42.000.000 DKK. Vækst: +8% YoY. Driftsresultat: 4.200.000 DKK (10%). Største kunder: Danfoss (15%), Grundfos (9%), Müller Maschinenbau (5%), Vestas (4%). Medarbejderantal: 35. Kapacitetsudnyttelse: 87% gennemsnit.", metadata: { fileName: "Bestyrelsesrapport_Q4_2025.pdf", author: "Birgitte Holm", lastModified: daysAgoDate(60) } },

  // e-conomic shows different revenue
  { sourceType: "email", connectorProvider: "microsoft-365-outlook", daysAgo: 55, content: "Birgitte, e-conomic årsafslutning viser total omsætning 2025: 39.800.000 DKK. Det er 2,2M under bestyrelsesrapporten (42M). Forskellen er sandsynligvis periodisering af Danfoss Q4-leverancen der blev bogført i januar. Skal vi justere? Tina", metadata: { from: "tina@meridian-teknik.dk", to: "birgitte@meridian-teknik.dk", subject: "Omsætning 2025 — afvigelse e-conomic vs. bestyrelsesrapport", date: daysAgoDate(55) } },

  // ── C9: Previous ISO audit report "no outstanding NCs" ──
  // CONTRADICTS: Thread 6 — current internal audit has 4 open NCs
  { sourceType: "drive_doc", connectorProvider: "microsoft-365-onedrive", daysAgo: 240, content: "ISO 9001 Surveillance Audit Report — august 2025. Auditor: Philippe Moreau, Bureau Veritas. Resultat: GODKENDT uden afvigelser. Bemærkninger: Imponerende kvalitetsstyringssystem. Ingen udestående non-conformances. Særligt godt: Sporbarhed og dokumentationskontrol. Anbefaling: Overvej ISO 14001 som udvidelse. Næste audit: marts/april 2026.", metadata: { fileName: "ISO9001_Audit_aug2025.pdf", author: "Lone Dahl", lastModified: daysAgoDate(240) } },

  // ── C10: 25 Hannover leads vs 5 in HubSpot ──
  // CONTRADICTS: Thread 8 — Andreas only uploaded 5 of 25 leads
  // (Already captured in Thread 8 stories — Ditte's email about only 5 in HubSpot)

  // ── C11: Shipping rates doc outdated ──
  // CONTRADICTS: Thread 12 — Thomas.J email about 8% DSV rate increase from 1 April
  { sourceType: "drive_doc", connectorProvider: "microsoft-365-onedrive", daysAgo: 120, content: "DSV Fragtrater — Meridian Teknik. Gældende fra 1. januar 2026. Danmark: 12,50 DKK/kg (min. 250 DKK). EU (Tyskland, Sverige): 18,00 DKK/kg (min. 450 DKK). UK: 22,50 DKK/kg (min. 600 DKK). Told- og moms håndteres af DSV. Kontakt: Nikolaj Brix, nikolaj.brix@dsv.com.", metadata: { fileName: "DSV_Fragtrater_2026.pdf", author: "Kim Larsen", lastModified: daysAgoDate(120) } },

  // ── C12: Precision Components contact "James Wilson" in CRM ──
  // CONTRADICTS: His actual name is "James Wilson-Park" in all email signatures
  { sourceType: "email", connectorProvider: "microsoft-365-outlook", daysAgo: 10, content: "HubSpot Contact Record — Precision Components Ltd. Primary contact: James Wilson, Purchasing Director, j.wilson@precisioncomponents.co.uk. Status: Active. Account owner: Katja Nissen. Deal: Quarterly orders — 290K DKK. Notes: 'Bestiller kvartalsvist, betaler til tiden.'", metadata: { from: "noreply@hubspot.com", to: "katja@meridian-teknik.dk", subject: "HubSpot: Contact Update — Precision Components", date: daysAgoDate(10) } },

  // ── C13: Capacity plan shows 80% target ──
  // CONTRADICTS: Thread 2 — actual utilization is 94%
  { sourceType: "drive_doc", connectorProvider: "microsoft-365-onedrive", daysAgo: 75, content: "Meridian Teknik — Kapacitetsplan 2026. Mål: 80% kapacitetsudnyttelse (branchen anbefaler 75-85% for at have buffer). CNC-maskinpark: 3 CNC-drejebænke, 2 fræsemaskiner. Planlagt vedligeholdelse: 5% af kapacitet. Forventet overtid: Under 3% af normalkapacitet. BEMÆRK: Over 90% udnyttelse frarådes — det giver ikke plads til reparationer, prøvekørsler og hasteordrer.", metadata: { fileName: "Kapacitetsplan_2026.pdf", author: "Morten Bak", lastModified: daysAgoDate(75) } },

  // ── C14: Claus commission agreement shows 5% ──
  // CONTRADICTS: His latest email mentions 7% commission on Nordic Tech order
  { sourceType: "drive_doc", connectorProvider: "microsoft-365-onedrive", daysAgo: 180, content: "Provisionsaftale — Claus Lundberg / Meridian Teknik A/S. Dato: oktober 2025. Claus Lundberg fungerer som selvstændig salgsagent for det svenske marked. Provisionssats: 5% af faktureret omsætning fra kunder anskaffet af Claus. Betaling: Månedlig fakturering med 14 dages betaling. Opsigelse: 3 måneders varsel fra begge parter.", metadata: { fileName: "Provisionsaftale_Claus_Lundberg.pdf", author: "Birgitte Holm", lastModified: daysAgoDate(180) } },

  // ── C15: Old customer list with wrong contact email ──
  // CONTRADICTS: Danfoss contact is Charlotte Riis, not "Christian Riis" (typo)
  { sourceType: "drive_doc", connectorProvider: "microsoft-365-onedrive", daysAgo: 100, content: "Meridian Teknik — Kundeliste Top 10 (omsætning 2025). 1) Danfoss A/S: Kontakt: Christian Riis, Strategic Procurement. Omsætning: 6.100K DKK. 2) Grundfos A/S: Peter Skou. 3.800K DKK. 3) Müller Maschinenbau: Hans Weber. 2.200K DKK. 4) Vestas: Mette Abildgaard. 1.900K DKK. 5) FLSmidth: Henrik Juul. 1.500K DKK.", metadata: { fileName: "Kundeliste_Top10_2025.xlsx", author: "Torben Krogh", lastModified: daysAgoDate(100) } },

  // ── C16: Product catalog price list outdated ──
  // CONTRADICTS: Prices increased 6% in January but catalog not updated
  { sourceType: "drive_doc", connectorProvider: "microsoft-365-onedrive", daysAgo: 200, content: "Meridian Teknik — Prisliste Standard Komponenter 2025. Gældende fra 1. juli 2025. Drejedele Ø10-Ø50mm: fra 85 DKK/stk. Drejedele Ø50-Ø100mm: fra 145 DKK/stk. Fræsedele standard: fra 220 DKK/stk. Specialkomponenter: tilbud. Alle priser excl. moms, FCA Meridian Teknik. BEMÆRK: Ny prisliste for 2026 med 6% stigning er IKKE publiceret endnu.", metadata: { fileName: "Prisliste_Standard_2025.pdf", author: "Torben Krogh", lastModified: daysAgoDate(200) } },

  // ── C17: Henrik.B 1:1 is with Jørgen (CEO) not Morten ──
  // CONTRADICTS: C5 org chart showing Engineering under Morten
  { sourceType: "calendar_note", connectorProvider: "microsoft-365-calendar", daysAgo: 8, content: "Jørgen + Henrik.B 1:1. Gennemgang af CNC-3 status og Danfoss-specifikationer. Henrik: Overbelastet med CAD-konverteringer og CNC-programmering. Jørgen: Vi skal dokumentere din viden og træne Lasse. Diskussion om ny 4-akset drejebænk til Vestas-projektet.", metadata: { title: "Jørgen + Henrik.B 1:1", attendees: ["jorgen@meridian-teknik.dk", "henrik.b@meridian-teknik.dk"], date: daysAgoDate(8) } },

  // ── C18: Quality manual says "all batches 100% inspected" ──
  // CONTRADICTS: Reality is sample-based (CMM every 10th component per corrective action)
  { sourceType: "drive_doc", connectorProvider: "microsoft-365-onedrive", daysAgo: 150, content: "Meridian Teknik — Kvalitetshåndbog. Rev. 4.1. Inspektionsprocedure: Alle batcher 100% inspiceres med CMM (Coordinate Measuring Machine) inden frigivelse. Tolerance-afvigelser logges i QA-database. Batcher med afvigelser returneres til produktion for rework. Frigivelse kræver QA-managers underskrift.", metadata: { fileName: "Kvalitetshaandbog_rev4.1.pdf", author: "Lone Dahl", lastModified: daysAgoDate(150) } },
];
