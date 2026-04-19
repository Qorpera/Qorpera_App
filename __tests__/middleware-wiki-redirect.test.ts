import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/rate-limiter", () => ({
  rateLimit: vi.fn().mockResolvedValue({
    success: true,
    remaining: 29,
    reset: Date.now() + 60000,
  }),
}));

import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

function requestFor(url: string): NextRequest {
  return new NextRequest(url);
}

describe("middleware: legacy /wiki?page= redirect", () => {
  it("redirects /wiki?page=X to /wiki/X with 308", async () => {
    const res = await middleware(requestFor("http://localhost/wiki?page=mikkel-toft"));
    expect(res.status).toBe(308);
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/wiki/mikkel-toft");
    expect(loc.searchParams.has("page")).toBe(false);
  });

  it("preserves other query params when redirecting", async () => {
    const res = await middleware(
      requestFor("http://localhost/wiki?page=mikkel-toft&type=person&domain=sales"),
    );
    expect(res.status).toBe(308);
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.pathname).toBe("/wiki/mikkel-toft");
    expect(loc.searchParams.get("type")).toBe("person");
    expect(loc.searchParams.get("domain")).toBe("sales");
    expect(loc.searchParams.has("page")).toBe(false);
  });

  it("encodes the slug in the redirect target", async () => {
    const res = await middleware(requestFor("http://localhost/wiki?page=needs%20encoding"));
    expect(res.status).toBe(308);
    const location = res.headers.get("location") ?? "";
    // URL-encoded space should appear in the raw header value.
    expect(location).toContain("/wiki/needs%20encoding");
  });

  it("does not fire the legacy redirect for /wiki?type=person (no page param)", async () => {
    const res = await middleware(requestFor("http://localhost/wiki?type=person"));
    // The legacy redirect is uniquely 308 → /wiki/...; anything else is
    // downstream middleware behaviour (e.g. 302 to /login for missing session).
    if (res.status === 308) {
      const loc = new URL(res.headers.get("location") ?? "");
      expect(loc.pathname.startsWith("/wiki/")).toBe(false);
    }
  });

  it("does not fire the legacy redirect for /wiki/mikkel-toft?page=something (already on slug route)", async () => {
    const res = await middleware(
      requestFor("http://localhost/wiki/mikkel-toft?page=something"),
    );
    if (res.status === 308) {
      const loc = new URL(res.headers.get("location") ?? "");
      expect(loc.pathname).not.toBe("/wiki/something");
    }
  });
});
