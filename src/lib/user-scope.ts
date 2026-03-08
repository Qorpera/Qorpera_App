import { prisma } from "@/lib/db";

/**
 * Get the department IDs visible to a user.
 *
 * Returns "all" for admins (scope = CompanyHQ / organization entity).
 * Returns specific department IDs for scoped users.
 * Returns "all" as fallback if user has no scopeEntityId (legacy users).
 */
export async function getVisibleDepartmentIds(
  operatorId: string,
  userId: string,
): Promise<string[] | "all"> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { scopeEntityId: true, role: true },
  });

  // Fallback: no scope set = admin-level access (legacy users, safety net)
  if (!user || !user.scopeEntityId) return "all";

  // Admin role always sees everything regardless of scopeEntityId
  if (user.role === "admin") return "all";

  // Check if scope entity is CompanyHQ (organization type = sees everything)
  const scopeEntity = await prisma.entity.findUnique({
    where: { id: user.scopeEntityId },
    include: { entityType: { select: { slug: true } } },
  });

  if (!scopeEntity) return "all"; // safety fallback
  if (scopeEntity.entityType.slug === "organization") return "all";

  // Scope is a specific department — return just that department
  // Future: traverse children for division-level scoping
  return [scopeEntity.id];
}

/**
 * Get a scoped user context for use in API routes.
 * Call at the top of any route that returns user-visible data.
 */
export async function getScopedContext(operatorId: string, userId: string) {
  const visibleDepts = await getVisibleDepartmentIds(operatorId, userId);
  return {
    operatorId,
    userId,
    visibleDepts,
    isAdmin: visibleDepts === "all",
  };
}

/**
 * Build a Prisma where clause that filters entities by visible departments.
 *
 * Usage:
 *   const scope = await getScopedContext(operatorId, userId);
 *   const entities = await prisma.entity.findMany({
 *     where: { operatorId, ...scopeFilter(scope.visibleDepts) },
 *   });
 */
export function departmentScopeFilter(visibleDepts: string[] | "all"): Record<string, unknown> {
  if (visibleDepts === "all") return {};
  return {
    OR: [
      { parentDepartmentId: { in: visibleDepts } },  // base, internal, digital entities in dept
      { id: { in: visibleDepts } },                    // the department entity itself
      { category: "external" },                        // externals visible to all (linked context)
    ],
  };
}

/**
 * Build a Prisma where clause for situations scoped to visible departments.
 */
export function situationScopeFilter(visibleDepts: string[] | "all"): Record<string, unknown> {
  if (visibleDepts === "all") return {};
  return {
    OR: [
      // Situations whose type is scoped to a visible department
      { situationType: { scopeEntityId: { in: visibleDepts } } },
      // Situations whose type has no scope (global) — visible to all
      { situationType: { scopeEntityId: null } },
    ],
  };
}

// TODO Day 21: Learning dashboard queries must use situationScopeFilter
