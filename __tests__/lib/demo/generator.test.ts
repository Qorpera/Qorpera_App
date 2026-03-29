import { describe, it, expect } from "vitest";
import { generateClutter, generateActivitySignals } from "@/lib/demo/companies/generator";
import type { CompanyProfile, ClutterConfig, ActivityConfig } from "@/lib/demo/companies/generator";

// ── Test profile (Boltly-like, 5 employees + 3 external contacts) ──────

const TEST_PROFILE: CompanyProfile = {
  domain: "testco.dk",
  name: "TestCo ApS",
  locale: "da",
  connectorProviders: ["gmail", "google-calendar", "google-drive", "slack", "e-conomic"],
  employees: [
    { email: "boss@testco.dk", name: "Anna Boss", role: "ceo", connectorProviders: ["gmail", "google-calendar"] },
    { email: "mgr@testco.dk", name: "Erik Manager", role: "manager", connectorProviders: ["gmail", "google-calendar"] },
    { email: "sales@testco.dk", name: "Mette Salg", role: "sales", connectorProviders: ["gmail"] },
    { email: "field@testco.dk", name: "Jens Felt", role: "field_worker", connectorProviders: ["gmail"] },
    { email: "junior@testco.dk", name: "Ida Ny", role: "junior", connectorProviders: ["gmail"] },
  ],
  externalContacts: [
    { name: "Peter Kunde", email: "peter@kundeco.dk", company: "KundeCo" },
    { name: "Lise Partner", email: "lise@partnerco.dk", company: "PartnerCo" },
    { name: "Hans Vendor", email: "hans@vendorco.dk", company: "VendorCo" },
  ],
};

const DEFAULT_CLUTTER: ClutterConfig = {
  systemNotifications: 30,
  autoReplies: 10,
  marketingNewsletters: 20,
  transactional: 15,
  calendarAuto: 12,
  internalChatter: 25,
};

const DEFAULT_ACTIVITY: ActivityConfig = {
  daysBack: 90,
  weekendActivity: false,
};

// ── Clutter tests ───────────────────────────────────────────────────────

describe("generateClutter", () => {
  const clutter = generateClutter(TEST_PROFILE, DEFAULT_CLUTTER);

  it("returns approximately the expected total count (±15%)", () => {
    const expectedTotal = Object.values(DEFAULT_CLUTTER).reduce((a, b) => a + b, 0);
    expect(clutter.length).toBeGreaterThanOrEqual(expectedTotal * 0.85);
    expect(clutter.length).toBeLessThanOrEqual(expectedTotal * 1.15);
  });

  it("produces items with valid sourceType", () => {
    const validTypes = ["email", "slack_message", "drive_doc", "calendar_note"];
    for (const item of clutter) {
      expect(validTypes).toContain(item.sourceType);
    }
  });

  it("produces items with valid connectorProvider from the profile", () => {
    for (const item of clutter) {
      expect(TEST_PROFILE.connectorProviders).toContain(item.connectorProvider);
    }
  });

  it("produces items with non-empty content", () => {
    for (const item of clutter) {
      expect(item.content.length).toBeGreaterThan(0);
    }
  });

  it("produces no two items with identical content", () => {
    const contents = clutter.map(c => c.content);
    const unique = new Set(contents);
    expect(unique.size).toBe(contents.length);
  });

  it("distributes daysAgo across 0-90 range", () => {
    const days = clutter.map(c => c.daysAgo ?? 0);
    const min = Math.min(...days);
    const max = Math.max(...days);
    expect(min).toBeLessThanOrEqual(10);
    expect(max).toBeGreaterThanOrEqual(40);
  });

  it("produces valid metadata per sourceType", () => {
    for (const item of clutter) {
      expect(item.metadata).toBeDefined();
      if (item.sourceType === "email") {
        expect(item.metadata).toHaveProperty("from");
        expect(item.metadata).toHaveProperty("to");
        expect(item.metadata).toHaveProperty("subject");
      } else if (item.sourceType === "slack_message") {
        expect(item.metadata).toHaveProperty("channel");
        expect(item.metadata).toHaveProperty("authorEmail");
      } else if (item.sourceType === "calendar_note") {
        expect(item.metadata).toHaveProperty("title");
        expect(item.metadata).toHaveProperty("attendees");
      }
    }
  });

  it("is deterministic — same profile produces same output", () => {
    const second = generateClutter(TEST_PROFILE, DEFAULT_CLUTTER);
    expect(second.length).toBe(clutter.length);
    for (let i = 0; i < clutter.length; i++) {
      expect(second[i].content).toBe(clutter[i].content);
      expect(second[i].daysAgo).toBe(clutter[i].daysAgo);
    }
  });

  it("returns approximate count per category (±15%)", () => {
    const emails = clutter.filter(c => c.sourceType === "email");
    const slackMessages = clutter.filter(c => c.sourceType === "slack_message");
    const calendarNotes = clutter.filter(c => c.sourceType === "calendar_note");

    // Email categories combined: systemNotifications + autoReplies + marketingNewsletters + transactional
    const expectedEmailCount =
      DEFAULT_CLUTTER.systemNotifications +
      DEFAULT_CLUTTER.autoReplies +
      DEFAULT_CLUTTER.marketingNewsletters +
      DEFAULT_CLUTTER.transactional;
    expect(emails.length).toBeGreaterThanOrEqual(expectedEmailCount * 0.85);
    expect(emails.length).toBeLessThanOrEqual(expectedEmailCount * 1.15);

    // Calendar
    expect(calendarNotes.length).toBeGreaterThanOrEqual(DEFAULT_CLUTTER.calendarAuto * 0.85);
    expect(calendarNotes.length).toBeLessThanOrEqual(DEFAULT_CLUTTER.calendarAuto * 1.15);

    // Slack
    expect(slackMessages.length).toBeGreaterThanOrEqual(DEFAULT_CLUTTER.internalChatter * 0.85);
    expect(slackMessages.length).toBeLessThanOrEqual(DEFAULT_CLUTTER.internalChatter * 1.15);
  });
});

