import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const source = readFileSync(
  path.resolve(__dirname, "../src/app/situations/page.tsx"),
  "utf-8",
);

describe("situations deep-link (?id=X auto-open)", () => {
  it("imports useSearchParams from next/navigation", () => {
    expect(source).toMatch(
      /import\s*\{[^}]*\buseSearchParams\b[^}]*\}\s*from\s*["']next\/navigation["']/,
    );
  });

  it("reads the id query param and sets it as the selection", () => {
    expect(source).toContain('searchParams?.get("id")');
    expect(source).toMatch(/setSelectedId\(urlId\)/);
  });

  it("guards against redundant re-selection when URL id already matches", () => {
    // `urlId !== selectedId` prevents re-setting state on every render
    expect(source).toMatch(/urlId\s*!==\s*selectedId/);
  });

  it("uses a one-way URL→state dep array (searchParams only, selectedId deliberately omitted)", () => {
    // This is the load-bearing assertion for scenario 4: after a manual list
    // click updates selectedId, the effect must NOT re-fire and override the
    // user's choice with the stale URL id. The only way that guarantee holds
    // is if selectedId is not in the dep array — which requires the
    // exhaustive-deps lint disable on the same effect.
    const deepLinkEffect =
      /\/\/ Deep-link support[\s\S]*?\}\s*,\s*\[searchParams\]\)\s*;\s*\/\/\s*eslint-disable-line\s+react-hooks\/exhaustive-deps/;
    expect(source).toMatch(deepLinkEffect);
  });
});
