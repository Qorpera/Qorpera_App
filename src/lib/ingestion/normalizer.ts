// ── Date normalisation helpers ────────────────────────────────────────────────

const US_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function normaliseDate(value: string): string {
  const trimmed = value.trim();

  // Already ISO
  if (ISO_DATE_RE.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // US-format MM/DD/YYYY
  const usMatch = US_DATE_RE.exec(trimmed);
  if (usMatch) {
    const [, month, day, yearRaw] = usMatch;
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    const d = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00Z`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // Generic Date.parse fallback
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d.toISOString();

  return trimmed; // return as-is if unparseable
}

// ── Currency helpers ─────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS_RE = /[$£€¥]/g;

function normaliseCurrency(value: string): string {
  return value.replace(CURRENCY_SYMBOLS_RE, "").replace(/,/g, "").trim();
}

// ── Email ────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normaliseEmail(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Normalise a single cell value based on its data type.
 *
 * - DATE     → ISO-8601 string
 * - CURRENCY → digits only (no symbols/commas)
 * - NUMBER   → strip commas, trim
 * - BOOLEAN  → "true" / "false"
 * - STRING   → trim; lowercase emails
 */
export function normalizeValue(value: string, dataType: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  switch (dataType.toUpperCase()) {
    case "DATE":
      return normaliseDate(trimmed);

    case "CURRENCY":
      return normaliseCurrency(trimmed);

    case "NUMBER":
      return trimmed.replace(/,/g, "");

    case "BOOLEAN": {
      const lower = trimmed.toLowerCase();
      if (["true", "yes", "1"].includes(lower)) return "true";
      if (["false", "no", "0"].includes(lower)) return "false";
      return trimmed;
    }

    case "STRING":
    default:
      // Auto-detect and lowercase emails
      if (EMAIL_RE.test(trimmed)) return normaliseEmail(trimmed);
      return trimmed;
  }
}

/**
 * Remove duplicate rows based on a composite key of the given columns.
 * First occurrence wins.
 */
export function deduplicateRows(
  rows: Record<string, string>[],
  keyColumns: string[],
): Record<string, string>[] {
  if (keyColumns.length === 0) return rows;

  const seen = new Set<string>();
  const unique: Record<string, string>[] = [];

  for (const row of rows) {
    const key = keyColumns
      .map((col) => (row[col] ?? "").toLowerCase().trim())
      .join("\x1F"); // unit separator as delimiter

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(row);
    }
  }

  return unique;
}
