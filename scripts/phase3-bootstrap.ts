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

import { prisma } from "../src/lib/db";
import { seedNotificationPreferences } from "../src/lib/ai-entity-helpers";
import { ensureInternalCapabilities } from "../src/lib/internal-capabilities";
import { backfillCalendarWriteCapabilities, seedMeetingRequestSituationType, seedRequestMeetingCapability } from "../src/lib/meeting-coordination";

async function main() {
  let notifPrefCount = 0;

  const operators = await prisma.operator.findMany({
    select: { id: true, displayName: true },
  });

  // 1. Seed notification preferences for users without them
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

  // 4. Ensure internal capabilities for each operator
  let internalCapCount = 0;
  for (const op of operators) {
    await ensureInternalCapabilities(op.id);
    internalCapCount++;
  }

  // 5. Seed meeting coordination for each operator
  let calCapCount = 0;
  let meetingTypeCount = 0;
  for (const op of operators) {
    const backfilled = await backfillCalendarWriteCapabilities(op.id);
    calCapCount += backfilled;
    await seedMeetingRequestSituationType(op.id);
    meetingTypeCount++;
    await seedRequestMeetingCapability(op.id);
  }

  console.log(
    `Created ${notifPrefCount} notification preference sets, bootstrapped internal capabilities for ${internalCapCount} operators, backfilled ${calCapCount} calendar capabilities, seeded meeting types for ${meetingTypeCount} operators`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
