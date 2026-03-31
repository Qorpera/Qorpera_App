-- AlterTable
ALTER TABLE "Goal" ADD COLUMN "source" TEXT;
ALTER TABLE "Goal" ADD COLUMN "sourceReference" TEXT;
ALTER TABLE "Goal" ADD COLUMN "extractionConfidence" DOUBLE PRECISION;
