/**
 * Phase 3 Bootstrap Script
 *
 * Creates HQ AI entities, department AI entities, and notification preferences
 * for all existing operators, departments, and users.
 *
 * Idempotent — safe to run multiple times.
 *
 * Usage: npx tsx scripts/phase3-bootstrap.ts
 */

import { PrismaClient } from "@prisma/client";
import { ensureHqAi, ensureDepartmentAi, seedNotificationPreferences } from "../src/lib/ai-entity-helpers";

// Use a fresh Prisma client (script runs outside Next.js)
const prisma = new PrismaClient();

async function main() {
  let hqAiCount = 0;
  let deptAiCount = 0;
  let notifPrefCount = 0;

  // 1. Create HQ AI for each operator
  const operators = await prisma.operator.findMany({
    select: { id: true, displayName: true },
  });

  for (const op of operators) {
    await ensureHqAi(op.id, op.displayName);
    hqAiCount++;
  }

  // 2. Create department AIs for existing departments
  const departments = await prisma.entity.findMany({
    where: {
      category: "foundational",
      entityType: { slug: "department" },
      status: "active",
    },
    select: { id: true, operatorId: true, displayName: true },
  });

  for (const dept of departments) {
    await ensureDepartmentAi(dept.operatorId, dept.id, dept.displayName);
    deptAiCount++;
  }

  // 3. Seed notification preferences for users without them
  const users = await prisma.user.findMany({
    where: {
      notificationPreferences: { none: {} },
    },
    select: { id: true, role: true },
  });

  for (const user of users) {
    await seedNotificationPreferences(user.id, user.role);
    notifPrefCount++;
  }

  console.log(
    `Created ${hqAiCount} HQ AIs, ${deptAiCount} department AIs, ${notifPrefCount} notification preference sets`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
