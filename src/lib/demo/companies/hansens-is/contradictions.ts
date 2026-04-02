// ── Hansens Flødeis ApS — Contradiction Content ────────────────────────
// ~8 items that deliberately contradict other data or real-world facts.
// Each has a comment explaining the contradiction for test verification.

import type { SyntheticContent } from "../../synthetic-types";

function daysAgoDate(d: number): string {
  return new Date(Date.now() - d * 86400000).toISOString();
}

export const HANSENS_CONTRADICTIONS: SyntheticContent[] = [
  // ── C1: Old firmaprofil says "25 medarbejdere" — reality is 49 (CVR) ──
  // CONTRADICTS: CVR-registered headcount of 49 after DSK growth
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 95, content: "Hansens Flødeis ApS — Firmaprofil. CVR: 18534398. Adresse: Præsteengen 6, 3630 Jægerspris. Grundlagt 1922. Økologisk isproduktion og distribution i Nordsjælland. 25 medarbejdere. Kontakt: Rasmus Eibye, rasmus@hansens-is.dk, tlf 47 53 10 22.", metadata: { fileName: "Hansens_Firmaprofil_2025.pdf", author: "Trine Damgaard", lastModified: daysAgoDate(95) } },

  // ── C2: Kim Søgaard's email signature still says "Salgsdirektør" — hasn't answered emails in 2 weeks ──
  // CONTRADICTS: Thread 10 story where Kim has gone silent / possible departure
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 18, content: "Hej Henrik, tak for din besked. Jeg vender tilbage hurtigst muligt med de opdaterede prislister til sommersæsonen. Med venlig hilsen, Kim Søgaard, Salgsdirektør, Hansens Flødeis ApS, Præsteengen 6, 3630 Jægerspris, tlf 47 53 10 22", metadata: { from: "kim.s@hansens-is.dk", to: "henrik.p@coop.dk", subject: "Re: Prislister sommer 2026", direction: "sent", date: daysAgoDate(18) } },

  // ── C3: Old template says production cost 28 DKK/kg, recent Coop deal uses 34 DKK/kg ──
  // CONTRADICTS: actual production costs have risen due to organic milk price increases
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 70, content: "Hansens Flødeis — Kalkulationsskabelon 2025. Basisproduktionsomkostning: 28 DKK/kg. Heraf råvarer (øko-mælk, fløde, sukker): 18 DKK/kg. Energi og køl: 4 DKK/kg. Arbejdsløn: 6 DKK/kg. Emballage: 2,50 DKK/stk (500ml bæger). Dækningsgrad mål: 42%. Standardpris til detail: 48 DKK/kg.", metadata: { fileName: "Kalkulationsskabelon_2025.xlsx", author: "Anders Eibye", lastModified: daysAgoDate(70) } },

  // ── C4: Insurance document from Jan 2025 lists 35 employees (pre-DSK, pre-growth) ──
  // CONTRADICTS: current headcount of 49 — policy needs updating
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 110, content: "Kære Rasmus Eibye, hermed bekræftelse på jeres erhvervsforsikring for 2025. Forsikringen dækker: Hansens Flødeis ApS, CVR 18534398, Præsteengen 6, 3630 Jægerspris. Antal ansatte: 35. Dækningsomfang: Erhvervsansvar, produktansvar, arbejdsskadeforsikring, bygning og inventar. Samlet præmie: 187.500 DKK/år. Venlig hilsen, Codan Erhverv", metadata: { from: "erhverv@codan.dk", to: "rasmus@hansens-is.dk", subject: "Hansens Flødeis — Forsikringspolice 2025", direction: "received", date: daysAgoDate(110) } },

  // ── C5: HACCP plan says "revideres årligt — sidst revideret februar 2025" — now 14 months old ──
  // CONTRADICTS: Thread 3 story about compliance gaps; annual revision overdue
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 60, content: "HACCP-plan — Hansens Flødeis ApS. Version 7.2. Sidst revideret: februar 2025. Næste revision: februar 2026. Plan revideres årligt af kvalitetsansvarlig i samarbejde med ekstern konsulent. Kritiske kontrolpunkter: Pasteurisering (min. 72°C / 15 sek), kølelager (max -18°C), modtagekontrol råmælk (temperatur, lugt, syregrad). Ansvarlig: Robert Larsen, Produktionschef. Godkendt af: Rasmus Eibye, Direktør.", metadata: { fileName: "HACCP_Plan_v7.2.pdf", author: "Robert Larsen", lastModified: daysAgoDate(60) } },

  // ── C6: Old org chart lists Hans Jørgen Eibye as bestyrelsesformand — since replaced by Annemette Thomsen ──
  // CONTRADICTS: DSK investment brought Annemette Thomsen in as new bestyrelsesformand
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 130, content: "Hansens Flødeis ApS — Organisationsdiagram (sept 2025). Bestyrelse: Hans Jørgen Eibye (bestyrelsesformand, 3. generation), Rasmus Eibye (direktør), Anders Eibye (produktionsleder). Direktion: Rasmus Eibye (adm. direktør). Produktion: Anders Eibye, Robert Larsen, Niels Brandt, Lotte Friis, Jonas Kvist, Peter Holm, Lars Winther. Salg: Kim Søgaard. Administration: Trine Damgaard, Marie Gade, Camilla Holt.", metadata: { fileName: "Organisationsdiagram_sept2025.pdf", author: "Trine Damgaard", lastModified: daysAgoDate(130) } },

  // ── C7: Business plan says "Vi har ingen planer om internationalisering" — contradicts DSK's stated export strategy ──
  // CONTRADICTS: Sverige-ekspansion deal with sthlmicecream AB and DSK's growth ambitions
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 100, content: "Hansens Flødeis — Strategiplan 2025-2027 (v1). Vision: At være Nordsjællands foretrukne producent af økologisk flødeis. Fokusområder: 1) Udvidelse af detaildistribution i Danmark (Coop, Salling, Dagrofa). 2) Udvikling af nye smagsvarianter med lokale ingredienser. 3) Optimering af produktionsflow. Vi har ingen planer om internationalisering — vores styrke ligger i det lokale og autentiske danske produkt. Omsætningsmål 2027: 18M DKK.", metadata: { fileName: "Strategiplan_2025-2027_v1.pdf", author: "Rasmus Eibye", lastModified: daysAgoDate(100) } },

  // ── C8: 2024 doc says "max kapacitet 1,8M liter" — Anders has said 2M liter in interviews ──
  // CONTRADICTS: Anders's stated capacity of 2M liter (post equipment upgrade)
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 85, content: "Hansens Flødeis — Produktionsoversigt 2024/2025. Fabriksareal: 1.200 m² produktionslokaler + 400 m² kølelager. Udstyr: 2 pasteuriseringsanlæg, 1 homogenisator, 3 frysetunneler. Maksimal årskapacitet: 1,8 mio. liter. Nuværende udnyttelse: ca. 72% (1,3 mio. liter i 2024). Bemanding: 2-holds skift i højsæson (maj-sept). Begrænsninger: Flaskehals ved fyldning og pakning — manuelt arbejde, max 800 liter/time.", metadata: { fileName: "Produktionsoversigt_2024-2025.pdf", author: "Anders Eibye", lastModified: daysAgoDate(85) } },
];
