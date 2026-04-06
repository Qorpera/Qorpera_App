-- Add cycle-based execution fields to Situation
ALTER TABLE "Situation" ADD COLUMN "afterBatch" TEXT;
ALTER TABLE "Situation" ADD COLUMN "monitorUntil" TIMESTAMP(3);
