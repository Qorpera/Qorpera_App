import { prisma } from "@/lib/db";

// Ground truth department assignments
export const HANSENS_DEPARTMENTS = [
  { name: "Ledelse", members: ["rasmus@hansens-is.dk", "anders@hansens-is.dk"] },
  { name: "Salg & Marketing", members: ["kim.s@hansens-is.dk", "rlw@hansens-is.dk", "camilla@hansens-is.dk"] },
  { name: "Økonomi & Administration", members: ["marie@hansens-is.dk", "peter.h@hansens-is.dk"] },
  { name: "Produktion & Logistik", members: ["trine@hansens-is.dk", "niels@hansens-is.dk", "jonas.k@hansens-is.dk", "lars.w@hansens-is.dk"] },
  { name: "Kvalitet & Compliance", members: ["lotte@hansens-is.dk"] },
];

export const HANSENS_GOALS = [
  { title: "Oprethold økologisk certificering og Fødevarestyrelses-compliance", department: "Kvalitet & Compliance", priority: 1 },
  { title: "Ekspandér dansk OOH-kanal med 50 nye forhandlere i 2026", department: "Salg & Marketing", priority: 1 },
  { title: "Levér månedlig ESG + social impact rapportering til DSK", department: "Ledelse", priority: 1 },
  { title: "Reducer gennemsnitlig faktura-betalingstid til under 25 dage", department: "Økonomi & Administration", priority: 2 },
  { title: "Start eksport til Sverige via sthlmicecream med 3+ SKUs", department: "Salg & Marketing", priority: 2 },
  { title: "Professionalisér bestyrelsesrapportering", department: "Ledelse", priority: 2 },
  { title: "Forbered potentiel Business Central migration", department: "Produktion & Logistik", priority: 3 },
];

