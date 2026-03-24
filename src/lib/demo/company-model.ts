// ---------------------------------------------------------------------------
// Demo onboarding: pre-built company model (matches test company seed data)
// ---------------------------------------------------------------------------

// ── SynthesisOutput ─────────────────────────────────────────────────────

export interface SynthesisOutput {
  departments: Array<{
    name: string;
    headCount: number;
    keyPeople: string[];
    functions: string[];
  }>;
  people: Array<{
    name: string;
    email?: string;
    department?: string;
    role?: string;
    relationships: string[];
  }>;
  processes: Array<{
    name: string;
    department?: string;
    description: string;
    tools: string[];
  }>;
  relationships: Array<{
    from: string;
    to: string;
    type: string;
    strength: "strong" | "moderate" | "weak";
  }>;
  knowledgeInventory: Array<{
    topic: string;
    sources: string[];
    coverage: "comprehensive" | "partial" | "sparse";
  }>;
  financialBaseline?: {
    revenue?: string;
    keyMetrics: Record<string, string>;
    tools: string[];
  };
  situationRecommendations: Array<{
    name: string;
    description: string;
    department?: string;
    priority: "high" | "medium" | "low";
  }>;
}

export interface UncertaintyQuestion {
  question: string;
  possibleAnswers: string[];
  context: string;
}

// ── Pre-built synthesis output ──────────────────────────────────────────

