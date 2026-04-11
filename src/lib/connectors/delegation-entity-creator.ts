/** @deprecated v0.3.13 — wiki synthesis creates person pages; entity creation from delegations will be removed */
import { prisma } from "@/lib/db";
import { ensureHardcodedEntityType } from "@/lib/event-materializer";
import { upsertEntity } from "@/lib/entity-resolution";

export interface DirectoryUser {
  email: string;
  fullName: string;
  department: string;
  title: string;
  isAdmin: boolean;
}

/**
 * Ensure the team-member entity type has department and job-title properties.
 * The hardcoded type only has email, role, phone — delegation needs more fields.
 */
async function ensureDelegationProperties(operatorId: string): Promise<void> {
  const entityType = await prisma.entityType.findFirst({
    where: { operatorId, slug: "team-member" },
    select: { id: true, properties: { select: { slug: true } } },
  });
  if (!entityType) return;

  const existing = new Set(entityType.properties.map((p) => p.slug));

  const needed: Array<{ slug: string; name: string; dataType: string }> = [
    { slug: "domain", name: "Domain", dataType: "STRING" },
    { slug: "job-title", name: "Job Title", dataType: "STRING" },
  ];

  for (const prop of needed) {
    if (existing.has(prop.slug)) continue;
    await prisma.entityProperty.create({
      data: {
        entityTypeId: entityType.id,
        slug: prop.slug,
        name: prop.name,
        dataType: prop.dataType,
      },
    });
  }
}

/**
 * Creates or updates team-member entities from a directory user list.
 * Used by both Google and Microsoft delegation flows.
 *
 * Returns the number of entities created or updated.
 */
export async function createTeamMemberEntities(
  operatorId: string,
  users: DirectoryUser[],
  sourceSystem: string,
): Promise<number> {
  if (users.length === 0) return 0;

  // Ensure type + properties exist
  await ensureHardcodedEntityType(operatorId, "team-member");
  await ensureDelegationProperties(operatorId);

  let count = 0;
  for (const user of users) {
    if (!user.email) continue;

    try {
      await upsertEntity(
        operatorId,
        "team-member",
        {
          displayName: user.fullName || user.email.split("@")[0],
          sourceSystem,
          properties: {
            email: user.email,
            ...(user.department ? { department: user.department } : {}),
            ...(user.title ? { "job-title": user.title } : {}),
          },
        },
        {
          sourceSystem,
          externalId: user.email,
        },
      );
      count++;
    } catch (err) {
      console.warn(`[delegation-entity-creator] Failed to create entity for ${user.email}:`, err);
    }
  }

  return count;
}
