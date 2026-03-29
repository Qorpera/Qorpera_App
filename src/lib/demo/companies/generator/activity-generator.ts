// ── Activity Signal Generator ────────────────────────────────────────────
// Produces realistic SyntheticActivitySignal arrays for a company profile
// based on per-role daily volume targets, weekly patterns, and target
// selection rules. Deterministic given the same profile.

import type { SyntheticActivitySignal } from "../../synthetic-types";
import type { CompanyProfile, EmployeeProfile, ActivityConfig } from "./types";

// ── Seeded PRNG (same LCG as clutter-templates) ────────────────────────

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

  shuffle<T>(arr: T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

// ── Role-based daily volume targets ─────────────────────────────────────

type SignalType = "email_sent" | "email_received" | "meeting_held" | "slack_message" | "doc_edited";

const ROLE_VOLUMES: Record<EmployeeProfile["role"], Record<SignalType, number>> = {
  ceo:          { email_sent: 10, email_received: 8,  meeting_held: 4, slack_message: 3, doc_edited: 1 },
  manager:      { email_sent: 7,  email_received: 6,  meeting_held: 3, slack_message: 4, doc_edited: 1 },
  sales:        { email_sent: 12, email_received: 8,  meeting_held: 3, slack_message: 2, doc_edited: 0.5 },
  engineer:     { email_sent: 4,  email_received: 3,  meeting_held: 2, slack_message: 8, doc_edited: 2 },
  field_worker: { email_sent: 3,  email_received: 2,  meeting_held: 1, slack_message: 1, doc_edited: 0.3 },
  admin:        { email_sent: 8,  email_received: 6,  meeting_held: 2, slack_message: 2, doc_edited: 1 },
  junior:       { email_sent: 2,  email_received: 2,  meeting_held: 1, slack_message: 2, doc_edited: 0.5 },
};

// ── Day-of-week multipliers ─────────────────────────────────────────────

function dayMultiplier(dayOfWeek: number, weekendActivity: boolean): number {
  // 0 = Sunday, 6 = Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return weekendActivity ? 0.1 : 0;
  }
  if (dayOfWeek === 5) return 0.7; // Friday
  return 1.0; // Mon-Thu
}

function getDayOfWeek(daysAgo: number): number {
  // Reference: compute from a fixed date to keep determinism
  // We use a reference that doesn't depend on runtime Date
  // daysAgo 0 = "today", but for determinism we just need a consistent
  // weekday assignment. Use a fixed epoch offset.
  // 2026-03-29 is a Sunday (day 0). So daysAgo=0 → Sunday.
  // But we want this to work regardless of actual date, so we pick a
  // fixed reference: day 0 maps to weekday 0 (Sunday).
  // Actually let's just use the real calendar for realism:
  const refDate = new Date(2026, 2, 29); // March 29, 2026 = Sunday
  const targetDate = new Date(refDate.getTime() - daysAgo * 86400000);
  return targetDate.getDay();
}

// ── Meeting title generation ────────────────────────────────────────────

const DA_MEETING_TITLES = [
  "Statusmøde", "Projektgennemgang", "Kvartalsopfølgning", "Sprint review",
  "Driftsmøde", "Planlægningsmøde", "Strategimøde", "Budgetmøde",
];

const EN_MEETING_TITLES = [
  "Status meeting", "Project review", "Quarterly check-in", "Sprint review",
  "Operations sync", "Planning session", "Strategy session", "Budget review",
];

function meetingTitle(
  rng: SeededRandom,
  actor: EmployeeProfile,
  targets: string[],
  profile: CompanyProfile,
): string {
  const titles = profile.locale === "da" ? DA_MEETING_TITLES : EN_MEETING_TITLES;

  // If 1 target and it's internal, make it a 1:1
  if (targets.length === 1) {
    const targetEmp = profile.employees.find(e => e.email === targets[0]);
    if (targetEmp) {
      return `1:1 ${actor.name.split(" ")[0]} + ${targetEmp.name.split(" ")[0]}`;
    }
    // External target
    const ext = profile.externalContacts.find(c => c.email === targets[0]);
    if (ext) {
      return profile.locale === "da"
        ? `Kundemøde ${ext.company}`
        : `Client meeting ${ext.company}`;
    }
  }

  return rng.pick(titles);
}

