import type {
  ConnectorProvider,
  ConnectorConfig,
  SyncEvent,
  InferredSchema,
} from "./types";

// ── Token Refresh Helper ─────────────────────────────────

async function getValidAccessToken(config: ConnectorConfig): Promise<string> {
  const expiry = new Date(config.token_expiry as string);

  if (expiry.getTime() > Date.now() + 5 * 60 * 1000) {
    return config.access_token as string;
  }

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: config.refresh_token as string,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) throw new Error(`Google token refresh failed: ${resp.status}`);
  const data = await resp.json();

  // Caller must persist updated tokens back to SourceConnector.config after sync
  config.access_token = data.access_token;
  config.token_expiry = new Date(
    Date.now() + data.expires_in * 1000
  ).toISOString();

  return data.access_token;
}

// ── Provider Implementation ──────────────────────────────

export const googleSheetsProvider: ConnectorProvider = {
  id: "google-sheets",
  name: "Google Sheets",

  configSchema: [
    { key: "oauth", label: "Google Account", type: "oauth", required: true },
    {
      key: "spreadsheet_id",
      label: "Spreadsheet ID or URL",
      type: "text",
      required: true,
      placeholder: "Paste the Google Sheets URL or the spreadsheet ID",
    },
  ],

  async testConnection(config) {
    try {
      const token = await getValidAccessToken(config);
      const spreadsheetId = extractSpreadsheetId(
        config.spreadsheet_id as string
      );
      const resp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!resp.ok)
        return {
          ok: false,
          error: `Google API ${resp.status}: ${resp.statusText}`,
        };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  },

  async *sync(config, since?) {
    const token = await getValidAccessToken(config);
    const spreadsheetId = extractSpreadsheetId(
      config.spreadsheet_id as string
    );

    const metaResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!metaResp.ok)
      throw new Error(`Failed to read spreadsheet: ${metaResp.status}`);
    const meta = await metaResp.json();

    for (const sheet of meta.sheets) {
      const sheetName = sheet.properties.title;

      // Quote sheet name to avoid A1-notation ambiguity (e.g. "Ark1" → "'Ark1'")
      const quotedName = `'${sheetName.replace(/'/g, "''")}'`;
      const dataResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(quotedName)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!dataResp.ok) continue;
      const { values } = await dataResp.json();
      if (!values || values.length < 2) continue;

      const headers = values[0] as string[];

      for (let i = 1; i < values.length; i++) {
        const row = values[i] as string[];
        const payload: Record<string, unknown> = {
          _sheet: sheetName,
          _row: i + 1,
          _spreadsheetId: spreadsheetId,
        };
        for (let j = 0; j < headers.length; j++) {
          payload[headers[j]] = row[j] ?? "";
        }

        yield {
          eventType: "row.synced",
          payload,
        };
      }
    }
  },

  executeAction: undefined,

  async getCapabilities(_config) {
    return [];
  },

  async inferSchema(_config) {
    // Stub for Day 2 — full implementation on Day 3
    return [];
  },
};

// ── Helpers ──────────────────────────────────────────────

function extractSpreadsheetId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return input.trim();
}
