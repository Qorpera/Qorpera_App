// ---------------------------------------------------------------------------
// Phase 3 seed data — Goals, Ideas, Insights, Patterns,
// Recurring Tasks, Follow-ups, Notifications, Copilot Sessions, Delegations.
// Pure data — no database operations.
// ---------------------------------------------------------------------------

import { createHash } from "crypto";

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 86_400_000);
}
function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3_600_000);
}
function daysFromNow(d: number): Date {
  return new Date(Date.now() + d * 86_400_000);
}
function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// ── 1. Goals ──────────────────────────────────────────────────────────────

export type GoalDef = {
  title: string;
  description: string;
  department?: string;
  priority: number;
  status: string;
};

export const GOALS: GoalDef[] = [
  {
    title: "Øg klientfastholdelse Q2",
    description:
      "Fasthold minimum 90 % af eksisterende klienter ved udgangen af Q2 ved at styrke kontaktpunkter, proaktiv kommunikation og løbende kvalitetssikring.",
    department: "Salg",
    priority: 1,
    status: "active",
  },
  {
    title: "Optimer leveringsprocesser",
    description:
      "Reducér gennemsnitlig leveringstid med 15 % og forbedre projektmargin ved at standardisere workflows, forbedre estimering og automatisere gentagne opgaver.",
    department: "Levering",
    priority: 2,
    status: "active",
  },
  {
    title: "Standardiser onboarding",
    description:
      "Implementér en ensartet onboarding-proces for nye klienter der sikrer alle relevante team-medlemmer er briefet, systemer er klargjort og klienten modtager velkomstmateriale inden for 48 timer.",
    department: "Levering",
    priority: 3,
    status: "achieved",
  },
];

// ── 2. Ideas ────────────────────────────────────────────────────────

export type IdeaDef = {
  goalTitle: string;
  aiEntityType: "dept" | "hq";
  aiEntityDept?: string;
  status: string;
  rationale: string;
  impactAssessment: string;
  daysAgoCreated: number;
  plan?: {
    status: string;
    steps: Array<{
      title: string;
      description: string;
      executionMode: string;
      capabilitySlug: string;
      parameters: Record<string, unknown>;
      status: string;
      completedHoursAgo?: number;
    }>;
  };
};

