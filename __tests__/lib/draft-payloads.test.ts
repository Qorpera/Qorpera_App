vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/connectors/registry", () => ({ getProvider: vi.fn() }));
vi.mock("@/lib/encryption", () => ({ decrypt: vi.fn(), encrypt: vi.fn() }));

import { describe, it, expect, vi } from "vitest";
import { ReasoningOutputSchema } from "@/lib/reasoning-types";
import type { ConnectorCapability } from "@/lib/context-assembly";

// ── 1. ReasoningOutputSchema — actionPlan field ─────────────────────────────

describe("ReasoningOutputSchema — actionPlan field", () => {
  const validBase = {
    analysis: "Entity shows declining engagement based on communication patterns.",
    evidenceSummary: "Email volume dropped 60%. No meetings in 14 days. Last invoice overdue.",
    consideredActions: [{
      action: "send_email",
      evidenceFor: ["14-day email silence"],
      evidenceAgainst: [],
      expectedOutcome: "Re-engage customer",
    }],
    confidence: 0.8,
    missingContext: null,
  };

  it("accepts output with single-step actionPlan", () => {
    const result = ReasoningOutputSchema.safeParse({
      ...validBase,
      actionPlan: [{
        title: "Send follow-up email",
        description: "Re-engage the customer via email.",
        executionMode: "action",
        actionCapabilityName: "send_email",
        params: { to: "client@example.com", subject: "Checking in" },
      }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actionPlan).toHaveLength(1);
      expect(result.data.actionPlan![0].executionMode).toBe("action");
    }
  });

  it("accepts output with multi-step actionPlan", () => {
    const result = ReasoningOutputSchema.safeParse({
      ...validBase,
      actionPlan: [
        {
          title: "Draft analysis",
          description: "Generate a summary of the situation.",
          executionMode: "generate",
        },
        {
          title: "Send email",
          description: "Send the analysis to the client.",
          executionMode: "action",
          actionCapabilityName: "send_email",
          params: { to: "client@example.com" },
        },
        {
          title: "Schedule follow-up call",
          description: "Have the account manager call the client.",
          executionMode: "human_task",
          assignedUserId: "user123",
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actionPlan).toHaveLength(3);
    }
  });

  it("accepts output with null actionPlan", () => {
    const result = ReasoningOutputSchema.safeParse({
      ...validBase,
      actionPlan: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actionPlan).toBeNull();
    }
  });

  it("accepts output with escalation", () => {
    const result = ReasoningOutputSchema.safeParse({
      ...validBase,
      actionPlan: null,
      escalation: {
        rationale: "This customer represents significant revenue risk that needs strategic review.",
        suggestedSteps: [{
          title: "Leadership review",
          description: "Review account health with VP Sales.",
          executionMode: "human_task",
        }],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.escalation).not.toBeNull();
      expect(result.data.escalation!.suggestedSteps).toHaveLength(1);
    }
  });

  it("accepts output without escalation field", () => {
    const result = ReasoningOutputSchema.safeParse({
      ...validBase,
      actionPlan: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.escalation).toBeUndefined();
    }
  });

  it("rejects actionPlan step with invalid executionMode", () => {
    const result = ReasoningOutputSchema.safeParse({
      ...validBase,
      actionPlan: [{
        title: "Bad step",
        description: "This has an invalid mode.",
        executionMode: "invalid_mode",
      }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects actionPlan step missing title", () => {
    const result = ReasoningOutputSchema.safeParse({
      ...validBase,
      actionPlan: [{
        description: "Missing title.",
        executionMode: "action",
      }],
    });
    expect(result.success).toBe(false);
  });
});

// ── 2. Connector Capability Mapping ─────────────────────────────────────────

describe("connector capability mapping", () => {
  // Replicate the mapping logic from context-assembly.ts for unit testing
  const PROVIDER_TYPES: Record<string, string[]> = {
    google: ["gmail", "google_drive", "google_calendar", "google_sheets"],
    microsoft: ["outlook", "onedrive", "teams", "microsoft_calendar"],
    slack: ["slack"],
    hubspot: ["hubspot"],
    stripe: ["stripe"],
  };

  function mapConnectors(
    connectors: Array<{ provider: string; name: string; userId: string | null }>,
  ): ConnectorCapability[] {
    const seen = new Set<string>();
    return connectors.flatMap((c) => {
      const types = PROVIDER_TYPES[c.provider] ?? [c.provider];
      return types
        .filter((type) => {
          const key = `${c.provider}:${type}:${c.userId ? "personal" : "company"}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((type) => ({
          provider: c.provider,
          type,
          scope: c.userId ? "personal" as const : "company" as const,
        }));
    });
  }

  it("maps google connector to 4 capability types", () => {
    const result = mapConnectors([{ provider: "google", name: "Gmail", userId: "user1" }]);
    expect(result).toHaveLength(4);
    expect(result.map(r => r.type)).toEqual(["gmail", "google_drive", "google_calendar", "google_sheets"]);
    expect(result.every(r => r.scope === "personal")).toBe(true);
  });

  it("maps microsoft connector to 4 capability types", () => {
    const result = mapConnectors([{ provider: "microsoft", name: "Outlook", userId: "user1" }]);
    expect(result).toHaveLength(4);
    expect(result.map(r => r.type)).toEqual(["outlook", "onedrive", "teams", "microsoft_calendar"]);
  });

  it("maps slack connector to 1 capability type with company scope", () => {
    const result = mapConnectors([{ provider: "slack", name: "Slack", userId: null }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ provider: "slack", type: "slack", scope: "company" });
  });

  it("maps hubspot and stripe as company-scoped", () => {
    const result = mapConnectors([
      { provider: "hubspot", name: "HubSpot", userId: null },
      { provider: "stripe", name: "Stripe", userId: null },
    ]);
    expect(result).toHaveLength(2);
    expect(result.every(r => r.scope === "company")).toBe(true);
  });

  it("deduplicates when multiple users have same provider", () => {
    const result = mapConnectors([
      { provider: "google", name: "Gmail - Alice", userId: "user1" },
      { provider: "google", name: "Gmail - Bob", userId: "user2" },
    ]);
    // Both are personal scope, so they should be deduped
    expect(result).toHaveLength(4);
    expect(result.filter(r => r.type === "gmail")).toHaveLength(1);
  });

  it("keeps both personal and company scopes for same provider", () => {
    // This case shouldn't happen in practice (google is always personal),
    // but tests the dedup key includes scope
    const result = mapConnectors([
      { provider: "slack", name: "Slack Bot", userId: null },
      { provider: "slack", name: "Slack User", userId: "user1" },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].scope).toBe("company");
    expect(result[1].scope).toBe("personal");
  });

  it("handles unknown provider gracefully — uses provider as type", () => {
    const result = mapConnectors([{ provider: "notion", name: "Notion", userId: null }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ provider: "notion", type: "notion", scope: "company" });
  });

  it("returns empty array for no connectors", () => {
    const result = mapConnectors([]);
    expect(result).toEqual([]);
  });

  it("handles full operator setup (google + microsoft + slack + hubspot + stripe)", () => {
    const result = mapConnectors([
      { provider: "google", name: "Gmail", userId: "user1" },
      { provider: "microsoft", name: "Outlook", userId: "user2" },
      { provider: "slack", name: "Slack", userId: null },
      { provider: "hubspot", name: "HubSpot", userId: null },
      { provider: "stripe", name: "Stripe", userId: null },
    ]);
    // 4 + 4 + 1 + 1 + 1 = 11
    expect(result).toHaveLength(11);
    expect(result.filter(r => r.provider === "google")).toHaveLength(4);
    expect(result.filter(r => r.provider === "microsoft")).toHaveLength(4);
    expect(result.filter(r => r.scope === "personal")).toHaveLength(8);
    expect(result.filter(r => r.scope === "company")).toHaveLength(3);
  });
});
