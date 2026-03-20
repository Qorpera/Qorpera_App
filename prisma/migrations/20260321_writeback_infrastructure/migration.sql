-- Write-back infrastructure: writeBackStatus gate, spawningStepId, awaiting_situation status

-- ActionCapability: writeBackStatus enum column (pending, enabled, disabled)
ALTER TABLE "ActionCapability" ADD COLUMN "writeBackStatus" TEXT NOT NULL DEFAULT 'pending';

-- ActionCapability: nudge dismissed tracking
ALTER TABLE "ActionCapability" ADD COLUMN "nudgeDismissedAt" TIMESTAMP(3);

-- ActionCapability: slug for write capability identification
ALTER TABLE "ActionCapability" ADD COLUMN "slug" TEXT;

-- Situation: link back to the execution step that spawned it
ALTER TABLE "Situation" ADD COLUMN "spawningStepId" TEXT;

-- ExecutionStep: awaiting_situation is now a valid status value
-- (No DDL needed — status is a TEXT column, values are application-level)

-- Backfill: all existing capabilities were already active, set them to enabled
-- so they continue working. Only new write-back capabilities from Day 11+ connectors start as 'pending'.
UPDATE "ActionCapability" SET "writeBackStatus" = 'enabled' WHERE "enabled" = true;