export const IDEAS: IdeaDef[] = [
  {
    goalTitle: "Øg klientfastholdelse Q2",
    aiEntityType: "dept",
    aiEntityDept: "Salg",
    status: "active",
    rationale:
      "Analyse af de seneste 6 måneders churn viser at 3 ud af 5 tabte kunder ikke havde modtaget proaktiv kontakt i over 30 dage inden opsigelse. En systematisk kontaktplan kan reducere churn markant.",
    impactAssessment:
      "Estimeret reduktion i churn fra 12 % til 7 % per kvartal. Ved gennemsnitlig klientværdi på 45.000 DKK/md svarer det til ca. 270.000 DKK i reddet omsætning per kvartal.",
    daysAgoCreated: 10,
    plan: {
      status: "in_progress",
      steps: [
        {
          title: "Identificér klienter uden kontakt > 21 dage",
          description:
            "Søg i CRM og email-historik for aktive retainer-klienter med mere end 21 dages stilhed.",
          executionMode: "autonomous",
          capabilitySlug: "crm_update",
          parameters: { filter: "last_contact_days_ago > 21", status: "retainer" },
          status: "completed",
          completedHoursAgo: 48,
        },
        {
          title: "Send personlige check-in emails",
          description:
            "Send en venlig, personlig email til hver identificeret klient med opdatering på deres projekt og spørgsmål om tilfredshed.",
          executionMode: "supervised",
          capabilitySlug: "send_email",
          parameters: { template: "client_checkin", tone: "warm" },
          status: "completed",
          completedHoursAgo: 24,
        },
        {
          title: "Planlæg opfølgende møder",
          description:
            "For klienter der svarer positivt, foreslå et kort 15-minutters statusmøde inden for den næste uge.",
          executionMode: "supervised",
          capabilitySlug: "send_email",
          parameters: { template: "meeting_request", duration: 15 },
          status: "pending",
        },
        {
          title: "Opdatér CRM med kontaktnoter",
          description:
            "Registrér alle check-in resultater og mødeplaner i CRM så salgsteamet har overblik.",
          executionMode: "autonomous",
          capabilitySlug: "crm_update",
          parameters: { action: "add_note", category: "retention_checkin" },
          status: "pending",
        },
      ],
    },
  },
  {
    goalTitle: "Optimer leveringsprocesser",
    aiEntityType: "dept",
    aiEntityDept: "Levering",
    status: "active",
    rationale:
      "De seneste 4 projekter har overskredet estimeret tid med gennemsnitligt 18 %. Primære årsager: scope creep (40 %), ufuldstændig kravspecifikation (35 %), og intern kommunikation (25 %). Strukturerede procesændringer kan adressere alle tre.",
    impactAssessment:
      "Forbedret projektmargin fra 32 % til 38 % i gennemsnit. Ved en årlig omsætning på projekter af ca. 2,4 mio DKK svarer det til ca. 144.000 DKK ekstra profit.",
    daysAgoCreated: 7,
    plan: {
      status: "in_progress",
      steps: [
        {
          title: "Analysér forsinkelsesårsager i afsluttede projekter",
          description:
            "Gennemgå de seneste 8 lukkede projekter og kategorisér forsinkelser efter årsag, varighed og afdeling.",
          executionMode: "autonomous",
          capabilitySlug: "add_internal_note",
          parameters: { scope: "completed_projects", lookback_months: 6 },
          status: "completed",
          completedHoursAgo: 72,
        },
        {
          title: "Udarbejd scope-change checklist",
          description:
            "Opret en standardiseret checklist som projektledere kan bruge ved alle scope-ændringer for at sikre godkendelse og reestimering.",
          executionMode: "supervised",
          capabilitySlug: "send_slack_message",
          parameters: { channel: "#levering", type: "checklist_proposal" },
          status: "pending",
        },
        {
          title: "Implementér ugentlig projekt-pulse i Slack",
          description:
            "Konfigurér automatisk ugentlig statusopdatering til #levering med nøgletal per aktivt projekt.",
          executionMode: "supervised",
          capabilitySlug: "send_slack_message",
          parameters: { channel: "#levering", frequency: "weekly", day: "monday" },
          status: "pending",
        },
      ],
    },
  },
  {
    goalTitle: "Standardiser onboarding",
    aiEntityType: "hq",
    status: "completed",
    rationale:
      "Historisk har onboarding-kvaliteten varieret kraftigt mellem salg og levering. Standardisering sikrer ensartet oplevelse og reducerer risiko for at vigtige setup-trin glemmes.",
    impactAssessment:
      "Reduceret onboarding-tid fra gennemsnitligt 5 dage til 2 dage. Forbedret klienttilfredshedsscore i onboarding-survey fra 7,2 til 8,9 (ud af 10).",
    daysAgoCreated: 21,
    plan: {
      status: "completed",
      steps: [
        {
          title: "Kortlæg nuværende onboarding-trin på tværs af afdelinger",
          description:
            "Dokumentér alle aktuelle onboarding-aktiviteter i Salg, Levering og Økonomi.",
          executionMode: "autonomous",
          capabilitySlug: "add_internal_note",
          parameters: { scope: "onboarding_audit" },
          status: "completed",
          completedHoursAgo: 480,
        },
        {
          title: "Send onboarding-skabelon til godkendelse",
          description:
            "Udarbejd en samlet onboarding-skabelon og send til Anders og Mette for godkendelse.",
          executionMode: "supervised",
          capabilitySlug: "send_email",
          parameters: { recipients: ["anders", "mette"], template: "onboarding_template_review" },
          status: "completed",
          completedHoursAgo: 384,
        },
        {
          title: "Opdatér CRM-pipeline med onboarding-stage",
          description:
            "Tilføj et dedikeret onboarding-stadie i CRM så alle nye klienter automatisk trackes.",
          executionMode: "autonomous",
          capabilitySlug: "crm_update",
          parameters: { action: "add_pipeline_stage", stage_name: "onboarding" },
          status: "completed",
          completedHoursAgo: 336,
        },
        {
          title: "Opsæt automatisk velkomstmail-sekvens",
          description:
            "Konfigurér en 3-email velkomstsekvens der sendes automatisk når en ny klient oprettes.",
          executionMode: "supervised",
          capabilitySlug: "send_email",
          parameters: { sequence: "welcome_series", emails: 3, interval_days: [0, 2, 7] },
          status: "completed",
          completedHoursAgo: 288,
        },
      ],
    },
  },
];

// ── 3. Operational Insights ───────────────────────────────────────────────

export type InsightDef = {
  aiEntityType: "dept" | "hq";
  aiEntityDept?: string;
  department?: string;
  insightType: string;
  description: string;
  evidence: { sampleSize: number; successRate: number; situations: string[] };
  confidence: number;
  promptModification?: string;
  shareScope: string;
  daysAgoCreated: number;
  invalidated?: boolean;
};

