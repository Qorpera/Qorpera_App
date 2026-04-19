import { describe, it, expect } from "vitest";
import { buildWikiUrl } from "@/app/wiki/wiki-url";

function params(qs: string): URLSearchParams {
  return new URLSearchParams(qs);
}

describe("buildWikiUrl", () => {
  it("navigates to /wiki/{slug} preserving filters", () => {
    expect(
      buildWikiUrl("/wiki", params("type=person"), "page", "mikkel-toft"),
    ).toBe("/wiki/mikkel-toft?type=person");
  });

  it("returns to /wiki index when page=''", () => {
    expect(
      buildWikiUrl("/wiki/mikkel-toft", params("type=person"), "page", ""),
    ).toBe("/wiki?type=person");
  });

  it("adds a filter on a detail page without losing the slug", () => {
    expect(
      buildWikiUrl("/wiki/mikkel-toft", params(""), "type", "person"),
    ).toBe("/wiki/mikkel-toft?type=person");
  });

  it("clears a filter on a detail page", () => {
    expect(
      buildWikiUrl("/wiki/mikkel-toft", params("type=person"), "type", ""),
    ).toBe("/wiki/mikkel-toft");
  });

  it("replaces slug without stacking a stale ?page=", () => {
    expect(
      buildWikiUrl(
        "/wiki/old-slug",
        params("page=old-slug&type=person"),
        "page",
        "mikkel-toft",
      ),
    ).toBe("/wiki/mikkel-toft?type=person");
  });

  it("returns bare /wiki when no filters remain", () => {
    expect(buildWikiUrl("/wiki/anything", params(""), "page", "")).toBe("/wiki");
  });
});
