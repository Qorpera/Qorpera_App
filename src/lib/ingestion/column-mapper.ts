// ── Levenshtein distance ─────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,       // deletion
        dp[i][j - 1] + 1,       // insertion
        dp[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return dp[m][n];
}

// ── Common aliases ───────────────────────────────────────────────────────────

/**
 * Map of common CSV header patterns → canonical property slugs.
 * Keys are lowercase, normalised (no separators). Values are property slugs.
 */
const COMMON_ALIASES: Record<string, string> = {
  // Name variations
  firstname: "first-name",
  first_name: "first-name",
  first: "first-name",
  givenname: "first-name",
  lastname: "last-name",
  last_name: "last-name",
  last: "last-name",
  surname: "last-name",
  familyname: "last-name",
  fullname: "name",
  full_name: "name",
  displayname: "name",
  display_name: "name",
  companyname: "company-name",
  company_name: "company-name",
  company: "company-name",
  organisation: "company-name",
  organization: "company-name",
  org: "company-name",

  // Email variations
  emailaddress: "email",
  email_address: "email",
  e_mail: "email",
  mail: "email",
  primaryemail: "email",
  workemail: "work-email",

  // Phone variations
  phonenumber: "phone",
  phone_number: "phone",
  telephone: "phone",
  tel: "phone",
  mobile: "phone",
  cell: "phone",
  workphone: "work-phone",

  // Address variations
  streetaddress: "address",
  street_address: "address",
  addr: "address",
  address1: "address",
  postalcode: "postal-code",
  postal_code: "postal-code",
  zipcode: "postal-code",
  zip_code: "postal-code",
  zip: "postal-code",

  // Business fields
  jobtitle: "job-title",
  job_title: "job-title",
  title: "job-title",
  role: "job-title",
  position: "job-title",
  department: "department",
  dept: "department",
  website: "website",
  url: "website",
  homepage: "website",
  industry: "industry",
  sector: "industry",
  revenue: "revenue",
  annualrevenue: "revenue",
  employees: "employee-count",
  employeecount: "employee-count",
  headcount: "employee-count",
  status: "status",
  stage: "stage",
  source: "source",
  leadsource: "source",
  notes: "notes",
  description: "description",
  desc: "description",
};

// ── Normalisation ────────────────────────────────────────────────────────────

/** Lowercase, strip non-alphanumeric, collapse */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Normalise keeping underscores (for alias lookup) */
function normaliseForAlias(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_");
}

// ── Matching logic ───────────────────────────────────────────────────────────

type PropertyDef = { slug: string; name: string };

/**
 * Attempt to match a source header to a target property.
 * Returns the matched property slug or null.
 *
 * Priority:
 *  1. Exact slug/name match (normalised)
 *  2. Common alias match
 *  3. Fuzzy Levenshtein match (distance <= 30% of longer string)
 */
function matchHeader(
  header: string,
  properties: PropertyDef[],
): string | null {
  const normHeader = normalise(header);
  const aliasHeader = normaliseForAlias(header);

  // 1. Exact match on slug or name
  for (const prop of properties) {
    if (normalise(prop.slug) === normHeader || normalise(prop.name) === normHeader) {
      return prop.slug;
    }
  }

  // 2. Common alias → check if any property matches the alias target
  const aliasTarget = COMMON_ALIASES[normHeader] ?? COMMON_ALIASES[aliasHeader];
  if (aliasTarget) {
    for (const prop of properties) {
      if (prop.slug === aliasTarget || normalise(prop.slug) === normalise(aliasTarget)) {
        return prop.slug;
      }
    }
  }

  // 3. Fuzzy match — Levenshtein on normalised strings
  let bestSlug: string | null = null;
  let bestDist = Infinity;

  for (const prop of properties) {
    const normPropSlug = normalise(prop.slug);
    const normPropName = normalise(prop.name);
    const maxLen = Math.max(normHeader.length, normPropSlug.length, normPropName.length);
    const threshold = Math.ceil(maxLen * 0.3);

    const distSlug = levenshtein(normHeader, normPropSlug);
    const distName = levenshtein(normHeader, normPropName);
    const minDist = Math.min(distSlug, distName);

    if (minDist <= threshold && minDist < bestDist) {
      bestDist = minDist;
      bestSlug = prop.slug;
    }
  }

  return bestSlug;
}

// ── Public API ───────────────────────────────────────────────────────────────

export type ColumnMappingSuggestion = {
  sourceColumn: string;
  targetProperty: string | null;
};

/**
 * Suggest column mappings from source CSV/JSON headers to target entity properties.
 * Each header gets at most one property; each property is used at most once.
 */
export function suggestColumnMapping(
  headers: string[],
  properties: PropertyDef[],
): ColumnMappingSuggestion[] {
  const usedProps = new Set<string>();
  const result: ColumnMappingSuggestion[] = [];

  // Sort headers by specificity — shorter / more common names first so they
  // grab their best match before generic ones do.
  const orderedHeaders = [...headers].sort((a, b) => a.length - b.length);

  // Build mapping for ordered headers, then re-order to original
  const mappingByHeader = new Map<string, string | null>();

  for (const header of orderedHeaders) {
    const remaining = properties.filter((p) => !usedProps.has(p.slug));
    const matched = matchHeader(header, remaining);
    if (matched) {
      usedProps.add(matched);
      mappingByHeader.set(header, matched);
    } else {
      mappingByHeader.set(header, null);
    }
  }

  // Return in original header order
  for (const header of headers) {
    result.push({
      sourceColumn: header,
      targetProperty: mappingByHeader.get(header) ?? null,
    });
  }

  return result;
}