export const OPERATIONAL_INSIGHTS: InsightDef[] = [
  // ── Approach effectiveness ──
  {
    aiEntityType: "dept",
    aiEntityDept: "Salg",
    department: "Salg",
    insightType: "approach_effectiveness",
    description:
      "Personlige check-in emails til retainer-klienter sendt tirsdag-torsdag formiddag har 73 % højere svarrate end emails sendt fredag eftermiddag.",
    evidence: {
      sampleSize: 18,
      successRate: 0.89,
      situations: ["deal-gone-quiet", "contract-renewal-approaching"],
    },
    confidence: 0.85,
    promptModification:
      "Når du sender check-in emails til retainer-klienter, prioritér afsendelse tirsdag til torsdag mellem kl. 9-12.",
    shareScope: "department",
    daysAgoCreated: 14,
  },
  {
    aiEntityType: "dept",
    aiEntityDept: "Salg",
    department: "Salg",
    insightType: "approach_effectiveness",
    description:
      "Tilbudsemails der inkluderer en kort opsummering af kundens nøgleudfordringer i emnelinjen opnår 42 % hurtigere responstid.",
    evidence: {
      sampleSize: 12,
      successRate: 0.83,
      situations: ["cross-sell-opportunity", "new-lead-qualification"],
    },
    confidence: 0.78,
    promptModification:
      "I emnelinjer for tilbud, inkludér altid kundens primære udfordring — f.eks. 'Løsning på [udfordring] for [virksomhed]'.",
    shareScope: "department",
    daysAgoCreated: 21,
  },

  // ── Timing patterns ──
  {
    aiEntityType: "dept",
    aiEntityDept: "Økonomi & Admin",
    department: "Økonomi & Admin",
    insightType: "timing_pattern",
    description:
      "Fakturapåmindelser sendt præcis 3 dage efter forfaldsdato har den højeste betalingsrate (82 %) sammenlignet med dag 1 (61 %) eller dag 7 (68 %).",
    evidence: {
      sampleSize: 16,
      successRate: 0.82,
      situations: ["overdue-invoice-followup"],
    },
    confidence: 0.88,
    promptModification:
      "Send første fakturapåmindelse præcis 3 dage efter forfaldsdato for optimal effekt.",
    shareScope: "operator",
    daysAgoCreated: 30,
  },
  {
    aiEntityType: "hq",
    department: undefined,
    insightType: "timing_pattern",
    description:
      "Interne Slack-beskeder sendt før kl. 10:00 får 2,3x hurtigere responstid end beskeder sendt efter kl. 15:00.",
    evidence: {
      sampleSize: 20,
      successRate: 0.91,
      situations: ["client-meeting-prep"],
    },
    confidence: 0.82,
    shareScope: "operator",
    daysAgoCreated: 18,
  },

  // ── Entity preferences ──
  {
    aiEntityType: "dept",
    aiEntityDept: "Salg",
    department: "Salg",
    insightType: "entity_preference",
    description:
      "Karen Holst (Dansk Energi) foretrækker korte, bullet-point emails fremfor lange prosa-beskeder. Hendes responstid halveres med punktform.",
    evidence: {
      sampleSize: 8,
      successRate: 0.88,
      situations: ["deal-gone-quiet", "contract-renewal-approaching"],
    },
    confidence: 0.81,
    promptModification:
      "Ved kommunikation med Karen Holst, brug altid kort punktform fremfor lange afsnit.",
    shareScope: "personal",
    daysAgoCreated: 25,
  },
  {
    aiEntityType: "dept",
    aiEntityDept: "Salg",
    department: "Salg",
    insightType: "entity_preference",
    description:
      "Henrik Bygholm reagerer bedst på emails der nævner konkrete tal og ROI-estimater. Vage værdiforslag ignoreres konsekvent.",
    evidence: {
      sampleSize: 6,
      successRate: 0.83,
      situations: ["cross-sell-opportunity", "contract-renewal-approaching"],
    },
    confidence: 0.76,
    promptModification:
      "I al kommunikation med Henrik Bygholm, inkludér altid mindst ét konkret tal eller ROI-estimat.",
    shareScope: "personal",
    daysAgoCreated: 12,
  },

  // ── Escalation patterns ──
  {
    aiEntityType: "dept",
    aiEntityDept: "Levering",
    department: "Levering",
    insightType: "escalation_pattern",
    description:
      "Tickets med prioritet 'high' der ikke er opdateret inden for 4 timer eskaleres automatisk af klienten i 67 % af tilfældene. Proaktiv opdatering forebygger dette.",
    evidence: {
      sampleSize: 9,
      successRate: 0.78,
      situations: ["client-meeting-prep"],
    },
    confidence: 0.74,
    promptModification:
      "Ved high-priority tickets, send proaktiv statusopdatering til klienten inden 4 timer — også selvom der ikke er nyt at rapportere.",
    shareScope: "department",
    daysAgoCreated: 8,
  },
  {
    aiEntityType: "dept",
    aiEntityDept: "Økonomi & Admin",
    department: "Økonomi & Admin",
    insightType: "escalation_pattern",
    description:
      "Fakturaer over 50.000 DKK der er mere end 14 dage forfaldne kræver direkte CEO-kontakt for at undgå betalingssvigt. Email til økonomiafdelingen er ikke tilstrækkeligt.",
    evidence: {
      sampleSize: 5,
      successRate: 0.6,
      situations: ["overdue-invoice-followup"],
    },
    confidence: 0.68,
    promptModification:
      "Ved fakturaer > 50.000 DKK og > 14 dage forfalden, eskalér direkte til kundens CEO/direktør — ikke kun økonomiafdelingen.",
    shareScope: "operator",
    daysAgoCreated: 35,
    invalidated: true,
  },

  // ── Resolution patterns ──
  {
    aiEntityType: "dept",
    aiEntityDept: "Levering",
    department: "Levering",
    insightType: "resolution_pattern",
    description:
      "Scope-ændringer der dokumenteres i CRM og bekræftes via email inden 24 timer resulterer i 94 % færre efterfølgende konflikter.",
    evidence: {
      sampleSize: 15,
      successRate: 0.94,
      situations: ["client-meeting-prep"],
    },
    confidence: 0.91,
    promptModification:
      "Ved enhver scope-ændring, dokumentér i CRM OG send bekræftelsesmail til klienten inden for 24 timer.",
    shareScope: "department",
    daysAgoCreated: 20,
  },
  {
    aiEntityType: "hq",
    department: undefined,
    insightType: "resolution_pattern",
    description:
      "Nye klienter der modtager en personlig velkomstbesked fra CEO inden for 24 timer efter kontraktunderskrift har 28 % højere sandsynlighed for at forny efter første år.",
    evidence: {
      sampleSize: 11,
      successRate: 0.82,
      situations: ["new-lead-qualification"],
    },
    confidence: 0.72,
    shareScope: "operator",
    daysAgoCreated: 40,
    invalidated: true,
  },
  {
    aiEntityType: "dept",
    aiEntityDept: "Salg",
    department: "Salg",
    insightType: "approach_effectiveness",
    description:
      "Opfølgning efter tabt deal med en 'hvad kunne vi gøre bedre'-email 14 dage efter afslaget genåbner 18 % af tabte muligheder.",
    evidence: {
      sampleSize: 11,
      successRate: 0.73,
      situations: ["deal-gone-quiet"],
    },
    confidence: 0.69,
    shareScope: "department",
    daysAgoCreated: 45,
    invalidated: true,
  },
  {
    aiEntityType: "dept",
    aiEntityDept: "Levering",
    department: "Levering",
    insightType: "timing_pattern",
    description:
      "Projektstatusmøder der afholdes mandag formiddag producerer 35 % flere actionable opgaver end møder afholdt fredag eftermiddag.",
    evidence: {
      sampleSize: 14,
      successRate: 0.86,
      situations: ["client-meeting-prep"],
    },
    confidence: 0.8,
    shareScope: "department",
    daysAgoCreated: 16,
  },
];

