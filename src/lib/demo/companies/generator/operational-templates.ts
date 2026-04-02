// ── Operational Content Generator ───────────────────────────────────────
// Produces realistic operational content (ERP orders, batches, shipments,
// Slack ops messages, routine emails, expenses, calendar events) that
// fills out a synthetic company's day-to-day business data. All content
// is in Danish. Deterministic via seeded PRNG.

import type { SyntheticContent } from "../../synthetic-types";
import type { CompanyProfile } from "./types";

// ── Seeded PRNG (LCG) ──────────────────────────────────────────────────

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

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  pickWeighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  pickN<T>(arr: readonly T[], n: number): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out.slice(0, Math.min(n, arr.length));
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

function daysAgoDate(d: number): string {
  const date = new Date();
  date.setDate(date.getDate() - d);
  return date.toISOString().slice(0, 10);
}

function isWeekend(daysAgo: number): boolean {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const day = date.getDay();
  return day === 0 || day === 6;
}

function distributeWeekdays(rng: SeededRandom, count: number, maxDays: number): number[] {
  const weekdays: number[] = [];
  for (let d = 0; d < maxDays; d++) {
    if (!isWeekend(d)) weekdays.push(d);
  }
  if (weekdays.length === 0) return Array(count).fill(0);
  const days: number[] = [];
  for (let i = 0; i < count; i++) {
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

function frequencyToCount(freq: string, daysBack: number): number {
  const weeks = Math.ceil(daysBack / 7);
  if (freq === "daily") return Math.ceil(daysBack * 5 / 7); // weekdays
  if (freq === "weekly") return weeks;
  if (freq === "biweekly") return Math.ceil(weeks / 2);
  if (freq === "monthly") return Math.ceil(daysBack / 30);
  return 1;
}

// ── Config interfaces (match profile.ts shape) ────────────────────────

export interface TracezillaOrderConfig {
  customers: ReadonlyArray<{ name: string; products: readonly string[]; frequency: string; avgOrderSize: number }>;
  products: ReadonlyArray<{ name: string; sku: string; unit: string; organic: boolean }>;
  daysBack: number;
}

export interface TracezillaBatchConfig {
  products: ReadonlyArray<{ name: string; batchPrefix: string; dailyVolume: number; unit: string }>;
  milkSupplier: { name: string; lotPrefix: string };
  daysBack: number;
}

export interface ShipmondoConfig {
  routes: ReadonlyArray<{ destination: string; carrier: string; frequency: string; palletRange: readonly [number, number] }>;
  ownTruckRoutes: ReadonlyArray<{ name: string; stops: readonly string[]; frequency: string }>;
  daysBack: number;
}

export interface SlackOpsConfig {
  channels: ReadonlyArray<{ name: string; posters: readonly string[]; templateType: string }>;
  daysBack: number;
}

export interface RoutineEmailConfig {
  supplierEmails: ReadonlyArray<{ name: string; email: string; contactName: string; topic: string }>;
  internalRoutines: ReadonlyArray<{ from: string; to: string; topic: string; frequency: string }>;
  daysBack: number;
}

export interface PleoExpenseConfig {
  categories: ReadonlyArray<{ name: string; avgAmount: number; frequency: number; employees: readonly string[] }>;
  daysBack: number;
}

export interface CalendarOpsConfig {
  recurring: ReadonlyArray<{ title: string; attendees: readonly string[]; frequency: string }>;
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
  _profile: CompanyProfile,
  config: TracezillaOrderConfig,
): SyntheticContent[] {
  const results: SyntheticContent[] = [];
  const statuses = ["Leveret", "Bekræftet", "Under behandling", "Kladde"] as const;
  const statusWeights = [60, 25, 10, 5];

  // Generate orders per customer based on their frequency
  for (const customer of config.customers) {
    const orderCount = frequencyToCount(customer.frequency, config.daysBack);
    const days = distributeWeekdays(rng, orderCount, config.daysBack);

    for (let i = 0; i < orderCount; i++) {
      const soNum = 4800 + results.length;
      const daysAgo = days[i];
      const status = daysAgo > 15
        ? rng.pickWeighted(["Leveret", "Leveret", "Bekræftet"], [80, 10, 10])
        : rng.pickWeighted([...statuses], [...statusWeights]);
      const deliveryDaysAgo = Math.max(0, daysAgo - rng.int(1, 7));

      // Pick 2-4 products from the customer's product list
      const lineCount = Math.min(rng.int(2, 4), customer.products.length);
      const selectedProducts = rng.pickN(customer.products, lineCount);
      const lines = selectedProducts.map(p => {
        const qty = Math.round(customer.avgOrderSize * (0.5 + rng.next()));
        const product = config.products.find(pr => p.includes(pr.name.split(" ")[1] ?? pr.name));
        const unit = product?.unit ?? "stk";
        return `${qty} ${unit} ${p}`;
      });

      const content = `Salgsordre SO-${soNum} — ${customer.name}. ${lines.join(". ")}. Levering ${daysAgoDate(deliveryDaysAgo)}. Status: ${status}.`;

      results.push({
        sourceType: "erp_order",
        connectorProvider: "tracezilla",
        content,
        daysAgo,
        metadata: { orderNumber: `SO-${soNum}`, customer: customer.name, status, deliveryDate: daysAgoDate(deliveryDaysAgo) },
      });
    }
  }

  return results;
}

function generateTracezillaBatches(
  rng: SeededRandom,
  _profile: CompanyProfile,
  config: TracezillaBatchConfig,
): SyntheticContent[] {
  const results: SyntheticContent[] = [];

  // ~1-2 batches per working day, rotating through products
  const totalBatches = Math.ceil(config.daysBack * 5 / 7 * 1.5);
  const days = distributeWeekdays(rng, totalBatches, config.daysBack);

  for (let i = 0; i < totalBatches; i++) {
    const product = config.products[i % config.products.length];
    const batchNum = `2026-${product.batchPrefix}${String(i + 1).padStart(3, "0")}`;
    const qty = Math.round(product.dailyVolume * (0.7 + rng.next() * 0.6));
    const lotNum = `${config.milkSupplier.lotPrefix}-${String(rng.int(300, 399)).padStart(4, "0")}`;
    const qa = rng.next() < 0.95 ? "Godkendt" : "Afventer";
    const daysAgo = days[i];

    const content = `Batch ${batchNum} — ${product.name}. ${qty} ${product.unit} produceret. Råmælk: ${config.milkSupplier.name} lot ${lotNum}. Holdbarhed: 24 mdr. Økologisk: Ja. QA: ${qa}.`;

    results.push({
      sourceType: "erp_order",
      connectorProvider: "tracezilla",
      content,
      daysAgo,
      metadata: { batchNumber: batchNum, product: product.name, quantity: qty, supplier: config.milkSupplier.name, lotNumber: lotNum, qaStatus: qa },
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
  const statuses = ["Leveret", "Planlagt", "Under transport", "Klargjort"] as const;
  const statusWeights = [70, 15, 10, 5];

  // Route-based shipments
  for (const route of config.routes) {
    const count = frequencyToCount(route.frequency, config.daysBack);
    const days = distributeWeekdays(rng, count, config.daysBack);

    for (let i = 0; i < count; i++) {
      const shpNum = 8800 + results.length;
      const pallets = rng.int(route.palletRange[0], route.palletRange[1]);
      const daysAgo = days[i];
      const status = daysAgo > 5
        ? rng.pickWeighted(["Leveret", "Leveret", "Leveret"], [90, 5, 5])
        : rng.pickWeighted([...statuses], [...statusWeights]);

      const content = `Forsendelse SHP-${shpNum} — Hansens Jægerspris → ${route.destination}. ${route.carrier}. ${pallets} paller. Kølekontrolleret -18°C. Status: ${status}.`;

      results.push({
        sourceType: "shipment",
        connectorProvider: "shipmondo",
        content,
        daysAgo,
        metadata: { shipmentNumber: `SHP-${shpNum}`, destination: route.destination, carrier: route.carrier, pallets, status },
      });
    }
  }

  // Own truck routes
  for (const route of config.ownTruckRoutes) {
    const count = frequencyToCount(route.frequency, config.daysBack);
    const days = distributeWeekdays(rng, count, config.daysBack);

    for (let i = 0; i < count; i++) {
      const shpNum = 8800 + results.length;
      const daysAgo = days[i];
      const status = daysAgo > 3 ? "Leveret" : rng.pick(["Leveret", "Planlagt"]);

      const content = `Forsendelse SHP-${shpNum} — Egen kølbil rute: ${route.name}. ${route.stops.length} stop: ${route.stops.join(", ")}. Status: ${status}.`;

      results.push({
        sourceType: "shipment",
        connectorProvider: "shipmondo",
        content,
        daysAgo,
        metadata: { shipmentNumber: `SHP-${shpNum}`, route: route.name, stops: route.stops.length, status },
      });
    }
  }

  return results;
}

// Slack message template pools per channel type
const SLACK_TEMPLATES: Record<string, string[]> = {
  production: [
    "Produktion i dag: Vanille ({qty1}), Chokolade ({qty2}). Svanholm-leverance modtaget kl {time}. Alt OK.",
    "Batch {batchNum} afsluttet. QA-godkendelse opdateret i Tracezilla.",
    "Produktion afsluttet. Total i dag: {qty1} stk. I morgen: {product}.",
    "Svanholm-leverance: {qty1}L modtaget kl {time}. Kvalitet OK. Fedtprocent: 3,8%.",
    "Maskinvedligehold: pasteuriseringsanlæg rengjort. Klar til i morgen.",
  ],
  logistics: [
    "Leveringsplan i dag: {route1}. Kølbil 1: {dest1}. Kølbil 2: {dest2}.",
    "Fryselager: {pct}% kapacitet. {qty1} paller ledigt.",
    "{deliveries} leveringer gennemført i dag. Alt on-time.",
    "SHP-{shpNum} afhentet kl {time}. {pallets} paller til {dest1}.",
    "Fryselager temperaturcheck: -{temp}°C. Inden for grænseværdier.",
  ],
  quality: [
    "Temperaturlog OK. Fryselager: -{temp}°C. Pasteurisering: 85°C/15s.",
    "Batch {batchNum} — QA godkendt. Alle parametre inden for specifikation.",
    "Overfladeprobtagning uge {weekNum}: alle resultater under grænseværdi.",
    "Leverandørcertifikat Svanholm Gods: Ø-cert bekræftet gyldig.",
    "Allergenoversigt opdateret med ny SKU: Nørgaard Pop (aronia, ingen mælk).",
  ],
  sales: [
    "Coop har bestilt {qty1} ks til levering {date}. Bekræftet i Tracezilla.",
    "Robert: feltbesøg i dag — 2 nye leads i København. Følger op i morgen.",
    "Salling Group sæsonaftale: ordrer stiger som forventet. +15% vs. sidste år.",
    "Nemlig.com ugentlig ordre: {qty1} stk assorteret. Levering onsdag.",
    "OOH pipeline: {count} aktive leads. Estimeret værdi {amount} DKK/mnd.",
  ],
  general: [
    "God morgen alle. Ugen i overblik: {count} ordrer, {deliveries} leveringer planlagt.",
    "Fælles frokost fredag kl 12 i kantinen. Alle er velkomne.",
    "Påmindelse: sikkerhedssko og hårnæt er påbudt i produktionsområdet.",
    "Kontoret lukker kl 15 fredag pga. personalearrangement.",
    "Velkommen til ny sæsonmedarbejder! Vis dem rundt og hjælp dem i gang.",
  ],
};

function generateSlackOps(
  rng: SeededRandom,
  _profile: CompanyProfile,
  config: SlackOpsConfig,
): SyntheticContent[] {
  const results: SyntheticContent[] = [];

  // ~5-6 messages per working day across all channels
  const totalMessages = Math.ceil(config.daysBack * 5 / 7 * 5.5);
  const days = distributeWeekdays(rng, totalMessages, config.daysBack);

  for (let i = 0; i < totalMessages; i++) {
    const channel = rng.pick(config.channels);
    const templates = SLACK_TEMPLATES[channel.templateType] ?? SLACK_TEMPLATES.general;
    const template = rng.pick(templates);
    const poster = rng.pick(channel.posters);
    const daysAgo = days[i];

    const content = template
      .replace(/\{qty1\}/g, String(rng.int(400, 2000)))
      .replace(/\{qty2\}/g, String(rng.int(300, 1500)))
      .replace(/\{time\}/g, `${rng.int(6, 16)}:${rng.pick(["00", "15", "30", "45"])}`)
      .replace(/\{batchNum\}/g, `2026-V${String(rng.int(1, 50)).padStart(3, "0")}`)
      .replace(/\{product\}/g, rng.pick(["Vanille", "Chokolade", "Jordbær", "O'Payo", "Salt Karamel"]))
      .replace(/\{route1\}/g, rng.pick(["Coop Albertslund", "Salling Hasselager", "OOH København"]))
      .replace(/\{dest1\}/g, rng.pick(["Coop Centrallager", "Nemlig Brøndby", "Salling DC"]))
      .replace(/\{dest2\}/g, rng.pick(["OOH København", "OOH Nordsjælland", "Dagrofa"]))
      .replace(/\{pct\}/g, String(rng.int(55, 92)))
      .replace(/\{deliveries\}/g, String(rng.int(2, 6)))
      .replace(/\{shpNum\}/g, String(rng.int(8800, 8999)))
      .replace(/\{pallets\}/g, String(rng.int(2, 16)))
      .replace(/\{temp\}/g, String(rng.int(17, 22)))
      .replace(/\{weekNum\}/g, String(rng.int(14, 18)))
      .replace(/\{date\}/g, daysAgoDate(Math.max(0, daysAgo - rng.int(0, 5))))
      .replace(/\{count\}/g, String(rng.int(3, 12)))
      .replace(/\{amount\}/g, String(rng.int(15, 80) * 1000));

    const posterName = _profile?.employees?.find(e => e.email === poster)?.name ?? poster.split("@")[0];

    results.push({
      sourceType: "slack_message",
      connectorProvider: "slack",
      content,
      daysAgo,
      metadata: { channel: channel.name, authorEmail: poster, authorName: firstName(posterName) },
    });
  }

  return results;
}

function generateRoutineEmails(
  rng: SeededRandom,
  profile: CompanyProfile,
  config: RoutineEmailConfig,
): SyntheticContent[] {
  const results: SyntheticContent[] = [];

  // Supplier correspondence
  for (const supplier of config.supplierEmails) {
    const count = Math.ceil(config.daysBack / 7 * 2); // ~2/week per supplier
    const days = distributeWeekdays(rng, count, config.daysBack);
    const emp = profile.employees.find(e => e.role === "admin") ?? profile.employees[0];

    for (let i = 0; i < count; i++) {
      const daysAgo = days[i];
      const templates = [
        { subject: `Ordrebekræftelse — ${supplier.topic}`, content: `Hej ${firstName(emp.name)}, vi bekræfter modtagelse af din ordre. Levering i uge ${rng.int(14, 22)}. Vh ${supplier.contactName}, ${supplier.name}`, from: supplier.email, to: emp.email },
        { subject: `Leveringsnotifikation — ${supplier.topic}`, content: `Hej ${firstName(emp.name)}, din leverance af ${supplier.topic} er afsendt i dag. Forventet ankomst i morgen kl ${rng.int(6, 10)}:00. Vh ${supplier.contactName}`, from: supplier.email, to: emp.email },
        { subject: `RE: ${supplier.topic} — uge ${rng.int(14, 22)}`, content: `Hej ${supplier.contactName}, bekræfter modtagelse af leverance. Alt modtaget i god stand. Tak. Vh ${firstName(emp.name)}, ${profile.name}`, from: emp.email, to: supplier.email },
      ];
      const t = rng.pick(templates);
      results.push({
        sourceType: "email", connectorProvider: "gmail", content: t.content, daysAgo,
        metadata: { from: t.from, to: t.to, subject: t.subject, date: daysAgoDate(daysAgo) },
      });
    }
  }

  // Internal routines
  for (const routine of config.internalRoutines) {
    const count = frequencyToCount(routine.frequency, config.daysBack);
    const days = distributeWeekdays(rng, count, config.daysBack);
    const fromName = profile.employees.find(e => e.email === routine.from)?.name ?? routine.from;
    const toName = profile.employees.find(e => e.email === routine.to)?.name ?? routine.to;

    for (let i = 0; i < count; i++) {
      const daysAgo = days[i];
      const content = routine.frequency === "daily"
        ? `Hej ${firstName(toName)}, ${routine.topic} for i dag: alt kører planmæssigt. Ingen kritiske afvigelser. Vh ${firstName(fromName)}`
        : `Hej ${firstName(toName)}, ugentlig ${routine.topic}: ${rng.int(15, 40)} ordrer behandlet, ${rng.int(5, 15)} batches produceret. Ingen åbne problemer. Vh ${firstName(fromName)}`;

      results.push({
        sourceType: "email", connectorProvider: "gmail", content, daysAgo,
        metadata: { from: routine.from, to: routine.to, subject: `${routine.topic} — ${daysAgoDate(daysAgo)}`, date: daysAgoDate(daysAgo) },
      });
    }
  }

  return results;
}

function generatePleoExpenses(
  rng: SeededRandom,
  profile: CompanyProfile,
  config: PleoExpenseConfig,
): SyntheticContent[] {
  const results: SyntheticContent[] = [];

  for (const category of config.categories) {
    const days = distributeWeekdays(rng, category.frequency, config.daysBack);

    for (let i = 0; i < category.frequency; i++) {
      const employee = rng.pick(category.employees);
      const empName = profile.employees.find(e => e.email === employee)?.name ?? employee;
      const amount = Math.round(category.avgAmount * (0.7 + rng.next() * 0.6));
      const daysAgo = days[i] ?? rng.int(0, config.daysBack - 1);

      results.push({
        sourceType: "expense", connectorProvider: "pleo",
        content: `Udlæg: ${category.name}. ${empName}. ${amount} DKK. Dato: ${daysAgoDate(daysAgo)}.`,
        daysAgo,
        metadata: { employee: empName, employeeEmail: employee, category: category.name, amount, currency: "DKK", date: daysAgoDate(daysAgo) },
      });
    }
  }

  return results;
}

function generateCalendarOps(
  rng: SeededRandom,
  _profile: CompanyProfile,
  config: CalendarOpsConfig,
): SyntheticContent[] {
  const results: SyntheticContent[] = [];

  for (const meeting of config.recurring) {
    const count = frequencyToCount(meeting.frequency, config.daysBack);
    const days = distributeWeekdays(rng, count, config.daysBack);

    for (let i = 0; i < count; i++) {
      const daysAgo = days[i];
      const hour = rng.int(8, 14);
      const duration = meeting.frequency === "daily" ? 15 : rng.pick([30, 45, 60]);

      const content = `${meeting.title} — ${daysAgoDate(daysAgo)} kl. ${String(hour).padStart(2, "0")}:00. Deltagere: ${meeting.attendees.length}. Varighed: ${duration} min.`;

      results.push({
        sourceType: "calendar_note", connectorProvider: "google-calendar",
        content, daysAgo,
        metadata: { title: meeting.title, date: daysAgoDate(daysAgo), attendees: [...meeting.attendees], durationMin: duration },
      });
    }
  }

  return results;
}

// ── Main entry point ───────────────────────────────────────────────────

export function generateOperationalContent(
  profile: CompanyProfile,
  config: OperationalConfig,
): SyntheticContent[] {
  const rng = new SeededRandom(seedFromString(profile.domain + ":ops"));
  const seen = new Set<string>();
  const allResults: SyntheticContent[] = [];

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
