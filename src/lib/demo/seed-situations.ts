// ---------------------------------------------------------------------------
// Demo seed: Situation definitions (pure data — no DB operations)
// ---------------------------------------------------------------------------

// ---- helpers for calendar ISO strings ----

function nextWeekday(dayOfWeek: number, hour: number, minute: number = 0): string {
  const now = new Date();
  const diff = (dayOfWeek - now.getDay() + 7) % 7 || 7;
  const date = new Date(now.getTime() + diff * 86_400_000);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function todayAt(hour: number, minute: number = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// 1. Situation type updates / additions
// ---------------------------------------------------------------------------

export type SituationTypeUpdate = {
  slug: string;
  name: string;
  description: string;
  detectionLogic: object;
  autonomyLevel: string;
  scopeDepartment: string;
  enabled: boolean;
  detectedCount: number;
  confirmedCount: number;
  dismissedCount: number;
};

export const SITUATION_TYPE_UPDATES: SituationTypeUpdate[] = [
  {
    slug: "overdue-invoice-followup",
    name: "Forfalden faktura opf\u00f8lgning",
    description:
      "Registrerer fakturaer der er forfaldne og kr\u00e6ver opf\u00f8lgning. Unders\u00f8ger betalingshistorik, kundeforhold og tidligere p\u00e5mindelser for at foresl\u00e5 den mest effektive opf\u00f8lgningsmetode.",
    detectionLogic: {
      mode: "hybrid",
      structured: {
        entityType: "invoice",
        signals: [
          { field: "daysOverdue", operator: "gte", value: 7 },
          { field: "amount", operator: "gte", value: 5000 },
          { field: "previousReminders", operator: "gte", value: 1 },
        ],
      },
      naturalLanguage:
        "Find fakturaer der er mere end 7 dage forfaldne og hvor mindst \u00e9n p\u00e5mindelse allerede er sendt. Priorit\u00e9r h\u00f8je bel\u00f8b og langvarige kundeforhold.",
    },
    autonomyLevel: "notify",
    scopeDepartment: "\u00d8konomi & Admin",
    enabled: true,
    detectedCount: 12,
    confirmedCount: 10,
    dismissedCount: 2,
  },
  {
    slug: "deal-gone-quiet",
    name: "Stille deal",
    description:
      "Opdager deals i pipeline der ikke har haft aktivitet i over 10 dage. Analyserer dealv\u00e6rdi, kontaktpersonens engagement-historik og pipeline-stadie for at foresl\u00e5 genaktivering.",
    detectionLogic: {
      mode: "hybrid",
      structured: {
        entityType: "deal",
        signals: [
          { field: "daysSinceLastActivity", operator: "gte", value: 10 },
          { field: "stage", operator: "in", value: ["proposal", "negotiation", "qualification"] },
          { field: "amount", operator: "gte", value: 50000 },
        ],
      },
      naturalLanguage:
        "Identificer deals der er g\u00e5et i st\u00e5 — ingen emails, opkald eller m\u00f8der de seneste 10+ dage. Fokus\u00e9r p\u00e5 deals over 50.000 DKK der stadig er aktive i pipeline.",
    },
    autonomyLevel: "notify",
    scopeDepartment: "Salg",
    enabled: true,
    detectedCount: 18,
    confirmedCount: 14,
    dismissedCount: 4,
  },
  {
    slug: "client-meeting-prep",
    name: "Kundem\u00f8de forberedelse",
    description:
      "F\u00f8r vigtige kundem\u00f8der sammens\u00e6ttes relevant kontekst: deal-detaljer, kontaktprofil, tidligere interaktioner og n\u00f8glepunkter. Sender forberedelsesmateriale til m\u00f8dedeltagere.",
    detectionLogic: {
      mode: "hybrid",
      structured: {
        entityType: "deal",
        signals: [
          { field: "nextMeetingInHours", operator: "lte", value: 48 },
          { field: "stage", operator: "in", value: ["demo", "proposal", "negotiation"] },
        ],
      },
      naturalLanguage:
        "Find deals med planlagte kundem\u00f8der inden for de n\u00e6ste 48 timer. Saml kontekst om kunden, dealhistorik og fokusomr\u00e5der s\u00e5 s\u00e6lgeren er bedst muligt forberedt.",
    },
    autonomyLevel: "supervised",
    scopeDepartment: "Levering",
    enabled: true,
    detectedCount: 8,
    confirmedCount: 7,
    dismissedCount: 1,
  },
  {
    slug: "new-lead-qualification",
    name: "Ny lead kvalificering",
    description:
      "Registrerer nye kontakter fra HubSpot, hjemmeside eller email og vurderer lead-kvalitet baseret p\u00e5 virksomhedsst\u00f8rrelse, branche og engagement. Foresl\u00e5r kvalificeringsskridt.",
    detectionLogic: {
      mode: "hybrid",
      structured: {
        entityType: "contact",
        signals: [
          { field: "createdDaysAgo", operator: "lte", value: 7 },
          { field: "hasAssociatedDeal", operator: "eq", value: false },
          { field: "source", operator: "in", value: ["hubspot", "website", "referral", "email"] },
        ],
      },
      naturalLanguage:
        "Find nye kontakter oprettet inden for de seneste 7 dage, som endnu ikke har en tilknyttet deal eller en planlagt kvalificeringssamtale. Priorit\u00e9r leads fra kendte virksomheder.",
    },
    autonomyLevel: "supervised",
    scopeDepartment: "Salg",
    enabled: true,
    detectedCount: 15,
    confirmedCount: 12,
    dismissedCount: 3,
  },
  {
    slug: "contract-renewal-approaching",
    name: "Kontraktfornyelse n\u00e6rmer sig",
    description:
      "Overv\u00e5ger retainer- og kontraktudl\u00f8b 4\u20138 uger f\u00f8r deadline. Analyserer kundetilfredshed, leverancehistorik og oms\u00e6tningspotentiale for at facilitere rettidig fornyelse.",
    detectionLogic: {
      mode: "hybrid",
      structured: {
        entityType: "deal",
        signals: [
          { field: "contractEndInWeeks", operator: "lte", value: 8 },
          { field: "contractEndInWeeks", operator: "gte", value: 2 },
          { field: "type", operator: "in", value: ["retainer", "subscription", "framework"] },
        ],
      },
      naturalLanguage:
        "Find kontrakter og retainer-aftaler der udl\u00f8ber inden for 2\u20138 uger. Vurd\u00e9r samarbejdets sundhed baseret p\u00e5 seneste interaktioner, leveret v\u00e6rdi og eventuelle \u00e5bne issues.",
    },
    autonomyLevel: "notify",
    scopeDepartment: "Salg",
    enabled: true,
    detectedCount: 6,
    confirmedCount: 5,
    dismissedCount: 1,
  },
  {
    slug: "cross-sell-opportunity",
    name: "Mersalgsmulighed",
    description:
      "Identificerer eksisterende kunder med potentiale for yderligere services baseret p\u00e5 nuv\u00e6rende engagement, branchetrends og virksomhedens servicekatalog.",
    detectionLogic: {
      mode: "hybrid",
      structured: {
        entityType: "deal",
        signals: [
          { field: "clientTenureMonths", operator: "gte", value: 6 },
          { field: "activeServicesCount", operator: "lte", value: 2 },
          { field: "clientSatisfactionScore", operator: "gte", value: 7 },
        ],
      },
      naturalLanguage:
        "Find langvarige kunder (6+ m\u00e5neder) med h\u00f8j tilfredshed, som kun bruger 1\u20132 services. Analyser hvilke yderligere ydelser der matcher deres behov baseret p\u00e5 branche og aktivitet.",
    },
    autonomyLevel: "supervised",
    scopeDepartment: "Salg",
    enabled: true,
    detectedCount: 4,
    confirmedCount: 3,
    dismissedCount: 1,
  },
  {
    slug: "support-ticket-escalation",
    name: "Support ticket eskalering",
    description:
      "Overv\u00e5ger support tickets der n\u00e6rmer sig SLA-gr\u00e6nser eller er ubesvarede i l\u00e6ngere tid. Eskalerer til relevant teamleder og prioriterer baseret p\u00e5 kundev\u00e6rdi og ticket-alvor.",
    detectionLogic: {
      mode: "hybrid",
      structured: {
        entityType: "ticket",
        signals: [
          { field: "hoursUnanswered", operator: "gte", value: 12 },
          { field: "priority", operator: "in", value: ["high", "critical"] },
          { field: "slaBreachInHours", operator: "lte", value: 24 },
        ],
      },
      naturalLanguage:
        "Find support tickets der enten har overskredet eller er t\u00e6t p\u00e5 at overskride SLA. Priorit\u00e9r tickets fra n\u00f8glekunder og dem med h\u00f8j prioritet der mangler svar.",
    },
    autonomyLevel: "supervised",
    scopeDepartment: "Levering",
    enabled: true,
    detectedCount: 9,
    confirmedCount: 8,
    dismissedCount: 1,
  },
  {
    slug: "team-capacity-alert",
    name: "Kapacitetsadvarsel",
    description:
      "Overv\u00e5ger teammedlemmers arbejdsbyrde og advarer n\u00e5r nogen har for mange \u00e5bne opgaver. Forebygger flaskehalse, SLA-brud og udtr\u00e6thed ved at foresl\u00e5 omfordeling.",
    detectionLogic: {
      mode: "hybrid",
      structured: {
        entityType: "team-member",
        signals: [
          { field: "openTaskCount", operator: "gte", value: 5 },
          { field: "openTicketCount", operator: "gte", value: 2 },
          { field: "utilizationPercent", operator: "gte", value: 90 },
        ],
      },
      naturalLanguage:
        "Identificer teammedlemmer med 5+ \u00e5bne opgaver eller en kombination af tickets og projekter der indikerer overbelastning. Tag h\u00f8jde for deadlines og SLA-krav.",
    },
    autonomyLevel: "supervised",
    scopeDepartment: "Levering",
    enabled: true,
    detectedCount: 5,
    confirmedCount: 4,
    dismissedCount: 1,
  },
];

// ---------------------------------------------------------------------------
// 2. Action capabilities
// ---------------------------------------------------------------------------

export type ActionCapabilityDef = {
  slug: string;
  name: string;
  description: string;
  connectorProvider?: string;
};

export const ACTION_CAPABILITIES: ActionCapabilityDef[] = [
  {
    slug: "send_email",
    name: "Send Email",
    description: "Send an email to a recipient",
    connectorProvider: "gmail",
  },
  {
    slug: "create_calendar_event",
    name: "Create Calendar Event",
    description: "Create a calendar event",
    connectorProvider: "google-calendar",
  },
  {
    slug: "send_slack_message",
    name: "Send Slack Message",
    description: "Send a message to a Slack channel",
    connectorProvider: "slack",
  },
  {
    slug: "crm_update",
    name: "Update CRM Field",
    description: "Update a field on a CRM entity",
    connectorProvider: "hubspot",
  },
  {
    slug: "add_internal_note",
    name: "Add Internal Note",
    description: "Add an internal note to a support ticket",
  },
];

// ---------------------------------------------------------------------------
// 3. Situations (20 total)
// ---------------------------------------------------------------------------

export type SituationDef = {
  id: string;
  typeSlug: string;
  status: string;
  severity: number;
  confidence: number;
  triggerEntityName: string;
  triggerEntityType: "invoice" | "deal" | "contact" | "ticket" | "team-member" | "company";
  reasoning: {
    analysis: string;
    evidenceSummary: string;
    consideredActions: Array<{
      action: string;
      evidenceFor: string[];
      evidenceAgainst: string[];
      expectedOutcome: string;
    }>;
    actionBatch: Array<{
      title: string;
      description: string;
      executionMode: string;
      actionCapabilityName?: string;
      params?: Record<string, unknown>;
    }> | null;
    confidence: number;
    missingContext: string[] | null;
  };
  contextSnapshot: Record<string, unknown>;
  contextMeta: Array<{ section: string; itemCount: number; tokenEstimate: number }>;
  modelId: string;
  promptVersion: number;
  reasoningDurationMs: number;
  apiCostCents: number;
  hoursAgo: number;
  resolvedHoursAgo?: number;
  outcome?: string;
  outcomeDetails?: Record<string, unknown>;
  feedback?: string;
  feedbackRating?: number;
  feedbackCategory?: string;
  billedCents?: number;
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

export const SITUATIONS: SituationDef[] = [
  // =========================================================================
  // GROUP A: Pending (4) — status "detected", no plan
  // =========================================================================

  // S1 — Overdue invoice: Dansk Energi Partners
  {
    id: "demo_sit_01",
    typeSlug: "overdue-invoice-followup",
    status: "detected",
    severity: 0.8,
    confidence: 0.92,
    triggerEntityName: "INV-2024-090",
    triggerEntityType: "invoice",
    reasoning: {
      analysis:
        "Faktura INV-2024-090 p\u00e5 68.750 DKK til Dansk Energi Partners er nu 12 dage forfalden. Kunden har et aktivt projekt med os og har historisk betalt inden for 30 dage, s\u00e5 forsinkelsen er usædvanlig. Der er allerede sendt to automatiske p\u00e5mindelser uden respons, hvilket indikerer at sagen kr\u00e6ver personlig opf\u00f8lgning. Karen Holst er den prim\u00e6re kontaktperson og har v\u00e6ret responsiv ved tidligere henvendelser.",
      evidenceSummary:
        "To automatiske p\u00e5mindelser er sendt uden reaktion. Bel\u00f8bet er betydeligt og kundens normale betalingsm\u00f8nster er v\u00e6sentligt overskredet. Der er et aktivt projektsamarbejde, s\u00e5 relationen er god.",
      consideredActions: [
        {
          action: "Send endnu en automatisk p\u00e5mindelse via email",
          evidenceFor: [
            "Lavere indsats, kan automatiseres fuldt",
            "Dokumenterer yderligere opf\u00f8lgning",
          ],
          evidenceAgainst: [
            "To p\u00e5mindelser er allerede ignoreret",
            "Risiko for at virke upersonligt",
          ],
          expectedOutcome: "Lav sandsynlighed for respons givet tidligere fors\u00f8g",
        },
        {
          action: "Personlig telefonopringning til Karen Holst",
          evidenceFor: [
            "Direkte kontakt bryder igennem email-st\u00f8j",
            "Karen har v\u00e6ret responsiv ved personlig henvendelse",
            "Viser at vi tager sagen seri\u00f8st",
          ],
          evidenceAgainst: [
            "Kr\u00e6ver manuelt engagement fra teamet",
            "Kan opfattes som pressions-taktik",
          ],
          expectedOutcome: "H\u00f8j sandsynlighed for afklaring og betalingsplan inden 48 timer",
        },
        {
          action: "Eskaler til \u00f8konomichef med formel rykkerskrivelse",
          evidenceFor: [
            "Formelt korrekt efter 2 p\u00e5mindelser",
            "Dokumenterer eskalering juridisk",
          ],
          evidenceAgainst: [
            "Kan skade kundeforholdet",
            "For tidligt givet det aktive samarbejde",
          ],
          expectedOutcome: "Betaling inden 14 dage, men potentiel relationsskade",
        },
      ],
      actionBatch: null,
      confidence: 0.92,
      missingContext: ["Seneste intern kommunikation med Dansk Energi Partners", "Eventuelle \u00e5bne tvister eller reklamationer"],
    },
    contextSnapshot: {
      entity: "INV-2024-090",
      amount: 68750,
      currency: "DKK",
      daysOverdue: 12,
      client: "Dansk Energi Partners",
      contact: "Karen Holst",
      contactEmail: "karen@danskenergi.dk",
      previousReminders: 2,
      lastReminderSentDaysAgo: 5,
      activeProject: "Energiportal Redesign",
      clientTenureMonths: 14,
      paymentHistory: { avgDaysToPayment: 22, totalInvoicesPaid: 9 },
    },
    contextMeta: [
      { section: "invoice_details", itemCount: 1, tokenEstimate: 180 },
      { section: "client_profile", itemCount: 1, tokenEstimate: 320 },
      { section: "communication_history", itemCount: 4, tokenEstimate: 540 },
      { section: "payment_history", itemCount: 9, tokenEstimate: 260 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 2340,
    apiCostCents: 4,
    hoursAgo: 2,
  },

  // S2 — Quiet deal: Bygholm Consulting
  {
    id: "demo_sit_02",
    typeSlug: "deal-gone-quiet",
    status: "detected",
    severity: 0.6,
    confidence: 0.78,
    triggerEntityName: "Bygholm Digital Transformation",
    triggerEntityType: "deal",
    reasoning: {
      analysis:
        "Bygholm Digital Transformation er en deal p\u00e5 420.000 DKK i proposal-stadiet, der ikke har haft nogen aktivitet fra Henrik Bygholm i 16 dage. Den seneste interaktion var afsendelse af vores tilbud, og der er hverken \u00e5bnet emails eller booket opf\u00f8lgningsmøde. Dealen er en af de st\u00f8rste i pipelinen og repr\u00e6senterer en potentiel strategisk kunde inden for r\u00e5dgivningsbranchen. Bygholm har 45 ansatte og har tidligere vist interesse for b\u00e5de digital strategi og implementering.",
      evidenceSummary:
        "420.000 DKK deal uden aktivitet i 16 dage efter proposal-afsendelse. Henrik Bygholm har ikke \u00e5bnet de seneste to emails. Dealen er i top-3 af v\u00e6rdi i nuv\u00e6rende pipeline.",
      consideredActions: [
        {
          action: "Send personlig opf\u00f8lgnings-email med v\u00e6rdi-vinkel",
          evidenceFor: [
            "Ikke-aggressiv tilgang der holder d\u00f8ren \u00e5ben",
            "Kan tilbyde nyt perspektiv p\u00e5 tilbuddet",
            "Email-historik dokumenterer engagement",
          ],
          evidenceAgainst: [
            "Henrik har ikke \u00e5bnet seneste emails",
            "Kan g\u00e5 tabt i indbakken",
          ],
          expectedOutcome: "Moderat sandsynlighed for respons inden 5 dage",
        },
        {
          action: "Ring Henrik direkte og foresl\u00e5 et kort opf\u00f8lgningsmøde",
          evidenceFor: [
            "Direkte kontakt er mere effektiv efter email-stilhed",
            "Viser engagement og seri\u00f8sitet",
            "Giver mulighed for at h\u00f8re eventuelle indvendinger",
          ],
          evidenceAgainst: [
            "Kan virke for p\u00e5g\u00e5ende",
            "Henrik kan v\u00e6re p\u00e5 ferie eller optaget",
          ],
          expectedOutcome: "H\u00f8j sandsynlighed for afklaring af dealens status",
        },
        {
          action: "Lad dealen ligge yderligere 7 dage f\u00f8r opf\u00f8lgning",
          evidenceFor: [
            "Giver Henrik tid til intern afklaring",
            "Undg\u00e5r at virke desperat",
          ],
          evidenceAgainst: [
            "16 dage er allerede lang tid for en deal af denne st\u00f8rrelse",
            "Konkurrenter kan v\u00e6re i dialog",
          ],
          expectedOutcome: "Risiko for at miste dealen til en konkurrent",
        },
      ],
      actionBatch: null,
      confidence: 0.78,
      missingContext: ["Om Henrik har v\u00e6ret p\u00e5 ferie", "Om der er konkurrerende tilbud"],
    },
    contextSnapshot: {
      entity: "Bygholm Digital Transformation",
      amount: 420000,
      currency: "DKK",
      stage: "proposal",
      daysSinceLastActivity: 16,
      client: "Bygholm Consulting",
      contact: "Henrik Bygholm",
      contactEmail: "henrik@bygholm.dk",
      contactTitle: "Managing Partner",
      companySize: 45,
      lastActivityType: "proposal_sent",
      emailOpensLast30Days: 0,
      pipelineRank: 2,
    },
    contextMeta: [
      { section: "deal_details", itemCount: 1, tokenEstimate: 240 },
      { section: "client_profile", itemCount: 1, tokenEstimate: 280 },
      { section: "activity_timeline", itemCount: 8, tokenEstimate: 620 },
      { section: "email_engagement", itemCount: 5, tokenEstimate: 190 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 1980,
    apiCostCents: 3,
    hoursAgo: 6,
  },

  // S3 — New lead: Pernille Juul
  {
    id: "demo_sit_03",
    typeSlug: "new-lead-qualification",
    status: "detected",
    severity: 0.3,
    confidence: 0.85,
    triggerEntityName: "Pernille Juul",
    triggerEntityType: "contact",
    reasoning: {
      analysis:
        "Pernille Juul, Head of Learning hos NextStep Education, er oprettet i HubSpot for 3 dage siden via en formular p\u00e5 vores hjemmeside. Hun downloadede vores whitepaper om digital transformation i uddannelsessektoren. Der er endnu ikke oprettet en deal eller booket et kvalificeringsopkald. NextStep Education er en mellemstor virksomhed med 120 ansatte og et \u00e5rligt IT-budget estimeret til 2-4 mio. DKK, hvilket g\u00f8r dem til en potentielt v\u00e6rdifuld kunde.",
      evidenceSummary:
        "Ny kontakt fra hjemmeside-formular, har vist interesse ved at downloade whitepaper. Passer i vores m\u00e5lgruppe (uddannelse/digitalisering) og virksomheden har relevant st\u00f8rrelse. Ingen opf\u00f8lgning foretaget endnu.",
      consideredActions: [
        {
          action: "Send personlig velkomst-email med relevant case study",
          evidenceFor: [
            "Viser interesse i whitepapers — er i research-fase",
            "Case study fra lignende branche kan skabe genklang",
            "Lav-risiko f\u00f8rste kontakt",
          ],
          evidenceAgainst: [
            "Kan v\u00e6re en passiv downloader uden reel k\u00f8bsintention",
            "Email alene driver sj\u00e6ldent konvertering",
          ],
          expectedOutcome: "Etablerer kontakt og m\u00e5ler engagement via email-\u00e5bninger",
        },
        {
          action: "Book kvalificeringsopkald direkte via Calendly-link",
          evidenceFor: [
            "Hurtig opf\u00f8lgning \u00f8ger konverteringsrate",
            "Head of Learning er en beslutningstager",
            "Direkte kontakt afklarer behov hurtigere",
          ],
          evidenceAgainst: [
            "Kan virke for aggressivt s\u00e5 tidligt i processen",
            "Pernille har kun downloadet \u00e9t whitepaper",
          ],
          expectedOutcome: "50% sandsynlighed for booking, hurtig kvalificering",
        },
      ],
      actionBatch: null,
      confidence: 0.85,
      missingContext: ["Om NextStep Education allerede bruger en konkurrents l\u00f8sning", "Pernilles beslutningskompetence"],
    },
    contextSnapshot: {
      entity: "Pernille Juul",
      title: "Head of Learning",
      company: "NextStep Education",
      companySize: 120,
      source: "website_form",
      contentDownloaded: "Whitepaper: Digital Transformation i Uddannelse",
      createdDaysAgo: 3,
      hasAssociatedDeal: false,
      qualificationCallScheduled: false,
      estimatedAnnualITBudget: "2-4M DKK",
      industry: "Education & Training",
    },
    contextMeta: [
      { section: "contact_details", itemCount: 1, tokenEstimate: 160 },
      { section: "company_profile", itemCount: 1, tokenEstimate: 240 },
      { section: "engagement_history", itemCount: 2, tokenEstimate: 120 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 1450,
    apiCostCents: 2,
    hoursAgo: 24,
  },

  // S4 — Team capacity alert: Kasper Dahl
  {
    id: "demo_sit_04",
    typeSlug: "team-capacity-alert",
    status: "detected",
    severity: 0.65,
    confidence: 0.9,
    triggerEntityName: "Kasper Dahl",
    triggerEntityType: "team-member",
    reasoning: {
      analysis:
        "Kasper Dahl har aktuelt 3 \u00e5bne support tickets (TK-301, TK-302, TK-304) plus 3 aktive projektopgaver i gang samtidig. Hans kapacitetsudnyttelse er estimeret til 115%, hvilket overskrider den anbefalede gr\u00e6nse p\u00e5 85%. TK-301 n\u00e6rmer sig SLA-gr\u00e6nsen p\u00e5 24 timer, og to af projektopgaverne har deadline inden for denne uge. Risikoen for b\u00e5de SLA-brud og kvalitetsforringelse p\u00e5 projektleverancer er h\u00f8j.",
      evidenceSummary:
        "6 samtidige \u00e5bne opgaver med 115% kapacitetsudnyttelse. SLA-risiko p\u00e5 TK-301, og to projektdeadlines denne uge. Kasper har ikke taget fri de seneste 3 uger.",
      consideredActions: [
        {
          action: "Omfordel \u00e9n eller flere tickets til Thomas N\u00f8rgaard",
          evidenceFor: [
            "Thomas har kapacitet (65% udnyttelse)",
            "Reducerer Kaspers belastning umiddelbart",
            "Thomas har erfaring med lignende tickets",
          ],
          evidenceAgainst: [
            "Overlevering koster tid i kontekst-skift",
            "Kasper kender kunderne bedst",
          ],
          expectedOutcome: "Kaspers kapacitet reduceres til ca. 90%, SLA-risiko elimineres",
        },
        {
          action: "Udskyd ikke-kritiske projektopgaver med 3-5 dage",
          evidenceFor: [
            "Giver luft til at fokusere p\u00e5 tickets med SLA",
            "Projektmanager kan typisk absorbere kort forsinkelse",
          ],
          evidenceAgainst: [
            "Kan forsinke projektleverancer",
            "Kunder forventer rettidig levering",
          ],
          expectedOutcome: "Midlertidig aflastning, men grundproblemet best\u00e5r",
        },
        {
          action: "Eskaler til teamleder for kapacitetsgennemgang",
          evidenceFor: [
            "Systemisk problem der kr\u00e6ver ledelsesm\u00e6ssig l\u00f8sning",
            "Forebygger fremtidige overbelastninger",
            "Kasper har v\u00e6ret overbelastet i 3 uger",
          ],
          evidenceAgainst: [
            "Tager l\u00e6ngere tid at f\u00e5 effekt",
            "Kan opfattes som kritik af Kasper",
          ],
          expectedOutcome: "Langsigtet l\u00f8sning med bedre opgavefordeling i teamet",
        },
      ],
      actionBatch: null,
      confidence: 0.9,
      missingContext: ["Om Kasper selv har flagget overbelastning", "Prioritering mellem tickets og projektopgaver"],
    },
    contextSnapshot: {
      entity: "Kasper Dahl",
      role: "Developer Lead",
      department: "Levering",
      openTickets: ["TK-301", "TK-302", "TK-304"],
      activeProjectTasks: 3,
      utilizationPercent: 115,
      slaAtRisk: "TK-301",
      deadlinesThisWeek: 2,
      daysSinceLastTimeOff: 21,
      teamCapacity: {
        thomas: { utilization: 65, openTickets: 1 },
        line: { utilization: 80, openTickets: 2 },
        emil: { utilization: 75, openTickets: 2 },
      },
    },
    contextMeta: [
      { section: "team_member_profile", itemCount: 1, tokenEstimate: 140 },
      { section: "open_tickets", itemCount: 3, tokenEstimate: 380 },
      { section: "project_tasks", itemCount: 3, tokenEstimate: 290 },
      { section: "team_capacity", itemCount: 4, tokenEstimate: 220 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 2110,
    apiCostCents: 4,
    hoursAgo: 4,
  },

  // =========================================================================
  // GROUP B: Awaiting approval WITH plans (4) — status "proposed"
  // =========================================================================

  // S5 — Overdue invoice: Aarhus Creative Hub
  {
    id: "demo_sit_05",
    typeSlug: "overdue-invoice-followup",
    status: "proposed",
    severity: 0.7,
    confidence: 0.88,
    triggerEntityName: "INV-2024-094",
    triggerEntityType: "invoice",
    reasoning: {
      analysis:
        "INV-2024-094 p\u00e5 37.500 DKK til Aarhus Creative Hub er 8 dage forfalden. Simon Krogh er kontaktperson, og vi har et godt l\u00f8bende samarbejde med dem om deres produktside og mobiloptimering. Der er endnu ikke sendt en personlig p\u00e5mindelse — kun den automatiske faktura-notifikation. Bel\u00f8bet er moderat, men rettidig betaling er vigtig for vores cashflow. Simonshistorisk betalingsm\u00f8nster viser typisk betaling inden for 20 dage.",
      evidenceSummary:
        "37.500 DKK faktura, 8 dage forfalden, kun automatisk notifikation sendt. Kunden har normalt et godt betalingsm\u00f8nster. Aktivt projektsamarbejde giver god relation at bygge p\u00e5.",
      consideredActions: [
        {
          action: "Send personlig p\u00e5mindelses-email",
          evidenceFor: [
            "F\u00f8rste personlige henvendelse — passende eskalering",
            "God relation med Simon g\u00f8r det naturligt",
            "Kan inkludere bankoplysninger for nem betaling",
          ],
          evidenceAgainst: [
            "Email kan overses",
            "Simon kan allerede have igangsat betaling",
          ],
          expectedOutcome: "H\u00f8j sandsynlighed for betaling inden 5 dage",
        },
        {
          action: "Ring Simon for at f\u00f8lge op mundtligt",
          evidenceFor: [
            "Hurtigere afklaring end email",
            "Personlig kontakt styrker relationen",
          ],
          evidenceAgainst: [
            "For tidligt at ringe — kun 8 dage forfalden",
            "Kan virke overivrigt for bel\u00f8bet",
          ],
          expectedOutcome: "Hurtig afklaring, men kan opfattes som for aggressivt",
        },
      ],
      actionBatch: [
        {
          title: "Send p\u00e5mindelses-email til Simon Krogh",
          description: "Personlig venlig p\u00e5mindelse med fakturadetaljer og bankoplysninger",
          executionMode: "automated",
          actionCapabilityName: "send_email",
          params: {
            to: "simon@aarhuscreative.dk",
            subject: "P\u00e5mindelse: Faktura INV-2024-094 \u2014 37.500 DKK forfalden",
            body: "K\u00e6re Simon,\n\nVi tillader os at minde om, at faktura INV-2024-094 p\u00e5 37.500 DKK forfaldt for 8 dage siden.\n\nFakturaen d\u00e6kker det afsluttede arbejde med jeres produktside og mobiloptimering.\n\nVi vil s\u00e6tte pris p\u00e5, hvis betalingen kan ekspederes hurtigst muligt.\n\nBankoplysninger:\nReg.nr.: 1234\nKontonr.: 5678901234\nRef.: INV-2024-094\n\nHar du sp\u00f8rgsm\u00e5l, er du velkommen til at kontakte os.\n\nVenlig hilsen,\nLouise Winther\nTest Company",
          },
        },
        {
          title: "Opdater betalingsstatus i CRM",
          description: "Marker fakturaen som forfalden og opdater seneste kontakt-dato",
          executionMode: "automated",
          actionCapabilityName: "crm_update",
          params: {
            entityId: "placeholder",
            updates: {
              payment_status: { from: "current", to: "overdue" },
              last_contacted: { from: "2024-03-10", to: "today" },
            },
          },
        },
        {
          title: "Notificer \u00f8konomi-teamet i Slack",
          description: "Send besked i #\u00f8konomi med status p\u00e5 forfaldne faktura",
          executionMode: "automated",
          actionCapabilityName: "send_slack_message",
          params: {
            channel: "#\u00f8konomi",
            message: "\u26a0\ufe0f INV-2024-094 (Aarhus Creative Hub, 37.500 DKK) er nu 8 dage forfalden. P\u00e5mindelsesemail sendt til Simon Krogh.",
          },
        },
      ],
      confidence: 0.88,
      missingContext: null,
    },
    contextSnapshot: {
      entity: "INV-2024-094",
      amount: 37500,
      currency: "DKK",
      daysOverdue: 8,
      client: "Aarhus Creative Hub",
      contact: "Simon Krogh",
      contactEmail: "simon@aarhuscreative.dk",
      previousReminders: 0,
      activeProject: "Produktside & Mobiloptimering",
      clientTenureMonths: 10,
      paymentHistory: { avgDaysToPayment: 18, totalInvoicesPaid: 6 },
    },
    contextMeta: [
      { section: "invoice_details", itemCount: 1, tokenEstimate: 190 },
      { section: "client_profile", itemCount: 1, tokenEstimate: 310 },
      { section: "payment_history", itemCount: 6, tokenEstimate: 220 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 3120,
    apiCostCents: 5,
    hoursAgo: 8,
    plan: {
      status: "pending",
      steps: [
        {
          title: "Send p\u00e5mindelses-email til Simon Krogh",
          description: "Personlig venlig p\u00e5mindelse med fakturadetaljer og bankoplysninger",
          executionMode: "automated",
          capabilitySlug: "send_email",
          parameters: {
            to: "simon@aarhuscreative.dk",
            subject: "P\u00e5mindelse: Faktura INV-2024-094 \u2014 37.500 DKK forfalden",
            body: "K\u00e6re Simon,\n\nVi tillader os at minde om, at faktura INV-2024-094 p\u00e5 37.500 DKK forfaldt for 8 dage siden.\n\nFakturaen d\u00e6kker det afsluttede arbejde med jeres produktside og mobiloptimering.\n\nVi vil s\u00e6tte pris p\u00e5, hvis betalingen kan ekspederes hurtigst muligt.\n\nBankoplysninger:\nReg.nr.: 1234\nKontonr.: 5678901234\nRef.: INV-2024-094\n\nHar du sp\u00f8rgsm\u00e5l, er du velkommen til at kontakte os.\n\nVenlig hilsen,\nLouise Winther\nTest Company",
          },
          status: "pending",
        },
        {
          title: "Opdater betalingsstatus i CRM",
          description: "Marker fakturaen som forfalden og opdater seneste kontakt-dato",
          executionMode: "automated",
          capabilitySlug: "crm_update",
          parameters: {
            entityId: "placeholder",
            updates: {
              payment_status: { from: "current", to: "overdue" },
              last_contacted: { from: "2024-03-10", to: "today" },
            },
          },
          status: "pending",
        },
        {
          title: "Notificer \u00f8konomi-teamet i Slack",
          description: "Send besked i #\u00f8konomi med status p\u00e5 forfaldne faktura",
          executionMode: "automated",
          capabilitySlug: "send_slack_message",
          parameters: {
            channel: "#\u00f8konomi",
            message: "\u26a0\ufe0f INV-2024-094 (Aarhus Creative Hub, 37.500 DKK) er nu 8 dage forfalden. P\u00e5mindelsesemail sendt til Simon Krogh.",
          },
          status: "pending",
        },
      ],
    },
  },

  // S6 — Contract renewal: Nordlys Media
  {
    id: "demo_sit_06",
    typeSlug: "contract-renewal-approaching",
    status: "proposed",
    severity: 0.5,
    confidence: 0.91,
    triggerEntityName: "Nordlys Q2 Retainer Renewal",
    triggerEntityType: "deal",
    reasoning: {
      analysis:
        "Nordlys Medias retainer-aftale udl\u00f8ber om 6 uger, og det er tid til at starte fornyelsesprocessen. Samarbejdet har varet 18 m\u00e5neder med gode resultater — herunder en ny brandplatform og 35% stigning i organisk trafik i Q1. S\u00f8ren Fabricius er vores prim\u00e6re kontakt og har v\u00e6ret en engageret samarbejdspartner. Der er potentiale for at udvide scopet til at inkludere social media management, som S\u00f8ren har n\u00e6vnt interesse for ved seneste kvartalsm\u00f8de.",
      evidenceSummary:
        "18 m\u00e5neders succesfuldt samarbejde med m\u00e5lbare resultater. Retainer udl\u00f8ber om 6 uger — optimal timing for at indlede fornyelsesdialog. S\u00f8ren har udtrykt interesse for yderligere services.",
      consideredActions: [
        {
          action: "Send fornyelsesmail og inviter til m\u00f8de",
          evidenceFor: [
            "Proaktiv tilgang viser professionalisme",
            "6 uger giver god tid til forhandling",
            "Kan kombinere fornyelse med upsell-mulighed",
          ],
          evidenceAgainst: [
            "S\u00f8ren kan \u00f8nske at evaluere alternativer f\u00f8rst",
          ],
          expectedOutcome: "H\u00f8j sandsynlighed for m\u00f8de og fornyelse med evt. udvidet scope",
        },
        {
          action: "Vent til 4 uger f\u00f8r udl\u00f8b f\u00f8r henvendelse",
          evidenceFor: [
            "Giver mere tid til at forberede et st\u00e6rkt tilbud",
            "Undg\u00e5r at virke for ivrig",
          ],
          evidenceAgainst: [
            "Risiko for at S\u00f8ren allerede kigger p\u00e5 alternativer",
            "Kortere forhandlingstid",
          ],
          expectedOutcome: "Risiko for at miste ideat i forhandlingen",
        },
        {
          action: "Send rapport over leverancens resultater f\u00f8r fornyelsesm\u00f8de",
          evidenceFor: [
            "Dokumenterer v\u00e6rdien vi har leveret",
            "Styrker forhandlingspositionen",
            "Viser transparens og professionalisme",
          ],
          evidenceAgainst: [
            "Kr\u00e6ver tid at sammens\u00e6tte rapport",
          ],
          expectedOutcome: "Bedre udgangspunkt for forhandling og potentiel prisforh\u00f8jelse",
        },
      ],
      actionBatch: [
        {
          title: "Send fornyelsesmail til S\u00f8ren Fabricius",
          description: "Personlig mail med tak for samarbejdet og invitation til fornyelsesm\u00f8de",
          executionMode: "automated",
          actionCapabilityName: "send_email",
        },
        {
          title: "Opret fornyelsesm\u00f8de i kalenderen",
          description: "Book m\u00f8de n\u00e6ste tirsdag med S\u00f8ren, Mette og Anders",
          executionMode: "automated",
          actionCapabilityName: "create_calendar_event",
        },
        {
          title: "Opdater CRM med fornyelsesstadie",
          description: "Flyt deal til renewal-stage og tilf\u00f8j noter",
          executionMode: "automated",
          actionCapabilityName: "crm_update",
        },
        {
          title: "Notificer salgsteamet i Slack",
          description: "Informer teamet om igangsat fornyelsesproces",
          executionMode: "automated",
          actionCapabilityName: "send_slack_message",
        },
      ],
      confidence: 0.91,
      missingContext: null,
    },
    contextSnapshot: {
      entity: "Nordlys Q2 Retainer Renewal",
      retainerMonthlyValue: 45000,
      currency: "DKK",
      contractEndInWeeks: 6,
      client: "Nordlys Media",
      contact: "S\u00f8ren Fabricius",
      contactEmail: "soeren@nordlys.dk",
      partnershipMonths: 18,
      keyResults: {
        brandPlatform: "delivered",
        organicTrafficGrowthQ1: "35%",
        campaignsDelivered: 12,
      },
      upsellOpportunity: "Social media management",
      teamMembers: ["Mette Lindberg", "Anders Vestergaard"],
    },
    contextMeta: [
      { section: "deal_details", itemCount: 1, tokenEstimate: 260 },
      { section: "client_profile", itemCount: 1, tokenEstimate: 340 },
      { section: "deliverables_history", itemCount: 12, tokenEstimate: 580 },
      { section: "meeting_notes", itemCount: 4, tokenEstimate: 420 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 3540,
    apiCostCents: 6,
    hoursAgo: 12,
    plan: {
      status: "pending",
      steps: [
        {
          title: "Send fornyelsesmail til S\u00f8ren Fabricius",
          description: "Personlig mail med tak for samarbejdet og invitation til fornyelsesm\u00f8de",
          executionMode: "automated",
          capabilitySlug: "send_email",
          parameters: {
            to: "soeren@nordlys.dk",
            subject: "Nordlys \u00d7 Test Company \u2014 Retainer fornyelse",
            body: "K\u00e6re S\u00f8ren,\n\nTak for et fantastisk samarbejde de sidste 18 m\u00e5neder. Vi er glade for de resultater, vi har leveret sammen \u2014 bl.a. jeres nye brandplatform og den \u00f8gede organiske trafik i Q1.\n\nDa vores retainer-aftale udl\u00f8ber om 6 uger, vil vi gerne invitere dig til et m\u00f8de, hvor vi kan dr\u00f8fte fornyelse og eventuel udvidelse af scopet.\n\nHvorn\u00e5r passer det dig i n\u00e6ste uge?\n\nBedste hilsner,\nMette Lindberg\nTest Company",
          },
          status: "pending",
        },
        {
          title: "Opret fornyelsesm\u00f8de i kalenderen",
          description: "Book m\u00f8de n\u00e6ste tirsdag med S\u00f8ren, Mette og Anders",
          executionMode: "automated",
          capabilitySlug: "create_calendar_event",
          parameters: {
            title: "Retainer Fornyelse \u2014 Nordlys Media",
            startTime: nextWeekday(2, 10, 0),
            endTime: nextWeekday(2, 11, 0),
            attendees: ["mette@testcompany.dk", "anders@testcompany.dk", "soeren@nordlys.dk"],
            location: "Google Meet",
          },
          status: "pending",
        },
        {
          title: "Opdater CRM med fornyelsesstadie",
          description: "Flyt deal til renewal-stage og tilf\u00f8j noter",
          executionMode: "automated",
          capabilitySlug: "crm_update",
          parameters: {
            entityId: "placeholder",
            updates: {
              stage: { from: "negotiation", to: "renewal" },
              notes: { from: "", to: "Renewal process initiated. Meeting scheduled." },
            },
          },
          status: "pending",
        },
        {
          title: "Notificer salgsteamet i Slack",
          description: "Informer teamet om igangsat fornyelsesproces",
          executionMode: "automated",
          capabilitySlug: "send_slack_message",
          parameters: {
            channel: "#salg",
            message: "\ud83d\udccb Nordlys Media retainer renewal startet. M\u00f8de planlagt n\u00e6ste tirsdag med S\u00f8ren. Anders og Mette deltager.",
          },
          status: "pending",
        },
      ],
    },
  },

  // S7 — Support escalation: TK-305
  {
    id: "demo_sit_07",
    typeSlug: "support-ticket-escalation",
    status: "proposed",
    severity: 0.7,
    confidence: 0.93,
    triggerEntityName: "TK-305",
    triggerEntityType: "ticket",
    reasoning: {
      analysis:
        "Support ticket TK-305 fra Aarhus Creative Hub rapporterer en responsivitetsfejl p\u00e5 deres produktside p\u00e5 mobile enheder. Ticketen er 18 timer gammel og har h\u00f8j prioritet med en SLA p\u00e5 24 timer, s\u00e5 der er kun 6 timer til SLA-brud. Simon Krogh har rapporteret at produktsiden er ubrugelig p\u00e5 mobil, hvilket direkte p\u00e5virker deres salg. Thomas N\u00f8rgaard (Head of Delivery) b\u00f8r involveres da det er et frontend-problem der kr\u00e6ver senior-ekspertise.",
      evidenceSummary:
        "H\u00f8j-prioritets mobilfejl med kun 6 timer til SLA-brud. Kundens produktside er dysfunktionel p\u00e5 mobil, hvilket p\u00e5virker deres omsætning direkte. Kr\u00e6ver eskalering til senior-niveau.",
      consideredActions: [
        {
          action: "Eskaler til Thomas N\u00f8rgaard med urgency-flag",
          evidenceFor: [
            "Thomas er specialist i frontend og mobiloptimering",
            "SLA-deadline kr\u00e6ver hurtig handling",
            "Kunden er en vigtig klient med aktiv faktura",
          ],
          evidenceAgainst: [
            "Thomas kan allerede v\u00e6re optaget",
            "Eskalering b\u00f8r f\u00f8lge normal procedure",
          ],
          expectedOutcome: "L\u00f8sning inden SLA-deadline med senior-kompetence",
        },
        {
          action: "Tildel til n\u00e6ste ledige udvikler i k\u00f8en",
          evidenceFor: [
            "F\u00f8lger normal workflow",
            "Flere udviklere kan potentielt l\u00f8se det",
          ],
          evidenceAgainst: [
            "K\u00f8en kan v\u00e6re lang",
            "Junior-udviklere kan tage l\u00e6ngere tid",
            "SLA-risiko er for h\u00f8j til normal k\u00f8",
          ],
          expectedOutcome: "Usikker tidslinje, h\u00f8j risiko for SLA-brud",
        },
      ],
      actionBatch: [
        {
          title: "Tilf\u00f8j intern eskaleringsnotits p\u00e5 ticket",
          description: "Dokumenter eskalering og prioritet p\u00e5 TK-305",
          executionMode: "automated",
          actionCapabilityName: "add_internal_note",
        },
        {
          title: "Notificer leverings-teamet i Slack",
          description: "Alert Thomas direkte i #levering med deadline",
          executionMode: "automated",
          actionCapabilityName: "send_slack_message",
        },
      ],
      confidence: 0.93,
      missingContext: null,
    },
    contextSnapshot: {
      entity: "TK-305",
      title: "Mobile responsiveness bug on product page",
      client: "Aarhus Creative Hub",
      contact: "Simon Krogh",
      priority: "high",
      slaHoursRemaining: 6,
      createdHoursAgo: 18,
      description: "Produktsiden wrapper ikke korrekt p\u00e5 mobil (iOS Safari og Chrome). Billeder overl\u00f8ber containeren og knapper er ikke klikbare.",
      assignedTo: null,
      relatedProject: "Produktside & Mobiloptimering",
      escalationTarget: "Thomas N\u00f8rgaard",
    },
    contextMeta: [
      { section: "ticket_details", itemCount: 1, tokenEstimate: 220 },
      { section: "client_profile", itemCount: 1, tokenEstimate: 180 },
      { section: "related_project", itemCount: 1, tokenEstimate: 290 },
      { section: "team_availability", itemCount: 3, tokenEstimate: 150 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 1890,
    apiCostCents: 3,
    hoursAgo: 5,
    plan: {
      status: "pending",
      steps: [
        {
          title: "Tilf\u00f8j intern eskaleringsnotits p\u00e5 ticket",
          description: "Dokumenter eskalering og prioritet p\u00e5 TK-305",
          executionMode: "automated",
          capabilitySlug: "add_internal_note",
          parameters: {
            ticketId: "TK-305",
            message: "Eskaleret til Thomas N\u00f8rgaard (Head of Delivery). Kundens produktside har responsivitetsproblemer p\u00e5 mobil. Prioritet: h\u00f8j. SLA: 24 timer.",
            isInternal: true,
          },
          status: "pending",
        },
        {
          title: "Notificer leverings-teamet i Slack",
          description: "Alert Thomas direkte i #levering med deadline",
          executionMode: "automated",
          capabilitySlug: "send_slack_message",
          parameters: {
            channel: "#levering",
            message: "\ud83d\udd34 TK-305 eskaleret: Aarhus Creative Hub mobilfejl. @Thomas \u2014 beh\u00f8ver din opm\u00e6rksomhed inden kl. 17.",
          },
          status: "pending",
        },
      ],
    },
  },

  // S8 — Client meeting prep: Vestjysk Finans
  {
    id: "demo_sit_08",
    typeSlug: "client-meeting-prep",
    status: "proposed",
    severity: 0.4,
    confidence: 0.87,
    triggerEntityName: "Vestjysk Finans Portal",
    triggerEntityType: "deal",
    reasoning: {
      analysis:
        "Morgendagens demo med Vestjysk Finans er en afg\u00f8rende milepæl for en deal p\u00e5 340.000 DKK. Jens Matthiesen (CFO) deltager, og han er s\u00e6rligt optaget af ROI-beregning, sikkerhedsarkitektur og GDPR-compliance. Oliver skal pr\u00e6sentere, men har brug for en brief med fokusomr\u00e5der og relevante cases. Bygholm-projektet er en god reference, da det havde lignende compliance-krav. Mette b\u00f8r v\u00e6re backup for tekniske sp\u00f8rgsm\u00e5l.",
      evidenceSummary:
        "340.000 DKK deal med demo i morgen. CFO deltager med fokus p\u00e5 ROI og sikkerhed. Oliver har brug for forberedelsesmateriale, og Bygholm-casen er relevant reference.",
      consideredActions: [
        {
          action: "Send forberedelsesbrief til Oliver med n\u00f8glepunkter",
          evidenceFor: [
            "Oliver f\u00e5r struktureret overblik over kundens fokusomr\u00e5der",
            "Bygholm-casen styrker pr\u00e6sentationen",
            "Tidlig forberedelse giver bedre demo",
          ],
          evidenceAgainst: [
            "Oliver kender m\u00e5ske allerede detaljerne",
            "For meget information kan forvirre",
          ],
          expectedOutcome: "Mere fokuseret og overbevisende demo",
        },
        {
          action: "Book intern prep-session i dag kl. 16",
          evidenceFor: [
            "Teamet kan gennemg\u00e5 demoen sammen",
            "Mette kan forberede tekniske svar",
            "Afdækker huller i pr\u00e6sentationen",
          ],
          evidenceAgainst: [
            "Kort varsel kan g\u00f8re det sv\u00e6rt at deltage",
          ],
          expectedOutcome: "Teamet er fuldt forberedt og aligned",
        },
        {
          action: "Lad Oliver h\u00e5ndtere forberedelsen selv",
          evidenceFor: [
            "Oliver er erfaren s\u00e6lger",
            "Undg\u00e5r over-management",
          ],
          evidenceAgainst: [
            "H\u00f8j dealv\u00e6rdi retf\u00e6rdigg\u00f8r ekstra forberedelse",
            "CFO-deltagelse kr\u00e6ver s\u00e6rlig opmærksomhed",
          ],
          expectedOutcome: "Risiko for at misse vigtige fokuspunkter",
        },
      ],
      actionBatch: [
        {
          title: "Send forberedelsesbrief til Oliver",
          description: "Email med deal-overblik, deltagerinformation og fokusomr\u00e5der",
          executionMode: "automated",
          actionCapabilityName: "send_email",
        },
        {
          title: "Post reminder i #salg",
          description: "Notificer teamet om morgendagens demo",
          executionMode: "automated",
          actionCapabilityName: "send_slack_message",
        },
        {
          title: "Opret prep-session i kalenderen",
          description: "Book 30 min prep-session i dag kl. 16 for Oliver og Mette",
          executionMode: "automated",
          actionCapabilityName: "create_calendar_event",
        },
      ],
      confidence: 0.87,
      missingContext: null,
    },
    contextSnapshot: {
      entity: "Vestjysk Finans Portal",
      amount: 340000,
      currency: "DKK",
      stage: "demo",
      client: "Vestjysk Finans",
      contact: "Jens Matthiesen",
      contactTitle: "CFO",
      demoDate: "i morgen kl. 14:00",
      presenter: "Oliver",
      backup: "Mette",
      focusAreas: ["ROI-beregning", "Sikkerhedsarkitektur", "GDPR-compliance", "Integrationsmuligheder"],
      relevantCase: "Bygholm-projektet",
      dealNotes: "Jens er s\u00e6rligt optaget af compliance og databehandleraftaler",
    },
    contextMeta: [
      { section: "deal_details", itemCount: 1, tokenEstimate: 280 },
      { section: "contact_profile", itemCount: 1, tokenEstimate: 190 },
      { section: "meeting_agenda", itemCount: 1, tokenEstimate: 150 },
      { section: "reference_cases", itemCount: 2, tokenEstimate: 420 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 2780,
    apiCostCents: 5,
    hoursAgo: 3,
    plan: {
      status: "pending",
      steps: [
        {
          title: "Send forberedelsesbrief til Oliver",
          description: "Email med deal-overblik, deltagerinformation og fokusomr\u00e5der",
          executionMode: "automated",
          capabilitySlug: "send_email",
          parameters: {
            to: "oliver@testcompany.dk",
            subject: "Forberedelse: Vestjysk Finans demo i morgen",
            body: "Hej Oliver,\n\nHer er en brief til morgendagens demo med Vestjysk Finans:\n\n\ud83d\udcca Deal: Vestjysk Finans Portal \u2014 340.000 DKK\n\ud83d\udc64 Deltager: Jens Matthiesen (CFO)\n\ud83c\udfaf Fokusomr\u00e5der: ROI-beregning, sikkerhedsarkitektur, integrationsmuligheder\n\n\ud83d\udca1 Jens er s\u00e6rligt optaget af compliance og GDPR. Forbered eksempler fra Bygholm-projektet.\n\nMette er backup hvis der kommer tekniske sp\u00f8rgsm\u00e5l.\n\nHeld og lykke!\n\u2014 Qorpera AI",
          },
          status: "pending",
        },
        {
          title: "Post reminder i #salg",
          description: "Notificer teamet om morgendagens demo",
          executionMode: "automated",
          capabilitySlug: "send_slack_message",
          parameters: {
            channel: "#salg",
            message: "\ud83d\udccc Reminder: Vestjysk Finans demo i morgen kl. 14:00. Oliver pr\u00e6senterer, Mette backup. Jens (CFO) deltager \u2014 fokus p\u00e5 ROI og sikkerhed.",
          },
          status: "pending",
        },
        {
          title: "Opret prep-session i kalenderen",
          description: "Book 30 min prep-session i dag kl. 16 for Oliver og Mette",
          executionMode: "automated",
          capabilitySlug: "create_calendar_event",
          parameters: {
            title: "Prep: Vestjysk Finans Demo",
            startTime: todayAt(16, 0),
            endTime: todayAt(16, 30),
            attendees: ["oliver@testcompany.dk", "mette@testcompany.dk"],
            location: "M\u00f8derum 2",
          },
          status: "pending",
        },
      ],
    },
  },

  // =========================================================================
  // GROUP C: Executing (2) — status "executing"
  // =========================================================================

  // S9 — Email sent: Roskilde Byg
  {
    id: "demo_sit_09",
    typeSlug: "deal-gone-quiet",
    status: "executing",
    severity: 0.4,
    confidence: 0.72,
    triggerEntityName: "Roskilde Final Deliverables",
    triggerEntityType: "deal",
    reasoning: {
      analysis:
        "Roskilde Byg & Anl\u00e6g-projektet er afsluttet og alle leverancer er klar til overdragelse. Tom Andersen har v\u00e6ret stille de seneste 10 dage efter projektafslutningen, og de endelige filer er uploadet til den delte Drive-mappe. En afslutningsmail er allerede sendt med link til filerne. N\u00e6ste skridt er at opdatere CRM fra closed-won til delivered for at afslutte projektcyklussen korrekt.",
      evidenceSummary:
        "Projekt afsluttet med alle leverancer klar. Afslutningsmail sendt for 16 timer siden. CRM mangler opdatering til delivered-status for korrekt afslutning.",
      consideredActions: [
        {
          action: "Send afslutningsmail med leverancer",
          evidenceFor: [
            "Professionel afslutning af projektet",
            "Dokumenterer overdragelse formelt",
          ],
          evidenceAgainst: [
            "Tom kan allerede have downloadet filerne",
          ],
          expectedOutcome: "Ren afslutning af projektet, god relation vedligeholdt",
        },
        {
          action: "Opdater CRM til delivered-status",
          evidenceFor: [
            "Korrekt pipeline-tracking",
            "N\u00f8dvendigt for rapportering og revenue recognition",
          ],
          evidenceAgainst: [],
          expectedOutcome: "Ren data i CRM, korrekte rapporter",
        },
      ],
      actionBatch: [
        {
          title: "Send afslutningsmail",
          description: "Email til Tom med link til endelige leverancer",
          executionMode: "automated",
          actionCapabilityName: "send_email",
        },
        {
          title: "Opdater CRM-status",
          description: "Flyt deal fra closed-won til delivered",
          executionMode: "automated",
          actionCapabilityName: "crm_update",
        },
      ],
      confidence: 0.72,
      missingContext: null,
    },
    contextSnapshot: {
      entity: "Roskilde Final Deliverables",
      client: "Roskilde Byg & Anl\u00e6g",
      contact: "Tom Andersen",
      contactEmail: "tom@roskildebyg.dk",
      projectValue: 185000,
      currency: "DKK",
      stage: "closed-won",
      deliverableStatus: "complete",
      driveFolderShared: true,
      daysSinceLastActivity: 10,
    },
    contextMeta: [
      { section: "deal_details", itemCount: 1, tokenEstimate: 200 },
      { section: "deliverables", itemCount: 8, tokenEstimate: 340 },
      { section: "client_profile", itemCount: 1, tokenEstimate: 180 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 1650,
    apiCostCents: 3,
    hoursAgo: 18,
    plan: {
      status: "executing",
      steps: [
        {
          title: "Send afslutningsmail til Tom Andersen",
          description: "Email med link til endelige leverancer i Drive",
          executionMode: "automated",
          capabilitySlug: "send_email",
          parameters: {
            to: "tom@roskildebyg.dk",
            subject: "Afsluttende leverancer \u2014 Roskilde Byg & Anl\u00e6g",
            body: "Hej Tom,\n\nAlle endelige filer og dokumentation er klar til overdragelse. Du kan finde alt i den delte Drive-mappe.\n\nLad os vide, hvis der mangler noget.\n\nMvh,\nLine Kj\u00e6r\nTest Company",
          },
          status: "completed",
          completedHoursAgo: 16,
        },
        {
          title: "Opdater CRM-status til delivered",
          description: "Flyt deal fra closed-won til delivered med afslutningsnotits",
          executionMode: "automated",
          capabilitySlug: "crm_update",
          parameters: {
            entityId: "placeholder",
            updates: {
              stage: { from: "closed-won", to: "delivered" },
              notes: { from: "", to: "Final deliverables sent to client" },
            },
          },
          status: "pending",
        },
      ],
    },
  },

  // S10 — Follow-up: GreenTech Nordic onboarding
  {
    id: "demo_sit_10",
    typeSlug: "new-lead-qualification",
    status: "executing",
    severity: 0.35,
    confidence: 0.82,
    triggerEntityName: "GreenTech Onboarding Package",
    triggerEntityType: "deal",
    reasoning: {
      analysis:
        "GreenTech Nordic er en nyligt konverteret kunde, og onboarding-processen er i gang. Anna Gr\u00f8n er vores prim\u00e6re kontakt og har modtaget velkomstpakken via email for 34 timer siden. CRM er opdateret med den nye deal-status. Det sidste trin er at notificere salgsteamet i Slack om den succesfulde onboarding, s\u00e5 hele teamet er informeret og kan bidrage til en god start p\u00e5 samarbejdet.",
      evidenceSummary:
        "Velkomstemail sendt og CRM opdateret. Mangler kun Slack-notifikation til salgsteamet for fuld proces-afslutning. GreenTech er en lovende ny kunde i b\u00e6redygtighedssektoren.",
      consideredActions: [
        {
          action: "Send velkomst-email med onboarding-materiale",
          evidenceFor: [
            "S\u00e6tter en professionel start p\u00e5 samarbejdet",
            "Anna f\u00e5r alt n\u00f8dvendigt materiale samlet",
          ],
          evidenceAgainst: [],
          expectedOutcome: "God opstart af kundeforholdet",
        },
        {
          action: "Notificer team om ny onboarding",
          evidenceFor: [
            "Hele teamet er informeret",
            "Forhindrer dobbeltarbejde",
            "Fejrer ny kunde",
          ],
          evidenceAgainst: [
            "Kan opfattes som st\u00f8j i kanalen",
          ],
          expectedOutcome: "Teamet er klar til at supportere kunden",
        },
      ],
      actionBatch: [
        {
          title: "Send velkomstemail til Anna Gr\u00f8n",
          description: "Onboarding-pakke med tidslinje og kontaktinfo",
          executionMode: "automated",
          actionCapabilityName: "send_email",
        },
        {
          title: "Opdater CRM med onboarding-status",
          description: "Marker deal som onboarding og tilf\u00f8j noter",
          executionMode: "automated",
          actionCapabilityName: "crm_update",
        },
        {
          title: "Notificer salgsteamet i Slack",
          description: "Informer #salg om ny kunde-onboarding",
          executionMode: "automated",
          actionCapabilityName: "send_slack_message",
        },
      ],
      confidence: 0.82,
      missingContext: null,
    },
    contextSnapshot: {
      entity: "GreenTech Onboarding Package",
      client: "GreenTech Nordic",
      contact: "Anna Gr\u00f8n",
      contactEmail: "anna@greentech-nordic.dk",
      dealValue: 195000,
      currency: "DKK",
      industry: "Sustainability & CleanTech",
      onboardingStage: "welcome_sent",
      companySize: 35,
    },
    contextMeta: [
      { section: "deal_details", itemCount: 1, tokenEstimate: 180 },
      { section: "client_profile", itemCount: 1, tokenEstimate: 260 },
      { section: "onboarding_checklist", itemCount: 5, tokenEstimate: 190 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 1320,
    apiCostCents: 2,
    hoursAgo: 36,
    plan: {
      status: "executing",
      steps: [
        {
          title: "Send velkomstemail til Anna Gr\u00f8n",
          description: "Onboarding-pakke med tidslinje og kontaktinfo",
          executionMode: "automated",
          capabilitySlug: "send_email",
          parameters: {
            to: "anna@greentech-nordic.dk",
            subject: "Velkommen til Test Company \u2014 GreenTech Nordic onboarding",
            body: "K\u00e6re Anna,\n\nVi er begejstrede for at have GreenTech Nordic ombord! Her er jeres onboarding-plan:\n\n1. Kickoff-m\u00f8de (denne uge)\n2. Adgang til projektv\u00e6rkt\u00f8jer\n3. Indledende research og analyse\n4. F\u00f8rste leverance inden 3 uger\n\nDin prim\u00e6re kontakt er Mette Lindberg. Du kan altid kontakte hende p\u00e5 mette@testcompany.dk.\n\nVi gl\u00e6der os til samarbejdet!\n\nVenlig hilsen,\nTest Company",
          },
          status: "completed",
          completedHoursAgo: 34,
        },
        {
          title: "Opdater CRM med onboarding-status",
          description: "Marker deal som onboarding og tilf\u00f8j noter",
          executionMode: "automated",
          capabilitySlug: "crm_update",
          parameters: {
            entityId: "placeholder",
            updates: {
              stage: { from: "closed-won", to: "onboarding" },
              notes: { from: "", to: "Welcome email sent. Kickoff meeting to be scheduled." },
            },
          },
          status: "completed",
          completedHoursAgo: 34,
        },
        {
          title: "Notificer salgsteamet i Slack",
          description: "Informer #salg om ny kunde-onboarding",
          executionMode: "automated",
          capabilitySlug: "send_slack_message",
          parameters: {
            channel: "#salg",
            message: "\ud83c\udf89 Ny kunde onboarded: GreenTech Nordic (195.000 DKK). Anna Gr\u00f8n er kontakt. Velkomstemail sendt, kickoff planl\u00e6gges.",
          },
          status: "pending",
        },
      ],
    },
  },

  // =========================================================================
  // GROUP D: Resolved (6) — status "resolved"
  // =========================================================================

  // S11 — Invoice collected: INV-2024-091 (Bygholm)
  {
    id: "demo_sit_11",
    typeSlug: "overdue-invoice-followup",
    status: "resolved",
    severity: 0.6,
    confidence: 0.89,
    triggerEntityName: "INV-2024-091",
    triggerEntityType: "invoice",
    reasoning: {
      analysis:
        "Faktura INV-2024-091 p\u00e5 35.000 DKK til Bygholm Consulting var 5 dage forfalden, da situationen blev opdaget. Bygholm er en loyal kunde med en ellers p\u00e5lidelig betalingshistorik, s\u00e5 forsinkelsen var usædvanlig. En personlig p\u00e5mindelses-email blev sendt til Henrik Bygholm, og CRM blev opdateret med den nye status. Henrik svarede inden for 24 timer med en undskyldning — fakturaen var gået tabt i intern godkendelse — og betalingen gik igennem dagen efter.",
      evidenceSummary:
        "35.000 DKK faktura, 5 dage forfalden. Personlig p\u00e5mindelse sendt. Kunden betalte inden 48 timer med forklaring om intern forsinkelse. God relation bevaret.",
      consideredActions: [
        {
          action: "Send personlig p\u00e5mindelses-email",
          evidenceFor: [
            "Kunden har god historik — en p\u00e5mindelse b\u00f8r v\u00e6re nok",
            "Professionel og venlig tone bevarer relationen",
          ],
          evidenceAgainst: [
            "Kan v\u00e6re en d\u00e6kning for betalingsproblemer",
          ],
          expectedOutcome: "Betaling inden 5 dage",
        },
        {
          action: "Ring Henrik direkte",
          evidenceFor: [
            "Hurtigere afklaring",
          ],
          evidenceAgainst: [
            "Kun 5 dage forfalden — email er passende f\u00f8rste trin",
          ],
          expectedOutcome: "Hurtig afklaring men un\u00f8dvendig eskalering",
        },
      ],
      actionBatch: [
        {
          title: "Send p\u00e5mindelses-email",
          description: "Venlig p\u00e5mindelse til Henrik om forfaldent bel\u00f8b",
          executionMode: "automated",
          actionCapabilityName: "send_email",
        },
        {
          title: "Opdater CRM",
          description: "Marker faktura som forfalden i CRM",
          executionMode: "automated",
          actionCapabilityName: "crm_update",
        },
      ],
      confidence: 0.89,
      missingContext: null,
    },
    contextSnapshot: {
      entity: "INV-2024-091",
      amount: 35000,
      currency: "DKK",
      daysOverdue: 5,
      client: "Bygholm Consulting",
      contact: "Henrik Bygholm",
      contactEmail: "henrik@bygholm.dk",
      paymentHistory: { avgDaysToPayment: 20, totalInvoicesPaid: 7 },
    },
    contextMeta: [
      { section: "invoice_details", itemCount: 1, tokenEstimate: 170 },
      { section: "client_profile", itemCount: 1, tokenEstimate: 280 },
      { section: "payment_history", itemCount: 7, tokenEstimate: 210 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 1780,
    apiCostCents: 3,
    hoursAgo: 14 * 24,
    resolvedHoursAgo: 14 * 24 - 48,
    outcome: "positive",
    outcomeDetails: {
      resolution: "Betaling modtaget inden 48 timer efter p\u00e5mindelse",
      amountCollected: 35000,
      clientResponse: "Intern godkendelsesforsinkelse — undskyldning modtaget",
    },
    billedCents: 15,
    plan: {
      status: "completed",
      steps: [
        {
          title: "Send p\u00e5mindelses-email til Henrik Bygholm",
          description: "Venlig p\u00e5mindelse om forfaldent bel\u00f8b",
          executionMode: "automated",
          capabilitySlug: "send_email",
          parameters: {
            to: "henrik@bygholm.dk",
            subject: "P\u00e5mindelse: Faktura INV-2024-091 \u2014 35.000 DKK",
            body: "K\u00e6re Henrik,\n\nVi vil gerne minde om, at faktura INV-2024-091 p\u00e5 35.000 DKK forfaldt for 5 dage siden. Betalingsoplysninger er vedhæftet.\n\nKontakt os gerne, hvis der er sp\u00f8rgsm\u00e5l.\n\nVenlig hilsen,\nLouise Winther\nTest Company",
          },
          status: "completed",
          completedHoursAgo: 14 * 24 - 2,
        },
        {
          title: "Opdater CRM med forfaldsstatus",
          description: "Marker faktura som forfalden i systemet",
          executionMode: "automated",
          capabilitySlug: "crm_update",
          parameters: {
            entityId: "placeholder",
            updates: {
              payment_status: { from: "current", to: "overdue" },
              last_contacted: { from: "2024-03-01", to: "today" },
            },
          },
          status: "completed",
          completedHoursAgo: 14 * 24 - 2,
        },
      ],
    },
  },

  // S12 — Quiet deal reactivated: Aarhus Hub Expansion
  {
    id: "demo_sit_12",
    typeSlug: "deal-gone-quiet",
    status: "resolved",
    severity: 0.55,
    confidence: 0.76,
    triggerEntityName: "Aarhus Hub Expansion",
    triggerEntityType: "deal",
    reasoning: {
      analysis:
        "Aarhus Creative Hub Expansion var en 280.000 DKK deal der var g\u00e5et stille i 14 dage efter et godt indledende m\u00f8de. Simon Krogh havde ikke svaret p\u00e5 opf\u00f8lgnings-emails, og der var bekymring for at dealen var tabt til en konkurrent. En personlig genaktiverings-email med nyt v\u00e6rdi-perspektiv og invitation til et kort statusm\u00f8de fik Simon til at svare inden for 3 dage. Det viste sig, at deres interne budget-godkendelse havde taget l\u00e6ngere end forventet.",
      evidenceSummary:
        "280.000 DKK deal genaktiveret efter 14 dages stilhed. Klienten var optaget af intern budget-godkendelse. M\u00f8de booket og deal rykket videre i pipeline.",
      consideredActions: [
        {
          action: "Send genaktiverings-email med nyt perspektiv",
          evidenceFor: [
            "Ikke-aggressiv tilgang",
            "Tilbyder ny v\u00e6rdi i form af case study",
            "Giver klienten en nem m\u00e5de at genoptage dialogen",
          ],
          evidenceAgainst: [
            "Simon har ikke svaret p\u00e5 tidligere emails",
          ],
          expectedOutcome: "Moderat til h\u00f8j sandsynlighed for respons",
        },
        {
          action: "Book opf\u00f8lgningsm\u00f8de via direkte kalender-invitation",
          evidenceFor: [
            "Konkret handling der er nem at acceptere",
            "Viser engagement fra vores side",
          ],
          evidenceAgainst: [
            "Kan virke p\u00e5g\u00e5ende uden forudg\u00e5ende aftale",
          ],
          expectedOutcome: "Direkte afklaring af dealens status",
        },
      ],
      actionBatch: [
        {
          title: "Send genaktiverings-email",
          description: "Personlig email med case study og m\u00f8de-invitation",
          executionMode: "automated",
          actionCapabilityName: "send_email",
        },
        {
          title: "Opret opf\u00f8lgningsm\u00f8de",
          description: "Kalender-invitation til kort statusm\u00f8de",
          executionMode: "automated",
          actionCapabilityName: "create_calendar_event",
        },
      ],
      confidence: 0.76,
      missingContext: null,
    },
    contextSnapshot: {
      entity: "Aarhus Hub Expansion",
      amount: 280000,
      currency: "DKK",
      stage: "proposal",
      client: "Aarhus Creative Hub",
      contact: "Simon Krogh",
      contactEmail: "simon@aarhuscreative.dk",
      daysSinceLastActivity: 14,
    },
    contextMeta: [
      { section: "deal_details", itemCount: 1, tokenEstimate: 230 },
      { section: "client_profile", itemCount: 1, tokenEstimate: 290 },
      { section: "activity_timeline", itemCount: 6, tokenEstimate: 480 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 2010,
    apiCostCents: 4,
    hoursAgo: 10 * 24,
    resolvedHoursAgo: 10 * 24 - 72,
    outcome: "positive",
    outcomeDetails: {
      resolution: "Deal genaktiveret. Simon svarede inden 3 dage — intern budget-godkendelse forsinket.",
      meetingBooked: true,
      pipelineStageAdvanced: true,
    },
    billedCents: 20,
    plan: {
      status: "completed",
      steps: [
        {
          title: "Send genaktiverings-email til Simon Krogh",
          description: "Personlig email med nyt perspektiv og m\u00f8de-invitation",
          executionMode: "automated",
          capabilitySlug: "send_email",
          parameters: {
            to: "simon@aarhuscreative.dk",
            subject: "Aarhus Hub Expansion \u2014 nyt perspektiv og statusm\u00f8de",
            body: "Hej Simon,\n\nJeg h\u00e5ber alt er vel hos jer. Jeg ville gerne dele et nyt case study fra et lignende projekt, som kan give inspiration til jeres expansion.\n\nKunne vi booke 20 minutter til en hurtig status p\u00e5 projektet?\n\nBedste hilsner,\nAnders Vestergaard\nTest Company",
          },
          status: "completed",
          completedHoursAgo: 10 * 24 - 1,
        },
        {
          title: "Opret opf\u00f8lgningsm\u00f8de",
          description: "20-minutters statusm\u00f8de med Simon",
          executionMode: "automated",
          capabilitySlug: "create_calendar_event",
          parameters: {
            title: "Status: Aarhus Hub Expansion",
            startTime: "2024-03-18T10:00:00.000Z",
            endTime: "2024-03-18T10:20:00.000Z",
            attendees: ["anders@testcompany.dk", "simon@aarhuscreative.dk"],
            location: "Google Meet",
          },
          status: "completed",
          completedHoursAgo: 10 * 24 - 1,
        },
      ],
    },
  },

  // S13 — Contract renewal lost: Copenhagen Bikes Phase 2
  {
    id: "demo_sit_13",
    typeSlug: "contract-renewal-approaching",
    status: "resolved",
    severity: 0.6,
    confidence: 0.85,
    triggerEntityName: "Copenhagen Bikes Phase 2",
    triggerEntityType: "deal",
    reasoning: {
      analysis:
        "Copenhagen Bikes' retainer-aftale var sat til fornyelse, og vi sendte rettidigt en fornyelsesmail til Maja Winther. Desv\u00e6rre besluttede Copenhagen Bikes at g\u00e5 med en anden leverand\u00f8r til Phase 2, da de \u00f8nskede en partner med st\u00e6rkere e-commerce-speciale. CRM blev opdateret med closed-lost status og feedback-noter. Selvom resultatet var negativt, var processen korrekt, og feedback er v\u00e6rdifuld for fremtidige tilbud.",
      evidenceSummary:
        "Fornyelsesproces igangsat rettidigt, men kunden valgte en konkurrent med st\u00e6rkere e-commerce-fokus. Feedback dokumenteret i CRM til fremtidig brug.",
      consideredActions: [
        {
          action: "Send fornyelsesmail og inviter til m\u00f8de",
          evidenceFor: [
            "Proaktiv tilgang viser professionalisme",
            "God timing 5 uger f\u00f8r udl\u00f8b",
          ],
          evidenceAgainst: [
            "Kunden kan allerede have besluttet sig",
          ],
          expectedOutcome: "Afklaring af kundens intentioner",
        },
        {
          action: "Opdater CRM med fornyelsesproces",
          evidenceFor: [
            "Dokumentation af processen",
            "Vigtig for pipeline-tracking",
          ],
          evidenceAgainst: [],
          expectedOutcome: "Korrekt data i systemet",
        },
      ],
      actionBatch: [
        {
          title: "Send fornyelsesmail til Maja Winther",
          description: "Professionel forespørgsel om fornyelse af Phase 2",
          executionMode: "automated",
          actionCapabilityName: "send_email",
        },
        {
          title: "Opdater CRM med fornyelsesproces",
          description: "Marker deal med renewal-status og noter",
          executionMode: "automated",
          actionCapabilityName: "crm_update",
        },
      ],
      confidence: 0.85,
      missingContext: null,
    },
    contextSnapshot: {
      entity: "Copenhagen Bikes Phase 2",
      retainerMonthlyValue: 35000,
      currency: "DKK",
      client: "Copenhagen Bikes",
      contact: "Maja Winther",
      contactEmail: "maja@copenhagenbikes.dk",
      partnershipMonths: 12,
      lostReason: "Valgte konkurrent med st\u00e6rkere e-commerce-speciale",
    },
    contextMeta: [
      { section: "deal_details", itemCount: 1, tokenEstimate: 210 },
      { section: "client_profile", itemCount: 1, tokenEstimate: 260 },
      { section: "partnership_history", itemCount: 8, tokenEstimate: 420 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 2450,
    apiCostCents: 4,
    hoursAgo: 8 * 24,
    resolvedHoursAgo: 8 * 24 - 96,
    outcome: "negative",
    outcomeDetails: {
      resolution: "Kunden valgte en anden leverand\u00f8r med st\u00e6rkere e-commerce-speciale.",
      lostToCompetitor: true,
      feedbackReceived: "Tilfreds med samarbejdet, men behov for dybere e-commerce-ekspertise.",
      revenueImpact: -35000,
    },
    billedCents: 25,
    plan: {
      status: "completed",
      steps: [
        {
          title: "Send fornyelsesmail til Maja Winther",
          description: "Professionel foresp\u00f8rgsel om fornyelse af Phase 2",
          executionMode: "automated",
          capabilitySlug: "send_email",
          parameters: {
            to: "maja@copenhagenbikes.dk",
            subject: "Copenhagen Bikes \u00d7 Test Company \u2014 Phase 2 fornyelse",
            body: "K\u00e6re Maja,\n\nVi n\u00e6rmer os afslutningen af Phase 1, og vi vil gerne dr\u00f8fte mulighederne for Phase 2.\n\nVi er stolte af de resultater, vi har opn\u00e5et sammen, og ser frem til at forts\u00e6tte samarbejdet.\n\nHvorn\u00e5r passer det at tage en snak?\n\nBedste hilsner,\nMette Lindberg\nTest Company",
          },
          status: "completed",
          completedHoursAgo: 8 * 24 - 2,
        },
        {
          title: "Opdater CRM med closed-lost og feedback",
          description: "Dokumenter tabt fornyelse og kundens feedback",
          executionMode: "automated",
          capabilitySlug: "crm_update",
          parameters: {
            entityId: "placeholder",
            updates: {
              stage: { from: "renewal", to: "closed-lost" },
              lost_reason: { from: "", to: "Valgte konkurrent med e-commerce-speciale" },
              notes: { from: "", to: "Tilfreds med samarbejdet, men behov for dybere e-commerce-ekspertise." },
            },
          },
          status: "completed",
          completedHoursAgo: 8 * 24 - 96,
        },
      ],
    },
  },

  // S14 — New lead qualified: Anna Gr\u00f8n (GreenTech)
  {
    id: "demo_sit_14",
    typeSlug: "new-lead-qualification",
    status: "resolved",
    severity: 0.35,
    confidence: 0.88,
    triggerEntityName: "Anna Gr\u00f8n",
    triggerEntityType: "contact",
    reasoning: {
      analysis:
        "Anna Gr\u00f8n fra GreenTech Nordic blev identificeret som en ny lead efter hun tilmeldte sig vores nyhedsbrev og downloadede to whitepapers om b\u00e6redygtig digital transformation. Hendes profil matchede vores idealkundeprofil: Head of Sustainability i en voksende virksomhed med 35 ansatte. En velkomstemail med relevant case study blev sendt, CRM opdateret, og salgsteamet notificeret. Anna bookede selv et kvalificeringsm\u00f8de inden for 5 dage, og en deal p\u00e5 195.000 DKK blev oprettet.",
      evidenceSummary:
        "Ny lead kvalificeret succesfuldt. Anna bookede selv kvalificeringsm\u00f8de efter velkomstemail. Deal oprettet p\u00e5 195.000 DKK. F\u00f8rst-til-kunde p\u00e5 under en uge.",
      consideredActions: [
        {
          action: "Send velkomstemail med relevant case study",
          evidenceFor: [
            "Personlig tilgang baseret p\u00e5 download-historik",
            "Case study fra lignende branche skaber genklang",
          ],
          evidenceAgainst: [
            "Kan opfattes som salgs-email",
          ],
          expectedOutcome: "Engagement og potentiel booking af m\u00f8de",
        },
        {
          action: "Opdater CRM og notificer team",
          evidenceFor: [
            "Sikrer at alle er informeret",
            "Lead f\u00e5r hurtig opf\u00f8lgning",
          ],
          evidenceAgainst: [],
          expectedOutcome: "Struktureret kvalificeringsproces",
        },
        {
          action: "Ring Anna direkte inden 24 timer",
          evidenceFor: [
            "Hurtig respons \u00f8ger konvertering",
            "Personlig kontakt fra start",
          ],
          evidenceAgainst: [
            "For aggressivt for en nyhedsbrev-tilmelding",
            "Anna kan foretr\u00e6kke at researche selv f\u00f8rst",
          ],
          expectedOutcome: "Hurtig kvalificering, men risiko for at virke p\u00e5g\u00e5ende",
        },
      ],
      actionBatch: [
        {
          title: "Send velkomstemail med case study",
          description: "Personlig email baseret p\u00e5 Annas download-historik",
          executionMode: "automated",
          actionCapabilityName: "send_email",
        },
        {
          title: "Opdater CRM med lead-information",
          description: "Opret kontakt og tilf\u00f8j kvalificerings-noter",
          executionMode: "automated",
          actionCapabilityName: "crm_update",
        },
        {
          title: "Notificer salgsteamet",
          description: "Informer #salg om ny kvalificeret lead",
          executionMode: "automated",
          actionCapabilityName: "send_slack_message",
        },
      ],
      confidence: 0.88,
      missingContext: null,
    },
    contextSnapshot: {
      entity: "Anna Gr\u00f8n",
      title: "Head of Sustainability",
      company: "GreenTech Nordic",
      companySize: 35,
      source: "newsletter_signup",
      contentDownloaded: ["Whitepaper: B\u00e6redygtig Digital Transformation", "Guide: Gr\u00f8n IT-strategi"],
      industry: "Sustainability & CleanTech",
    },
    contextMeta: [
      { section: "contact_details", itemCount: 1, tokenEstimate: 150 },
      { section: "company_profile", itemCount: 1, tokenEstimate: 230 },
      { section: "engagement_history", itemCount: 3, tokenEstimate: 160 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 1560,
    apiCostCents: 3,
    hoursAgo: 21 * 24,
    resolvedHoursAgo: 21 * 24 - 120,
    outcome: "positive",
    outcomeDetails: {
      resolution: "Anna bookede selv kvalificeringsm\u00f8de. Deal oprettet p\u00e5 195.000 DKK.",
      dealCreated: true,
      dealValue: 195000,
      daysToConversion: 5,
    },
    billedCents: 10,
    plan: {
      status: "completed",
      steps: [
        {
          title: "Send velkomstemail til Anna Gr\u00f8n",
          description: "Personlig email med relevant case study",
          executionMode: "automated",
          capabilitySlug: "send_email",
          parameters: {
            to: "anna@greentech-nordic.dk",
            subject: "Velkommen, Anna \u2014 her er noget til dig fra Test Company",
            body: "Hej Anna,\n\nTak for din interesse! Baseret p\u00e5 dit download af vores whitepaper, t\u00e6nkte jeg, at denne case study fra en lignende virksomhed i b\u00e6redygtighedssektoren kunne v\u00e6re interessant.\n\nVi hj\u00e6lper virksomheder som GreenTech Nordic med at accelerere deres digitale transformation.\n\nLad os vide, hvis du har sp\u00f8rgsm\u00e5l.\n\nBedste hilsner,\nAnders Vestergaard\nTest Company",
          },
          status: "completed",
          completedHoursAgo: 21 * 24 - 2,
        },
        {
          title: "Opdater CRM med lead-information",
          description: "Opret kontakt og tilf\u00f8j kvalificerings-noter",
          executionMode: "automated",
          capabilitySlug: "crm_update",
          parameters: {
            entityId: "placeholder",
            updates: {
              lifecycle_stage: { from: "subscriber", to: "lead" },
              lead_source: { from: "", to: "newsletter + whitepaper download" },
              notes: { from: "", to: "Head of Sustainability, GreenTech Nordic. 35 ansatte. Interesseret i b\u00e6redygtig digital transformation." },
            },
          },
          status: "completed",
          completedHoursAgo: 21 * 24 - 2,
        },
        {
          title: "Notificer salgsteamet i Slack",
          description: "Informer #salg om ny kvalificeret lead",
          executionMode: "automated",
          capabilitySlug: "send_slack_message",
          parameters: {
            channel: "#salg",
            message: "\ud83c\udf31 Ny lead: Anna Gr\u00f8n, Head of Sustainability hos GreenTech Nordic (35 ansatte). Downloaded 2 whitepapers om b\u00e6redygtighed. Velkomstemail sendt.",
          },
          status: "completed",
          completedHoursAgo: 21 * 24 - 2,
        },
      ],
    },
  },

  // S15 — Support ticket resolved: TK-303 (GreenTech onboarding guide)
  {
    id: "demo_sit_15",
    typeSlug: "support-ticket-escalation",
    status: "resolved",
    severity: 0.5,
    confidence: 0.86,
    triggerEntityName: "TK-303",
    triggerEntityType: "ticket",
    reasoning: {
      analysis:
        "TK-303 var en foresp\u00f8rgsel fra Anna Gr\u00f8n hos GreenTech Nordic om onboarding-dokumentation og adgangsguides. Ticketen blev eskaleret da den n\u00e6rmede sig SLA-gr\u00e6nsen p\u00e5 24 timer uden svar. En intern note blev tilf\u00f8jet med kontekst om kundens onboarding-stadie, og leverings-teamet blev notificeret i Slack. Line Kj\u00e6r tog ticketen inden for 2 timer efter eskaleringen og sendte en komplet onboarding-guide til Anna.",
      evidenceSummary:
        "Onboarding-dokumentationsforesp\u00f8rgsel l\u00f8st inden for 2 timer efter eskalering. Anna Gr\u00f8n fik den n\u00f8dvendige guide. SLA overholdt med god margin.",
      consideredActions: [
        {
          action: "Eskaler med intern note og Slack-notifikation",
          evidenceFor: [
            "SLA-deadline t\u00e6t p\u00e5",
            "Ny kunde kr\u00e6ver hurtig respons for god onboarding",
            "Dokumentation er parat og kan sendes hurtigt",
          ],
          evidenceAgainst: [
            "Ticket er ikke teknisk kompleks",
          ],
          expectedOutcome: "Hurtig l\u00f8sning der styrker kundens onboarding-oplevelse",
        },
        {
          action: "Vent p\u00e5 normal k\u00f8-behandling",
          evidenceFor: [
            "Lavere prioritet end tekniske fejl",
          ],
          evidenceAgainst: [
            "SLA-risiko for ny kunde",
            "D\u00e5rlig f\u00f8rste impression",
          ],
          expectedOutcome: "Risiko for SLA-brud og utilfreds ny kunde",
        },
      ],
      actionBatch: [
        {
          title: "Tilf\u00f8j intern note p\u00e5 TK-303",
          description: "Kontekst om kundens onboarding-stadie og behov",
          executionMode: "automated",
          actionCapabilityName: "add_internal_note",
        },
        {
          title: "Notificer leverings-teamet",
          description: "Alert i #levering om n\u00f8dvendig handling",
          executionMode: "automated",
          actionCapabilityName: "send_slack_message",
        },
      ],
      confidence: 0.86,
      missingContext: null,
    },
    contextSnapshot: {
      entity: "TK-303",
      title: "GreenTech onboarding documentation request",
      client: "GreenTech Nordic",
      contact: "Anna Gr\u00f8n",
      priority: "medium",
      slaHoursRemaining: 4,
      createdHoursAgo: 20,
      resolvedBy: "Line Kj\u00e6r",
    },
    contextMeta: [
      { section: "ticket_details", itemCount: 1, tokenEstimate: 180 },
      { section: "client_profile", itemCount: 1, tokenEstimate: 200 },
      { section: "onboarding_status", itemCount: 1, tokenEstimate: 140 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 1380,
    apiCostCents: 2,
    hoursAgo: 7 * 24,
    resolvedHoursAgo: 7 * 24 - 2,
    outcome: "positive",
    outcomeDetails: {
      resolution: "Ticket l\u00f8st af Line Kj\u00e6r inden for 2 timer efter eskalering. Komplet onboarding-guide sendt.",
      resolvedBy: "Line Kj\u00e6r",
      timeToResolutionHours: 2,
      slaBreached: false,
    },
    billedCents: 12,
    plan: {
      status: "completed",
      steps: [
        {
          title: "Tilf\u00f8j intern note p\u00e5 TK-303",
          description: "Kontekst om kundens onboarding-stadie",
          executionMode: "automated",
          capabilitySlug: "add_internal_note",
          parameters: {
            ticketId: "TK-303",
            message: "GreenTech Nordic er ny kunde i onboarding-fase. Anna Gr\u00f8n (Head of Sustainability) eftersp\u00f8rger dokumentation. Priorit\u00e9r hurtig respons for god f\u00f8rste oplevelse.",
            isInternal: true,
          },
          status: "completed",
          completedHoursAgo: 7 * 24 - 1,
        },
        {
          title: "Notificer leverings-teamet i Slack",
          description: "Alert i #levering om TK-303",
          executionMode: "automated",
          capabilitySlug: "send_slack_message",
          parameters: {
            channel: "#levering",
            message: "\ud83d\udce6 TK-303: GreenTech Nordic (ny kunde) eftersp\u00f8rger onboarding-docs. SLA 4 timer. Hvem tager den?",
          },
          status: "completed",
          completedHoursAgo: 7 * 24 - 1,
        },
      ],
    },
  },

  // S16 — Meeting prep sent but client rescheduled
  {
    id: "demo_sit_16",
    typeSlug: "client-meeting-prep",
    status: "resolved",
    severity: 0.35,
    confidence: 0.84,
    triggerEntityName: "Fjordview Reactivation Campaign",
    triggerEntityType: "deal",
    reasoning: {
      analysis:
        "Et portfolio review-m\u00f8de med Fjordview Ejendomme var planlagt, og forberedelsesmateriale blev sendt rettidigt til Lars, der skulle pr\u00e6sentere. Salgsteamet blev notificeret via Slack. Dog meddelte kunden, Lise Fjord, at hun var n\u00f8dt til at flytte m\u00f8det med en uge pga. intern omstrukturering. Forberedelsesarbejdet var ikke spildt — det blev genanvendt til det nye m\u00f8detidspunkt. Resultatet er neutralt da m\u00f8det stadig finder sted.",
      evidenceSummary:
        "Forberedelsesmateriale sendt rettidigt, men kunden ombookede m\u00f8det med en uge. Forberedelsen genanvendes. Processen fungerede korrekt, men resultatet var forsinkelse.",
      consideredActions: [
        {
          action: "Send forberedelsesbrief til pr\u00e6sentator",
          evidenceFor: [
            "Sikrer grundig forberedelse",
            "Professionel tilgang til vigtige m\u00f8der",
          ],
          evidenceAgainst: [
            "Kan v\u00e6re for tidligt hvis m\u00f8det flyttes",
          ],
          expectedOutcome: "Bedre forberedt team, god demo",
        },
        {
          action: "Notificer team via Slack",
          evidenceFor: [
            "Alle er informeret og kan forberede sig",
          ],
          evidenceAgainst: [
            "Ekstra notifikation i en travl kanal",
          ],
          expectedOutcome: "Teamet er aligned f\u00f8r m\u00f8det",
        },
      ],
      actionBatch: [
        {
          title: "Send forberedelsesbrief",
          description: "Email med m\u00f8dedetaljer og fokusomr\u00e5der",
          executionMode: "automated",
          actionCapabilityName: "send_email",
        },
        {
          title: "Notificer team i Slack",
          description: "Reminder i #salg om planlagt m\u00f8de",
          executionMode: "automated",
          actionCapabilityName: "send_slack_message",
        },
      ],
      confidence: 0.84,
      missingContext: null,
    },
    contextSnapshot: {
      entity: "Fjordview Reactivation Campaign",
      client: "Fjordview Ejendomme",
      contact: "Lise Fjord",
      contactEmail: "lise@fjordview.dk",
      amount: 250000,
      currency: "DKK",
      stage: "negotiation",
      presenter: "Lars",
      rescheduledReason: "Intern omstrukturering hos kunden",
    },
    contextMeta: [
      { section: "deal_details", itemCount: 1, tokenEstimate: 220 },
      { section: "meeting_agenda", itemCount: 1, tokenEstimate: 180 },
      { section: "client_profile", itemCount: 1, tokenEstimate: 260 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 1720,
    apiCostCents: 3,
    hoursAgo: 5 * 24,
    resolvedHoursAgo: 5 * 24 - 24,
    outcome: "neutral",
    outcomeDetails: {
      resolution: "M\u00f8de ombooket med en uge af kunden. Forberedelsesmateriale genanvendes.",
      rescheduled: true,
      rescheduledReason: "Intern omstrukturering hos kunden",
      prepMaterialReused: true,
    },
    billedCents: 18,
    plan: {
      status: "completed",
      steps: [
        {
          title: "Send forberedelsesbrief til Lars",
          description: "Email med deal-overblik og fokusomr\u00e5der",
          executionMode: "automated",
          capabilitySlug: "send_email",
          parameters: {
            to: "lars@testcompany.dk",
            subject: "Forberedelse: Fjordview Ejendomme portfolio review",
            body: "Hej Lars,\n\nHer er briefen til Fjordview-m\u00f8det:\n\n\ud83c\udfe2 Kunde: Fjordview Ejendomme (250.000 DKK)\n\ud83d\udc64 Lise Fjord, CEO\n\ud83c\udfaf Fokus: Portfolio-gennemgang, ROI p\u00e5 digitalisering, n\u00e6ste fase\n\nForbered tal fra Q1-leverancerne.\n\n\u2014 Qorpera AI",
          },
          status: "completed",
          completedHoursAgo: 5 * 24 - 2,
        },
        {
          title: "Notificer team i Slack",
          description: "Reminder i #salg",
          executionMode: "automated",
          capabilitySlug: "send_slack_message",
          parameters: {
            channel: "#salg",
            message: "\ud83d\udccc Fjordview Ejendomme portfolio review planlagt. Lars pr\u00e6senterer. Lise Fjord (CEO) deltager.",
          },
          status: "completed",
          completedHoursAgo: 5 * 24 - 2,
        },
      ],
    },
  },

  // =========================================================================
  // GROUP E: Dismissed (2) — status "dismissed"
  // =========================================================================

  // S17 — False positive: Nordlys quiet deal
  {
    id: "demo_sit_17",
    typeSlug: "deal-gone-quiet",
    status: "dismissed",
    severity: 0.5,
    confidence: 0.68,
    triggerEntityName: "Nordlys Q2 Retainer Renewal",
    triggerEntityType: "deal",
    reasoning: {
      analysis:
        "Nordlys Q2 Retainer Renewal blev flagget som en stille deal, da der ikke var registreret digital aktivitet i 11 dage. Systemet registrerede ingen emails, m\u00f8der eller CRM-opdateringer i perioden. Dog viste det sig, at brugeren havde haft en telefonsamtale med S\u00f8ren Fabricius, som ikke blev logget i CRM. Denne type falsk positiv opstod fordi telefonsamtaler ikke automatisk registreres i vores system.",
      evidenceSummary:
        "11 dages digital stilhed i CRM, men brugeren bekr\u00e6ftede telefonsamtale med S\u00f8ren. Falsk positiv pga. manglende telefonlog-integration. Fornyelsesprocessen er p\u00e5 sporet.",
      consideredActions: [
        {
          action: "Send opf\u00f8lgnings-email til S\u00f8ren",
          evidenceFor: [
            "Ingen digital aktivitet registreret",
            "Deal er i kritisk fornyelsesperiode",
          ],
          evidenceAgainst: [
            "Ukendt om der er off-system kommunikation",
            "Kan v\u00e6re un\u00f8dvendigt",
          ],
          expectedOutcome: "Risiko for at virke uinformeret",
        },
        {
          action: "Sp\u00f8rg brugeren om status f\u00f8r handling",
          evidenceFor: [
            "Sikrer korrekt kontekst f\u00f8r automatisk handling",
            "Undg\u00e5r pinlige dobbelt-henvendelser",
          ],
          evidenceAgainst: [
            "Tager l\u00e6ngere tid end automatisk handling",
          ],
          expectedOutcome: "Korrekt kontekst sikret f\u00f8r eventuel handling",
        },
      ],
      actionBatch: null,
      confidence: 0.68,
      missingContext: ["Telefonsamtaler og offline-interaktioner", "Mundtlige aftaler der ikke er logget"],
    },
    contextSnapshot: {
      entity: "Nordlys Q2 Retainer Renewal",
      client: "Nordlys Media",
      contact: "S\u00f8ren Fabricius",
      daysSinceLastDigitalActivity: 11,
      stage: "negotiation",
      retainerMonthlyValue: 45000,
      currency: "DKK",
    },
    contextMeta: [
      { section: "deal_details", itemCount: 1, tokenEstimate: 200 },
      { section: "activity_timeline", itemCount: 3, tokenEstimate: 240 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 1240,
    apiCostCents: 2,
    hoursAgo: 72,
    feedback: "Talt med S\u00f8ren i telefonen i g\u00e5r \u2014 alt k\u00f8rer.",
    feedbackRating: 2,
    feedbackCategory: "detection_wrong",
  },

  // S18 — Low-priority ticket dismissed: TK-304
  {
    id: "demo_sit_18",
    typeSlug: "support-ticket-escalation",
    status: "dismissed",
    severity: 0.45,
    confidence: 0.71,
    triggerEntityName: "TK-304",
    triggerEntityType: "ticket",
    reasoning: {
      analysis:
        "TK-304 rapporterede et API rate limiting-problem for Bygholm Consulting. Ticketen blev flagget til eskalering da den havde v\u00e6ret ubesvaret i 16 timer med medium prioritet. Systemet vurderede, at SLA-gr\u00e6nsen n\u00e6rmede sig og foreslog eskalering til Thomas N\u00f8rgaard. Dog havde Emil allerede identificeret og l\u00f8st problemet lokalt ved at justere rate limiting-konfigurationen, men havde endnu ikke opdateret ticketen.",
      evidenceSummary:
        "API rate limiting-ticket flagget pga. manglende ticket-opdatering. Emil havde allerede l\u00f8st problemet men ikke lukket ticketen. Falsk eskalering baseret p\u00e5 ufuldst\u00e6ndig ticket-status.",
      consideredActions: [
        {
          action: "Eskaler til Thomas N\u00f8rgaard",
          evidenceFor: [
            "16 timer uden synlig h\u00e5ndtering",
            "SLA-gr\u00e6nse n\u00e6rmer sig",
          ],
          evidenceAgainst: [
            "Ticket kan allerede v\u00e6re under behandling off-system",
            "Emil kan have l\u00f8st det uden at opdatere",
          ],
          expectedOutcome: "Un\u00f8dvendig eskalering hvis allerede l\u00f8st",
        },
        {
          action: "Tjek med Emil om ticket-status f\u00f8r eskalering",
          evidenceFor: [
            "Undg\u00e5r un\u00f8dvendig eskalering",
            "F\u00e5r korrekt status",
          ],
          evidenceAgainst: [
            "Tager ekstra tid",
          ],
          expectedOutcome: "Korrekt forst\u00e5else af ticket-status",
        },
      ],
      actionBatch: null,
      confidence: 0.71,
      missingContext: ["Emils aktuelle arbejde p\u00e5 ticketen", "Off-system kommunikation om l\u00f8sningen"],
    },
    contextSnapshot: {
      entity: "TK-304",
      title: "Bygholm API rate limiting issue",
      client: "Bygholm Consulting",
      contact: "Henrik Bygholm",
      priority: "medium",
      hoursUnanswered: 16,
      assignedTo: "Emil",
      resolvedOffSystem: true,
    },
    contextMeta: [
      { section: "ticket_details", itemCount: 1, tokenEstimate: 170 },
      { section: "team_availability", itemCount: 3, tokenEstimate: 140 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 1100,
    apiCostCents: 2,
    hoursAgo: 48,
    feedback: "Emil har allerede l\u00f8st det.",
    feedbackRating: 3,
    feedbackCategory: "action_wrong",
  },

  // =========================================================================
  // GROUP F: Escalated to idea (2) — status "resolved"
  // =========================================================================

  // S19 — Client retention: Fjordview Ejendomme
  {
    id: "demo_sit_19",
    typeSlug: "cross-sell-opportunity",
    status: "resolved",
    severity: 0.55,
    confidence: 0.79,
    triggerEntityName: "Fjordview Ejendomme",
    triggerEntityType: "company",
    reasoning: {
      analysis:
        "Fjordview Ejendomme har v\u00e6ret kunde i 9 m\u00e5neder og bruger aktuelt kun \u00e9n service (website management). Lise Fjord har ved to lejligheder n\u00e6vnt interesse for social media og SEO, men der er ikke fulgt op systematisk. Kundens tilfredshedsscore er 8/10, og deres branche (ejendom) har typisk behov for b\u00e5de digital markedsf\u00f8ring og content. Analysen viste et bredere m\u00f8nster: flere kunder i samme segment viser tegn p\u00e5 at v\u00e6re under-serviceret, hvilket f\u00f8rte til eskalering til en strategisk Q2-idé.",
      evidenceSummary:
        "9 m\u00e5neders kunde med kun 1 aktiv service trods udtrykt interesse for flere. Tilfredshedsscore 8/10 indikerer godt udgangspunkt for mersalg. M\u00f8nster identificeret p\u00e5 tv\u00e6rs af kundesegmentet.",
      consideredActions: [
        {
          action: "Foresl\u00e5 cross-sell-m\u00f8de med Maria",
          evidenceFor: [
            "H\u00f8j tilfredshed giver godt udgangspunkt",
            "Maria har selv n\u00e6vnt interesse",
            "9 m\u00e5neders relation giver troværdighed",
          ],
          evidenceAgainst: [
            "Timing kan v\u00e6re d\u00e5rlig",
            "Maria kan opfatte det som salgstaktik",
          ],
          expectedOutcome: "Udvidet samarbejde med 1-2 ekstra services",
        },
        {
          action: "Eskaler til strategisk idé",
          evidenceFor: [
            "M\u00f8nster p\u00e5 tv\u00e6rs af kundesegment",
            "Systematisk tilgang giver bedre resultater",
            "Kan inkludere flere kunder i samme indsats",
          ],
          evidenceAgainst: [
            "Tager l\u00e6ngere tid at implementere",
            "Kr\u00e6ver ledelsesinvolvering",
          ],
          expectedOutcome: "Strategisk retention-program med bredere impact",
        },
      ],
      actionBatch: [
        {
          title: "Eskaler til Q2 Client Retention idé",
          description: "Identificeret m\u00f8nster p\u00e5 tv\u00e6rs af kundesegmentet \u2014 eskaleres til strategisk idé",
          executionMode: "manual",
        },
      ],
      confidence: 0.79,
      missingContext: null,
    },
    contextSnapshot: {
      entity: "Fjordview Ejendomme",
      client: "Fjordview Ejendomme",
      contact: "Lise Fjord",
      contactEmail: "lise@fjordview.dk",
      clientTenureMonths: 9,
      activeServices: ["Website Management"],
      satisfactionScore: 8,
      expressedInterest: ["Social Media", "SEO"],
      monthlyRevenue: 22000,
      currency: "DKK",
      industry: "Real Estate",
    },
    contextMeta: [
      { section: "client_profile", itemCount: 1, tokenEstimate: 280 },
      { section: "service_history", itemCount: 4, tokenEstimate: 320 },
      { section: "segment_analysis", itemCount: 5, tokenEstimate: 440 },
      { section: "satisfaction_data", itemCount: 1, tokenEstimate: 120 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 2680,
    apiCostCents: 5,
    hoursAgo: 4 * 24,
    resolvedHoursAgo: 4 * 24 - 12,
    outcome: "positive",
    outcomeDetails: {
      escalatedTo: "idea",
      ideaName: "Q2 Client Retention",
      affectedClients: 4,
      estimatedRevenueOpportunity: 180000,
    },
    billedCents: 22,
  },

  // S20 — Delivery bottleneck: Kasper overloaded
  {
    id: "demo_sit_20",
    typeSlug: "team-capacity-alert",
    status: "resolved",
    severity: 0.7,
    confidence: 0.88,
    triggerEntityName: "Kasper Dahl",
    triggerEntityType: "team-member",
    reasoning: {
      analysis:
        "Kasper Dahl var overbelastet med 7 samtidige opgaver (4 tickets + 3 projektopgaver), hvilket bragte hans kapacitetsudnyttelse op p\u00e5 130%. To SLA-brud var t\u00e6t p\u00e5, og kvaliteten p\u00e5 hans leverancer var begyndt at falde if\u00f8lge seneste code review-feedback. Analysen afdækkede at dette ikke var et engangsproblem — det var det tredje kapacitetsoverskridelse p\u00e5 6 uger, hvilket indikerer et systemisk problem i opgavefordelingen i leverings-teamet. Situationen blev eskaleret til en procesoptimerings-idé.",
      evidenceSummary:
        "130% kapacitetsudnyttelse, tredje gang p\u00e5 6 uger. Kvalitetsfald i leverancer. Systemisk problem i opgavefordeling identificeret \u2014 eskaleret fra individuel situation til strategisk idé.",
      consideredActions: [
        {
          action: "Omfordel opgaver til Thomas og Emil",
          evidenceFor: [
            "Umiddelbar aflastning for Kasper",
            "Thomas og Emil har kapacitet",
            "Forhindrer SLA-brud",
          ],
          evidenceAgainst: [
            "L\u00f8ser kun symptomet, ikke \u00e5rsagen",
            "Overlevering koster tid",
          ],
          expectedOutcome: "Midlertidig aflastning, men gentager sig",
        },
        {
          action: "Eskaler til procesoptimerings-idé",
          evidenceFor: [
            "Tredje gang p\u00e5 6 uger — tydeligt systemisk",
            "Kr\u00e6ver \u00e6ndring i opgavefordelings-processer",
            "Kan forebygge burnout p\u00e5 tv\u00e6rs af teamet",
          ],
          evidenceAgainst: [
            "Tager tid at implementere",
            "Kr\u00e6ver management-buy-in",
          ],
          expectedOutcome: "Langsigtet l\u00f8sning med b\u00e6redygtig opgavefordeling",
        },
        {
          action: "Ans\u00e6t yderligere udvikler",
          evidenceFor: [
            "Permanent kapacitetsfor\u00f8gelse",
            "M\u00f8der stigende eftersp\u00f8rgsel",
          ],
          evidenceAgainst: [
            "H\u00f8j omkostning",
            "Lang onboarding-tid",
            "Kan v\u00e6re un\u00f8dvendigt med bedre fordeling",
          ],
          expectedOutcome: "Mere kapacitet, men h\u00f8jere omkostninger",
        },
      ],
      actionBatch: [
        {
          title: "Eskaler til Delivery Process Optimization idé",
          description: "Systemisk kapacitetsproblem identificeret \u2014 eskaleres til strategisk procesoptimering",
          executionMode: "manual",
        },
      ],
      confidence: 0.88,
      missingContext: null,
    },
    contextSnapshot: {
      entity: "Kasper Dahl",
      role: "Developer Lead",
      department: "Levering",
      utilizationPercent: 130,
      openTickets: ["TK-298", "TK-301", "TK-302", "TK-304"],
      activeProjectTasks: 3,
      overloadIncidentsLast6Weeks: 3,
      codeReviewFeedback: "Kvalitetsfald noteret i seneste 2 reviews",
      slaAtRisk: ["TK-301", "TK-298"],
      teamCapacity: {
        thomas: { utilization: 70, openTickets: 1 },
        line: { utilization: 85, openTickets: 2 },
        emil: { utilization: 75, openTickets: 2 },
      },
    },
    contextMeta: [
      { section: "team_member_profile", itemCount: 1, tokenEstimate: 160 },
      { section: "workload_history", itemCount: 6, tokenEstimate: 380 },
      { section: "quality_metrics", itemCount: 3, tokenEstimate: 240 },
      { section: "team_capacity", itemCount: 4, tokenEstimate: 220 },
      { section: "incident_history", itemCount: 3, tokenEstimate: 290 },
    ],
    modelId: "gpt-5.4",
    promptVersion: 3,
    reasoningDurationMs: 3210,
    apiCostCents: 6,
    hoursAgo: 3 * 24,
    resolvedHoursAgo: 3 * 24 - 8,
    outcome: "positive",
    outcomeDetails: {
      escalatedTo: "idea",
      ideaName: "Delivery Process Optimization",
      rootCause: "Manglende kapacitetsstyring og workload-balancering i leverings-teamet",
      immediateActions: ["2 tickets omfordelt til Thomas", "Kasper frigjort til projektfokus"],
      strategicActions: ["Workload-dashboard implementeres", "Ugentlig kapacitetsgennemgang indført"],
    },
    billedCents: 28,
  },
];