// ── 5. Plan Autonomy Patterns ─────────────────────────────────────────────

export type PlanPatternDef = {
  planPatternHash: string;
  description: string;
  capabilitySlugs: string[];
  aiEntityType: "dept" | "hq";
  aiEntityDept?: string;
  consecutiveApprovals: number;
  autoApproved: boolean;
};

const pattern1Slugs = ["crm_update", "send_email", "send_slack_message"];
const pattern2Slugs = ["crm_update", "send_email"];
const pattern3Slugs = ["send_email", "send_slack_message"];
const pattern4Slugs = ["add_internal_note", "send_slack_message"];
const pattern5Slugs = ["send_email"];

export const PLAN_AUTONOMY_PATTERNS: PlanPatternDef[] = [
  {
    planPatternHash: sha256(JSON.stringify([...pattern1Slugs].sort())),
    description:
      "CRM-opdatering + email + Slack-besked: Typisk brugt til klient-opfølgning med intern notifikation. Næsten klar til fuld autonomi.",
    capabilitySlugs: pattern1Slugs,
    aiEntityType: "dept",
    aiEntityDept: "Salg",
    consecutiveApprovals: 18,
    autoApproved: false,
  },
  {
    planPatternHash: sha256(JSON.stringify([...pattern2Slugs].sort())),
    description:
      "CRM-opdatering + email: Standard mønster for retainer-check-ins og fakturapåmindelser.",
    capabilitySlugs: pattern2Slugs,
    aiEntityType: "dept",
    aiEntityDept: "Salg",
    consecutiveApprovals: 12,
    autoApproved: false,
  },
  {
    planPatternHash: sha256(JSON.stringify([...pattern3Slugs].sort())),
    description:
      "Email + Slack-besked: Koordinering af ekstern og intern kommunikation ved kundehenvendelser.",
    capabilitySlugs: pattern3Slugs,
    aiEntityType: "dept",
    aiEntityDept: "Levering",
    consecutiveApprovals: 8,
    autoApproved: false,
  },
  {
    planPatternHash: sha256(JSON.stringify([...pattern4Slugs].sort())),
    description:
      "Intern note + Slack-besked: Dokumentation af observationer med team-notifikation.",
    capabilitySlugs: pattern4Slugs,
    aiEntityType: "hq",
    consecutiveApprovals: 5,
    autoApproved: false,
  },
  {
    planPatternHash: sha256(JSON.stringify([...pattern5Slugs].sort())),
    description:
      "Enkelt email: Simpel direkte kommunikation — f.eks. mødeanmodning eller påmindelse.",
    capabilitySlugs: pattern5Slugs,
    aiEntityType: "dept",
    aiEntityDept: "Økonomi & Admin",
    consecutiveApprovals: 3,
    autoApproved: false,
  },
];

