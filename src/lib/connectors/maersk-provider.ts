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

  const resp = await fetch("https://api.maersk.com/oauth2/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.consumer_key as string,
      client_secret: config.consumer_secret as string,
    }),
  });

  if (!resp.ok) throw new Error(`Maersk token exchange failed: ${resp.status}`);
  const data = await resp.json();

  config.access_token = data.access_token;
  config.token_expiry = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();

  return data.access_token;
}

async function maerskRequest(
  config: ConnectorConfig,
  method: string,
  path: string,
): Promise<Response> {
  const token = await getValidToken(config);

  return fetch(`https://api.maersk.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Consumer-Key": config.consumer_key as string,
      Accept: "application/json",
    },
  });
}

function detectRefType(ref: string): "container" | "bl" | "booking" {
  if (CONTAINER_PATTERN.test(ref)) return "container";
  // BL numbers are typically numeric or alphanumeric without the strict container pattern
  // Treat anything else as a potential BL/booking — Maersk API will tell us
  if (/^\d{9,}$/.test(ref)) return "bl";
  return "booking";
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Provider Implementation ──────────────────────────────

export const maerskProvider: ConnectorProvider = {
  id: "maersk",
  name: "Maersk",

  configSchema: [
    { key: "consumer_key", label: "Consumer Key", type: "text", required: true, placeholder: "From Maersk Developer Portal" },
    { key: "consumer_secret", label: "Consumer Secret", type: "password", required: true },
    { key: "tracking_references", label: "Tracking References", type: "text", required: true, placeholder: "Container numbers, BL numbers, or booking refs (comma-separated)" },
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

      // Rate limiting: 200ms delay between requests
      if (i > 0) await delay(200);

      try {
        // Build tracking URL based on reference type
        let trackingPath: string;
        if (refType === "container") {
          trackingPath = `/track-and-trace?containerNumber=${encodeURIComponent(ref)}`;
        } else if (refType === "bl") {
          trackingPath = `/track-and-trace?billOfLadingNumber=${encodeURIComponent(ref)}`;
        } else {
          trackingPath = `/track-and-trace?bookingNumber=${encodeURIComponent(ref)}`;
        }

        const resp = await maerskRequest(config, "GET", trackingPath);

        // Handle rate limiting
        if (resp.status === 429) {
          const retryAfter = parseInt(resp.headers.get("Retry-After") || "5", 10);
          await delay(retryAfter * 1000);
          continue; // Will retry on next sync cycle
        }

        if (!resp.ok) {
          console.warn(`[maersk] Tracking failed for ${ref}: ${resp.status}`);
          continue;
        }

        const data = await resp.json();

        // Extract tracking data
        const container = data.containers?.[0];
        const events = container?.events || data.events || [];
        const latestEvent = events[0]; // Events are typically newest-first
        const origin = data.origin;
        const destination = data.destination;

        const originStr = origin ? `${origin.city || ""}, ${origin.country || ""}`.replace(/^, |, $/g, "") : undefined;
        const destStr = destination ? `${destination.city || ""}, ${destination.country || ""}`.replace(/^, |, $/g, "") : undefined;

        // ── Shipment event ─────────────────────────────────
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
              carrier: "Maersk",
              mode: "ocean",
              eta: data.estimatedArrival || data.eta || destination?.estimatedArrival || undefined,
              departureDate: data.departureDate || origin?.departureDate || undefined,
            },
          },
        };

        // ── Container event (if tracking by container) ────
        if (refType === "container" && container) {
          yield {
            kind: "event" as const,
            data: {
              eventType: "container.synced",
              payload: {
                id: ref,
                number: ref,
                status: latestEvent?.status || latestEvent?.description || "In Transit",
                sealNumber: null,
                size: container.container_size || container.containerSize || null,
                weight: null,
                carrier: "Maersk",
              },
            },
          };
        }

        // ── Tracking activity signals ─────────────────────
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
                  location: evt.location?.city || evt.location?.name || evt.location || undefined,
                  vessel: evt.vesselName || evt.vessel || undefined,
                },
                occurredAt: new Date(evt.timestamp || evt.eventDateTime || Date.now()),
              },
            };
          }
        }

        // ── Tracking content summary ──────────────────────
        if (events.length > 0) {
          const lines = events.map((evt: any) => {
            const date = evt.timestamp || evt.eventDateTime || "";
            const desc = evt.description || evt.eventType || "Unknown";
            const loc = evt.location?.city || evt.location?.name || evt.location || "";
            return `${date}: ${desc}${loc ? ` at ${loc}` : ""}`;
          });

          yield {
            kind: "content" as const,
            data: {
              sourceType: "shipment_tracking",
              sourceId: `maersk-${ref}`,
              content: `Tracking for ${ref}:\n${lines.join("\n")}`,
              metadata: { reference: ref, eventCount: events.length, carrier: "Maersk" },
            },
          };
        }
      } catch (err) {
        console.warn(`[maersk] Error tracking ${ref}:`, err);
        // Continue to next reference
      }
    }
  },

  async executeAction(_config, _action, _params) {
    return { success: false, error: "Maersk connector is read-only" };
  },

  async getCapabilities(_config): Promise<ConnectorCapability[]> {
    return [];
  },

  async inferSchema(_config): Promise<InferredSchema[]> {
    return [];
  },
};
