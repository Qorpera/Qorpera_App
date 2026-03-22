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

    let results: any[];
    try {
      results = await searchStream(accessToken, customerId, query);
    } catch {
      // API error — return gracefully instead of killing the sync
      return;
    }

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

  writeCapabilities: [
    { slug: "pause_campaign", name: "Pause Campaign", description: "Pause a Google Ads campaign", inputSchema: { type: "object", properties: { campaignId: { type: "string" } }, required: ["campaignId"] } },
    { slug: "enable_campaign", name: "Enable Campaign", description: "Enable a paused Google Ads campaign", inputSchema: { type: "object", properties: { campaignId: { type: "string" } }, required: ["campaignId"] } },
    { slug: "update_campaign_budget", name: "Update Campaign Budget", description: "Update the daily budget of a Google Ads campaign budget", inputSchema: { type: "object", properties: { campaignBudgetId: { type: "string" }, newDailyBudgetMicros: { type: "number" } }, required: ["campaignBudgetId", "newDailyBudgetMicros"] } },
    { slug: "pause_ad_group", name: "Pause Ad Group", description: "Pause a Google Ads ad group", inputSchema: { type: "object", properties: { adGroupId: { type: "string" } }, required: ["adGroupId"] } },
    { slug: "enable_ad_group", name: "Enable Ad Group", description: "Enable a paused Google Ads ad group", inputSchema: { type: "object", properties: { adGroupId: { type: "string" } }, required: ["adGroupId"] } },
    { slug: "update_keyword_bid", name: "Update Keyword Bid", description: "Update the CPC bid for a keyword", inputSchema: { type: "object", properties: { adGroupCriterionId: { type: "string" }, newBidMicros: { type: "number" } }, required: ["adGroupCriterionId", "newBidMicros"] } },
  ],

  async executeAction(config, actionId, params) {
    try {
      const accessToken = await getValidAccessToken(config);
      const customerId = config.customer_id as string;
      if (!customerId) return { success: false, error: "No customer_id in config" };

      switch (actionId) {
        case "pause_campaign":
        case "enable_campaign": {
          if (!params.campaignId) return { success: false, error: "campaignId is required" };
          const status = actionId === "pause_campaign" ? "PAUSED" : "ENABLED";
          const resourceName = `customers/${customerId}/campaigns/${params.campaignId}`;
          const resp = await fetch(
            `${ADS_API}/customers/${customerId}/campaigns:mutate`,
            {
              method: "POST",
              headers: getAdsHeaders(accessToken),
              body: JSON.stringify({
                operations: [{ update: { resourceName, status }, updateMask: "status" }],
              }),
            }
          );
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `${actionId} failed (${resp.status}): ${err}` };
          }
          return { success: true, result: { campaignId: params.campaignId, status } };
        }

        case "update_campaign_budget": {
          if (!params.campaignBudgetId) return { success: false, error: "campaignBudgetId is required" };
          if (!params.newDailyBudgetMicros || (params.newDailyBudgetMicros as number) <= 0) {
            return { success: false, error: "newDailyBudgetMicros must be a positive number" };
          }
          const budgetResource = `customers/${customerId}/campaignBudgets/${params.campaignBudgetId}`;
          const resp = await fetch(
            `${ADS_API}/customers/${customerId}/campaignBudgets:mutate`,
            {
              method: "POST",
              headers: getAdsHeaders(accessToken),
              body: JSON.stringify({
                operations: [{ update: { resourceName: budgetResource, amountMicros: String(params.newDailyBudgetMicros) }, updateMask: "amount_micros" }],
              }),
            }
          );
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Update budget failed (${resp.status}): ${err}` };
          }
          return { success: true, result: { campaignBudgetId: params.campaignBudgetId, newDailyBudgetMicros: params.newDailyBudgetMicros } };
        }

        case "pause_ad_group":
        case "enable_ad_group": {
          if (!params.adGroupId) return { success: false, error: "adGroupId is required" };
          const agStatus = actionId === "pause_ad_group" ? "PAUSED" : "ENABLED";
          const agResource = `customers/${customerId}/adGroups/${params.adGroupId}`;
          const resp = await fetch(
            `${ADS_API}/customers/${customerId}/adGroups:mutate`,
            {
              method: "POST",
              headers: getAdsHeaders(accessToken),
              body: JSON.stringify({
                operations: [{ update: { resourceName: agResource, status: agStatus }, updateMask: "status" }],
              }),
            }
          );
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `${actionId} failed (${resp.status}): ${err}` };
          }
          return { success: true, result: { adGroupId: params.adGroupId, status: agStatus } };
        }

        case "update_keyword_bid": {
          if (!params.adGroupCriterionId) return { success: false, error: "adGroupCriterionId is required" };
          if (!params.newBidMicros || (params.newBidMicros as number) <= 0) {
            return { success: false, error: "newBidMicros must be a positive number" };
          }
          const criterionResource = `customers/${customerId}/adGroupCriteria/${params.adGroupCriterionId}`;
          const resp = await fetch(
            `${ADS_API}/customers/${customerId}/adGroupCriteria:mutate`,
            {
              method: "POST",
              headers: getAdsHeaders(accessToken),
              body: JSON.stringify({
                operations: [{ update: { resourceName: criterionResource, cpcBidMicros: String(params.newBidMicros) }, updateMask: "cpc_bid_micros" }],
              }),
            }
          );
          if (!resp.ok) {
            const err = await resp.text();
            return { success: false, error: `Update keyword bid failed (${resp.status}): ${err}` };
          }
          return { success: true, result: { adGroupCriterionId: params.adGroupCriterionId, newBidMicros: params.newBidMicros } };
        }

        default:
          return { success: false, error: `Unknown action: ${actionId}` };
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [
      { name: "pause_campaign", description: "Pause a Google Ads campaign", inputSchema: { campaignId: { type: "string", required: true } }, sideEffects: ["Campaign paused in Google Ads"] },
      { name: "enable_campaign", description: "Enable a paused Google Ads campaign", inputSchema: { campaignId: { type: "string", required: true } }, sideEffects: ["Campaign enabled in Google Ads"] },
      { name: "update_campaign_budget", description: "Update daily budget (in micros)", inputSchema: { campaignBudgetId: { type: "string", required: true }, newDailyBudgetMicros: { type: "number", required: true } }, sideEffects: ["Campaign budget updated"] },
      { name: "pause_ad_group", description: "Pause a Google Ads ad group", inputSchema: { adGroupId: { type: "string", required: true } }, sideEffects: ["Ad group paused"] },
      { name: "enable_ad_group", description: "Enable a paused ad group", inputSchema: { adGroupId: { type: "string", required: true } }, sideEffects: ["Ad group enabled"] },
      { name: "update_keyword_bid", description: "Update CPC bid for a keyword (in micros)", inputSchema: { adGroupCriterionId: { type: "string", required: true }, newBidMicros: { type: "number", required: true } }, sideEffects: ["Keyword bid updated"] },
    ];
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