// ── 6. Recurring Tasks ────────────────────────────────────────────────────

export type RecurringTaskDef = {
  title: string;
  description: string;
  cronExpression: string;
  aiEntityType: "dept" | "hq";
  aiEntityDept?: string;
  department: string;
  lastTriggeredDaysAgo?: number;
  nextTriggerDaysFromNow?: number;
};

export const RECURRING_TASKS: RecurringTaskDef[] = [
  {
    title: "Ugentlig pipeline-gennemgang",
    description:
      "Gennemgå alle åbne deals i CRM, identificér stalled opportunities (ingen aktivitet > 7 dage), og send opsummering til #salg med anbefalede handlinger.",
    cronExpression: "0 8 * * 1", // Every Monday at 08:00
    aiEntityType: "dept",
    aiEntityDept: "Salg",
    department: "Salg",
    lastTriggeredDaysAgo: 3,
    nextTriggerDaysFromNow: 4,
  },
  {
    title: "Månedlig fakturastatus-rapport",
    description:
      "Generer en samlet oversigt over alle udestående fakturaer, betalinger modtaget denne måned og forfaldne beløb. Send til Anders og Louise.",
    cronExpression: "0 9 1 * *", // 1st of each month at 09:00
    aiEntityType: "dept",
    aiEntityDept: "Økonomi & Admin",
    department: "Økonomi & Admin",
    lastTriggeredDaysAgo: 23,
    nextTriggerDaysFromNow: 7,
  },
  {
    title: "Daglig projekt-pulse",
    description:
      "Tjek status på alle aktive leveringsprojekter, identificér blokeringer og forsinkelser, og post en kort pulse-opdatering i #levering.",
    cronExpression: "0 9 * * 1-5", // Weekdays at 09:00
    aiEntityType: "dept",
    aiEntityDept: "Levering",
    department: "Levering",
    lastTriggeredDaysAgo: 1,
    nextTriggerDaysFromNow: 0,
  },
];

// ── 7. Follow-ups ─────────────────────────────────────────────────────────

export type FollowUpDef = {
  title: string;
  triggerCondition: Record<string, unknown>;
  fallbackAction: Record<string, unknown>;
  status: string;
  triggerDaysFromNow?: number;
  triggeredDaysAgo?: number;
};

export const FOLLOW_UPS: FollowUpDef[] = [
  {
    title: "Nordlys retainer-fornyelse opfølgning",
    triggerCondition: {
      type: "no_response",
      entity: "Søren Fabricius",
      company: "Nordlys Media ApS",
      channel: "email",
      waitDays: 5,
    },
    fallbackAction: {
      action: "send_email",
      template: "gentle_reminder",
      recipient: "soeren@nordlys.dk",
      subject: "Opfølgning: Nordlys Q2 retainer-fornyelse",
    },
    status: "watching",
    triggerDaysFromNow: 3,
  },
  {
    title: "Vestjysk Finans tilbudssvar",
    triggerCondition: {
      type: "no_response",
      entity: "Jens Matthiesen",
      company: "Vestjysk Finans",
      channel: "email",
      waitDays: 7,
    },
    fallbackAction: {
      action: "send_email",
      template: "proposal_followup",
      recipient: "jens@vestjyskfinans.dk",
      escalateTo: "Mette Lindberg",
    },
    status: "watching",
    triggerDaysFromNow: 5,
  },
  {
    title: "Dansk Energi faktura-eskalering",
    triggerCondition: {
      type: "invoice_unpaid",
      ref: "INV-2024-090",
      company: "Dansk Energi Partners",
      daysOverdueThreshold: 21,
    },
    fallbackAction: {
      action: "send_email",
      template: "payment_escalation",
      recipient: "karen@danskenergi.dk",
      cc: "erik@danskenergi.dk",
      tone: "firm_but_professional",
    },
    status: "triggered",
    triggeredDaysAgo: 2,
  },
  {
    title: "GreenTech onboarding-feedback",
    triggerCondition: {
      type: "days_after_event",
      event: "onboarding_complete",
      entity: "Anna Grøn",
      company: "GreenTech Nordic",
      waitDays: 14,
    },
    fallbackAction: {
      action: "send_email",
      template: "onboarding_feedback_survey",
      recipient: "anna@greentech-nordic.dk",
    },
    status: "expired",
    triggeredDaysAgo: 8,
  },
];

