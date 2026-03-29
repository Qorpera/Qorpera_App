// ── Clutter Content Generator ───────────────────────────────────────────
// Produces realistic noise content (system notifications, auto-replies,
// newsletters, transactional emails, calendar auto-messages, internal
// chatter) that fills out a synthetic company's content pool.

import type { SyntheticContent } from "../../synthetic-types";
import type { CompanyProfile, ClutterConfig } from "./types";

// ── Seeded PRNG (LCG) ──────────────────────────────────────────────────
// Deterministic given the same seed. Period: 2^31.

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed % 2147483647;
    if (this.state <= 0) this.state += 2147483646;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    this.state = (this.state * 16807) % 2147483647;
    return (this.state - 1) / 2147483646;
  }

  /** Returns an integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Pick a random element from an array. */
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Shuffle an array (Fisher-Yates). Returns a new array. */
  shuffle<T>(arr: T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

/** Pick from filtered array, falling back to full array if filter is empty. */
function pickProvider(rng: SeededRandom, providers: string[], test: (p: string) => boolean): string {
  const filtered = providers.filter(test);
  return rng.pick(filtered.length > 0 ? filtered : providers);
}

/** Distribute `count` items across 0..89 days with recent-heavy bias. */
function distributeDaysAgo(rng: SeededRandom, count: number, maxDays = 90): number[] {
  const days: number[] = [];
  for (let i = 0; i < count; i++) {
    // Quadratic bias toward recent: sqrt(uniform) * maxDays
    const raw = Math.sqrt(rng.next()) * maxDays;
    days.push(Math.min(Math.floor(raw), maxDays - 1));
  }
  return days;
}

function firstName(fullName: string): string {
  return fullName.split(" ")[0];
}

// ── Danish data pools ───────────────────────────────────────────────────

const DA_MEETING_TITLES = [
  "Statusmøde", "Projektgennemgang", "Kvartalsopfølgning", "Budgetmøde",
  "Kundemøde", "Driftsmøde", "Planlægningsmøde", "Strategimøde",
  "1:1 opfølgning", "Sprint review", "Onboarding", "Leverandørmøde",
];

const DA_CHANNELS = [
  "#general", "#random", "#drift", "#salg", "#kontor", "#nyheder",
  "#frokost", "#teknik", "#økonomi", "#projekter",
];

const DA_RESTAURANTS = [
  "Dalle Valle", "Café Katz", "Wok House", "Burger Shack", "Sushi Mashi",
  "Grønt & Godt", "Bazaar Vest", "Pizzeria Luca", "Hereford",
];

const DA_TASKS = [
  "kundeopfølgning", "rapportering", "tilbudsudarbejdelse", "kodegennemgang",
  "budget Q2", "projektplan", "dokumentation", "testning", "leverandørkontakt",
  "præsentationsmateriale", "onboarding", "fakturering",
];

const DA_CONFERENCES = [
  "Danish Tech Summit 2026", "Erhvervsforum Hovedstaden",
  "Digitalisering i Praksis", "Nordic Business Days",
  "SMB Growth Conference", "Industri 4.0 Forum",
];

const DA_PRODUCTS = [
  "Fjord Premium kontormøbler", "ScanPrint A3 Pro farveprinter",
  "NordicClean rengøringsaftale", "DataVault backup-løsning",
  "LogiTrack flådestyring", "KøleKompagniet serviceaftale",
];

const EN_MEETING_TITLES = [
  "Status meeting", "Project review", "Quarterly check-in", "Budget review",
  "Client meeting", "Operations sync", "Planning session", "Strategy session",
  "1:1 follow-up", "Sprint review", "Onboarding call", "Vendor sync",
];

const EN_CHANNELS = [
  "#general", "#random", "#engineering", "#sales", "#office", "#news",
  "#lunch", "#tech", "#finance", "#projects",
];

const EN_RESTAURANTS = [
  "The Corner Deli", "Noodle Bar", "Burger Joint", "Sushi Place",
  "Green Kitchen", "Pizza Express", "Taco Loco", "Café Central",
];

const EN_TASKS = [
  "client follow-up", "reporting", "proposal drafting", "code review",
  "Q2 budget", "project plan", "documentation", "testing", "vendor outreach",
  "presentation deck", "onboarding", "invoicing",
];

const EN_CONFERENCES = [
  "SaaS Connect 2026", "Nordic Startup Summit",
  "Digital Transformation Forum", "Enterprise Tech Days",
  "Growth Summit Europe", "Industry 4.0 Conference",
];

const EN_PRODUCTS = [
  "ErgoDesk Pro standing desks", "CloudPrint A3 colour printer",
  "CleanSweep office maintenance plan", "VaultBackup cloud solution",
  "FleetTrack GPS tracking", "CoolServ HVAC service agreement",
];

// ── Template generators ─────────────────────────────────────────────────
// Each returns a single SyntheticContent item.

type TemplateGenerator = (
  rng: SeededRandom,
  profile: CompanyProfile,
  daysAgo: number,
) => SyntheticContent;

// ── System notifications ────────────────────────────────────────────────

function systemNotificationsDa(rng: SeededRandom, profile: CompanyProfile, daysAgo: number): SyntheticContent {
  const emp = rng.pick(profile.employees);
  const ext = rng.pick(profile.externalContacts);
  const meeting = rng.pick(DA_MEETING_TITLES);
  const channel = rng.pick(DA_CHANNELS);
  const num = rng.int(100, 999);

  const templates: Array<() => { content: string; subject: string }> = [
    () => ({
      content: `${emp.name} har accepteret din invitation til '${meeting}'`,
      subject: `Accepteret: ${meeting}`,
    }),
    () => ({
      content: `HubSpot: ${ext.name} har åbnet din email '${meeting} — opfølgning'`,
      subject: `HubSpot: Email åbnet af ${ext.name}`,
    }),
    () => ({
      content: `Slack: ${emp.name} nævnte dig i ${channel}: "Kan du kigge på dette?"`,
      subject: `Slack: Ny omtale i ${channel}`,
    }),
    () => ({
      content: `e-conomic: Faktura ${num} er sendt til ${ext.company}`,
      subject: `e-conomic: Faktura ${num} sendt`,
    }),
    () => ({
      content: `Google Drive: ${emp.name} har delt dokumentet '${meeting} noter' med dig`,
      subject: `${emp.name} delte '${meeting} noter'`,
    }),
    () => ({
      content: `Teams: ${firstName(emp.name)} reagerede med 👍 på din besked i ${channel}`,
      subject: `Teams: Reaktion fra ${firstName(emp.name)}`,
    }),
    () => ({
      content: `Jira: ${firstName(emp.name)} har tildelt dig opgaven '${rng.pick(DA_TASKS)}' i projekt ${profile.name.split(" ")[0]}`,
      subject: `Jira: Ny opgave tildelt`,
    }),
    () => ({
      content: `Calendar: Påmindelse — '${meeting}' starter om 15 minutter`,
      subject: `Påmindelse: ${meeting}`,
    }),
  ];

  const t = rng.pick(templates)();
  return {
    sourceType: "email",
    connectorProvider: pickProvider(rng, profile.connectorProviders, p => p.includes("mail") || p.includes("gmail") || p.includes("outlook")),
    content: t.content,
    daysAgo,
    metadata: {
      from: `noreply@${rng.pick(["hubspot.com", "slack.com", "google.com", "e-conomic.dk", "atlassian.net"])}`,
      to: emp.email,
      subject: t.subject,
    },
  };
}

function systemNotificationsEn(rng: SeededRandom, profile: CompanyProfile, daysAgo: number): SyntheticContent {
  const emp = rng.pick(profile.employees);
  const ext = rng.pick(profile.externalContacts);
  const meeting = rng.pick(EN_MEETING_TITLES);
  const channel = rng.pick(EN_CHANNELS);
  const num = rng.int(100, 999);

  const templates: Array<() => { content: string; subject: string }> = [
    () => ({
      content: `${emp.name} accepted your invitation to '${meeting}'`,
      subject: `Accepted: ${meeting}`,
    }),
    () => ({
      content: `HubSpot: ${ext.name} opened your email '${meeting} — follow-up'`,
      subject: `HubSpot: Email opened by ${ext.name}`,
    }),
    () => ({
      content: `Slack: ${emp.name} mentioned you in ${channel}: "Can you take a look at this?"`,
      subject: `Slack: New mention in ${channel}`,
    }),
    () => ({
      content: `Xero: Invoice ${num} has been sent to ${ext.company}`,
      subject: `Xero: Invoice ${num} sent`,
    }),
    () => ({
      content: `Google Drive: ${emp.name} shared the document '${meeting} notes' with you`,
      subject: `${emp.name} shared '${meeting} notes'`,
    }),
    () => ({
      content: `Teams: ${firstName(emp.name)} reacted with 👍 to your message in ${channel}`,
      subject: `Teams: Reaction from ${firstName(emp.name)}`,
    }),
    () => ({
      content: `GitHub: PR #${num} merged in ${profile.domain.split(".")[0]}-api`,
      subject: `GitHub: PR #${num} merged`,
    }),
    () => ({
      content: `Calendar: Reminder — '${meeting}' starts in 15 minutes`,
      subject: `Reminder: ${meeting}`,
    }),
  ];

  const t = rng.pick(templates)();
  return {
    sourceType: "email",
    connectorProvider: pickProvider(rng, profile.connectorProviders, p => p.includes("mail") || p.includes("gmail") || p.includes("outlook")),
    content: t.content,
    daysAgo,
    metadata: {
      from: `noreply@${rng.pick(["hubspot.com", "slack.com", "google.com", "xero.com", "github.com"])}`,
      to: emp.email,
      subject: t.subject,
    },
  };
}

// ── Auto-replies ────────────────────────────────────────────────────────

function autoRepliesDa(rng: SeededRandom, profile: CompanyProfile, daysAgo: number): SyntheticContent {
  const emp = rng.pick(profile.employees);
  const alt = rng.pick(profile.employees.filter(e => e.email !== emp.email) || profile.employees);
  const startOffset = rng.int(1, 14);
  const endOffset = startOffset + rng.int(3, 10);

  const templates: Array<() => string> = [
    () => `Tak for din besked. Jeg er på ferie fra ${startOffset}. til ${endOffset}. denne måned. Kontakt ${alt.name} (${alt.email}) i min fravær.`,
    () => `Din besked er modtaget. Vi vender tilbage inden for 24 timer. Venlig hilsen ${profile.name}.`,
    () => `Tak for din henvendelse til ${profile.name}. Vi behandler din forespørgsel hurtigst muligt.`,
    () => `Jeg er til møde resten af dagen. Skriv til ${alt.name} (${alt.email}) hvis det haster. Vh ${firstName(emp.name)}`,
    () => `Automatisk svar: Jeg er på kursus ${startOffset}.-${endOffset}. og har begrænset adgang til email. Ved hastende sager, kontakt ${alt.name}.`,
    () => `Tak for din email. Jeg er på barsel og forventer at vende tilbage ${endOffset}. næste måned. I mellemtiden kan ${alt.name} hjælpe dig.`,
  ];

  return {
    sourceType: "email",
    connectorProvider: pickProvider(rng, profile.connectorProviders, p => p.includes("mail") || p.includes("gmail") || p.includes("outlook")),
    content: rng.pick(templates)(),
    daysAgo,
    metadata: {
      from: emp.email,
      to: rng.pick(profile.externalContacts).email,
      subject: "Automatisk svar: Ikke til stede",
    },
  };
}

function autoRepliesEn(rng: SeededRandom, profile: CompanyProfile, daysAgo: number): SyntheticContent {
  const emp = rng.pick(profile.employees);
  const alt = rng.pick(profile.employees.filter(e => e.email !== emp.email) || profile.employees);
  const startOffset = rng.int(1, 14);
  const endOffset = startOffset + rng.int(3, 10);

  const templates: Array<() => string> = [
    () => `Thank you for your message. I am out of the office from the ${startOffset}th to the ${endOffset}th. Please contact ${alt.name} (${alt.email}) in my absence.`,
    () => `Your message has been received. We will get back to you within 24 hours. Kind regards, ${profile.name}.`,
    () => `Thank you for reaching out to ${profile.name}. We are processing your inquiry as quickly as possible.`,
    () => `I am in meetings for the rest of the day. Please reach out to ${alt.name} (${alt.email}) for urgent matters. Best, ${firstName(emp.name)}`,
    () => `Auto-reply: I am attending a course from the ${startOffset}th to the ${endOffset}th with limited email access. For urgent matters, contact ${alt.name}.`,
    () => `Thank you for your email. I am on parental leave and expect to return on the ${endOffset}th of next month. In the meantime, ${alt.name} can assist you.`,
  ];

  return {
    sourceType: "email",
    connectorProvider: pickProvider(rng, profile.connectorProviders, p => p.includes("mail") || p.includes("gmail") || p.includes("outlook")),
    content: rng.pick(templates)(),
    daysAgo,
    metadata: {
      from: emp.email,
      to: rng.pick(profile.externalContacts).email,
      subject: "Out of Office Auto-Reply",
    },
  };
}

// ── Marketing / newsletters ─────────────────────────────────────────────

function marketingDa(rng: SeededRandom, profile: CompanyProfile, daysAgo: number): SyntheticContent {
  const emp = rng.pick(profile.employees);
  const conf = rng.pick(DA_CONFERENCES);
  const product = rng.pick(DA_PRODUCTS);
  const views = rng.int(1, 12);

  const templates: Array<() => { content: string; subject: string }> = [
    () => ({
      content: `Hej ${firstName(emp.name)}, se vores nye produkter denne sæson: ${product}. Bestil inden fredag og få 15% rabat. Se mere på vores hjemmeside.`,
      subject: `Nyhedsbrev: ${product.split(" ")[0]} sæsonkatalog`,
    }),
    () => ({
      content: `LinkedIn: Du har ${views} nye profilvisninger denne uge. Se hvem der har set din profil og nye forbindelsesforslag.`,
      subject: `LinkedIn: ${views} nye profilvisninger denne uge`,
    }),
    () => ({
      content: `Invitation: ${conf} — Early bird pris udløber om 7 dage. Tilmeld dig nu og spar 2.000 DKK. Keynote speakers fra Novo Nordisk og Maersk.`,
      subject: `Invitation: ${conf}`,
    }),
    () => ({
      content: `Dansk Erhverv Nyhedsbrev: Nye regler for moms fra 1. juli 2026. Læs om ændringerne og hvad det betyder for din virksomhed. Plus: Brancheundersøgelse viser vækst i ${profile.name.split(" ")[0]}-sektoren.`,
      subject: `Dansk Erhverv: Nyhedsbrev marts 2026`,
    }),
    () => ({
      content: `Hej ${firstName(emp.name)}, din prøveperiode på ${product.split(" ")[0]} udløber om 5 dage. Opgrader nu og behold dine data. Vi tilbyder 20% rabat på årsabonnement.`,
      subject: `${product.split(" ")[0]}: Din prøveperiode udløber snart`,
    }),
    () => ({
      content: `IDA Nyhedsbrev: Ledig stilling som projektleder i Aarhus. Nye kurser i ledelse og innovation. Arrangementer i dit lokalområde.`,
      subject: `IDA: Ugentligt nyhedsbrev`,
    }),
    () => ({
      content: `Trustpilot: ${profile.name} har modtaget en ny anmeldelse. Log ind for at se og svare på kundefeedback.`,
      subject: `Trustpilot: Ny anmeldelse af ${profile.name}`,
    }),
  ];

  const t = rng.pick(templates)();
  return {
    sourceType: "email",
    connectorProvider: pickProvider(rng, profile.connectorProviders, p => p.includes("mail") || p.includes("gmail") || p.includes("outlook")),
    content: t.content,
    daysAgo,
    metadata: {
      from: `noreply@${rng.pick(["linkedin.com", "dansk-erhverv.dk", "trustpilot.com", "ida.dk", "eventbrite.dk"])}`,
      to: emp.email,
      subject: t.subject,
    },
  };
}

function marketingEn(rng: SeededRandom, profile: CompanyProfile, daysAgo: number): SyntheticContent {
  const emp = rng.pick(profile.employees);
  const conf = rng.pick(EN_CONFERENCES);
  const product = rng.pick(EN_PRODUCTS);
  const views = rng.int(1, 12);

  const templates: Array<() => { content: string; subject: string }> = [
    () => ({
      content: `Hi ${firstName(emp.name)}, check out our new products this season: ${product}. Order by Friday for 15% off. Visit our website for more.`,
      subject: `Newsletter: ${product.split(" ")[0]} seasonal catalog`,
    }),
    () => ({
      content: `LinkedIn: You have ${views} new profile views this week. See who viewed your profile and new connection suggestions.`,
      subject: `LinkedIn: ${views} new profile views this week`,
    }),
    () => ({
      content: `Invitation: ${conf} — Early bird pricing expires in 7 days. Register now and save $200. Keynote speakers from top industry leaders.`,
      subject: `Invitation: ${conf}`,
    }),
    () => ({
      content: `Business Insider Newsletter: New VAT regulations from July 1, 2026. Read about the changes and what they mean for your business. Plus: Industry survey shows growth in your sector.`,
      subject: `Business Insider: Weekly newsletter`,
    }),
    () => ({
      content: `Hi ${firstName(emp.name)}, your trial for ${product.split(" ")[0]} expires in 5 days. Upgrade now to keep your data. We offer 20% off annual plans.`,
      subject: `${product.split(" ")[0]}: Your trial expires soon`,
    }),
    () => ({
      content: `TechCrunch Digest: Latest funding rounds, startup news, and product launches. This week's top stories curated for you.`,
      subject: `TechCrunch: Weekly digest`,
    }),
    () => ({
      content: `Trustpilot: ${profile.name} has received a new review. Log in to view and respond to customer feedback.`,
      subject: `Trustpilot: New review for ${profile.name}`,
    }),
  ];

  const t = rng.pick(templates)();
  return {
    sourceType: "email",
    connectorProvider: pickProvider(rng, profile.connectorProviders, p => p.includes("mail") || p.includes("gmail") || p.includes("outlook")),
    content: t.content,
    daysAgo,
    metadata: {
      from: `noreply@${rng.pick(["linkedin.com", "businessinsider.com", "trustpilot.com", "techcrunch.com", "eventbrite.com"])}`,
      to: emp.email,
      subject: t.subject,
    },
  };
}

// ── Transactional ───────────────────────────────────────────────────────

function transactionalDa(rng: SeededRandom, profile: CompanyProfile, daysAgo: number): SyntheticContent {
  const ext = rng.pick(profile.externalContacts);
  const emp = rng.pick(profile.employees);
  const amount = rng.int(500, 150000);
  const invNum = rng.int(1000, 9999);
  const count = rng.int(3, 25);
  const period = rng.pick(["Q1 2026", "januar 2026", "februar 2026", "marts 2026"]);

  const templates: Array<() => { content: string; subject: string }> = [
    () => ({
      content: `Betaling modtaget: ${amount.toLocaleString("da-DK")} DKK fra ${ext.company}. Faktura ${invNum} er nu markeret som betalt.`,
      subject: `Betaling modtaget: ${amount.toLocaleString("da-DK")} DKK`,
    }),
    () => ({
      content: `e-conomic: Bankudtog importeret — ${count} nye posteringer fundet. ${rng.int(1, 5)} posteringer kræver manuel afstemning.`,
      subject: `e-conomic: Bankudtog importeret`,
    }),
    () => ({
      content: `Stripe: Payment of ${(amount / 7.45).toFixed(2)} EUR succeeded for ${ext.company}. Transaction ID: ch_${rng.int(100000, 999999)}.`,
      subject: `Stripe: Payment succeeded`,
    }),
    () => ({
      content: `SKAT: Momsindberetning for ${period} er modtaget. Beløb: ${amount.toLocaleString("da-DK")} DKK. Frist for næste indberetning: 1. juli 2026.`,
      subject: `SKAT: Momsindberetning modtaget`,
    }),
    () => ({
      content: `Faktura #${invNum} fra EL-Grossisten Nord er modtaget. Beløb: ${amount.toLocaleString("da-DK")} DKK excl. moms. Betalingsfrist: 30 dage.`,
      subject: `Ny faktura fra EL-Grossisten Nord`,
    }),
    () => ({
      content: `MobilePay Business: ${rng.int(2, 8)} nye betalinger i dag. Samlet: ${rng.int(500, 5000).toLocaleString("da-DK")} DKK. Se detaljer i din MobilePay Business-konto.`,
      subject: `MobilePay: Daglig oversigt`,
    }),
    () => ({
      content: `Nets: Din abonnementsbetaling på ${rng.int(99, 999)} DKK for ${rng.pick(DA_PRODUCTS.map(p => p.split(" ")[0]))} er gennemført.`,
      subject: `Nets: Abonnementsbetaling gennemført`,
    }),
  ];

  const t = rng.pick(templates)();
  return {
    sourceType: "email",
    connectorProvider: pickProvider(rng, profile.connectorProviders, p => p.includes("mail") || p.includes("gmail") || p.includes("outlook") || p === "e-conomic"),
    content: t.content,
    daysAgo,
    metadata: {
      from: `noreply@${rng.pick(["e-conomic.dk", "stripe.com", "skat.dk", "nets.dk", "mobilepay.dk"])}`,
      to: emp.email,
      subject: t.subject,
    },
  };
}

function transactionalEn(rng: SeededRandom, profile: CompanyProfile, daysAgo: number): SyntheticContent {
  const ext = rng.pick(profile.externalContacts);
  const emp = rng.pick(profile.employees);
  const amount = rng.int(50, 15000);
  const invNum = rng.int(1000, 9999);
  const count = rng.int(3, 25);
  const period = rng.pick(["Q1 2026", "January 2026", "February 2026", "March 2026"]);

  const templates: Array<() => { content: string; subject: string }> = [
    () => ({
      content: `Payment received: $${amount.toLocaleString("en-US")} from ${ext.company}. Invoice ${invNum} has been marked as paid.`,
      subject: `Payment received: $${amount.toLocaleString("en-US")}`,
    }),
    () => ({
      content: `Xero: Bank feed imported — ${count} new transactions found. ${rng.int(1, 5)} transactions require manual reconciliation.`,
      subject: `Xero: Bank feed imported`,
    }),
    () => ({
      content: `Stripe: Payment of $${amount.toFixed(2)} succeeded for ${ext.company}. Transaction ID: ch_${rng.int(100000, 999999)}.`,
      subject: `Stripe: Payment succeeded`,
    }),
    () => ({
      content: `HMRC: VAT return for ${period} has been received. Amount: £${amount.toLocaleString("en-GB")}. Next deadline: 1 July 2026.`,
      subject: `HMRC: VAT return received`,
    }),
    () => ({
      content: `Invoice #${invNum} from ${ext.company} has been received. Amount: $${amount.toLocaleString("en-US")} excl. tax. Payment due: 30 days.`,
      subject: `New invoice from ${ext.company}`,
    }),
    () => ({
      content: `PayPal: ${rng.int(2, 8)} new payments today. Total: $${rng.int(50, 5000).toLocaleString("en-US")}. See details in your PayPal Business account.`,
      subject: `PayPal: Daily summary`,
    }),
    () => ({
      content: `Your subscription payment of $${rng.int(9, 299)} for ${rng.pick(EN_PRODUCTS.map(p => p.split(" ")[0]))} has been processed.`,
      subject: `Subscription payment processed`,
    }),
  ];

  const t = rng.pick(templates)();
  return {
    sourceType: "email",
    connectorProvider: pickProvider(rng, profile.connectorProviders, p => p.includes("mail") || p.includes("gmail") || p.includes("outlook")),
    content: t.content,
    daysAgo,
    metadata: {
      from: `noreply@${rng.pick(["xero.com", "stripe.com", "hmrc.gov.uk", "paypal.com"])}`,
      to: emp.email,
      subject: t.subject,
    },
  };
}

// ── Calendar auto ───────────────────────────────────────────────────────

function calendarAutoDa(rng: SeededRandom, profile: CompanyProfile, daysAgo: number): SyntheticContent {
  const emp = rng.pick(profile.employees);
  const other = rng.pick(profile.employees.filter(e => e.email !== emp.email) || profile.employees);
  const meeting = rng.pick(DA_MEETING_TITLES);
  const rooms = ["Mødelokale 1", "Mødelokale 2", "Konferencerummet", "Lars' kontor", "Kantinen"];

  const templates: Array<() => { content: string; title: string }> = [
    () => ({
      content: `${other.name} har afslået '${meeting}' med besked: "Kan desværre ikke den dag, kan vi rykke til torsdag?"`,
      title: `Afslået: ${meeting}`,
    }),
    () => ({
      content: `Påmindelse: '${meeting}' starter om 15 minutter. Lokale: ${rng.pick(rooms)}.`,
      title: `Påmindelse: ${meeting}`,
    }),
    () => ({
      content: `${rng.pick(rooms)} er booket til '${meeting}' kl. ${rng.int(8, 16)}:${rng.pick(["00", "30"])}. Varighed: ${rng.pick(["30 min", "1 time", "1,5 time"])}.`,
      title: `Lokale booket: ${meeting}`,
    }),
    () => ({
      content: `${other.name} har accepteret din invitation til '${meeting}'. Alle ${rng.int(2, 5)} deltagere har nu svaret.`,
      title: `Accepteret: ${meeting}`,
    }),
    () => ({
      content: `Kalender: '${meeting}' er blevet aflyst af ${other.name}. Begrundelse: "Flyttet til næste uge."`,
      title: `Aflyst: ${meeting}`,
    }),
    () => ({
      content: `${other.name} foreslog nyt tidspunkt for '${meeting}': ${rng.pick(["mandag", "tirsdag", "onsdag", "torsdag", "fredag"])} kl. ${rng.int(8, 16)}:${rng.pick(["00", "30"])}.`,
      title: `Nyt tidspunkt foreslået: ${meeting}`,
    }),
  ];

  const t = rng.pick(templates)();
  const attendees = rng.shuffle(profile.employees).slice(0, rng.int(2, Math.min(5, profile.employees.length))).map(e => e.email);
  return {
    sourceType: "calendar_note",
    connectorProvider: pickProvider(rng, profile.connectorProviders, p => p.includes("calendar")),
    content: t.content,
    daysAgo,
    metadata: {
      title: t.title,
      attendees,
    },
  };
}

function calendarAutoEn(rng: SeededRandom, profile: CompanyProfile, daysAgo: number): SyntheticContent {
  const emp = rng.pick(profile.employees);
  const other = rng.pick(profile.employees.filter(e => e.email !== emp.email) || profile.employees);
  const meeting = rng.pick(EN_MEETING_TITLES);
  const rooms = ["Meeting Room 1", "Meeting Room 2", "Conference Room", "Board Room", "The Lounge"];

  const templates: Array<() => { content: string; title: string }> = [
    () => ({
      content: `${other.name} declined '${meeting}' with message: "Sorry, can't make that day. Can we move to Thursday?"`,
      title: `Declined: ${meeting}`,
    }),
    () => ({
      content: `Reminder: '${meeting}' starts in 15 minutes. Room: ${rng.pick(rooms)}.`,
      title: `Reminder: ${meeting}`,
    }),
    () => ({
      content: `${rng.pick(rooms)} has been booked for '${meeting}' at ${rng.int(8, 16)}:${rng.pick(["00", "30"])}. Duration: ${rng.pick(["30 min", "1 hour", "1.5 hours"])}.`,
      title: `Room booked: ${meeting}`,
    }),
    () => ({
      content: `${other.name} accepted your invitation to '${meeting}'. All ${rng.int(2, 5)} attendees have now responded.`,
      title: `Accepted: ${meeting}`,
    }),
    () => ({
      content: `Calendar: '${meeting}' has been cancelled by ${other.name}. Reason: "Moved to next week."`,
      title: `Cancelled: ${meeting}`,
    }),
    () => ({
      content: `${other.name} proposed a new time for '${meeting}': ${rng.pick(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])} at ${rng.int(8, 16)}:${rng.pick(["00", "30"])}.`,
      title: `New time proposed: ${meeting}`,
    }),
  ];

  const t = rng.pick(templates)();
  const attendees = rng.shuffle(profile.employees).slice(0, rng.int(2, Math.min(5, profile.employees.length))).map(e => e.email);
  return {
    sourceType: "calendar_note",
    connectorProvider: pickProvider(rng, profile.connectorProviders, p => p.includes("calendar")),
    content: t.content,
    daysAgo,
    metadata: {
      title: t.title,
      attendees,
    },
  };
}

// ── Internal chatter ────────────────────────────────────────────────────

function internalChatterDa(rng: SeededRandom, profile: CompanyProfile, daysAgo: number): SyntheticContent {
  const emp = rng.pick(profile.employees);
  const other = rng.pick(profile.employees.filter(e => e.email !== emp.email) || profile.employees);
  const restaurant = rng.pick(DA_RESTAURANTS);
  const channel = rng.pick(DA_CHANNELS);
  const task = rng.pick(DA_TASKS);

  const templates: Array<() => string> = [
    () => `Tillykke med fødselsdagen ${other.name}! 🎂🎉`,
    () => `Nogen der vil med til frokost i dag? Tænker ${restaurant} 🍴`,
    () => `Fredagsbar kl 15 — ${other.name} har købt øl 🍺`,
    () => `Standup for i dag: ${firstName(emp.name)} arbejder på ${task}, ${firstName(other.name)} fortsætter med ${rng.pick(DA_TASKS)}`,
    () => `Nogen der har set min ladekabel? Tror jeg glemte den i ${rng.pick(["mødelokalet", "kantinen", "køkkenet"])} i går`,
    () => `God weekend alle! 🎉 Husk vi starter kl 8 på mandag pga. kundemøde`,
    () => `${firstName(other.name)} deler link: "Sjov artikel om ${profile.name.split(" ")[0]}-branchen" 📎`,
    () => `Kaffemaskinen er i stykker igen... ${firstName(other.name)} har bestilt en tekniker til i morgen`,
    () => `Hej alle, der er kage i køkkenet! ${firstName(emp.name)} har fødselsdag i morgen 🎂`,
    () => `Parkering: Gaden bliver asfalteret torsdag. Park i sidegaden i stedet`,
  ];

  return {
    sourceType: "slack_message",
    connectorProvider: pickProvider(rng, profile.connectorProviders, p => p.includes("slack") || p.includes("teams")),
    content: rng.pick(templates)(),
    daysAgo,
    metadata: {
      channel,
      authorEmail: emp.email,
    },
  };
}

function internalChatterEn(rng: SeededRandom, profile: CompanyProfile, daysAgo: number): SyntheticContent {
  const emp = rng.pick(profile.employees);
  const other = rng.pick(profile.employees.filter(e => e.email !== emp.email) || profile.employees);
  const restaurant = rng.pick(EN_RESTAURANTS);
  const channel = rng.pick(EN_CHANNELS);
  const task = rng.pick(EN_TASKS);

  const templates: Array<() => string> = [
    () => `Happy birthday ${other.name}! 🎂🎉`,
    () => `Anyone up for lunch? Thinking ${restaurant} 🍴`,
    () => `Friday drinks at 3pm — ${other.name} is buying 🍺`,
    () => `Standup for today: ${firstName(emp.name)} working on ${task}, ${firstName(other.name)} continuing with ${rng.pick(EN_TASKS)}`,
    () => `Has anyone seen my charger? Think I left it in the ${rng.pick(["meeting room", "kitchen", "lounge"])} yesterday`,
    () => `Happy weekend everyone! 🎉 Remember we start at 8am Monday due to client meeting`,
    () => `${firstName(other.name)} shared a link: "Interesting read about the ${profile.name.split(" ")[0]} industry" 📎`,
    () => `Coffee machine is broken again... ${firstName(other.name)} called a technician for tomorrow`,
    () => `Hey all, cake in the kitchen! ${firstName(emp.name)} has a birthday tomorrow 🎂`,
    () => `Parking: The street is being resurfaced Thursday. Park in the side street instead`,
  ];

  return {
    sourceType: "slack_message",
    connectorProvider: pickProvider(rng, profile.connectorProviders, p => p.includes("slack") || p.includes("teams")),
    content: rng.pick(templates)(),
    daysAgo,
    metadata: {
      channel,
      authorEmail: emp.email,
    },
  };
}

// ── Main entry point ────────────────────────────────────────────────────

function pickGenerator(locale: "da" | "en", category: string): TemplateGenerator {
  if (locale === "da") {
    switch (category) {
      case "systemNotifications": return systemNotificationsDa;
      case "autoReplies": return autoRepliesDa;
      case "marketingNewsletters": return marketingDa;
      case "transactional": return transactionalDa;
      case "calendarAuto": return calendarAutoDa;
      case "internalChatter": return internalChatterDa;
      default: return systemNotificationsDa;
    }
  }
  switch (category) {
    case "systemNotifications": return systemNotificationsEn;
    case "autoReplies": return autoRepliesEn;
    case "marketingNewsletters": return marketingEn;
    case "transactional": return transactionalEn;
    case "calendarAuto": return calendarAutoEn;
    case "internalChatter": return internalChatterEn;
    default: return systemNotificationsEn;
  }
}

export function generateClutter(
  profile: CompanyProfile,
  config: ClutterConfig,
): SyntheticContent[] {
  const rng = new SeededRandom(seedFromString(profile.domain));
  const results: SyntheticContent[] = [];
  const seen = new Set<string>();

  const categories: Array<{ key: keyof ClutterConfig; name: string }> = [
    { key: "systemNotifications", name: "systemNotifications" },
    { key: "autoReplies", name: "autoReplies" },
    { key: "marketingNewsletters", name: "marketingNewsletters" },
    { key: "transactional", name: "transactional" },
    { key: "calendarAuto", name: "calendarAuto" },
    { key: "internalChatter", name: "internalChatter" },
  ];

  for (const cat of categories) {
    const target = config[cat.key];
    // ±10% variance
    const variance = Math.max(1, Math.round(target * 0.1));
    const count = target + rng.int(-variance, variance);
    const days = distributeDaysAgo(rng, count);
    const gen = pickGenerator(profile.locale, cat.name);

    for (let i = 0; i < count; i++) {
      let item = gen(rng, profile, days[i]);
      // Ensure unique content — retry with extra RNG calls if collision
      let attempts = 0;
      while (seen.has(item.content) && attempts < 5) {
        rng.next(); // advance state
        item = gen(rng, profile, days[i]);
        attempts++;
      }
      // If still colliding, append a subtle differentiator
      if (seen.has(item.content)) {
        item = { ...item, content: `${item.content} [${rng.int(1000, 9999)}]` };
      }
      seen.add(item.content);
      results.push(item);
    }
  }

  return results;
}
