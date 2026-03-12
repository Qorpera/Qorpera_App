-- Add snapshot column to EntityMergeLog for reversible merge state capture
ALTER TABLE "EntityMergeLog" ADD COLUMN "snapshot" TEXT;
