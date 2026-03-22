import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({ prisma: {} }));

vi.mock("@/lib/connectors/google-auth", () => ({
  getValidAccessToken: vi.fn().mockResolvedValue("mock-google-token"),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Imports ──────────────────────────────────────────────────────────────────

import { googleAdsProvider } from "@/lib/connectors/google-ads-provider";
import { metaAdsProvider } from "@/lib/connectors/meta-ads-provider";
import { linkedinProvider } from "@/lib/connectors/linkedin-provider";

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════
// GOOGLE ADS
// ═══════════════════════════════════════════════════════════════════

describe("Google Ads writeCapabilities", () => {
  const slugs = (googleAdsProvider.writeCapabilities || []).map((c) => c.slug);
  it.each([
    "pause_campaign", "enable_campaign", "update_campaign_budget",
    "pause_ad_group", "enable_ad_group", "update_keyword_bid",
  ])("includes %s", (slug) => expect(slugs).toContain(slug));
});

describe("Google Ads executeAction routing", () => {
  const config = { access_token: "t", refresh_token: "r", token_expiry: new Date(Date.now() + 3600000).toISOString(), customer_id: "123" };

  it("routes unknown to error", async () => {
    const r = await googleAdsProvider.executeAction!(config, "nope", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("Unknown");
  });

  it.each([
    "pause_campaign", "enable_campaign", "update_campaign_budget",
    "pause_ad_group", "enable_ad_group", "update_keyword_bid",
  ])("routes %s (not unknown)", async (slug) => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "err" });
    const r = await googleAdsProvider.executeAction!(config, slug, {});
    if (!r.success) expect(r.error).not.toContain("Unknown");
  });
});

describe("Google Ads param validation", () => {
  const config = { access_token: "t", refresh_token: "r", token_expiry: new Date(Date.now() + 3600000).toISOString(), customer_id: "123" };

  it("pause_campaign rejects missing campaignId", async () => {
    const r = await googleAdsProvider.executeAction!(config, "pause_campaign", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("campaignId");
  });

  it("update_campaign_budget rejects missing campaignBudgetId", async () => {
    const r = await googleAdsProvider.executeAction!(config, "update_campaign_budget", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("campaignBudgetId");
  });

  it("update_campaign_budget rejects non-positive amount", async () => {
    const r = await googleAdsProvider.executeAction!(config, "update_campaign_budget", { campaignBudgetId: "b1", newDailyBudgetMicros: -100 });
    expect(r.success).toBe(false);
    expect(r.error).toContain("positive");
  });

  it("pause_ad_group rejects missing adGroupId", async () => {
    const r = await googleAdsProvider.executeAction!(config, "pause_ad_group", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("adGroupId");
  });

  it("update_keyword_bid rejects missing adGroupCriterionId", async () => {
    const r = await googleAdsProvider.executeAction!(config, "update_keyword_bid", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("adGroupCriterionId");
  });
});

describe("Google Ads campaign status toggle", () => {
  const config = { access_token: "t", refresh_token: "r", token_expiry: new Date(Date.now() + 3600000).toISOString(), customer_id: "123" };

  it("pause_campaign sends PAUSED status", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const r = await googleAdsProvider.executeAction!(config, "pause_campaign", { campaignId: "c1" });
    expect(r.success).toBe(true);
    expect((r.result as any).status).toBe("PAUSED");
  });

  it("enable_campaign sends ENABLED status", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const r = await googleAdsProvider.executeAction!(config, "enable_campaign", { campaignId: "c1" });
    expect(r.success).toBe(true);
    expect((r.result as any).status).toBe("ENABLED");
  });
});

// ═══════════════════════════════════════════════════════════════════
// META ADS
// ═══════════════════════════════════════════════════════════════════

describe("Meta Ads writeCapabilities", () => {
  const slugs = (metaAdsProvider.writeCapabilities || []).map((c) => c.slug);
  it.each([
    "pause_campaign", "enable_campaign", "update_campaign_budget",
    "pause_ad_set", "enable_ad_set", "update_ad_set_budget",
  ])("includes %s", (slug) => expect(slugs).toContain(slug));
});

describe("Meta Ads executeAction routing", () => {
  const config = { access_token: "t", ad_account_id: "act_123" };

  it("routes unknown to error", async () => {
    const r = await metaAdsProvider.executeAction!(config, "nope", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("Unknown");
  });

  it.each([
    "pause_campaign", "enable_campaign", "update_campaign_budget",
    "pause_ad_set", "enable_ad_set", "update_ad_set_budget",
  ])("routes %s (not unknown)", async (slug) => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "err" });
    const r = await metaAdsProvider.executeAction!(config, slug, {});
    if (!r.success) expect(r.error).not.toContain("Unknown");
  });
});

describe("Meta Ads param validation", () => {
  const config = { access_token: "t" };

  it("pause_campaign rejects missing campaignId", async () => {
    const r = await metaAdsProvider.executeAction!(config, "pause_campaign", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("campaignId");
  });

  it("pause_ad_set rejects missing adSetId", async () => {
    const r = await metaAdsProvider.executeAction!(config, "pause_ad_set", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("adSetId");
  });

  it("update_campaign_budget rejects missing budget fields", async () => {
    const r = await metaAdsProvider.executeAction!(config, "update_campaign_budget", { campaignId: "c1" });
    expect(r.success).toBe(false);
    expect(r.error).toContain("dailyBudget");
  });
});

describe("Meta Ads campaign status toggle", () => {
  const config = { access_token: "t" };

  it("pause_campaign sends PAUSED", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    const r = await metaAdsProvider.executeAction!(config, "pause_campaign", { campaignId: "c1" });
    expect(r.success).toBe(true);
    expect((r.result as any).status).toBe("PAUSED");
  });

  it("enable_campaign sends ACTIVE", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    const r = await metaAdsProvider.executeAction!(config, "enable_campaign", { campaignId: "c1" });
    expect(r.success).toBe(true);
    expect((r.result as any).status).toBe("ACTIVE");
  });
});

// ═══════════════════════════════════════════════════════════════════
// LINKEDIN
// ═══════════════════════════════════════════════════════════════════

describe("LinkedIn writeCapabilities", () => {
  const slugs = (linkedinProvider.writeCapabilities || []).map((c) => c.slug);
  it.each(["create_post", "delete_post"])(
    "includes %s", (slug) => expect(slugs).toContain(slug)
  );
});

describe("LinkedIn executeAction routing", () => {
  const config = { access_token: "t", organization_id: "org123" };

  it("routes unknown to error", async () => {
    const r = await linkedinProvider.executeAction!(config, "nope", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("Unknown");
  });

  it.each(["create_post", "delete_post"])("routes %s (not unknown)", async (slug) => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => "err", headers: new Headers() });
    const r = await linkedinProvider.executeAction!(config, slug, {});
    if (!r.success) expect(r.error).not.toContain("Unknown");
  });
});

