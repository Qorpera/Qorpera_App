import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

// ── Helpers ──────────────────────────────────────────────

async function xenetaFetch(config: ConnectorConfig, path: string): Promise<Response> {
  const apiKey = config.api_key as string;

  return fetch(`https://api.xeneta.com/v1${path}`, {
    headers: {
      Authorization: `Token ${apiKey}`,
      Accept: "application/json",
    },
  });
}

function parseTradeLanes(config: ConnectorConfig): Array<{ origin: string; destination: string }> {
  const raw = (config.trade_lanes as string || "").trim();
  if (!raw) return [];

  return raw
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [origin, destination] = pair.split("-").map((s) => s.trim());
      return { origin, destination };
    })
    .filter((l) => l.origin && l.destination);
}

// ── Provider Implementation ──────────────────────────────

export const xenetaProvider: ConnectorProvider = {
  id: "xeneta",
  name: "Xeneta",

  configSchema: [
    { key: "api_key", label: "API Key", type: "password", required: true, placeholder: "From Xeneta → Settings → API" },
    { key: "trade_lanes", label: "Trade Lanes", type: "text", required: true, placeholder: "Origin-Destination pairs (e.g. CNSHA-NLRTM, CNSHA-DEHAM)" },
  ],

  writeCapabilities: [],

  async testConnection(config) {
    try {
      const resp = await xenetaFetch(
        config,
        "/public/rates?origin=CNSHA&destination=NLRTM&transport_mode=container",
      );
      if (!resp.ok) {
        return { ok: false, error: `Xeneta API ${resp.status}: ${resp.statusText}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, _since?) {
    const lanes = parseTradeLanes(config);
    const today = new Date().toISOString().slice(0, 10);

    for (const lane of lanes) {
      try {
        const resp = await xenetaFetch(
          config,
          `/public/rates?origin=${encodeURIComponent(lane.origin)}&destination=${encodeURIComponent(lane.destination)}&transport_mode=container`,
        );

        if (!resp.ok) {
          console.warn(`[xeneta] Rate query failed for ${lane.origin}-${lane.destination}: ${resp.status}`);
          continue;
        }

        const data = await resp.json();

        const low = data.low ?? data.market_low ?? "N/A";
        const avg = data.mean ?? data.market_avg ?? data.average ?? "N/A";
        const high = data.high ?? data.market_high ?? "N/A";

        yield {
          kind: "content" as const,
          data: {
            sourceType: "rate_benchmark",
            sourceId: `xeneta-${lane.origin}-${lane.destination}-${today}`,
            content: `Xeneta rate benchmark: ${lane.origin} → ${lane.destination}, Market low: $${low}, Market avg: $${avg}, Market high: $${high}, Date: ${today}`,
            metadata: {
              origin: lane.origin,
              destination: lane.destination,
              low,
              avg,
              high,
              date: today,
            },
          },
        };
      } catch (err) {
        console.warn(`[xeneta] Error querying ${lane.origin}-${lane.destination}:`, err);
      }
    }
  },

  async executeAction(_config, _action, _params) {
    return { success: false, error: "Xeneta connector is read-only" };
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
