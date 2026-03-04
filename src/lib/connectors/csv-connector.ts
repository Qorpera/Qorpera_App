import Papa from "papaparse";

export type DataType = "STRING" | "NUMBER" | "DATE" | "BOOLEAN" | "CURRENCY";

export type ParseResult = {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
};

/**
 * Parse a CSV string into headers + rows.
 * Uses papaparse with header mode so each row is a keyed object.
 */
export function parseCSV(content: string): ParseResult {
  const result = Papa.parse<Record<string, string>>(content.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
  });

  const headers = result.meta.fields ?? [];
  const rows = result.data;

  return { headers, rows, rowCount: rows.length };
}

// ── Type inference ──────────────────────────────────────────────────────────

const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const US_DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const CURRENCY_RE = /^[$£€¥]\s?[\d,]+(\.\d{1,2})?$/;
const NUMBER_RE = /^-?[\d,]+(\.\d+)?$/;
const BOOLEAN_STRINGS = new Set(["true", "false", "yes", "no", "1", "0"]);

function classifyValue(value: string): DataType | null {
  if (!value) return null; // empty — inconclusive

  if (CURRENCY_RE.test(value)) return "CURRENCY";
  if (BOOLEAN_STRINGS.has(value.toLowerCase())) return "BOOLEAN";
  if (ISO_DATE_RE.test(value) || US_DATE_RE.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return "DATE";
  }
  if (NUMBER_RE.test(value) && !isNaN(parseFloat(value.replace(/,/g, "")))) {
    return "NUMBER";
  }
  return "STRING";
}

/**
 * Sample rows (up to 200) and infer the best DataType per column.
 * Falls back to STRING when inconclusive.
 */
export function inferColumnTypes(
  rows: Record<string, string>[],
): Record<string, DataType> {
  if (rows.length === 0) return {};

  const sample = rows.slice(0, 200);
  const headers = Object.keys(rows[0]);
  const result: Record<string, DataType> = {};

  for (const header of headers) {
    const counts: Record<DataType, number> = {
      STRING: 0,
      NUMBER: 0,
      DATE: 0,
      BOOLEAN: 0,
      CURRENCY: 0,
    };
    let nonEmpty = 0;

    for (const row of sample) {
      const type = classifyValue(row[header]);
      if (type) {
        counts[type]++;
        nonEmpty++;
      }
    }

    if (nonEmpty === 0) {
      result[header] = "STRING";
      continue;
    }

    // Require > 60% agreement for a non-STRING type
    const threshold = nonEmpty * 0.6;
    if (counts.CURRENCY >= threshold) {
      result[header] = "CURRENCY";
    } else if (counts.BOOLEAN >= threshold) {
      result[header] = "BOOLEAN";
    } else if (counts.DATE >= threshold) {
      result[header] = "DATE";
    } else if (counts.NUMBER >= threshold) {
      result[header] = "NUMBER";
    } else {
      result[header] = "STRING";
    }
  }

  return result;
}
