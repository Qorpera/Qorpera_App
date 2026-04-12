-- Drop FK constraints on SystemJob before altering
ALTER TABLE "SystemJob" DROP CONSTRAINT IF EXISTS "SystemJob_domainEntityId_fkey";
ALTER TABLE "SystemJob" DROP CONSTRAINT IF EXISTS "SystemJob_assigneeEntityId_fkey";

-- Drop index on domainEntityId (no longer a guaranteed FK)
DROP INDEX IF EXISTS "SystemJob_domainEntityId_idx";

-- Make SystemJob entity fields optional (were required)
ALTER TABLE "SystemJob" ALTER COLUMN "aiEntityId" DROP NOT NULL;
ALTER TABLE "SystemJob" ALTER COLUMN "domainEntityId" DROP NOT NULL;

-- Add wiki page fields to SystemJob
ALTER TABLE "SystemJob" ADD COLUMN IF NOT EXISTS "wikiPageSlug" TEXT;
ALTER TABLE "SystemJob" ADD COLUMN IF NOT EXISTS "ownerPageSlug" TEXT;
ALTER TABLE "SystemJob" ADD COLUMN IF NOT EXISTS "domainPageSlug" TEXT;

-- Add execution plan fields merged from RecurringTask
ALTER TABLE "SystemJob" ADD COLUMN IF NOT EXISTS "executionPlanTemplate" TEXT;
ALTER TABLE "SystemJob" ADD COLUMN IF NOT EXISTS "autoApproveSteps" BOOLEAN NOT NULL DEFAULT false;

-- Drop Situation.delegationId FK and column
ALTER TABLE "Situation" DROP CONSTRAINT IF EXISTS "Situation_delegationId_fkey";
DROP INDEX IF EXISTS "Situation_delegationId_key";
ALTER TABLE "Situation" DROP COLUMN IF EXISTS "delegationId";

-- Drop tables (all empty in production)
DROP TABLE IF EXISTS "RecurringTask";
DROP TABLE IF EXISTS "Delegation";
DROP TABLE IF EXISTS "EntityMergeLog";
