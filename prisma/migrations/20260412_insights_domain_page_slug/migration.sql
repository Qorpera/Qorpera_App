-- Make OperationalInsight.aiEntityId optional
ALTER TABLE "OperationalInsight" ALTER COLUMN "aiEntityId" DROP NOT NULL;

-- Add domainPageSlug column
ALTER TABLE "OperationalInsight" ADD COLUMN IF NOT EXISTS "domainPageSlug" TEXT;

-- Replace entity-based index with wiki-based
DROP INDEX IF EXISTS "OperationalInsight_aiEntityId_status_idx";
CREATE INDEX IF NOT EXISTS "OperationalInsight_operatorId_domainPageSlug_status_idx"
  ON "OperationalInsight" ("operatorId", "domainPageSlug", "status");
