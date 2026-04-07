// ── Formatter caches (only 2 locales — tiny map) ────────────────────────────

const rtfCache = new Map<string, Intl.RelativeTimeFormat>();
const dtfCache = new Map<string, Intl.DateTimeFormat>();
const nfCache = new Map<string, Intl.NumberFormat>();

function getRtf(locale: string): Intl.RelativeTimeFormat {
  if (!rtfCache.has(locale)) {
    rtfCache.set(locale, new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" }));
  }
  return rtfCache.get(locale)!;
}

function getDtf(locale: string, style: "short" | "medium" | "long"): Intl.DateTimeFormat {
  const key = `${locale}:${style}`;
  if (!dtfCache.has(key)) {
    dtfCache.set(key, new Intl.DateTimeFormat(locale, { dateStyle: style }));
  }
  return dtfCache.get(key)!;
}

function getNf(locale: string, optionsKey: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}:${optionsKey}`;
  if (!nfCache.has(key)) {
    nfCache.set(key, new Intl.NumberFormat(locale, options));
  }
  return nfCache.get(key)!;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Locale-aware relative time formatting.
 */
export function formatRelativeTime(dateStr: string, locale: string = "en"): string {
  const ts = new Date(dateStr).getTime();
  if (isNaN(ts)) return dateStr || "—";
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const rtf = getRtf(locale);

  if (minutes < 1) return rtf.format(0, "minute");
  if (minutes < 60) return rtf.format(-minutes, "minute");
  if (hours < 24) return rtf.format(-hours, "hour");
  return rtf.format(-days, "day");
}

/**
 * Locale-aware date formatting.
 */
export function formatDate(date: string | Date, locale: string = "en", style: "short" | "medium" | "long" = "medium"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return typeof date === "string" ? date : "—";
  return getDtf(locale, style).format(d);
}

/**
 * Locale-aware number formatting.
 */
export function formatNumber(value: number, locale: string = "en", options?: Intl.NumberFormatOptions): string {
  return getNf(locale, JSON.stringify(options ?? {}), options).format(value);
}