export const DEMO_SYNTHESIS_OUTPUT: SynthesisOutput = {
  departments: [
    {
      name: "Salg",
      headCount: 5,
      keyPeople: ["Mette Lindberg", "Jakob Friis", "Sofie Bech"],
      functions: [
        "Klientakvisition",
        "Account management",
        "Pipeline-styring",
        "Tilbudsgivning",
      ],
    },
    {
      name: "Levering",
      headCount: 5,
      keyPeople: ["Thomas Nørgaard", "Kasper Dahl", "Line Kjær"],
      functions: [
        "Projektledelse",
        "Webudvikling",
        "UX-design",
        "Teknisk support",
      ],
    },
    {
      name: "Marketing",
      headCount: 4,
      keyPeople: ["Astrid Møller", "Frederik Lund"],
      functions: [
        "Indholdsproduktion",
        "Digital markedsføring",
        "Branding",
        "Lead generation",
      ],
    },
    {
      name: "Økonomi & Admin",
      headCount: 4,
      keyPeople: ["Anders Vestergaard", "Louise Winther"],
      functions: [
        "Fakturering",
        "Bogføring",
        "Virksomhedsledelse",
        "Administration",
      ],
    },
  ],

  people: [
    // ── Salg ──
    {
      name: "Mette Lindberg",
      email: "mette@testcompany.dk",
      department: "Salg",
      role: "Sales Lead",
      relationships: [
        "Leder Salg-teamet",
        "Primær kontakt for Nordlys Media og Bygholm Consulting",
        "Tæt samarbejde med Levering om klientoverdragelse",
      ],
    },
    {
      name: "Jakob Friis",
      email: "jakob@testcompany.dk",
      department: "Salg",
      role: "Senior Account Manager",
      relationships: [
        "Ansvarlig for Dansk Energi Partners og Roskilde Byg",
        "Rapporterer til Mette Lindberg",
      ],
    },
    {
      name: "Sofie Bech",
      email: "sofie@testcompany.dk",
      department: "Salg",
      role: "Account Manager",
      relationships: [
        "Ansvarlig for GreenTech Nordic og NextStep Education",
        "Rapporterer til Mette Lindberg",
      ],
    },
    {
      name: "Oliver Kragh",
      email: "oliver@testcompany.dk",
      department: "Salg",
      role: "Business Development",
      relationships: [
        "Ansvarlig for Vestjysk Finans og Copenhagen Bikes",
        "Rapporterer til Mette Lindberg",
      ],
    },
    {
      name: "Ida Holm",
      email: "ida@testcompany.dk",
      department: "Salg",
      role: "Sales Coordinator",
      relationships: [
        "Koordinerer salgsaktiviteter og CRM-opdateringer",
        "Rapporterer til Mette Lindberg",
      ],
    },
    // ── Levering ──
    {
      name: "Thomas Nørgaard",
      email: "thomas@testcompany.dk",
      department: "Levering",
      role: "Head of Delivery",
      relationships: [
        "Leder Levering-afdelingen",
        "Eskalationspunkt for kundeproblemer",
        "Rapporterer til Anders Vestergaard",
      ],
    },
    {
      name: "Line Kjær",
      email: "line@testcompany.dk",
      department: "Levering",
      role: "Senior Project Manager",
      relationships: [
        "Tværgående: aktiv i både Levering og Salg",
        "Håndterer klientoverdragelse fra Salg til Levering",
        "Rapporterer til Thomas Nørgaard",
      ],
    },
    {
      name: "Kasper Dahl",
      email: "kasper@testcompany.dk",
      department: "Levering",
      role: "Developer Lead",
      relationships: [
        "Videnssilo for teknisk dokumentation",
        "Ansvarlig for support-tickets TK-301 og TK-302",
        "Rapporterer til Thomas Nørgaard",
      ],
    },
    {
      name: "Nanna Skov",
      email: "nanna@testcompany.dk",
      department: "Levering",
      role: "UX Designer",
      relationships: [
        "Samarbejder med Marketing om designretningslinjer",
        "Rapporterer til Thomas Nørgaard",
      ],
    },
    {
      name: "Emil Bruun",
      email: "emil@testcompany.dk",
      department: "Levering",
      role: "Junior Developer",
      relationships: [
        "Under mentoring af Kasper Dahl",
        "Ansvarlig for ticket TK-304",
        "Rapporterer til Thomas Nørgaard",
      ],
    },
    // ── Marketing ──
    {
      name: "Astrid Møller",
      email: "astrid@testcompany.dk",
      department: "Marketing",
      role: "Marketing Manager",
      relationships: [
        "Leder Marketing-afdelingen",
        "Samarbejder med Salg om lead generation",
        "Rapporterer til Anders Vestergaard",
      ],
    },
    {
      name: "Frederik Lund",
      email: "frederik@testcompany.dk",
      department: "Marketing",
      role: "Content Creator",
      relationships: [
        "Producerer indhold til blog, social media og klientmaterialer",
        "Rapporterer til Astrid Møller",
      ],
    },
    {
      name: "Camilla Juhl",
      email: "camilla@testcompany.dk",
      department: "Marketing",
      role: "Digital Marketing Specialist",
      relationships: [
        "Ansvarlig for betalte kampagner og analytics",
        "Rapporterer til Astrid Møller",
      ],
    },
    {
      name: "Mikkel Rask",
      email: "mikkel@testcompany.dk",
      department: "Marketing",
      role: "Marketing Intern",
      relationships: [
        "Assisterer med social media og indholdsproduktion",
        "Rapporterer til Astrid Møller",
      ],
    },
    // ── Økonomi & Admin ──
    {
      name: "Anders Vestergaard",
      email: "anders@testcompany.dk",
      department: "Økonomi & Admin",
      role: "CEO/Founder",
      relationships: [
        "CEO — alle afdelingsledere rapporterer hertil",
        "Deltager i Salg-møder ugentligt som Key Account Sponsor",
        "Endeligt godkendelsesniveau for kontrakter over 50.000 DKK",
      ],
    },
    {
      name: "Louise Winther",
      email: "louise@testcompany.dk",
      department: "Økonomi & Admin",
      role: "Finance Manager",
      relationships: [
        "Leder Økonomi & Admin",
        "Ansvarlig for fakturering og betalingsopfølgning",
        "Rapporterer til Anders Vestergaard",
      ],
    },
    {
      name: "Peter Steen",
      email: "peter@testcompany.dk",
      department: "Økonomi & Admin",
      role: "Bookkeeper",
      relationships: [
        "Håndterer daglig bogføring og e-conomic",
        "Rapporterer til Louise Winther",
      ],
    },
    {
      name: "Maria Thomsen",
      email: "maria@testcompany.dk",
      department: "Økonomi & Admin",
      role: "Office Manager / Executive Assistant",
      relationships: [
        "Assisterer Anders Vestergaard med kalender og administration",
        "Rapporterer til Louise Winther",
      ],
    },
  ],

  processes: [
    {
      name: "Salgspipeline",
      department: "Salg",
      description:
        "Lead-kvalificering → discovery-møde → tilbudsgivning → forhandling → close. Gennemsnitlig salgscyklus: 4-6 uger for projektsalg, løbende for retainer-fornyelser.",
      tools: ["HubSpot CRM", "Gmail", "Google Calendar"],
    },
    {
      name: "Fakturering",
      department: "Økonomi & Admin",
      description:
        "Faktura oprettelse i e-conomic → intern godkendelse (Louise) → afsendelse til kunde → betalingsopfølgning ved forfald. 2 forfaldne fakturaer udgør 106.250 DKK.",
      tools: ["e-conomic", "Gmail"],
    },
    {
      name: "Projektlevering",
      department: "Levering",
      description:
        "Klientoverdragelse fra Salg (Line Kjær) → projektopsætning → sprint-planlægning → udvikling/design → test → levering → support. 3 identificerede flaskehalse.",
      tools: ["Slack", "Google Drive", "Google Calendar"],
    },
    {
      name: "Klient onboarding",
      department: "Levering",
      description:
        "Ny klient-velkomst → kontaktperson-mapping → adgangsopsætning → kickoff-møde → første leverance-milepæl. Koordineres af Line Kjær og projektteam.",
      tools: ["Gmail", "Google Calendar", "HubSpot CRM", "Slack"],
    },
    {
      name: "Intern kommunikation",
      description:
        "Daglig kommunikation via Slack-kanaler (#salg, #levering, #marketing, #general). Ugentlige 1:1-møder mellem afdelingsledere og CEO. Månedligt all-hands.",
      tools: ["Slack", "Google Calendar"],
    },
  ],

  relationships: [
    {
      from: "Test Company",
      to: "Nordlys Media ApS",
      type: "retainer-klient",
      strength: "strong",
    },
    {
      from: "Test Company",
      to: "Bygholm Consulting",
      type: "retainer-klient",
      strength: "strong",
    },
    {
      from: "Test Company",
      to: "Dansk Energi Partners",
      type: "projekt-klient",
      strength: "moderate",
    },
    {
      from: "Test Company",
      to: "Baltic Digital Group",
      type: "referral-partner",
      strength: "moderate",
    },
    {
      from: "Test Company",
      to: "CloudNine Solutions",
      type: "teknologipartner",
      strength: "moderate",
    },
    {
      from: "Levering",
      to: "Salg",
      type: "klientoverdragelse",
      strength: "strong",
    },
  ],

  knowledgeInventory: [
    {
      topic: "Teknisk dokumentation",
      sources: ["Google Drive", "Slack #levering"],
      coverage: "sparse",
    },
    {
      topic: "Salgsplaybook og tilbudsskabeloner",
      sources: ["Google Drive", "HubSpot CRM"],
      coverage: "partial",
    },
    {
      topic: "Økonomiske processer og faktureringsregler",
      sources: ["e-conomic", "Google Drive"],
      coverage: "comprehensive",
    },
    {
      topic: "Klient-briefings og projektdokumentation",
      sources: ["Google Drive", "Gmail", "Slack"],
      coverage: "partial",
    },
    {
      topic: "Onboarding-guides og interne procedurer",
      sources: ["Google Drive"],
      coverage: "sparse",
    },
  ],

  financialBaseline: {
    revenue: "287.500 DKK faktureret dette kvartal",
    keyMetrics: {
      faktureret: "287.500 DKK",
      forfaldne: "106.250 DKK (2 fakturaer)",
      pipeline: "940.000 DKK i aktive deals",
      forhandling: "420.000 DKK under forhandling",
      gennemsnitligDealstørrelse: "156.667 DKK",
      closedWon: "435.000 DKK (3 deals)",
    },
    tools: ["e-conomic", "HubSpot CRM"],
  },

  situationRecommendations: [
    {
      name: "Forfalden faktura opfølgning",
      description:
        "Registrerer fakturaer der er forfaldne og kræver opfølgning. Undersøger betalingshistorik, kundeforhold og tidligere påmindelser for at foreslå den mest effektive opfølgningsmetode.",
      department: "Økonomi & Admin",
      priority: "high",
    },
    {
      name: "Stille deal",
      description:
        "Opdager deals i pipeline der ikke har haft aktivitet i over 10 dage. Analyserer dealværdi, kontaktpersonens engagement-historik og pipeline-stadie for at foreslå genaktivering.",
      department: "Salg",
      priority: "high",
    },
    {
      name: "Kontraktfornyelse nærmer sig",
      description:
        "Overvåger retainer- og kontraktudløb 4-8 uger før deadline. Analyserer kundetilfredshed, leverancehistorik og omsætningspotentiale for at facilitere rettidig fornyelse.",
      department: "Salg",
      priority: "high",
    },
    {
      name: "Ny lead kvalificering",
      description:
        "Registrerer nye kontakter fra HubSpot, hjemmeside eller email og vurderer lead-kvalitet baseret på virksomhedsstørrelse, branche og engagement. Foreslår kvalificeringsskridt.",
      department: "Salg",
      priority: "medium",
    },
    {
      name: "Mersalgsmulighed",
      description:
        "Identificerer eksisterende kunder med potentiale for yderligere services baseret på nuværende engagement, branchetrends og virksomhedens servicekatalog.",
      department: "Salg",
      priority: "medium",
    },
    {
      name: "Kundemøde forberedelse",
      description:
        "Før vigtige kundemøder sammensættes relevant kontekst: deal-detaljer, kontaktprofil, tidligere interaktioner og nøglepunkter. Sender forberedelsesmateriale til mødedeltagere.",
      department: "Levering",
      priority: "medium",
    },
    {
      name: "Support ticket eskalering",
      description:
        "Overvåger support tickets der nærmer sig SLA-grænser eller er ubesvarede i længere tid. Eskalerer til relevant teamleder og prioriterer baseret på kundeværdi og ticket-alvor.",
      department: "Levering",
      priority: "high",
    },
    {
      name: "Kapacitetsadvarsel",
      description:
        "Overvåger teammedlemmers arbejdsbyrde og advarer når nogen har for mange åbne opgaver. Forebygger flaskehalse, SLA-brud og udtræthed ved at foreslå omfordeling.",
      department: "Levering",
      priority: "low",
    },
  ],
};

