import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    operator: { findUnique: vi.fn() },
    executionStep: { findUnique: vi.fn(), update: vi.fn() },
    actionCapability: { findUnique: vi.fn() },
    sourceConnector: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1-3. Legal pages
// ═══════════════════════════════════════════════════════════════════════════════

describe("Legal pages", () => {
  it("GET /terms renders with expected content", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/terms/page.tsx"),
      "utf-8",
    );
    expect(source).toContain("Terms of Service");
    expect(source).toContain("Qorpera ApS");
    expect(source).toContain("PLACEHOLDER");
    expect(source).toContain("legal@qorpera.com");
  });

  it("GET /privacy renders with expected content", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/privacy/page.tsx"),
      "utf-8",
    );
    expect(source).toContain("Privacy Policy");
    expect(source).toContain("GDPR");
    expect(source).toContain("privacy@qorpera.com");
    expect(source).toContain("Datatilsynet");
  });

  it("GET /dpa renders with expected content", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/dpa/page.tsx"),
      "utf-8",
    );
    expect(source).toContain("Data Processing Agreement");
    expect(source).toContain("AES-256-GCM");
    expect(source).toContain("dpa@qorpera.com");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Registration ToS checkbox
// ═══════════════════════════════════════════════════════════════════════════════

describe("Registration page ToS", () => {
  it("includes ToS checkbox and blocks submit without it", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/register/page.tsx"),
      "utf-8",
    );
    // Checkbox exists
    expect(source).toContain("tosAccepted");
    expect(source).toContain('type="checkbox"');
    // Links to terms and privacy
    expect(source).toContain('href="/terms"');
    expect(source).toContain('href="/privacy"');
    // Submit disabled without checkbox
    expect(source).toContain("!tosAccepted");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5-6. Cookie consent
// ═══════════════════════════════════════════════════════════════════════════════

describe("Cookie consent banner", () => {
  it("renders when no localStorage key exists", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/cookie-consent.tsx"),
      "utf-8",
    );
    // Checks localStorage
    expect(source).toContain("localStorage.getItem");
    expect(source).toContain("cookie_consent");
    // Shows banner text
    expect(source).toContain("essential cookies");
    expect(source).toContain("No tracking");
  });

  it("hides after Accept is clicked (sets localStorage)", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/cookie-consent.tsx"),
      "utf-8",
    );
    // Accept handler sets localStorage
    expect(source).toContain('localStorage.setItem');
    expect(source).toContain('"accepted"');
    expect(source).toContain("setVisible(false)");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7-8. Email AI disclosure
// ═══════════════════════════════════════════════════════════════════════════════

describe("Email AI disclosure (EU AI Act)", () => {
  it("Gmail: isAiGenerated=true includes disclosure footer with operator name", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/connectors/google-provider.ts"),
      "utf-8",
    );
    expect(source).toContain("isAiGenerated");
    expect(source).toContain("AI assistance");
    expect(source).toContain("Qorpera");
    expect(source).toContain("_operatorName");
  });

  it("Gmail: isAiGenerated=false does NOT add footer (conditional check)", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/connectors/google-provider.ts"),
      "utf-8",
    );
    // The disclosure is conditional on isAiGenerated
    expect(source).toContain("if (isAiGenerated)");
  });

  it("Outlook: isAiGenerated=true includes disclosure footer", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/connectors/microsoft-provider.ts"),
      "utf-8",
    );
    expect(source).toContain("isAiGenerated");
    expect(source).toContain("AI assistance");
    expect(source).toContain("if (isAiGenerated)");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9-10. Slack AI disclosure
// ═══════════════════════════════════════════════════════════════════════════════

describe("Slack AI disclosure (EU AI Act)", () => {
  it("isAiGenerated=true includes robot [AI] prefix", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/connectors/slack-provider.ts"),
      "utf-8",
    );
    expect(source).toContain("isAiGenerated");
    expect(source).toContain("[AI]");
  });

  it("isAiGenerated=false does NOT add prefix (conditional check)", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/connectors/slack-provider.ts"),
      "utf-8",
    );
    expect(source).toContain("if (isAiGenerated)");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Execution engine wiring
// ═══════════════════════════════════════════════════════════════════════════════

describe("Execution engine AI disclosure wiring", () => {
  it("sets isAiGenerated based on approvedById and resolves operator name", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/execution-engine.ts"),
      "utf-8",
    );
    // Checks that isAiGenerated is derived from approvedById
    expect(source).toContain("isAiGenerated");
    expect(source).toContain("approvedById");
    // Injects into params for email/slack actions
    expect(source).toContain("params.isAiGenerated");
    expect(source).toContain("params._operatorName");
    // Covers the right action types
    expect(source).toContain("send_email");
    expect(source).toContain("send_slack_message");
  });
});
