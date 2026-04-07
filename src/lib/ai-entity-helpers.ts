import { prisma } from "@/lib/db";
import { HARDCODED_TYPE_DEFS } from "@/lib/hardcoded-type-defs";

/**
 * Ensure a department-ai entity exists for a given department.
 * Creates one if missing. Returns the entity ID.
 */
export async function ensureDepartmentAi(
  operatorId: string,
  domainEntityId: string,
  domainName: string,
): Promise<string> {
  // Check if already exists
  const existing = await prisma.entity.findFirst({
    where: { operatorId, ownerDomainId: domainEntityId, status: "active" },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Ensure EntityType exists
  let entityType = await prisma.entityType.findFirst({
    where: { operatorId, slug: "department-ai" },
  });
  if (!entityType) {
    const def = HARDCODED_TYPE_DEFS["department-ai"];
    entityType = await prisma.entityType.create({
      data: {
        operatorId,
        slug: def.slug,
        name: def.name,
        description: def.description,
        icon: def.icon,
        color: def.color,
        defaultCategory: def.defaultCategory,
      },
    });
  }

  const entity = await prisma.entity.create({
    data: {
      operatorId,
      entityTypeId: entityType.id,
      displayName: `${domainName} AI`,
      category: "base",
      ownerDomainId: domainEntityId,
      primaryDomainId: domainEntityId,
    },
  });

  return entity.id;
}

/**
 * Ensure an hq-ai entity exists for a given operator.
 * Creates one if missing. Returns the entity ID.
 */
export async function ensureHqAi(
  operatorId: string,
  operatorName: string,
): Promise<string> {
  // Check if already exists
  const existing = await prisma.entity.findFirst({
    where: {
      operatorId,
      entityType: { slug: "hq-ai" },
      status: "active",
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Ensure EntityType exists
  let entityType = await prisma.entityType.findFirst({
    where: { operatorId, slug: "hq-ai" },
  });
  if (!entityType) {
    const def = HARDCODED_TYPE_DEFS["hq-ai"];
    entityType = await prisma.entityType.create({
      data: {
        operatorId,
        slug: def.slug,
        name: def.name,
        description: def.description,
        icon: def.icon,
        color: def.color,
        defaultCategory: def.defaultCategory,
      },
    });
  }

  const entity = await prisma.entity.create({
    data: {
      operatorId,
      entityTypeId: entityType.id,
      displayName: `${operatorName} HQ AI`,
      category: "base",
    },
  });

  return entity.id;
}

const NOTIFICATION_TYPES = [
  "situation_proposed",
  "situation_resolved",
  "initiative_proposed",
  "step_ready",
  "delegation_received",
  "follow_up_triggered",
  "plan_auto_executed",
  "peer_signal",
  "insight_discovered",
  "system_alert",
] as const;

/**
 * Seed default notification preferences for a user.
 * Idempotent — safe to re-run via skipDuplicates.
 */
export async function seedNotificationPreferences(
  userId: string,
  role: string,
): Promise<void> {
  const channel = role === "admin" || role === "superadmin" ? "both" : "in_app";

  await prisma.notificationPreference.createMany({
    data: NOTIFICATION_TYPES.map((notificationType) => ({
      userId,
      notificationType,
      channel,
    })),
    skipDuplicates: true,
  });
}
