import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

// ── 1. Loading.tsx files exist for all data-fetching routes ─────────────────

describe("Route loading.tsx files", () => {
  const routes = [
    "src/app/situations/loading.tsx",
    "src/app/initiatives/loading.tsx",
    "src/app/projects/loading.tsx",
    "src/app/copilot/loading.tsx",
    "src/app/map/loading.tsx",
    "src/app/map/[domainId]/loading.tsx",
    "src/app/learning/loading.tsx",
    "src/app/governance/loading.tsx",
    "src/app/settings/loading.tsx",
    "src/app/account/loading.tsx",
    "src/app/onboarding/loading.tsx",
  ];

  for (const route of routes) {
    it(`${route} exists and exports default`, () => {
      const fullPath = path.resolve(__dirname, "..", route);
      expect(existsSync(fullPath)).toBe(true);
      const source = readFileSync(fullPath, "utf-8");
      expect(source).toContain("export default");
    });
  }
});

// ── 2. Skeleton components exist ────────────────────────────────────────────

describe("Skeleton components", () => {
  const skeletons = [
    "src/components/skeletons/skeleton.tsx",
    "src/components/skeletons/skeleton-list.tsx",
    "src/components/skeletons/skeleton-split-pane.tsx",
    "src/components/skeletons/skeleton-chat.tsx",
    "src/components/skeletons/skeleton-settings.tsx",
    "src/components/skeletons/skeleton-account.tsx",
  ];

  for (const skeleton of skeletons) {
    it(`${skeleton} exists and exports a component`, () => {
      const fullPath = path.resolve(__dirname, "..", skeleton);
      expect(existsSync(fullPath)).toBe(true);
      const source = readFileSync(fullPath, "utf-8");
      expect(source).toContain("export function");
      // Either has animate-pulse directly or imports Skeleton (which has it)
      expect(source.includes("animate-pulse") || source.includes("Skeleton")).toBe(true);
    });
  }
});

// ── 3. Empty state messages in both locales ─────────────────────────────────

describe("Empty state messages in both locales", () => {
  it("situations, initiatives, projects have emptyHint keys in both locales", async () => {
    const en = await import("../../messages/en.json");
    const da = await import("../../messages/da.json");
    const enData = en.default || en;
    const daData = da.default || da;

    // Situations
    expect(enData.situations.emptyHint).toBeTruthy();
    expect(daData.situations.emptyHint).toBeTruthy();
    expect(enData.situations.emptyHint).not.toEqual(daData.situations.emptyHint);

    // Initiatives
    expect(enData.initiatives.emptyHint).toBeTruthy();
    expect(daData.initiatives.emptyHint).toBeTruthy();

    // Projects
    expect(enData.projects.emptyHint).toBeTruthy();
    expect(daData.projects.emptyHint).toBeTruthy();
  });

  it("notifications empty state is localized", async () => {
    const en = await import("../../messages/en.json");
    const da = await import("../../messages/da.json");
    const enData = en.default || en;
    const daData = da.default || da;

    expect(enData.notifications.empty).toBeTruthy();
    expect(daData.notifications.empty).toBeTruthy();
    expect(enData.notifications.empty).not.toEqual(daData.notifications.empty);
  });
});

// ── 4. Loading files use skeleton components (not spinners) ─────────────────

describe("Loading files use skeletons", () => {
  it("situations loading uses SkeletonSplitPane", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/app/situations/loading.tsx"),
      "utf-8",
    );
    expect(source).toContain("SkeletonSplitPane");
  });

  it("copilot loading uses SkeletonChat", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/app/copilot/loading.tsx"),
      "utf-8",
    );
    expect(source).toContain("SkeletonChat");
  });

  it("map loading uses SkeletonMap", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/app/map/loading.tsx"),
      "utf-8",
    );
    expect(source).toContain("SkeletonMap");
  });
});

// ── 5. EN/DA key parity still holds after all Day 18 changes ────────────────

describe("EN/DA key parity (full Day 18)", () => {
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

  it("en.json and da.json have identical key sets", async () => {
    const en = await import("../../messages/en.json");
    const da = await import("../../messages/da.json");
    const enKeys = getKeys(en.default || en);
    const daKeys = getKeys(da.default || da);
    expect(daKeys).toEqual(enKeys);
  });
});