// ── 8. Notifications ──────────────────────────────────────────────────────

export type NotificationDef = {
  title: string;
  body: string;
  sourceType: string;
  read: boolean;
  hoursAgo: number;
};

export const NOTIFICATIONS: NotificationDef[] = [
  // ── Unread (5) ──
  {
    title: "Ny idea foreslået",
    body: "Salg-AI har foreslået en ny idea: 'Q2 Klientfastholdelse' baseret på analyse af de seneste 6 måneders churn-data.",
    sourceType: "idea",
    read: false,
    hoursAgo: 2,
  },
  {
    title: "Faktura INV-2024-090 stadig ubetalt",
    body: "Dansk Energi Partners' faktura på 68.750 DKK er nu 12 dage forfalden. Tredje påmindelse er sendt. Overvej direkte kontakt til Karen Holst.",
    sourceType: "situation",
    read: false,
    hoursAgo: 4,
  },
  {
    title: "Plan kræver godkendelse",
    body: "Levering-AI har udarbejdet en plan for scope-change checklist implementering. 3 trin afventer din gennemgang.",
    sourceType: "plan_approval",
    read: false,
    hoursAgo: 6,
  },
  {
    title: "Bygholm tilbud klar til review",
    body: "Prisberegning og ROI-estimat for Bygholm Digital Transformation er færdigt og klar til gennemgang inden kundemødet.",
    sourceType: "project",
    read: false,
    hoursAgo: 8,
  },
  {
    title: "Autonomi-mønster nærmer sig graduation",
    body: "Mønsteret 'CRM + email + Slack' har 18 konsekutive godkendelser. Ved 20 godkendelser kan det gradueres til automatisk godkendelse.",
    sourceType: "autonomy",
    read: false,
    hoursAgo: 12,
  },
  // ── Read (10) ──
  {
    title: "Check-in emails afsendt",
    body: "4 personlige check-in emails er sendt til retainer-klienter uden kontakt de seneste 21 dage: Nordlys, Bygholm, Aarhus Creative Hub og Fjordview.",
    sourceType: "plan_step_completed",
    read: true,
    hoursAgo: 24,
  },
  {
    title: "Dansk Energi website milestone",
    body: "Frontend-udviklingen for Dansk Energi Website Redesign er afsluttet. CMS-migration er næste trin.",
    sourceType: "project",
    read: true,
    hoursAgo: 36,
  },
  {
    title: "Ny insight registreret",
    body: "Salg-AI har identificeret at check-in emails sendt tirsdag-torsdag formiddag har 73 % højere svarrate.",
    sourceType: "insight",
    read: true,
    hoursAgo: 48,
  },
  {
    title: "Ugentlig pipeline-gennemgang fuldført",
    body: "Pipeline-gennemgangen identificerede 2 stalled deals: Fjordview Reactivation (5 dage) og NextStep LMS (7 dage uden aktivitet).",
    sourceType: "recurring_task",
    read: true,
    hoursAgo: 72,
  },
  {
    title: "GreenTech onboarding fuldført",
    body: "Alle onboarding-trin for GreenTech Nordic er gennemført. Anna Grøn har bekræftet modtagelse af velkomstmateriale.",
    sourceType: "project",
    read: true,
    hoursAgo: 96,
  },
  {
    title: "Delegation: Tilbudstekst godkendelse",
    body: "Du har godkendt den delegerede opgave 'Gennemgå og godkend tilbudstekst for Bygholm' fra Salg-AI.",
    sourceType: "delegation",
    read: true,
    hoursAgo: 120,
  },
  {
    title: "Onboarding-idea afsluttet",
    body: "Ideat 'Ny Kunde Onboarding Forbedring' er markeret som fuldført. Alle 4 plantrin er gennemført.",
    sourceType: "idea",
    read: true,
    hoursAgo: 168,
  },
  {
    title: "Månedlig fakturastatus",
    body: "Marts fakturastatus: 6 fakturaer udstedt (372.500 DKK), 4 betalt (168.750 DKK), 2 forfaldne (106.250 DKK).",
    sourceType: "recurring_task",
    read: true,
    hoursAgo: 192,
  },
  {
    title: "Insight ugyldiggjort",
    body: "Insight om CEO-kontakt ved fakturaer > 50.000 DKK er ugyldiggjort efter yderligere data viste inkonsistente resultater.",
    sourceType: "insight",
    read: true,
    hoursAgo: 240,
  },
  {
    title: "Ny klient-entitet oprettet",
    body: "GreenTech Nordic er tilføjet som ny klient-entitet baseret på HubSpot-synkronisering. Anna Grøn er registreret som primær kontakt.",
    sourceType: "entity",
    read: true,
    hoursAgo: 336,
  },
];

