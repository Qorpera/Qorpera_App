import { prisma } from "@/lib/db";

// ── Page access context ────────────────────────────────────────────────────

export type PageAccessContext = {
  userDomainSlugs: string[];       // domain hub slugs from person page crossRefs
  userPersonSlug: string | null;   // the user's own person page slug
  managedPersonSlugs: string[];    // person slugs of direct reports (cached)
  role: string;                    // user role
  isAdmin: boolean;
  isScoped: boolean;               // true when non-admin with domain assignments
};

// ── Reporting chain cache ──────────────────────────────────────────────────

const reportingCache = new Map<
  string,
  { slugs: string[]; cachedAt: number }
>();
const REPORTING_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function resolveDirectReportSlugs(
  operatorId: string,
  userPersonSlug: string,
): Promise<string[]> {
  const cacheKey = `${operatorId}:${userPersonSlug}`;
  const cached = reportingCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < REPORTING_CACHE_TTL_MS) {
    return cached.slugs;
  }

  // Push reportsTo filter to Postgres instead of loading all person_profile pages
  const directReports = await prisma.$queryRaw<Array<{ slug: string }>>`
    SELECT slug FROM "KnowledgePage"
    WHERE "operatorId" = ${operatorId}
      AND "pageType" = 'person_profile'
      AND scope = 'operator'
      AND status NOT IN ('archived', 'quarantined')
      AND properties->>'reportsTo' = ${userPersonSlug}
  `;

  const slugs = directReports.map((r) => r.slug);

  reportingCache.set(cacheKey, { slugs, cachedAt: Date.now() });
  return slugs;
}

export function invalidateReportingCache(operatorId: string, personSlug: string): void {
  reportingCache.delete(`${operatorId}:${personSlug}`);
}

// ── Core access resolution ─────────────────────────────────────────────────

export async function resolveAccessContext(
  operatorId: string,
  userId: string,
): Promise<PageAccessContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, wikiPageSlug: true },
  });

  if (!user) {
    return {
      userDomainSlugs: [],
      userPersonSlug: null,
      managedPersonSlugs: [],
      role: "unknown",
      isAdmin: false,
      isScoped: false,
    };
  }

  const isAdmin = user.role === "admin" || user.role === "superadmin";
  if (isAdmin) {
    return {
      userDomainSlugs: [],
      userPersonSlug: user.wikiPageSlug ?? null,
      managedPersonSlugs: [],
      role: user.role,
      isAdmin: true,
      isScoped: false,
    };
  }

  const personSlug = user.wikiPageSlug ?? null;
  let domainSlugs: string[] = [];
  let managedSlugs: string[] = [];

  if (personSlug) {
    // Read the person's wiki page to find which domains they belong to
    const personPage = await prisma.knowledgePage.findFirst({
      where: { operatorId, slug: personSlug, scope: "operator" },
      select: { crossReferences: true },
    });

    if (personPage) {
      domainSlugs = personPage.crossReferences.filter(
        (ref) => ref.startsWith("domain-"),
      );
    }

    // Resolve direct reports
    managedSlugs = await resolveDirectReportSlugs(operatorId, personSlug);
  }

  return {
    userDomainSlugs: domainSlugs,
    userPersonSlug: personSlug,
    managedPersonSlugs: managedSlugs,
    role: user.role,
    isAdmin: false,
    isScoped: domainSlugs.length > 0,
  };
}

// ── Page visibility checks ─────────────────────────────────────────────────

type PageForAccess = {
  visibility?: string | null;
  slug: string;
  crossReferences?: string[];
  properties?: Record<string, unknown> | null;
  pageType?: string | null;
};

export function canViewPage(
  page: PageForAccess,
  ctx: PageAccessContext,
): boolean {
  const vis = page.visibility ?? "operator";

  if (ctx.isAdmin) return true;

  switch (vis) {
    case "operator":
      return true;

    case "domain": {
      const pageDomains: string[] = [];
      if (page.crossReferences) {
        pageDomains.push(...page.crossReferences.filter((ref) => ref.startsWith("domain-")));
      }
      if (page.properties?.domain && typeof page.properties.domain === "string") {
        pageDomains.push(page.properties.domain);
      }
      // Page with no domain association is visible to all
      if (pageDomains.length === 0) return true;
      return pageDomains.some((d) => ctx.userDomainSlugs.includes(d));
    }

    case "management": {
      const subjectSlug =
        (typeof page.properties?.subjectSlug === "string" ? page.properties.subjectSlug : null)
        ?? (page.pageType === "person_profile" ? page.slug : null);
      // Pages without a subject (findings_overview, log, contradiction_log)
      // fall through to visible. "management" on these types is a semantic
      // marker, not an access gate — actual restriction only applies to
      // person-specific pages via subjectSlug matching.
      if (!subjectSlug) return true;
      return ctx.managedPersonSlugs.includes(subjectSlug);
    }

    case "personal":
      return page.slug === ctx.userPersonSlug;

    case "operational":
      return false; // never shown in UI

    default:
      return false;
  }
}

export function canViewPage_ai(
  page: PageForAccess,
  ctx: PageAccessContext,
): boolean {
  const vis = page.visibility ?? "operator";
  if (vis === "operational") return true; // AI can see operational pages
  return canViewPage(page, ctx);
}

// ── Wiki-first domain scoping (kept) ───────────────────────────────────────

/**
 * Get wiki page slugs of domains visible to this user.
 * Returns "all" for admins or users with no scope restrictions.
 */
export async function getVisibleDomainSlugs(
  operatorId: string,
  userId: string,
): Promise<string[] | "all"> {
  const ctx = await resolveAccessContext(operatorId, userId);
  if (ctx.isAdmin) return "all";
  return ctx.userDomainSlugs.length > 0 ? ctx.userDomainSlugs : "all";
}

/**
 * Build a raw SQL WHERE fragment for wiki-based situation domain scoping.
 */
export function wikiSituationScopeFilter(
  visibleDomains: string[] | "all",
): { needed: false } | { needed: true; domainSlugs: string[] } {
  if (visibleDomains === "all") {
    return { needed: false };
  }
  return { needed: true, domainSlugs: visibleDomains };
}

/**
 * Build the SQL WHERE clause fragment for wiki situation domain filtering.
 */
export function buildWikiSituationDomainClause(
  domainSlugs: string[],
  paramOffset: number,
): { clause: string; params: string[] } {
  if (domainSlugs.length === 0) {
    return { clause: "FALSE", params: [] };
  }
  const placeholders = domainSlugs.map((_, i) => `$${paramOffset + i + 1}`).join(", ");
  return {
    clause: `(kp.properties->>'domain' IN (${placeholders}) OR kp.properties->>'domain' IS NULL)`,
    params: domainSlugs,
  };
}

/**
 * Check if a user can access a specific domain.
 */
export function canAccessDomain(visibleDomains: string[] | "all", domainId: string): boolean {
  if (visibleDomains === "all") return true;
  return visibleDomains.includes(domainId);
}

// ── Backward-compat shim (temporary — removed in session 5) ────────────────

/**
 * @deprecated Use resolveAccessContext + canViewPage instead.
 * Returns domain slugs or "all" for callers not yet migrated.
 */
export async function getVisibleDomainIds(
  operatorId: string,
  userId: string,
): Promise<string[] | "all"> {
  const ctx = await resolveAccessContext(operatorId, userId);
  if (ctx.role === "unknown") return []; // deny-all for unknown users
  if (ctx.isAdmin) return "all";
  return ctx.userDomainSlugs.length > 0 ? ctx.userDomainSlugs : "all";
}
