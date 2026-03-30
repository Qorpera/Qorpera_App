import type {
  ConnectorProvider,
  ConnectorConfig,
  ConnectorCapability,
  InferredSchema,
} from "./types";

// ── Helpers ──────────────────────────────────────────────

const CONTAINER_PATTERN = /^[A-Z]{4}\d{7}$/;

async function getValidToken(config: ConnectorConfig): Promise<string> {
  if (
    config.access_token &&
    config.token_expiry &&
    new Date(config.token_expiry as string).getTime() > Date.now() + 5 * 60 * 1000
  ) {
    return config.access_token as string;
  }

  const resp = await fetch("https://api.hlag.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.client_id as string,
      client_secret: config.client_secret as string,
    }),
  });

  if (!resp.ok) throw new Error(`Hapag-Lloyd token exchange failed: ${resp.status}`);
  const data = await resp.json();

  config.access_token = data.access_token;
  config.token_expiry = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();

  return data.access_token;
}

async function hlagRequest(config: ConnectorConfig, path: string): Promise<Response> {
  const token = await getValidToken(config);

  return fetch(`https://api.hlag.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
}

function detectRefType(ref: string): "container" | "bl" | "booking" {
  if (CONTAINER_PATTERN.test(ref)) return "container";
  if (/^\d{9,}$/.test(ref)) return "bl";
  return "booking";
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Provider Implementation ──────────────────────────────

export const hapagLloydProvider: ConnectorProvider = {
  id: "hapag-lloyd",
  name: "Hapag-Lloyd",

  configSchema: [
    { key: "client_id", label: "Client ID", type: "text", required: true, placeholder: "From Hapag-Lloyd Developer Portal" },
    { key: "client_secret", label: "Client Secret", type: "password", required: true },
    { key: "tracking_references", label: "Tracking References", type: "text", required: true, placeholder: "Container numbers, BL numbers (comma-separated)" },
  ],

  writeCapabilities: [],

  async testConnection(config) {
    try {
      await getValidToken(config);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, _since?) {
    const refs = (config.tracking_references as string || "")
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i];
      const refType = detectRefType(ref);

      if (i > 0) await delay(200);

      try {
        let trackingPath: string;
        if (refType === "container") {
          trackingPath = `/track/v1/transports?containerNumber=${encodeURIComponent(ref)}`;
        } else if (refType === "bl") {
          trackingPath = `/track/v1/transports?billOfLadingNumber=${encodeURIComponent(ref)}`;
        } else {
          trackingPath = `/track/v1/transports?bookingNumber=${encodeURIComponent(ref)}`;
        }

        const resp = await hlagRequest(config, trackingPath);

        if (resp.status === 429) {
          const retryAfter = parseInt(resp.headers.get("Retry-After") || "5", 10);
          await delay(retryAfter * 1000);
          continue;
        }

        if (!resp.ok) {
          console.warn(`[hapag-lloyd] Tracking failed for ${ref}: ${resp.status}`);
          continue;
        }

        const data = await resp.json();

        const transport = data.transports?.[0] || data;
        const events = transport.events || [];
        const latestEvent = events[0];
        const origin = transport.origin;
        const destination = transport.destination;

        const originStr = origin ? `${origin.city || ""}, ${origin.country || ""}`.replace(/^, |, $/g, "") : undefined;
        const destStr = destination ? `${destination.city || ""}, ${destination.country || ""}`.replace(/^, |, $/g, "") : undefined;

        yield {
          kind: "event" as const,
          data: {
            eventType: "shipment.synced",
            payload: {
              id: ref,
              trackingNumber: ref,
              status: latestEvent?.description || latestEvent?.status || "In Transit",
              origin: originStr,
              destination: destStr,
              carrier: "Hapag-Lloyd",
              mode: "ocean",
              eta: transport.estimatedArrival || destination?.estimatedArrival || undefined,
              departureDate: transport.departureDate || origin?.departureDate || undefined,
            },
          },
        };

        if (refType === "container") {
          yield {
            kind: "event" as const,
            data: {
              eventType: "container.synced",
              payload: {
                id: ref,
                number: ref,
                status: latestEvent?.status || latestEvent?.description || "In Transit",
                sealNumber: null,
                size: transport.containerSize || null,
                weight: null,
                carrier: "Hapag-Lloyd",
              },
            },
          };
        }

        for (const evt of events) {
          const evtType = (evt.description || evt.eventType || "").toLowerCase();
          const isSignificant = evtType.includes("depart") || evtType.includes("arriv") ||
            evtType.includes("gate") || evtType.includes("load") || evtType.includes("discharge");

          if (isSignificant) {
            yield {
              kind: "activity" as const,
              data: {
                signalType: "shipment_tracking_update",
                metadata: {
                  reference: ref,
                  eventType: evt.description || evt.eventType,
                  location: evt.location?.city || evt.location?.name || undefined,
                  vessel: evt.vesselName || undefined,
                },
                occurredAt: new Date(evt.timestamp || evt.eventDateTime || Date.now()),
              },
            };
          }
        }

        if (events.length > 0) {
          const lines = events.map((evt: any) => {
            const date = evt.timestamp || evt.eventDateTime || "";
            const desc = evt.description || evt.eventType || "Unknown";
            const loc = evt.location?.city || evt.location?.name || "";
            return `${date}: ${desc}${loc ? ` at ${loc}` : ""}`;
          });

          yield {
            kind: "content" as const,
            data: {
              sourceType: "shipment_tracking",
              sourceId: `hapag-lloyd-${ref}`,
              content: `Tracking for ${ref}:\n${lines.join("\n")}`,
              metadata: { reference: ref, eventCount: events.length, carrier: "Hapag-Lloyd" },
            },
          };
        }
      } catch (err) {
        console.warn(`[hapag-lloyd] Error tracking ${ref}:`, err);
      }
    }
  },

  async executeAction(_config, _action, _params) {
    return { success: false, error: "Hapag-Lloyd connector is read-only" };
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