// ── 9. Copilot Sessions ───────────────────────────────────────────────────

export type CopilotSessionDef = {
  sessionId: string;
  hoursAgo: number;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    apiCostCents?: number;
  }>;
};

export const COPILOT_SESSIONS: CopilotSessionDef[] = [
  {
    sessionId: "c7a1f2e3-4b5d-6c7e-8f9a-0b1c2d3e4f5a",
    hoursAgo: 3,
    messages: [
      {
        role: "user",
        content: "Hvad er status på Dansk Energi-projektet? Jeg har et møde med Karen i morgen.",
      },
      {
        role: "assistant",
        content:
          "Dansk Energi Website Redesign er 71 % færdigt. De seneste milepæle:\n\n- **Frontend-udvikling**: Afsluttet for 14 dage siden\n- **CMS-migration**: I gang — Line Kjær er ansvarlig\n- **Åbne tickets**: TK-302 (content not updating, high priority) er tildelt Kasper Dahl\n\nDer er desuden en forfalden faktura (INV-2024-090, 68.750 DKK, 12 dage overdue). Louise har sendt to påmindelser.\n\nTil dit møde med Karen anbefaler jeg at adressere:\n1. CMS-migrationens tidslinje (forventet færdig om ~2 uger)\n2. TK-302 status — Kasper arbejder på det\n3. Den forfaldne faktura — diplomatisk men direkte",
        apiCostCents: 4,
      },
      {
        role: "user",
        content: "Kan du lave en kort agenda til mødet?",
      },
      {
        role: "assistant",
        content:
          "Her er en mødedagsorden til dit møde med Karen Holst:\n\n**Statusmøde: Dansk Energi Website Redesign**\n\n1. **Projektstatus** (5 min)\n   - Frontend afsluttet, CMS-migration påbegyndt\n   - Forventet go-live: ~4 uger\n\n2. **Åben ticket TK-302** (5 min)\n   - Content-opdateringsproblemet er identificeret\n   - Fix forventes inden for 48 timer\n\n3. **Økonomisk opfølgning** (5 min)\n   - INV-2024-090: 68.750 DKK, 12 dage forfalden\n   - Venlig anmodning om betaling\n\n4. **Næste skridt & tidslinje** (5 min)\n   - QA-plan og brugertest-tidsplan\n   - Go-live-forberedelse\n\nSkal jeg sende denne som email-invitation til Karen?",
        apiCostCents: 3,
      },
      {
        role: "user",
        content: "Ja tak, send den til karen@danskenergi.dk med mødetid i morgen kl. 10.",
      },
      {
        role: "assistant",
        content:
          "Jeg har forberedt emailen, men da den indeholder fakturainformation og sendes til en ekstern kontakt, kræver den din godkendelse i henhold til virksomhedspolitikken.\n\nDu kan godkende den i forslagskøen. Emailen er adresseret til karen@danskenergi.dk med emnelinjen 'Statusmøde: Dansk Energi Website Redesign — tirsdag kl. 10:00'.",
        apiCostCents: 2,
      },
    ],
  },
  {
    sessionId: "d8b2e3f4-5c6e-7d8f-9a0b-1c2d3e4f5a6b",
    hoursAgo: 26,
    messages: [
      {
        role: "user",
        content: "Giv mig et overblik over alle forfaldne fakturaer lige nu.",
      },
      {
        role: "assistant",
        content:
          "Der er 2 forfaldne fakturaer:\n\n| Ref | Kunde | Beløb | Dage forfalden |\n|-----|-------|-------|----------------|\n| INV-2024-090 | Dansk Energi Partners | 68.750 DKK | 12 dage |\n| INV-2024-094 | Aarhus Creative Hub | 37.500 DKK | 8 dage |\n\n**Samlet udestående**: 106.250 DKK\n\nINV-2024-090 er den mest kritiske — der er sendt 2 påmindelser allerede. Aarhus Creative Hub (INV-2024-094) har kun modtaget én påmindelse.\n\nSkal jeg sende en opfølgende påmindelse til Simon Krogh hos Aarhus Creative Hub?",
        apiCostCents: 3,
      },
      {
        role: "user",
        content:
          "Ja, send en venlig påmindelse til Simon. Og hvad er vores samlede udestående beløb inkl. pending?",
      },
      {
        role: "assistant",
        content:
          "Påmindelse til Simon Krogh (simon@aarhuscreative.dk) er sat i kø til godkendelse.\n\nSamlet udestående oversigt:\n\n| Status | Antal | Beløb |\n|--------|-------|-------|\n| Forfalden | 2 | 106.250 DKK |\n| Afventer (ikke forfalden) | 3 | 182.500 DKK |\n| **Total udestående** | **5** | **288.750 DKK** |\n\nDe afventende fakturaer (INV-2024-093, -095, -096) har forfaldsdatoer inden for de næste 3 uger. Cash flow ser fornuftigt ud, men Dansk Energi-fakturaen bør prioriteres.",
        apiCostCents: 3,
      },
    ],
  },
  {
    sessionId: "e9c3f4a5-6d7f-8e9a-0b1c-2d3e4f5a6b7c",
    hoursAgo: 72,
    messages: [
      {
        role: "user",
        content:
          "I'm thinking about the Bygholm proposal. What do we know about their current digital setup?",
      },
      {
        role: "assistant",
        content:
          "Based on the information we have on Bygholm Consulting:\n\n**Known facts:**\n- Managing Director: Henrik Bygholm\n- Head of Digital: Nina Brandt (your primary technical contact)\n- Current deal: 'Bygholm Digital Transformation' — proposal stage, 420.000 DKK\n- Deal owner: Mette Lindberg, created 14 days ago\n- Contract renewal approaching (6 weeks out per Mette's last email to Henrik)\n\n**From recent communications:**\n- Nina Brandt has mentioned they're running legacy CRM systems\n- They're interested in process automation and employee training\n- Budget discussion indicates 180k-220k DKK range for initial phase (from Oliver's earlier note on Vestjysk — correction: that was Vestjysk Finans, not Bygholm)\n\n**Gaps in our knowledge:**\n- No specific tech stack details beyond 'legacy CRM'\n- No competitor proposals mentioned\n- Employee count unclear (management consulting firm)\n\nWant me to look at the competitor analysis and benchmarking that was completed 7 days ago in the workstream?",
        apiCostCents: 5,
      },
      {
        role: "user",
        content: "Yes please, and what's the timeline for the proposal presentation?",
      },
      {
        role: "assistant",
        content:
          "From the 'Bygholm Digital Transformation Proposal' workstream:\n\n**Completed steps:**\n1. Indledende behovsanalyse (18 days ago)\n2. Konkurrentanalyse & benchmarking (14 days ago)\n3. Løsningsdesign & teknisk arkitektur (7 days ago)\n\n**Remaining:**\n4. Prisberegning & ROI-estimat — **in progress now**\n5. Tilbudspræsentation & kundemøde — pending\n\nThe deal has a close date set 30 days from now, so the presentation should ideally happen within the next 2 weeks to leave time for negotiation.\n\nThe competitor analysis showed 3 Danish agencies bidding on similar work, with typical pricing for digital transformation projects in this segment ranging from 350k-550k DKK. Our proposed 420k DKK positions us competitively.\n\nRemember: Henrik Bygholm responds best to concrete numbers and ROI estimates — so make sure the presentation leads with measurable impact.",
        apiCostCents: 4,
      },
    ],
  },
];

