import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// ── 1. DA message file completeness ─────────────────────────────────────────

describe("DA message file completeness", () => {
  function getKeys(obj: Record<string, unknown>, prefix = ""): string[] {
    const keys: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      const p = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "object" && value !== null) {
        keys.push(...getKeys(value as Record<string, unknown>, p));
      } else {
        keys.push(p);
      }
    }
    return keys.sort();
  }

  it("da.json has the same keys as en.json", async () => {
    const en = await import("../../messages/en.json");
    const da = await import("../../messages/da.json");
    const enKeys = getKeys(en.default || en);
    const daKeys = getKeys(da.default || da);
    expect(daKeys).toEqual(enKeys);
  });

  it("da.json has no empty string values", async () => {
    const da = await import("../../messages/da.json");
    const empties: string[] = [];

    function checkValues(obj: Record<string, unknown>, prefix = "") {
      for (const [key, value] of Object.entries(obj)) {
        const p = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "object" && value !== null) {
          checkValues(value as Record<string, unknown>, p);
        } else if (value === "") {
          empties.push(p);
        }
      }
    }

    checkValues(da.default || da);
    expect(empties).toEqual([]);
  });

  it("da.json values differ from en.json (actually translated)", async () => {
    const en = await import("../../messages/en.json");
    const da = await import("../../messages/da.json");

    function getLeafValues(obj: Record<string, unknown>): string[] {
      const values: string[] = [];
      for (const value of Object.values(obj)) {
        if (typeof value === "object" && value !== null) {
          values.push(...getLeafValues(value as Record<string, unknown>));
        } else if (typeof value === "string") {
          values.push(value);
        }
      }
      return values;
    }

    const enValues = getLeafValues(en.default || en);
    const daValues = getLeafValues(da.default || da);

    // At least 50% of values should differ (many will be identical: product names, technical terms)
    let diffCount = 0;
    for (let i = 0; i < enValues.length; i++) {
      if (enValues[i] !== daValues[i]) diffCount++;
    }

    expect(diffCount / enValues.length).toBeGreaterThan(0.5);
  });
});

// ── 2. Email renders in recipient locale ────────────────────────────────────

describe("Email locale routing", () => {
  it("email-strings exports EN and DA subjects", async () => {
    const { getEmailSubject } = await import("@/emails/email-strings");

    const enSubject = getEmailSubject("en", "situation_proposed", { situationTitle: "Test" });
    expect(enSubject).toContain("New situation");
    expect(enSubject).toContain("Test");

    const daSubject = getEmailSubject("da", "situation_proposed", { situationTitle: "Test" });
    expect(daSubject).toContain("Ny situation");
    expect(daSubject).toContain("Test");
  });

  it("renderNotificationEmail accepts locale parameter", async () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/emails/template-registry.ts"),
      "utf-8",
    );
    expect(source).toContain("locale");
    expect(source).toContain("getEmailSubject");
  });
});

// ── 3. Copilot locale injection ─────────────────────────────────────────────

describe("Copilot locale injection", () => {
  it("chat function accepts locale parameter", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/lib/ai-copilot.ts"),
      "utf-8",
    );
    // chat function signature includes locale
    expect(source).toMatch(/export async function chat\([^)]*locale/);
    // Danish directive is injected
    expect(source).toContain('locale === "da"');
    expect(source).toContain("Danish");
  });

  it("copilot route passes user.locale to chat", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/app/api/copilot/route.ts"),
      "utf-8",
    );
    expect(source).toContain("user.locale");
  });
});

// ── 4. Notification content locale ──────────────────────────────────────────

describe("Notification content locale", () => {
  it("getLocalizedNotification returns Danish for da locale", async () => {
    const { getLocalizedNotification } = await import("@/lib/notification-strings");

    const en = getLocalizedNotification("en", "situation_proposed", { name: "Test" });
    expect(en.title).toContain("New situation");

    const da = getLocalizedNotification("da", "situation_proposed", { name: "Test" });
    expect(da.title).toContain("Ny situation");
  });

  it("getLocalizedNotification falls back to EN for unknown locale", async () => {
    const { getLocalizedNotification } = await import("@/lib/notification-strings");

    const result = getLocalizedNotification("fr", "situation_proposed", { name: "Test" });
    expect(result.title).toContain("New situation");
  });
});

// ── 5. Date formatting ──────────────────────────────────────────────────────

describe("Date formatting", () => {
  it("formatRelativeTime returns Danish-style relative time for da locale", async () => {
    const { formatRelativeTime } = await import("@/lib/format-helpers");

    // A date 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const en = formatRelativeTime(twoHoursAgo, "en");
    const da = formatRelativeTime(twoHoursAgo, "da");

    // Both should mention "2" but in different formats
    expect(en).toContain("2");
    expect(da).toContain("2");
    // DA should use Danish time words (timer/t)
    expect(da).not.toEqual(en);
  });

  it("formatDate uses locale-appropriate format", async () => {
    const { formatDate } = await import("@/lib/format-helpers");

    const testDate = "2026-03-22T12:00:00Z";
    const en = formatDate(testDate, "en");
    const da = formatDate(testDate, "da");

    // Both should represent the same date but formatted differently
    expect(en).toBeTruthy();
    expect(da).toBeTruthy();
  });
});

// ── 6. Legal page DA placeholder ────────────────────────────────────────────

describe("Legal page DA placeholders", () => {
  it("terms page has Danish placeholder conditional", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/app/terms/page.tsx"),
      "utf-8",
    );
    expect(source).toContain("Servicevilkår");
    expect(source).toContain('locale === "da"');
  });

  it("privacy page has Danish placeholder conditional", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/app/privacy/page.tsx"),
      "utf-8",
    );
    expect(source).toContain("Privatlivspolitik");
    expect(source).toContain('locale === "da"');
  });

  it("dpa page has Danish placeholder conditional", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/app/dpa/page.tsx"),
      "utf-8",
    );
    expect(source).toContain("Databehandleraftale");
    expect(source).toContain('locale === "da"');
  });
});
