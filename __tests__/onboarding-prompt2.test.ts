import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ── 2. i18n Key Completeness ────────────────────────────────────────────────

describe("i18n key completeness", () => {
  const enPath = path.resolve(__dirname, "../messages/en.json");
  const daPath = path.resolve(__dirname, "../messages/da.json");

  let en: Record<string, unknown>;
  let da: Record<string, unknown>;

  function flattenKeys(obj: unknown, prefix = ""): string[] {
    const keys: string[] = [];
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object" && !Array.isArray(v)) {
          keys.push(...flattenKeys(v, fullKey));
        } else {
          keys.push(fullKey);
        }
      }
    }
    return keys;
  }

  beforeEach(() => {
    en = JSON.parse(fs.readFileSync(enPath, "utf-8"));
    da = JSON.parse(fs.readFileSync(daPath, "utf-8"));
  });

  it("all onboarding keys in en.json exist in da.json", () => {
    const enKeys = flattenKeys((en as any).onboarding, "onboarding");
    const daKeys = flattenKeys((da as any).onboarding, "onboarding");

    const missingInDa = enKeys.filter(k => !daKeys.includes(k));
    expect(missingInDa).toEqual([]);
  });

  it("all onboarding keys in da.json exist in en.json", () => {
    const enKeys = flattenKeys((en as any).onboarding, "onboarding");
    const daKeys = flattenKeys((da as any).onboarding, "onboarding");

    const missingInEn = daKeys.filter(k => !enKeys.includes(k));
    expect(missingInEn).toEqual([]);
  });

  it("onboarding key count matches between languages", () => {
    const enKeys = flattenKeys((en as any).onboarding);
    const daKeys = flattenKeys((da as any).onboarding);
    expect(enKeys.length).toBe(daKeys.length);
  });

  it("old deleted step keys are removed from en.json", () => {
    const onboarding = (en as any).onboarding;
    expect(onboarding.departments).toBeUndefined();
    expect(onboarding.team).toBeUndefined();
    expect(onboarding.documents).toBeUndefined();
    expect(onboarding.connectors).toBeUndefined();
    expect(onboarding.sync).toBeUndefined();
  });

  it("old deleted step keys are removed from da.json", () => {
    const onboarding = (da as any).onboarding;
    expect(onboarding.departments).toBeUndefined();
    expect(onboarding.team).toBeUndefined();
    expect(onboarding.documents).toBeUndefined();
    expect(onboarding.connectors).toBeUndefined();
    expect(onboarding.sync).toBeUndefined();
  });

  it("companyInfo keys are preserved", () => {
    expect((en as any).onboarding.companyInfo).toBeDefined();
    expect((en as any).onboarding.companyInfo.title).toBeDefined();
    expect((da as any).onboarding.companyInfo).toBeDefined();
    expect((da as any).onboarding.companyInfo.title).toBeDefined();
  });

  it("new connectTools section exists in both languages", () => {
    expect((en as any).onboarding.connectTools).toBeDefined();
    expect((da as any).onboarding.connectTools).toBeDefined();
    expect((en as any).onboarding.connectTools.workspace).toBeDefined();
    expect((da as any).onboarding.connectTools.workspace).toBeDefined();
  });

  it("new analysis section exists in both languages", () => {
    expect((en as any).onboarding.analysis).toBeDefined();
    expect((da as any).onboarding.analysis).toBeDefined();
    expect((en as any).onboarding.analysis.syncing).toBeDefined();
    expect((da as any).onboarding.analysis.syncing).toBeDefined();
  });

  it("new confirm section exists in both languages", () => {
    expect((en as any).onboarding.confirm).toBeDefined();
    expect((da as any).onboarding.confirm).toBeDefined();
    expect((en as any).onboarding.confirm.orgMap).toBeDefined();
    expect((da as any).onboarding.confirm.orgMap).toBeDefined();
  });

  it("category labels exist in connectTools", () => {
    const ct = (en as any).onboarding.connectTools;
    expect(ct.categoryCommunication).toBeDefined();
    expect(ct.categoryCrm).toBeDefined();
    expect(ct.categorySupport).toBeDefined();
    expect(ct.categoryAccounting).toBeDefined();
    expect(ct.categoryCommerce).toBeDefined();
    expect(ct.categoryMarketing).toBeDefined();
  });
});

// ── 3. Connector Status Filtering ───────────────────────────────────────────

describe("Connector status filtering", () => {
  const ACTIVE_STATUSES = ["active", "paused", "pending"];
  const INACTIVE_STATUSES = ["error", "disconnected"];

  function filterActive(connectors: { provider: string; status: string }[]) {
    return connectors.filter(c => c.status !== "error" && c.status !== "disconnected");
  }

  it("excludes error connectors from connected count", () => {
    const connectors = [
      { provider: "google", status: "active" },
      { provider: "slack", status: "error" },
      { provider: "hubspot", status: "active" },
    ];
    const active = filterActive(connectors);
    expect(active).toHaveLength(2);
    expect(active.map(c => c.provider)).toEqual(["google", "hubspot"]);
  });

  it("excludes disconnected connectors from connected count", () => {
    const connectors = [
      { provider: "google", status: "disconnected" },
      { provider: "hubspot", status: "active" },
    ];
    const active = filterActive(connectors);
    expect(active).toHaveLength(1);
    expect(active[0].provider).toBe("hubspot");
  });

  it("keeps active and paused connectors", () => {
    const connectors = [
      { provider: "google", status: "active" },
      { provider: "slack", status: "paused" },
      { provider: "hubspot", status: "pending" },
    ];
    const active = filterActive(connectors);
    expect(active).toHaveLength(3);
  });

  it("returns empty for all-error connectors", () => {
    const connectors = [
      { provider: "google", status: "error" },
      { provider: "slack", status: "disconnected" },
    ];
    const active = filterActive(connectors);
    expect(active).toHaveLength(0);
  });
});

// ── 4. Vercel.json Cron Config ──────────────────────────────────────────────

describe("Vercel.json cron config", () => {
  it("does not include recover-stuck-agents cron (replaced by worker)", () => {
    const vercelPath = path.resolve(__dirname, "../vercel.json");
    const vercel = JSON.parse(fs.readFileSync(vercelPath, "utf-8"));

    const recoverCron = vercel.crons.find(
      (c: { path: string }) => c.path === "/api/cron/recover-stuck-agents",
    );
    expect(recoverCron).toBeUndefined();
  });
});
