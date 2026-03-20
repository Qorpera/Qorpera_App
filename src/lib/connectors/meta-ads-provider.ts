import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

const META_API = "https://graph.facebook.com/v19.0";

// ── Helpers ──────────────────────────────────────────────

function metaFetch(
  config: ConnectorConfig,
  path: string,
): Promise<Response> {
  const accessToken = config.access_token as string;
  const separator = path.includes("?") ? "&" : "?";
  return fetch(`${META_API}/${path}${separator}access_token=${accessToken}`);
}

// ── Provider Implementation ──────────────────────────────

export const metaAdsProvider: ConnectorProvider = {
  id: "meta-ads",
  name: "Meta Ads",

  configSchema: [
    { key: "oauth", label: "Meta Business Account", type: "oauth", required: true },
  ],

  async testConnection(config) {
    try {
      const resp = await metaFetch(config, "me?fields=id,name");
      if (!resp.ok) {
        return {
          ok: false,
          error: `Meta API ${resp.status}: ${resp.statusText}`,
        };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    const adAccountId = config.ad_account_id as string;
    if (!adAccountId) return;

    const currency = (config.ad_account_currency as string) || "USD";

    // ── Sync campaigns ────────────────────────────────────
    const campaignsResp = await metaFetch(
      config,
      `${adAccountId}/campaigns?fields=id,name,status,start_time,stop_time,daily_budget,lifetime_budget&limit=100`,
    );

    if (!campaignsResp.ok) return;
    const campaignsData = await campaignsResp.json();
    const campaigns = campaignsData.data || [];

    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalCtr = 0;
    let activeCampaigns = 0;

    for (const campaign of campaigns) {
      // Fetch insights for each campaign
      let insightsPath = `${campaign.id}/insights?fields=impressions,clicks,spend,conversions,ctr`;
      if (since) {
        const sinceDate = since.toISOString().slice(0, 10);
        const untilDate = new Date().toISOString().slice(0, 10);
        insightsPath += `&time_range={"since":"${sinceDate}","until":"${untilDate}"}`;
      } else {
        insightsPath += "&date_preset=last_30d";
      }

      let insights: any = null;
      try {
        const insightsResp = await metaFetch(config, insightsPath);
        if (insightsResp.ok) {
          const insightsData = await insightsResp.json();
          insights = insightsData.data?.[0];
        }
      } catch {
        // Continue without insights
      }

      const spend = insights?.spend ? parseFloat(insights.spend) : 0;
      const impressions = insights?.impressions ? parseInt(insights.impressions) : 0;
      const clicks = insights?.clicks ? parseInt(insights.clicks) : 0;
      const conversions = insights?.conversions ? parseInt(insights.conversions) : 0;
      const ctr = insights?.ctr ? parseFloat(insights.ctr) : 0;

      totalSpend += spend;
      totalImpressions += impressions;
      totalClicks += clicks;
      totalCtr += ctr;
      activeCampaigns++;

      yield {
        kind: "event" as const,
        data: {
          eventType: "campaign.synced",
          payload: {
            id: campaign.id,
            name: campaign.name,
            status: campaign.status?.toLowerCase(),
            platform: "meta_ads",
            budget: campaign.daily_budget || campaign.lifetime_budget,
            spend,
            currency,
            impressions,
            clicks,
            conversions,
            ctr,
            startDate: campaign.start_time,
            endDate: campaign.stop_time,
          },
        },
      };

      yield {
        kind: "activity" as const,
        data: {
          signalType: "campaign_synced",
          metadata: {
            platform: "meta_ads",
            impressions,
            clicks,
            spend,
          },
          occurredAt: new Date(),
        },
      };
    }

    // ── Performance summary content ───────────────────────
    if (activeCampaigns > 0) {
      const avgCTR = (totalCtr / activeCampaigns * 100).toFixed(2);
      yield {
        kind: "content" as const,
        data: {
          sourceType: "ads_performance_summary",
          sourceId: "meta-ads-summary",
          content: `Meta Ads Performance: ${activeCampaigns} active campaigns, ${totalSpend.toFixed(2)} total spend, ${totalClicks} clicks, ${avgCTR}% average CTR`,
          metadata: { platform: "meta_ads" },
        },
      };
    }
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [];
  },

  async inferSchema(config): Promise<InferredSchema[]> {
    const adAccountId = config.ad_account_id as string;
    if (!adAccountId) return [];

    try {
      const resp = await metaFetch(
        config,
        `${adAccountId}/campaigns?fields=id,name,status&limit=5`,
      );
      if (!resp.ok) return [];
      const data = await resp.json();
      const records = data.data || [];

      return [
        {
          suggestedTypeName: "Campaign",
          suggestedProperties: [
            { name: "name", dataType: "STRING", sampleValues: records.map((r: any) => r.name).filter(Boolean).slice(0, 5) },
            { name: "status", dataType: "STRING", sampleValues: records.map((r: any) => r.status).filter(Boolean).slice(0, 5) },
            { name: "platform", dataType: "STRING", sampleValues: ["meta_ads"] },
          ],
          sampleEntities: records.map((r: any) => ({
            name: r.name || "",
            status: r.status || "",
            platform: "meta_ads",
          })),
          recordCount: records.length,
        },
      ];
    } catch {
      return [];
    }
  },
};
