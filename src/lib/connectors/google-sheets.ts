import type {
  ConnectorProvider,
  ConnectorConfig,
  SyncEvent,
  InferredSchema,
} from "./types";
import { getValidAccessToken } from "./google-auth";

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

  async inferSchema(config) {
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

    const schemas: InferredSchema[] = [];

    for (const sheet of meta.sheets) {
      const sheetName = sheet.properties.title;
      const quotedName = `'${sheetName.replace(/'/g, "''")}'`;

      const dataResp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(quotedName)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!dataResp.ok) continue;
      const { values } = await dataResp.json();
      if (!values || values.length < 2) continue;

      const headers = values[0] as string[];
      const dataRows = values.slice(1);
      const sampleRows = dataRows.slice(0, 5);

      const suggestedProperties = headers.map((header, colIdx) => {
        const colValues = sampleRows
          .map((row: string[]) => row[colIdx] ?? "")
          .filter((v: string) => v !== "");

        const { dataType, possibleRole } = inferColumnType(colValues);

        return {
          name: header,
          dataType,
          ...(possibleRole ? { possibleRole } : {}),
          sampleValues: colValues.slice(0, 5),
        };
      });

      const sampleEntities = sampleRows.map((row: string[]) => {
        const obj: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
          obj[headers[j]] = row[j] ?? "";
        }
        return obj;
      });

      schemas.push({
        suggestedTypeName: sheetName,
        suggestedProperties,
        sampleEntities,
        recordCount: dataRows.length,
      });
    }

    return schemas;
  },
};

// ── Helpers ──────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\//i;
const PHONE_RE = /^[\+]?[\d\s\-\(\)]{7,}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const COMMON_DATE_RE = /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/;

function inferColumnType(values: string[]): {
  dataType: string;
  possibleRole?: string;
} {
  if (values.length === 0) return { dataType: "STRING" };

  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return { dataType: "STRING" };

  if (nonEmpty.every((v) => !isNaN(Number(v)) && v.trim() !== "")) {
    return { dataType: "NUMBER" };
  }

  if (
    nonEmpty.every(
      (v) => ISO_DATE_RE.test(v) || COMMON_DATE_RE.test(v) || !isNaN(Date.parse(v))
    ) &&
    nonEmpty.some((v) => ISO_DATE_RE.test(v) || COMMON_DATE_RE.test(v))
  ) {
    return { dataType: "DATE" };
  }

  const lower = nonEmpty.map((v) => v.toLowerCase());
  if (
    lower.every((v) => ["true", "false", "yes", "no"].includes(v))
  ) {
    return { dataType: "BOOLEAN" };
  }

  if (nonEmpty.every((v) => EMAIL_RE.test(v))) {
    return { dataType: "STRING", possibleRole: "email" };
  }

  if (nonEmpty.every((v) => URL_RE.test(v))) {
    return { dataType: "STRING", possibleRole: "url" };
  }

  if (nonEmpty.every((v) => PHONE_RE.test(v))) {
    return { dataType: "STRING", possibleRole: "phone" };
  }

  return { dataType: "STRING" };
}

function extractSpreadsheetId(input: string): string {
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return input.trim();
}
