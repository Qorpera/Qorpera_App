/**
 * Migration script: Create AI entities for pre-existing users.
 *
 * Users created before Phase 3 don't have personal AI entities.
 * This script creates them and sets up PersonalAutonomy records.
 *
 * Idempotent: only processes users where no AI entity exists (ownerUserId not set).
 * Run: npx tsx scripts/migrate-user-ai-entities.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const HARDCODED_AI_AGENT = {
  slug: "ai-agent",
  name: "AI Assistant",
  description: "A personal AI assistant paired with a team member",
  icon: "bot",
  color: "#6366f1",
  defaultCategory: "base",
};

async function migrateUserAiEntities() {
  // Find users without an AI entity (Entity with ownerUserId pointing to them)
  const allUsers = await prisma.user.findMany({
    where: { accountSuspended: false, role: { not: "superadmin" } },
    select: { id: true, name: true, email: true, operatorId: true, entityId: true },
  });

  // Check which users already have AI entities
  const existingAiEntities = await prisma.entity.findMany({
    where: { ownerUserId: { not: null } },
    select: { ownerUserId: true },
  });
  const usersWithAi = new Set(existingAiEntities.map((e) => e.ownerUserId));

  const usersToMigrate = allUsers.filter((u) => !usersWithAi.has(u.id));
  console.log(`Found ${usersToMigrate.length} users without AI entities (out of ${allUsers.length} total)`);

  let created = 0;
  let skipped = 0;

  for (const user of usersToMigrate) {
    // Resolve department via UserScope (first scope entry)
    const scope = await prisma.userScope.findFirst({
      where: { userId: user.id },
      select: { domainEntityId: true },
    });

    if (!scope) {
      console.warn(`  Skipping ${user.name} (${user.email}) — no department scope assigned`);
      skipped++;
      continue;
    }

    // Ensure ai-agent entity type exists for this operator
    let aiAgentType = await prisma.entityType.findFirst({
      where: { operatorId: user.operatorId, slug: "ai-agent" },
    });
    if (!aiAgentType) {
      aiAgentType = await prisma.entityType.create({
        data: {
          operatorId: user.operatorId,
          slug: HARDCODED_AI_AGENT.slug,
          name: HARDCODED_AI_AGENT.name,
          description: HARDCODED_AI_AGENT.description,
          icon: HARDCODED_AI_AGENT.icon,
          color: HARDCODED_AI_AGENT.color,
          defaultCategory: HARDCODED_AI_AGENT.defaultCategory,
        },
      });
    }

    // Create AI entity
    const aiEntity = await prisma.entity.create({
      data: {
        operatorId: user.operatorId,
        entityTypeId: aiAgentType.id,
        displayName: `${user.name}'s Assistant`,
        category: "base",
        primaryDomainId: scope.domainEntityId,
        ownerUserId: user.id,
      },
    });

    // Create PersonalAutonomy records for existing SituationTypes
    const situationTypes = await prisma.situationType.findMany({
      where: { operatorId: user.operatorId },
      select: { id: true },
    });

    let autonomyCount = 0;
    for (const st of situationTypes) {
      // Check if PA already exists (defensive)
      const existing = await prisma.personalAutonomy.findUnique({
        where: {
          situationTypeId_aiEntityId: {
            situationTypeId: st.id,
            aiEntityId: aiEntity.id,
          },
        },
      });
      if (existing) continue;

      await prisma.personalAutonomy.create({
        data: {
          operatorId: user.operatorId,
          situationTypeId: st.id,
          aiEntityId: aiEntity.id,
          autonomyLevel: "supervised",
        },
      });
      autonomyCount++;
    }

    console.log(`  Created AI entity for ${user.name} (${user.email}) with ${autonomyCount} autonomy records`);
    created++;
  }

  console.log(`\nMigration complete: ${created} created, ${skipped} skipped`);
}

migrateUserAiEntities()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