// ── 10. Delegations ───────────────────────────────────────────────────────

export type DelegationDef = {
  fromAiEntityType: "dept";
  fromAiEntityDept: string;
  toUserRole: "admin" | "member";
  instruction: string;
  context: Record<string, unknown>;
  status: string;
  completedDaysAgo?: number;
  completedNotes?: string;
  deadlineDaysFromNow?: number;
};

export const DELEGATIONS: DelegationDef[] = [
  {
    fromAiEntityType: "dept",
    fromAiEntityDept: "Salg",
    toUserRole: "admin",
    instruction:
      "Gennemgå og godkend den endelige tilbudstekst for Bygholm Digital Transformation (420.000 DKK). Tilbuddet inkluderer procesautomatisering, CRM-implementering og uddannelsesforløb. Prisberegning og ROI-estimat er vedlagt.",
    context: {
      deal: "Bygholm Digital Transformation",
      company: "Bygholm Consulting",
      amount: 420000,
      currency: "DKK",
      workstream: "Bygholm Digital Transformation Proposal",
      currentStep: "Prisberegning & ROI-estimat",
      keyContact: "Henrik Bygholm",
    },
    status: "pending",
    deadlineDaysFromNow: 5,
  },
  {
    fromAiEntityType: "dept",
    fromAiEntityDept: "Levering",
    toUserRole: "member",
    instruction:
      "Bekræft den endelige QA-plan for Dansk Energi website go-live. Planen dækker browser-kompatibilitet, performance-test og indholdsverificering. Thomas har godkendt den tekniske del — vi mangler projektleder-godkendelse.",
    context: {
      project: "Dansk Energi Website Redesign",
      company: "Dansk Energi Partners",
      workstream: "Dansk Energi Website Redesign",
      currentStep: "QA & brugertest",
      technicalApprover: "Thomas Nørgaard",
      deliveryLead: "Line Kjær",
    },
    status: "completed",
    completedDaysAgo: 3,
    completedNotes:
      "QA-plan godkendt med én tilføjelse: tilgængelighedstest (WCAG 2.1 AA) skal inkluderes inden go-live. Line Kjær opdaterer planen.",
  },
];