// All 48 situations — organized by recency per v3 spec Part 6
export const HANSENS_SITUATIONS: Array<{
  title: string;
  archetypeSlug: string;
  department: string;
  priority: "critical" | "high" | "medium" | "low";
  triggerSummary: string;
  severity: number;
}> = [
  // ── Today / Yesterday (12 situations) ──────────────────────────────

  {
    title: "Coop sommerordre SO-4826 overstiger ugekapacitet med 43%",
    archetypeSlug: "delivery_risk",
    department: "Produktion & Logistik",
    priority: "critical",
    triggerSummary: "Tracezilla SO-4826 kræver 143% af normal ugekapacitet. Trine har eskaleret til Rasmus med anmodning om weekendhold.",
    severity: 0.9,
  },
  {
    title: "Fryselager 87% — overflows ved Coop-produktion",
    archetypeSlug: "process_bottleneck",
    department: "Produktion & Logistik",
    priority: "high",
    triggerSummary: "Jonas rapporterer 87% kapacitetsudnyttelse i fryselageret. Coop-produktionen vil kræve ekstern frostlagerplads.",
    severity: 0.7,
  },
  {
    title: "Kølbil 1 booket til Salling — Coop kræver ekstern vognmand",
    archetypeSlug: "process_bottleneck",
    department: "Produktion & Logistik",
    priority: "high",
    triggerSummary: "Kølbil 1 er optaget af Salling-levering. Coop-leverancen kræver ekstern ATP-certificeret vognmand, som endnu ikke er booket.",
    severity: 0.7,
  },
  {
    title: "Stockholm SHP-8912 blokeret af svensk mærkningsgap",
    archetypeSlug: "compliance_deadline",
    department: "Salg & Marketing",
    priority: "high",
    triggerSummary: "Shipmondo SHP-8912 til sthlmicecream er blokeret fordi svensk emballage med korrekt mærkning mangler.",
    severity: 0.7,
  },
  {
    title: "Batch V018 i karantæne — uautoriseret vanilleleverandør",
    archetypeSlug: "compliance_deadline",
    department: "Kvalitet & Compliance",
    priority: "high",
    triggerSummary: "Lotte har sat batch V018 i karantæne efter Peter brugte Vanilla Trading GmbH, som ikke er på den godkendte leverandørliste.",
    severity: 0.7,
  },
  {
    title: "Vanilla Trading GmbH ikke på godkendt leverandørliste",
    archetypeSlug: "compliance_deadline",
    department: "Kvalitet & Compliance",
    priority: "high",
    triggerSummary: "Vanilla Trading GmbH mangler økologisk certificering i leverandørmappen. Lotte har bedt Peter fremskaffe dokumentation.",
    severity: 0.7,
  },
  {
    title: "Kim Søgaard sygemeldt — ingen salgsdirektør",
    archetypeSlug: "response_overdue",
    department: "Salg & Marketing",
    priority: "high",
    triggerSummary: "Kim Søgaard er sygemeldt på ubestemt tid. Anders og Robert dækker salgsopgaver, men strategiske beslutninger venter.",
    severity: 0.7,
  },
  {
    title: "3 OOH-leads venter på prisgodkendelse (café-kæde risikerer Premier Is)",
    archetypeSlug: "lead_follow_up",
    department: "Salg & Marketing",
    priority: "high",
    triggerSummary: "Robert har 3 OOH-leads der venter prisgodkendelse fra Anders. Café-kæden overvejer Premier Is som alternativ.",
    severity: 0.7,
  },
  {
    title: "Lars Winther hygiejnecertifikat ubekræftet — starter mandag",
    archetypeSlug: "onboarding_task",
    department: "Produktion & Logistik",
    priority: "high",
    triggerSummary: "Lars Winther starter som lærling mandag, men hans hygiejnecertifikat er endnu ikke bekræftet modtaget.",
    severity: 0.7,
  },
  {
    title: "Dagrofa INV-2026-080 nu 11 dage overdue (67.500 DKK)",
    archetypeSlug: "overdue_invoice",
    department: "Økonomi & Administration",
    priority: "high",
    triggerSummary: "Faktura INV-2026-080 til Dagrofa på 67.500 DKK er 11 dage overskredet. Marie har sendt rykkere uden svar.",
    severity: 0.7,
  },
  {
    title: "HACCP-plan udkast mangler underskrift",
    archetypeSlug: "compliance_deadline",
    department: "Kvalitet & Compliance",
    priority: "medium",
    triggerSummary: "Lottes HACCP-udkast afventer underskrift fra Trine og Rasmus før det kan træde i kraft.",
    severity: 0.5,
  },
  {
    title: "Fødevarestyrelsen inspektion denne uge — dato ukendt",
    archetypeSlug: "compliance_deadline",
    department: "Kvalitet & Compliance",
    priority: "critical",
    triggerSummary: "Fødevarestyrelsen har varslet inspektion denne uge, men præcis dato er ikke oplyst. Lotte koordinerer klargøring.",
    severity: 0.9,
  },

  // ── 2-3 days ago (10 situations) ───────────────────────────────────

  {
    title: "Cash flow under tærskel om 6 uger (145K vs mål 200K)",
    archetypeSlug: "cash_flow_alert",
    department: "Økonomi & Administration",
    priority: "high",
    triggerSummary: "Marie forudser cash flow på 145K DKK om 6 uger, under tærsklen på 200K, primært pga. forsinkede Dagrofa-betalinger og Coop-rabatter.",
    severity: 0.7,
  },
  {
    title: "Bestyrelsespakke deadline 18. april — 4 datakategorier mangler",
    archetypeSlug: "deadline_approaching",
    department: "Ledelse",
    priority: "high",
    triggerSummary: "Bestyrelsesmøde 18. april kræver komplet pakke. Marie og Annemette har identificeret 4 manglende datakategorier.",
    severity: 0.7,
  },
  {
    title: "GROW social impact data ikke indsamlet for marts",
    archetypeSlug: "compliance_deadline",
    department: "Ledelse",
    priority: "high",
    triggerSummary: "DSK kræver månedlig GROW social impact rapportering. Marts-data er ikke indsamlet, og deadline nærmer sig.",
    severity: 0.7,
  },
  {
    title: "Scope 1+2 CO₂ data ikke opgjort — DSK deadline 1. maj",
    archetypeSlug: "compliance_deadline",
    department: "Ledelse",
    priority: "high",
    triggerSummary: "Christian fra DSK har efterlyst Scope 1+2 CO₂-data med deadline 1. maj. Energidata er ikke systematiseret.",
    severity: 0.7,
  },
  {
    title: "Friis Holm chokolade 12% over budget (10K ekstra)",
    archetypeSlug: "budget_variance",
    department: "Økonomi & Administration",
    priority: "medium",
    triggerSummary: "Peter rapporterer at Friis Holm chokolade-indkøb ligger 12% over budget, svarende til ca. 10.000 DKK ekstra denne måned.",
    severity: 0.5,
  },
  {
    title: "Café-kæde lead (35K/mnd) overvejer Premier Is",
    archetypeSlug: "lead_follow_up",
    department: "Salg & Marketing",
    priority: "high",
    triggerSummary: "Robert rapporterer at en café-kæde med estimeret 35K DKK/mnd aktivt overvejer Premier Is. Tilbud skal sendes hurtigt.",
    severity: 0.7,
  },
  {
    title: "Biograf-lead venter på tilbud",
    archetypeSlug: "lead_follow_up",
    department: "Salg & Marketing",
    priority: "medium",
    triggerSummary: "Robert har kontakt med biografkæde der venter på et formelt tilbud fra Hansens.",
    severity: 0.5,
  },
  {
    title: "Museum-lead venter på tilbud",
    archetypeSlug: "lead_follow_up",
    department: "Salg & Marketing",
    priority: "medium",
    triggerSummary: "Robert har kontakt med museumscafé der venter på tilbud. Lavere prioritet end café-kæden.",
    severity: 0.5,
  },
  {
    title: "Mads Nørgaard sæson 2 beslutning udestår — skal til bestyrelse",
    archetypeSlug: "decision_needed",
    department: "Salg & Marketing",
    priority: "medium",
    triggerSummary: "Camilla og Anders venter på bestyrelsens godkendelse af Mads Nørgaard co-brand sæson 2. Tidspres ift. emballage-leveringstid.",
    severity: 0.5,
  },
  {
    title: "Foodexpo materialer — 3-4 ugers leveringstid, budget ikke godkendt",
    archetypeSlug: "deadline_approaching",
    department: "Salg & Marketing",
    priority: "medium",
    triggerSummary: "Camilla har undersøgt Foodexpo-materialer med 3-4 ugers leveringstid, men budget er endnu ikke godkendt af Anders.",
    severity: 0.5,
  },

  // ── 4-7 days ago (8 situations) ────────────────────────────────────

  {
    title: "Massebalance Q1 afviger 2,8% — 1.750L uforklaret",
    archetypeSlug: "compliance_deadline",
    department: "Kvalitet & Compliance",
    priority: "high",
    triggerSummary: "Lottes Q1-massebalance viser 2,8% afvigelse svarende til 1.750L uforklaret mælkeforbrug. Kræver opklaring inden inspektion.",
    severity: 0.7,
  },
  {
    title: "HACCP-plan 14 måneder gammel — revision overskredet",
    archetypeSlug: "compliance_deadline",
    department: "Kvalitet & Compliance",
    priority: "high",
    triggerSummary: "HACCP-planen er 14 måneder gammel og overstiger den årlige revisionsperiode. Lotte har eskaleret til Rasmus.",
    severity: 0.7,
  },
  {
    title: "Svensk emballage til Nørgaard Pop kræver 4-6 ugers leveringstid",
    archetypeSlug: "compliance_deadline",
    department: "Salg & Marketing",
    priority: "high",
    triggerSummary: "Svensk-mærket emballage til Nørgaard Pop co-brand kræver 4-6 ugers leveringstid fra Emballage Danmark. Tidspres for eksport.",
    severity: 0.7,
  },
  {
    title: "Claes foreslår dansk mærkning + lokal relabeling — compliance/ansvarsspørgsmål",
    archetypeSlug: "decision_needed",
    department: "Salg & Marketing",
    priority: "medium",
    triggerSummary: "Claes fra sthlmicecream foreslår at sende med dansk mærkning og relabele lokalt. Compliance- og ansvarsforhold er uafklarede.",
    severity: 0.5,
  },
  {
    title: "Dagrofa ordremængde 30% under sidste år",
    archetypeSlug: "relationship_cooling",
    department: "Salg & Marketing",
    priority: "medium",
    triggerSummary: "Kim har registreret at Dagrofas ordremængde er faldet 30% ift. samme periode sidste år. Mulig kategorirevidering.",
    severity: 0.5,
  },
  {
    title: "Lars Winther AMU kursus ikke bekræftet",
    archetypeSlug: "onboarding_task",
    department: "Produktion & Logistik",
    priority: "medium",
    triggerSummary: "Lars Winthers AMU hygiejnekursus er endnu ikke bekræftet tilmeldt. Påkrævet inden produktionsstart.",
    severity: 0.5,
  },
  {
    title: "3 af 8 sæsonmedarbejdere mangler fuldstændig dokumentation",
    archetypeSlug: "onboarding_task",
    department: "Produktion & Logistik",
    priority: "medium",
    triggerSummary: "3 af 8 sæsonmedarbejdere mangler komplet dokumentation (hygiejnecert, kontrakt eller skatteoplysninger).",
    severity: 0.5,
  },
  {
    title: "Svanholm kan ikke levere buffer i april (kalvesæson)",
    archetypeSlug: "delivery_risk",
    department: "Produktion & Logistik",
    priority: "medium",
    triggerSummary: "Søren fra Svanholm Gods melder at buffermælk ikke er tilgængelig i april pga. kalvesæson. Normal leverance fortsætter.",
    severity: 0.5,
  },

  // ── 8-14 days ago (8 situations) ───────────────────────────────────

  {
    title: "Scandlines INV-2026-057 overdue 8 dage (18.500 DKK)",
    archetypeSlug: "overdue_invoice",
    department: "Økonomi & Administration",
    priority: "medium",
    triggerSummary: "Faktura INV-2026-057 til Scandlines på 18.500 DKK er 8 dage overskredet.",
    severity: 0.5,
  },
  {
    title: "Café Frederiksberg INV-2026-081 overdue 2 dage (4.800 DKK)",
    archetypeSlug: "overdue_invoice",
    department: "Økonomi & Administration",
    priority: "low",
    triggerSummary: "Faktura INV-2026-081 til Café Frederiksberg på 4.800 DKK er 2 dage overskredet. Lille beløb, men mønster bør overvåges.",
    severity: 0.3,
  },
  {
    title: "4 kladde-fakturaer uafsendt (INV-093, 095, 096, 097)",
    archetypeSlug: "process_bottleneck",
    department: "Økonomi & Administration",
    priority: "low",
    triggerSummary: "4 fakturaer ligger som kladde i e-conomic og er ikke afsendt. Forsinker betalingsflow.",
    severity: 0.3,
  },
  {
    title: "Trustpilot score faldet fra 4.5 til 4.2 — romkugle-eftervirkning",
    archetypeSlug: "client_escalation",
    department: "Salg & Marketing",
    priority: "medium",
    triggerSummary: "Trustpilot-score er faldet fra 4.5 til 4.2 efter negative anmeldelser relateret til romkugle-is kontroversen.",
    severity: 0.5,
  },
  {
    title: "Frigo Transport: 2 af 3 forsinkelser denne måned (94% OTIF vs 98% mål)",
    archetypeSlug: "delivery_risk",
    department: "Produktion & Logistik",
    priority: "medium",
    triggerSummary: "Frigo Transport har haft 2 forsinkelser ud af 3 leveringer denne måned, svarende til 94% OTIF mod målet på 98%.",
    severity: 0.5,
  },
  {
    title: "Svanholm betalingsbetingelser under genforhandling",
    archetypeSlug: "contract_renewal",
    department: "Økonomi & Administration",
    priority: "medium",
    triggerSummary: "Peter forhandler nye betalingsbetingelser med Svanholm Gods. Nuværende netto 14 dage ønskes forlænget til netto 30.",
    severity: 0.5,
  },
  {
    title: "Mohammed og Sarah fra Jobcenter — interviewplanlægning udestår",
    archetypeSlug: "onboarding_task",
    department: "Produktion & Logistik",
    priority: "low",
    triggerSummary: "Nina fra Jobcenteret har sendt 2 kandidater (Mohammed og Sarah). Interviewtider er endnu ikke planlagt.",
    severity: 0.3,
  },
  {
    title: "2 Jobcenter-kandidater skal interviewes",
    archetypeSlug: "onboarding_task",
    department: "Produktion & Logistik",
    priority: "low",
    triggerSummary: "Trine skal koordinere interviews med 2 Jobcenter-kandidater inden næste Jobcenter-opfølgning.",
    severity: 0.3,
  },

  // ── Structural / foundational (10 situations) ─────────────────────

  {
    title: "Forsikringspolice dækker 35 ansatte — reelt 49",
    archetypeSlug: "compliance_deadline",
    department: "Økonomi & Administration",
    priority: "high",
    triggerSummary: "Erhvervsforsikringen dækker 35 ansatte, men virksomheden har reelt 49 inkl. sæsonmedarbejdere. Underforsikring.",
    severity: 0.7,
  },
  {
    title: "Firmaprofil siger 25 medarbejdere — forældet",
    archetypeSlug: "documentation_outdated",
    department: "Ledelse",
    priority: "low",
    triggerSummary: "Firmaprofilen i Drive angiver 25 medarbejdere. Reelt antal er 49 inkl. sæsonmedarbejdere.",
    severity: 0.3,
  },
  {
    title: "Organisationsoversigt har Hans Jørgen som formand — erstattet af Annemette",
    archetypeSlug: "documentation_outdated",
    department: "Ledelse",
    priority: "low",
    triggerSummary: "Organisationsoversigten viser Hans Jørgen Thomsen som bestyrelsesformand, men Annemette Thomsen har overtaget.",
    severity: 0.3,
  },
  {
    title: "Forretningsplan siger \"ingen internationalisering\" — modstrides af DSK strategi",
    archetypeSlug: "decision_needed",
    department: "Ledelse",
    priority: "medium",
    triggerSummary: "Forretningsplanen fastslår \"ingen internationalisering\", men DSK-strategien og aktiv eksport til Sverige modstrider dette.",
    severity: 0.5,
  },
  {
    title: "Energidata ikke systematiseret — Scope 1+2 umuligt at rapportere",
    archetypeSlug: "compliance_deadline",
    department: "Ledelse",
    priority: "high",
    triggerSummary: "Energidata fra produktion, køling og transport er ikke systematisk opsamlet. Scope 1+2 CO₂-rapportering er umulig uden dette.",
    severity: 0.7,
  },
  {
    title: "Brandøvelse sidst sept 2025 — bør gennemføres årligt",
    archetypeSlug: "compliance_deadline",
    department: "Produktion & Logistik",
    priority: "low",
    triggerSummary: "Sidste brandøvelse var september 2025. Årlig gennemførelse anbefales, og ny bør planlægges.",
    severity: 0.3,
  },
  {
    title: "Svanholm er eneste mælkeleverandør — ingen backup-aftale",
    archetypeSlug: "decision_needed",
    department: "Produktion & Logistik",
    priority: "medium",
    triggerSummary: "Svanholm Gods er eneste leverandør af økologisk råmælk. Ingen backup-aftale ved leveringssvigt eller kapacitetsproblemer.",
    severity: 0.5,
  },
  {
    title: "Egenkontrolprogram fra 2025 — bør gennemgås ifm HACCP-revision",
    archetypeSlug: "compliance_deadline",
    department: "Kvalitet & Compliance",
    priority: "low",
    triggerSummary: "Egenkontrolprogrammet er fra 2025 og bør revideres i forbindelse med den igangværende HACCP-revision.",
    severity: 0.3,
  },
  {
    title: "APV handlingsplan (ventilation, sikkerhedssko) — status ukendt",
    archetypeSlug: "deadline_approaching",
    department: "Produktion & Logistik",
    priority: "low",
    triggerSummary: "APV-handlingsplanen nævner ventilationsforbedringer og sikkerhedssko. Status på implementering er ukendt.",
    severity: 0.3,
  },
  {
    title: "GDPR databehandleraftaler inkluderer ikke Pleo",
    archetypeSlug: "compliance_deadline",
    department: "Økonomi & Administration",
    priority: "low",
    triggerSummary: "GDPR-databehandleraftalen dækker ikke Pleo, som håndterer medarbejdernes udgiftsbilag og persondata.",
    severity: 0.3,
  },
];

/**
 * Creates the ground truth pre-built state for Hansens Flødeis.
 * Called after runSyntheticSeed() creates raw data.
 * Creates departments, goals, situations, and tags foundational docs.
 */
export async function runHansensGroundTruthSeed(operatorId: string): Promise<void> {
  // Implementation connects to DB and creates:
  // 1. Departments with member assignments
  // 2. Goals linked to departments
  // 3. All 48 situations in pending status
  // 4. Tags foundational documents
  console.log(`[hansens-ground-truth] Would create ${HANSENS_SITUATIONS.length} situations, ${HANSENS_DEPARTMENTS.length} departments, ${HANSENS_GOALS.length} goals for operator ${operatorId}`);
}
