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

/**
 * Check if a user can access a specific entity based on its department linkage.
 * - Foundational (departments): must be in visibleDepts
 * - External: always visible (no department owner)
 * - Base/internal with parentDepartmentId: check parentDepartmentId
 * - Digital without parentDepartmentId: check department-member relationships
 */
export async function canAccessEntity(
  entityId: string,
  visibleDepts: string[] | "all",
  operatorId: string,
): Promise<boolean> {
  if (visibleDepts === "all") return true;

  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { id: true, parentDepartmentId: true, category: true },
  });

  if (!entity) return false;

  // Departments themselves
  if (entity.category === "foundational") {
    return visibleDepts.includes(entity.id);
  }

  // External entities float outside departments
  if (entity.category === "external") return true;

  // Base/internal: check parentDepartmentId
  if (entity.parentDepartmentId) {
    return visibleDepts.includes(entity.parentDepartmentId);
  }

  // Digital without parentDepartmentId: check department-member relationships
  const relType = await prisma.relationshipType.findFirst({
    where: { operatorId, slug: "department-member" },
  });
  if (!relType) return false;

  const deptRelations = await prisma.relationship.findMany({
    where: {
      relationshipTypeId: relType.id,
      OR: [{ fromEntityId: entityId }, { toEntityId: entityId }],
    },
    select: { fromEntityId: true, toEntityId: true },
  });

  return deptRelations.some((r) => {
    const otherId = r.fromEntityId === entityId ? r.toEntityId : r.fromEntityId;
    return visibleDepts.includes(otherId);
  });
}
