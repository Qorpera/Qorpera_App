-- Add classification tracking fields to ContentChunk
ALTER TABLE "ContentChunk" ADD COLUMN IF NOT EXISTS "classifiedAt" TIMESTAMP(3);
ALTER TABLE "ContentChunk" ADD COLUMN IF NOT EXISTS "classificationMethod" TEXT;
ALTER TABLE "ContentChunk" ADD COLUMN IF NOT EXISTS "reevaluatedAt" TIMESTAMP(3);

-- Index for reevaluation cron (finds classified-but-not-reevaluated chunks)
CREATE INDEX IF NOT EXISTS "ContentChunk_operatorId_classifiedAt_idx" ON "ContentChunk"("operatorId", "classifiedAt");
