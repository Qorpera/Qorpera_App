// ---------------------------------------------------------------------------
// Demo onboarding: scripted agent progress messages
// ---------------------------------------------------------------------------

export interface ScriptedMessage {
  agentName: string;
  message: string;
  delayMs: number;
  phase: "foundation" | "deep-research" | "cross-pollination" | "synthesis";
}

export const ONBOARDING_SCRIPT: ScriptedMessage[] = [
  // ── Phase: foundation (0–15s) ──────────────────────────────────────────
  {
    agentName: "System",
    message: "Starter organisationsanalyse...",
    delayMs: 0,
    phase: "foundation",
  },
  {
    agentName: "People Discovery",
    message: "Scanner forbundne datakilder...",
    delayMs: 2000,
    phase: "foundation",
  },
  {
    agentName: "People Discovery",
    message: "18 teammedlemmer fundet på tværs af email, kalender og Slack",
    delayMs: 5000,
    phase: "foundation",
  },
  {
    agentName: "People Discovery",
    message:
      "Intern/ekstern klassificering fuldført — 18 interne, 47 eksterne kontakter",
    delayMs: 8000,
    phase: "foundation",
  },
  {
    agentName: "Temporal Analyst",
    message: "Analyserer dokumentaktualitet...",
    delayMs: 10000,
    phase: "foundation",
  },
  {
    agentName: "Temporal Analyst",
    message:
      "Tidsindeks opbygget — 234 dokumenter scannet, 12 markeret som forældede",
    delayMs: 13000,
    phase: "foundation",
  },
  {
    agentName: "System",
    message:
      "Grundlagsanalyse fuldført. Starter dybdeanalyse med 5 specialiserede agenter...",
    delayMs: 15000,
    phase: "foundation",
  },

  // ── Phase: deep-research (17s–63s) ────────────────────────────────────
  {
    agentName: "Organizational Analyst",
    message:
      "Analyserer organisationsstruktur fra Slack-kanaler og kalender-1:1-mønstre...",
    delayMs: 17000,
    phase: "deep-research",
  },
  {
    agentName: "Organizational Analyst",
    message:
      "4 afdelinger identificeret: Salg, Levering, Marketing, Økonomi & Admin",
    delayMs: 21000,
    phase: "deep-research",
  },
  {
    agentName: "Organizational Analyst",
    message:
      "Rapporteringslinjer kortlagt — Anders Vestergaard er CEO, 4 afdelingsledere",
    delayMs: 25000,
    phase: "deep-research",
  },
  {
    agentName: "Process Analyst",
    message:
      "Scanner arbejdsprocesser fra email-sekvenser og CRM-pipeline...",
    delayMs: 28000,
    phase: "deep-research",
  },
  {
    agentName: "Process Analyst",
    message:
      "Faktureringsproces identificeret: oprettelse → godkendelse → afsendelse → opfølgning",
    delayMs: 32000,
    phase: "deep-research",
  },
  {
    agentName: "Process Analyst",
    message: "3 flaskehalse opdaget i leveringsprocessen",
    delayMs: 35000,
    phase: "deep-research",
  },
  {
    agentName: "Relationship Analyst",
    message:
      "Kortlægger kunderelationer fra CRM, email og fakturaer...",
    delayMs: 38000,
    phase: "deep-research",
  },
  {
    agentName: "Relationship Analyst",
    message:
      "12 aktive kundeforhold identificeret, 2 med faldende engagement",
    delayMs: 42000,
    phase: "deep-research",
  },
  {
    agentName: "Relationship Analyst",
    message:
      "Nordlys Media markeret som risiko — evaluerer andre bureauer",
    delayMs: 45000,
    phase: "deep-research",
  },
  {
    agentName: "Knowledge Analyst",
    message: "Scanner videndeling og kommunikationsmønstre...",
    delayMs: 48000,
    phase: "deep-research",
  },
  {
    agentName: "Knowledge Analyst",
    message:
      "Kasper Dahl identificeret som videnssilo for teknisk dokumentation",
    delayMs: 51000,
    phase: "deep-research",
  },
  {
    agentName: "Financial Analyst",
    message: "Analyserer omsætningsmønstre og betalingssundhed...",
    delayMs: 54000,
    phase: "deep-research",
  },
  {
    agentName: "Financial Analyst",
    message:
      "6 fakturaer dette kvartal, samlet 287.500 DKK. 2 forfaldne (106.250 DKK)",
    delayMs: 57000,
    phase: "deep-research",
  },
  {
    agentName: "Financial Analyst",
    message:
      "Pipeline-analyse: 940.000 DKK i aktive deals, 420.000 DKK i forhandling",
    delayMs: 60000,
    phase: "deep-research",
  },
  {
    agentName: "System",
    message: "Dybdeanalyse fuldført. Starter krydsanalyse...",
    delayMs: 63000,
    phase: "deep-research",
  },

  // ── Phase: cross-pollination (66s–82s) ────────────────────────────────
  {
    agentName: "Organizer",
    message: "Sammenligner fund fra 5 agenter...",
    delayMs: 66000,
    phase: "cross-pollination",
  },
  {
    agentName: "Organizer",
    message:
      "Overlap bekræftet: Kasper nævnt som flaskehals af både Proces- og Videnanalytiker (høj sikkerhed)",
    delayMs: 70000,
    phase: "cross-pollination",
  },
  {
    agentName: "Organizer",
    message:
      "Modsigelse fundet: Relationship Analyst siger Fjordview er inaktiv, men Financial Analyst finder nylig faktura. Sender til opfølgning...",
    delayMs: 74000,
    phase: "cross-pollination",
  },
  {
    agentName: "Relationship Analyst",
    message:
      "Opfølgning: Fjordview faktura var for afsluttende arbejde — kunden ER inaktiv. Sidst aktiv dialog: 8 måneder siden.",
    delayMs: 78000,
    phase: "cross-pollination",
  },
  {
    agentName: "Organizer",
    message: "Alle modsigelser løst. Klar til syntese.",
    delayMs: 82000,
    phase: "cross-pollination",
  },

  // ── Phase: synthesis (85s–105s) ───────────────────────────────────────
  {
    agentName: "System",
    message: "Syntetiserer virksomhedsmodel...",
    delayMs: 85000,
    phase: "synthesis",
  },
  {
    agentName: "Synthesis",
    message: "Opretter 4 afdelinger med teammedlemmer...",
    delayMs: 88000,
    phase: "synthesis",
  },
  {
    agentName: "Synthesis",
    message:
      "18 medarbejdere placeret — 1 tværgående (Line Kjær: Levering + Salg)",
    delayMs: 92000,
    phase: "synthesis",
  },
  {
    agentName: "Synthesis",
    message:
      "8 situationstyper foreslået baseret på fundne processer",
    delayMs: 96000,
    phase: "synthesis",
  },
  {
    agentName: "Synthesis",
    message:
      "Usikkerhedspunkter: 2 spørgsmål kræver din bekræftelse",
    delayMs: 100000,
    phase: "synthesis",
  },
  {
    agentName: "System",
    message:
      "Analyse fuldført! Gennemgå venligst den foreslåede struktur.",
    delayMs: 105000,
    phase: "synthesis",
  },
];
