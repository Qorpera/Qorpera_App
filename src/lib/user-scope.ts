import { prisma } from "@/lib/db";

/**
 * Get the department IDs visible to a user.
 * Returns "all" for admins/superadmins.
 * Returns specific department IDs from UserScope for members.
 */
export async function getVisibleDepartmentIds(
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

  // Members: query UserScope table
  const scopes = await prisma.userScope.findMany({
    where: { userId },
    select: { departmentEntityId: true },
  });

  return scopes.map((s) => s.departmentEntityId);
}

/**
 * Get a scoped user context for use in API routes.
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
 */
export function departmentScopeFilter(visibleDepts: string[] | "all"): Record<string, unknown> {
  if (visibleDepts === "all") return {};
  return {
    OR: [
      { parentDepartmentId: { in: visibleDepts } },
      { id: { in: visibleDepts } },
      { category: "external" },
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
      { situationType: { scopeEntityId: { in: visibleDepts } } },
      { situationType: { scopeEntityId: null } },
    ],
  };
}

/**
 * Check if a user can access a specific department.
 */
export function canAccessDepartment(visibleDepts: string[] | "all", departmentId: string): boolean {
  if (visibleDepts === "all") return true;
  return visibleDepts.includes(departmentId);
}