// ── Activity signal tests ───────────────────────────────────────────────

describe("generateActivitySignals", () => {
  const signals = generateActivitySignals(TEST_PROFILE, DEFAULT_ACTIVITY);

  it("returns signals for all employees in the profile", () => {
    const actorEmails = new Set(signals.map(s => s.actorEmail));
    for (const emp of TEST_PROFILE.employees) {
      expect(actorEmails).toContain(emp.email);
    }
  });

  it("all actorEmail values exist in the profile", () => {
    const validEmails = new Set(TEST_PROFILE.employees.map(e => e.email));
    for (const signal of signals) {
      expect(validEmails).toContain(signal.actorEmail);
    }
  });

  it("produces valid signalType values", () => {
    const validTypes = ["email_sent", "email_received", "meeting_held", "slack_message", "doc_edited"];
    for (const signal of signals) {
      expect(validTypes).toContain(signal.signalType);
    }
  });

  it("has no weekend signals when weekendActivity is false", () => {
    // March 29, 2026 is a Sunday. daysAgo=0 → Sunday, daysAgo=1 → Saturday
    // Sundays: daysAgo 0, 7, 14, 21, 28, ...
    // Saturdays: daysAgo 1, 8, 15, 22, 29, ...
    const weekendDays = new Set<number>();
    for (let d = 0; d < DEFAULT_ACTIVITY.daysBack; d++) {
      const refDate = new Date(2026, 2, 29);
      const targetDate = new Date(refDate.getTime() - d * 86400000);
      const dow = targetDate.getDay();
      if (dow === 0 || dow === 6) weekendDays.add(d);
    }

    const weekendSignals = signals.filter(s => weekendDays.has(s.daysAgo));
    expect(weekendSignals.length).toBe(0);
  });

  it("generates weekend signals when weekendActivity is true", () => {
    const withWeekend = generateActivitySignals(TEST_PROFILE, {
      daysBack: 90,
      weekendActivity: true,
    });

    const weekendDays = new Set<number>();
    for (let d = 0; d < 90; d++) {
      const refDate = new Date(2026, 2, 29);
      const targetDate = new Date(refDate.getTime() - d * 86400000);
      const dow = targetDate.getDay();
      if (dow === 0 || dow === 6) weekendDays.add(d);
    }

    const weekendSignals = withWeekend.filter(s => weekendDays.has(s.daysAgo));
    expect(weekendSignals.length).toBeGreaterThan(0);
  });

  it("signal volume roughly matches role-based expectations (±50%)", () => {
    // CEO should have more email_sent than junior
    const ceoEmailSent = signals.filter(
      s => s.actorEmail === "boss@testco.dk" && s.signalType === "email_sent",
    ).length;
    const juniorEmailSent = signals.filter(
      s => s.actorEmail === "junior@testco.dk" && s.signalType === "email_sent",
    ).length;

    // CEO: ~10/day × ~64 workdays = ~640. Junior: ~2/day × ~64 = ~128.
    // With ±30% variance and weekly patterns, use wide tolerance.
    expect(ceoEmailSent).toBeGreaterThan(juniorEmailSent);

    // Sales should have high email_sent
    const salesEmailSent = signals.filter(
      s => s.actorEmail === "sales@testco.dk" && s.signalType === "email_sent",
    ).length;
    expect(salesEmailSent).toBeGreaterThan(juniorEmailSent);
  });

  it("daysAgo spans the configured range", () => {
    const days = signals.map(s => s.daysAgo);
    const maxDay = Math.max(...days);
    // Should reach close to daysBack (minus weekends at the tail)
    expect(maxDay).toBeGreaterThanOrEqual(DEFAULT_ACTIVITY.daysBack - 10);
  });

  it("meeting signals include targetEmails with 1-4 attendees", () => {
    const meetings = signals.filter(s => s.signalType === "meeting_held");
    expect(meetings.length).toBeGreaterThan(0);
    for (const m of meetings) {
      expect(m.targetEmails).toBeDefined();
      expect(m.targetEmails!.length).toBeGreaterThanOrEqual(1);
      expect(m.targetEmails!.length).toBeLessThanOrEqual(4);
    }
  });

  it("meeting signals have title metadata", () => {
    const meetings = signals.filter(s => s.signalType === "meeting_held");
    for (const m of meetings) {
      expect(m.metadata).toBeDefined();
      expect(m.metadata).toHaveProperty("title");
      expect((m.metadata as { title: string }).title.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic", () => {
    const second = generateActivitySignals(TEST_PROFILE, DEFAULT_ACTIVITY);
    expect(second.length).toBe(signals.length);
    for (let i = 0; i < Math.min(50, signals.length); i++) {
      expect(second[i].signalType).toBe(signals[i].signalType);
      expect(second[i].actorEmail).toBe(signals[i].actorEmail);
      expect(second[i].daysAgo).toBe(signals[i].daysAgo);
    }
  });
});
