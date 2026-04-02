// ── Hansens Flodeis ApS — Story Content ──────────────────────────────
// ~80 hand-written content items covering 12 story threads.
// All content is natural Danish business language.

import type { SyntheticContent } from "../../synthetic-types";

function daysAgoDate(d: number): string {
  return new Date(Date.now() - d * 86400000).toISOString();
}

export const HANSENS_STORIES: SyntheticContent[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // Thread 1 — Coop sommerordre kapacitetskonflikt (~10 items)
  // ═══════════════════════════════════════════════════════════════════════

  // EDI-ordre fra Coop — Trine ser det først
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Hej Trine, hermed bekræftelse af sommerordre 2026 fra Coop Danmark. Ordre nr. EDI-88421. Samlet volumen: 42.000 liter fordelt på 6 varianter (Jordbær, Vanilje, Chokolade, Lakrids, Hindbær-Hyldeblomst, Nørgaard Pop). Leveringsperiode: uge 22-30. Første levering uge 22: 8.000 liter. Produktionsspecifikation og palletplan vedhæftet. Venlig hilsen, Mads Birk, Coop Danmark A/S, Supply Chain", metadata: { from: "mads.birk@coop.dk", to: "trine@hansens-is.dk", subject: "Sommerordre 2026 — EDI-88421 bekræftelse", direction: "received", date: daysAgoDate(3) } },

  // Trine → Niels: kapacitetsbekymring
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Niels, har du set Coop-ordren? 42.000 liter over sommeren — det er 35% mere end sidste år. Vores max kapacitet med begge linjer er 6.500 liter/uge, og vi har allerede Salling Group og Dagrofa at passe. Kan vi overhovedet nå 8.000 liter i uge 22? Jeg tror vi skal have et møde med Rasmus i morgen tidlig.", metadata: { from: "trine@hansens-is.dk", to: "niels@hansens-is.dk", subject: "Coop sommerordre — kapacitetsproblem", date: daysAgoDate(3) } },

  // Niels → Trine: produktionsberegning
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 2, content: "Trine, jeg har regnet på det. Med to skift og weekendkørsel kan vi max presse 7.200 liter ud om ugen — men det kræver at begge linjer kører fejlfrit og at vi har råvarer nok. Linie 2 skal have service i uge 20, det kan vi ikke rykke. Vi mangler desuden 3 sæsonfolk der stadig ikke er startet. Kort sagt: 8.000 i uge 22 er urealistisk med nuværende setup.", metadata: { from: "niels@hansens-is.dk", to: "trine@hansens-is.dk", subject: "RE: Coop sommerordre — kapacitetsproblem", date: daysAgoDate(2) } },

  // Trine → Rasmus: eskalering
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 2, content: "Rasmus, vi har et problem med Coop-sommerordren. Niels siger vi max kan lave 7.200 liter/uge, men Coop vil have 8.000 i uge 22. Samtidig har vi Salling-leverancen og Dagrofa-ordren. Jeg foreslår et krisemøde i morgen kl 8 med dig, mig, Niels og Jonas. Vi skal tage stilling til om vi melder dellevering til Coop eller prøver at finde ekstra kapacitet.", metadata: { from: "trine@hansens-is.dk", to: "rasmus@hansens-is.dk", subject: "HASTER: Coop sommerordre vs. kapacitet", date: daysAgoDate(2) } },

  // Jonas → Trine: logistikkonflikt
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 2, content: "Trine, heads up — den kølebil vi bruger til Salling er booket hele mandagen i uge 22. Hvis Coop-leverancen også skal ud mandag, skal vi leje en ekstra bil. Frysehuset i Tåstrup har plads til midlertidig opbevaring, men det koster 4.800 DKK/uge. Lad mig vide hvad I beslutter på mødet i morgen.", metadata: { from: "jonas.k@hansens-is.dk", to: "trine@hansens-is.dk", cc: "niels@hansens-is.dk", subject: "Kølebil og logistik uge 22", date: daysAgoDate(2) } },

  // Kalender: krisemøde
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 1, content: "Krisemøde — Coop sommerordre kapacitet. Deltagere: Rasmus, Trine, Niels, Jonas. Agenda: 1) Gennemgang af ordreomfang vs. produktionskapacitet, 2) Mulighed for weekendskift, 3) Logistikplanlægning uge 22, 4) Beslutning om dellevering vs. fuld levering. Konklusion: Vi melder dellevering til Coop — 6.000 liter uge 22, restordre uge 23. Anders kontakter Coop.", metadata: { title: "Krisemøde — Coop sommerordre", attendees: ["rasmus@hansens-is.dk", "trine@hansens-is.dk", "niels@hansens-is.dk", "jonas.k@hansens-is.dk"], date: daysAgoDate(1) } },

  // Rasmus → Anders: instruks om dellevering
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 1, content: "Anders, vi har besluttet at melde dellevering til Coop på sommerordren. Vi kan levere 6.000 liter i uge 22 og de resterende 2.000 i uge 23. Skriv til Mads Birk og forklar det professionelt — vi vil ikke miste ordren, men vi kan ikke gå på kompromis med kvaliteten. Understreg at det er en midlertidig flaskehals pga. sæsonopstart. Sig også at vi prioriterer deres topsælgere (Jordbær og Vanilje) i første sending.", metadata: { from: "rasmus@hansens-is.dk", to: "anders@hansens-is.dk", subject: "Coop sommerordre — dellevering, kontakt Mads Birk", date: daysAgoDate(1) } },

  // Anders → Coop: delleveringsbesked
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 1, content: "Kære Mads, tak for den store sommerordre — vi sætter stor pris på samarbejdet med Coop. Vedr. leveringsplanen for uge 22 skal jeg oplyse at vi leverer 6.000 liter i uge 22 med prioritet på Jordbær, Vanilje og Chokolade, og de resterende 2.000 liter følger i uge 23. Baggrunden er at vi skalerer produktionen op til sommersæsonen, og vi vil sikre at kvaliteten lever op til jeres og vores standarder. Alle efterfølgende leverancer i uge 23-30 følger den aftalte plan. Ring gerne hvis du har spørgsmål. Venlig hilsen, Anders, Hansens Flødeis ApS", metadata: { from: "anders@hansens-is.dk", to: "mads.birk@coop.dk", subject: "RE: Sommerordre 2026 — leveringsplan uge 22", date: daysAgoDate(1) } },

  // Niels → Trine: produktionsplan opdateret
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 0, content: "Trine, her er den opdaterede produktionsplan. Uge 21: opstart på Coop Jordbær + Vanilje (3.500 liter), parallel Salling-leverance. Uge 22: Coop Chokolade + resten (2.500 liter), Salling færdig mandag. Linie 2-service rykket til søndag uge 20. Jeg har brug for at de 3 manglende sæsonfolk starter senest mandag i uge 21 — ellers holder regnestykket ikke.", metadata: { from: "niels@hansens-is.dk", to: "trine@hansens-is.dk", cc: "rasmus@hansens-is.dk", subject: "Produktionsplan uge 21-23 — opdateret", date: daysAgoDate(0) } },

  // Jonas → Niels (Slack): frysehuskoordinering
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 0, content: "Niels — jeg har booket ekstra plads i Tåstrup Frysehus fra uge 21. Det giver os buffer til Coop-leverancen. Kan du sørge for at batchnumre og palletmærkning passer til deres EDI-krav? Sidste gang var der rod i stregkoderne.", metadata: { channel: "produktion", authorEmail: "jonas.k@hansens-is.dk", authorName: "Jonas Kristensen" } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 2 — Dagrofa faktura forfald (~8 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Marie → Dagrofa: første rykker
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 8, content: "Kære regnskabsafdeling, dette er en venlig påmindelse om at faktura INV-2026-090 på 67.500 DKK forfaldt den 22. marts 2026. Fakturaen dækker leverance af økologisk is til MENY-butikker i uge 9-10. Vi vil sætte pris på en bekræftelse af betalingsdato. Med venlig hilsen, Marie, Hansens Flødeis ApS", metadata: { from: "marie@hansens-is.dk", to: "kreditor@dagrofa.dk", subject: "Betalingspåmindelse: INV-2026-090 — 67.500 DKK", date: daysAgoDate(8) } },

  // Dagrofa → Marie: intern omstrukturering
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 5, content: "Kære Marie, tak for din henvendelse. Vi er i gang med en intern omstrukturering af vores regnskabsafdeling, og der er desværre forsinkelser på betalinger. Vi forventer at indhente det forsømte inden for 10 hverdage. Beklager ulejligheden. Med venlig hilsen, Lene Kristiansen, Dagrofa Kreditorafdeling", metadata: { from: "lene.k@dagrofa.dk", to: "marie@hansens-is.dk", subject: "RE: Betalingspåmindelse: INV-2026-090 — 67.500 DKK", direction: "received", date: daysAgoDate(5) } },

  // Marie → Dagrofa: anden rykker
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 1, content: "Kære Lene, faktura INV-2026-090 er nu 11 dage over forfald. Jeg forstår at I omstrukturerer, men 67.500 DKK er et væsentligt beløb for os som mindre producent. Kan du give mig en mere præcis dato for betaling? Vi har også en ny leverance til MENY i uge 16 som vi gerne vil bekræfte. Med venlig hilsen, Marie", metadata: { from: "marie@hansens-is.dk", to: "lene.k@dagrofa.dk", subject: "2. rykker: INV-2026-090 — 11 dage over forfald", date: daysAgoDate(1) } },

  // Marie → Rasmus: eskalering
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 1, content: "Rasmus, Dagrofa-fakturaen på 67.500 DKK er nu 11 dage over forfald. De skylder på intern omstrukturering, men jeg er bekymret. Derudover har jeg lagt mærke til at vores ordrefrekvens fra Dagrofa/MENY er faldet ca. 30% i forhold til samme periode sidste år — fra 4 ordrer/måned til 2-3. Jeg ved ikke om Kim er opmærksom på det fra salgssiden. Skal jeg kontakte ham?", metadata: { from: "marie@hansens-is.dk", to: "rasmus@hansens-is.dk", subject: "Dagrofa — forfalden faktura + faldende ordrer", date: daysAgoDate(1) } },

  // Rasmus → Marie: svar
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 0, content: "Marie, tak for heads up. Hold øje med Dagrofa-betalingen og send en 3. rykker om 5 dage hvis den ikke er kommet. Mht. det faldende ordreniveau — det er bekymrende. Jeg tager det op med Kim når han er tilbage fra kundebesøg torsdag. Vi kan ikke miste Dagrofa/MENY som kanal.", metadata: { from: "rasmus@hansens-is.dk", to: "marie@hansens-is.dk", subject: "RE: Dagrofa — forfalden faktura + faldende ordrer", date: daysAgoDate(0) } },

  // Kim → Anders: salgsbesøg (uvidende om fakturaproblemet)
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 4, content: "Anders, jeg er ude hos MENY Frederikssund i dag — de har givet os god hyldeplads til sommer. Butikschefen spørger om vi har en ny smagsprøve-kampagne som sidste år. Hvad tænker Camilla? Kan vi lave noget med den nye Nørgaard Pop? /Kim", metadata: { from: "kim.s@hansens-is.dk", to: "anders@hansens-is.dk", subject: "MENY Frederikssund — salgsmulighed", date: daysAgoDate(4) } },

  // Drive doc: månedlig debitoroversigt
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 1, content: "Månedlig debitoroversigt — marts 2026. Udarbejdet af Marie, bogholder. Samlede udestående: 189.200 DKK. Fordeling: Coop Danmark — 78.300 DKK (ikke forfalden, forfald uge 16). Dagrofa/MENY — 67.500 DKK (INV-2026-090, 11 dage over forfald, intern omstrukturering). Salling Group — 31.400 DKK (ikke forfalden). Sthlm Icecream AB — 12.000 DKK (ikke forfalden). BEMÆRK: Dagrofa ordrefrekvens faldet 30% vs. Q1 2025. Ingen kommunikation mellem salg (Kim) og bogholderi om dette.", metadata: { fileName: "Debitoroversigt_marts_2026.xlsx", author: "Marie", lastModified: daysAgoDate(1) } },

  // Marie → Kim (cc Rasmus): forsøg på brobygning
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 0, content: "Hej Kim, jeg vil bare gøre dig opmærksom på at Dagrofa har en faktura på 67.500 DKK der er 11 dage over forfald. De siger det skyldes intern omstrukturering. Derudover er vores ordrefrekvens fra Dagrofa/MENY faldet 30% ift. sidste år. Er det noget du har hørt fra din kontakt derude? Blot så vi har et samlet billede. Vh Marie", metadata: { from: "marie@hansens-is.dk", to: "kim.s@hansens-is.dk", cc: "rasmus@hansens-is.dk", subject: "Dagrofa — betalingsforsinkelse + faldende ordrer", date: daysAgoDate(0) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 3 — Fodevarestyrelsen inspektion (~8 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Fodevarestyrelsen → Lotte: inspektionsvarsel
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 5, content: "Kære Hansens Flødeis ApS, Fødevarestyrelsen foretager uanmeldt kontrolbesøg i perioden uge 15-16 som led i den løbende kontrol af økologiske fødevareproducenter. Kontrollen vil omfatte: 1) Økologisk massebalance og sporbarhed, 2) HACCP-dokumentation, 3) Allergenoversigt og mærkningskontrol, 4) Hygiejne og rengøringsprocedurer. Venligst sikr at relevant dokumentation er tilgængelig. Med venlig hilsen, Fødevarestyrelsen, Kontrolenhed Sjælland", metadata: { from: "kontrol@fvst.dk", to: "lotte@hansens-is.dk", cc: "rasmus@hansens-is.dk", subject: "Kontrolbesøg — Hansens Flødeis ApS, uge 15-16", direction: "received", date: daysAgoDate(5) } },

  // Lotte → Rasmus + Trine: alarm
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 5, content: "Rasmus og Trine — Fødevarestyrelsen kommer i uge 15-16 til uanmeldt kontrol. Det er om 10-11 dage. Jeg er bekymret for vores dokumentation: HACCP-planen er sidst opdateret for 14 måneder siden og mangler den nye vanilje-leverandør. Vores organiske massebalance i Tracezilla viser en afvigelse på 2,8% for økologisk mælk i Q1 — det SKAL vi kunne forklare. Og allergenoversigten mangler den nye lakridsvariant. Vi har brug for et par dage til at få styr på papirerne.", metadata: { from: "lotte@hansens-is.dk", to: "rasmus@hansens-is.dk", cc: "trine@hansens-is.dk", subject: "HASTER: Fødevarestyrelsen kontrol — dokumentation mangler", date: daysAgoDate(5) } },

  // Rasmus → Lotte: prioritering
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 4, content: "Lotte, det her har topprioritet. Drop alt andet og fokuser på: 1) HACCP-planen — opdater med nye leverandører og nye varianter, 2) Massebalancen — get Tracezilla-tallene til at stemme, og hvis 2,8% afvigelse er reelt, forbered en forklaring (spild? kassation?), 3) Allergenoversigt — opdater med lakrids. Trine hjælper dig med at trække data fra Tracezilla. Jeg vil have en status inden fredag.", metadata: { from: "rasmus@hansens-is.dk", to: "lotte@hansens-is.dk", cc: "trine@hansens-is.dk", subject: "RE: HASTER: Fødevarestyrelsen kontrol — dokumentation mangler", date: daysAgoDate(4) } },

  // Lotte → Niels: massebalance
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 4, content: "Niels, jeg har brug for din hjælp med massebalancen. Tracezilla viser at vi har brugt 2,8% mere økologisk mælk end vi kan dokumentere i færdigvarer. Er det spild fra produktion? Kasserede batches? Jeg skal kunne forklare det til Fødevarestyrelsen. Kan du tjekke produktionsloggen for januar-marts?", metadata: { from: "lotte@hansens-is.dk", to: "niels@hansens-is.dk", subject: "Massebalance øko-mælk — afvigelse 2,8%", date: daysAgoDate(4) } },

  // Niels → Lotte: forklaring
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Lotte, jeg har tjekket loggen. Afvigelsen skyldes primært to ting: 1) Vi kasserede batch 2026-V012 i februar pga. fejl i pasteuriseringen — 180 liter mælk. Det blev registreret i produktionsloggen men ikke i Tracezilla som kassation. 2) Prøveudtagning til kvalitetskontrol — ca. 50 liter/måned som ikke bogføres. Tilsammen forklarer det ca. 2,5% af afvigelsen. De sidste 0,3% kan være målefejl på flowmåler.", metadata: { from: "niels@hansens-is.dk", to: "lotte@hansens-is.dk", subject: "RE: Massebalance øko-mælk — afvigelse 2,8%", date: daysAgoDate(3) } },

  // Drive doc: HACCP-plan (gammel)
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 420, content: "HACCP Plan — Hansens Flødeis ApS. Version 2.1, sidst opdateret: februar 2025. Kritiske kontrolpunkter: CCP1: Pasteurisering (72°C / 15 sek). CCP2: Nedkøling til <4°C inden 90 min. CCP3: Frysetemperatur -18°C. Leverandører: Svanholm Gods (øko-mælk), Friis Holm (øko-chokolade), Solbærhaven (øko-bær). MANGLER: Ny vanilje-leverandør (skiftet nov 2025). MANGLER: Lakridsvariant tilføjet jan 2026. MANGLER: Opdaterede CIP-procedurer fra ny rengøringsleverandør.", metadata: { fileName: "HACCP_Plan_v2.1.pdf", author: "Lotte", lastModified: daysAgoDate(420) } },

  // Drive doc: allergenoversigt
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 90, content: "Allergenoversigt — Hansens Flødeis ApS. Varianter og allergener: Jordbær — mælk. Vanilje — mælk. Chokolade — mælk, soja. Hindbær-Hyldeblomst — mælk. MANGLER: Lakrids (tilføjet januar 2026, indeholder mælk + lakridsrod). MANGLER: Nørgaard Pop (tilføjet marts 2026, indeholder mælk, nødder). Krydsforurening: Alle varianter produceres på samme linje — nøddespor i alle produkter fra marts 2026.", metadata: { fileName: "Allergenoversigt_Hansens_Is.xlsx", author: "Lotte", lastModified: daysAgoDate(90) } },

  // Drive doc: organisk massebalance Q1
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 2, content: "Økologisk massebalance Q1 2026. Indkøb øko-mælk: 28.400 liter (Svanholm Gods). Forbrug i produktion iht. recepter: 27.200 liter. Registreret kassation (Tracezilla): 0 liter. Prøveudtagning: 150 liter (estimat). Reel kassation (batch 2026-V012): 180 liter. Uforklaret difference: 870 liter (3,1%). KORRIGERET: Efter registrering af kassation og prøver: 0,3% (sandsynligvis flowmåler-tolerance). Forklaring klar til Fødevarestyrelsen.", metadata: { fileName: "Oeko_massebalance_Q1_2026.xlsx", author: "Lotte", lastModified: daysAgoDate(2) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 4 — DSK bestyrelsesmode (~10 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Annemette → Rasmus: dagsorden
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 12, content: "Kære Rasmus, dagsorden for bestyrelsesmøde den 14. april er som følger: 1) Godkendelse af Q1-regnskab med EBITDA-bridge vs. budget, 2) 13-ugers cash flow forecast, 3) Status på sommersæson — ordrebog og kapacitet, 4) Social impact KPI'er (GROW-beregner data), 5) ESG-opdatering inkl. Scope 1+2 CO2-data, 6) Eventuelt. Marie bedes udarbejde regnskabsmateriale og cash flow forecast. Venligst hav board pack klar senest 5 hverdage før mødet. Med venlig hilsen, Annemette Holm, DSK Invest", metadata: { from: "annemette@dsk-invest.dk", to: "rasmus@hansens-is.dk", cc: "marie@hansens-is.dk", subject: "Bestyrelsesmøde 14/4 — dagsorden", direction: "received", date: daysAgoDate(12) } },

  // Rasmus → Marie: opgaveliste
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 11, content: "Marie, du har set dagsordenen fra Annemette. Vi har 5 hverdage til board pack. Her er hvad vi skal bruge: 1) P&L med EBITDA-bridge — tallene ligger i e-conomic men vi skal manuelt justere for engangsomkostninger, 2) 13-ugers cash flow — du lavede en i januar, opdater med aktuelle tal, 3) Social impact — GROW-beregner data har vi IKKE indsamlet dette kvartal, det er et hul. Kan du starte med P&L og cash flow? Jeg tager fat i Trine om GROW-data.", metadata: { from: "rasmus@hansens-is.dk", to: "marie@hansens-is.dk", subject: "Board pack 14/4 — din del", date: daysAgoDate(11) } },

  // Marie → Rasmus: status på udfordringer
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 9, content: "Rasmus, P&L er klar i udkast — EBITDA margin er 8,2% vs. budget 11%. Afvigelsen skyldes primært højere råvarepriser (Svanholm hævede mælkeprisen 6% fra januar) og overarbejde i produktion. Cash flow forecast er mere bekymrende — vi rammer under 200.000 DKK om 6 uger hvis vi betaler alle planlagte indkøb. Mht. GROW-data: vi har simpelthen ikke indsamlet det. Sidste kvartal manglede vi også. Hvad gør vi?", metadata: { from: "marie@hansens-is.dk", to: "rasmus@hansens-is.dk", subject: "RE: Board pack 14/4 — din del", date: daysAgoDate(9) } },

  // Rasmus → Marie: GROW-problem
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 8, content: "Marie, mht. GROW-data — lav en slide der ærligt siger at vi ikke har indsamlet det og at vi arbejder på at automatisere processen. Annemette kan godt lide ærlighed. Mht. cash flow: forbered to scenarier — et med fuld Coop-leverance og et med dellevering. Og inkluder Dagrofa-fakturaen som risiko — de er 11 dage over forfald. Jeg skriver ESG-afsnittet selv, men jeg har brug for CO2-data fra Trine.", metadata: { from: "rasmus@hansens-is.dk", to: "marie@hansens-is.dk", subject: "RE: Board pack 14/4 — GROW og cash flow", date: daysAgoDate(8) } },

  // Trine → Rasmus: GROW-data mangler
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 7, content: "Rasmus, jeg har kigget på GROW-beregneren. Vi mangler data fra 3 parametre: medarbejdertrivsel (skulle have lavet en undersøgelse i februar), lokalt indkøbsandel (har tallene men de er ikke plottet ind), og frivilligt arbejde/community timer. Realistisk kan jeg have det ufærdigt til fredag. Mht. ESG — CO2-data har vi ikke samlet et sted. Lars Jannick fra DSK spurgte også til det. Se separat mail.", metadata: { from: "trine@hansens-is.dk", to: "rasmus@hansens-is.dk", subject: "GROW-data — status", date: daysAgoDate(7) } },

  // Kalender: bestyrelsesmøde
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: -12, content: "Bestyrelsesmøde — DSK Invest / Hansens Flødeis. Deltagere: Annemette Holm (formand), Lars Jannick (DSK), Rasmus, Marie. Sted: DSK Invest kontor, København. Dagsorden: Q1-regnskab, cash flow, sommersæson kapacitet, social impact KPI, ESG. Board pack deadline: 9. april.", metadata: { title: "Bestyrelsesmøde Q1 — DSK Invest", attendees: ["annemette@dsk-invest.dk", "lars.jannick@dsk-invest.dk", "rasmus@hansens-is.dk", "marie@hansens-is.dk"], date: daysAgoDate(-12) } },

  // Marie → Rasmus: cash flow detaljer
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 6, content: "Rasmus, her er cash flow de næste 13 uger i to scenarier. Scenarie A (optimistisk): Dagrofa betaler, Coop betaler til tiden, fuld leverance → lavpunkt 285.000 DKK i uge 20. Scenarie B (realistisk): Dagrofa betaler forsinket, Coop dellevering, sæsonlønninger → lavpunkt 142.000 DKK i uge 21. Under 200K er ubehageligt tæt på vores minimumsgrænse. Svanholm-indkøbet i uge 18 er 95.000 DKK og Friis Holm i uge 19 er 38.000 DKK.", metadata: { from: "marie@hansens-is.dk", to: "rasmus@hansens-is.dk", subject: "Cash flow forecast 13 uger — to scenarier", date: daysAgoDate(6) } },

  // Drive doc: board pack template (halvtomt)
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 4, content: "Board Pack — Hansens Flødeis ApS, Q1 2026. Bestyrelsesmøde 14. april 2026. Indholdsfortegnelse: 1) P&L med EBITDA-bridge [UDKAST KLAR]. 2) 13-ugers cash flow forecast [UDKAST KLAR — 2 scenarier]. 3) Sommersæson kapacitet og ordrebog [MANGLER — Trine]. 4) Social impact / GROW KPI'er [MANGLER — data ikke indsamlet]. 5) ESG / CO2-data [MANGLER — ingen systematiseret energidata]. 6) Strategiske initiativer [MANGLER — Sverige-eksport, Foodexpo]. Status: 2 af 6 punkter klar. Deadline: 9. april.", metadata: { fileName: "Board_Pack_Q1_2026_UDKAST.pptx", author: "Marie", lastModified: daysAgoDate(4) } },

  // Annemette → Rasmus: reminder
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 2, content: "Rasmus, blot en påmindelse om at board pack skal være klar senest onsdag den 9. april. Jeg har brug for det i god tid til at læse igennem. Er alt på sporet? Venlig hilsen, Annemette", metadata: { from: "annemette@dsk-invest.dk", to: "rasmus@hansens-is.dk", subject: "RE: Board pack deadline onsdag", direction: "received", date: daysAgoDate(2) } },

  // Rasmus → Annemette: ærligt svar
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 1, content: "Annemette, P&L og cash flow er klar. EBITDA margin er under budget pga. råvareprisstigninger, og cash flow er stramt i uge 20-22 under sæsonopstart. Ærligt: GROW-data og ESG/CO2 er ikke klar i den detaljeringsgrad du forventer. Vi har et systematiseringsproblem. Jeg sender hvad vi har onsdag og foreslår at vi bruger mødet til at beslutte hvordan vi løser data-hullet fremadrettet. Venlig hilsen, Rasmus", metadata: { from: "rasmus@hansens-is.dk", to: "annemette@dsk-invest.dk", subject: "RE: Board pack deadline onsdag", date: daysAgoDate(1) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 5 — Saesonansaettelse (~6 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Trine → Nina (Jobcenter): status
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 10, content: "Hej Nina, status på sæsonansættelserne: vi har fået 8 af de planlagte 15 sæsonmedarbejdere på plads. 3 af de 8 mangler stadig dokumentation — opholdstilladelse for 2 af dem og hygiejnebevis for den tredje. Kan du hjælpe med at rykke for papirerne? Vi skal have dem klar inden 1. maj. Vh Trine, Hansens Flødeis", metadata: { from: "trine@hansens-is.dk", to: "nina@frederikssund.dk", subject: "Sæsonansættelse 2026 — manglende dokumentation", date: daysAgoDate(10) } },

  // Nina → Trine: svar
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 8, content: "Hej Trine, opholdstilladelserne for Agnieszka og Pavel er under behandling hos Udlændingestyrelsen — forventet svar inden 2 uger. Mht. hygiejnebevis for Mikkel T. — kurset afholdes den 10. april hos AMU Nordsjælland, er han tilmeldt? Vi har også 4 nye kandidater klar til samtale hvis I mangler flere. Vh Nina", metadata: { from: "nina@frederikssund.dk", to: "trine@hansens-is.dk", subject: "RE: Sæsonansættelse 2026 — manglende dokumentation", direction: "received", date: daysAgoDate(8) } },

  // Trine → Niels: mangler folk
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 7, content: "Niels, vi har stadig kun 8 af 15 sæsonfolk sikret, og 3 af dem mangler papirer. Lars Winther starter som trainee næste mandag, men hans hygiejnekursus er IKKE booket endnu — det er Lottes ansvar men hun er begravet i Fødevarestyrelsen-forberedelse. Kan du sørge for at Lars i det mindste får en grundlæggende hygiejneinstruktion dag 1 inden kurset er på plads?", metadata: { from: "trine@hansens-is.dk", to: "niels@hansens-is.dk", cc: "lotte@hansens-is.dk", subject: "Sæsonfolk og Lars Winther start mandag", date: daysAgoDate(7) } },

  // Lotte → Trine: hygiejnekursus
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 6, content: "Trine, beklager — jeg har ikke nået at booke hygiejnekurset for Lars W. pga. Fødevarestyrelsen-forberedelsen. Næste ledige kursus hos AMU er den 15. april. Kan vi lade ham starte med lagerarbejde og pakning indtil kurset er bestået? Han må IKKE stå ved produktionslinjen uden hygiejnecertifikat.", metadata: { from: "lotte@hansens-is.dk", to: "trine@hansens-is.dk", subject: "RE: Sæsonfolk og Lars Winther start mandag", date: daysAgoDate(6) } },

  // Niels → Trine: bekymring
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 5, content: "Trine, vi SKAL have de resterende sæsonfolk inden uge 21 ellers holder produktionsplanen for Coop ikke. Kan du bede Nina om at sende de 4 kandidater til samtale i næste uge? Og mht. Lars W. — han kan starte med pakning og lagerstyring. Jeg viser ham rundt mandag morgen kl 7.", metadata: { from: "niels@hansens-is.dk", to: "trine@hansens-is.dk", subject: "RE: Sæsonfolk og Lars Winther start mandag", date: daysAgoDate(5) } },

  // Trine → Nina: flere kandidater
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 4, content: "Nina, vi har brug for de 4 kandidater du nævnte — kan vi få dem til samtale tirsdag eller onsdag i næste uge? Vi har nu akut brug for mindst 7 ekstra hænder inden 1. maj pga. stor sommerordre fra Coop. Helst folk med erfaring fra fødevareproduktion. Vh Trine", metadata: { from: "trine@hansens-is.dk", to: "nina@frederikssund.dk", subject: "RE: Sæsonansættelse 2026 — flere kandidater?", date: daysAgoDate(4) } },

  // Niels (Slack): Lars W. første dag
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 3, content: "Lars Winther er startet i dag. God dreng, virker motiveret. Han pakker og mærker paller indtil hygiejnekurset er bestået. Har vist ham rundt på hele fabrikken undtagen produktionslinjen.", metadata: { channel: "produktion", authorEmail: "niels@hansens-is.dk", authorName: "Niels" } },

  // Trine (Slack): samtaleplanlægning
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 2, content: "Heads up — vi har samtaler med 4 kandidater fra Jobcenter onsdag kl 10-12. Niels, kan du deltage? Jeg har brug for din vurdering af om de kan stå ved linjen. To af dem har erfaring fra Arla, de to andre er fra restaurationsbranchen.", metadata: { channel: "kontor", authorEmail: "trine@hansens-is.dk", authorName: "Trine" } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 6 — Sverige-eksport maerkningsproblem (~6 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Claes → Anders: ordre fra Stockholm
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 14, content: "Hej Anders, vi vil gerne bestille 2.000 bægre Nørgaard Pop til vores butikker i Stockholm. Leveringsdato senest 1. maj. Vi har fået god feedback fra smagevent i februar og er klar til at lancere. Kan I levere? Venlig hilsen, Claes Eriksson, Sthlm Icecream AB", metadata: { from: "claes@sthlmicecream.se", to: "anders@hansens-is.dk", subject: "Order: 2.000 Nørgaard Pop — Stockholm", direction: "received", date: daysAgoDate(14) } },

  // Anders → Camilla: emballagespørgsmål
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 13, content: "Camilla, har du set ordren fra Claes i Stockholm? 2.000 bægre Nørgaard Pop til 1. maj. Spørgsmål: er vores emballage klar til det svenske marked? Jeg mener der er krav om svensk mærkning — \"djupfryst\" i stedet for \"dybfrost\" og ingrediensliste på svensk. Kan du tjekke?", metadata: { from: "anders@hansens-is.dk", to: "camilla@hansens-is.dk", subject: "Nørgaard Pop til Sverige — emballagekrav?", date: daysAgoDate(13) } },

  // Camilla → Anders: problem
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 11, content: "Anders, du har ret — og vi har et problem. Vores nuværende emballage er kun på dansk. For det svenske marked skal vi have: 1) \"Djupfryst\" i stedet for \"Dybfrost\", 2) Komplet ingrediensliste på svensk, 3) Næringserklæring i svensk format, 4) Kontaktinfo til svensk importør. Emballageproducenten (Scandi Pack) siger ny emballage tager 6 uger. Leveringsdeadline er om 4 uger. Det kan IKKE nås med ny emballage.", metadata: { from: "camilla@hansens-is.dk", to: "anders@hansens-is.dk", subject: "RE: Nørgaard Pop til Sverige — emballagekrav?", date: daysAgoDate(11) } },

  // Anders → Claes: alternativ løsning
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 10, content: "Kære Claes, tak for ordren — vi glæder os til at komme ind på det svenske marked. Vi har desværre opdaget at vores nuværende emballage mangler svensk mærkning. Ny emballage tager 6 uger. Vi har to muligheder: 1) Vi leverer med overliggende svenske klistermærker (kan være klar på 2 uger), eller 2) Vi forsinker til 1. juni med fuldt svensk emballage. Hvad foretrækker I? Venlig hilsen, Anders", metadata: { from: "anders@hansens-is.dk", to: "claes@sthlmicecream.se", subject: "RE: Order: Nørgaard Pop — mærkningsløsning", date: daysAgoDate(10) } },

  // Lotte → Anders: regulatorisk advarsel
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 9, content: "Anders, husk at klistermærker SKAL indeholde alle lovpligtige oplysninger inkl. allergener. Nørgaard Pop indeholder nødder — det er en stor allergen der skal fremgå tydeligt på svensk. Jeg vil gerne godkende teksten inden I sender den til tryk. Vi kan ikke risikere en tilbagekaldelse i Sverige.", metadata: { from: "lotte@hansens-is.dk", to: "anders@hansens-is.dk", cc: "camilla@hansens-is.dk", subject: "RE: Sverige mærkning — allergener VIGTIGT", date: daysAgoDate(9) } },

  // Claes → Anders: accepterer klistermærker
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 8, content: "Anders, klistermærker er OK som midlertidig løsning — det gør andre leverandører også. Vi foretrækker levering 1. maj med klistermærker fremfor at vente til juni. Send mig et proof af klistermærket til godkendelse. Vh Claes", metadata: { from: "claes@sthlmicecream.se", to: "anders@hansens-is.dk", subject: "RE: Order: Nørgaard Pop — mærkningsløsning", direction: "received", date: daysAgoDate(8) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 7 — Cash flow saesonpres (~6 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Marie → Rasmus: likviditetsadvarsel
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 6, content: "Rasmus, jeg har lavet en detaljeret 13-ugers likviditetsanalyse og den ser alvorlig ud. Med planlagte udgifter (Svanholm mælk 95.000, Friis Holm chokolade 38.000, Scandi Pack emballage 52.000, sæsonlønninger fra uge 18) og forventet indkomst rammer vi under 200.000 DKK i uge 21. Sommerindtægterne starter først for alvor i uge 24-25. Vi har altså et likviditetsgab på ca. 4-6 uger. Forslag: 1) Forlængede betalingsbetingelser hos Svanholm, 2) Kassekredit hos banken, 3) Fremrykke Coop-fakturering.", metadata: { from: "marie@hansens-is.dk", to: "rasmus@hansens-is.dk", subject: "Likviditetsadvarsel — sæsongab uge 20-25", date: daysAgoDate(6) } },

  // Rasmus → bank: kassekredit
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 5, content: "Kære Peter, jeg vil gerne drøfte en midlertidig udvidelse af vores kassekredit. Vi har en stærk sommer foran os med ordrer fra Coop, Salling og Dagrofa, men sæsonopstarten kræver investeringer i råvarer og sæsonansættelser 4-6 uger inden omsætningen begynder. Vores ordrebog for sommeren ligger på ca. 1,2 mio. DKK. Kan vi aftale et møde i næste uge? Venlig hilsen, Rasmus Hansen, Hansens Flødeis ApS", metadata: { from: "rasmus@hansens-is.dk", to: "peter.b@nordea.dk", subject: "Midlertidig kassekreditudvidelse — Hansens Flødeis", date: daysAgoDate(5) } },

  // Peter.H → Svanholm: betalingsbetingelser
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 4, content: "Kære Søren, vi bestiller som sædvanlig økologisk mælk til sommersæsonen — forventet 6.000 liter/uge fra uge 18. Vi vil gerne drøfte muligheden for at gå fra 14 dages til 30 dages betalingsbetingelser i perioden maj-juli. Vi har et sæsonmæssigt likviditetsgab og I er vores vigtigste leverandør. Vi kan tilbyde at binde os til et fast ugeligt minimumsvolumen som modydelse. Venlig hilsen, Peter Holm, Hansens Flødeis", metadata: { from: "peter.h@hansens-is.dk", to: "soeren@svanholm.dk", subject: "Betalingsbetingelser sommersæson 2026", date: daysAgoDate(4) } },

  // Søren → Peter.H: svar
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 2, content: "Kære Peter, vi kender jeres sæsonudfordring og vil gerne hjælpe. Vi kan tilbyde 21 dages betaling (i stedet for 14) i perioden maj-august mod et fast minimum på 5.000 liter/uge. Det passer også bedre til vores leveranceplanlægning. Lad mig vide om det fungerer. Venlig hilsen, Søren, Svanholm Gods", metadata: { from: "soeren@svanholm.dk", to: "peter.h@hansens-is.dk", subject: "RE: Betalingsbetingelser sommersæson 2026", direction: "received", date: daysAgoDate(2) } },

  // Marie → Rasmus: opdateret scenarie
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 1, content: "Rasmus, Svanholm tilbyder 21 dage i stedet for 14. Det rykker lavpunktet fra 142.000 til ca. 195.000 DKK — tæt på men stadig under vores komfortzone. Vi har brug for kassekreditten som sikkerhedsnet. Har du hørt fra Nordea?", metadata: { from: "marie@hansens-is.dk", to: "rasmus@hansens-is.dk", subject: "RE: Likviditet — Svanholm-aftale hjælper", date: daysAgoDate(1) } },

  // Rasmus → Marie: banksvar
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 0, content: "Marie, Nordea vil have en detaljeret forecast og ordrebekræftelser inden de vurderer kassekreditten. Kan du sende dem 13-ugers cash flow + Coop-ordrebekræftelsen? Peter Bak er vores kontakt — hans mail er peter.b@nordea.dk. Lad os få det sendt i dag.", metadata: { from: "rasmus@hansens-is.dk", to: "marie@hansens-is.dk", subject: "RE: Likviditet — Nordea vil have dokumentation", date: daysAgoDate(0) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 8 — Romkugler varemaerkesag (~4 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Camilla → Anders: Trustpilot-overblik
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 7, content: "Anders, jeg har lavet en gennemgang af vores Trustpilot-profil. Vi har 8 negative anmeldelser der refererer til varemærkesagen med Hansens Romkugler. Typisk ordlyd: \"Skammer sig ikke — stjæler andres brand\" og \"Forveksler folk med det ægte Hansen-brand\". Vores samlede score er faldet fra 4,2 til 3,6. Det skader os hos forbrugerne. Skal vi svare på dem systematisk?", metadata: { from: "camilla@hansens-is.dk", to: "anders@hansens-is.dk", subject: "Trustpilot — varemærkesag påvirker omdømme", date: daysAgoDate(7) } },

  // Anders → Rasmus: DR journalist
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 4, content: "Rasmus, vi har fået en henvendelse fra DR — journalist Line Vestergaard vil lave et indslag om varemærkekonflikter i fødevarebranchen og nævner specifikt vores sag med Hansens Romkugler. Hun spørger om et interview. Hvad gør vi? Vi har ikke talt offentligt om det endnu. Camilla har lavet en Trustpilot-rapport der viser at det påvirker os — 8 negative anmeldelser og score faldet til 3,6.", metadata: { from: "anders@hansens-is.dk", to: "rasmus@hansens-is.dk", subject: "DR journalist — varemærkesag, interview?", date: daysAgoDate(4) } },

  // Rasmus → Anders: strategisk svar
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Anders, lad os IKKE stille op til interview hos DR lige nu — det eskalerer bare sagen. Skriv et høfligt nej-tak til journalisten og henvis til at sagen er afgjort og at vi respekterer afgørelsen. Mht. Trustpilot: Camilla skal svare professionelt på alle anmeldelser — faktuelt og uden at gå i konflikt. Vi er Hansens FLØDEIS, ikke Hansens Romkugler, og det budskab skal vi holde fast i.", metadata: { from: "rasmus@hansens-is.dk", to: "anders@hansens-is.dk", cc: "camilla@hansens-is.dk", subject: "RE: DR journalist — varemærkesag, interview?", date: daysAgoDate(3) } },

  // Drive doc: Trustpilot-overvågningsrapport
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 7, content: "Trustpilot Monitoring Report — Hansens Flødeis ApS. Periode: jan-marts 2026. Samlet score: 3,6 (ned fra 4,2). Antal anmeldelser: 34 (heraf 8 negative relateret til varemærkesag). Negative temaer: Forveksling med Hansens Romkugler (8 stk), Levering/kvalitetsklager (3 stk). Positive temaer: Smag og kvalitet (18 stk), Økologisk profil (5 stk). Anbefaling: Systematisk besvarelse af varemærkerelaterede anmeldelser. Overvej proaktiv kommunikationskampagne om \"Hansens Flødeis — ægte dansk økologisk is siden 1987\".", metadata: { fileName: "Trustpilot_Monitoring_Q1_2026.pdf", author: "Camilla", lastModified: daysAgoDate(7) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 9 — Produktionsbatch kvalitetsafvigelse (~5 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Niels (Slack): smagsafvigelse
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 3, content: "Folkens — batch 2026-V018 (vanilje) smager forkert. Der er en skarp undertone der ikke skal være der. Jeg har sat batchen på hold og trukket prøver. Lotte — kan du komme ned og smage? Det kan være vaniljeekstrakten fra den nye leverandør.", metadata: { channel: "produktion", authorEmail: "niels@hansens-is.dk", authorName: "Niels" } },

  // Lotte (Slack): bekræftelse
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 3, content: "Niels, jeg har smagt den. Enig — der er en bitter note der ikke hører til. Jeg karantæner batch 2026-V018. Vi skal tjekke om andre batches fra den nye vaniljeleverandør (Tahiti Vanilla Co) har samme problem. De leverede også til batch V015 og V016.", metadata: { channel: "kvalitet", authorEmail: "lotte@hansens-is.dk", authorName: "Lotte" } },

  // Niels (Slack): Tracezilla-check
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 2, content: "Lotte — jeg har tjekket i Tracezilla. Vaniljeekstrakt lot TVE-2026-03 blev brugt i batch V015, V016 og V018. V015 og V016 er allerede leveret til Salling — 800 bægre. Hvis de også er påvirket har vi et tilbagekaldelsesproblem. Hvad gør vi?", metadata: { channel: "produktion", authorEmail: "niels@hansens-is.dk", authorName: "Niels" } },

  // Lotte → leverandør: klage
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 2, content: "Dear Tahiti Vanilla Co, we have identified a taste deviation in three production batches (V015, V016, V018) all using your vanilla extract lot TVE-2026-03. The product has a noticeable bitter off-note not present in previous lots. We have quarantined batch V018 and need to assess batches V015-V016 which have been shipped. Please provide: 1) Certificate of analysis for lot TVE-2026-03, 2) Any known quality issues with this lot, 3) Replacement lot availability. This is urgent as it may affect consumer products already in retail. Regards, Lotte, QA Manager, Hansens Flødeis ApS", metadata: { from: "lotte@hansens-is.dk", to: "quality@tahitivanilla.co", subject: "URGENT: Quality deviation — lot TVE-2026-03", date: daysAgoDate(2) } },

  // Lotte → Rasmus + Trine: eskalering
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 1, content: "Rasmus og Trine — vi har en potentiel kvalitetssag. Batch 2026-V018 (vanilje) er karantæneret pga. smagsafvigelse. Tracezilla viser at den samme vaniljeekstrakt (lot TVE-2026-03) også er brugt i V015 og V016 som allerede er leveret til Salling (800 bægre). Hvis Salling melder klager, kan vi stå over for en tilbagekaldelse. Jeg har kontaktet leverandøren og afventer analysecertifikat. Anbefaling: kontakt Salling proaktivt og bed dem holde de pågældende bægre tilbage indtil vi har klarhed.", metadata: { from: "lotte@hansens-is.dk", to: "rasmus@hansens-is.dk", cc: "trine@hansens-is.dk", subject: "Kvalitetsafvigelse batch V015-V018 — mulig tilbagekaldelse", date: daysAgoDate(1) } },

  // Rasmus (Slack): handling
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 0, content: "Lotte og Niels — jeg har ringet til Salling. De trækker de 800 bægre fra batch V015/V016 tilbage fra hylderne i dag. Ingen kundeklager endnu. Vi skylder dem en forklaring inden fredag. Lotte — sørg for at analysecertifikatet fra Tahiti Vanilla er klar.", metadata: { channel: "kvalitet", authorEmail: "rasmus@hansens-is.dk", authorName: "Rasmus" } },

  // Drive doc: karantæneprotokol
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 1, content: "Karantæneprotokol — Batch 2026-V018 (Vanilje). Dato: 1. april 2026. Årsag: Smagsafvigelse, bitter undertone. Mistænkt kilde: Vaniljeekstrakt lot TVE-2026-03 (Tahiti Vanilla Co). Karantæneret mængde: 450 liter (1.800 bægre). Relaterede batches: V015 (leveret Salling, 400 bægre), V016 (leveret Salling, 400 bægre). Handling: Leverandør kontaktet, analysecertifikat afventes. Salling adviseret om tilbagetrækning. Ansvarlig: Lotte (QA). Næste skridt: Afvent certifikat, vurder om batch skal kasseres eller frigives.", metadata: { fileName: "Karantaeneprotokol_V018_april2026.pdf", author: "Lotte", lastModified: daysAgoDate(1) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 10 — OOH salgsekspansion (~5 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Robert → Kim: nye leads
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 8, content: "Hej Kim, jeg har været ude på besøg og har 3 gode leads: 1) Café Razz i Helsingør — kæde med 4 lokationer, vil have en ekslusiv smag til sommeren, 2) Nordisk Film Biografer — 12 biografer i Sjælland, ca. 3.000 bægre/måned i sæson, 3) Louisiana Museum — want is i cafeen + events. Jeg har brug for godkendte prislister for OOH-segmentet og en rabatstige for volumenkunder. Kan du sende dem? /Robert", metadata: { from: "rlw@hansens-is.dk", to: "kim.s@hansens-is.dk", subject: "OOH leads — Café Razz, Nordisk Film, Louisiana", date: daysAgoDate(8) } },

  // Robert → Kim: 2. reminder
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 4, content: "Kim, har du set min mail fra torsdag? Café Razz vil gerne have et tilbud inden fredag og Nordisk Film har møde med en konkurrent næste uge. Jeg har brug for OOH-prislisten for at kunne sende noget. Ring mig gerne. /Robert", metadata: { from: "rlw@hansens-is.dk", to: "kim.s@hansens-is.dk", subject: "RE: OOH leads — HASTER, mangler prisliste", date: daysAgoDate(4) } },

  // Robert → Anders: eskalering
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 2, content: "Anders, undskyld at jeg skriver direkte til dig — men Kim svarer ikke på mine mails og har ikke taget telefonen i 4 dage. Jeg har 3 OOH-leads der er ved at løbe os af hænde: Café Razz vil have svar inden fredag, Nordisk Film mødes med en konkurrent, og Louisiana Museum er klar til at bestille. Jeg kan ikke sende tilbud uden godkendt OOH-prisliste og rabatstige. Er Kim syg? Eller skal jeg gå til Rasmus? Jeg vil bare ikke miste kunderne.", metadata: { from: "rlw@hansens-is.dk", to: "anders@hansens-is.dk", subject: "Kim svarer ikke — OOH-leads i fare", date: daysAgoDate(2) } },

  // Anders → Rasmus: concern
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 1, content: "Rasmus, Robert skriver at Kim ikke har svaret ham i 4 dage. Robert har 3 seriøse OOH-leads der falder til jorden hvis vi ikke handler nu. Har du hørt fra Kim? Han var ude hos MENY i sidste uge men jeg har heller ikke hørt fra ham siden. Er han stadig ansat eller er der noget jeg har misset?", metadata: { from: "anders@hansens-is.dk", to: "rasmus@hansens-is.dk", subject: "Kim Søgaard — ikke til at få fat i, OOH-leads tabt?", date: daysAgoDate(1) } },

  // Rasmus → Anders: handling
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 0, content: "Anders, Kim er sygemeldt — jeg fik besked fra hans læge i fredags. Skriv til Robert og sig at DU godkender OOH-prislisten midlertidigt. Brug den fra sidste sæson med 5% prisstigning. Robert skal have tilbud ud til Café Razz og Nordisk Film inden torsdag. Louisiana kan vente til næste uge. Vi kan ikke miste de leads.", metadata: { from: "rasmus@hansens-is.dk", to: "anders@hansens-is.dk", subject: "RE: Kim Søgaard — handling", date: daysAgoDate(0) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 11 — Solcellepark og energidata (~3 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Lars Jannick → Rasmus: Scope 1+2 data
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 10, content: "Kære Rasmus, til bestyrelsesmødet og vores ESG-rapportering har vi brug for Scope 1 og Scope 2 CO2-data for Hansens Flødeis. Scope 1: Direkte udledning fra jeres køleanlæg (R449A kølemiddel) og dieselbrug til transport. Scope 2: Indirekte fra elforbrug. I har en solcellepark der producerer ca. 150 MWh/år — det skal modregnes. Hvem har de data? Og er de systematiseret eller ligger de i separate filer? Med venlig hilsen, Lars Jannick, DSK Invest", metadata: { from: "lars.jannick@dsk-invest.dk", to: "rasmus@hansens-is.dk", subject: "ESG-rapportering — Scope 1+2 CO2-data", direction: "received", date: daysAgoDate(10) } },

  // Rasmus → Trine: hvem har energidata?
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 9, content: "Trine, Lars Jannick fra DSK spørger til vores CO2-data for ESG-rapporten. Vi har en solcellepark der producerer 150 MWh/år, vi har elforbrug fra Ørsted, vi har kølemiddelforbrug og diesel. Men hvem har de data samlet? Ligger det i et regneark, i e-conomic, eller har vi slet ikke samlet det? Jeg har en fornemmelse af at det er spredt for alle vinde.", metadata: { from: "rasmus@hansens-is.dk", to: "trine@hansens-is.dk", subject: "Energidata og CO2 — hvem har overblikket?", date: daysAgoDate(9) } },

  // Trine → Rasmus: fragmenteret data
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 8, content: "Rasmus, du har ret i at det er spredt. Elforbrug ligger i et separat regneark som jeg får fra Ørsted kvartalsvis — men det er rå tal, ikke CO2-omregnet. Solcelleparken har en online portal med produktionsdata, men ingen logger ind regelmæssigt. Dieselforbrug ligger i Jonas' transportregnskab. Kølemiddelpåfyldning er Niels' ansvar men han registrerer det i en papirlog. Kort sagt: vi har data, men ingen har systematiseret det, og der er ingen der ejer det. Det er et reelt hul.", metadata: { from: "trine@hansens-is.dk", to: "rasmus@hansens-is.dk", subject: "RE: Energidata og CO2 — hvem har overblikket?", date: daysAgoDate(8) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 12 — Foodexpo 2026 forberedelse (~3 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Kalender: Foodexpo
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: -14, content: "Foodexpo 2026 — Herning. Hansens Flødeis stand. Kontaktperson: Camilla. Status: Registreret, stand-placering tildelt (Hal B, stand 42). Materialer: IKKE bestilt. Budget: IKKE godkendt af bestyrelsen. Note: Stand-materialer skal bestilles senest 6 uger før = nu.", metadata: { title: "Foodexpo 2026 — Herning", attendees: ["camilla@hansens-is.dk", "anders@hansens-is.dk", "rasmus@hansens-is.dk"], date: daysAgoDate(-14) } },

  // Camilla → Rasmus: budget
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 6, content: "Rasmus, vi er registreret til Foodexpo i Herning den 15. marts (altså om ca. 2 uger). Standbudgettet er 45.000 DKK for standopbygning, materialer, prøver og transport. Det er IKKE godkendt af bestyrelsen endnu. Vi skal bestille standmaterialer NU hvis vi skal have dem til tiden — leveringstid er 10 hverdage. Kan du godkende det inden bestyrelsesmødet, eller skal jeg vente?", metadata: { from: "camilla@hansens-is.dk", to: "rasmus@hansens-is.dk", subject: "Foodexpo 2026 — standbudget 45.000 DKK, godkendt?", date: daysAgoDate(6) } },

  // Rasmus → Camilla: vent
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 5, content: "Camilla, med den likviditetssituation vi har lige nu kan jeg ikke godkende 45.000 DKK uden bestyrelsens accept. Vent til efter bestyrelsesmødet den 14. april. Jeg ved godt det er tight med leveringstiden, men vi bliver nødt til at spørge Annemette. Undersøg om standleverandøren kan lave en hastelevering mod merpris — det er i hvert fald bedre end at bestille og så få nej af bestyrelsen.", metadata: { from: "rasmus@hansens-is.dk", to: "camilla@hansens-is.dk", subject: "RE: Foodexpo 2026 — vent til efter bestyrelsesmøde", date: daysAgoDate(5) } },

  // Camilla → Anders: Foodexpo-forberedelse
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Anders, uanset budget-situationen skal vi have styr på hvad vi viser på Foodexpo. Jeg foreslår at vi fokuserer på Nørgaard Pop og den nye lakridsvariant — begge er nyhederne fra 2026. Har du talt med Robert om OOH-vinklen? Foodexpo er et oplagt sted at pitche til biografer og caféer. Og hvem bemander standen? Jeg tænker dig, mig og Robert.", metadata: { from: "camilla@hansens-is.dk", to: "anders@hansens-is.dk", subject: "Foodexpo — produktfokus og bemanding", date: daysAgoDate(3) } },

  // Camilla (Slack): standleverandør-undersøgelse
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 2, content: "Har ringet til Expo Design — de kan lave hastelevering på standmaterialer med 7 hverdages varsel, men det koster 8.000 DKK ekstra. Så totalen bliver 53.000 DKK. Rasmus, det er endnu mere at bede bestyrelsen om... men alternativet er at stå med en tom stand i Herning. Hvad tænker du?", metadata: { channel: "kontor", authorEmail: "camilla@hansens-is.dk", authorName: "Camilla" } },
];
