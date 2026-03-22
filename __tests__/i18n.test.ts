import { describe, it, expect, vi, beforeEach } from "vitest";

// ── 1. i18n config ──────────────────────────────────────────────────────────

describe("i18n config", () => {
  it("exports locales with en and da", async () => {
    const { locales, defaultLocale } = await import("@/i18n/config");
    expect(locales).toContain("en");
    expect(locales).toContain("da");
    expect(defaultLocale).toBe("en");
  });
});

// ── 2. Message file completeness ────────────────────────────────────────────

describe("message files", () => {
  it("en.json has no empty string values", async () => {
    const en = await import("../../messages/en.json");
    const empties: string[] = [];

    function checkValues(obj: Record<string, unknown>, prefix = "") {
      for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "object" && value !== null) {
          checkValues(value as Record<string, unknown>, path);
        } else if (value === "") {
          empties.push(path);
        }
      }
    }

    checkValues(en.default || en);
    expect(empties).toEqual([]);
  });

  it("da.json has the same key structure as en.json", async () => {
    const en = await import("../../messages/en.json");
    const da = await import("../../messages/da.json");

    function getKeys(obj: Record<string, unknown>, prefix = ""): string[] {
      const keys: string[] = [];
      for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "object" && value !== null) {
          keys.push(...getKeys(value as Record<string, unknown>, path));
        } else {
          keys.push(path);
        }
      }
      return keys.sort();
    }

    const enKeys = getKeys(en.default || en);
    const daKeys = getKeys(da.default || da);
    expect(daKeys).toEqual(enKeys);
  });
});

// ── 3. Schema migration — locale field default ──────────────────────────────

describe("User locale field", () => {
  it("schema defines locale with default en", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const schema = fs.readFileSync(
      path.resolve(__dirname, "../prisma/schema.prisma"),
      "utf-8",
    );
    // locale field with default en
    expect(schema).toMatch(/locale\s+String\s+@default\("en"\)/);
  });

  it("migration SQL adds locale column", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const sql = fs.readFileSync(
      path.resolve(
        __dirname,
        "../prisma/migrations/20260322_add_user_locale/migration.sql",
      ),
      "utf-8",
    );
    expect(sql).toContain('"locale"');
    expect(sql).toContain("DEFAULT 'en'");
  });
});

// ── 4. Login route sets NEXT_LOCALE cookie ──────────────────────────────────

describe("login cookie sync", () => {
  it("login route source sets NEXT_LOCALE cookie", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "../src/app/api/auth/login/route.ts"),
      "utf-8",
    );
    expect(source).toContain("NEXT_LOCALE");
    expect(source).toContain("user.locale");
  });
});

// ── 5. Register route sets NEXT_LOCALE cookie ───────────────────────────────

describe("register cookie sync", () => {
  it("register route source sets NEXT_LOCALE cookie to en", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "../src/app/api/auth/register/route.ts"),
      "utf-8",
    );
    expect(source).toContain("NEXT_LOCALE");
  });
});

// ── 6. /api/auth/me PATCH accepts locale ────────────────────────────────────

describe("me route locale PATCH", () => {
  it("me route exports PATCH handler that accepts locale", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "../src/app/api/auth/me/route.ts"),
      "utf-8",
    );
    expect(source).toContain("export async function PATCH");
    expect(source).toContain('"locale"');
  });
});

// ── 7. Locale switcher component exists ─────────────────────────────────────

describe("locale switcher", () => {
  it("locale-switcher.tsx exports LocaleSwitcher", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "../src/components/locale-switcher.tsx"),
      "utf-8",
    );
    expect(source).toContain("export function LocaleSwitcher");
    expect(source).toContain("NEXT_LOCALE");
    expect(source).toContain("/api/auth/me");
    expect(source).toContain("English");
    expect(source).toContain("Dansk");
  });
});
