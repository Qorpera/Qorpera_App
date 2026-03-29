// ── Tallyo ApS — Story Content ──────────────────────────────────────────
// ~100 hand-written content items covering 11 story threads.
// ~85% Danish, ~15% English. SaaS vocabulary used naturally.

import type { SyntheticContent } from "../../synthetic-types";

function daysAgoDate(d: number): string {
  return new Date(Date.now() - d * 86400000).toISOString();
}

export const TALLYO_STORIES: SyntheticContent[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // Thread 1 — Kreativ Bureau renewal crisis (~12 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Anna ↔ Lena: warm relationship (old)
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 90, content: "Hej Lena, super fedt at høre at jeres team er vokset med 5 nye! Jeg har lavet en onboarding-plan for de nye brugere — lad os tage et kald i næste uge så vi kan gennemgå setup. Vi kan også snakke om de nye Kanban-views I spurgte om. Vh Anna", metadata: { from: "anna@tallyo.dk", to: "lena@kreativbureau.dk", subject: "Onboarding nye brugere + Kanban update", date: daysAgoDate(90) } },

  { sourceType: "email", connectorProvider: "gmail", daysAgo: 75, content: "Anna, vi elsker de nye Kanban-views! Teamet har adopteret dem med det samme. Quick question — kan vi få custom fields på task-cards? Vi vil gerne tracke budget per opgave. Lena", metadata: { from: "lena@kreativbureau.dk", to: "anna@tallyo.dk", subject: "RE: Kanban — custom fields?", direction: "received", date: daysAgoDate(75) } },

  // Lena's farewell
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 55, content: "Hej Anna, jeg ville lige fortælle dig at jeg har sagt op hos Kreativ Bureau. Jeg starter hos Asana som Customer Success Manager i næste måned. Det har været rigtig dejligt at arbejde sammen med dig og hele Tallyo-teamet — I har et fantastisk produkt. Tom Ager overtager mine ansvarsområder, men jeg ved ikke om han har samme entusiasme for Tallyo. God vind! Lena", metadata: { from: "lena@kreativbureau.dk", to: "anna@tallyo.dk", subject: "Personlig besked — jeg stopper hos Kreativ Bureau", direction: "received", date: daysAgoDate(55) } },

  // Anna → Nikolaj: panic
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 54, content: "Nikolaj, vi har et problem. Lena Kristensen er stoppet hos Kreativ Bureau — hun var vores champion og hele grunden til at de valgte Tallyo. Fornyelsen er om 6 uger. Den nye kontakt hedder Tom Ager og er Creative Director — jeg kender ham ikke. Kreativ Bureau er 50 seats og vores største konto. Vi SKAL have en plan. Anna", metadata: { from: "anna@tallyo.dk", to: "nikolaj@tallyo.dk", subject: "URGENT: Kreativ Bureau champion er væk", date: daysAgoDate(54) } },

  // Nikolaj → Mads: escalation
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 53, content: "Mads, heads up — Kreativ Bureau er i fare. Lena (vores champion) er gået til Asana. Fornyelse om 6 uger. 50 seats, 225K DKK ARR. Anna prøver at bygge relation til den nye kontakt Tom Ager, men han er ikke svaret endnu. Værst mulige timing med Q2 target-gapet. Kan vi tage det på leadership-mødet i morgen?", metadata: { from: "nikolaj@tallyo.dk", to: "mads@tallyo.dk", subject: "Kreativ Bureau — churn risk", date: daysAgoDate(53) } },

  // Tom Ager's first email — formal, evaluating
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 12, content: "Hej Anna, tak for dine beskeder. Undskyld den sene respons — vi har haft travlt med at reorganisere internt. Jeg vil gerne forstå bedre hvad vi betaler for og om Tallyo stadig passer til vores behov. Vi er i gang med at gennemgå vores værktøjsstak og har fået henvendelser fra Asana og Monday. Kan vi booke et møde i næste uge? Tom Ager, Creative Director, Kreativ Bureau", metadata: { from: "tom@kreativbureau.dk", to: "anna@tallyo.dk", subject: "RE: Introduktion — Tallyo x Kreativ Bureau", direction: "received", date: daysAgoDate(12) } },

  // Anna's unanswered follow-up
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 17, content: "Hej Tom, mit navn er Anna Friis og jeg er jeres Account Executive hos Tallyo. Lena fortalte mig at du overtager ansvaret for jeres projektværktøjer. Jeg vil gerne invitere dig til et kort introduktionsmøde så vi kan gennemgå jeres setup og høre om jeres behov fremadrettet. Hvornår passer det dig? Vh Anna Friis, Tallyo ApS", metadata: { from: "anna@tallyo.dk", to: "tom@kreativbureau.dk", subject: "Introduktion — Tallyo x Kreativ Bureau", date: daysAgoDate(17) } },

  // Anna second follow-up — still no response at this point
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 14, content: "Hej Tom, jeg ville lige følge op på min tidligere mail. Jeg forstår I har travlt — men vores team kan hjælpe med at optimere jeres workflow. Vi har også lanceret nye features siden sidst som jeres team måske kan have glæde af. Er du åben for et kort kald på 15 min? Vh Anna", metadata: { from: "anna@tallyo.dk", to: "tom@kreativbureau.dk", subject: "RE: Introduktion — Tallyo x Kreativ Bureau (opfølgning)", date: daysAgoDate(14) } },

  // Slack #sales: Anna venting
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 13, content: "Tom Ager fra Kreativ Bureau har ikke svaret i 5 dage. Jeg har sendt 2 mails. Deres fornyelse er om 6 uger og de evaluerer Asana og Monday. Nogen der har en relation derind? 😰", metadata: { channel: "sales", authorEmail: "anna@tallyo.dk", authorName: "Anna Friis" } },

  // Calendar: Anna + Tom meeting scheduled
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 5, content: "Introduktionsmøde — Tallyo x Kreativ Bureau. Anna Friis og Tom Ager. Agenda: Gennemgang af nuværende setup, nye features i v3.2, feedback fra teamet, fornyelsesdiskussion. Anna forbereder custom demo med Kreativ Bureaus data.", metadata: { title: "Kreativ Bureau — introduktionsmøde", attendees: ["anna@tallyo.dk", "tom@kreativbureau.dk"], date: daysAgoDate(5) } },

  // Drive doc: retention plan
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 10, content: "Kreativ Bureau — Retention Plan. Status: HIGH RISK. Konto: 50 seats, 225K DKK ARR, vores største kunde. Risikofaktorer: Champion (Lena) er gået til Asana. Ny kontakt (Tom Ager) evaluerer konkurrenter. Ingen engagement fra Tom i 5 dage. Strategi: 1) Book intro-møde med Tom ASAP, 2) Tilbyd executive sponsor meeting (Mads + Tom), 3) Forbered custom ROI-analyse baseret på deres usage data, 4) Overvej lock-in rabat: 15% ved 2-årig fornyelse. Ansvarlig: Anna Friis. Deadline: Fornyelse 1. maj 2026.", metadata: { fileName: "Kreativ_Bureau_Retention_Plan.docx", author: "Anna Friis", lastModified: daysAgoDate(10) } },

  // Nikolaj Slack response
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 13, content: "Anna — prøv LinkedIn. Og lad os overveje at sende Mads ind som exec sponsor. Det kan gøre en forskel at CEO'en tager direkte kontakt. Lad os koordinere i morgen.", metadata: { channel: "sales", authorEmail: "nikolaj@tallyo.dk", authorName: "Nikolaj Brandt" } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 2 — NordAgentur going cold (~8 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Emil.G → Henrik: check-in #1
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 21, content: "Hej Henrik, håber alt er godt hos NordAgentur! Vi har lanceret nogle nye reporting features som jeres team måske vil sætte pris på. Skal vi tage et hurtigt check-in kald? Vh Emil Grønbech, Customer Success, Tallyo", metadata: { from: "emil.g@tallyo.dk", to: "henrik@nordagentur.dk", subject: "Check-in — nye features i Tallyo", date: daysAgoDate(21) } },

  // Emil.G → Henrik: check-in #2 — concerned
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 14, content: "Hej igen Henrik, jeg ville lige følge op — har I haft mulighed for at kigge på de nye reporting features? Jeg kan også hjælpe med opsætning hvis det er. Vi har ikke set meget aktivitet fra jeres team den seneste tid og vil gerne sikre at alt kører. Vh Emil", metadata: { from: "emil.g@tallyo.dk", to: "henrik@nordagentur.dk", subject: "RE: Check-in — nye features i Tallyo (opfølgning)", date: daysAgoDate(14) } },

  // Old Slack complaint from NordAgentur admin
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 35, content: "Hej Tallyo — Anders fra NordAgentur her. Det nye UI i v3.1 er forvirrende for vores team. Vi kan ikke finde task templates mere. Kan nogen hjælpe?", metadata: { channel: "customer-success", authorEmail: "anders@nordagentur.dk", authorName: "Anders Bjørn" } },

  // Nanna → Mathilde + Emil: login data
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 10, content: "Mathilde og Emil — NordAgentur har ikke logget ind i 3 uger ifølge dashboardet. Af 15 seats er kun 2 aktive. Det er ret alarmerende. Skal vi eskalere det til Nikolaj? Nanna", metadata: { from: "nanna@tallyo.dk", to: "mathilde@tallyo.dk", cc: "emil.g@tallyo.dk", subject: "NordAgentur — ingen aktivitet i 3 uger", date: daysAgoDate(10) } },

  // Mathilde → Nikolaj: showing sales instincts
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 9, content: "Nikolaj, vi har en churn-risiko hos NordAgentur. 15 seats, næsten ingen aktivitet. Emil har prøvet to check-in mails uden svar. Skal vi prøve at ringe direkte? Jeg kan tage det — jeg kender Henrik fra en konference sidste år. Mathilde", metadata: { from: "mathilde@tallyo.dk", to: "nikolaj@tallyo.dk", subject: "NordAgentur — churn risiko, foreslår direkte kontakt", date: daysAgoDate(9) } },

  // Drive doc: NordAgentur account review
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 8, content: "NordAgentur — Account Review. Konto: 15 seats, 112.500 DKK ARR. Aktivitetsdata: Daglige aktive brugere: 2 (ned fra 12 for 6 uger siden). Sidste login af admin: 22 dage siden. Support tickets: 0 seneste 30 dage (var 3-5/måned). NPS score: Ikke besvaret seneste survey. Sidste kontakt: Anders Bjørn klagede over UI i #customer-success for 5 uger siden — vi svarede men hørte ikke mere. Vurdering: Høj churn-risiko. Anbefaling: CEO-til-CEO opkald (Mads → Henrik Nord).", metadata: { fileName: "NordAgentur_Account_Review.docx", author: "Emil Grønbech", lastModified: daysAgoDate(8) } },

  // Calendar: CS standup flagging NordAgentur
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 7, content: "CS Team Standup. NordAgentur flagget som at-risk af Emil. Ingen respons på 2 check-in mails. Mathilde tilbyder at ringe. Beslutning: Mathilde ringer Henrik Nord i morgen. Også diskuteret: ByteWorks support-belastning, Bright Studio onboarding status.", metadata: { title: "CS Team Standup", attendees: ["mathilde@tallyo.dk", "emil.g@tallyo.dk", "sara.j@tallyo.dk", "nanna@tallyo.dk"], recurring: true, date: daysAgoDate(7) } },

  // Sara.J → Emil: insight
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 8, content: "Emil — jeg kiggede i HubSpot og NordAgenturs subscription udløber om 2 måneder. Hvis de ikke re-engager snart tror jeg de churner stille. Har du overvejet at tilbyde en gratis workshop?", metadata: { channel: "customer-success", authorEmail: "sara.j@tallyo.dk", authorName: "Sara Juhl" } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 3 — MediaHuset escalation (~10 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Søren Hald → Mads: escalation email (bypassing CS)
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Mads, jeg skriver direkte til dig fordi dette er kritisk. Jeres v3.2-release har ødelagt vores custom workflow til redaktionsplanlægning. Vi har 40 journalister der ikke kan bruge systemet ordentligt. Vores deadline-tracking er brudt og vi har misset 2 artikeldeadlines i denne uge alene. Vi har kontaktet support 3 gange uden løsning. Vi overvejer alternativer hvis det ikke løses inden fredag. Søren Hald, CTO, MediaHuset A/S", metadata: { from: "soeren@mediahuset.dk", to: "mads@tallyo.dk", subject: "KRITISK: v3.2 har ødelagt vores redaktionsworkflow", direction: "received", date: daysAgoDate(3) } },

  // Mads → Louise + Simon: forwarding
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Louise, Simon — se nedenfor. Vi skal fikse det her NU. MediaHuset er 30 seats og Søren er CTO — han skriver direkte til mig. Det er alvorligt. Simon, kan du undersøge hvad der er gået galt med custom workflows i v3.2? Louise, vi skal have en plan inden i morgen. Mads", metadata: { from: "mads@tallyo.dk", to: "louise@tallyo.dk", cc: "simon@tallyo.dk", subject: "FW: KRITISK: v3.2 har ødelagt vores redaktionsworkflow", date: daysAgoDate(3) } },

  // Simon in Slack #engineering: investigation
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 3, content: "Alle — vi har en P1 fra MediaHuset. Custom workflow triggers er brudt i v3.2. Jeg har fundet buggen: vi ændrede event payload-strukturen i PR #847 og det bryder backward compatibility for workflows der bruger nested conditions. @camilla @rasmus — nogen der reviewede den PR?", metadata: { channel: "engineering", authorEmail: "simon@tallyo.dk", authorName: "Simon Hviid" } },

  // Slack #bugs: technical discussion
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 3, content: "PR #847 review: Rasmus approved det men vi missede edge casen med nested conditions. Det rammer alle kunder der bruger custom workflows med mere end 2 niveauer. Ud over MediaHuset er der potentielt 6 andre konti. Hotfix incoming.", metadata: { channel: "bugs", authorEmail: "simon@tallyo.dk", authorName: "Simon Hviid" } },

  // Rasmus response
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 3, content: "Shit, det er min fejl. Jeg testede kun med simple workflows. Vi mangler integration tests for nested conditions — det har vi diskuteret 3 gange men aldrig prioriteret det 😔", metadata: { channel: "bugs", authorEmail: "rasmus@tallyo.dk", authorName: "Rasmus Lind" } },

  // Louise → Simon: emergency 1:1
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 2, content: "Emergency 1:1 — MediaHuset bug. Simon briefer Louise om root cause. Hotfix estimat: Torsdag eftermiddag hvis Maja dropper alt for at teste. Problem: Maja har 14 PRs i review-kø allerede. Beslutning: Maja fokuserer 100% på hotfix, alt andet parkeres.", metadata: { title: "Emergency: MediaHuset v3.2 bug", attendees: ["louise@tallyo.dk", "simon@tallyo.dk"], date: daysAgoDate(2) } },

  // Simon's estimate email
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 2, content: "Louise + Mads, her er planen: Hotfix klar torsdag sen eftermiddag, men det kræver at Maja dropper alt andet for at teste. Vi ruller ud fredag morgen. Risiko: Andre PRs bliver forsinket 3-5 dage. Alternativ: Vi kan shippe uden fuld test men det er risikabelt. Anbefaling: Tag det sikre, ship fredag morgen. Simon", metadata: { from: "simon@tallyo.dk", to: "louise@tallyo.dk", cc: "mads@tallyo.dk", subject: "MediaHuset hotfix — plan og estimat", date: daysAgoDate(2) } },

  // Maja in Slack
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 2, content: "Jeg har allerede 14 PRs i kø og nu skal jeg droppe alt for en hotfix. Jeg siger ikke nej — MediaHuset er vigtig. Men vi SKAL snakke om QA-kapacitet på retro. Det kan ikke blive ved med at være mig alene 😤", metadata: { channel: "engineering", authorEmail: "maja@tallyo.dk", authorName: "Maja Vestergaard" } },

  // Mads → Søren: diplomatic response
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 2, content: "Søren, tak for at gøre mig opmærksom på problemet. Jeg har personligt prioriteret det og vores engineering-team arbejder på en hotfix der vil være klar fredag morgen. Problemet skyldes en backward compatibility-fejl i vores seneste release og vi tager fuld ansvar. Jeg garanterer at jeres workflow vil fungere som før senest fredag kl 10. Derudover tilbyder vi 2 timers gratis konsulent-tid til at gennemgå jeres setup og sikre optimal konfiguration. Med venlig hilsen, Mads Kjeldsen, CEO, Tallyo ApS", metadata: { from: "mads@tallyo.dk", to: "soeren@mediahuset.dk", subject: "RE: KRITISK: v3.2 har ødelagt vores redaktionsworkflow", date: daysAgoDate(2) } },

  // Drive doc: incident postmortem (draft)
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 1, content: "Incident Postmortem — v3.2 Custom Workflow Regression. Status: DRAFT. Incident: Custom workflow triggers med nested conditions stoppede med at virke efter v3.2 deployment. Impact: Mindst 7 kunder, heraf MediaHuset (30 seats) som eskalerede til CEO-niveau. Root cause: PR #847 ændrede event payload-struktur uden backward compatibility for nested conditions. Review processede godkendte PR'en men edge case blev ikke testet. Contributing factors: 1) Ingen integration tests for nested workflow conditions, 2) Sole QA (Maja) var overbelastet, 3) Ingen canary deployment. Action items: 1) Skriv integration tests for alle workflow-varianter, 2) Implementér canary deployments, 3) Adresser QA-kapacitet (se hiring proposal). Ansvarlig: Simon Hviid.", metadata: { fileName: "Postmortem_v3.2_workflow_regression_DRAFT.docx", author: "Simon Hviid", lastModified: daysAgoDate(1) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 4 — Q2 pipeline gap (~8 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Nikolaj → Mads: pipeline review
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 7, content: "Mads, Q2 pipeline-status er bekymrende. Vi ligger på 62% af target med 6 uger tilbage. Breakdown: Anna har 2 aktive deals (Kreativ Bureau renewal 225K og DesignKollektivet expansion 96K) — begge ser reelle ud men Kreativ Bureau er risikabel. Peter har 3 deals i pipeline for samlet 180K men ingen af dem har haft aktivitet den seneste uge. Christians deals er early stage. Vi mangler ca. 400K for at nå Q2 target. Lad os snakke om det.", metadata: { from: "nikolaj@tallyo.dk", to: "mads@tallyo.dk", subject: "Q2 pipeline — vi ligger bagud", date: daysAgoDate(7) } },

  // Peter's deal update — vague
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 6, content: "Nikolaj, update på mine deals: ProjektPartner — har sendt tilbud, venter på svar. NorthStar — de er interesserede, vi snakker igen snart. Reklamegruppen — god dialog, de overvejer det. Samlet pipeline: 180K. Peter", metadata: { from: "peter.m@tallyo.dk", to: "nikolaj@tallyo.dk", subject: "Deal update uge 13", date: daysAgoDate(6) } },

  // Anna's deal update — specific
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 6, content: "Nikolaj, her er min pipeline-update: 1) Kreativ Bureau (225K) — møde med Tom Ager booket til tirsdag. Risiko: høj, men jeg har en retention plan klar. 2) DesignKollektivet (96K) — Natasja har godkendt internt. Kontrakt sendes mandag, closing forventet inden uge 15. 3) Bright Studio (36K) — closed won, onboarding kører med Pernille. Anna", metadata: { from: "anna@tallyo.dk", to: "nikolaj@tallyo.dk", subject: "Pipeline update uge 13", date: daysAgoDate(6) } },

  // Nikolaj → Mads: private concern about Peter
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 5, content: "Mads, vi skal snakke om Peter. Hans deal updates er vage — 'de er interesserede', 'vi snakker snart' — uden specifikke næste skridt eller datoer. Sammenlign med Annas updates. Jeg har coachet ham 3 gange i Q1 og det har ikke ændret sig. Ikke akut, men det skal adresseres inden Q2 evaluering. Nikolaj", metadata: { from: "nikolaj@tallyo.dk", to: "mads@tallyo.dk", subject: "Peter M — fortroligt", date: daysAgoDate(5) } },

  // Slack #sales: weekly standup
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 5, content: "Pipeline standup uge 13 📊\n\nAnna: 321K (Kreativ 225K risk, DesignKoll 96K solid)\nPeter: 180K (3 deals, ingen bevægelse)\nChristian: 45K (early stage)\nJulie: 30K (Ny lead via webinar)\n\nTotal pipeline: 576K. Target: 920K. Gap: 344K. Vi skal have mere ind. Fokus i næste uge: outbound!", metadata: { channel: "sales", authorEmail: "nikolaj@tallyo.dk", authorName: "Nikolaj Brandt" } },

  // Drive doc: Q2 forecast
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 5, content: "Tallyo Q2 2026 — Pipeline Forecast. Target: 920.000 DKK ny ARR. Current pipeline: 576.000 DKK (62,6%). Breakdown by rep: Anna Friis — 321K (confidence: 65%), Peter Mortensen — 180K (confidence: 30%), Christian Lund — 45K (confidence: 20%), Julie Hauge — 30K (confidence: 15%). Weighted pipeline: 245K. Gap to target: 675K (weighted). Risk factors: Kreativ Bureau renewal er ikke ny ARR men churn prevention. Peters pipeline er stagneret. Action items: 1) Outbound blitz uge 14-15, 2) Peter coaching session, 3) Marketing webinar-kampagne.", metadata: { fileName: "Q2_Pipeline_Forecast.xlsx", author: "Nikolaj Brandt", lastModified: daysAgoDate(5) } },

  // Calendar: Nikolaj + Mads about pipeline
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 4, content: "Nikolaj + Mads 1:1. Q2 pipeline gennemgang. Mads: Vi skal have Peter til at levere eller finde en løsning. Nikolaj: Giver ham en sidste coaching-runde og sætter klare KPI'er for april. Kreativ Bureau — Mads tilbyder at deltage i mødet med Tom som exec sponsor. Diskussion om outbound-strategi med Freja.", metadata: { title: "Nikolaj + Mads 1:1", attendees: ["nikolaj@tallyo.dk", "mads@tallyo.dk"], date: daysAgoDate(4) } },

  // Fie → Nikolaj: CRM observation
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 4, content: "Nikolaj — jeg ryddede op i HubSpot i dag og lagde mærke til at Peters deal med Reklamegruppen ikke har haft nogen noter i 14 dage. Og NorthStar-dealen har stået på 'qualification' i 2 måneder. Bare FYI 🤷‍♀️", metadata: { channel: "sales", authorEmail: "fie@tallyo.dk", authorName: "Fie Andersen" } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 5 — Engineering overload / QA bottleneck (~10 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Simon in Slack: PR queue frustration
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 10, content: "14 PRs venter på review. Ældste er 8 dage gammel. Det kan ikke fortsætte. Vi har en deploy pipeline der er designet til daglige releases men vi shipper ugentligt pga. review-bottleneck. @louise kan vi tage det op?", metadata: { channel: "engineering", authorEmail: "simon@tallyo.dk", authorName: "Simon Hviid" } },

  // Maja's response
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 10, content: "Simon — 8 af de 14 PRs venter på QA fra mig. Jeg kan teste 2-3 PRs per dag realistisk. Vi har brug for en QA mere. Eller i det mindste automatiserede tests for de simple flows.", metadata: { channel: "engineering", authorEmail: "maja@tallyo.dk", authorName: "Maja Vestergaard" } },

  // Jakob offering help
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 10, content: "Jeg kan godt lære at lave code review hvis det hjælper? Jeg har ikke erfaring med det men jeg vil gerne bidrage 🙋", metadata: { channel: "engineering", authorEmail: "jakob@tallyo.dk", authorName: "Jakob Winther" } },

  // Simon → Louise: formal request
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 8, content: "Louise, vi er nødt til at adressere QA-kapaciteten. Maja er vores eneste QA og hun kører på 150%. PR-køen er konstant 10-15 stykker og det forsinker alle releases. v3.2-buggen med MediaHuset var et direkte resultat af utilstrækkelig test-dækning. Jeg foreslår at vi ansætter en QA engineer ASAP. Alternativt kan vi investere i test-automatisering men det kræver en dedicated sprint. Vedhæfter et hiring proposal. Simon", metadata: { from: "simon@tallyo.dk", to: "louise@tallyo.dk", subject: "QA hiring — formelt forslag", date: daysAgoDate(8) } },

  // Louise → Mads: budget discussion
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 7, content: "Mads, Simon har ret — vi har et QA-problem. Maja er single point of failure og det koster os (se MediaHuset). En QA engineer koster ca. 45K/måned. Alternativ: 2-ugers test-automatiserings-sprint (billigere men tager kapacitet fra feature work). Hvad siger vores budget? Maria kan nok give os et overblik. Louise", metadata: { from: "louise@tallyo.dk", to: "mads@tallyo.dk", subject: "FW: QA hiring — budget?", date: daysAgoDate(7) } },

  // PR notification-style Slack messages
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 9, content: "PR #851: 'Add webhook retry logic' by @oliver — Awaiting review (3 days) ⏳", metadata: { channel: "engineering", authorEmail: "oliver@tallyo.dk", authorName: "Oliver Krogh" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 7, content: "PR #854: 'Fix timezone handling in recurring tasks' by @katrine — QA blocked, waiting for Maja (2 days) 🔴", metadata: { channel: "engineering", authorEmail: "katrine@tallyo.dk", authorName: "Katrine Bech" } },

  // Calendar: engineering retro
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 4, content: "Engineering Retrospective. Deltagere: Simon, Camilla, Jakob, Maja, Rasmus, Oliver, Katrine, Steen (remote). Hovedtema: QA bottleneck. Maja: 'Jeg brænder ud'. Simon: 'Vi har brug for en ekstra QA eller automatisering'. Beslutning: Simon sender hiring proposal til Louise. Steen tilbyder at opsætte CI/CD pipeline til automatiseret smoke testing. Jakob melder sig til at lære code review.", metadata: { title: "Engineering Retrospective", attendees: ["simon@tallyo.dk", "camilla@tallyo.dk", "jakob@tallyo.dk", "maja@tallyo.dk", "rasmus@tallyo.dk", "oliver@tallyo.dk", "katrine@tallyo.dk", "steen@tallyo.dk"], date: daysAgoDate(4) } },

  // Drive doc: hiring proposal
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 6, content: "Engineering Hiring Proposal — QA Engineer. Baggrund: Tallyo har 1 QA engineer (Maja Vestergaard) til 7 udviklere. Industry standard er 1:3-4. PR review-kø er konstant 10-15 dage. v3.2 regression (MediaHuset) var direkte resultat af utilstrækkelig testdækning. Profil: Mid-level QA engineer, erfaring med automated testing, Playwright/Cypress. Budget: 40-50K DKK/måned. Tidsplan: Opslag uge 15, ansættelse uge 20-22. ROI: Reducerer release-cyklus fra 7 til 2 dage. Forebygger customer-facing bugs. Status: AFVENTER BUDGET-GODKENDELSE.", metadata: { fileName: "QA_Hiring_Proposal_2026.docx", author: "Simon Hviid", lastModified: daysAgoDate(6) } },

  // Mads kicking the can
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 6, content: "Simon — jeg har set forslaget. Godt arbejde. Lad os tale om det på mandag — vi skal have Marias input på budgettet først. 👍", metadata: { channel: "engineering", authorEmail: "mads@tallyo.dk", authorName: "Mads Kjeldsen" } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 6 — Camilla attrition signals (~8 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Old Camilla: engaged, detailed
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 65, content: "Simon, her er mine tanker om den nye API-arkitektur. Jeg har lavet et udkast med 3 mulige tilgange — se vedhæftet. Min anbefaling er option B (GraphQL gateway) fordi det giver os bedre caching og vi kan migrere gradvist fra REST. Jeg har også taget Jakob med på review af option A så han kan lære lidt om system design. Lad os diskutere det på standup i morgen. Camilla", metadata: { from: "camilla@tallyo.dk", to: "simon@tallyo.dk", subject: "API Architecture v3 — udkast og anbefalinger", date: daysAgoDate(65) } },

  // Old Camilla: mentoring Jakob
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 60, content: "Jakob — god first PR! Et par ting: 1) Husk at bruge vores error handling pattern fra `utils/errors.ts`, 2) Tilføj unit tests for edge cases (null input, empty array). Ellers ser det rigtig fint ud 🎉", metadata: { channel: "engineering", authorEmail: "camilla@tallyo.dk", authorName: "Camilla Rask" } },

  // Recent Camilla: shorter, less detailed
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 8, content: "Simon, PR #849 er klar til review. Ændringer i auth-modulet. Camilla", metadata: { from: "camilla@tallyo.dk", to: "simon@tallyo.dk", subject: "PR #849 klar", date: daysAgoDate(8) } },

  // Declined social events
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 12, content: "Tak for invitationen men jeg kan desværre ikke til team dinner fredag. God aften!", metadata: { channel: "random", authorEmail: "camilla@tallyo.dk", authorName: "Camilla Rask" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 5, content: "Skipping fredagsbar i dag — har noget jeg skal nå. Hygge jer 🍻", metadata: { channel: "random", authorEmail: "camilla@tallyo.dk", authorName: "Camilla Rask" } },

  // LinkedIn observation from colleague
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 4, content: "Har I set Camilla har opdateret sin LinkedIn? Ny profilbeskrivning og nyt foto... 👀", metadata: { channel: "random", authorEmail: "katrine@tallyo.dk", authorName: "Katrine Bech" } },

  // Camilla's knowledge silo doc
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 40, content: "API Architecture v3 — Technical Design Document. Author: Camilla Rask. Status: Approved. Architecture: GraphQL gateway pattern with schema stitching. Core modules: Authentication (JWT + refresh tokens), Authorization (RBAC with team-level scoping), Data layer (Prisma ORM with connection pooling), Caching (Redis with per-query TTL). Migration plan: 12-week rollout, backward compatible REST endpoints maintained for 6 months. BEMÆRK: Denne arkitektur er single-author og kræver overdragelse inden Camilla evt. roterer til andet team. Ingen andre har fuld forståelse af caching-laget.", metadata: { fileName: "API_Architecture_v3_Design.docx", author: "Camilla Rask", lastModified: daysAgoDate(40) } },

  // No recent 1:1 (the absence is the signal — but we show the last one)
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 21, content: "Louise + Camilla 1:1. Camilla: Alt kører godt. Ingen bekymringer. Arbejder på auth-modulet, regner med at være færdig i næste uge. Louise: God feedback fra Simon om API-arkitekturen. Planlægger rotationsordning for code review. Næste 1:1 om en uge.", metadata: { title: "Louise + Camilla 1:1", attendees: ["louise@tallyo.dk", "camilla@tallyo.dk"], date: daysAgoDate(21) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 7 — Seed round preparation (~8 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Victor → Mads: introductory email
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 21, content: "Hej Mads, det var godt at møde dig til Danish Startup Awards. Tallyo lyder som præcis den type virksomhed vi gerne vil investere i — vertikal SaaS med stærk retention i creative-segmentet. Kan vi tage et dybere kald i næste uge? Jeg vil gerne forstå jeres unit economics og growth trajectory. Vh Victor Engel, Partner, ScaleUp Ventures", metadata: { from: "victor@scaleupventures.dk", to: "mads@tallyo.dk", subject: "Opfølgning fra Danish Startup Awards", direction: "received", date: daysAgoDate(21) } },

  // Mads → Victor: follow-up
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 18, content: "Victor, tak for interessen! Vi er klar til at dele mere. Vi har stærke retention-tal (net revenue retention over 110%) og vokser 30% YoY. Lad os booke et møde med vores CFO Maria Bak som kan gennemgå tallene. Hvad siger tirsdag kl 14? Mads", metadata: { from: "mads@tallyo.dk", to: "victor@scaleupventures.dk", subject: "RE: Opfølgning fra Danish Startup Awards", date: daysAgoDate(18) } },

  // Mads → Maria: prepare financials
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 17, content: "Maria, vi har en potentiel seed-investor (ScaleUp Ventures). Kan du forberede de seneste 12 måneders tal? ARR, MRR-udvikling, churn rate, unit economics, burn rate. Lad os gennemgå det sammen inden mødet tirsdag. Mads", metadata: { from: "mads@tallyo.dk", to: "maria@tallyo.dk", subject: "Seed round — forberedelse af tal", date: daysAgoDate(17) } },

  // Maria's financials (Drive doc)
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 14, content: "Tallyo Financial Summary — 12 Months (Confidential). ARR: 1.200.000 DKK (per marts 2026). MRR: 100.000 DKK. MRR Growth: +4,2% month-over-month (gennemsnit). Net Revenue Retention: 112%. Gross Churn: 3,8% annually. Customer count: 42 paying accounts. ARPA: 28.571 DKK/år. CAC: 18.000 DKK (blended). LTV/CAC: 4,2x. Burn rate: 180.000 DKK/måned. Runway: 14 måneder med nuværende burn. BEMÆRK: ARR-tallet inkluderer IKKE FlowAgency reseller-revenue (150K) som endnu ikke er bogført. HubSpot-dashboard viser 1.35M ARR — forskellen er timing af FlowAgency-recognition.", metadata: { fileName: "Tallyo_Financial_Summary_Confidential.xlsx", author: "Maria Bak", lastModified: daysAgoDate(14) } },

  // Mads → Louise: board deck
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 12, content: "Louise, vi skal have et seed deck klar til ScaleUp Ventures. Kan du tage product vision-sektionen? Jeg tager market size og financials (Maria har tallene). Vi mangler også en slide om tech architecture — kan Camilla lave den? Vi skal have det færdigt inden næste uge. Mads", metadata: { from: "mads@tallyo.dk", to: "louise@tallyo.dk", subject: "Seed deck — fordeling af sektioner", date: daysAgoDate(12) } },

  // Calendar: ScaleUp meeting scheduled
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 7, content: "Tallyo x ScaleUp Ventures — Deep Dive. Mads, Maria og Louise fra Tallyo. Victor og Astrid fra ScaleUp. Agenda: 1) Company overview, 2) Product demo, 3) Financial deep dive, 4) Growth strategy, 5) Use of proceeds. Victor's feedback: Positive, wants to see Q2 pipeline before term sheet.", metadata: { title: "ScaleUp Ventures — Seed Deep Dive", attendees: ["mads@tallyo.dk", "maria@tallyo.dk", "louise@tallyo.dk", "victor@scaleupventures.dk", "astrid@scaleupventures.dk"], date: daysAgoDate(7) } },

  // Drive doc: seed deck (draft)
  { sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 5, content: "Tallyo Seed Deck — DRAFT. Slide 1: Mission — The project management tool built for creative agencies. Slide 2: Problem — Generic PM tools don't understand creative workflows. Slide 3: Solution — Tallyo's visual workflow engine. Slide 4: Traction — 42 paying customers, 112% NRR, 30% YoY growth. Slide 5: Market — $4.2B creative agency software market (Mordor Intelligence). Slide 6: Product — Live demo. Slide 7: Tech Architecture — [SECTION INCOMPLETE — waiting for Camilla]. Slide 8: Financials — [SECTION INCOMPLETE — Maria finalizing]. Slide 9: Team. Slide 10: Ask — 5M DKK seed round for 15% equity.", metadata: { fileName: "Tallyo_Seed_Deck_DRAFT.pptx", author: "Mads Kjeldsen", lastModified: daysAgoDate(5) } },

  // Astrid follow-up
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Hi Mads, thanks for the meeting last week. Victor and I were impressed by the product and team. Before we proceed, we'd like to see: 1) Updated Q2 pipeline forecast, 2) Completed financials section in the deck, 3) Customer reference calls (2-3 accounts). Can you have these ready by end of next week? Best, Astrid Lykke, ScaleUp Ventures", metadata: { from: "astrid@scaleupventures.dk", to: "mads@tallyo.dk", subject: "Next steps — ScaleUp x Tallyo", direction: "received", date: daysAgoDate(3) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 8 — FlowAgency dual relationship (~6 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Jesper → support: feature request (client hat)
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 15, content: "Hej Tallyo support, vi har brug for muligheden for at oprette sub-workspaces for vores kunder. Lige nu deler alle vores kunder det samme workspace og det er ikke ideelt. Er det noget I har på roadmappen? Jesper Flow, FlowAgency", metadata: { from: "jesper@flowagency.dk", to: "support@tallyo.dk", subject: "Feature request: Sub-workspaces", direction: "received", date: daysAgoDate(15) } },

  // Jesper → Nikolaj: reseller question (partner hat)
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 12, content: "Hej Nikolaj, vi har en ny kunde (DesignLab) der gerne vil onboarde via vores reseller-aftale. Hvad er processen for at oprette en sub-account? Og hvornår kan vi forvente Q1 provision-udbetalingen? Vi har stadig ikke modtaget den. Jesper", metadata: { from: "jesper@flowagency.dk", to: "nikolaj@tallyo.dk", subject: "Reseller: Ny sub-account + provision Q1", direction: "received", date: daysAgoDate(12) } },

  // Jesper: same thread, switching hats
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 11, content: "Nikolaj, en ting mere — som bruger af Tallyo (ikke reseller) har vi også et problem med at vores time tracking-data mangler efter v3.2 opdateringen. Kan du eskalere det? Det er svært at vide hvem jeg skal skrive til for hvad 😅 Jesper", metadata: { from: "jesper@flowagency.dk", to: "nikolaj@tallyo.dk", subject: "RE: Reseller: Ny sub-account + provision Q1 + time tracking bug", direction: "received", date: daysAgoDate(11) } },

  // Fie's CRM observation
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 10, content: "Nikolaj — FlowAgency er both klient og partner i HubSpot og det er et rod. De har 2 company records, 3 deals (1 subscription, 1 reseller, 1 support), og Jesper er kontakt på alle tre. Vi skal have styr på det.", metadata: { channel: "sales", authorEmail: "fie@tallyo.dk", authorName: "Fie Andersen" } },

  // Trine: invoice confusion
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 8, content: "Maria, jeg er i tvivl om FlowAgency-faktureringen. De har en subscription (12.500/måned) OG vi skylder dem reseller-provision (ca. 15.000 for Q1). Skal vi modregne eller kører det separat? Og hvilken HubSpot-record bruger vi? Pernille", metadata: { from: "pernille@tallyo.dk", to: "maria@tallyo.dk", subject: "FlowAgency — faktura vs. provision", date: daysAgoDate(8) } },

  // Maria → Pernille: clarification
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 7, content: "Pernille, hold dem adskilt. Subscription faktureres normalt via Stripe. Provisionen udbetales manuelt via bankoverførsel — send den til mig for godkendelse. Og ja, vi skal rydde op i HubSpot. Fie har tilbudt at tage det. Maria", metadata: { from: "maria@tallyo.dk", to: "pernille@tallyo.dk", subject: "RE: FlowAgency — faktura vs. provision", date: daysAgoDate(7) } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 9 — Peter.M underperformance (~6 items)
  // ═══════════════════════════════════════════════════════════════════════

  // Peter's vague update (another one)
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 13, content: "Nikolaj, kort update: Jeg har haft et godt møde med ProjektPartner — de er positive. NorthStar overvejer stadig. Reklamegruppen har bedt om en demo til deres team. Arbejder på det. Peter", metadata: { from: "peter.m@tallyo.dk", to: "nikolaj@tallyo.dk", subject: "Pipeline update uge 12", date: daysAgoDate(13) } },

  // Nikolaj's coaching email
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 11, content: "Peter, tak for updaten. Jeg mangler lidt mere detalje — hvornår er næste møde med ProjektPartner? Hvem er decision maker? Hvad er deres timeline? For NorthStar — 'overvejer stadig' er ikke et next step. Kan vi definere en konkret handling du kan tage i denne uge? Lad os gennemgå dine deals 1:1 i morgen. Nikolaj", metadata: { from: "nikolaj@tallyo.dk", to: "peter.m@tallyo.dk", subject: "RE: Pipeline update uge 12 — mere detalje", date: daysAgoDate(11) } },

  // Peter's response
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 10, content: "Nikolaj, du har ret — jeg skal være mere specifik. ProjektPartner: Næste møde fredag kl 14. Decision maker: Magnus Kvist, Managing Partner. NorthStar: Jeg ringer Birgitte i morgen for at aftale demo. Reklamegruppen: Demo booket torsdag. Jeg arbejder på det, Q2 bliver bedre. Peter", metadata: { from: "peter.m@tallyo.dk", to: "nikolaj@tallyo.dk", subject: "RE: Pipeline update uge 12 — mere detalje", date: daysAgoDate(10) } },

  // Calendar: Nikolaj + Peter 1:1
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 9, content: "Nikolaj + Peter 1:1. Pipeline gennemgang. ProjektPartner: Peter har møde fredag — Nikolaj coacher på closing-strategi. NorthStar: Ingen bevægelse, Peter skal ringe Birgitte. Reklamegruppen: Demo torsdag. Action items: 1) Ring NorthStar IDAG, 2) Forbered ProjektPartner proposal, 3) Opdater HubSpot noter dagligt. Nikolaj: 'Peter, du har potentialet men du skal følge op mere aggressivt.'", metadata: { title: "Nikolaj + Peter 1:1", attendees: ["nikolaj@tallyo.dk", "peter.m@tallyo.dk"], date: daysAgoDate(9) } },

  // Client declining — but Peter hasn't updated CRM
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 6, content: "Kære Peter, tak for præsentationen. Vi har gennemgået jeres tilbud grundigt, men vi har desværre valgt en anden løsning der bedre passer til vores budget. Vi ønsker jer alt godt. Venlig hilsen, Birgitte Holm, NorthStar Consulting", metadata: { from: "birgitte@northstar-consulting.dk", to: "peter.m@tallyo.dk", subject: "RE: Tallyo Pro — tilbud NorthStar Consulting", direction: "received", date: daysAgoDate(6) } },

  // Nikolaj noticing
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 2, content: "Peter — hvad er status på NorthStar? Den står stadig som 'qualification' i HubSpot men det er over 2 måneder siden du oprettede den. Opdater venligst 🙏", metadata: { channel: "sales", authorEmail: "nikolaj@tallyo.dk", authorName: "Nikolaj Brandt" } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 10 — ByteWorks support burden (~6 items)
  // ═══════════════════════════════════════════════════════════════════════

  // ByteWorks support ticket #1
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 20, content: "Hej Tallyo, vi oplever igen problemer med at tasks forsvinder fra vores board. Det skete også for 3 uger siden og I sagde det var fikset. Kan I kigge på det? Karsten Ravn, ByteWorks", metadata: { from: "karsten@byteworks.dk", to: "support@tallyo.dk", subject: "Tasks forsvinder IGEN fra board", direction: "received", date: daysAgoDate(20) } },

  // ByteWorks support ticket #2 — same issue
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 11, content: "Hej, det sker stadig. Vi har nu mistet 3 tasks med kundedeadlines. Det er ikke acceptabelt. Vi betaler for et værktøj der skal virke. Karsten", metadata: { from: "karsten@byteworks.dk", to: "support@tallyo.dk", subject: "RE: Tasks forsvinder IGEN fra board — 3. gang", direction: "received", date: daysAgoDate(11) } },

  // Sara.J's internal email
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 9, content: "Mathilde, jeg bruger ca. 40% af min tid på ByteWorks. De har 8 seats og betaler 4.800 DKK/måned. Tre identiske support tickets om forsvundne tasks — det er en browser caching-bug som engineering kender men ikke har fixet. Derudover ringer Karsten mig direkte 2-3 gange om ugen. Det er ikke bæredygtigt. Sara", metadata: { from: "sara.j@tallyo.dk", to: "mathilde@tallyo.dk", subject: "ByteWorks support-belastning", date: daysAgoDate(9) } },

  // Mathilde → Nikolaj: worth keeping?
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 8, content: "Nikolaj, vi har en diskussion om ByteWorks. Sara bruger 40% af sin tid på dem — det er dyrt i CS-kapacitet for en 4.800 DKK/måned konto. De har et legitimt bug-problem men også urealistiske forventninger til support-niveau. Er det værd at beholde dem? Eller skal vi hjælpe dem med at migrere til et mere self-service produkt? Mathilde", metadata: { from: "mathilde@tallyo.dk", to: "nikolaj@tallyo.dk", subject: "ByteWorks — er kontoen profitabel?", date: daysAgoDate(8) } },

  // ByteWorks churn threat
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 4, content: "Hej Sara, tak for din hjælp men vi er frustrerede. Hvis ikke vi ser en reel forbedring i denne måned — specifikt at tasks stopper med at forsvinde — overvejer vi at skifte til ClickUp. Vi kan ikke have et projektværktøj vi ikke kan stole på. Karsten", metadata: { from: "karsten@byteworks.dk", to: "sara.j@tallyo.dk", subject: "ByteWorks — overvejelse om at skifte", direction: "received", date: daysAgoDate(4) } },

  // Sara in Slack
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 3, content: "ByteWorks truer med at skifte til ClickUp. De har en reel bug (task disappearing) som har stået i backlog i 6 uger. Kan vi PLEASE prioritere den? Det er en lille kunde men churnen ser dårligt ud for vores metrics 😔", metadata: { channel: "customer-success", authorEmail: "sara.j@tallyo.dk", authorName: "Sara Juhl" } },

  // Nanna: process suggestion
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 3, content: "Sara — vi burde lave en support triage-proces så de mest kritiske bugs altid flagges til engineering. Lige nu ender det hele i backlog uden prioritering. Kan vi foreslå det til Simon?", metadata: { channel: "customer-success", authorEmail: "nanna@tallyo.dk", authorName: "Nanna Kirk" } },

  // ═══════════════════════════════════════════════════════════════════════
  // Thread 11 — General org signals (~18 items)
  // ═══════════════════════════════════════════════════════════════════════

  // All-hands #1
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 0, content: "Ugentligt all-hands. Mads: Q2 fokus — pipeline, MediaHuset-fix, seed round update. Louise: v3.2 hotfix deployes fredag. Nikolaj: Sales team har outbound blitz i uge 14-15. Freja: Webinar med 120 tilmeldte. Maria: Runway er 14 måneder. Pernille: Bright Studio onboarding igangsat. Wins: Anna closed KreativLab (72K ARR)! 🎉", metadata: { title: "Ugentligt All-Hands", attendees: ["mads@tallyo.dk", "louise@tallyo.dk", "nikolaj@tallyo.dk", "simon@tallyo.dk", "freja@tallyo.dk", "maria@tallyo.dk", "anna@tallyo.dk"], recurring: true, date: daysAgoDate(0) } },

  // All-hands #2
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 7, content: "Ugentligt all-hands. Mads: Møde med ScaleUp Ventures gik godt — de vil se Q2 tal. Louise: v3.2 shipper i dag. Nikolaj: Pipeline er 62% af target. Freja: Blog post om 'Creative workflow automation' performede godt. Maria: Cash position stabil. Pernille: Ny medarbejder i marketing (Sofie Thy) starter i næste uge.", metadata: { title: "Ugentligt All-Hands", attendees: ["mads@tallyo.dk", "louise@tallyo.dk", "nikolaj@tallyo.dk", "simon@tallyo.dk", "freja@tallyo.dk", "maria@tallyo.dk"], recurring: true, date: daysAgoDate(7) } },

  // All-hands #3
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 14, content: "Ugentligt all-hands. Mads: Overordnet retning Q2 — vækst og stabilitet. Louise: Engineering fokus på performance og stabilitet inden v3.2. Nikolaj: Pipeline-opbygning i fuld gang. Freja: Marketing-kampagne lanceret. Maria: Budget review for Q2 påbegyndt.", metadata: { title: "Ugentligt All-Hands", attendees: ["mads@tallyo.dk", "louise@tallyo.dk", "nikolaj@tallyo.dk", "simon@tallyo.dk", "freja@tallyo.dk", "maria@tallyo.dk"], recurring: true, date: daysAgoDate(14) } },

  // Leadership weekly
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 1, content: "Leadership Team Weekly. Mads, Louise, Nikolaj. Punkter: 1) MediaHuset hotfix — deployer fredag, Mads har lovet Søren det. 2) Kreativ Bureau — Anna har møde med Tom, Mads tilbyder exec sponsor. 3) Peter performance — Nikolaj sætter klare KPI'er. 4) QA hiring — Louise præsenterer budget case. 5) Seed round — ScaleUp vil se Q2 pipeline.", metadata: { title: "Leadership Team Weekly", attendees: ["mads@tallyo.dk", "louise@tallyo.dk", "nikolaj@tallyo.dk"], recurring: true, date: daysAgoDate(1) } },

  // Engineering standup summaries
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 0, content: "Standup 🧵\nSimon: MediaHuset hotfix, PR #860\nCamilla: Auth module refactor\nRasmus: Webhook retry logic\nOliver: Performance optimization\nKatrine: Timezone bug fix\nJakob: Onboarding flow improvements\nSteen: CI/CD pipeline, remote\nMaja: Testing PR #860 (hotfix)", metadata: { channel: "engineering", authorEmail: "simon@tallyo.dk", authorName: "Simon Hviid" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 1, content: "Standup 🧵\nSimon: Code review + MediaHuset root cause\nCamilla: PR #849 merged\nRasmus: PR #851 (webhook retries) ready for QA\nOliver: Connection pooling optimization\nKatrine: PR #854 waiting for QA (3 days...)\nJakob: Fixing onboarding wizard bug\nSteen: Deploying new monitoring stack\nMaja: Testing 3 PRs today", metadata: { channel: "engineering", authorEmail: "simon@tallyo.dk", authorName: "Simon Hviid" } },

  // Sales standup calendar
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 3, content: "Sales Team Standup. Nikolaj, Anna, Peter, Fie, Christian, Julie. Pipeline gennemgang: Anna — Kreativ Bureau møde tirsdag. Peter — ProjektPartner fredag, NorthStar uafklaret. Christian — ny lead via conference. Julie — webinar-leads fra Freja. Fie — HubSpot cleanup igangsat. Action: Alle sender 5 outbound mails i denne uge.", metadata: { title: "Sales Team Standup", attendees: ["nikolaj@tallyo.dk", "anna@tallyo.dk", "peter.m@tallyo.dk", "fie@tallyo.dk", "christian@tallyo.dk", "julie@tallyo.dk"], recurring: true, date: daysAgoDate(3) } },

  // CS team standup
  { sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 2, content: "CS Team Standup. Mathilde, Emil, Sara, Nanna. NordAgentur: Mathilde ringer Henrik i dag. ByteWorks: Sara foreslår eskalering af task-bug til engineering. Bright Studio: Onboarding kører planmæssigt med Pernille. Generelt: Nanna foreslår support triage-proces. Mathilde tager det til Nikolaj.", metadata: { title: "CS Team Standup", attendees: ["mathilde@tallyo.dk", "emil.g@tallyo.dk", "sara.j@tallyo.dk", "nanna@tallyo.dk"], recurring: true, date: daysAgoDate(2) } },

  // #product-alpha: cross-functional
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 6, content: "Product Alpha update: Vi tester den nye resource planning feature med 3 kunder i beta. Freja laver en case study med DesignKollektivet. Anna har feedback fra Kreativ Bureau (pre-Lena). Simon vurderer performance impact. Mathilde samler user feedback. Næste milestone: intern demo fredag.", metadata: { channel: "product-alpha", authorEmail: "freja@tallyo.dk", authorName: "Freja Storm" } },

  // Pernille: onboarding email
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 3, content: "Hej Ida, velkommen til Tallyo! Vi glæder os til at komme i gang med Bright Studio. Her er din onboarding-plan: Uge 1: Workspace setup og brugeroprettelse. Uge 2: Workflow-konfiguration. Uge 3: Team training session. Jeg sender kalenderinvitationer til onboarding-calls i morgen. Vh Pernille Krogh, Operations, Tallyo ApS", metadata: { from: "pernille@tallyo.dk", to: "ida@brightstudio.dk", subject: "Velkommen til Tallyo — onboarding plan", date: daysAgoDate(3) } },

  // Maria's monthly summary
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 5, content: "Mads + Louise, her er den månedlige opsummering: MRR: 100K DKK (+2,3% MoM). ARR: 1,2M DKK. Nye kunder denne måned: 2 (KreativLab, Bright Studio). Churn: 0 (men NordAgentur og ByteWorks er risikable). Burn rate: 180K/måned. Cash position: 2,52M DKK. Runway: 14 måneder. BEMÆRK: FlowAgency reseller-revenue (ca. 150K) er endnu ikke bogført — venter på revision af aftalen. Maria", metadata: { from: "maria@tallyo.dk", to: "mads@tallyo.dk", cc: "louise@tallyo.dk", subject: "Månedlig finansiel opsummering — marts 2026", date: daysAgoDate(5) } },

  // Slack #random: Friday bar
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 5, content: "Fredagsbar kl 16! 🍺 Freja har købt snacks. Hvem er med? Og nej, vi diskuterer IKKE tabs vs spaces denne gang 😂", metadata: { channel: "random", authorEmail: "jakob@tallyo.dk", authorName: "Jakob Winther" } },

  // Slack #random: tabs vs spaces
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 12, content: "Okay hear me out — tabs for indentation, spaces for alignment. Best of both worlds. Fight me. 🥊", metadata: { channel: "random", authorEmail: "oliver@tallyo.dk", authorName: "Oliver Krogh" } },

  // Slack #wins
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 10, content: "🎉 KreativLab er signed! 72K ARR, 12 seats. De startede som free trial fra vores webinar i februar. Tak til Freja for kampagnen og Julie for kvalificeringen! /Anna", metadata: { channel: "wins", authorEmail: "anna@tallyo.dk", authorName: "Anna Friis" } },

  // Slack #wins: marketing milestone
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 3, content: "Content milestone: Vores blog post 'Why creative agencies need specialized PM tools' har ramt 5.000 læsere og genereret 23 MQLs! Largest content-driven pipeline batch nogensinde 📈", metadata: { channel: "wins", authorEmail: "freja@tallyo.dk", authorName: "Freja Storm" } },

  // Steen: contractor-like behavior
  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 8, content: "CI/CD pipeline opdatering deployed. Nye monitoring dashboards er live i Grafana. Jeg er offline resten af ugen — faktura for marts sendes mandag. Ping mig på Slack hvis noget brænder 🔥", metadata: { channel: "engineering", authorEmail: "steen@tallyo.dk", authorName: "Steen Gram" } },

  // CodeAudit email (English)
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 15, content: "Hi Louise, here's our preliminary security audit report for Tallyo's API layer. We identified 3 medium-severity findings and 1 low-severity finding. No critical issues. Full report attached. We recommend addressing the medium findings before your next major release. Happy to schedule a call to discuss. Best regards, Klaus Weber, Lead Auditor, CodeAudit GmbH", metadata: { from: "klaus@codeaudit.de", to: "louise@tallyo.dk", subject: "Tallyo API Security Audit — Preliminary Findings", direction: "received", date: daysAgoDate(15) } },

  // Mikkel.A marketing update
  { sourceType: "email", connectorProvider: "gmail", daysAgo: 4, content: "Freja, webinar-registreringerne er oppe på 120 nu. LinkedIn-kampagnen performer over benchmark — 3,2% CTR vs. 1,5% branchegennemsnit. Sofie har lavet et fedt design til landing pagen. Skal vi booste budgettet for de sidste 3 dage? Mikkel", metadata: { from: "mikkel.a@tallyo.dk", to: "freja@tallyo.dk", subject: "Webinar-status — 120 registreringer", date: daysAgoDate(4) } },
];
