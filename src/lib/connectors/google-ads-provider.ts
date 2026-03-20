import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";
import { getValidAccessToken } from "./google-auth";

const ADS_API = "https://googleads.googleapis.com/v17";

// ── Helpers ──────────────────────────────────────────────

function getAdsHeaders(accessToken: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "",
  };
  if (process.env.GOOGLE_ADS_MANAGER_ACCOUNT_ID) {
    headers["login-customer-id"] = process.env.GOOGLE_ADS_MANAGER_ACCOUNT_ID;
  }
  return headers;
}

async function searchStream(
  accessToken: string,
  customerId: string,
  query: string,
): Promise<any[]> {
  const resp = await fetch(
    `${ADS_API}/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers: getAdsHeaders(accessToken),
      body: JSON.stringify({ query }),
    },
  );
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Google Ads API ${resp.status}: ${err}`);
  }
  const data = await resp.json();
  // searchStream returns an array of batches, each with results
  const results: any[] = [];
  for (const batch of data) {
    if (batch.results) {
      results.push(...batch.results);
    }
  }
  return results;
}

// ── Provider Implementation ──────────────────────────────

export const googleAdsProvider: ConnectorProvider = {
  id: "google-ads",
  name: "Google Ads",

  configSchema: [
    { key: "oauth", label: "Google Ads Account", type: "oauth", required: true },
  ],

  async testConnection(config) {
    try {
      const accessToken = await getValidAccessToken(config);
      const resp = await fetch(
        `${ADS_API}/customers:listAccessibleCustomers`,
        { headers: getAdsHeaders(accessToken) },
      );
      if (!resp.ok) {
        return {
          ok: false,
          error: `Google Ads API ${resp.status}: ${resp.statusText}`,
        };
      }
      const data = await resp.json();
      const customerIds: string[] = data.resourceNames?.map(
        (rn: string) => rn.replace("customers/", ""),
      ) || [];

      if (customerIds.length === 0) {
        return { ok: false, error: "No accessible Google Ads accounts found" };
      }

      // Store first customer ID in config for subsequent calls
      config.customer_id = customerIds[0];
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    const accessToken = await getValidAccessToken(config);
    const customerId = config.customer_id as string;
    if (!customerId) {
      throw new Error("No customer_id in config — run testConnection first");
    }

    // ── Sync campaigns ────────────────────────────────────
    let query = `SELECT campaign.id, campaign.name, campaign.status, campaign.start_date, campaign.end_date, campaign.campaign_budget, metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros, metrics.ctr FROM campaign WHERE campaign.status != 'REMOVED' ORDER BY campaign.id`;

    if (since) {
      const sinceDate = since.toISOString().slice(0, 10);
      query = `SELECT campaign.id, campaign.name, campaign.status, campaign.start_date, campaign.end_date, campaign.campaign_budget, metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros, metrics.ctr FROM campaign WHERE campaign.status != 'REMOVED' AND segments.date >= '${sinceDate}' ORDER BY campaign.id`;
    }

    const results = await searchStream(accessToken, customerId, query);

    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalCtr = 0;
    let activeCampaigns = 0;

    for (const row of results) {
      const campaign = row.campaign || {};
      const metrics = row.metrics || {};

      const spend = (metrics.costMicros || 0) / 1_000_000;
      const impressions = metrics.impressions || 0;
      const clicks = metrics.clicks || 0;
      const conversions = metrics.conversions || 0;
      const ctr = metrics.ctr || 0;

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
            status: campaign.status,
            platform: "google_ads",
            budget: campaign.campaignBudget,
            spend,
            currency: "USD",
            impressions,
            clicks,
            conversions,
            ctr,
            startDate: campaign.startDate,
            endDate: campaign.endDate,
          },
        },
      };

      yield {
        kind: "activity" as const,
        data: {
          signalType: "campaign_synced",
          metadata: {
            platform: "google_ads",
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
          sourceId: "google-ads-summary",
          content: `Google Ads Performance: ${activeCampaigns} active campaigns, ${totalSpend.toFixed(2)} total spend, ${totalClicks} clicks, ${avgCTR}% average CTR`,
          metadata: { platform: "google_ads" },
        },
      };
    }
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [];
  },

  async inferSchema(config): Promise<InferredSchema[]> {
    const accessToken = await getValidAccessToken(config);
    const customerId = config.customer_id as string;
    if (!customerId) return [];

    try {
      const results = await searchStream(
        accessToken,
        customerId,
        "SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.status != 'REMOVED' ORDER BY campaign.id LIMIT 5",
      );

      return [
        {
          suggestedTypeName: "Campaign",
          suggestedProperties: [
            { name: "name", dataType: "STRING", sampleValues: results.map((r: any) => r.campaign?.name).filter(Boolean).slice(0, 5) },
            { name: "status", dataType: "STRING", sampleValues: results.map((r: any) => r.campaign?.status).filter(Boolean).slice(0, 5) },
            { name: "platform", dataType: "STRING", sampleValues: ["google_ads"] },
          ],
          sampleEntities: results.map((r: any) => ({
            name: r.campaign?.name || "",
            status: r.campaign?.status || "",
            platform: "google_ads",
          })),
          recordCount: results.length,
        },
      ];
    } catch {
      return [];
    }
  },
};
