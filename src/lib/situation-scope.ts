import { prisma } from "@/lib/db";

/**
 * Check if an entity is in scope for a department-scoped situation type.
 *
 * Replaces the old BFS traversal with direct department checks:
 * - base/internal: check primaryDomainId
 * - digital: check department-member relationship
 * - external: check if any related entity is in scope (1 hop)
 * - foundational: check if entity IS the scope department
 */
export async function isEntityInScope(
  operatorId: string,
  scopeEntityId: string,
  scopeDepth: number | null, // kept for interface compatibility, not used in new logic
  targetEntityId: string,
): Promise<boolean> {
  // Same entity = always in scope
  if (scopeEntityId === targetEntityId) return true;

  // Load target entity's category and primaryDomainId
  const target = await prisma.entity.findUnique({
    where: { id: targetEntityId },
    select: { category: true, primaryDomainId: true },
  });
  if (!target) return false;

  // Foundational: entity IS a department — only in scope if it's the scope department itself
  if (target.category === "foundational") {
    return false; // Already checked equality above
  }

  // Base or Internal: direct primaryDomainId check
  if (target.category === "base" || target.category === "internal") {
    return target.primaryDomainId === scopeEntityId;
  }

  // Digital: check department-member relationship to scope department
  if (target.category === "digital") {
    const deptMember = await prisma.relationship.findFirst({
      where: {
        OR: [
          { fromEntityId: targetEntityId, toEntityId: scopeEntityId },
          { fromEntityId: scopeEntityId, toEntityId: targetEntityId },
        ],
        relationshipType: { slug: "department-member" },
      },
    });
    return !!deptMember;
  }

  // External: check if any directly related entity is in scope
  if (target.category === "external") {
    const rels = await prisma.relationship.findMany({
      where: {
        OR: [
          { fromEntityId: targetEntityId },
          { toEntityId: targetEntityId },
        ],
        relationshipType: { slug: { not: "department-member" } },
      },
      select: { fromEntityId: true, toEntityId: true },
    });

    const relatedIds = [
      ...new Set(
        rels
          .flatMap((r) => [r.fromEntityId, r.toEntityId])
          .filter((id) => id !== targetEntityId),
      ),
    ];

    if (relatedIds.length === 0) return false;

    // Check if any related entity has primaryDomainId = scope
    const withParent = await prisma.entity.findFirst({
      where: {
        id: { in: relatedIds },
        primaryDomainId: scopeEntityId,
        status: "active",
      },
    });
    if (withParent) return true;

    // Check if any related entity has department-member relationship to scope
    const deptMember = await prisma.relationship.findFirst({
      where: {
        OR: [
          { fromEntityId: { in: relatedIds }, toEntityId: scopeEntityId },
          { fromEntityId: scopeEntityId, toEntityId: { in: relatedIds } },
        ],
        relationshipType: { slug: "department-member" },
      },
    });
    return !!deptMember;
  }

  // Unknown category — default to not in scope
  return false;
}
