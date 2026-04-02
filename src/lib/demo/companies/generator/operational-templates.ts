// ── Operational Content Generator ───────────────────────────────────────
// Produces realistic operational content (ERP orders, batches, shipments,
// Slack ops messages, routine emails, expenses, calendar events) that
// fills out a synthetic company's day-to-day business data. All content
// is in Danish. Deterministic via seeded PRNG.

import type { SyntheticContent } from "../../synthetic-types";
import type { CompanyProfile } from "./types";

// ── Seeded PRNG (LCG) ──────────────────────────────────────────────────
// Same implementation as clutter-templates — deterministic given seed.

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed % 2147483647;
    if (this.state <= 0) this.state += 2147483646;
  }

  next(): number {
    this.state = (this.state * 16807) % 2147483647;
    return (this.state - 1) / 2147483646;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  pickWeighted<T>(items: T[], weights: number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  shuffle<T>(arr: T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Pick N unique items from array (or fewer if array is smaller). */
  pickN<T>(arr: T[], n: number): T[] {
    return this.shuffle(arr).slice(0, Math.min(n, arr.length));
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

/** Returns ISO date string for N days ago. */
function daysAgoDate(d: number): string {
  const date = new Date();
  date.setDate(date.getDate() - d);
  return date.toISOString().slice(0, 10);
}

/** Returns true if the given daysAgo falls on a weekend. */
function isWeekend(daysAgo: number): boolean {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Distribute `count` items evenly across 0..maxDays, skipping weekends.
 * Returns an array of daysAgo values.
 */
function distributeWeekdays(rng: SeededRandom, count: number, maxDays: number): number[] {
  // Collect all weekdays in the window
  const weekdays: number[] = [];
  for (let d = 0; d < maxDays; d++) {
    if (!isWeekend(d)) weekdays.push(d);
  }
  if (weekdays.length === 0) return Array(count).fill(0);

  const days: number[] = [];
  for (let i = 0; i < count; i++) {
    // Even distribution with slight jitter
    const baseIdx = Math.floor((i / count) * weekdays.length);
    const jitter = rng.int(-2, 2);
    const idx = Math.max(0, Math.min(weekdays.length - 1, baseIdx + jitter));
    days.push(weekdays[idx]);
  }
  return days;
}

function firstName(fullName: string): string {
  return fullName.split(" ")[0];
}

// ── Config interfaces ──────────────────────────────────────────────────

export interface TracezillaOrderConfig {
  count: number;
  customers: string[];
  products: Array<{ name: string; unit: string; priceRange: [number, number] }>;
  daysBack: number;
}

export interface TracezillaBatchConfig {
  count: number;
  products: Array<{ name: string; batchPrefix: string }>;
  suppliers: Array<{ name: string; lotPrefix: string }>;
  daysBack: number;
}

export interface ShipmondoConfig {
  count: number;
  origin: string;
  destinations: string[];
  carriers: string[];
  daysBack: number;
}

export interface SlackOpsConfig {
  count: number;
  channels: Array<{
    name: string;
    templates: string[];
  }>;
  daysBack: number;
}

export interface RoutineEmailConfig {
  count: number;
  daysBack: number;
}

export interface PleoExpenseConfig {
  count: number;
  categories: Array<{ name: string; amountRange: [number, number] }>;
  daysBack: number;
}

export interface CalendarOpsConfig {
  count: number;
  recurringMeetings: Array<{
    title: string;
    dayOfWeek: number; // 0=Sun, 1=Mon, ... 6=Sat
    hour: number;
    durationMin: number;
    attendeeRoles: string[];
  }>;
  daysBack: number;
}

export interface OperationalConfig {
  tracezillaOrders: TracezillaOrderConfig;
  tracezillaBatches: TracezillaBatchConfig;
  shipmondo: ShipmondoConfig;
  slackOps: SlackOpsConfig;
  routineEmails: RoutineEmailConfig;
  pleoExpenses: PleoExpenseConfig;
  calendarOps: CalendarOpsConfig;
}

// ── Sub-generators ─────────────────────────────────────────────────────

function generateTracezillaOrders(
  rng: SeededRandom,
  profile: CompanyProfile,
  config: TracezillaOrderConfig,
): SyntheticContent[] {
  const results: SyntheticContent[] = [];
  const days = distributeWeekdays(rng, config.count, config.daysBack);
  const statuses = ["Leveret", "Bekræftet", "Under behandling", "Kladde"];
  const statusWeights = [60, 25, 10, 5];

  for (let i = 0; i < config.count; i++) {
    const soNum = 4800 + i;
    const customer = rng.pick(config.customers);
    const status = rng.pickWeighted(statuses, statusWeights);
    const lineCount = rng.int(2, 4);
    const daysAgo = days[i];
    const deliveryDaysAgo = Math.max(0, daysAgo - rng.int(1, 5));

    // Build line items
    const lines: string[] = [];
    const selectedProducts = rng.pickN(config.products, lineCount);
    for (const prod of selectedProducts) {
      const qty = rng.int(10, 500);
      const price = rng.int(prod.priceRange[0], prod.priceRange[1]);
      lines.push(`${qty} ${prod.unit} ${prod.name} @ ${price} DKK`);
    }

    const content = [
      `Salgsordre SO-${soNum} — ${customer}.`,
      lines.join(". ") + ".",
      `Levering ${daysAgoDate(deliveryDaysAgo)}.`,
      `Status: ${status}.`,
    ].join(" ");

    results.push({
      sourceType: "erp_order",
      connectorProvider: "tracezilla",
      content,
      daysAgo,
      metadata: {
        orderNumber: `SO-${soNum}`,
        customer,
        status,
        lineItems: selectedProducts.length,
        deliveryDate: daysAgoDate(deliveryDaysAgo),
      },
    });
  }

  return results;
}

function generateTracezillaBatches(
  rng: SeededRandom,
  _profile: CompanyProfile,
  config: TracezillaBatchConfig,
): SyntheticContent[] {
  const results: SyntheticContent[] = [];
  const days = distributeWeekdays(rng, config.count, config.daysBack);
  const qaStatuses = ["Godkendt", "Under inspektion", "Afvist"];
  const qaWeights = [95, 4, 1];

  for (let i = 0; i < config.count; i++) {
    const product = rng.pick(config.products);
    const supplier = rng.pick(config.suppliers);
    const batchNum = `2026-${product.batchPrefix}${String(i + 1).padStart(3, "0")}`;
    const qty = rng.int(50, 2000);
    const lotNum = `${supplier.lotPrefix}-2026-${String(rng.int(1, 99)).padStart(2, "0")}`;
    const qa = rng.pickWeighted(qaStatuses, qaWeights);
    const daysAgo = days[i];

    const content = `Batch ${batchNum} — ${product.name}. ${qty} stk. Ramelk: ${supplier.name} lot ${lotNum}. QA: ${qa}.`;

    results.push({
      sourceType: "erp_order",
      connectorProvider: "tracezilla",
      content,
      daysAgo,
      metadata: {
        batchNumber: batchNum,
        product: product.name,
        quantity: qty,
        supplier: supplier.name,
        lotNumber: lotNum,
        qaStatus: qa,
      },
    });
  }

  return results;
}

function generateShipmondoShipments(
  rng: SeededRandom,
  _profile: CompanyProfile,
  config: ShipmondoConfig,
): SyntheticContent[] {
  const results: SyntheticContent[] = [];
  const days = distributeWeekdays(rng, config.count, config.daysBack);
  const statuses = ["Leveret", "Planlagt", "Under transport", "Klargjort"];
  const statusWeights = [70, 15, 10, 5];

  for (let i = 0; i < config.count; i++) {
    const shpNum = 8800 + i;
    const dest = rng.pick(config.destinations);
    const carrier = rng.pick(config.carriers);
    const pallets = rng.int(1, 8);
    const status = rng.pickWeighted(statuses, statusWeights);
    const daysAgo = days[i];

    const content = `Forsendelse SHP-${shpNum} — ${config.origin} \u2192 ${dest}. ${carrier}. ${pallets} paller. -18\u00B0C. Status: ${status}.`;

    results.push({
      sourceType: "shipment",
      connectorProvider: "shipmondo",
      content,
      daysAgo,
      metadata: {
        shipmentNumber: `SHP-${shpNum}`,
        origin: config.origin,
        destination: dest,
        carrier,
        pallets,
        temperature: "-18\u00B0C",
        status,
      },
    });
  }

  return results;
}

function generateSlackOps(
  rng: SeededRandom,
  profile: CompanyProfile,
  config: SlackOpsConfig,
): SyntheticContent[] {
  const results: SyntheticContent[] = [];
  const days = distributeWeekdays(rng, config.count, config.daysBack);

  // Build per-channel template pools with placeholder substitution
  const channelPool = config.channels.flatMap((ch) =>
    ch.templates.map((t) => ({ channel: ch.name, template: t })),
  );

  for (let i = 0; i < config.count; i++) {
    const entry = rng.pick(channelPool);
    const emp = rng.pick(profile.employees);
    const daysAgo = days[i];
    const hour = rng.int(6, 18);
    const minute = rng.pick(["00", "15", "30", "45"]);

    // Substitute placeholders in template
    const content = entry.template
      .replace(/\{employee\}/g, firstName(emp.name))
      .replace(/\{time\}/g, `${hour}:${minute}`)
      .replace(/\{num\}/g, String(rng.int(1, 999)))
      .replace(/\{pct\}/g, String(rng.int(80, 100)))
      .replace(/\{temp\}/g, String(rng.int(-22, -16)))
      .replace(/\{date\}/g, daysAgoDate(daysAgo));

    results.push({
      sourceType: "slack_message",
      connectorProvider: "slack",
      content,
      daysAgo,
      metadata: {
        channel: entry.channel,
        authorEmail: emp.email,
        authorName: firstName(emp.name),
      },
    });
  }

  return results;
}

// ── Routine email templates ─────────────────────────────────────────────

const ROUTINE_EMAIL_TEMPLATES = {
  supplierConfirmation: (rng: SeededRandom, profile: CompanyProfile) => {
    const ext = rng.pick(profile.externalContacts);
    const emp = rng.pick(profile.employees);
    const qty = rng.int(100, 5000);
    const product = rng.pick(["ramelk", "floede", "sukker", "vaniljeekstrakt", "chokoladecouverture", "emballage"]);
    const weekNum = rng.int(14, 26);
    return {
      content: `Hej ${firstName(emp.name)}, hermed bekraeftelse pa bestilling af ${qty} kg ${product}. Forventet levering uge ${weekNum}. Faktura folger ved afsendelse. Venlig hilsen, ${ext.name}, ${ext.company}`,
      from: ext.email,
      to: emp.email,
      subject: `Ordrebekraeftelse — ${qty} kg ${product}`,
    };
  },
  deliveryAck: (rng: SeededRandom, profile: CompanyProfile) => {
    const ext = rng.pick(profile.externalContacts);
    const emp = rng.pick(profile.employees);
    const orderNum = rng.int(4800, 5200);
    return {
      content: `Kare ${firstName(emp.name)}, vi bekraefter modtagelse af leverance SO-${orderNum}. Alt modtaget i god stand. Tak for hurtig levering. Med venlig hilsen, ${ext.name}`,
      from: ext.email,
      to: emp.email,
      subject: `Leverance modtaget — SO-${orderNum}`,
    };
  },
  weeklyStatus: (rng: SeededRandom, profile: CompanyProfile) => {
    const emp = rng.pick(profile.employees);
    const other = rng.pick(profile.employees.filter((e) => e.email !== emp.email));
    const ordersShipped = rng.int(15, 45);
    const batchesProduced = rng.int(8, 25);
    const complaints = rng.int(0, 3);
    return {
      content: `Ugentlig status: ${ordersShipped} ordrer afsendt, ${batchesProduced} batches produceret, ${complaints} reklamationer. Lagerbeholdning er stabil. Ingen kritiske forsinkelser. /${firstName(emp.name)}`,
      from: emp.email,
      to: other?.email ?? emp.email,
      subject: `Ugens status — uge ${rng.int(14, 26)}`,
    };
  },
  meetingFollowUp: (rng: SeededRandom, profile: CompanyProfile) => {
    const emp = rng.pick(profile.employees);
    const other = rng.pick(profile.employees.filter((e) => e.email !== emp.email));
    const topic = rng.pick([
      "produktionsplanlaegning", "kvalitetsgennemgang", "salgsmoede",
      "budgetopfoelgning", "leverandoermoede", "logistikmoede",
    ]);
    const actionCount = rng.int(2, 5);
    return {
      content: `Hej alle, referat fra ${topic}. ${actionCount} handlingspunkter aftalt. Se vedhaeftede referat for detaljer. Naeste moede er fastsat. Vh ${firstName(emp.name)}`,
      from: emp.email,
      to: other?.email ?? emp.email,
      subject: `Referat: ${topic}`,
    };
  },
  paymentProcessing: (rng: SeededRandom, profile: CompanyProfile) => {
    const ext = rng.pick(profile.externalContacts);
    const emp = rng.pick(profile.employees);
    const invNum = rng.int(10000, 99999);
    const amount = rng.int(5000, 250000);
    return {
      content: `Kare ${firstName(emp.name)}, betaling af faktura ${invNum} pa ${amount.toLocaleString("da-DK")} DKK er modtaget. Tak. Venlig hilsen, ${ext.name}, ${ext.company}`,
      from: ext.email,
      to: emp.email,
      subject: `Betaling modtaget — faktura ${invNum}`,
    };
  },
  deliverySchedule: (rng: SeededRandom, profile: CompanyProfile) => {
    const emp = rng.pick(profile.employees);
    const ext = rng.pick(profile.externalContacts);
    const pallets = rng.int(2, 12);
    const deliveryDay = rng.pick(["mandag", "tirsdag", "onsdag", "torsdag", "fredag"]);
    return {
      content: `Hej ${ext.name}, leverance pa ${pallets} paller er planlagt til ${deliveryDay}. Ankomsttid ca. kl. ${rng.int(6, 14)}:${rng.pick(["00", "30"])}. Ring hvis der er aendringer. Vh ${firstName(emp.name)}, ${profile.name}`,
      from: emp.email,
      to: ext.email,
      subject: `Leveranceplan — ${pallets} paller ${deliveryDay}`,
    };
  },
  priceListUpdate: (rng: SeededRandom, profile: CompanyProfile) => {
    const emp = rng.pick(profile.employees);
    const ext = rng.pick(profile.externalContacts);
    const season = rng.pick(["sommer 2026", "efterar 2026", "Q3 2026"]);
    return {
      content: `Kare ${ext.name}, vedlagt opdateret prisliste for ${season}. Prisaendringer traeder i kraft 1. ${rng.pick(["maj", "juni", "juli", "august"])}. Kontakt mig ved sporgsmal. Venlig hilsen, ${firstName(emp.name)}`,
      from: emp.email,
      to: ext.email,
      subject: `Opdateret prisliste — ${season}`,
    };
  },
  qualityReport: (rng: SeededRandom, profile: CompanyProfile) => {
    const emp = rng.pick(profile.employees);
    const other = rng.pick(profile.employees.filter((e) => e.email !== emp.email));
    const batchCount = rng.int(5, 20);
    const passRate = rng.int(95, 100);
    return {
      content: `Kvalitetsrapport uge ${rng.int(14, 26)}: ${batchCount} batches testet, ${passRate}% godkendt. Alle temperaturlogs inden for graensevaerdier. Naeste audit planlagt til ${daysAgoDate(rng.int(0, 7))}. /${firstName(emp.name)}`,
      from: emp.email,
      to: other?.email ?? emp.email,
      subject: `Kvalitetsrapport — uge ${rng.int(14, 26)}`,
    };
  },
};

function generateRoutineEmails(
  rng: SeededRandom,
  profile: CompanyProfile,
  config: RoutineEmailConfig,
): SyntheticContent[] {
  const results: SyntheticContent[] = [];
  const days = distributeWeekdays(rng, config.count, config.daysBack);
  const templateFns = Object.values(ROUTINE_EMAIL_TEMPLATES);

  for (let i = 0; i < config.count; i++) {
    const templateFn = rng.pick(templateFns);
    const { content, from, to, subject } = templateFn(rng, profile);
    const daysAgo = days[i];

    results.push({
      sourceType: "email",
      connectorProvider: "gmail",
      content,
      daysAgo,
      metadata: {
        from,
        to,
        subject,
        date: daysAgoDate(daysAgo),
      },
    });
  }

  return results;
}

function generatePleoExpenses(
  rng: SeededRandom,
  profile: CompanyProfile,
  config: PleoExpenseConfig,
): SyntheticContent[] {
  const results: SyntheticContent[] = [];
  const days = distributeWeekdays(rng, config.count, config.daysBack);

  for (let i = 0; i < config.count; i++) {
    const category = rng.pick(config.categories);
    const emp = rng.pick(profile.employees);
    const amount = rng.int(category.amountRange[0], category.amountRange[1]);
    const daysAgo = days[i];

    const content = `Udlaeg: ${category.name}. ${emp.name}. ${amount.toLocaleString("da-DK")} DKK.`;

    results.push({
      sourceType: "expense",
      connectorProvider: "pleo",
      content,
      daysAgo,
      metadata: {
        employee: emp.name,
        employeeEmail: emp.email,
        category: category.name,
        amount,
        currency: "DKK",
        date: daysAgoDate(daysAgo),
      },
    });
  }

  return results;
}

function generateCalendarOps(
  rng: SeededRandom,
  profile: CompanyProfile,
  config: CalendarOpsConfig,
): SyntheticContent[] {
  const results: SyntheticContent[] = [];

  // Expand recurring meetings over the daysBack window
  for (const meeting of config.recurringMeetings) {
    for (let d = 0; d < config.daysBack; d++) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      if (date.getDay() !== meeting.dayOfWeek) continue;

      // Resolve attendees from employee roles
      const attendees = profile.employees
        .filter((e) => meeting.attendeeRoles.includes(e.role))
        .map((e) => e.email);

      // If no employees match the roles, pick a few random ones
      const finalAttendees =
        attendees.length > 0
          ? attendees
          : rng.pickN(profile.employees, rng.int(2, 5)).map((e) => e.email);

      const endHour = meeting.hour + Math.floor(meeting.durationMin / 60);
      const endMin = meeting.durationMin % 60;
      const timeStr = `${String(meeting.hour).padStart(2, "0")}:00-${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`;

      const content = `${meeting.title} — ${daysAgoDate(d)} kl. ${timeStr}. Deltagere: ${finalAttendees.length}. Varighed: ${meeting.durationMin} min.`;

      results.push({
        sourceType: "calendar_note",
        connectorProvider: "google-calendar",
        content,
        daysAgo: d,
        metadata: {
          title: meeting.title,
          date: daysAgoDate(d),
          time: timeStr,
          durationMin: meeting.durationMin,
          attendees: finalAttendees,
        },
      });
    }
  }

  // If we need more items to reach the target count, add ad-hoc meetings
  const adHocTitles = [
    "Akut driftsmoede",
    "Leverandoeropfoelgning",
    "Kampagneplanlaegning",
    "Kvalitetsaudit forberedelse",
    "Ny kunde-introduktion",
    "Saeson-planlaegning",
    "Maskinvedligehold gennemgang",
    "Lager-optimering",
  ];

  const remaining = Math.max(0, config.count - results.length);
  const adHocDays = distributeWeekdays(rng, remaining, config.daysBack);

  for (let i = 0; i < remaining; i++) {
    const title = rng.pick(adHocTitles);
    const hour = rng.int(8, 16);
    const duration = rng.pick([30, 45, 60, 90]);
    const attendeeCount = rng.int(2, Math.min(6, profile.employees.length));
    const attendees = rng.pickN(profile.employees, attendeeCount).map((e) => e.email);
    const daysAgo = adHocDays[i];

    const endHour = hour + Math.floor(duration / 60);
    const endMin = duration % 60;
    const timeStr = `${String(hour).padStart(2, "0")}:00-${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`;

    const content = `${title} — ${daysAgoDate(daysAgo)} kl. ${timeStr}. Deltagere: ${attendees.length}. Varighed: ${duration} min.`;

    results.push({
      sourceType: "calendar_note",
      connectorProvider: "google-calendar",
      content,
      daysAgo,
      metadata: {
        title,
        date: daysAgoDate(daysAgo),
        time: timeStr,
        durationMin: duration,
        attendees,
      },
    });
  }

  return results;
}

// ── Main entry point ───────────────────────────────────────────────────

export function generateOperationalContent(
  profile: CompanyProfile,
  config: OperationalConfig,
): SyntheticContent[] {
  // Use a different seed offset than clutter to avoid correlation
  const rng = new SeededRandom(seedFromString(profile.domain + ":ops"));
  const seen = new Set<string>();

  const allResults: SyntheticContent[] = [];

  // Run all 7 sub-generators
  const batches = [
    generateTracezillaOrders(rng, profile, config.tracezillaOrders),
    generateTracezillaBatches(rng, profile, config.tracezillaBatches),
    generateShipmondoShipments(rng, profile, config.shipmondo),
    generateSlackOps(rng, profile, config.slackOps),
    generateRoutineEmails(rng, profile, config.routineEmails),
    generatePleoExpenses(rng, profile, config.pleoExpenses),
    generateCalendarOps(rng, profile, config.calendarOps),
  ];

  for (const batch of batches) {
    for (const item of batch) {
      // Deduplicate by content string
      if (seen.has(item.content)) {
        const deduped = { ...item, content: `${item.content} [${rng.int(1000, 9999)}]` };
        seen.add(deduped.content);
        allResults.push(deduped);
      } else {
        seen.add(item.content);
        allResults.push(item);
      }
    }
  }

  return allResults;
}
