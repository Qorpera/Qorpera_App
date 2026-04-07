-- Add required domain link to SystemJob
-- First add as nullable, backfill, then make required
ALTER TABLE "SystemJob" ADD COLUMN IF NOT EXISTS "domainEntityId" TEXT;
ALTER TABLE "SystemJob" ADD COLUMN IF NOT EXISTS "assigneeEntityId" TEXT;

-- Backfill: use existing scopeEntityId if it points to a domain
UPDATE "SystemJob" sj SET "domainEntityId" = sj."scopeEntityId"
WHERE sj."scopeEntityId" IS NOT NULL
AND EXISTS (SELECT 1 FROM "Entity" e WHERE e.id = sj."scopeEntityId" AND e.category = 'foundational');

-- For jobs without a domain link, assign to the first domain of the operator
UPDATE "SystemJob" sj SET "domainEntityId" = (
  SELECT e.id FROM "Entity" e
  WHERE e."operatorId" = sj."operatorId" AND e.category = 'foundational'
  ORDER BY e."displayName" LIMIT 1
)
WHERE sj."domainEntityId" IS NULL;

-- Now make it required (only if all rows have values)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "SystemJob" WHERE "domainEntityId" IS NULL) THEN
    ALTER TABLE "SystemJob" ALTER COLUMN "domainEntityId" SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SystemJob_domainEntityId_idx" ON "SystemJob"("domainEntityId");
