export type ParseResult = {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
};

/**
 * Flatten a nested object into dot-notation keys.
 * Arrays are expanded as `key.0`, `key.1`, etc.
 */
function flattenObject(
  obj: unknown,
  prefix = "",
  out: Record<string, string> = {},
): Record<string, string> {
  if (obj === null || obj === undefined) {
    if (prefix) out[prefix] = "";
    return out;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      if (prefix) out[prefix] = "[]";
    } else {
      for (let i = 0; i < obj.length; i++) {
        flattenObject(obj[i], prefix ? `${prefix}.${i}` : String(i), out);
      }
    }
    return out;
  }

  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) {
      if (prefix) out[prefix] = "{}";
    } else {
      for (const [key, value] of entries) {
        flattenObject(value, prefix ? `${prefix}.${key}` : key, out);
      }
    }
    return out;
  }

  // Primitive
  if (prefix) out[prefix] = String(obj);
  return out;
}

/**
 * Parse a JSON string. Accepts:
 * - A JSON array of objects  -> each element becomes a row
 * - A single JSON object     -> treated as a single-row dataset
 *
 * Nested objects are flattened using dot-notation keys.
 */
export function parseJSON(content: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.trim());
  } catch {
    throw new Error("Invalid JSON: unable to parse content");
  }

  let items: unknown[];

  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (typeof parsed === "object" && parsed !== null) {
    items = [parsed];
  } else {
    throw new Error("JSON must be an array or object");
  }

  // Flatten each item
  const flatRows: Record<string, string>[] = [];
  const headerSet = new Set<string>();

  for (const item of items) {
    const flat = flattenObject(item);
    for (const key of Object.keys(flat)) {
      headerSet.add(key);
    }
    flatRows.push(flat);
  }

  // Ensure every row has every header (fill missing with "")
  const headers = Array.from(headerSet);
  const rows = flatRows.map((row) => {
    const complete: Record<string, string> = {};
    for (const h of headers) {
      complete[h] = row[h] ?? "";
    }
    return complete;
  });

  return { headers, rows, rowCount: rows.length };
}
