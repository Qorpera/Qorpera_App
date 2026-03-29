// ── Boltly ApS — Contradiction Content ──────────────────────────────────
// ~10 items that deliberately contradict other story items.
// Each has a comment explaining the contradiction for test verification.

import type { SyntheticContent } from "../../synthetic-types";

function daysAgoDate(d: number): string {
  return new Date(Date.now() - d * 86400000).toISOString();
}

export const BOLTLY_CONTRADICTIONS: SyntheticContent[] = [
  // ── C1: Old org chart lists 8 employees including Jens, missing new hires ──
  // CONTRADICTS: current employee list (12 people, no Jens)
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 90, content: "Boltly ApS — Organisationsoversigt (jan 2026). Direktør: Lars Bolt. Kontor: Trine Holst (kontorchef). Felthold: Mikkel Rasmussen (oversvend), Sofie Jensen (svend), Jens Petersen (svend), Frederik Møller (svend), Emil Madsen (lærling 1. år), Ida Sørensen (lærling 2. år). I alt: 8 medarbejdere. Kontakt: lars@boltly.dk, tlf 31 22 89 04.", metadata: { fileName: "Organisationsoversigt_jan2026.pdf", author: "Trine Holst", lastModified: daysAgoDate(90) } },

  // ── C2: Old employee count in email (8 vs current 12) ──
  // CONTRADICTS: current headcount — Kasper, Anja, Henrik, Thomas.K joined since
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 85, content: "Hej Lars, vedhæftet er den opdaterede forsikringspolice for Boltly ApS. Policen dækker 8 medarbejdere som angivet. Husk at kontakte os ved personaleændringer. Venlig hilsen, Tryg Erhverv", metadata: { from: "erhverv@tryg.dk", to: "lars@boltly.dk", subject: "Boltly ApS — forsikringspolice 2026", direction: "received", date: daysAgoDate(85) } },

  // ── C3: Vestegnen project plan says Emil on fase 2, but Kasper replaced him ──
  // CONTRADICTS: Thread 1 email (daysAgo 5) where Mikkel says Kasper took Emil's spot
  // (The project plan doc in stories.ts still says "Ansvarlig: Mikkel + Emil" for fase 2)

  // ── C4: Tilbudsskabelon with OLD hourly rate ──
  // CONTRADICTS: recent quotes that use 525 DKK/time (e.g. Thomas.K's Lund & Co quote)
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 45, content: "Tilbudsskabelon — Boltly ApS. Til: [Kundenavn]. Vedr.: [Projektbeskrivelse]. Hermed tilbud på el-installation/renovering. Omfang: [Beskrivelse]. Materialer: [Liste]. Arbejdstimer estimat: [Timer] timer á 495 DKK/time. Materialer: [Beløb] DKK. Total excl. moms: [Total] DKK. Tilbuddet er gældende i 30 dage. Betalingsbetingelser: Netto 14 dage. Garanti: 2 år på installation iht. AB92. Kontakt: Lars Bolt, tlf 31 22 89 04.", metadata: { fileName: "Tilbudsskabelon_2026.docx", author: "Trine Holst", lastModified: daysAgoDate(45) } },

  // ── C5: Recent quote using 525 DKK/time (contradicts template's 495) ──
  // CONTRADICTS: C4 template above — rate increased but template not updated
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Kære Maria Lund, hermed foreløbigt prisestimat for el-installation på Amagerbrogade-kontoret: Estimeret 85 arbejdstimer á 525 DKK/time = 44.625 DKK. Materialer estimat: 38.000-45.000 DKK. Samlet ca. 85.000-95.000 DKK excl. moms. Endeligt tilbud efter besigtigelse. Med venlig hilsen, Thomas Kjær, Boltly ApS", metadata: { from: "thomas.k@boltly.dk", to: "maria@lundco.dk", subject: "Foreløbigt prisestimat — Lund & Co kontor", date: daysAgoDate(3) } },

  // ── C6: Old forretningsplan says omsætning target 2.2M, updated says 2.8M ──
  // CONTRADICTS: stories.ts forretningsplan (2.8M target) — an older version had lower ambitions
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 120, content: "Boltly ApS — Forretningsplan 2026 (UDKAST). Mission: Pålidelig el-installation og service for erhverv og bolig i Storkøbenhavn. Mål 2026: Omsætning 2,2M DKK (2025: 1,8M DKK). Ansætte 1 ekstra svend i Q3. Udvide til solcelle-installation via partnerskab. Nøgletal: Gennemsnitlig projektværdi: 95.000 DKK. Serviceaftaler: 4 aktive (Skovgaard, Vestegnen, Nygade, + 1 ny). Materialeomkostningsandel: 35%.", metadata: { fileName: "Forretningsplan_2026_UDKAST.pdf", author: "Lars Bolt", lastModified: daysAgoDate(120) } },

  // ── C7: Autorisation doc still lists Jens as employee ──
  // CONTRADICTS: Jens left 3 months ago — doc should have been updated
  // (Already in stories.ts Thread 7 — the autorisation doc listing Jens)

  // ── C8: Henrik's old email signature says "Elektriker" not "Projektkoordinator" ──
  // CONTRADICTS: his current role as project coordinator
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 70, content: "Lars, materialer til Skovgaard-gennemgangen er bestilt. 10 stk RCD 30mA og 5 stk automatsikringer. Leveres onsdag. Henrik Bolt, Elektriker, Boltly ApS", metadata: { from: "henrik@boltly.dk", to: "lars@boltly.dk", subject: "Materialer — Skovgaard gennemgang", date: daysAgoDate(70) } },

  // ── C9: Old Slack message from Jens doing field work (he's gone now) ──
  // CONTRADICTS: current state where Jens is no longer employed
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 88, content: "Lars — jeg er færdig hos Café Nørrebro. Stikledningen i køkkenet var defekt, har skiftet den. Jonas er tilfreds. Kører videre til Nygade for at tjekke nødbelysningen.", metadata: { channel: "general", authorEmail: "jens@boltly.dk", authorName: "Jens Petersen" } },

  // ── C10: Invoice header says "7 medarbejdere" (outdated) ──
  // CONTRADICTS: current headcount of 12
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 65, content: "Boltly ApS — Firmaprofil til tilbud. CVR: 42891037. Adresse: Hvidovrevej 88, 2650 Hvidovre. Autoriseret elinstallatørvirksomhed. 7 medarbejdere heraf 2 lærlinge. Etableret 2019. Specialer: Boliginstallation, erhvervsinstallation, nødbelysning, serviceaftaler. Forsikring: Tryg Erhverv. Kontakt: Lars Bolt, 31 22 89 04, lars@boltly.dk.", metadata: { fileName: "Boltly_firmaprofil_2026.docx", author: "Trine Holst", lastModified: daysAgoDate(65) } },
];
