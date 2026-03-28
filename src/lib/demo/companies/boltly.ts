import type { SyntheticCompany } from "../synthetic-types";

const BOLTLY: SyntheticCompany = {
  slug: "boltly",
  name: "Boltly ApS",
  industry: "Electrical Installation & Service",
  domain: "boltly.dk",

  employees: [
    { name: "Lars Bolt", email: "lars@boltly.dk", role: "admin", locale: "da" },
    { name: "Mikkel Rasmussen", email: "mikkel@boltly.dk", role: "member", locale: "da" },
    { name: "Sofie Jensen", email: "sofie@boltly.dk", role: "member", locale: "da" },
    { name: "Emil Madsen", email: "emil@boltly.dk", role: "member", locale: "da" },
    { name: "Trine Holst", email: "trine@boltly.dk", role: "member", locale: "da" },
  ],

  connectors: [
    { provider: "gmail", name: "Gmail (Lars)", assignedToEmployee: "lars@boltly.dk" },
    { provider: "gmail", name: "Gmail (Trine)", assignedToEmployee: "trine@boltly.dk" },
    { provider: "google-calendar", name: "Kalender (Lars)", assignedToEmployee: "lars@boltly.dk" },
    { provider: "google-calendar", name: "Kalender (Trine)", assignedToEmployee: "trine@boltly.dk" },
    { provider: "google-drive", name: "Google Drive", assignedToEmployee: "lars@boltly.dk" },
    { provider: "e-conomic", name: "e-conomic" },
  ],

  companies: [
    { name: "Skovgaard Ejendomme", domain: "skovgaard-ejendomme.dk", industry: "Property Management", relationship: "client" },
    { name: "Rødovre Tandklinik", domain: "roedovre-tand.dk", industry: "Healthcare", relationship: "client" },
    { name: "Café Nørrebro", domain: "cafe-norrebro.dk", industry: "Hospitality", relationship: "client" },
    { name: "Vestegnens Boligforening", domain: "vestegnens-bolig.dk", industry: "Housing Association", relationship: "client" },
    { name: "Hansen & Larsen Arkitekter", domain: "hl-arkitekter.dk", industry: "Architecture", relationship: "partner" },
    { name: "EL-Grossisten Nord", domain: "el-grossisten.dk", industry: "Electrical Wholesale", relationship: "vendor" },
    { name: "Grøn Energi Rådgivning", domain: "groen-energi.dk", industry: "Energy Consulting", relationship: "partner" },
    { name: "Nygade Butikscenter", domain: "nygade-center.dk", industry: "Retail", relationship: "client" },
  ],

  contacts: [
    { name: "Peter Skovgaard", email: "peter@skovgaard-ejendomme.dk", company: "Skovgaard Ejendomme", title: "Driftschef", phone: "+45 28 91 44 02" },
    { name: "Anne Thorsen", email: "anne@roedovre-tand.dk", company: "Rødovre Tandklinik", title: "Klinikchef" },
    { name: "Jonas Nørby", email: "jonas@cafe-norrebro.dk", company: "Café Nørrebro", title: "Ejer" },
    { name: "Karen Holm", email: "karen@vestegnens-bolig.dk", company: "Vestegnens Boligforening", title: "Projektleder" },
    { name: "Thomas Hansen", email: "thomas@hl-arkitekter.dk", company: "Hansen & Larsen Arkitekter", title: "Partner" },
    { name: "Bent Nielsen", email: "bent@el-grossisten.dk", company: "EL-Grossisten Nord", title: "Salgskonsulent" },
    { name: "Lise Grøn", email: "lise@groen-energi.dk", company: "Grøn Energi Rådgivning", title: "Energikonsulent" },
    { name: "Martin Dall", email: "martin@nygade-center.dk", company: "Nygade Butikscenter", title: "Centerleder" },
  ],

  deals: [
    { name: "Skovgaard serviceaftale 2026", company: "Skovgaard Ejendomme", contact: "Peter Skovgaard", stage: "closed-won", amount: 180000, createdDaysAgo: 90, lastActivityDaysAgo: 5 },
    { name: "Tandklinik LED-renovering", company: "Rødovre Tandklinik", contact: "Anne Thorsen", stage: "proposal", amount: 85000, createdDaysAgo: 14, lastActivityDaysAgo: 3 },
    { name: "Café nyinstallation", company: "Café Nørrebro", contact: "Jonas Nørby", stage: "negotiation", amount: 120000, createdDaysAgo: 30, lastActivityDaysAgo: 12 },
    { name: "Vestegnen blok 7 renovering", company: "Vestegnens Boligforening", contact: "Karen Holm", stage: "closed-won", amount: 340000, createdDaysAgo: 120, lastActivityDaysAgo: 8 },
    { name: "Nygade Center nødbelysning", company: "Nygade Butikscenter", contact: "Martin Dall", stage: "qualification", amount: 65000, createdDaysAgo: 7, lastActivityDaysAgo: 2 },
    { name: "Grøn Energi solcelle-samarbejde", company: "Grøn Energi Rådgivning", contact: "Lise Grøn", stage: "proposal", amount: 0, createdDaysAgo: 21, lastActivityDaysAgo: 6 },
  ],

  invoices: [
    { number: "INV-2026-031", company: "Skovgaard Ejendomme", amount: 45000, status: "paid", issuedDaysAgo: 35 },
    { number: "INV-2026-032", company: "Vestegnens Boligforening", amount: 112500, status: "paid", issuedDaysAgo: 28 },
    { number: "INV-2026-033", company: "Skovgaard Ejendomme", amount: 15800, status: "overdue", issuedDaysAgo: 22, daysOverdue: 8 },
    { number: "INV-2026-034", company: "Café Nørrebro", amount: 8500, status: "sent", issuedDaysAgo: 12 },
    { number: "INV-2026-035", company: "Vestegnens Boligforening", amount: 87000, status: "overdue", issuedDaysAgo: 18, daysOverdue: 4 },
    { number: "INV-2026-036", company: "Nygade Butikscenter", amount: 22000, status: "draft", issuedDaysAgo: 2 },
  ],

  // ── Content ─────────────────────────────────────────────────────
  // ~80 items covering emails, docs, and calendar notes.
  // Each item must contain enough natural language for the agents
  // to discover org structure, processes, and relationships.
  content: [
    // ── EMAILS (from/to patterns reveal who works there and their roles) ──

    // Lars as decision-maker / owner
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 1, content: "Hej Peter, tak for snakken i går. Vi kigger på serviceaftalen for 2026 og sender et opdateret tilbud inden fredag. Mikkel tager sig af den årlige gennemgang af jeres ejendomme i Brønshøj — han kender installationerne bedst. Vh Lars Bolt, Boltly ApS", metadata: { from: "lars@boltly.dk", to: "peter@skovgaard-ejendomme.dk", subject: "RE: Serviceaftale 2026", date: new Date(Date.now() - 1 * 86400000).toISOString() } },
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 2, content: "Trine, kan du sende en påmindelse til Vestegnens Boligforening om INV-2026-035? Den er nu 4 dage over forfald. Beløbet er 87.000 DKK og det er for fase 2 af blok 7-renoveringen. Ring til Karen Holm hvis de ikke svarer inden onsdag.", metadata: { from: "lars@boltly.dk", to: "trine@boltly.dk", subject: "Påmindelse: Vestegnen faktura", date: new Date(Date.now() - 2 * 86400000).toISOString() } },
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Mikkel og Sofie — husk sikkerhedsbriefing fredag kl 7:30 inden I kører ud til Vestegnen. Der er nye brandkrav for trappebelysning i blok 7 som vi skal gennemgå. Emil, du deltager også — god læringsmulighed. Lars", metadata: { from: "lars@boltly.dk", to: "mikkel@boltly.dk", cc: "sofie@boltly.dk, emil@boltly.dk", subject: "Sikkerhedsbriefing fredag", date: new Date(Date.now() - 3 * 86400000).toISOString() } },
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 5, content: "Hej Thomas, tak for tegningerne til Café Nørrebro-projektet. Jeg har gennemgået el-specifikationen — vi skal have en dialog om belastningsberegningen for køkkensektionen. Kan vi mødes torsdag? Vh Lars", metadata: { from: "lars@boltly.dk", to: "thomas@hl-arkitekter.dk", subject: "RE: Café Nørrebro el-specifikation", date: new Date(Date.now() - 5 * 86400000).toISOString() } },
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 4, content: "Kære Anne Thorsen, hermed tilbud på LED-renovering af Rødovre Tandklinik. Tilbuddet dækker udskiftning af 42 lysstofrør til LED-paneler i behandlingsrum og venteværelse plus ny el-tavle. Samlet pris: 85.000 DKK ex. moms. Udførelse: 2 dage, planlagt i uge 16. Vi sørger for minimal forstyrrelse af klinikdrift. Venlig hilsen, Lars Bolt", metadata: { from: "lars@boltly.dk", to: "anne@roedovre-tand.dk", subject: "Tilbud: LED-renovering Rødovre Tandklinik", date: new Date(Date.now() - 4 * 86400000).toISOString() } },

    // Trine as admin/bookkeeper
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 1, content: "Hej Karen, dette er en venlig påmindelse om at faktura INV-2026-035 på 87.000 DKK forfaldt den 10. marts. Kan du bekræfte hvornår vi kan forvente betaling? Venlig hilsen, Trine Holst, Boltly ApS", metadata: { from: "trine@boltly.dk", to: "karen@vestegnens-bolig.dk", subject: "Betalingspåmindelse: INV-2026-035", date: new Date(Date.now() - 1 * 86400000).toISOString() } },
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Lars, her er overblikket for marts: Vi har 3 åbne fakturaer for samlet 124.800 DKK. INV-2026-033 (Skovgaard, 15.800 DKK) er 8 dage over forfald — Peter plejer at betale til tiden, det er usædvanligt. INV-2026-035 (Vestegnen, 87.000 DKK) er 4 dage over forfald. INV-2026-034 (Café Nørrebro, 8.500 DKK) er sendt men ikke forfalden endnu.", metadata: { from: "trine@boltly.dk", to: "lars@boltly.dk", subject: "Økonomioverblik marts", date: new Date(Date.now() - 3 * 86400000).toISOString() } },
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 6, content: "Hej Bent, kan du sende et tilbud på 200m 5x2.5mm² NYM-kabel og 30 stk LED-downlights til Vestegnen-projektet? Vi skal bruge det inden uge 15. Tak, Trine", metadata: { from: "trine@boltly.dk", to: "bent@el-grossisten.dk", subject: "Materialebestilling — Vestegnen blok 7", date: new Date(Date.now() - 6 * 86400000).toISOString() } },
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 8, content: "Sofie, din kørselsgodtgørelse for februar er godkendt — 2.340 DKK for 12 ture til Vestegnen og 3 ture til Skovgaard-ejendommene. Beløbet udbetales med næste løn. /Trine", metadata: { from: "trine@boltly.dk", to: "sofie@boltly.dk", subject: "Kørselsgodtgørelse februar", date: new Date(Date.now() - 8 * 86400000).toISOString() } },
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 2, content: "Martin, hermed opdateret tilbud på nødbelysning for Nygade Butikscenter. Vi har inkluderet brandmyndighedernes krav fra seneste inspektion. Lars gennemgår det tekniske med dig på mødet torsdag. /Trine", metadata: { from: "trine@boltly.dk", to: "martin@nygade-center.dk", subject: "Opdateret tilbud: Nødbelysning Nygade", date: new Date(Date.now() - 2 * 86400000).toISOString() } },

    // Mikkel as senior electrician
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 2, content: "Lars, installationen i blok 7 opgangene A-C er færdig. Sofie og jeg har testet alle kredsløb — alt godkendt. Emil hjalp med kabelføring og gjorde det rigtig godt. Opgangene D-F starter mandag. Vi mangler 50m kabel mere — Trine bestiller hos EL-Grossisten.", metadata: { from: "mikkel@boltly.dk", to: "lars@boltly.dk", subject: "Vestegnen blok 7 — status opgang A-C", date: new Date(Date.now() - 2 * 86400000).toISOString() } },
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 7, content: "Peter, den årlige gennemgang af jeres installationer i Brønshøj er planlagt til torsdag og fredag i uge 14. Jeg checker stikledninger, tavler og RCD'er i alle 3 ejendomme. Er der noget specifikt I vil have mig til at se på? Vh Mikkel, Boltly", metadata: { from: "mikkel@boltly.dk", to: "peter@skovgaard-ejendomme.dk", subject: "Årlig elgennemgang — Brønshøj ejendomme", date: new Date(Date.now() - 7 * 86400000).toISOString() } },
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 4, content: "Emil, husk at lave dit daglige lærerapport fra Vestegnen i dag. Du skal notere: 1) Hvilke kredsløb du har arbejdet på, 2) Hvilke sikkerhedsprocedurer du fulgte, 3) Spørgsmål til gennemgang med mig fredag. Det er en del af din uddannelseslog. /Mikkel", metadata: { from: "mikkel@boltly.dk", to: "emil@boltly.dk", subject: "Lærerapport — husk daglig", date: new Date(Date.now() - 4 * 86400000).toISOString() } },

    // Sofie as field electrician
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Lars, jeg har gennemgået brandkravene for trappebelysning — det kræver selvforsynende nødbelysning med 3 timers backup i alle opgange. Det er en ændring fra det originale projekt. Ekstra materiale til ca. 18.000 DKK. Skal jeg opdatere tilbuddet?", metadata: { from: "sofie@boltly.dk", to: "lars@boltly.dk", subject: "Vestegnen — nye brandkrav trappebelysning", date: new Date(Date.now() - 3 * 86400000).toISOString() } },
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 9, content: "Trine, min bil skal til service onsdag — kan du booke en lånebil fra Sixt? Jeg har kundebesøg hos Skovgaard torsdag morgen kl 8 som jeg ikke kan flytte.", metadata: { from: "sofie@boltly.dk", to: "trine@boltly.dk", subject: "Lånebil onsdag", date: new Date(Date.now() - 9 * 86400000).toISOString() } },

    // Emil as apprentice
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 5, content: "Mikkel, her er min lærerapport for tirsdag: Arbejdede med kabelføring i opgang B. Trak 3x NYM 5x2.5 fra kælder til 4. sal. Brugte korrekt aflastning ved hvert etagegennemføring. Spørgsmål: Hvornår bruger man NOIKLX i stedet for NYM? Og kan du vise mig fejlsøgning på RCD'er fredag?", metadata: { from: "emil@boltly.dk", to: "mikkel@boltly.dk", subject: "Lærerapport tirsdag — opgang B kabelføring", date: new Date(Date.now() - 5 * 86400000).toISOString() } },

    // External incoming emails (trigger situations)
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 1, content: "Hej Lars, vi har en akut situation — en af vores butikker i Nygade Center har haft strømsvigt i hele butikken siden i morges. Kan I sende nogen ud i dag? Vi mister omsætning for hver time. Ring mig på 26 88 11 03. Mvh Martin Dall", metadata: { from: "martin@nygade-center.dk", to: "lars@boltly.dk", subject: "HASTER: Strømsvigt Nygade Center butik 14", direction: "received", date: new Date(Date.now() - 1 * 86400000).toISOString() } },
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 2, content: "Hej Boltly, vi er ved at renovere vores kontorer på Amagerbrogade og har brug for en autoriseret elektriker til at lave ny el-installation i 4 kontorer + fællesområde. Kan I sende et tilbud? Vi vil gerne starte i april. Vh Maria Lund, Lund & Co Advokater", metadata: { from: "maria@lundco.dk", to: "lars@boltly.dk", subject: "Forespørgsel: El-installation kontor Amagerbrogade", direction: "received", date: new Date(Date.now() - 2 * 86400000).toISOString() } },
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 0, content: "Lars, vi har godkendt tilbuddet på LED-renovering. Hvornår kan I starte? Vi foretrækker en mandag så vi kan flytte patienter til tirsdag. Anne Thorsen, Rødovre Tandklinik", metadata: { from: "anne@roedovre-tand.dk", to: "lars@boltly.dk", subject: "RE: Tilbud: LED-renovering Rødovre Tandklinik", direction: "received", date: new Date().toISOString() } },
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Hej Trine, beklager den sene betaling af INV-2026-033. Vi har haft et ERP-skifte og betalingerne er forsinket. Betaler i denne uge. Vh Peter", metadata: { from: "peter@skovgaard-ejendomme.dk", to: "trine@boltly.dk", subject: "RE: Betalingspåmindelse INV-2026-033", direction: "received", date: new Date(Date.now() - 3 * 86400000).toISOString() } },
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 1, content: "Hej Lars, kan vi mødes i næste uge og drøfte et solcelleprojekt? Vi har en boligforening der vil installere solceller på 6 boligblokke og har brug for en el-partner til tilslutning og sikringsinstallation. Det er en stor opgave — estimeret 500-800.000 DKK i el-arbejde. Vh Lise Grøn", metadata: { from: "lise@groen-energi.dk", to: "lars@boltly.dk", subject: "Solcelleprojekt — samarbejdsmulighed", direction: "received", date: new Date(Date.now() - 1 * 86400000).toISOString() } },
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 6, content: "Jonas her. Café Nørrebro-projektet — vi har ændret planerne for køkkenet. Kan du kigge på de opdaterede tegninger? Vi har brug for 3 ekstra stikkontakter og en stærkstrømsudgang til den nye ovn. Vedhæftet: køkkenplan_v3.pdf", metadata: { from: "jonas@cafe-norrebro.dk", to: "lars@boltly.dk", subject: "Café Nørrebro — opdaterede køkkenplaner", direction: "received", date: new Date(Date.now() - 6 * 86400000).toISOString() } },
    { sourceType: "email", connectorProvider: "gmail", daysAgo: 0, content: "Kære Lars Bolt, dette er en påmindelse fra Sikkerhedsstyrelsen om at jeres autorisationscertifikat udløber om 60 dage (30. maj 2026). Fornyelse kræver indsendelse af opdateret dokumentation. Se vedhæftet vejledning.", metadata: { from: "noreply@sikkerhedsstyrelsen.dk", to: "lars@boltly.dk", subject: "Påmindelse: Autorisationsfornyelse — Boltly ApS", direction: "received", date: new Date().toISOString() } },

    // ── DOCUMENTS (Google Drive — reveal processes, templates, knowledge) ──
    { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 30, content: "Boltly ApS — Kvalitetssikringsprocedure. Version 3.2. Alle installationer skal følge denne procedure: 1) Tjek el-tavle og sikringer før arbejde påbegyndes, 2) Dokumentér eksisterende installation med foto, 3) Udfør arbejde iht. Stærkstrømsbekendtgørelsen, 4) Test alle kredsløb med isolationstester, 5) RCD-test på alle nye kredsløb, 6) Udfyld afleveringsprotokol og få kundens underskrift. Ansvarlig for procedure: Lars Bolt, elautoriseret installatør.", metadata: { fileName: "Kvalitetssikring_v3.2.docx", author: "Lars Bolt", lastModified: new Date(Date.now() - 30 * 86400000).toISOString() } },
    { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 14, content: "Tilbudsskabelon — Boltly ApS. Til: [Kundenavn]. Vedr.: [Projektbeskrivelse]. Hermed tilbud på el-installation/renovering. Omfang: [Beskrivelse]. Materialer: [Liste]. Arbejdstimer estimat: [Timer] timer á 495 DKK/time. Materialer: [Beløb] DKK. Total excl. moms: [Total] DKK. Tilbuddet er gældende i 30 dage. Betalingsbetingelser: Netto 14 dage. Garanti: 2 år på installation iht. AB92. Kontakt: Lars Bolt, tlf 31 22 89 04.", metadata: { fileName: "Tilbudsskabelon_2026.docx", author: "Trine Holst", lastModified: new Date(Date.now() - 14 * 86400000).toISOString() } },
    { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 60, content: "Boltly personalehåndbog 2026. Arbejdstid: 07:00-15:30, fredag 07:00-13:00. Frokost: 30 min kl 11:30. Kørsel: 3,73 DKK/km for brug af egen bil. Værktøj: Firmaet stiller el-tester, bormaskine og standard værktøj til rådighed. Sikkerhed: Alle skal bære sikkerhedssko og have gyldigt førstehjælpskursus. Lærling-specifikke regler: Daglig lærerapport obligatorisk. Altid arbejde under opsyn af svend. Aldrig arbejde på spændingsførende installationer. Ferieplan: 3 ugers sommerferie (uge 28-30), jul 23/12-1/1.", metadata: { fileName: "Personalehåndbog_2026.pdf", author: "Lars Bolt", lastModified: new Date(Date.now() - 60 * 86400000).toISOString() } },
    { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 7, content: "Vestegnen Blok 7 — Projektplan. Kunde: Vestegnens Boligforening. Kontakt: Karen Holm. Samlet budget: 340.000 DKK. Fase 1 (uge 10-11): Opgang A-C, ny hovedledning + tavle + LED trappebelysning. Ansvarlig: Mikkel + Sofie. Fase 2 (uge 13-14): Opgang D-F, samme scope. Ansvarlig: Mikkel + Emil. Fase 3 (uge 16): Nødbelysning alle opgange (NYT KRAV — tilføjet efter brandmyndighedsinspektion). Ansvarlig: Sofie. Status: Fase 1 færdig, fase 2 starter mandag.", metadata: { fileName: "Vestegnen_Blok7_projektplan.xlsx", author: "Lars Bolt", lastModified: new Date(Date.now() - 7 * 86400000).toISOString() } },
    { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 21, content: "Emils uddannelsesplan — Boltly ApS. Lærling: Emil Madsen. Startdato: August 2025. Mentor: Mikkel Rasmussen. Nuværende modul: Installationsteknik grundforløb 2. Fokusområder dette kvartal: Kabelføring i boligbyggeri, RCD-installation og test, Læsning af el-diagrammer. Evaluering: Mikkel evaluerer Emil hver fredag. Kvartalssamtale med Lars i april. Skoleperiode: Uge 20-24 (maj-juni). Emil viser god fremgang — arbejder selvstændigt med kabelføring, skal have mere erfaring med fejlsøgning.", metadata: { fileName: "Emil_uddannelsesplan_2025-26.docx", author: "Mikkel Rasmussen", lastModified: new Date(Date.now() - 21 * 86400000).toISOString() } },
    { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 90, content: "Boltly ApS — Forretningsplan 2026. Mission: Pålidelig el-installation og service for erhverv og bolig i Storkøbenhavn. Mål 2026: Omsætning 2,2M DKK (2025: 1,8M DKK). Ansætte 1 ekstra svend i Q3. Udvide til solcelle-installation via partnerskab med Grøn Energi Rådgivning. Nøgletal: Gennemsnitlig projektværdi: 95.000 DKK. Serviceaftaler: 4 aktive (Skovgaard, Vestegnen, Nygade, + 1 ny i 2026). Materialeomkostningsandel: 35%. Timeallokering: 70% projektarbejde, 20% service, 10% admin.", metadata: { fileName: "Forretningsplan_2026.pdf", author: "Lars Bolt", lastModified: new Date(Date.now() - 90 * 86400000).toISOString() } },
    { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 3, content: "Afleveringsprotokol — Vestegnen Blok 7, Opgang A-C. Dato: [dato]. Udført af: Mikkel Rasmussen, Sofie Jensen. Lærling: Emil Madsen. Arbejde udført: Ny hovedledning 5x16mm² fra kælder til 4. sal. Ny gruppetavle pr. etage. LED trappebelysning alle etager. Alle kredsløb testet: Isolationstest OK (>500MΩ). RCD-test alle 30mA OK (udløsningstid <30ms). Bemærkninger: Gammel aluminiumsledning i opgang B fjernet og erstattet. Kunde godkendt: Karen Holm [underskrift].", metadata: { fileName: "Afleveringsprotokol_Vestegnen_A-C.pdf", author: "Mikkel Rasmussen", lastModified: new Date(Date.now() - 3 * 86400000).toISOString() } },

    // ── CALENDAR NOTES (reveal meeting patterns and reporting structure) ──
    { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 0, content: "Morgenmøde — Boltly kontor. Deltagere: Lars Bolt, Mikkel Rasmussen, Sofie Jensen, Emil Madsen, Trine Holst. Ugentlig gennemgang: projektstatus, ugens plan, materialer. Kl 07:15-07:45.", metadata: { title: "Ugentligt morgenmøde", attendees: ["lars@boltly.dk", "mikkel@boltly.dk", "sofie@boltly.dk", "emil@boltly.dk", "trine@boltly.dk"], recurring: true, date: new Date().toISOString() } },
    { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 7, content: "Morgenmøde — Boltly kontor. Status: Vestegnen fase 1 næsten færdig. Mikkel rapporterer at opgang C mangler test af nødbelysning. Sofie rejser nye brandkrav. Lars beslutter at kontakte Karen om ekstra budget.", metadata: { title: "Ugentligt morgenmøde", attendees: ["lars@boltly.dk", "mikkel@boltly.dk", "sofie@boltly.dk", "emil@boltly.dk", "trine@boltly.dk"], recurring: true, date: new Date(Date.now() - 7 * 86400000).toISOString() } },
    { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 5, content: "Lars + Mikkel 1:1. Gennemgang af Emils fremgang. Mikkel: Emil gør det godt med kabelføring men skal have mere erfaring med tavlearbejde. Plan: Emil arbejder med tavleinstallation i opgang D under Mikkels opsyn.", metadata: { title: "Lars + Mikkel 1:1", attendees: ["lars@boltly.dk", "mikkel@boltly.dk"], date: new Date(Date.now() - 5 * 86400000).toISOString() } },
    { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 3, content: "Kundemøde: Hansen & Larsen — Café Nørrebro. Lars + Thomas Hansen. Gennemgang af el-specifikation for caféens køkkeninstallation. Diskussion om belastningsberegning — Thomas sender opdaterede tegninger.", metadata: { title: "Café Nørrebro el-spec gennemgang", attendees: ["lars@boltly.dk", "thomas@hl-arkitekter.dk"], date: new Date(Date.now() - 3 * 86400000).toISOString() } },
    { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 1, content: "Lars + Trine — Økonomi. Gennemgang af forfaldne fakturaer. Skovgaard betaler denne uge (ERP-problem). Vestegnen stadig uafklaret — Trine følger op. Diskussion om cash flow: vi skal have betaling fra Vestegnen inden vi køber materialer til fase 3.", metadata: { title: "Lars + Trine økonomi-gennemgang", attendees: ["lars@boltly.dk", "trine@boltly.dk"], date: new Date(Date.now() - 1 * 86400000).toISOString() } },
    { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 14, content: "Morgenmøde — Boltly kontor. Plan for uge 12: Mikkel + Sofie + Emil på Vestegnen mandag-torsdag. Sofie hos Skovgaard fredag (årlig gennemgang ejendom 2). Trine booker Sixt-bil til Sofie onsdag.", metadata: { title: "Ugentligt morgenmøde", attendees: ["lars@boltly.dk", "mikkel@boltly.dk", "sofie@boltly.dk", "emil@boltly.dk", "trine@boltly.dk"], recurring: true, date: new Date(Date.now() - 14 * 86400000).toISOString() } },
    { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 2, content: "Nygade Center besigtigelse. Lars + Martin Dall. Gennemgang af nuværende nødbelysning og brandmyndighedernes krav. Lars tager Emil med som læringsmulighed.", metadata: { title: "Nygade Center — besigtigelse nødbelysning", attendees: ["lars@boltly.dk", "martin@nygade-center.dk"], date: new Date(Date.now() - 2 * 86400000).toISOString() } },
    { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 12, content: "Mikkel + Emil fredag-evaluering. Gennemgang af Emils lærerapporter fra ugen. RCD-test demonstration. Emil skal øve isolationstest selvstændigt næste uge under opsyn.", metadata: { title: "Mikkel + Emil fredag evaluering", attendees: ["mikkel@boltly.dk", "emil@boltly.dk"], recurring: true, date: new Date(Date.now() - 12 * 86400000).toISOString() } },
  ],

  // ── Activity Signals ─────────────────────────────────────────────
  // These create the email/calendar patterns the agents query.
  activitySignals: [
    // Email patterns — Lars (heavy email, internal + external)
    ...[1,2,3,4,5,6,7,8,9,10,11,12,14,16,18,20,22,25,28].map(d => ({ signalType: "email_sent", actorEmail: "lars@boltly.dk", daysAgo: d, metadata: { count: 3 } })),
    ...[1,2,3,4,5,6,7,8,10,12,14,16,18,20,22,25,28].map(d => ({ signalType: "email_received", actorEmail: "lars@boltly.dk", daysAgo: d, metadata: { count: 5 } })),

    // Trine (admin email — invoices, scheduling, suppliers)
    ...[1,2,3,5,6,8,10,12,15,18,20,22,25,28].map(d => ({ signalType: "email_sent", actorEmail: "trine@boltly.dk", daysAgo: d, metadata: { count: 4 } })),
    ...[1,3,5,6,8,10,12,15,18,22,25,28].map(d => ({ signalType: "email_received", actorEmail: "trine@boltly.dk", daysAgo: d, metadata: { count: 3 } })),

    // Mikkel (moderate email — mostly project comms)
    ...[2,4,7,10,14,18,22,25,28].map(d => ({ signalType: "email_sent", actorEmail: "mikkel@boltly.dk", daysAgo: d, metadata: { count: 2 } })),
    ...[2,5,7,12,15,20,25].map(d => ({ signalType: "email_received", actorEmail: "mikkel@boltly.dk", daysAgo: d })),

    // Sofie (light email — field worker)
    ...[3,9,15,22].map(d => ({ signalType: "email_sent", actorEmail: "sofie@boltly.dk", daysAgo: d })),
    ...[3,8,14,20].map(d => ({ signalType: "email_received", actorEmail: "sofie@boltly.dk", daysAgo: d })),

    // Emil (minimal email — apprentice)
    ...[5,12,19,26].map(d => ({ signalType: "email_sent", actorEmail: "emil@boltly.dk", daysAgo: d })),
    ...[4,11,18,25].map(d => ({ signalType: "email_received", actorEmail: "emil@boltly.dk", daysAgo: d })),

    // Meeting patterns — weekly all-hands
    ...[0,7,14,21,28].map(d => ({ signalType: "meeting_held", actorEmail: "lars@boltly.dk", targetEmails: ["mikkel@boltly.dk", "sofie@boltly.dk", "emil@boltly.dk", "trine@boltly.dk"], daysAgo: d, metadata: { title: "Ugentligt morgenmøde", recurring: true } })),

    // 1:1s — Lars + Mikkel (biweekly, suggesting reporting line)
    ...[5,19].map(d => ({ signalType: "meeting_held", actorEmail: "lars@boltly.dk", targetEmails: ["mikkel@boltly.dk"], daysAgo: d, metadata: { title: "Lars + Mikkel 1:1" } })),

    // 1:1s — Lars + Trine (weekly, finance/admin)
    ...[1,8,15,22].map(d => ({ signalType: "meeting_held", actorEmail: "lars@boltly.dk", targetEmails: ["trine@boltly.dk"], daysAgo: d, metadata: { title: "Lars + Trine økonomi" } })),

    // Mikkel + Emil (weekly apprentice eval)
    ...[5,12,19,26].map(d => ({ signalType: "meeting_held", actorEmail: "mikkel@boltly.dk", targetEmails: ["emil@boltly.dk"], daysAgo: d, metadata: { title: "Mikkel + Emil evaluering", recurring: true } })),

    // External meetings
    { signalType: "meeting_held", actorEmail: "lars@boltly.dk", targetEmails: ["thomas@hl-arkitekter.dk"], daysAgo: 3, metadata: { title: "Café Nørrebro el-spec" } },
    { signalType: "meeting_held", actorEmail: "lars@boltly.dk", targetEmails: ["martin@nygade-center.dk"], daysAgo: 2, metadata: { title: "Nygade besigtigelse" } },
  ],
};

export default BOLTLY;