describe("LinkedIn param validation", () => {
  const config = { access_token: "t", organization_id: "org123" };

  it("create_post rejects missing text", async () => {
    const r = await linkedinProvider.executeAction!(config, "create_post", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("text");
  });

  it("create_post rejects missing visibility", async () => {
    const r = await linkedinProvider.executeAction!(config, "create_post", { text: "Hello" });
    expect(r.success).toBe(false);
    expect(r.error).toContain("visibility");
  });

  it("delete_post rejects missing postId", async () => {
    const r = await linkedinProvider.executeAction!(config, "delete_post", {});
    expect(r.success).toBe(false);
    expect(r.error).toContain("postId");
  });
});

describe("LinkedIn create_post constructs correct URN", () => {
  const config = { access_token: "t", organization_id: "org456" };

  it("includes organization URN in author field", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
      headers: new Headers({ "x-restli-id": "urn:li:share:12345" }),
    });

    await linkedinProvider.executeAction!(config, "create_post", {
      text: "Hello LinkedIn",
      visibility: "PUBLIC",
    });

    const call = mockFetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.author).toBe("urn:li:organization:org456");
    expect(body.commentary).toBe("Hello LinkedIn");
    expect(body.visibility).toBe("PUBLIC");
    expect(body.lifecycleState).toBe("PUBLISHED");
  });
});

// ═══════════════════════════════════════════════════════════════════
// TOTAL CAPABILITY COUNT
// ═══════════════════════════════════════════════════════════════════

describe("Total capability count across all providers", () => {
  it("all providers have writeCapabilities defined", async () => {
    // Import all providers
    const { googleProvider } = await import("@/lib/connectors/google-provider");
    const { microsoftProvider } = await import("@/lib/connectors/microsoft-provider");
    const { slackProvider } = await import("@/lib/connectors/slack-provider");
    const { hubspotProvider } = await import("@/lib/connectors/hubspot");
    const { stripeProvider } = await import("@/lib/connectors/stripe");
    const { economicProvider } = await import("@/lib/connectors/economic-provider");
    const { shopifyProvider } = await import("@/lib/connectors/shopify-provider");
    const { intercomProvider } = await import("@/lib/connectors/intercom-provider");
    const { zendeskProvider } = await import("@/lib/connectors/zendesk-provider");
    const { pipedriveProvider } = await import("@/lib/connectors/pipedrive-provider");
    const { salesforceProvider } = await import("@/lib/connectors/salesforce-provider");

    const allProviders = [
      googleProvider, microsoftProvider, slackProvider,
      hubspotProvider, stripeProvider, economicProvider, shopifyProvider,
      intercomProvider, zendeskProvider, pipedriveProvider, salesforceProvider,
      googleAdsProvider, metaAdsProvider, linkedinProvider,
    ];

    // Every provider should have writeCapabilities
    for (const p of allProviders) {
      expect(p.writeCapabilities).toBeDefined();
      expect(p.writeCapabilities!.length).toBeGreaterThan(0);
    }

    // Total count should be in the ~130+ range
    const total = allProviders.reduce((sum, p) => sum + (p.writeCapabilities?.length || 0), 0);
    expect(total).toBeGreaterThanOrEqual(120);
  });
});