// ── Uncertainty questions ───────────────────────────────────────────────

export const DEMO_UNCERTAINTY_LOG: UncertaintyQuestion[] = [
  {
    question:
      "Line Kjær er aktiv i både Levering og Salg-kanaler. Tilhører hun begge afdelinger?",
    possibleAnswers: [
      "Ja, hun har en tværgående rolle i begge afdelinger",
      "Nej, hun tilhører kun Levering men samarbejder tæt med Salg",
      "Hun er ved at skifte fra Levering til Salg",
    ],
    context:
      "Line Kjær er registreret i #levering Slack-kanal og deltager i Leverings daglige standups. Samtidig er hun aktiv i #salg og deltager i ugentlige pipeline-reviews. Kalenderdata viser 1:1-møder med både Thomas Nørgaard (Head of Delivery) og Mette Lindberg (Sales Lead).",
  },
  {
    question:
      "Anders Vestergaard deltager i Salg-møder ugentligt. Skal han vises som medlem af Salg-afdelingen?",
    possibleAnswers: [
      "Ja, vis ham som medlem af både Økonomi & Admin og Salg",
      "Nej, han deltager som CEO-sponsor — vis kun Økonomi & Admin",
      "Vis ham som Key Account Sponsor i Salg uden fuldt medlemskab",
    ],
    context:
      "Anders Vestergaard er CEO og placeret i Økonomi & Admin. Kalenderdata viser ugentlig deltagelse i Salgs pipeline-review og kvartalsvis deltagelse i store klientmøder. Han er nævnt som 'Key Account Sponsor' i flere HubSpot-deals over 200.000 DKK.",
  },
];

// ── Analysis stats ──────────────────────────────────────────────────────

export const DEMO_ANALYSIS_STATS = {
  documentsAnalyzed: 234,
  emailsScanned: 1847,
  meetingsAnalyzed: 156,
  slackMessagesProcessed: 3291,
  crmRecordsReviewed: 42,
  invoicesAnalyzed: 8,
  totalAgentIterations: 47,
  totalTokensUsed: 287000,
  analysisTimeMinutes: 1.8,
};