// ── Target selection ────────────────────────────────────────────────────

function selectEmailTargets(
  rng: SeededRandom,
  actor: EmployeeProfile,
  profile: CompanyProfile,
): string[] {
  const internalEmails = profile.employees
    .filter(e => e.email !== actor.email)
    .map(e => e.email);
  const externalEmails = profile.externalContacts.map(c => c.email);

  // Sales: 40% internal, 60% external. Engineers: 60% internal, 40% external.
  const externalRatio = actor.role === "sales" ? 0.6
    : actor.role === "engineer" ? 0.4
    : 0.5;

  if (rng.next() < externalRatio && externalEmails.length > 0) {
    return [rng.pick(externalEmails)];
  }
  if (internalEmails.length > 0) {
    return [rng.pick(internalEmails)];
  }
  return externalEmails.length > 0 ? [rng.pick(externalEmails)] : [];
}

function selectMeetingAttendees(
  rng: SeededRandom,
  actor: EmployeeProfile,
  profile: CompanyProfile,
): string[] {
  const pool = [
    ...profile.employees.filter(e => e.email !== actor.email).map(e => e.email),
    ...profile.externalContacts.map(c => c.email),
  ];
  if (pool.length === 0) return [];

  const count = rng.int(1, Math.min(4, pool.length));
  return rng.shuffle(pool).slice(0, count);
}

// ── Main entry point ────────────────────────────────────────────────────

export function generateActivitySignals(
  profile: CompanyProfile,
  config: ActivityConfig,
): SyntheticActivitySignal[] {
  // Use a different seed offset than clutter to avoid correlation
  const rng = new SeededRandom(seedFromString(profile.domain + ":activity"));
  const results: SyntheticActivitySignal[] = [];
  const signalTypes: SignalType[] = [
    "email_sent", "email_received", "meeting_held", "slack_message", "doc_edited",
  ];

  for (const emp of profile.employees) {
    const volumes = ROLE_VOLUMES[emp.role];

    for (let day = 0; day < config.daysBack; day++) {
      const dow = getDayOfWeek(day);
      const mult = dayMultiplier(dow, config.weekendActivity);
      if (mult === 0) continue;

      for (const signalType of signalTypes) {
        const baseVolume = volumes[signalType];
        if (baseVolume === 0) continue;

        // Apply day multiplier and ±30% daily variance
        const adjusted = baseVolume * mult;
        const variance = adjusted * 0.3;
        const dailyCount = Math.max(0, adjusted + (rng.next() * 2 - 1) * variance);

        // For fractional volumes (e.g. 0.3), use probability
        const wholeCount = Math.floor(dailyCount);
        const fractional = dailyCount - wholeCount;
        const finalCount = wholeCount + (rng.next() < fractional ? 1 : 0);

        for (let i = 0; i < finalCount; i++) {
          const signal: SyntheticActivitySignal = {
            signalType,
            actorEmail: emp.email,
            daysAgo: day,
          };

          if (signalType === "email_sent") {
            signal.targetEmails = selectEmailTargets(rng, emp, profile);
          } else if (signalType === "email_received") {
            // Received from others
            const senders = [
              ...profile.employees.filter(e => e.email !== emp.email).map(e => e.email),
              ...profile.externalContacts.map(c => c.email),
            ];
            if (senders.length > 0) {
              signal.metadata = { from: rng.pick(senders) };
            }
          } else if (signalType === "meeting_held") {
            const attendees = selectMeetingAttendees(rng, emp, profile);
            signal.targetEmails = attendees;
            signal.metadata = {
              title: meetingTitle(rng, emp, attendees, profile),
            };
          } else if (signalType === "slack_message") {
            const channels = profile.locale === "da"
              ? ["#general", "#random", "#drift", "#projekter"]
              : ["#general", "#random", "#engineering", "#projects"];
            signal.metadata = { channel: rng.pick(channels) };
          } else if (signalType === "doc_edited") {
            const docs = profile.locale === "da"
              ? ["Projektplan", "Statusrapport", "Tilbud", "Notat", "Procedure"]
              : ["Project plan", "Status report", "Proposal", "Notes", "Procedure"];
            signal.metadata = { fileName: `${rng.pick(docs)}_${rng.int(1, 50)}.docx` };
          }

          results.push(signal);
        }
      }
    }
  }

  return results;
}
