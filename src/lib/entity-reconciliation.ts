/**
 * Entity reconciliation — assigns orphaned base entities to departments.
 *
 * Runs after onboarding synthesis (when entity extraction + relationship inference
 * have created the knowledge graph) and can be triggered manually via admin API.
 *
 * Strategies (in priority order):
 * 1. Email match: orphan shares email with an already-assigned entity
 * 2. Relationship match: orphan has a department-member relationship but no primaryDomainId
 * 3. Domain pattern: orphan's email domain maps to a single department (small companies only)
 */

import { prisma } from "@/lib/db";

export async function reconcileOrphanedEntities(operatorId: string): Promise<{
  reconciled: number;
  remaining: number;
}> {
  const orphans = await prisma.entity.findMany({
    where: {
      operatorId,
      category: "base",
      status: "active",
      primaryDomainId: null,
    },
    include: {
      propertyValues: {
        include: { property: { select: { slug: true, identityRole: true } } },
      },
    },
  });

  if (orphans.length === 0) return { reconciled: 0, remaining: 0 };

  const departments = await prisma.entity.findMany({
    where: {
      operatorId,
      category: "foundational",
      entityType: { slug: "department" },
      status: "active",
    },
    select: { id: true, displayName: true },
  });

  if (departments.length === 0) return { reconciled: 0, remaining: orphans.length };

  const deptIds = new Set(departments.map((d) => d.id));
  let reconciled = 0;

  for (const orphan of orphans) {
    const emailPv = orphan.propertyValues.find(
      (pv) => pv.property.identityRole === "email" || pv.property.slug === "email",
    );

    // Strategy 1: Match by email against already-assigned entities
    if (emailPv?.value) {
      const orphanEmail = emailPv.value.toLowerCase().trim();

      const duplicate = await prisma.propertyValue.findFirst({
        where: {
          value: orphanEmail,
          property: {
            OR: [
              { identityRole: "email" },
              { slug: "email" },
            ],
          },
          entity: {
            operatorId,
            category: "base",
            status: "active",
            primaryDomainId: { not: null },
            id: { not: orphan.id },
          },
        },
        include: {
          entity: { select: { id: true, primaryDomainId: true, displayName: true } },
        },
      });

      if (duplicate?.entity.primaryDomainId) {
        await prisma.entity.update({
          where: { id: orphan.id },
          data: { primaryDomainId: duplicate.entity.primaryDomainId },
        });
        reconciled++;
        console.log(`[entity-reconciliation] Assigned "${orphan.displayName}" to department via email match with "${duplicate.entity.displayName}"`);
        continue;
      }
    }

    // Strategy 2: Match by department-member relationship
    const deptMemberRel = await prisma.relationship.findFirst({
      where: {
        relationshipType: { slug: "department-member", operatorId },
        OR: [
          { fromEntityId: orphan.id },
          { toEntityId: orphan.id },
        ],
      },
      select: { fromEntityId: true, toEntityId: true },
    });

    if (deptMemberRel) {
      const deptId = deptMemberRel.fromEntityId === orphan.id
        ? deptMemberRel.toEntityId
        : deptMemberRel.fromEntityId;

      if (deptIds.has(deptId)) {
        await prisma.entity.update({
          where: { id: orphan.id },
          data: { primaryDomainId: deptId },
        });
        reconciled++;
        console.log(`[entity-reconciliation] Assigned "${orphan.displayName}" to department via existing relationship`);
        continue;
      }
    }

    // Strategy 3: Match by email domain pattern (single-department companies only)
    if (emailPv?.value && departments.length === 1) {
      const emailDomain = emailPv.value.toLowerCase().trim().split("@")[1];
      if (emailDomain) {
        const domainEntities = await prisma.$queryRaw<Array<{ primaryDomainId: string; count: bigint }>>`
          SELECT e."primaryDomainId", COUNT(*) as count
          FROM "Entity" e
          JOIN "PropertyValue" pv ON pv."entityId" = e.id
          JOIN "EntityProperty" ep ON ep.id = pv."propertyId"
          WHERE e."operatorId" = ${operatorId}
          AND e."category" = 'base'
          AND e."status" = 'active'
          AND e."primaryDomainId" IS NOT NULL
          AND (ep."identityRole" = 'email' OR ep."slug" = 'email')
          AND pv."value" LIKE ${"%" + "@" + emailDomain}
          GROUP BY e."primaryDomainId"
          ORDER BY count DESC
          LIMIT 1
        `;

        if (domainEntities.length > 0) {
          await prisma.entity.update({
            where: { id: orphan.id },
            data: { primaryDomainId: domainEntities[0].primaryDomainId },
          });
          reconciled++;
          console.log(`[entity-reconciliation] Assigned "${orphan.displayName}" to department via email domain pattern`);
        }
      }
    }
  }

  const remaining = orphans.length - reconciled;
  console.log(`[entity-reconciliation] Reconciled ${reconciled} orphaned entities, ${remaining} remaining unassigned`);
  return { reconciled, remaining };
}
