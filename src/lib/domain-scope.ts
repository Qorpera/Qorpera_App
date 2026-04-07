import { prisma } from "@/lib/db";

/**
 * Get domains a person is observed operating in, based on wiki content.
 * Queries wiki pages that mention this person and extracts domain associations.
 * Returns cached results (cache TTL: 5 minutes).
 */
const domainObservationCache = new Map<
  string,
  { domains: { domainId: string; confidence: number }[]; cachedAt: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getObservedDomains(
  operatorId: string,
  userId: string,
): Promise<{ domainId: string; confidence: number }[]> {
  const cacheKey = `${operatorId}:${userId}`;
  const cached = domainObservationCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.domains;
  }

  // Find the user's linked entity
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { entityId: true },
  });
  if (!user?.entityId) return [];

  const entity = await prisma.entity.findUnique({
    where: { id: user.entityId },
    select: { displayName: true, primaryDomainId: true },
  });
  if (!entity) return [];

  // Strategy 1: Direct domain assignment (primary domain)
  const domains: Map<string, number> = new Map();
  if (entity.primaryDomainId) {
    domains.set(entity.primaryDomainId, 0.9);
  }

  // Strategy 2: Wiki pages that mention this person
  const wikiMentions = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      content: { contains: entity.displayName, mode: "insensitive" },
      status: { notIn: ["archived", "quarantined"] },
    },
    select: { domainIds: true },
  });

  for (const page of wikiMentions) {
    const pageDomains = (page.domainIds ?? []) as string[];
    for (const did of pageDomains) {
      domains.set(did, Math.min(1.0, (domains.get(did) ?? 0) + 0.15));
    }
  }

  // Strategy 3: For solo operators (1-3 users), grant access to all domains
  const userCount = await prisma.user.count({
    where: { operatorId, accountSuspended: false },
  });
  if (userCount <= 3) {
    const allDomains = await prisma.entity.findMany({
      where: { operatorId, category: "foundational" },
      select: { id: true },
    });
    for (const d of allDomains) {
      domains.set(d.id, 1.0);
    }
  }

  const result = Array.from(domains.entries())
    .map(([domainId, confidence]) => ({ domainId, confidence }))
    .filter((d) => d.confidence >= 0.3)
    .sort((a, b) => b.confidence - a.confidence);

  domainObservationCache.set(cacheKey, { domains: result, cachedAt: Date.now() });
  return result;
}

/**
 * Get the domain IDs visible to a user.
 * Returns "all" for admins/superadmins.
 * Returns specific domain IDs from UserScope for members (explicit overrides),
 * or derives from wiki observations if no explicit scopes exist.
 */
export async function getVisibleDomainIds(
  operatorId: string,
  userId: string,
): Promise<string[] | "all"> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return [];

  // Admin and superadmin see everything
  if (user.role === "admin" || user.role === "superadmin") return "all";

  // Check explicit UserScope overrides first
  const scopes = await prisma.userScope.findMany({
    where: { userId },
    select: { domainEntityId: true },
  });

  if (scopes.length > 0) {
    // Explicit overrides exist — use them
    return scopes.map((s) => s.domainEntityId);
  }

  // No explicit scopes — derive from wiki observations
  const observed = await getObservedDomains(operatorId, userId);
  if (observed.length === 0) {
    // Fallback: if wiki has no observations, return all domains (safe default for new users)
    return "all";
  }

  return observed.map((d) => d.domainId);
}

/**
 * Build a Prisma where clause that filters entities by visible domains.
 */
export function domainScopeFilter(visibleDomains: string[] | "all"): Record<string, unknown> {
  if (visibleDomains === "all") return {};
  return {
    OR: [
      { primaryDomainId: { in: visibleDomains } },
      { id: { in: visibleDomains } },
      { category: "external" },
    ],
  };
}

/**
 * Build a Prisma where clause for situations scoped to visible domains.
 */
export function situationScopeFilter(visibleDomains: string[] | "all"): Record<string, unknown> {
  if (visibleDomains === "all") return {};
  return {
    OR: [
      { situationType: { scopeEntityId: { in: visibleDomains } } },
      { situationType: { scopeEntityId: null } },
    ],
  };
}

/**
 * Check if a user can access a specific domain.
 */
export function canAccessDomain(visibleDomains: string[] | "all", domainId: string): boolean {
  if (visibleDomains === "all") return true;
  return visibleDomains.includes(domainId);
}

/**
 * Check if a user can access a specific entity based on its domain linkage.
 * - Foundational (domains): must be in visibleDomains
 * - External: always visible (no domain owner)
 * - Base/internal with primaryDomainId: check primaryDomainId
 * - Digital without primaryDomainId: check domain-member relationships
 */
export async function canAccessEntity(
  entityId: string,
  visibleDomains: string[] | "all",
  operatorId: string,
): Promise<boolean> {
  if (visibleDomains === "all") return true;

  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { id: true, primaryDomainId: true, category: true },
  });

  if (!entity) return false;

  // Domains themselves
  if (entity.category === "foundational") {
    return visibleDomains.includes(entity.id);
  }

  // External entities float outside domains
  if (entity.category === "external") return true;

  // Base/internal: check primaryDomainId
  if (entity.primaryDomainId) {
    return visibleDomains.includes(entity.primaryDomainId);
  }

  // Digital without primaryDomainId: check domain-member relationships
  const relType = await prisma.relationshipType.findFirst({
    where: { operatorId, slug: "domain-member" },
  });
  if (!relType) return false;

  const domainRelations = await prisma.relationship.findMany({
    where: {
      relationshipTypeId: relType.id,
      OR: [{ fromEntityId: entityId }, { toEntityId: entityId }],
    },
    select: { fromEntityId: true, toEntityId: true },
  });

  return domainRelations.some((r) => {
    const otherId = r.fromEntityId === entityId ? r.toEntityId : r.fromEntityId;
    return visibleDomains.includes(otherId);
  });
}
