import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

// ── 1. Sidebar drawer — mobile structure ────────────────────────────────────

describe("Mobile sidebar drawer", () => {
  it("app-shell has mobile drawer with backdrop and hamburger", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/components/app-shell.tsx"),
      "utf-8",
    );
    // Has hamburger icon component or inline
    expect(source).toContain("HamburgerIcon");
    // Has mobile nav state
    expect(source).toContain("mobileNavOpen");
    // Has backdrop for drawer
    expect(source).toContain("bg-overlay");
    // Has media query usage
    expect(source).toContain("useMediaQuery");
    // Closes on Escape
    expect(source).toContain("Escape");
  });

  it("app-nav accepts onNavClick prop for drawer close", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/components/app-nav.tsx"),
      "utf-8",
    );
    expect(source).toContain("onNavClick");
    expect(source).toContain("onClick={onNavClick}");
  });
});

// ── 2. Split-pane mobile — back button ──────────────────────────────────────

describe("Split-pane mobile mode", () => {
  const splitPanePages = [
    "src/app/situations/page.tsx",
    "src/app/initiatives/page.tsx",
    "src/app/projects/page.tsx",
  ];

  for (const pagePath of splitPanePages) {
    it(`${pagePath} uses useIsMobile for responsive layout`, () => {
      const source = readFileSync(
        path.resolve(__dirname, "..", pagePath),
        "utf-8",
      );
      expect(source).toContain("useIsMobile");
      expect(source).toContain("isMobile");
    });
  }
});

// ── 3. Touch targets — 44px minimum ────────────────────────────────────────

describe("Touch targets", () => {
  it("app-nav links have min-h-[44px]", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/components/app-nav.tsx"),
      "utf-8",
    );
    expect(source).toContain("min-h-[44px]");
  });

  it("login submit button has min-h-[44px]", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/app/login/page.tsx"),
      "utf-8",
    );
    expect(source).toContain("min-h-[44px]");
  });

  it("mobile hamburger has min-h-[44px]", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/components/app-shell.tsx"),
      "utf-8",
    );
    // Hamburger button should have touch-friendly sizing
    expect(source).toContain("min-h-[44px]");
    expect(source).toContain("min-w-[44px]");
  });
});

// ── 4. Input font size — iOS zoom prevention ───────────────────────────────

describe("Input font size for iOS zoom prevention", () => {
  it("Input component uses text-base for 16px font", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/components/ui/input.tsx"),
      "utf-8",
    );
    // Should have text-base (16px on mobile) to prevent iOS zoom
    expect(source).toContain("text-base");
  });

  it("copilot textarea uses text-base", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/app/copilot/page.tsx"),
      "utf-8",
    );
    expect(source).toContain("text-base");
  });
});

// ── 5. Modal mobile behavior ────────────────────────────────────────────────

describe("Modal mobile full-screen", () => {
  it("modal has mobile-responsive classes", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/components/ui/modal.tsx"),
      "utf-8",
    );
    // Should have responsive width classes for mobile
    expect(source).toMatch(/w-full|inset-0/);
    // Close button should have touch target
    expect(source).toContain("min-h-[44px]");
  });
});

// ── 6. Notification bell mobile ─────────────────────────────────────────────

describe("Notification bell mobile", () => {
  it("notification dropdown becomes full-screen on mobile", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/components/notification-bell.tsx"),
      "utf-8",
    );
    expect(source).toContain("useIsMobile");
    expect(source).toContain("fixed inset-0");
  });
});

// ── 7. useMediaQuery hook exists ────────────────────────────────────────────

describe("useMediaQuery hook", () => {
  it("exports useMediaQuery and useIsMobile", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/hooks/use-media-query.ts"),
      "utf-8",
    );
    expect(source).toContain("export function useMediaQuery");
    expect(source).toContain("export function useIsMobile");
    expect(source).toContain("matchMedia");
  });
});

// ── 8. Contextual chat collapses on mobile ──────────────────────────────────

describe("Contextual chat mobile", () => {
  it("contextual chat collapses on mobile with expand button", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/components/contextual-chat.tsx"),
      "utf-8",
    );
    expect(source).toContain("useIsMobile");
    expect(source).toContain("expanded");
    expect(source).toContain("setExpanded");
  });
});
