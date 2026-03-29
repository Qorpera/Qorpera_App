// ── Boltly ApS — Story Content ──────────────────────────────────────────
// ~80 hand-written content items covering 11 story threads.
// All content is natural Danish business language.

import type { SyntheticContent } from "../../synthetic-types";

function daysAgoDate(d: number): string {
  return new Date(Date.now() - d * 86400000).toISOString();
}

export const BOLTLY_STORIES: SyntheticContent[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // Thread 1 — Vestegnen Blok 7 renovation (~12 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Lars → Karen: project kickoff confirmation
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 45, content: "Hej Karen, vi er klar til at starte på blok 7 som aftalt. Mikkel leder holdet med Sofie og Emil. Vi begynder med opgangene A-C i uge 10 og regner med at afslutte fase 1 inden påske. Materialer er bestilt hos EL-Grossisten. Ring endelig hvis I har spørgsmål. Vh Lars Bolt, Boltly ApS", metadata: { from: "lars@boltly.dk", to: "karen@vestegnens-bolig.dk", subject: "Vestegnen Blok 7 — opstart uge 10", date: daysAgoDate(45) } },

  // Lars → team: safety briefing before fieldwork
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Mikkel og Sofie — husk sikkerhedsbriefing fredag kl 7:30 inden I kører ud til Vestegnen. Der er nye brandkrav for trappebelysning i blok 7 som vi skal gennemgå. Emil, du deltager også — god læringsmulighed. Lars", metadata: { from: "lars@boltly.dk", to: "mikkel@boltly.dk", cc: "sofie@boltly.dk, emil@boltly.dk", subject: "Sikkerhedsbriefing fredag", date: daysAgoDate(3) } },

  // Mikkel → Lars: phase 1 completion
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 14, content: "Lars, installationen i blok 7 opgangene A-C er færdig. Sofie og jeg har testet alle kredsløb — alt godkendt. Emil hjalp med kabelføring og gjorde det rigtig godt. Opgangene D-F starter mandag. Vi mangler 50m kabel mere — Trine bestiller hos EL-Grossisten.", metadata: { from: "mikkel@boltly.dk", to: "lars@boltly.dk", subject: "Vestegnen blok 7 — status opgang A-C", date: daysAgoDate(14) } },

  // Sofie → Lars: new fire safety requirements (scope change)
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 10, content: "Lars, jeg har gennemgået brandkravene for trappebelysning — det kræver selvforsynende nødbelysning med 3 timers backup i alle opgange. Det er en ændring fra det originale projekt. Ekstra materiale til ca. 18.000 DKK. Skal jeg opdatere tilbuddet?", metadata: { from: "sofie@boltly.dk", to: "lars@boltly.dk", subject: "Vestegnen — nye brandkrav trappebelysning", date: daysAgoDate(10) } },

  // Lars → Karen: scope change notification
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 9, content: "Hej Karen, brandmyndighederne har opdateret kravene for trappebelysning i boligblokke. Vi skal installere selvforsynende nødbelysning med 3 timers batteribackup i alle 6 opgange. Det giver en ekstraregning på ca. 18.000 DKK. Jeg sender et opdateret tilbud i morgen. Vh Lars", metadata: { from: "lars@boltly.dk", to: "karen@vestegnens-bolig.dk", subject: "RE: Vestegnen Blok 7 — nye brandkrav", date: daysAgoDate(9) } },

  // Mikkel → Lars: phase 2 update — Kasper replaces Emil
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 5, content: "Lars, fase 2 kører planmæssigt. Kasper er kommet godt ind i det — han har erfaring med lignende opgange fra sin tid hos ElTek. Emil er på skoleperiode de næste 4 uger, så Kasper overtager hans del. Vi er færdige med opgang D og starter E i morgen.", metadata: { from: "mikkel@boltly.dk", to: "lars@boltly.dk", subject: "Vestegnen blok 7 — fase 2 status", date: daysAgoDate(5) } },

  // Afleveringsprotokol for fase 1
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 13, content: "Afleveringsprotokol — Vestegnen Blok 7, Opgang A-C. Dato: marts 2026. Udført af: Mikkel Rasmussen, Sofie Jensen. Lærling: Emil Madsen. Arbejde udført: Ny hovedledning 5x16mm² fra kælder til 4. sal. Ny gruppetavle pr. etage. LED trappebelysning alle etager. Alle kredsløb testet: Isolationstest OK (>500MΩ). RCD-test alle 30mA OK (udløsningstid <30ms). Bemærkninger: Gammel aluminiumsledning i opgang B fjernet og erstattet. Kunde godkendt: Karen Holm.", metadata: { fileName: "Afleveringsprotokol_Vestegnen_A-C.pdf", author: "Mikkel Rasmussen", lastModified: daysAgoDate(13) } },

  // Project plan (Drive doc)
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 7, content: "Vestegnen Blok 7 — Projektplan. Kunde: Vestegnens Boligforening. Kontakt: Karen Holm. Samlet budget: 340.000 DKK. Fase 1 (uge 10-11): Opgang A-C, ny hovedledning + tavle + LED trappebelysning. Ansvarlig: Mikkel + Sofie. Fase 2 (uge 13-14): Opgang D-F, samme scope. Ansvarlig: Mikkel + Emil. Fase 3 (uge 16): Nødbelysning alle opgange (NYT KRAV — tilføjet efter brandmyndighedsinspektion). Ansvarlig: Sofie. Status: Fase 1 færdig, fase 2 starter mandag.", metadata: { fileName: "Vestegnen_Blok7_projektplan.xlsx", author: "Lars Bolt", lastModified: daysAgoDate(7) } },

  // Calendar: Vestegnen status meeting
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 6, content: "Vestegnen statusmøde med Karen Holm. Lars, Mikkel og Karen deltager. Gennemgang af fase 1 aflevering og planlægning af fase 2. Karen godkender ekstrabudget til nødbelysning. Diskussion om tidsplan for fase 3.", metadata: { title: "Vestegnen blok 7 — statusmøde", attendees: ["lars@boltly.dk", "mikkel@boltly.dk", "karen@vestegnens-bolig.dk"], date: daysAgoDate(6) } },

  // Trine → EL-Grossisten: material order for phase 2
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 12, content: "Hej Bent, kan du sende et tilbud på 200m 5x2.5mm² NYM-kabel og 30 stk LED-downlights til Vestegnen-projektet? Vi skal bruge det inden uge 15. Tak, Trine", metadata: { from: "trine@boltly.dk", to: "bent@el-grossisten.dk", subject: "Materialebestilling — Vestegnen blok 7", date: daysAgoDate(12) } },

  // Emil → Mikkel: apprentice report
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 16, content: "Mikkel, her er min lærerapport for tirsdag: Arbejdede med kabelføring i opgang B. Trak 3x NYM 5x2.5 fra kælder til 4. sal. Brugte korrekt aflastning ved hvert etagegennemføring. Spørgsmål: Hvornår bruger man NOIKLX i stedet for NYM? Og kan du vise mig fejlsøgning på RCD'er fredag?", metadata: { from: "emil@boltly.dk", to: "mikkel@boltly.dk", subject: "Lærerapport tirsdag — opgang B kabelføring", date: daysAgoDate(16) } },

  // Karen → Lars: budget approval
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 8, content: "Hej Lars, bestyrelsen har godkendt ekstrabudgettet på 18.000 DKK til nødbelysning. Send venligst et opdateret tilbud som vi kan underskrive. Vi vil gerne have det hele færdigt inden sommerferien. Mvh Karen Holm", metadata: { from: "karen@vestegnens-bolig.dk", to: "lars@boltly.dk", subject: "RE: Vestegnen Blok 7 — nye brandkrav", direction: "received", date: daysAgoDate(8) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 2 — Rødovre Tandklinik LED project (~6 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Lars → Anne: original quote
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 4, content: "Kære Anne Thorsen, hermed tilbud på LED-renovering af Rødovre Tandklinik. Tilbuddet dækker udskiftning af 42 lysstofrør til LED-paneler i behandlingsrum og venteværelse plus ny el-tavle. Samlet pris: 85.000 DKK ex. moms. Udførelse: 2 dage, planlagt i uge 16. Vi sørger for minimal forstyrrelse af klinikdrift. Venlig hilsen, Lars Bolt", metadata: { from: "lars@boltly.dk", to: "anne@roedovre-tand.dk", subject: "Tilbud: LED-renovering Rødovre Tandklinik", date: daysAgoDate(4) } },

  // Anne → Lars: acceptance
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 2, content: "Lars, vi har godkendt tilbuddet på LED-renovering. Hvornår kan I starte? Vi foretrækker en mandag så vi kan flytte patienter til tirsdag. Anne Thorsen, Rødovre Tandklinik", metadata: { from: "anne@roedovre-tand.dk", to: "lars@boltly.dk", subject: "RE: Tilbud: LED-renovering Rødovre Tandklinik", direction: "received", date: daysAgoDate(2) } },

  // Lars → Trine + Thomas.K: internal scheduling
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 1, content: "Trine — Anne har godkendt tandklinik-tilbuddet. Kan du booke Sofie og Frederik til mandag-tirsdag i uge 16? Thomas.K — bestil 42 stk LED-paneler 600x600 og en 3-faset gruppetavle 12-modul hos EL-Grossisten. Vi har brug for det torsdag i uge 15 senest. Lars", metadata: { from: "lars@boltly.dk", to: "trine@boltly.dk", cc: "thomas.k@boltly.dk", subject: "Tandklinik LED — planlægning og materialer", date: daysAgoDate(1) } },

  // Thomas.K → Bent: material order
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 1, content: "Hej Bent, vi har brug for følgende til levering senest torsdag uge 15: 42 stk LED-paneler 600x600 4000K (de samme som sidst), 1 stk 3-faset gruppetavle 12-modul, tilhørende automatsikringer og RCD'er. Kan du bekræfte levering? Venlig hilsen, Thomas Kjær, Boltly ApS", metadata: { from: "thomas.k@boltly.dk", to: "bent@el-grossisten.dk", subject: "Materialebestilling — Rødovre Tandklinik", date: daysAgoDate(1) } },

  // Calendar: LED installation planning
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 1, content: "Planlægningsmøde — Tandklinik LED-projekt. Lars gennemgår projektomfang med Sofie og Frederik. Materialer ankommer torsdag. Installation mandag-tirsdag uge 16. Sofie tager behandlingsrum, Frederik tager venteværelse og fællesarealer.", metadata: { title: "Tandklinik LED — planlægning", attendees: ["lars@boltly.dk", "sofie@boltly.dk", "frederik@boltly.dk"], date: daysAgoDate(1) } },

  // Trine → Anne: scheduling confirmation
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 0, content: "Kære Anne, vi har planlagt LED-installationen til mandag-tirsdag i uge 16. Vores hold (Sofie og Frederik) møder kl 7:00 for at starte inden klinikkens åbningstid. Vi sørger for at dække møbler og udstyr. Er der adgang via bagindgangen? Venlig hilsen, Trine Holst, Boltly ApS", metadata: { from: "trine@boltly.dk", to: "anne@roedovre-tand.dk", subject: "RE: LED-renovering — tidsplan bekræftet", date: daysAgoDate(0) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 3 — Skovgaard overdue payment (~6 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Trine → Karen (Vestegnen): payment reminder
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 4, content: "Hej Karen, dette er en venlig påmindelse om at faktura INV-2026-035 på 87.000 DKK forfaldt den 10. marts. Kan du bekræfte hvornår vi kan forvente betaling? Venlig hilsen, Trine Holst, Boltly ApS", metadata: { from: "trine@boltly.dk", to: "karen@vestegnens-bolig.dk", subject: "Betalingspåmindelse: INV-2026-035", date: daysAgoDate(4) } },

  // Trine → Peter: overdue reminder
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 10, content: "Hej Peter, faktura INV-2026-033 på 15.800 DKK er nu 8 dage over forfald. Kan du bekræfte status? Du plejer altid at betale rettidigt, så vi ville bare sikre os at fakturaen ikke er gået tabt. Venlig hilsen, Trine", metadata: { from: "trine@boltly.dk", to: "peter@skovgaard-ejendomme.dk", subject: "Betalingspåmindelse: INV-2026-033", date: daysAgoDate(10) } },

  // Peter → Trine: ERP excuse
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 8, content: "Hej Trine, beklager den sene betaling af INV-2026-033. Vi har haft et ERP-skifte og betalingerne er forsinket. Betaler i denne uge. Vh Peter", metadata: { from: "peter@skovgaard-ejendomme.dk", to: "trine@boltly.dk", subject: "RE: Betalingspåmindelse INV-2026-033", direction: "received", date: daysAgoDate(8) } },

  // Trine → Lars: financial overview
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Lars, her er overblikket for marts: Vi har 3 åbne fakturaer for samlet 102.800 DKK. INV-2026-033 (Skovgaard, 15.800 DKK) er 8 dage over forfald — Peter siger ERP-skifte, betaler i denne uge. INV-2026-035 (Vestegnen, 87.000 DKK) er 4 dage over forfald — venter på svar fra Karen. INV-2026-034 (Café Nørrebro, 8.500 DKK) er sendt men ikke forfalden endnu.", metadata: { from: "trine@boltly.dk", to: "lars@boltly.dk", subject: "Økonomioverblik marts", date: daysAgoDate(3) } },

  // Lars → Trine: payment follow-up
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 2, content: "Trine, kan du sende en påmindelse til Vestegnens Boligforening om INV-2026-035? Den er nu 4 dage over forfald. Beløbet er 87.000 DKK og det er for fase 2 af blok 7-renoveringen. Ring til Karen Holm hvis de ikke svarer inden onsdag.", metadata: { from: "lars@boltly.dk", to: "trine@boltly.dk", subject: "Påmindelse: Vestegnen faktura", date: daysAgoDate(2) } },

  // Lars → Trine: late payment pattern concern
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 2, content: "Trine, en ting mere — hold øje med Skovgaard. Peter sagde ERP-skifte, men det er tredje gang i år de betaler sent. Lad os snakke om det ved næste økonomimøde. Måske skal vi overveje at ændre betalingsbetingelserne for dem. Lars", metadata: { from: "lars@boltly.dk", to: "trine@boltly.dk", subject: "RE: Økonomioverblik marts — Skovgaard", date: daysAgoDate(2) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 4 — Nygade Center emergency (~5 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Martin → Lars: urgent power outage
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 1, content: "Hej Lars, vi har en akut situation — en af vores butikker i Nygade Center har haft strømsvigt i hele butikken siden i morges. Kan I sende nogen ud i dag? Vi mister omsætning for hver time. Ring mig på 26 88 11 03. Mvh Martin Dall", metadata: { from: "martin@nygade-center.dk", to: "lars@boltly.dk", subject: "HASTER: Strømsvigt Nygade Center butik 14", direction: "received", date: daysAgoDate(1) } },

  // Lars → Mikkel + Frederik: forwarding emergency
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 1, content: "Mikkel / Frederik — akut opkald fra Nygade Center, butik 14 har totalt strømsvigt. Hvem af jer kan køre derud inden kl 11? Tag fejlfindingsudstyr med — lyder som hovedsikring eller tavlefejl. Lars", metadata: { from: "lars@boltly.dk", to: "mikkel@boltly.dk", cc: "frederik@boltly.dk", subject: "FW: HASTER: Strømsvigt Nygade Center butik 14", date: daysAgoDate(1) } },

  // Frederik → Lars: availability response
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 1, content: "Lars, jeg er færdig hos Skovgaard kl 10 — kan være ved Nygade kl 10:30. Tager tangamperemeter og termografikamera med. Frederik", metadata: { from: "frederik@boltly.dk", to: "lars@boltly.dk", subject: "RE: FW: HASTER: Strømsvigt Nygade Center butik 14", date: daysAgoDate(1) } },

  // Calendar: emergency visit
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 1, content: "AKUT: Nygade Center butik 14 — strømsvigt. Frederik kører derud kl 10:30 efter Skovgaard-opgaven. Kontakt: Martin Dall, 26 88 11 03. Fejlfinding og udbedring.", metadata: { title: "AKUT: Nygade Center — strømsvigt", attendees: ["frederik@boltly.dk", "lars@boltly.dk"], date: daysAgoDate(1) } },

  // Frederik → Lars: post-visit update (Slack)
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 0, content: "Lars — Nygade er fikset. Det var en 63A hovedsikring der var gået. Har skiftet den og tjekket resten af tavlen. Martin var lettet. Jeg skriver rapport i morgen.", metadata: { channel: "general", authorEmail: "frederik@boltly.dk", authorName: "Frederik Møller" } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 5 — Grøn Energi solar partnership (~6 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Lise → Lars: solar opportunity
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 7, content: "Hej Lars, kan vi mødes i næste uge og drøfte et solcelleprojekt? Vi har en boligforening der vil installere solceller på 6 boligblokke og har brug for en el-partner til tilslutning og sikringsinstallation. Det er en stor opgave — estimeret 500-800.000 DKK i el-arbejde. Vh Lise Grøn", metadata: { from: "lise@groen-energi.dk", to: "lars@boltly.dk", subject: "Solcelleprojekt — samarbejdsmulighed", direction: "received", date: daysAgoDate(7) } },

  // Lars → Lise: interested reply
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 6, content: "Hej Lise, det lyder rigtig spændende — vi har det som mål i vores forretningsplan at udvide til solcelle-installation i 2026. Kan vi mødes torsdag kl 10? Jeg tager min bror Henrik med — han koordinerer vores større projekter. Vh Lars", metadata: { from: "lars@boltly.dk", to: "lise@groen-energi.dk", subject: "RE: Solcelleprojekt — samarbejdsmulighed", date: daysAgoDate(6) } },

  // Lars → Henrik: internal coordination
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 6, content: "Henrik, vi har en stor mulighed med Grøn Energi — et solcelleprojekt på 500-800K i el-arbejde. Kan du deltage i mødet torsdag kl 10? Vi skal have en vurdering af om vi kan håndtere det kapacitetsmæssigt. Det kræver nok en ekstra svend. Lars", metadata: { from: "lars@boltly.dk", to: "henrik@boltly.dk", subject: "Grøn Energi solcelleprojekt — møde torsdag", date: daysAgoDate(6) } },

  // Drive doc: rough scope notes
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 4, content: "Solcelleprojekt — Grøn Energi / Boltly. Foreløbige noter fra møde med Lise Grøn. Omfang: 6 boligblokke, ca. 120 lejligheder. El-arbejde: Tilslutning af invertere til gruppetavler. Nye sikringsgrupper per blok. Kabelføring fra taginstallation til kælder. Tidsestimat: 6-8 uger med 2 svende. Udfordringer: Vi mangler erfaring med solcelle-tilslutning — Grøn Energi kan uddanne. Behov for ELOT-certificering til AC/DC koblingspunkt. Budget: El-andel 500-800K afhængig af kabelføringsforhold. Næste skridt: Henrik udarbejder detaljeret kapacitetsplan.", metadata: { fileName: "Solcelleprojekt_Groen_Energi_noter.docx", author: "Lars Bolt", lastModified: daysAgoDate(4) } },

  // Calendar: meeting with Grøn Energi
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 4, content: "Møde med Grøn Energi Rådgivning om solcelleprojekt. Lars og Henrik deltager fra Boltly. Lise og Camilla fra Grøn Energi. Gennemgang af projektomfang, certificeringskrav og tidsplan. Positiv stemning — aftale om at sende detaljeret tilbud inden uge 16.", metadata: { title: "Solcelleprojekt — møde Grøn Energi", attendees: ["lars@boltly.dk", "henrik@boltly.dk", "lise@groen-energi.dk", "camilla@groen-energi.dk"], date: daysAgoDate(4) } },

  // Henrik → Lars: capacity assessment
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Lars, jeg har lavet et overslag over kapaciteten. Med Vestegnen fase 3 i uge 16 og tandklinikken samme uge er vi presset. Solcelleprojektet kræver 2 svende i 6-8 uger — vi kan tidligst starte i maj hvis vi ansætter. Alternativt kan vi tage det i etaper hen over sommeren. Lad os drøfte det ved morgenmødet i morgen. Henrik", metadata: { from: "henrik@boltly.dk", to: "lars@boltly.dk", subject: "RE: Grøn Energi — kapacitetsvurdering", date: daysAgoDate(3) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 6 — Kasper onboarding friction (~8 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Lars → all: Kasper introduction
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 55, content: "Kære alle, jeg er glad for at kunne meddele at Kasper Holm starter hos os på mandag. Kasper er uddannet elinstallatør og kommer fra ElTek Sjælland hvor han har arbejdet i 4 år. Han har erfaring med boliginstallationer og vil primært arbejde sammen med Mikkel og Sofie på de større projekter. Kasper sidder i kontoret de første par dage for introduktion. Byd ham velkommen! Lars", metadata: { from: "lars@boltly.dk", to: "mikkel@boltly.dk", cc: "sofie@boltly.dk, trine@boltly.dk, emil@boltly.dk, henrik@boltly.dk, frederik@boltly.dk, ida@boltly.dk", subject: "Ny kollega: Kasper Holm starter mandag", date: daysAgoDate(55) } },

  // Mikkel → Sofie (Slack): mild frustration
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 45, content: "Sofie — har du set at Kasper trækker kabler uden aflastning? Han siger det var sådan de gjorde det hos ElTek. Jeg sagde han skal følge vores procedure men han virker lidt... selvstændig 😬", metadata: { channel: "kontoret", authorEmail: "mikkel@boltly.dk", authorName: "Mikkel Rasmussen" } },

  // Kasper (Slack): asking questions that show different methods
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 42, content: "Hej alle — hos ElTek brugte vi altid NYY i stedet for NYM til kælderinstallationer. Er der en grund til at I bruger NYM her? Spørger bare fordi NYY er billigere og holder lige så længe 🤔", metadata: { channel: "general", authorEmail: "kasper@boltly.dk", authorName: "Kasper Holm" } },

  // Mikkel (Slack): response
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 42, content: "Kasper — vi bruger NYM fordi det er nemmere at arbejde med i snævre kabelkanaler. Lars har testet begge dele og valgt NYM som standard. Det står i kvalitetssikringsproceduren 👍", metadata: { channel: "general", authorEmail: "mikkel@boltly.dk", authorName: "Mikkel Rasmussen" } },

  // Emil → Mikkel: confusion about Kasper's approach
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 38, content: "Mikkel, jeg er lidt forvirret. Kasper viste mig en anden måde at teste RCD'er på i dag som er hurtigere end det du har lært mig. Hvem skal jeg følge? Jeg vil gerne gøre det rigtigt men vil ikke fornærme nogen. Emil", metadata: { from: "emil@boltly.dk", to: "mikkel@boltly.dk", subject: "RCD-test — Kaspers metode vs. vores?", date: daysAgoDate(38) } },

  // Mikkel → Emil: clear direction
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 37, content: "Emil, god at du spørger. Følg altid vores procedure — den står i kvalitetssikringsdokumentet. Kaspers metode er ikke forkert, men vores er mere grundig og den vi dokumenterer. Jeg tager en snak med Kasper om det. Mikkel", metadata: { from: "mikkel@boltly.dk", to: "emil@boltly.dk", subject: "RE: RCD-test — Kaspers metode vs. vores?", date: daysAgoDate(37) } },

  // Calendar: Lars + Mikkel 1:1 about Kasper
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 35, content: "Lars + Mikkel 1:1. Hovedpunkt: Kasper-integration. Mikkel: Kasper er dygtig men gør ting anderledes end vores standarder. Har haft 2-3 situationer hvor han bruger ElTek-metoder. Emil er forvirret. Lars: Tal med Kasper — anerkend hans erfaring men forklar at vi har standardiserede procedurer af en grund. Giv ham kvalitetssikringsdokumentet.", metadata: { title: "Lars + Mikkel 1:1", attendees: ["lars@boltly.dk", "mikkel@boltly.dk"], date: daysAgoDate(35) } },

  // Mikkel (Slack): more recent, things improving
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 15, content: "Kasper gør det godt på Vestegnen — han har fundet sin plads og følger procedurerne nu. Faktisk kom han med et godt forslag til kabelføring i opgang D som sparede os en halv dag 👏", metadata: { channel: "kontoret", authorEmail: "mikkel@boltly.dk", authorName: "Mikkel Rasmussen" } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 7 — Autorisation renewal (~3 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Sikkerhedsstyrelsen → Lars: renewal reminder
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 0, content: "Kære Lars Bolt, dette er en påmindelse fra Sikkerhedsstyrelsen om at jeres autorisationscertifikat udløber om 60 dage (30. maj 2026). Fornyelse kræver indsendelse af opdateret dokumentation. Se vedhæftet vejledning.", metadata: { from: "noreply@sikkerhedsstyrelsen.dk", to: "lars@boltly.dk", subject: "Påmindelse: Autorisationsfornyelse — Boltly ApS", direction: "received", date: daysAgoDate(0) } },

  // Lars → Trine: forwarding renewal task
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 0, content: "Trine, kan du sætte gang i fornyelsen af vores autorisation? Den udløber 30. maj. Vi skal bruge opdateret forsikringsdokumentation og liste over alle ansatte med autorisationer. Anja kan hjælpe med at samle papirerne. Lars", metadata: { from: "lars@boltly.dk", to: "trine@boltly.dk", subject: "FW: Påmindelse: Autorisationsfornyelse — Boltly ApS", date: daysAgoDate(0) } },

  // Drive doc: outdated certification
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 180, content: "Boltly ApS — Autorisationsdokumentation. Autorisationsnummer: EL-2024-48291. Gyldig fra: 1. juni 2024. Udløber: 30. maj 2026. Autoriseret installatør: Lars Bolt. Ansvarlig for el-tilsyn: Lars Bolt. Forsikring: Tryg Erhverv, policenr. 847291-03. Ansatte med relevante certifikater: Lars Bolt (autoriseret installatør), Mikkel Rasmussen (svend), Jens Petersen (svend), Sofie Jensen (svend). BEMÆRK: Dette dokument skal opdateres ved personaleændringer.", metadata: { fileName: "Autorisation_Boltly_2024.pdf", author: "Lars Bolt", lastModified: daysAgoDate(180) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 8 — Cash flow pressure (~5 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Trine → Lars: cash flow concern
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Lars, samlet har vi 102.800 DKK i udestående fordelt på 3 fakturaer. Vores kassebeholdning er nede på 78.000 DKK. EL-Grossisten har sendt en materialeregning på 45.000 DKK for Vestegnen fase 2 med forfald om 10 dage. Hvis Skovgaard og Vestegnen ikke betaler inden da, bliver det stramt. Skal vi vente med at bestille materialer til fase 3?", metadata: { from: "trine@boltly.dk", to: "lars@boltly.dk", subject: "Likviditet — marts 2026", date: daysAgoDate(3) } },

  // Lars → Trine: response
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 2, content: "Trine, ja lad os vente med materialer til fase 3 til vi har fået betaling fra Vestegnen. Peter siger Skovgaard betaler denne uge — hold øje med det. Hvis Vestegnen ikke betaler inden fredag ringer jeg selv til Karen. Vi kan ikke tåle at lægge ud for mere lige nu. Lars", metadata: { from: "lars@boltly.dk", to: "trine@boltly.dk", subject: "RE: Likviditet — marts 2026", date: daysAgoDate(2) } },

  // Calendar: Lars + Trine weekly finance
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 1, content: "Lars + Trine — Økonomi. Gennemgang af forfaldne fakturaer. Skovgaard betaler denne uge (ERP-problem). Vestegnen stadig uafklaret — Trine følger op. Diskussion om cash flow: vi skal have betaling fra Vestegnen inden vi køber materialer til fase 3. Anja tjekker momsindberetning for Q1.", metadata: { title: "Lars + Trine økonomi-gennemgang", attendees: ["lars@boltly.dk", "trine@boltly.dk"], date: daysAgoDate(1) } },

  // Anja → Trine (Slack): bookkeeping question
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 2, content: "Trine — jeg har fundet 3 posteringer i e-conomic fra februar som ikke matcher bankudtoget. Det er småbeløb (under 500 DKK) men vi skal have dem afstemt inden momsindberetningen. Kan vi kigge på det tirsdag?", metadata: { channel: "kontoret", authorEmail: "anja@boltly.dk", authorName: "Anja Nielsen" } },

  // Trine → Anja: response
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 2, content: "Ja, lad os tage det tirsdag. Sæt gerne et ark op i Drive med posteringsnumrene så jeg kan tjekke inden. Tak Anja 👍", metadata: { channel: "kontoret", authorEmail: "trine@boltly.dk", authorName: "Trine Holst" } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 9 — Departed employee Jens (~5 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Jens → Peter: old client email (when Jens was active)
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 85, content: "Hej Peter, den årlige gennemgang af Brønshøj-ejendommene er planlagt til uge 4. Jeg checker stikledninger, tavler og RCD'er i alle 3 ejendomme som sædvanlig. Ring hvis der er noget specifikt I vil have mig til at kigge på. Vh Jens Petersen, Boltly ApS", metadata: { from: "jens@boltly.dk", to: "peter@skovgaard-ejendomme.dk", subject: "Årlig elgennemgang — Brønshøj ejendomme", date: daysAgoDate(85) } },

  // Jens → Lars: internal status (old)
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 82, content: "Lars, Brønshøj-gennemgangen er afsluttet. Ejendom 1 og 3 ser fine ud. Ejendom 2 har en gammel aluminiumsledning i kælderen som bør udskiftes — ikke akut men bør planlægges i år. Jens", metadata: { from: "jens@boltly.dk", to: "lars@boltly.dk", subject: "Brønshøj gennemgang — afsluttet", date: daysAgoDate(82) } },

  // Jens: Drive doc authored by Jens
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 88, content: "Servicerapport — Skovgaard Ejendomme, Brønshøj. Inspektør: Jens Petersen, Boltly ApS. Dato: januar 2026. Ejendom 1 (Brønshøjvej 12): Alle kredsløb OK, RCD'er testet og godkendt. Ejendom 2 (Brønshøjvej 14): Gammel 16mm² aluminiumsledning i kælder — anbefaler udskiftning inden 12 måneder. Ejendom 3 (Brønshøjvej 16): Ny LED trappebelysning installeret, alt OK. Samlet status: Tilfredsstillende med én anbefaling.", metadata: { fileName: "Servicerapport_Skovgaard_Broenshoej_jan2026.pdf", author: "Jens Petersen", lastModified: daysAgoDate(88) } },

  // Jens: farewell Slack message
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 80, content: "Tak for alt folkens, det har været en fornøjelse at arbejde sammen med jer! Jeg starter hos NCC næste uge men I kan altid ringe hvis I har spørgsmål om mine projekter. Pas på jer selv 🍻 /Jens", metadata: { channel: "general", authorEmail: "jens@boltly.dk", authorName: "Jens Petersen" } },

  // Client email CCing Jens (recent — bounces but content exists)
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Hej Jens/Lars, det er tid til den halvårlige gennemgang af ejendom 2 i Brønshøj. Jens lavede den sidste — hvem tager den denne gang? Vi vil gerne have den i uge 15. Vh Henrik Skovgaard", metadata: { from: "henrik@skovgaard-ejendomme.dk", to: "lars@boltly.dk", cc: "jens@boltly.dk", subject: "Halvårlig gennemgang — Brønshøj ejendom 2", direction: "received", date: daysAgoDate(3) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 10 — Thomas.K new sales role (~5 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Lars → all: Thomas.K announcement
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 30, content: "Hej alle, vi vokser og har brug for en dedikeret sælger/kalkulator. Thomas Kjær starter i næste uge. Thomas har 8 års erfaring fra rådgivende ingeniørfirma og kender el-branchen godt. Han overtager tilbudsgivning og nye kundehenvendelser så jeg kan fokusere på drift og de store projekter. Byd ham velkommen! Lars", metadata: { from: "lars@boltly.dk", to: "trine@boltly.dk", cc: "mikkel@boltly.dk, sofie@boltly.dk, henrik@boltly.dk, frederik@boltly.dk", subject: "Ny kollega: Thomas Kjær — sælger/kalkulator", date: daysAgoDate(30) } },

  // Thomas.K → Maria: handling new lead (Lund & Co) — formal tone
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Kære Maria Lund, tak for Deres henvendelse vedrørende el-installation på kontoret på Amagerbrogade. Vi vil med glæde udarbejde et tilbud. For at give Dem det bedste tilbud har vi brug for: 1) Plantegning over de 4 kontorer og fællesområdet, 2) Ønsker til antal stikkontakter og netværksudtag per rum, 3) Foretrukken installationsperiode. Jeg kontakter Dem telefonisk i morgen for at aftale en besigtigelse. Med venlig hilsen, Thomas Kjær, Salgskonsulent, Boltly ApS", metadata: { from: "thomas.k@boltly.dk", to: "maria@lundco.dk", subject: "RE: Forespørgsel: El-installation kontor Amagerbrogade", date: daysAgoDate(3) } },

  // Maria → Thomas.K: the original inquiry
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 5, content: "Hej Boltly, vi er ved at renovere vores kontorer på Amagerbrogade og har brug for en autoriseret elektriker til at lave ny el-installation i 4 kontorer + fællesområde. Kan I sende et tilbud? Vi vil gerne starte i april. Vh Maria Lund, Lund & Co Advokater", metadata: { from: "maria@lundco.dk", to: "lars@boltly.dk", subject: "Forespørgsel: El-installation kontor Amagerbrogade", direction: "received", date: daysAgoDate(5) } },

  // Thomas.K → Trine: CRM access request
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 25, content: "Hej Trine, kan du oprette mig som bruger i HubSpot og e-conomic? Jeg skal kunne se kundehistorik og oprette tilbud. Og kan jeg få adgang til tilbudsskabelonerne i Google Drive? Tak, Thomas", metadata: { from: "thomas.k@boltly.dk", to: "trine@boltly.dk", subject: "Adgang til CRM og tilbudsskabeloner", date: daysAgoDate(25) } },

  // Lars → Thomas.K: forwarding lead
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 5, content: "Thomas, kan du tage denne? Ny forespørgsel fra Lund & Co Advokater om kontorinstallation. Book en besigtigelse og lav et tilbud. Det er et typisk kontorprojekt — 4 rum + fælles. Lars", metadata: { from: "lars@boltly.dk", to: "thomas.k@boltly.dk", subject: "FW: Forespørgsel: El-installation kontor Amagerbrogade", date: daysAgoDate(5) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 11 — General org signals (~15 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Weekly morgenmøde #1
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 0, content: "Morgenmøde — Boltly kontor. Deltagere: Lars, Mikkel, Sofie, Emil (telefon fra skole), Trine, Henrik, Kasper, Frederik, Ida, Thomas.K. Ugentlig gennemgang: Vestegnen fase 2 snart færdig, Tandklinik starter uge 16, Nygade akutsag løst, Grøn Energi tilbud under udarbejdelse. Kl 07:15-07:45.", metadata: { title: "Ugentligt morgenmøde", attendees: ["lars@boltly.dk", "mikkel@boltly.dk", "sofie@boltly.dk", "trine@boltly.dk", "henrik@boltly.dk", "kasper@boltly.dk", "frederik@boltly.dk", "ida@boltly.dk", "thomas.k@boltly.dk"], recurring: true, date: daysAgoDate(0) } },

  // Weekly morgenmøde #2
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 7, content: "Morgenmøde — Boltly kontor. Status: Vestegnen fase 2 påbegyndt med Mikkel, Kasper og Sofie. Frederik på servicebesøg hos Skovgaard. Ida og Emil på skoleperiode. Thomas.K har fået 2 nye forespørgsler. Anja finder uoverensstemmelser i e-conomic.", metadata: { title: "Ugentligt morgenmøde", attendees: ["lars@boltly.dk", "mikkel@boltly.dk", "sofie@boltly.dk", "trine@boltly.dk", "henrik@boltly.dk", "kasper@boltly.dk", "frederik@boltly.dk", "thomas.k@boltly.dk"], recurring: true, date: daysAgoDate(7) } },

  // Weekly morgenmøde #3
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 14, content: "Morgenmøde — Boltly kontor. Plan for uge 12: Mikkel + Sofie + Emil på Vestegnen mandag-torsdag. Frederik hos Skovgaard fredag. Kasper starter på Vestegnen tirsdag efter introduktionsdag. Trine booker Sixt-bil til Sofie onsdag.", metadata: { title: "Ugentligt morgenmøde", attendees: ["lars@boltly.dk", "mikkel@boltly.dk", "sofie@boltly.dk", "emil@boltly.dk", "trine@boltly.dk", "kasper@boltly.dk", "frederik@boltly.dk", "ida@boltly.dk"], recurring: true, date: daysAgoDate(14) } },

  // Weekly morgenmøde #4
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 21, content: "Morgenmøde — Boltly kontor. Fase 1 Vestegnen næsten færdig — Mikkel mangler test af nødbelysning i opgang C. Sofie rejser nye brandkrav fra inspektion. Lars diskuterer budgetkonsekvens med Karen. Thomas.K gennemgår sit første tilbud med Lars.", metadata: { title: "Ugentligt morgenmøde", attendees: ["lars@boltly.dk", "mikkel@boltly.dk", "sofie@boltly.dk", "emil@boltly.dk", "trine@boltly.dk", "henrik@boltly.dk", "frederik@boltly.dk", "ida@boltly.dk", "thomas.k@boltly.dk"], recurring: true, date: daysAgoDate(21) } },

  // Lars + Mikkel 1:1 #1
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 5, content: "Lars + Mikkel 1:1. Gennemgang af Vestegnen status — fase 2 kører godt med Kasper. Diskussion om Emils skoleperiode og planlægning af hans tilbagevenden. Mikkel anbefaler at Ida får mere ansvar på næste projekt — hun er klar til selvstændigt tavlearbejde.", metadata: { title: "Lars + Mikkel 1:1", attendees: ["lars@boltly.dk", "mikkel@boltly.dk"], date: daysAgoDate(5) } },

  // Lars + Mikkel 1:1 #2
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 19, content: "Lars + Mikkel 1:1. Gennemgang af Emils fremgang — Mikkel: Emil gør det godt med kabelføring men skal have mere erfaring med tavlearbejde. Plan: Emil arbejder med tavleinstallation i opgang D under Mikkels opsyn. Diskussion om Kasper — bedre nu end i starten.", metadata: { title: "Lars + Mikkel 1:1", attendees: ["lars@boltly.dk", "mikkel@boltly.dk"], date: daysAgoDate(19) } },

  // Lars + Trine weekly #2
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 8, content: "Lars + Trine økonomi-gennemgang. Gennemgang af udestående fakturaer. Skovgaard har betalt INV-2026-033 — ERP-problemet er løst. Vestegnen stadig åben. Trine har sendt rykker nr. 2. Anja har fundet de manglende posteringer — småfejl i bogføringen.", metadata: { title: "Lars + Trine økonomi-gennemgang", attendees: ["lars@boltly.dk", "trine@boltly.dk"], date: daysAgoDate(8) } },

  // Mikkel + Emil apprentice eval
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 18, content: "Mikkel + Emil fredag-evaluering. Gennemgang af Emils lærerapporter fra ugen. RCD-test demonstration. Emil skal øve isolationstest selvstændigt næste uge under opsyn. God fremgang — Emil er klar til mere ansvar med kabelføring.", metadata: { title: "Mikkel + Emil fredag evaluering", attendees: ["mikkel@boltly.dk", "emil@boltly.dk"], recurring: true, date: daysAgoDate(18) } },

  // Mikkel + Ida apprentice eval
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 12, content: "Mikkel + Ida evaluering. Ida har gennemført sit tavlearbejde-modul med gode resultater. Hun kan nu selvstændigt installere gruppetavler op til 12 moduler. Næste fokus: fejlsøgning og jordfejlsmåling. Skoleperiode slutter uge 16.", metadata: { title: "Mikkel + Ida evaluering", attendees: ["mikkel@boltly.dk", "ida@boltly.dk"], date: daysAgoDate(12) } },

  // Personalehåndbog
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 60, content: "Boltly personalehåndbog 2026. Arbejdstid: 07:00-15:30, fredag 07:00-13:00. Frokost: 30 min kl 11:30. Kørsel: 3,73 DKK/km for brug af egen bil. Værktøj: Firmaet stiller el-tester, bormaskine og standard værktøj til rådighed. Sikkerhed: Alle skal bære sikkerhedssko og have gyldigt førstehjælpskursus. Lærling-specifikke regler: Daglig lærerapport obligatorisk. Altid arbejde under opsyn af svend. Aldrig arbejde på spændingsførende installationer. Ferieplan: 3 ugers sommerferie (uge 28-30), jul 23/12-1/1.", metadata: { fileName: "Personalehåndbog_2026.pdf", author: "Lars Bolt", lastModified: daysAgoDate(60) } },

  // Forretningsplan 2026
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 75, content: "Boltly ApS — Forretningsplan 2026. Mission: Pålidelig el-installation og service for erhverv og bolig i Storkøbenhavn. Mål 2026: Omsætning 2,8M DKK (2025: 1,8M DKK). Ansætte 3 ekstra medarbejdere (1 svend, 1 sælger, 1 koordinator). Udvide til solcelle-installation via partnerskab med Grøn Energi Rådgivning. Nøgletal: Gennemsnitlig projektværdi: 95.000 DKK. Serviceaftaler: 4 aktive. Materialeomkostningsandel: 35%. Timeallokering: 70% projektarbejde, 20% service, 10% admin.", metadata: { fileName: "Forretningsplan_2026.pdf", author: "Lars Bolt", lastModified: daysAgoDate(75) } },

  // Kvalitetssikring
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 30, content: "Boltly ApS — Kvalitetssikringsprocedure. Version 3.2. Alle installationer skal følge denne procedure: 1) Tjek el-tavle og sikringer før arbejde påbegyndes, 2) Dokumentér eksisterende installation med foto, 3) Udfør arbejde iht. Stærkstrømsbekendtgørelsen, 4) Test alle kredsløb med isolationstester, 5) RCD-test på alle nye kredsløb, 6) Udfyld afleveringsprotokol og få kundens underskrift. Ansvarlig for procedure: Lars Bolt, elautoriseret installatør.", metadata: { fileName: "Kvalitetssikring_v3.2.docx", author: "Lars Bolt", lastModified: daysAgoDate(30) } },

  // Emils uddannelsesplan
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 21, content: "Emils uddannelsesplan — Boltly ApS. Lærling: Emil Madsen. Startdato: August 2025. Mentor: Mikkel Rasmussen. Nuværende modul: Installationsteknik grundforløb 2. Fokusområder dette kvartal: Kabelføring i boligbyggeri, RCD-installation og test, Læsning af el-diagrammer. Evaluering: Mikkel evaluerer Emil hver fredag. Kvartalssamtale med Lars i april. Skoleperiode: Uge 14-18 (april-maj). Emil viser god fremgang — arbejder selvstændigt med kabelføring, skal have mere erfaring med fejlsøgning.", metadata: { fileName: "Emil_uddannelsesplan_2025-26.docx", author: "Mikkel Rasmussen", lastModified: daysAgoDate(21) } },

  // Sofie → Trine: car booking
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 9, content: "Trine, min bil skal til service onsdag — kan du booke en lånebil fra Sixt? Jeg har kundebesøg hos Skovgaard torsdag morgen kl 8 som jeg ikke kan flytte.", metadata: { from: "sofie@boltly.dk", to: "trine@boltly.dk", subject: "Lånebil onsdag", date: daysAgoDate(9) } },

  // Trine → Sofie: mileage approval
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 8, content: "Sofie, din kørselsgodtgørelse for februar er godkendt — 2.340 DKK for 12 ture til Vestegnen og 3 ture til Skovgaard-ejendommene. Beløbet udbetales med næste løn. /Trine", metadata: { from: "trine@boltly.dk", to: "sofie@boltly.dk", subject: "Kørselsgodtgørelse februar", date: daysAgoDate(8) } },

  // Mikkel → Peter: annual inspection
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 7, content: "Peter, den årlige gennemgang af jeres installationer i Brønshøj er planlagt til torsdag og fredag i uge 14. Mikkel og Frederik tager den denne gang. Er der noget specifikt I vil have os til at se på? Vh Mikkel, Boltly", metadata: { from: "mikkel@boltly.dk", to: "peter@skovgaard-ejendomme.dk", subject: "Årlig elgennemgang — Brønshøj ejendomme", date: daysAgoDate(7) } },

  // Lars → Thomas: café project discussion
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 5, content: "Hej Thomas, tak for tegningerne til Café Nørrebro-projektet. Jeg har gennemgået el-specifikationen — vi skal have en dialog om belastningsberegningen for køkkensektionen. Kan vi mødes torsdag? Vh Lars", metadata: { from: "lars@boltly.dk", to: "thomas@hl-arkitekter.dk", subject: "RE: Café Nørrebro el-specifikation", date: daysAgoDate(5) } },

  // Calendar: Café Nørrebro architect meeting
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 3, content: "Kundemøde: Hansen & Larsen — Café Nørrebro. Lars + Thomas Hansen. Gennemgang af el-specifikation for caféens køkkeninstallation. Diskussion om belastningsberegning — Thomas sender opdaterede tegninger. Beslutning: 3 ekstra stikkontakter og stærkstrømsudgang til ny ovn.", metadata: { title: "Café Nørrebro el-spec gennemgang", attendees: ["lars@boltly.dk", "thomas@hl-arkitekter.dk"], date: daysAgoDate(3) } },

  // Jonas → Lars: updated kitchen plans
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 6, content: "Jonas her. Café Nørrebro-projektet — vi har ændret planerne for køkkenet. Kan du kigge på de opdaterede tegninger? Vi har brug for 3 ekstra stikkontakter og en stærkstrømsudgang til den nye ovn. Vedhæftet: køkkenplan_v3.pdf", metadata: { from: "jonas@cafe-norrebro.dk", to: "lars@boltly.dk", subject: "Café Nørrebro — opdaterede køkkenplaner", direction: "received", date: daysAgoDate(6) } },

  // Nygade besigtigelse calendar
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 2, content: "Nygade Center besigtigelse. Lars + Martin Dall + Thomas.K. Gennemgang af nuværende nødbelysning og brandmyndighedernes krav. Thomas.K laver kalkulation baseret på besigtigelsen.", metadata: { title: "Nygade Center — besigtigelse nødbelysning", attendees: ["lars@boltly.dk", "martin@nygade-center.dk", "thomas.k@boltly.dk"], date: daysAgoDate(2) } },

  // Trine → Martin: updated quote
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 2, content: "Martin, hermed opdateret tilbud på nødbelysning for Nygade Butikscenter. Vi har inkluderet brandmyndighedernes krav fra seneste inspektion. Thomas Kjær gennemgår det tekniske med dig på mødet torsdag. /Trine", metadata: { from: "trine@boltly.dk", to: "martin@nygade-center.dk", subject: "Opdateret tilbud: Nødbelysning Nygade", date: daysAgoDate(2) } },

  // Mikkel → Emil: apprentice instruction
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 15, content: "Emil, husk at lave dit daglige lærerapport fra Vestegnen i dag. Du skal notere: 1) Hvilke kredsløb du har arbejdet på, 2) Hvilke sikkerhedsprocedurer du fulgte, 3) Spørgsmål til gennemgang med mig fredag. Det er en del af din uddannelseslog. /Mikkel", metadata: { from: "mikkel@boltly.dk", to: "emil@boltly.dk", subject: "Lærerapport — husk daglig", date: daysAgoDate(15) } },

  // Henrik → Lars: project coordination update
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 4, content: "Lars, her er ugens ressourceoverblik: Mikkel + Kasper på Vestegnen (fase 2 opgang E). Sofie ledig torsdag-fredag. Frederik på servicebesøg mandag + Nygade akutsag. Ida og Emil begge på skole. Thomas.K har 3 tilbud i pipeline. Vi er tynde på kapacitet hvis solcelleprojektet skal starte i maj. Henrik", metadata: { from: "henrik@boltly.dk", to: "lars@boltly.dk", subject: "Ressourceoverblik uge 13", date: daysAgoDate(4) } },

  // Ida → Mikkel: apprentice progress
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 20, content: "Mikkel, her er min rapport fra tavleøvelsen i fredags. Jeg installerede en 12-modul gruppetavle med 4 automatsikringer og 2 RCD'er. Alle test bestået første forsøg! Jeg føler mig klar til at prøve en rigtig installation snart. Ida", metadata: { from: "ida@boltly.dk", to: "mikkel@boltly.dk", subject: "Tavleøvelse — rapport", date: daysAgoDate(20) } },

  // Lars → Peter: service agreement discussion
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 1, content: "Hej Peter, tak for snakken i går. Vi kigger på serviceaftalen for 2026 og sender et opdateret tilbud inden fredag. Mikkel og Frederik tager sig af den årlige gennemgang af jeres ejendomme i Brønshøj — de kender installationerne bedst. Vh Lars Bolt, Boltly ApS", metadata: { from: "lars@boltly.dk", to: "peter@skovgaard-ejendomme.dk", subject: "RE: Serviceaftale 2026", date: daysAgoDate(1) } },
];
