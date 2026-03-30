import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

// ── Helpers ──────────────────────────────────────────────

async function getValidToken(config: ConnectorConfig): Promise<string> {
  if (
    config.access_token &&
    config.token_expiry &&
    (config.token_expiry as number) > Date.now() + 5 * 60 * 1000
  ) {
    return config.access_token as string;
  }

  const resp = await fetch("https://api.project44.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.client_id as string,
      client_secret: config.client_secret as string,
    }),
  });

  if (!resp.ok) throw new Error(`project44 token exchange failed: ${resp.status}`);
  const data = await resp.json();

  config.access_token = data.access_token;
  config.token_expiry = Date.now() + (data.expires_in || 3600) * 1000;

  return data.access_token;
}

async function p44Fetch(config: ConnectorConfig, path: string): Promise<Response> {
  const token = await getValidToken(config);

  return fetch(`https://api.project44.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
}

async function* paginateP44<T>(
  config: ConnectorConfig,
  basePath: string,
): AsyncGenerator<T> {
  let offset = 0;
  const limit = 100;

  while (true) {
    const sep = basePath.includes("?") ? "&" : "?";
    const resp = await p44Fetch(config, `${basePath}${sep}offset=${offset}&limit=${limit}`);
    if (!resp.ok) break;

    const data = await resp.json();
    const items: T[] = data.results || data.shipments || data.items || [];
    for (const item of items) {
      yield item;
    }

    if (items.length < limit) break;
    offset += limit;
  }
}

// ── Provider Implementation ──────────────────────────────

export const project44Provider: ConnectorProvider = {
  id: "project44",
  name: "project44",

  configSchema: [
    { key: "client_id", label: "Client ID", type: "text", required: true },
    { key: "client_secret", label: "Client Secret", type: "password", required: true },
  ],

  writeCapabilities: [],

  async testConnection(config) {
    try {
      const resp = await p44Fetch(config, "/api/v4/shipments?limit=1");
      if (!resp.ok) {
        return { ok: false, error: `project44 API ${resp.status}: ${resp.statusText}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, _since?) {
    for await (const shipment of paginateP44<any>(
      config,
      "/api/v4/shipments?status=IN_TRANSIT,DELIVERED",
    )) {
      const origin = shipment.originLocation;
      const dest = shipment.destinationLocation;
      const identifiers = shipment.identifiers || [];
      const trackingNumber = identifiers[0]?.value || shipment.shipmentId || "";

      yield {
        kind: "event" as const,
        data: {
          eventType: "shipment.synced",
          payload: {
            id: shipment.shipmentId || shipment.id,
            trackingNumber,
            status: shipment.statusDescription || shipment.status || "In Transit",
            origin: origin?.city || undefined,
            destination: dest?.city || undefined,
            carrier: shipment.carrierName || shipment.carrier?.name || undefined,
            mode: shipment.modeOfTransport || undefined,
            eta: shipment.predictedArrival || shipment.eta || undefined,
            departureDate: shipment.departureDate || undefined,
          },
        },
      };

      // Container events
      const containers = shipment.containers || [];
      for (const c of containers) {
        yield {
          kind: "event" as const,
          data: {
            eventType: "container.synced",
            payload: {
              id: c.containerNumber || c.id,
              number: c.containerNumber,
              status: c.status || shipment.status || "In Transit",
              sealNumber: c.sealNumber || null,
              size: c.containerSize || null,
              weight: c.weight || null,
              carrier: shipment.carrierName || shipment.carrier?.name || "Unknown",
            },
          },
        };
      }

      // Milestone activity signals
      const milestones = shipment.milestones || shipment.events || [];
      for (const ms of milestones) {
        yield {
          kind: "activity" as const,
          data: {
            signalType: "shipment_tracking_update",
            metadata: {
              reference: trackingNumber,
              eventType: ms.description || ms.type || ms.milestoneType,
              location: ms.location?.city || ms.location?.name || undefined,
              carrier: shipment.carrierName || undefined,
            },
            occurredAt: new Date(ms.timestamp || ms.dateTime || Date.now()),
          },
        };
      }
    }
  },

  async executeAction(_config, _action, _params) {
    return { success: false, error: "project44 connector is read-only" };
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
