vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/connectors/registry", () => ({ getProvider: vi.fn() }));
vi.mock("@/lib/encryption", () => ({ decrypt: vi.fn(), encrypt: vi.fn() }));

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ReasoningOutputSchema,
  DraftPayloadSchema,
  DraftAttachmentSchema,
} from "@/lib/reasoning-types";
import type { ConnectorCapability } from "@/lib/context-assembly";

// ── 1. Zod Schema Validation ────────────────────────────────────────────────

describe("DraftAttachmentSchema", () => {
  it("accepts a valid spreadsheet attachment", () => {
    const result = DraftAttachmentSchema.safeParse({
      type: "spreadsheet",
      title: "Q1 Revenue",
      data: {
        format: "spreadsheet",
        headers: ["Month", "Revenue"],
        rows: [["Jan", 50000], ["Feb", 62000]],
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid document attachment", () => {
    const result = DraftAttachmentSchema.safeParse({
      type: "document",
      title: "Meeting Notes",
      description: "Notes from client call",
      data: {
        format: "document",
        content: "Discussed renewal timeline and pricing...",
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts null values in spreadsheet rows", () => {
    const result = DraftAttachmentSchema.safeParse({
      type: "spreadsheet",
      title: "Report",
      data: {
        format: "spreadsheet",
        headers: ["Name", "Value"],
        rows: [["Total", null]],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown attachment type", () => {
    const result = DraftAttachmentSchema.safeParse({
      type: "image",
      title: "Logo",
      data: { format: "document", content: "..." },
    });
    expect(result.success).toBe(false);
  });

  it("rejects spreadsheet data with missing headers", () => {
    const result = DraftAttachmentSchema.safeParse({
      type: "spreadsheet",
      title: "Sheet",
      data: {
        format: "spreadsheet",
        rows: [["a", "b"]],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("DraftPayloadSchema", () => {
  it("accepts a valid email payload", () => {
    const result = DraftPayloadSchema.safeParse({
      actionType: "send_email",
      provider: "gmail",
      payload: {
        to: "alice@example.com",
        subject: "Follow-up on overdue invoice",
        body: "Hi Alice, I wanted to follow up regarding invoice #1234...",
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a payload without provider (optional)", () => {
    const result = DraftPayloadSchema.safeParse({
      actionType: "flag_for_review",
      payload: { reason: "Needs manual inspection" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a payload with attachments", () => {
    const result = DraftPayloadSchema.safeParse({
      actionType: "create_spreadsheet",
      provider: "google_drive",
      payload: { title: "Monthly Report" },
      attachments: [{
        type: "spreadsheet",
        title: "Revenue",
        data: {
          format: "spreadsheet",
          headers: ["Month", "Amount"],
          rows: [["March", 45000]],
        },
      }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown provider enum value", () => {
    const result = DraftPayloadSchema.safeParse({
      actionType: "send_email",
      provider: "yahoo",
      payload: { to: "a@b.com" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing payload field", () => {
    const result = DraftPayloadSchema.safeParse({
      actionType: "send_email",
      provider: "gmail",
    });
    expect(result.success).toBe(false);
  });
});

describe("ReasoningOutputSchema — draftPayloads field", () => {
  const validBase = {
    analysis: "Entity shows declining engagement based on communication patterns.",
    evidenceSummary: "Email volume dropped 60%. No meetings in 14 days. Last invoice overdue.",
    consideredActions: [{
      action: "send_email",
      evidenceFor: ["14-day email silence"],
      evidenceAgainst: [],
      expectedOutcome: "Re-engage customer",
    }],
    chosenAction: {
      action: "send_email",
      connector: "google",
      params: { to: "client@example.com" },
      justification: "Email volume dropped 60% and no meetings in 14 days justify outreach.",
    },
    confidence: 0.8,
    missingContext: null,
  };

  it("accepts output with draftPayloads present", () => {
    const result = ReasoningOutputSchema.safeParse({
      ...validBase,
      draftPayloads: [{
        actionType: "send_email",
        provider: "gmail",
        payload: {
          to: "client@example.com",
          subject: "Checking in",
          body: "Hi, I wanted to follow up...",
        },
      }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.draftPayloads).toHaveLength(1);
      expect(result.data.draftPayloads[0].actionType).toBe("send_email");
    }
  });

  it("accepts output with empty draftPayloads array", () => {
    const result = ReasoningOutputSchema.safeParse({
      ...validBase,
      draftPayloads: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.draftPayloads).toEqual([]);
    }
  });

  it("accepts output without draftPayloads (backward compat) — defaults to []", () => {
    const result = ReasoningOutputSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.draftPayloads).toEqual([]);
    }
  });

  it("accepts compound draftPayloads (email + spreadsheet)", () => {
    const result = ReasoningOutputSchema.safeParse({
      ...validBase,
      draftPayloads: [
        {
          actionType: "send_email",
          provider: "gmail",
          payload: { to: "client@example.com", subject: "Report attached", body: "Please see the attached report." },
        },
        {
          actionType: "create_spreadsheet",
          provider: "google_drive",
          payload: { title: "Q1 Report" },
          attachments: [{
            type: "spreadsheet",
            title: "Revenue",
            data: { format: "spreadsheet", headers: ["Month", "Total"], rows: [["Jan", 50000]] },
          }],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.draftPayloads).toHaveLength(2);
    }
  });

  it("rejects draftPayloads with malformed entry", () => {
    const result = ReasoningOutputSchema.safeParse({
      ...validBase,
      draftPayloads: [{ actionType: "send_email" }], // missing payload
    });
    expect(result.success).toBe(false);
  });

  it("rejects draftPayloads that is not an array", () => {
    const result = ReasoningOutputSchema.safeParse({
      ...validBase,
      draftPayloads: "not an array",
    });
    expect(result.success).toBe(false);
  });
});

// ── 2. Executor Draft Payload Merge Logic ───────────────────────────────────

describe("executor draft payload merge logic", () => {
  // Test the merge logic in isolation — same algorithm as situation-executor.ts
  function mergeDraftPayload(
    proposedParams: Record<string, unknown>,
    reasoning: string | null,
    actionName: string,
  ): Record<string, unknown> {
    let actionParams = proposedParams;
    if (reasoning) {
      try {
        const parsed = JSON.parse(reasoning);
        const draftPayloads: Array<{ actionType: string; payload: Record<string, unknown> }> =
          parsed.draftPayloads ?? [];
        const matchingDraft = draftPayloads.find((d) => d.actionType === actionName);
        if (matchingDraft) {
          // Draft provides base content, proposed.params override for routing fields
          actionParams = { ...matchingDraft.payload, ...actionParams };
        }
      } catch {}
    }
    return actionParams;
  }

  it("merges draft payload fields into action params", () => {
    const proposed = { to: "alice@example.com" };
    const reasoning = JSON.stringify({
      draftPayloads: [{
        actionType: "send_email",
        payload: {
          to: "alice@example.com",
          subject: "Invoice follow-up",
          body: "Hi Alice, your invoice #1234 is overdue...",
        },
      }],
    });

    const result = mergeDraftPayload(proposed, reasoning, "send_email");
    expect(result.subject).toBe("Invoice follow-up");
    expect(result.body).toContain("invoice #1234");
    expect(result.to).toBe("alice@example.com");
  });

  it("proposed params override draft payload for overlapping keys", () => {
    const proposed = { to: "override@example.com", subject: "Custom subject" };
    const reasoning = JSON.stringify({
      draftPayloads: [{
        actionType: "send_email",
        payload: {
          to: "draft@example.com",
          subject: "Draft subject",
          body: "Draft body content",
        },
      }],
    });

    const result = mergeDraftPayload(proposed, reasoning, "send_email");
    // proposed.params wins for overlapping keys
    expect(result.to).toBe("override@example.com");
    expect(result.subject).toBe("Custom subject");
    // draft provides non-overlapping fields
    expect(result.body).toBe("Draft body content");
  });

  it("returns original params when no matching draft exists", () => {
    const proposed = { to: "alice@example.com" };
    const reasoning = JSON.stringify({
      draftPayloads: [{
        actionType: "send_slack_message",
        payload: { channel: "#general", message: "Hello" },
      }],
    });

    const result = mergeDraftPayload(proposed, reasoning, "send_email");
    expect(result).toEqual({ to: "alice@example.com" });
  });

  it("returns original params when draftPayloads is empty", () => {
    const proposed = { to: "alice@example.com" };
    const reasoning = JSON.stringify({ draftPayloads: [] });

    const result = mergeDraftPayload(proposed, reasoning, "send_email");
    expect(result).toEqual({ to: "alice@example.com" });
  });

  it("returns original params when draftPayloads is missing (backward compat)", () => {
    const proposed = { to: "alice@example.com" };
    const reasoning = JSON.stringify({
      analysis: "Some analysis",
      chosenAction: { action: "send_email" },
    });

    const result = mergeDraftPayload(proposed, reasoning, "send_email");
    expect(result).toEqual({ to: "alice@example.com" });
  });

  it("returns original params when reasoning is null", () => {
    const proposed = { to: "alice@example.com" };
    const result = mergeDraftPayload(proposed, null, "send_email");
    expect(result).toEqual({ to: "alice@example.com" });
  });

  it("returns original params when reasoning is malformed JSON", () => {
    const proposed = { to: "alice@example.com" };
    const result = mergeDraftPayload(proposed, "not json {{{", "send_email");
    expect(result).toEqual({ to: "alice@example.com" });
  });

  it("picks the first matching draft when multiple match", () => {
    const proposed = {};
    const reasoning = JSON.stringify({
      draftPayloads: [
        { actionType: "send_email", payload: { subject: "First match" } },
        { actionType: "send_email", payload: { subject: "Second match" } },
      ],
    });

    const result = mergeDraftPayload(proposed, reasoning, "send_email");
    expect(result.subject).toBe("First match");
  });
});

// ── 3. Connector Capability Mapping ─────────────────────────────────────────

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
